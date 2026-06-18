import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import { 
    collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, updateDoc
} from "firebase/firestore";

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const showSignupBtn = document.getElementById('show-signup');
const logoutBtn = document.getElementById('logout-btn');
const authWarning = document.getElementById('auth-warning');

const importBtn = document.getElementById('import-btn');
const clearDataBtn = document.getElementById('clear-data-btn');
const importText = document.getElementById('import-text');
const importStatus = document.getElementById('import-status');
const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');

const queryBuilderContainer = document.getElementById('query-builder-container');
const addQueryRowBtn = document.getElementById('add-query-row-btn');
const doQuerySearchBtn = document.getElementById('do-query-search-btn');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchIncludeHidden = document.getElementById('search-include-hidden');
const sortSelect = document.getElementById('sort-select');
const applySortBtn = document.getElementById('apply-sort-btn');
const quickTagsContainer = document.getElementById('quick-tags-container');
const showHiddenCheckbox = document.getElementById('show-hidden-checkbox');
const manageHiddenColumnsBtn = document.getElementById('manage-hidden-columns-btn');

const formatItemsList = document.getElementById('format-items-list');
const addFormatItemBtn = document.getElementById('add-format-item-btn');
const generateFormatBtn = document.getElementById('generate-format-btn');
const formatOutput = document.getElementById('format-output');
const copyFormatBtn = document.getElementById('copy-format-btn');

// --- Edit Modal Elements ---
const editModal = document.getElementById('edit-modal');
const editModalTitle = document.getElementById('edit-modal-title');
const editModalTextarea = document.getElementById('edit-modal-textarea');
const editModalSaveBtn = document.getElementById('edit-modal-save-btn');
let currentEditItemId = null;
let currentEditField = null;

const excelModeBtn = document.getElementById('excel-mode-btn');
const tableContainer = document.querySelector('.table-container');

const toggleCalendarBtn = document.getElementById('toggle-calendar-btn');
const calendarSection = document.getElementById('calendar-section');
const calendarEl = document.getElementById('calendar');

// State
let isSignupMode = false;
let mockUser = null;
let mockData = []; 
let unsubscribeSnapshot = null;
let currentSearchQuery = "";
let currentData = [];
let calendarInstance = null;
let hiddenColumns = [];

// Hide auth warning if Firebase is configured
if (auth) {
    if (authWarning) authWarning.style.display = 'none';
}

// --- UI Toggles ---
const closeExcelBtn = document.createElement('button');
closeExcelBtn.className = 'btn primary';
closeExcelBtn.style.cssText = 'width: auto; background: var(--danger); margin-bottom: 16px;';
closeExcelBtn.textContent = 'エクセルモードを閉じる';
closeExcelBtn.addEventListener('click', toggleExcelMode);

const excelHeader = document.createElement('div');
excelHeader.className = 'excel-mode-header';
excelHeader.innerHTML = '<h2>エクセルモード (全画面表示)</h2>';
excelHeader.appendChild(closeExcelBtn);
tableContainer.insertBefore(excelHeader, tableContainer.firstChild);

function toggleExcelMode() {
    tableContainer.classList.toggle('excel-mode');
    if (tableContainer.classList.contains('excel-mode')) {
        document.body.style.overflow = 'hidden'; 
    } else {
        document.body.style.overflow = '';
    }
}
excelModeBtn.addEventListener('click', toggleExcelMode);

toggleCalendarBtn.addEventListener('click', () => {
    if (calendarSection.style.display === 'none') {
        calendarSection.style.display = 'block';
        toggleCalendarBtn.textContent = '📅 カレンダーを隠す';
        if (!calendarInstance) {
            initCalendar();
        } else {
            calendarInstance.render();
        }
    } else {
        calendarSection.style.display = 'none';
        toggleCalendarBtn.textContent = '📅 カレンダー表示';
    }
});

const closeCalendarBtn = document.getElementById('close-calendar-btn');
if (closeCalendarBtn) {
    closeCalendarBtn.addEventListener('click', () => {
        calendarSection.style.display = 'none';
        toggleCalendarBtn.textContent = '📅 カレンダー表示';
    });
}

// --- Calendar Logic ---
function initCalendar() {
    if (typeof FullCalendar === 'undefined') return;
    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ja',
        height: 500,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listMonth'
        },
        events: getCalendarEvents(),
        dateClick: async function(info) {
            const title = prompt("追加する予定を入力してください:");
            if (title) {
                const newItem = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    "企業名": title,
                    createdAt: new Date().toISOString(),
                    isHidden: false,
                    memo: "",
                    _meta: { deadline: info.dateStr, isCustomEvent: true }
                };
                
                if (auth && auth.currentUser) {
                    await addDoc(collection(db, "users", auth.currentUser.uid, "companies"), newItem);
                } else {
                    mockData.push(newItem);
                    localStorage.setItem('mockData', JSON.stringify(mockData));
                    loadData();
                }
            }
        },
        eventClick: function(info) {
            // イベントクリックで対象企業・予定の編集または削除ができてもよいが、今回は簡易表示
            alert('予定: ' + info.event.title);
        }
    });
    calendarInstance.render();
}

function updateCalendarEvents() {
    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(getCalendarEvents());
    }
}

function getCalendarEvents() {
    const events = [];
    currentData.forEach(item => {
        if (item.isHidden && !showHiddenCheckbox.checked) return;
        if (item._meta && item._meta.deadline) {
            events.push({
                title: (item['企業名'] || item['会社名'] || '不明な企業') + ' 締切',
                start: item._meta.deadline,
                allDay: true,
                color: 'var(--primary)'
            });
        }
    });
    return events;
}

// --- Auth Logic ---
function updateUI() {
    if ((auth && auth.currentUser) || mockUser) {
        authScreen.classList.remove('active');
        mainScreen.classList.add('active');
        loadData();
    } else {
        authScreen.classList.add('active');
        mainScreen.classList.remove('active');
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
    }
}

if (auth) {
    onAuthStateChanged(auth, (user) => {
        updateUI();
    });
} else {
    mockUser = localStorage.getItem('mockUser') ? JSON.parse(localStorage.getItem('mockUser')) : null;
    mockData = localStorage.getItem('mockData') ? JSON.parse(localStorage.getItem('mockData')) : [];
    updateUI();
}

showSignupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isSignupMode = !isSignupMode;
    const btn = loginForm.querySelector('button');
    if (isSignupMode) {
        btn.textContent = '新規アカウント作成';
        showSignupBtn.textContent = 'ログインに戻る';
    } else {
        btn.textContent = 'ログイン';
        showSignupBtn.textContent = '新規アカウント作成（初回設定用）';
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    if (auth) {
        try {
            if (isSignupMode) {
                await createUserWithEmailAndPassword(auth, email, password);
                alert("アカウント作成完了しました。");
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            alert("認証エラー: " + error.message);
        }
    } else {
        if (isSignupMode) {
            mockUser = { email };
            localStorage.setItem('mockUser', JSON.stringify(mockUser));
            alert("MOCKアカウントを作成しました。");
            updateUI();
        } else {
            if (localStorage.getItem('mockUser')) {
                mockUser = JSON.parse(localStorage.getItem('mockUser'));
                updateUI();
            } else {
                alert("アカウントが見つかりません。新規作成してください。");
            }
        }
    }
});

logoutBtn.addEventListener('click', () => {
    if (auth) {
        signOut(auth);
    } else {
        mockUser = null;
        localStorage.removeItem('mockUser');
        updateUI();
    }
});

let formatBuilderData = [
    { id: Date.now(), name: "", attributes: [] }
];

const availableColors = [
    {val: 'red', label: '赤色'}, {val: 'orange', label: '橙色'}, {val: 'yellow', label: '黄色'},
    {val: 'green', label: '緑色'}, {val: 'teal', label: '青緑(ティール)'}, {val: 'cyan', label: '水色'},
    {val: 'blue', label: '青色'}, {val: 'indigo', label: '藍色'}, {val: 'violet', label: '紫色'},
    {val: 'magenta', label: '赤紫(マゼンタ)'}, {val: 'pink', label: 'ピンク'}, {val: 'gray', label: '灰色'}
];

function renderFormatBuilder() {
    formatItemsList.innerHTML = "";
    formatBuilderData.forEach((item, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '8px';
        row.style.background = 'var(--bg-alt)';
        row.style.padding = '12px';
        row.style.borderRadius = '4px';
        row.style.border = '1px solid var(--border-color)';
        
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.gap = '8px';
        topRow.style.alignItems = 'center';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = "項目名 (例: 志望度)";
        nameInput.value = item.name;
        nameInput.style.flex = "1";
        nameInput.style.padding = "6px";
        nameInput.addEventListener('input', (e) => { item.name = e.target.value; });

        const addAttrBtn = document.createElement('button');
        addAttrBtn.textContent = '+ 属性・ルールを追加';
        addAttrBtn.className = 'btn text';
        addAttrBtn.style.fontSize = '0.8rem';
        addAttrBtn.addEventListener('click', () => {
            item.attributes.push({ type: 'hashtag', condition: '', color: 'red' });
            renderFormatBuilder();
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'icon-btn';
        delBtn.addEventListener('click', () => {
            formatBuilderData = formatBuilderData.filter(d => d.id !== item.id);
            renderFormatBuilder();
        });

        topRow.appendChild(nameInput);
        topRow.appendChild(addAttrBtn);
        topRow.appendChild(delBtn);
        row.appendChild(topRow);

        // Attributes container
        if (item.attributes.length > 0) {
            const attrContainer = document.createElement('div');
            attrContainer.style.display = 'flex';
            attrContainer.style.flexDirection = 'column';
            attrContainer.style.gap = '4px';
            attrContainer.style.paddingLeft = '12px';
            attrContainer.style.borderLeft = '2px solid var(--border-color)';
            
            item.attributes.forEach((attr, attrIdx) => {
                const attrRow = document.createElement('div');
                attrRow.style.display = 'flex';
                attrRow.style.gap = '8px';
                attrRow.style.alignItems = 'center';

                const typeSelect = document.createElement('select');
                typeSelect.style.padding = "4px";
                typeSelect.style.fontSize = "0.85rem";
                const types = [
                    {val: "hashtag", label: "# ハッシュタグ化"},
                    {val: "color", label: "🎨 色付け条件"},
                    {val: "variable", label: "📊 変数(数値・日付等)"}
                ];
                types.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.val;
                    opt.textContent = t.label;
                    if (attr.type === t.val) opt.selected = true;
                    typeSelect.appendChild(opt);
                });

                const extraDiv = document.createElement('div');
                extraDiv.style.display = 'flex';
                extraDiv.style.gap = '4px';
                
                const renderAttrExtra = () => {
                    extraDiv.innerHTML = "";
                    if (attr.type === "color") {
                        const condInput = document.createElement('input');
                        condInput.type = 'text';
                        condInput.placeholder = "条件(例: ★4以上)";
                        condInput.value = attr.condition || "";
                        condInput.style.width = "120px";
                        condInput.style.fontSize = "0.85rem";
                        condInput.style.padding = "4px";
                        condInput.addEventListener('input', (e) => attr.condition = e.target.value);
                        
                        const colSelect = document.createElement('select');
                        colSelect.style.fontSize = "0.85rem";
                        colSelect.style.padding = "4px";
                        availableColors.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.val;
                            opt.textContent = c.label;
                            if (attr.color === c.val) opt.selected = true;
                            colSelect.appendChild(opt);
                        });
                        colSelect.addEventListener('change', (e) => attr.color = e.target.value);
                        
                        extraDiv.appendChild(condInput);
                        extraDiv.appendChild(colSelect);
                    }
                };
                renderAttrExtra();
                
                typeSelect.addEventListener('change', (e) => {
                    attr.type = e.target.value;
                    renderAttrExtra();
                });

                const removeAttrBtn = document.createElement('button');
                removeAttrBtn.textContent = '✕';
                removeAttrBtn.className = 'icon-btn';
                removeAttrBtn.style.fontSize = '0.7rem';
                removeAttrBtn.addEventListener('click', () => {
                    item.attributes.splice(attrIdx, 1);
                    renderFormatBuilder();
                });

                attrRow.appendChild(typeSelect);
                attrRow.appendChild(extraDiv);
                attrRow.appendChild(removeAttrBtn);
                attrContainer.appendChild(attrRow);
            });
            row.appendChild(attrContainer);
        }

        formatItemsList.appendChild(row);
    });
}

addFormatItemBtn.addEventListener('click', () => {
    formatBuilderData.push({ id: Date.now(), name: "", attributes: [] });
    renderFormatBuilder();
});

async function loadSettings() {
    if (auth && auth.currentUser) {
        try {
            const docSnap = await getDocs(collection(db, "users", auth.currentUser.uid, "settings"));
            docSnap.forEach(d => {
                if (d.id === "formatBuilder" && d.data().data) {
                    formatBuilderData = JSON.parse(d.data().data);
                }
            });
        } catch (e) {
            console.error(e);
        }
    } else {
        const saved = localStorage.getItem('formatBuilderData');
        if (saved) formatBuilderData = JSON.parse(saved);
    }
    renderFormatBuilder();
}

// --- Format Generator Logic ---
generateFormatBtn.addEventListener('click', async () => {
    const validItems = formatBuilderData.filter(d => d.name.trim() !== "");
    if (validItems.length === 0) {
        alert("抽出したい項目名を1つ以上入力してください！");
        return;
    }
    
    // Save settings
    const dataStr = JSON.stringify(formatBuilderData);
    if (auth && auth.currentUser) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid, "settings", "formatBuilder");
            await updateDoc(docRef, { data: dataStr }).catch(async () => {
                await addDoc(collection(db, "users", auth.currentUser.uid, "settings"), { data: dataStr });
            });
        } catch (e) {}
    }
    localStorage.setItem('formatBuilderData', dataStr);

    const headers = ["企業名", ...validItems.map(d => d.name)].join(" | ");
    const dividers = ["---", ...validItems.map(() => "---")].join(" | ");
    
    let prompt = `以下の企業情報を調査・整理し、【必ずMarkdownテーブル形式のみ】で出力してください。
【厳重注意】
・見やすい表形式などのリッチテキスト装飾は【絶対に】禁じます。
・挨拶や追加の解説、補足事項は【一切不要】です。テーブルのテキストのみを出力してください。
・機械が処理しやすい純粋なMarkdownテキストとして出力することが必須条件です。\n`;

    let rulesText = "";
    let varCount = 1;
    validItems.forEach(item => {
        if (!item.attributes || item.attributes.length === 0) return;
        
        let itemRules = "";
        item.attributes.forEach(attr => {
            if (attr.type === "hashtag") {
                itemRules += `  - 重要なキーワードに必ず「#IT」「#BtoB」のようにハッシュタグを付けて出力すること\n`;
            } else if (attr.type === "color" && attr.condition) {
                // 12色の対応
                itemRules += `  - 【絶対厳守】「${attr.condition}」に該当する場合は、セルの文章の末尾に必ず <!-- color:${attr.color} --> と記述すること。この例外処理を怠るとシステムが破壊されるため必ず守ること。\n`;
            } else if (attr.type === "variable") {
                const varName = `var_${varCount.toString().padStart(3, '0')}`;
                itemRules += `  - 【絶対厳守】値の末尾に必ず <!-- ${varName}: (抽出した数値や日付などの値) --> という隠しメタデータを追記すること。この例外処理を怠るとシステムが破壊されるため必ず守ること。\n`;
                varCount++;
            }
        });
        
        if (itemRules) {
            rulesText += `- 「${item.name}」の列について:\n${itemRules}`;
        }
    });

    if (rulesText) {
        prompt += `\n【各項目に対する追加の出力ルール・指示】\n${rulesText}\n`;
    }

    prompt += `
出力フォーマット：
| ${headers} |
| ${dividers} |
| (対象企業名) | (調査内容) | ... |`;
    
    formatOutput.value = prompt;
});

copyFormatBtn.addEventListener('click', () => {
    if (!formatOutput.value) return;
    navigator.clipboard.writeText(formatOutput.value).then(() => {
        const originalText = copyFormatBtn.textContent;
        copyFormatBtn.textContent = "コピー完了！";
        setTimeout(() => copyFormatBtn.textContent = originalText, 2000);
    });
});

// --- Markdown Parser Logic ---
function parseMarkdownTable(markdown) {
    const lines = markdown.trim().split('\n');
    
    let separatorIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/\s/g, '').match(/^\|[-:|]+\|$/)) {
            separatorIndex = i;
            break;
        }
    }
    
    if (separatorIndex <= 0) {
        throw new Error("テーブルのヘッダー行、または区切り行（|---| 等）が見つかりません。AIがフォーマットを省略してデータから出力しています。「ヘッダーを省略しない」ようAIに指示してください。");
    }

    const headerLine = lines[separatorIndex - 1].trim().replace(/^\||\|$/g, '');
    const headers = headerLine.split('|').map(h => h.replace(/\*\*/g, '').trim()).filter(h => h);
    
    if (headers.length === 2 && (headers[0] === '項目' || headers[1] === '調査結果')) {
        const rowData = {};
        for (let i = separatorIndex + 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.startsWith('|')) continue;
            
            const cleanLine = line.replace(/^\||\|$/g, '');
            const cells = cleanLine.split('|').map(c => c.replace(/\*\*/g, '').trim());
            if (cells.length >= 2) {
                const cleanH = cells[0].trim();
                if (cleanH && !/^[-:\s]+$/.test(cleanH) && !['項目', '調査結果', '内容'].includes(cleanH)) {
                    rowData[cleanH] = cells.slice(1).join('|').trim();
                }
            }
        }
        return [rowData];
    } else {
        const data = [];
        for (let i = separatorIndex + 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.startsWith('|')) continue;
            
            const cleanLine = line.replace(/^\||\|$/g, '');
            const cells = cleanLine.split('|').map(c => c.replace(/\*\*/g, '').trim());
            
            if (cells.length >= headers.length) {
                const rowData = {};
                headers.forEach((header, index) => {
                    const cleanH = header.trim();
                    if (!cleanH || /^[-:\s]+$/.test(cleanH) || ['項目', '調査結果', '内容'].includes(cleanH)) {
                        return; // 不要なキーは保存しない
                    }
                    rowData[cleanH] = cells[index] || "";
                });
                data.push(rowData);
            }
        }
        return data;
    }
}

// --- Data Import ---
importBtn.addEventListener('click', async () => {
    const text = importText.value;
    if (!text) return;

    importStatus.textContent = "パース中...";
    importStatus.className = "";

    let parsedData = null;
    try {
        parsedData = parseMarkdownTable(text);
    } catch (err) {
        importStatus.textContent = "エラー: " + err.message;
        importStatus.className = "status-error";
        return;
    }
    
    if (!parsedData || parsedData.length === 0) {
        importStatus.textContent = "エラー: 有効なMarkdownテーブルデータが見つかりません。";
        importStatus.className = "status-error";
        return;
    }

    try {
        if (db) {
            const colRef = collection(db, "users", auth.currentUser.uid, "companies");
            for (const item of parsedData) {
                item.createdAt = new Date().toISOString();
                item.isHidden = false;
                item.memo = "";
                await addDoc(colRef, item);
            }
        } else {
            parsedData.forEach(item => {
                item.id = Date.now() + Math.random().toString(36).substr(2, 9);
                item.createdAt = new Date().toISOString();
                item.isHidden = false;
                item.memo = "";
                mockData.push(item);
            });
            localStorage.setItem('mockData', JSON.stringify(mockData));
        }

        importStatus.textContent = `${parsedData.length} 件のデータを正常に登録しました！`;
        importStatus.className = "status-success";
        importText.value = "";
        
        if (!db) loadData(); 
    } catch (e) {
        importStatus.textContent = "保存中にエラーが発生しました: " + e.message;
        importStatus.className = "status-error";
    }
});

// --- Data Clear ---
clearDataBtn.addEventListener('click', async () => {
    if (!confirm("本当に全てのデータを削除しますか？\n（不正な形式でパースされてしまったデータの削除用です）")) {
        return;
    }
    try {
        if (db) {
            const colRef = collection(db, "users", auth.currentUser.uid, "companies");
            const snapshot = await getDocs(colRef);
            for (const docSnapshot of snapshot.docs) {
                await deleteDoc(doc(db, "users", auth.currentUser.uid, "companies", docSnapshot.id));
            }
        } else {
            mockData = [];
            localStorage.setItem('mockData', JSON.stringify(mockData));
            loadData();
        }
        alert("データをクリアしました。");
    } catch (e) {
        alert("クリア中にエラーが発生しました: " + e.message);
    }
});

// --- Query Builder & Search Logic ---
let queryRows = [
    { id: Date.now(), bracketOpen: false, not: false, field: "all", operator: "contains", value: "", bracketClose: false, logic: "AND" }
];

function renderQueryBuilder() {
    queryBuilderContainer.innerHTML = "";
    
    // 集計した利用可能なフィールドリスト
    const availableFields = new Set();
    mockData.forEach(item => {
        Object.keys(item).forEach(k => {
            if (!k.startsWith('_') && k !== 'id' && k !== 'userId' && k !== 'createdAt' && k !== 'isHidden') {
                availableFields.add(k);
            }
        });
        if (item._meta) {
            Object.keys(item._meta).forEach(k => availableFields.add(k));
        }
    });
    
    queryRows.forEach((row, index) => {
        const rowDiv = document.createElement('div');
        rowDiv.style.display = 'flex';
        rowDiv.style.gap = '8px';
        rowDiv.style.alignItems = 'center';
        
        // "("
        const openCheck = document.createElement('label');
        openCheck.style.fontSize = '0.9rem';
        openCheck.style.display = 'flex';
        openCheck.style.alignItems = 'center';
        openCheck.style.gap = '4px';
        openCheck.innerHTML = `<input type="checkbox" ${row.bracketOpen ? 'checked' : ''}> (`;
        openCheck.querySelector('input').addEventListener('change', (e) => { row.bracketOpen = e.target.checked; });
        
        // NOT
        const notCheck = document.createElement('label');
        notCheck.style.fontSize = '0.9rem';
        notCheck.style.display = 'flex';
        notCheck.style.alignItems = 'center';
        notCheck.style.gap = '4px';
        notCheck.innerHTML = `<input type="checkbox" ${row.not ? 'checked' : ''}> NOT`;
        notCheck.querySelector('input').addEventListener('change', (e) => { row.not = e.target.checked; });
        
        // Field Select
        const fieldSelect = document.createElement('select');
        fieldSelect.style.padding = '4px';
        fieldSelect.innerHTML = `<option value="all">すべて検索</option>
                                 <option value="_tags">タグ(#...)</option>
                                 <option value="_bookmarked">ブックマーク済</option>`;
        Array.from(availableFields).forEach(f => {
            fieldSelect.innerHTML += `<option value="${f}">${f}</option>`;
        });
        fieldSelect.value = row.field;
        fieldSelect.addEventListener('change', (e) => { row.field = e.target.value; renderQueryBuilder(); });
        
        // Operator Select
        const opSelect = document.createElement('select');
        opSelect.style.padding = '4px';
        if (row.field === "_bookmarked") {
            opSelect.innerHTML = `<option value="is_true">である</option>`;
            row.operator = "is_true";
        } else {
            opSelect.innerHTML = `
                <option value="contains">を含む</option>
                <option value="equals">と一致</option>
                <option value="gt">＞ (より大きい)</option>
                <option value="lt">＜ (より小さい)</option>
                <option value="gte">≧ (以上)</option>
                <option value="lte">≦ (以下)</option>
            `;
            opSelect.value = row.operator;
        }
        opSelect.addEventListener('change', (e) => { row.operator = e.target.value; });
        
        // Value Input
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.placeholder = "値";
        valInput.value = row.value;
        valInput.style.padding = '4px';
        valInput.style.flex = '1';
        if (row.field === "_bookmarked") valInput.style.display = 'none';
        valInput.addEventListener('input', (e) => { row.value = e.target.value; });
        
        // ")"
        const closeCheck = document.createElement('label');
        closeCheck.style.fontSize = '0.9rem';
        closeCheck.style.display = 'flex';
        closeCheck.style.alignItems = 'center';
        closeCheck.style.gap = '4px';
        closeCheck.innerHTML = `<input type="checkbox" ${row.bracketClose ? 'checked' : ''}> )`;
        closeCheck.querySelector('input').addEventListener('change', (e) => { row.bracketClose = e.target.checked; });
        
        // AND/OR (最後の行以外)
        const logicSelect = document.createElement('select');
        logicSelect.style.padding = '4px';
        logicSelect.innerHTML = `<option value="AND">AND</option><option value="OR">OR</option>`;
        logicSelect.value = row.logic;
        logicSelect.addEventListener('change', (e) => { row.logic = e.target.value; });
        if (index === queryRows.length - 1) logicSelect.style.visibility = 'hidden';
        
        // 削除ボタン
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'icon-btn';
        delBtn.addEventListener('click', () => {
            queryRows.splice(index, 1);
            if (queryRows.length === 0) {
                queryRows.push({ id: Date.now(), bracketOpen: false, not: false, field: "all", operator: "contains", value: "", bracketClose: false, logic: "AND" });
            }
            renderQueryBuilder();
        });
        
        rowDiv.appendChild(openCheck);
        rowDiv.appendChild(notCheck);
        rowDiv.appendChild(fieldSelect);
        rowDiv.appendChild(opSelect);
        rowDiv.appendChild(valInput);
        rowDiv.appendChild(closeCheck);
        rowDiv.appendChild(logicSelect);
        rowDiv.appendChild(delBtn);
        
        queryBuilderContainer.appendChild(rowDiv);
    });
}

addQueryRowBtn.addEventListener('click', () => {
    queryRows.push({ id: Date.now(), bracketOpen: false, not: false, field: "all", operator: "contains", value: "", bracketClose: false, logic: "AND" });
    renderQueryBuilder();
});

clearSearchBtn.addEventListener('click', () => {
    queryRows = [{ id: Date.now(), bracketOpen: false, not: false, field: "all", operator: "contains", value: "", bracketClose: false, logic: "AND" }];
    renderQueryBuilder();
    applyFiltersAndRender();
});

doQuerySearchBtn.addEventListener('click', () => {
    applyFiltersAndRender();
});

applySortBtn.addEventListener('click', applyFiltersAndRender);
showHiddenCheckbox.addEventListener('change', applyFiltersAndRender);

function evaluateCondition(item, row) {
    let targetValue = "";
    
    if (row.field === "all") {
        targetValue = Object.values(item).join(' ').toLowerCase() + " " + (item.memo || "").toLowerCase();
        if (item._meta) targetValue += " " + Object.values(item._meta).join(' ');
    } else if (row.field === "_tags") {
        // 全テキストからハッシュタグのみ抽出して配列化
        const allText = Object.values(item).filter(v => typeof v === 'string').join(' ');
        const tags = (allText.match(/#[^\s]+/g) || []).map(t => t.toLowerCase());
        
        let searchTags = row.value.split(/[\s,]+/).filter(t => t);
        // 先頭に#がなければ付与する
        searchTags = searchTags.map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());
        
        let isMatch = false;
        if (row.operator === "equals") {
            // 指定したタグと完全に一致するセットを持っているか (完全一致は使いにくいので、すべて含まれるかで処理)
            isMatch = searchTags.every(st => tags.includes(st)) && searchTags.length === tags.length;
        } else {
            // デフォルトは指定したタグが全て含まれるか (AND)
            isMatch = searchTags.every(st => tags.some(t => t.includes(st)));
        }
        return row.not ? !isMatch : isMatch;
    } else if (row.field === "_bookmarked") {
        targetValue = !!item.isBookmarked;
    } else if (item._meta && item._meta[row.field] !== undefined) {
        targetValue = item._meta[row.field];
    } else {
        targetValue = item[row.field] || "";
    }
    
    let isMatch = false;
    let v1 = targetValue;
    let v2 = row.value;
    
    if (row.operator === "is_true") {
        isMatch = !!v1;
    } else if (row.operator === "contains") {
        isMatch = String(v1).toLowerCase().includes(String(v2).toLowerCase());
    } else if (row.operator === "equals") {
        isMatch = String(v1).toLowerCase() === String(v2).toLowerCase();
    } else {
        // 数値比較を試みる
        const num1 = Number(v1);
        const num2 = Number(v2);
        if (!isNaN(num1) && !isNaN(num2)) {
            v1 = num1; v2 = num2;
        }
        if (row.operator === "gt") isMatch = v1 > v2;
        else if (row.operator === "lt") isMatch = v1 < v2;
        else if (row.operator === "gte") isMatch = v1 >= v2;
        else if (row.operator === "lte") isMatch = v1 <= v2;
    }
    
    return row.not ? !isMatch : isMatch;
}

function applyFiltersAndRender() {
    const showHidden = searchIncludeHidden.checked;
    
    let filteredData = mockData.filter(item => {
        if (item.isHidden && !showHidden) return false;
        
        // Evaluate query rows
        // Build a javascript boolean expression string and eval it
        let expr = "";
        let hasConditions = false;
        
        for (let i = 0; i < queryRows.length; i++) {
            const row = queryRows[i];
            if (row.field !== "_bookmarked" && row.value.trim() === "") {
                continue; // 値が空の条件は無視
            }
            hasConditions = true;
            
            const res = evaluateCondition(item, row);
            
            if (row.bracketOpen) expr += "(";
            expr += res ? "true" : "false";
            if (row.bracketClose) expr += ")";
            
            if (i < queryRows.length - 1) {
                expr += row.logic === "AND" ? " && " : " || ";
            }
        }
        
        // 末尾が演算子で終わってしまった場合のトリミング
        expr = expr.replace(/(&&|\|\|)\s*$/, "");
        
        if (!hasConditions) return true; // 条件指定なしは全件表示
        
        try {
            return eval(expr);
        } catch (e) {
            console.error("Query evaluation error", expr);
            return true; // 文法エラー（括弧の不一致など）の場合はとりあえず表示
        }
    });
    
    currentData = filteredData;
    
    // 2. Sort
    const sortVal = sortSelect.value;
    filteredData.sort((a, b) => {
        let valA = 0, valB = 0;
        
        switch (sortVal) {
            case 'created_desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'star_desc':
                valA = a._meta?.star || 0;
                valB = b._meta?.star || 0;
                return valB - valA; 
            case 'salary_desc':
                valA = a._meta?.salary || 0;
                valB = b._meta?.salary || 0;
                return valB - valA; 
            case 'years_desc':
                valA = a._meta?.years || 0;
                valB = b._meta?.years || 0;
                return valB - valA; 
            case 'deadline_asc':
                valA = a._meta?.deadline ? new Date(a._meta.deadline).getTime() : 9999999999999;
                valB = b._meta?.deadline ? new Date(b._meta.deadline).getTime() : 9999999999999;
                return valA - valB; 
            default:
                return 0;
        }
    });

    renderTable(filteredData);
}

// Extract quick tags from data
function renderQuickTags(data) {
    quickTagsContainer.innerHTML = "";
    const tagSet = new Set();
    
    data.forEach(item => {
        Object.values(item).forEach(text => {
            if (typeof text === 'string') {
                const matches = text.match(/(#[^\s]+)/g);
                if (matches) {
                    matches.forEach(t => tagSet.add(t));
                }
            }
        });
    });

    Array.from(tagSet).sort().forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'quick-tag-btn';
        btn.textContent = tag;
        btn.addEventListener('click', () => {
            if (searchInput.value.includes(tag)) {
                searchInput.value = searchInput.value.replace(tag, "").trim();
            } else {
                searchInput.value = (searchInput.value + " " + tag).trim();
            }
            currentSearchQuery = searchInput.value;
            applyFiltersAndRender();
        });
        quickTagsContainer.appendChild(btn);
    });
}

async function updateItemData(id, updates) {
    if (db) {
        const docRef = doc(db, "users", auth.currentUser.uid, "companies", id);
        await updateDoc(docRef, updates);
    } else {
        const idx = mockData.findIndex(d => d.id === id);
        if (idx !== -1) {
            mockData[idx] = { ...mockData[idx], ...updates };
            localStorage.setItem('mockData', JSON.stringify(mockData));
            loadData(); // trigger re-render
        }
    }
}

async function deleteItemData(id) {
    if (confirm("本当にこのデータを削除しますか？この操作は元に戻せません。")) {
        if (auth && auth.currentUser) {
            const docRef = doc(db, "users", auth.currentUser.uid, "companies", id);
            await deleteDoc(docRef);
        } else {
            mockData = mockData.filter(d => d.id !== id);
            localStorage.setItem('mockData', JSON.stringify(mockData));
            loadData();
        }
    }
}

function renderTable(data) {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    if (data.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='10'>表示できるデータがありません。</td></tr>";
        return;
    }

    const ignoreHeaders = ['id', 'createdAt', 'userId', '会社名', '企業名', 'isHidden', 'memo', '_meta', '項目', '調査結果', '内容'];
    const headerSet = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(k => {
            const cleanK = k.trim();
            if (!cleanK) return; // 空白キーを除外
            if (ignoreHeaders.includes(cleanK)) return; // 特定の不要なキーを除外
            if (/^[-:\s]+$/.test(cleanK)) return; // '---' や '-' などの記号だけのキーを除外
            headerSet.add(cleanK);
        });
    });

    let companyKey = "会社名";
    if (currentData.some(d => d["企業名"])) companyKey = "企業名";

    const dynamicHeaders = Array.from(headerSet);
    const headers = [companyKey, ...dynamicHeaders, "アクション"];

    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        
        // Hide Column Feature
        if (h !== companyKey && h !== "アクション") {
            const hideBtn = document.createElement('button');
            hideBtn.className = 'hide-col-btn';
            hideBtn.textContent = '×';
            hideBtn.title = "この列を非表示にする";
            hideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!hiddenColumns.includes(h)) {
                    hiddenColumns.push(h);
                    renderTable(currentData);
                    updateHiddenColumnsManager();
                }
            });
            th.appendChild(hideBtn);
        }
        
        if (hiddenColumns.includes(h)) {
            th.style.display = 'none';
        }
        
        tableHead.appendChild(th);
    });

    data.forEach(item => {
        const tr = document.createElement('tr');
        if (item.isHidden) {
            tr.classList.add('is-hidden');
        }
        
        headers.forEach(h => {
            const td = document.createElement('td');
            
            if (h === companyKey) {
                // 企業名
                const nameDiv = document.createElement('div');
                nameDiv.textContent = item[h] || "不明";
                nameDiv.style.fontWeight = "bold";
                td.appendChild(nameDiv);

            } else if (h === "アクション") {
                const companyName = item[companyKey] || "不明";
                const actionContainer = document.createElement('div');
                actionContainer.className = 'action-buttons';

                // Links
                const owLink = document.createElement('a');
                owLink.href = `https://google.com/search?q=${encodeURIComponent(companyName + " OpenWork")}`;
                owLink.target = "_blank";
                owLink.className = "external-link";
                owLink.textContent = "OpenWork";
                
                const recLink = document.createElement('a');
                recLink.href = `https://google.com/search?q=${encodeURIComponent(companyName + " 採用ページ")}`;
                recLink.target = "_blank";
                recLink.className = "external-link";
                recLink.textContent = "採用ページ";

                const linkDiv = document.createElement('div');
                linkDiv.appendChild(owLink);
                linkDiv.appendChild(recLink);
                actionContainer.appendChild(linkDiv);

                // Hidden Toggle
                const toggleHideBtn = document.createElement('button');
                toggleHideBtn.className = 'action-btn-small';
                toggleHideBtn.textContent = item.isHidden ? "元に戻す" : "非表示";
                toggleHideBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    updateItemData(item.id, { isHidden: !item.isHidden });
                });
                actionContainer.appendChild(toggleHideBtn);

                // Delete Toggle
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'action-btn-small action-btn-danger';
                deleteBtn.textContent = "削除";
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteItemData(item.id);
                });
                actionContainer.appendChild(deleteBtn);

                td.appendChild(actionContainer);

            } else {
                if (hiddenColumns.includes(h)) {
                    td.style.display = 'none';
                }

                let text = item[h] || "-";
                
                let bgColorClass = "";
                if (text.includes("<!-- color:green -->")) bgColorClass = "bg-green";
                else if (text.includes("<!-- color:yellow -->")) bgColorClass = "bg-yellow";
                else if (text.includes("<!-- color:red -->")) bgColorClass = "bg-red";
                
                text = text.replace(/<!-- color:(.*?) -->/g, "").trim();
                text = text.replace(/<!-- sort_(.*?):(.*?) -->/g, "").trim();

                // タグの抽出
                const tags = [];
                const regex = /(#[^\s]+)/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    tags.push(match[1]);
                }
                // 本文からタグを消去
                text = text.replace(/(#[^\s]+)/g, "").trim();

                if (bgColorClass) td.className = bgColorClass;

                // セル上部にタグコンテナを配置
                if (tags.length > 0) {
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'cell-tags';
                    tags.forEach(t => {
                        const tagSpan = document.createElement('span');
                        tagSpan.className = 'tag';
                        tagSpan.textContent = t;
                        tagsContainer.appendChild(tagSpan);
                    });
                    td.appendChild(tagsContainer);
                }
                
                // 本文
                const contentDiv = document.createElement('div');
                contentDiv.className = 'cell-content';
                
                // ブックマーク機能 (企業名の列に配置)
                if (h === companyKey) {
                    const bookmarkBtn = document.createElement('span');
                    bookmarkBtn.className = 'bookmark-btn';
                    bookmarkBtn.style.cursor = 'pointer';
                    bookmarkBtn.style.fontSize = '1.2rem';
                    bookmarkBtn.style.marginRight = '8px';
                    bookmarkBtn.textContent = item.isBookmarked ? '🔖' : '☆';
                    bookmarkBtn.title = 'ブックマーク / ピン留め';
                    bookmarkBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        updateItemData(item.id, { isBookmarked: !item.isBookmarked });
                    });
                    
                    const textSpan = document.createElement('span');
                    textSpan.textContent = text;
                    contentDiv.appendChild(bookmarkBtn);
                    contentDiv.appendChild(textSpan);
                } else {
                    contentDiv.textContent = text;
                }
                
                td.appendChild(contentDiv);
                
                // Edit Function using Modal
                const openEditModal = () => {
                    currentEditItemId = item.id;
                    currentEditField = h;
                    editModalTitle.textContent = `「${h}」の編集`;
                    editModalTextarea.value = (item[h] === "-" || !item[h]) ? "" : item[h];
                    editModal.style.display = 'flex';
                    editModalTextarea.focus();
                };

                // Right-click edit
                td.addEventListener('contextmenu', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button') return;
                    e.preventDefault();
                    e.stopPropagation();
                    openEditModal();
                });
                
                // Long-press for mobile edit
                let pressTimer;
                td.addEventListener('touchstart', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button') return;
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        openEditModal();
                    }, 800);
                }, { passive: true });
                td.addEventListener('touchend', () => clearTimeout(pressTimer));
                td.addEventListener('touchmove', () => clearTimeout(pressTimer));

                td.addEventListener('click', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button') return;
                    // Prevent triggering click if user dragged the table
                    if (window.isDraggingTable) return;
                    contentDiv.classList.toggle('expanded');
                });
            }
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

function processMetaData(dataList) {
    dataList.forEach(item => {
        item._meta = {}; 
        
        let allText = "";
        Object.values(item).forEach(text => {
            if (typeof text === 'string') {
                allText += text + " ";
                const regex = /<!-- (?:sort|var)_(.*?):\s*(.*?) -->/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    let key = match[1].trim();
                    // var_ で始まった場合は var_ をキー名に含めて重複を防ぐ
                    if (match[0].includes('<!-- var_')) {
                        key = 'var_' + key;
                    }
                    let val = match[2].trim();
                    // 日付(YYYY-MM-DD)の形式なら文字列のまま、それ以外で数値化できるなら数値化
                    if (!val.match(/^\d{4}-\d{2}-\d{2}$/) && !isNaN(Number(val))) {
                        val = Number(val);
                    }
                    item._meta[key] = val;
                }
            }
        });
        
        // --- 隠しタグがない場合の自動フォールバック推測 ---
        // 1. 星の数
        if (item._meta.star === undefined) {
            const starMatch = allText.match(/#星([1-5])/);
            if (starMatch) {
                item._meta.star = parseInt(starMatch[1], 10);
            } else {
                const stars = allText.match(/★/g);
                if (stars) item._meta.star = stars.length;
            }
        }
        
        // 2. 勤続年数
        if (item._meta.years === undefined) {
            const yearMatch = allText.match(/([0-9]+\.?[0-9]*)年/);
            if (yearMatch) {
                item._meta.years = parseFloat(yearMatch[1]);
            }
        }
        
        // 3. 初任給・給与
        if (item._meta.salary === undefined) {
            const salaryMatch = allText.match(/([0-9]{1,3}(,[0-9]{3})+)(円|万)/) || allText.match(/([0-9]{3,})万/);
            if (salaryMatch) {
                let s = salaryMatch[1].replace(/,/g, '');
                if (salaryMatch[0].includes('万')) s = parseInt(s) * 10000;
                item._meta.salary = parseInt(s);
            }
        }
        
        // 4. 締切日 (xxxx年xx月xx日)
        if (item._meta.deadline === undefined) {
            const dateMatch = allText.match(/([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/);
            if (dateMatch) {
                item._meta.deadline = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
            }
        }
    });
}

function loadData() {
    if (db) {
        const colRef = collection(db, "users", auth.currentUser.uid, "companies");
        unsubscribeSnapshot = onSnapshot(colRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            processMetaData(data);
            
            // Firebaseからロードした場合、mockDataを上書きしておくか、あるいはcurrentDataとして扱う
            mockData = data; 
            currentData = data;
            
            renderQuickTags(currentData);
            updateCalendarEvents();
            renderQueryBuilder(); // フィールド一覧の更新
            applyFiltersAndRender();
        });
    } else {
        const data = [...mockData];
        processMetaData(data);
        currentData = data;
        
        renderQuickTags(currentData);
        updateCalendarEvents();
        renderQueryBuilder(); // フィールド一覧の更新
        applyFiltersAndRender();
    }
}

// --- 横スクロール補助 (ドラッグ & キーボード) ---
let isDown = false;
let startX;
let scrollLeft;
window.isDraggingTable = false; // globals for access

tableContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    window.isDraggingTable = false;
    tableContainer.classList.add('active');
    startX = e.pageX - tableContainer.offsetLeft;
    scrollLeft = tableContainer.scrollLeft;
});

tableContainer.addEventListener('mouseleave', () => {
    isDown = false;
    tableContainer.classList.remove('active');
});

tableContainer.addEventListener('mouseup', () => {
    isDown = false;
    tableContainer.classList.remove('active');
    setTimeout(() => {
        window.isDraggingTable = false;
    }, 50);
});

tableContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    window.isDraggingTable = true;
    const x = e.pageX - tableContainer.offsetLeft;
    const walk = (x - startX) * 2; // スクロール速度
    tableContainer.scrollLeft = scrollLeft - walk;
});

// --- 非表示列の管理 ---
function updateHiddenColumnsManager() {
    if (hiddenColumns.length === 0) {
        manageHiddenColumnsBtn.style.display = 'none';
        return;
    }
    manageHiddenColumnsBtn.style.display = 'inline-block';
    manageHiddenColumnsBtn.textContent = `隠した列を管理 (${hiddenColumns.length})`;
}

manageHiddenColumnsBtn.addEventListener('click', () => {
    if (hiddenColumns.length === 0) return;
    let msg = "以下の列が非表示になっています。再表示する列の番号を入力してください（キャンセルでそのまま）：\n";
    hiddenColumns.forEach((col, idx) => {
        msg += `${idx + 1}: ${col}\n`;
    });
    msg += "\n※すべて再表示する場合は「all」と入力してください。";
    
    const ans = prompt(msg);
    if (!ans) return;
    
    if (ans.toLowerCase() === 'all') {
        hiddenColumns = [];
    } else {
        const num = parseInt(ans, 10);
        if (!isNaN(num) && num > 0 && num <= hiddenColumns.length) {
            hiddenColumns.splice(num - 1, 1);
        } else {
            alert("無効な入力です。");
            return;
        }
    }
    updateHiddenColumnsManager();
    applyFiltersAndRender();
});

// キーボードの左右矢印で横スクロール
document.addEventListener('keydown', (e) => {
    // 入力欄にフォーカスがある場合は無効化
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowRight') {
        tableContainer.scrollBy({ left: 150, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft') {
        tableContainer.scrollBy({ left: -150, behavior: 'smooth' });
    }
});

// --- Modal Save Logic ---
editModalSaveBtn.addEventListener('click', () => {
    const newText = editModalTextarea.value.trim();
    if (currentEditItemId && currentEditField) {
        updateItemData(currentEditItemId, { [currentEditField]: newText });
    }
    editModal.style.display = 'none';
    currentEditItemId = null;
    currentEditField = null;
});
