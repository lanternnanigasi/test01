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

const searchInput = document.getElementById('search-input');
const doSearchBtn = document.getElementById('do-search-btn');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchModeRadios = document.querySelectorAll('input[name="search-mode"]');
const searchIncludeHidden = document.getElementById('search-include-hidden');
const sortSelect = document.getElementById('sort-select');
const applySortBtn = document.getElementById('apply-sort-btn');
const quickTagsContainer = document.getElementById('quick-tags-container');
const showHiddenCheckbox = document.getElementById('show-hidden-checkbox');
const manageHiddenColumnsBtn = document.getElementById('manage-hidden-columns-btn');

const formatItemsInput = document.getElementById('format-items-input');
const formatRulesInput = document.getElementById('format-rules-input');
const generateFormatBtn = document.getElementById('generate-format-btn');
const formatOutput = document.getElementById('format-output');
const copyFormatBtn = document.getElementById('copy-format-btn');

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
        events: getCalendarEvents()
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

async function loadSettings() {
    if (auth && auth.currentUser) {
        try {
            const docSnap = await getDocs(collection(db, "users", auth.currentUser.uid, "settings"));
            docSnap.forEach(d => {
                if (d.id === "format") {
                    if (d.data().items) formatItemsInput.value = d.data().items;
                    if (d.data().rules) formatRulesInput.value = d.data().rules;
                }
            });
        } catch (e) {
            console.error(e);
        }
    } else {
        const savedFormat = localStorage.getItem('formatItems');
        if (savedFormat) formatItemsInput.value = savedFormat;
        const savedRules = localStorage.getItem('formatRules');
        if (savedRules) formatRulesInput.value = savedRules;
    }
}

// --- Format Generator Logic ---
generateFormatBtn.addEventListener('click', async () => {
    const itemsText = formatItemsInput.value.trim();
    const rulesText = formatRulesInput.value.trim();
    
    if (!itemsText) {
        alert("抽出したい項目名を入力してください！");
        return;
    }
    
    // Save settings
    if (auth && auth.currentUser) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid, "settings", "format");
            await updateDoc(docRef, { items: itemsText, rules: rulesText }).catch(async () => {
                await addDoc(collection(db, "users", auth.currentUser.uid, "settings"), { items: itemsText, rules: rulesText });
            });
        } catch (e) {}
    }
    localStorage.setItem('formatItems', itemsText);
    localStorage.setItem('formatRules', rulesText);

    const items = itemsText.split(/[,、]/).map(s => s.trim()).filter(s => s);
    const headers = ["企業名", ...items].join(" | ");
    const dividers = ["---", ...items.map(() => "---")].join(" | ");
    
    let prompt = `以下の企業情報を調査・整理し、【必ずMarkdownテーブル形式のみ】で出力してください。
挨拶や追加の解説、補足事項は【一切不要】です。テーブルだけを出力してください。
重要なことなので2回言います。Markdownの表以外の文章は【絶対に書かないで】ください。\n`;

    if (rulesText) {
        prompt += `\n【追加の出力ルール・指示】\n${rulesText}\n`;
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

// --- Search & Filter & Sort Logic ---
function doSearch() {
    const q = searchInput.value.trim().toLowerCase();
    const mode = document.querySelector('input[name="search-mode"]:checked').value;
    const includeHidden = searchIncludeHidden.checked;

    currentData = [];
    currentSearchQuery = q;

    mockData.forEach(item => {
        if (!includeHidden && item.isHidden) return;

        let isMatch = false;

        if (!q) {
            isMatch = true;
        } else {
            const terms = q.split(/\s+/);
            const textToSearch = Object.keys(item)
                .filter(k => includeHidden || !hiddenColumns.includes(k))
                .map(k => typeof item[k] === 'string' ? item[k].toLowerCase() : '')
                .join(" ");

            if (mode === "AND") {
                isMatch = terms.every(term => textToSearch.includes(term));
            } else {
                isMatch = terms.some(term => textToSearch.includes(term));
            }
        }

        if (isMatch) currentData.push(item);
    });

    renderTable(currentData);
}

searchModeRadios.forEach(radio => radio.addEventListener('change', applyFiltersAndRender));
applySortBtn.addEventListener('click', applyFiltersAndRender);
showHiddenCheckbox.addEventListener('change', applyFiltersAndRender);

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = "";
    currentSearchQuery = "";
    applyFiltersAndRender();
});

function applyFiltersAndRender() {
    const isAnd = document.querySelector('input[name="search-mode"]:checked').value === "AND";
    const terms = currentSearchQuery.replace(/　/g, ' ').split(/\s+/).filter(t => t);
    const showHidden = showHiddenCheckbox.checked;
    
    // 1. Filter
    let filteredData = currentData.filter(item => {
        if (item.isHidden && !showHidden) return false;
        
        if (terms.length > 0) {
            const fullText = Object.values(item).join(' ').toLowerCase() + " " + (item.memo || "").toLowerCase();
            if (isAnd) {
                return terms.every(term => fullText.includes(term.toLowerCase()));
            } else {
                return terms.some(term => fullText.includes(term.toLowerCase()));
            }
        }
        return true;
    });
    
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
                contentDiv.textContent = text;
                td.appendChild(contentDiv);
                
                // Right-click edit
                td.addEventListener('contextmenu', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button') return;
                    e.preventDefault();
                    e.stopPropagation();
                    const newText = prompt(`「${h}」の編集:`, text === "-" ? "" : text);
                    if (newText !== null && newText !== text) {
                        updateItemData(item.id, { [h]: newText.trim() });
                    }
                });
                
                // Long-press for mobile edit
                let pressTimer;
                td.addEventListener('touchstart', (e) => {
                    if (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button') return;
                    pressTimer = setTimeout(() => {
                        e.preventDefault();
                        const newText = prompt(`「${h}」の編集:`, text === "-" ? "" : text);
                        if (newText !== null && newText !== text) {
                            updateItemData(item.id, { [h]: newText.trim() });
                        }
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
                const regex = /<!-- sort_(.*?):\s*(.*?) -->/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const key = match[1].trim();
                    let val = match[2].trim();
                    if (!isNaN(Number(val))) {
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
            currentData = data;
            
            renderQuickTags(currentData);
            updateCalendarEvents();
            applyFiltersAndRender();
        });
    } else {
        const data = [...mockData];
        processMetaData(data);
        currentData = data;
        
        renderQuickTags(currentData);
        updateCalendarEvents();
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
