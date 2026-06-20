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

// Version Check
console.log("【就活メモ】 アプリバージョン: v1.2.1 (2026-06-20版)");

// State
let isSignupMode = false;
let mockUser = null;
let mockData = []; 
let mockCalendarData = []; // カレンダー専用データ (3次元ではないが、会社と完全に分ける) 
let unsubscribeSnapshot = null;
let unsubscribeCalendarSnapshot = null;
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
let currentEditingEventId = null;
const calendarModal = document.getElementById('calendar-edit-modal');
const calendarModalInputTitle = document.getElementById('calendar-modal-input-title');
const calendarModalInputType = document.getElementById('calendar-modal-input-type');
const calendarModalInputDate = document.getElementById('calendar-modal-input-date');
const calendarModalInputMemo = document.getElementById('calendar-modal-input-memo');
const calendarModalDeleteBtn = document.getElementById('calendar-modal-delete-btn');
const calendarModalSaveBtn = document.getElementById('calendar-modal-save-btn');

function openCalendarModal(dateStr, title = "", eventId = null, memo = "", type = "面接") {
    currentEditingEventId = eventId;
    calendarModalInputTitle.value = title;
    calendarModalInputDate.value = dateStr;
    calendarModalInputMemo.value = memo;
    if (calendarModalInputType) calendarModalInputType.value = type;
    calendarModalDeleteBtn.style.display = eventId ? 'block' : 'none';
    
    if (eventId) {
        calendarModalInputDate.parentElement.style.display = 'none';
    } else {
        calendarModalInputDate.parentElement.style.display = 'block';
    }
    
    calendarModal.style.display = 'flex';
}

calendarModalSaveBtn.addEventListener('click', async () => {
    const title = calendarModalInputTitle.value.trim();
    const typeVal = calendarModalInputType ? calendarModalInputType.value : "面接";
    const dateStr = calendarModalInputDate.value;
    const memo = calendarModalInputMemo.value.trim();

    if (!title || !dateStr) {
        alert("タイトルと日付を入力してください。");
        return;
    }

    if (currentEditingEventId) {
        // Edit existing
        let found = false;
        if (auth && auth.currentUser) {
            try {
                const docRef = doc(db, "users", auth.currentUser.uid, "calendar", currentEditingEventId);
                await updateDoc(docRef, { title: title, type: typeVal, memo: memo, date: dateStr });
                found = true;
            } catch (e) {
                console.warn("Firestore updateDoc failed for calendar event:", e.message);
                const item = mockCalendarData.find(d => d.id === currentEditingEventId);
                if (item) {
                    item.title = title;
                    item.type = typeVal;
                    item.memo = memo;
                    item.date = dateStr;
                    found = true;
                }
            }
        } else {
            const item = mockCalendarData.find(d => d.id === currentEditingEventId);
            if (item) {
                item.title = title;
                item.type = typeVal;
                item.memo = memo;
                item.date = dateStr;
                localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
                found = true;
            }
        }
        if (found) loadData();
    } else {
        // Add new
        const newItem = {
            title: title,
            type: typeVal,
            date: dateStr,
            createdAt: new Date().toISOString(),
            memo: memo
        };
        
        if (auth && auth.currentUser) {
            const docRefNew = await addDoc(collection(db, "users", auth.currentUser.uid, "calendar"), newItem);
            newItem.id = docRefNew.id;
        } else {
            newItem.id = Date.now() + Math.random().toString(36).substr(2, 9);
            mockCalendarData.push(newItem);
            localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
            loadData();
        }
    }
    calendarModal.style.display = 'none';
});

calendarModalDeleteBtn.addEventListener('click', async () => {
    if (!currentEditingEventId || !confirm("この予定を削除しますか？")) return;
    if (auth && auth.currentUser) {
        try {
            await deleteDoc(doc(db, "users", auth.currentUser.uid, "calendar", currentEditingEventId));
        } catch (e) {
            console.warn("Firestore deleteDoc failed for calendar event:", e.message);
            mockCalendarData = mockCalendarData.filter(d => d.id !== currentEditingEventId);
            loadData();
        }
    } else {
        mockCalendarData = mockCalendarData.filter(d => d.id !== currentEditingEventId);
        localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
        loadData();
    }
    calendarModal.style.display = 'none';
});

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
        dateClick: function(info) {
            openCalendarModal(info.dateStr);
        },
        eventClick: function(info) {
            const ev = info.event;
            // 企業テーブルの締切日はカレンダーから直接編集不可とする（編集するとカレンダー専用データとして重複してしまうため）
            if (ev.extendedProps && ev.extendedProps.isCompanyEvent) {
                alert("企業データの締切日は、下の企業リストの「編集」ボタンから変更してください。");
                return;
            }
            const memo = ev.extendedProps.memo || "";
            const rawTitle = ev.extendedProps.rawTitle || ev.title;
            const type = ev.extendedProps.type || "面接";
            openCalendarModal(ev.startStr, rawTitle, ev.id, memo, type);
        }
    });
    calendarInstance.render();
}

function updateCalendarEvents() {
    if (calendarInstance) {
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(getCalendarEvents());
    }
    checkAlarms();
}

function checkAlarms() {
    const alarmContainer = document.getElementById('alarm-container');
    if (!alarmContainer) return;
    
    alarmContainer.innerHTML = '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const events = getCalendarEvents();
    const urgentEvents = events.filter(ev => {
        if (!ev.start) return false;
        const d = new Date(ev.start);
        d.setHours(0,0,0,0);
        return d.getTime() === today.getTime() || d.getTime() === tomorrow.getTime();
    });
    
    if (urgentEvents.length > 0) {
        let msgs = urgentEvents.map(ev => {
            const d = new Date(ev.start);
            d.setHours(0,0,0,0);
            const isToday = d.getTime() === today.getTime();
            const rawTitle = ev.extendedProps && ev.extendedProps.rawTitle ? ev.extendedProps.rawTitle : ev.title;
            return `「${rawTitle}」(${isToday ? '今日' : '明日'})`;
        }).join("、 ");
        
        alarmContainer.innerHTML = `
            <div class="alarm-banner">
                <i>🔔</i>
                <div><strong>近づいている予定があります：</strong> ${msgs}</div>
            </div>
        `;
    }
}

function getCalendarEvents() {
    const events = [];
    currentData.forEach(item => {
        if (item.isHidden && !showHiddenCheckbox.checked) return;
        if (item._meta && item._meta.deadline && !item._meta.isCustomEvent) {
            const title = (item['企業名'] || item['会社名'] || '不明な企業') + ' 締切';
            let deadlineColor = 'var(--primary)';
            const deadlineType = calendarEventTypes.find(t => t.name === "締切");
            if (deadlineType) deadlineColor = deadlineType.color;

            events.push({
                id: item.id,
                title: title,
                start: item._meta.deadline,
                allDay: true,
                backgroundColor: '#fff',
                borderColor: deadlineColor,
                textColor: '#000',
                extendedProps: {
                    memo: item.memo || "",
                    type: "締切",
                    rawTitle: title,
                    isCompanyEvent: true
                }
            });
        }
    });

    // カレンダー専用データを追加
    mockCalendarData.forEach(ev => {
        let evColor = 'var(--secondary)';
        const foundType = calendarEventTypes.find(t => t.name === ev.type);
        if (foundType) evColor = foundType.color;

        events.push({
            id: ev.id,
            title: `[${ev.type || '面接'}] ${ev.title}`,
            start: ev.date,
            allDay: true,
            backgroundColor: '#fff',
            borderColor: evColor,
            textColor: '#000',
            extendedProps: {
                memo: ev.memo || "",
                type: ev.type || "面接",
                rawTitle: ev.title
            }
        });
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

let formatBuilderData = [];
let formatArchives = [];

let formatBuilderSaveTimeout;
function saveFormatBuilderDataAsync() {
    clearTimeout(formatBuilderSaveTimeout);
    formatBuilderSaveTimeout = setTimeout(async () => {
        const dataStr = JSON.stringify(formatBuilderData);
        localStorage.setItem('formatBuilderData', dataStr);
        if (auth && auth.currentUser) {
            try {
                const docRef = doc(db, "users", auth.currentUser.uid, "settings", "formatBuilder");
                await updateDoc(docRef, { data: dataStr }).catch(async () => {
                    await addDoc(collection(db, "users", auth.currentUser.uid, "settings"), { data: dataStr });
                });
            } catch (e) {}
        }
    }, 1000);
}

let formatArchivesSaveTimeout;
function saveFormatArchivesAsync() {
    clearTimeout(formatArchivesSaveTimeout);
    formatArchivesSaveTimeout = setTimeout(async () => {
        const dataStr = JSON.stringify(formatArchives);
        localStorage.setItem('formatArchives', dataStr);
        if (auth && auth.currentUser) {
            try {
                const docRef = doc(db, "users", auth.currentUser.uid, "settings", "formatArchives");
                await updateDoc(docRef, { data: dataStr }).catch(async () => {
                    await addDoc(collection(db, "users", auth.currentUser.uid, "settings"), { data: dataStr });
                });
            } catch (e) {}
        }
    }, 1000);
}

window.openFormatArchiveModal = function() {
    renderFormatArchives();
    document.getElementById('format-archive-modal').style.display = 'flex';
};

function renderFormatArchives() {
    const list = document.getElementById('format-archive-list');
    list.innerHTML = "";
    if (formatArchives.length === 0) {
        list.innerHTML = "<p style='color: var(--text-color); opacity: 0.7;'>保存されたアーカイブはありません。</p>";
        return;
    }
    formatArchives.forEach((archiveItem, idx) => {
        const div = document.createElement('div');
        div.style.padding = "12px";
        div.style.border = "1px solid var(--border-color)";
        div.style.borderRadius = "6px";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        div.style.background = "var(--bg-card)";
        
        const info = document.createElement('div');
        info.innerHTML = `<strong style="font-size:1.05rem;">${archiveItem.name}</strong><br/><span style="font-size:0.85rem; opacity:0.7;">${archiveItem.description || "説明なし"}</span>`;
        
        const btnGroup = document.createElement('div');
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "8px";
        
        const addBtn = document.createElement('button');
        addBtn.className = "btn secondary";
        addBtn.textContent = "追加";
        addBtn.onclick = () => {
            const newItem = JSON.parse(JSON.stringify(archiveItem));
            newItem.id = Date.now();
            formatBuilderData.push(newItem);
            renderFormatBuilder();
            saveFormatBuilderDataAsync();
            document.getElementById('format-archive-modal').style.display = 'none';
        };
        
        const delBtn = document.createElement('button');
        delBtn.className = "icon-btn";
        delBtn.textContent = "✕";
        delBtn.onclick = () => {
            if(confirm("このアーカイブを削除しますか？")){
                formatArchives.splice(idx, 1);
                saveFormatArchivesAsync();
                renderFormatArchives();
            }
        };
        
        btnGroup.appendChild(addBtn);
        btnGroup.appendChild(delBtn);
        div.appendChild(info);
        div.appendChild(btnGroup);
        list.appendChild(div);
    });
}

const defaultFormatBuilderData = [
    { id: 1, name: "業界", attributes: [{id: 11, val: "業界名には「#IT」などのように", type: "hashtag"}] },
    { id: 2, name: "職種", attributes: [{id: 21, val: "職種名には", type: "hashtag"}] },
    { id: 3, name: "初任給（万円）", attributes: [{id: 31, val: "必ず数値のみを抽出し", type: "variable"}] },
    { id: 4, name: "志望度", attributes: [{id: 41, val: "★の数で表現し", type: "variable"}, {id: 42, val: "★4以上", color: "green", type: "color"}, {id: 43, val: "★2以下", color: "red", type: "color"}] },
    { id: 5, name: "選考ステップ", attributes: [] },
    { id: 6, name: "インターン締切日", attributes: [{id: 61, val: "必ずYYYY-MM-DDの形式にして", type: "variable"}] },
    { id: 7, name: "特記事項", attributes: [{id: 71, val: "勤務形態や特定派遣であるなど、懸念点や特殊な条件がある場合のみ記載し、特にない場合は「なし」としてください", type: "rule"}] }
];

let calendarEventTypes = [
    { name: "面接", color: "#3b82f6" },
    { name: "締切", color: "#ef4444" },
    { name: "インターン", color: "#10b981" },
    { name: "説明会", color: "#f59e0b" },
    { name: "その他", color: "#6b7280" }
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

        // Description Input
        const descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.placeholder = "何を調べるか・詳細な指示 (例: 具体的な事業内容を簡潔に)";
        descInput.value = item.description || "";
        descInput.style.padding = "6px";
        descInput.style.fontSize = "0.85rem";
        descInput.style.width = "100%";
        descInput.addEventListener('input', (e) => { item.description = e.target.value; });
        row.appendChild(descInput);

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
                    {val: "variable", label: "📊 変数(数値・日付等)"},
                    {val: "rule", label: "📝 ルール"}
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
                        condInput.addEventListener('input', (e) => {
                            attr.condition = e.target.value;
                            saveFormatBuilderDataAsync();
                        });
                        
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
                        colSelect.addEventListener('change', (e) => {
                            attr.color = e.target.value;
                            saveFormatBuilderDataAsync();
                        });
                        
                        extraDiv.appendChild(condInput);
                        extraDiv.appendChild(colSelect);
                    } else if (attr.type === "hashtag") {
                        const tagInput = document.createElement('input');
                        tagInput.type = 'text';
                        tagInput.placeholder = "付与するタグや条件 (例: #IT, #BtoB)";
                        tagInput.value = attr.val || "";
                        tagInput.style.width = "200px";
                        tagInput.style.fontSize = "0.85rem";
                        tagInput.style.padding = "4px";
                        tagInput.addEventListener('input', (e) => {
                            attr.val = e.target.value;
                            saveFormatBuilderDataAsync();
                        });
                        extraDiv.appendChild(tagInput);
                    } else if (attr.type === "variable") {
                        const varInput = document.createElement('input');
                        varInput.type = 'text';
                        varInput.placeholder = "抽出する内容 (例: 初任給の数値のみ)";
                        varInput.value = attr.val || "";
                        varInput.style.width = "200px";
                        varInput.style.fontSize = "0.85rem";
                        varInput.style.padding = "4px";
                        varInput.addEventListener('input', (e) => {
                            attr.val = e.target.value;
                            saveFormatBuilderDataAsync();
                        });
                        extraDiv.appendChild(varInput);
                    } else if (attr.type === "rule") {
                        const ruleInput = document.createElement('input');
                        ruleInput.type = 'text';
                        ruleInput.placeholder = "自由なルールを記述";
                        ruleInput.value = attr.val || "";
                        ruleInput.style.width = "250px";
                        ruleInput.style.fontSize = "0.85rem";
                        ruleInput.style.padding = "4px";
                        ruleInput.addEventListener('input', (e) => {
                            attr.val = e.target.value;
                            saveFormatBuilderDataAsync();
                        });
                        extraDiv.appendChild(ruleInput);
                    }
                };
                renderAttrExtra();
                
                typeSelect.addEventListener('change', (e) => {
                    attr.type = e.target.value;
                    renderAttrExtra();
                    saveFormatBuilderDataAsync();
                });

                const removeAttrBtn = document.createElement('button');
                removeAttrBtn.textContent = '✕';
                removeAttrBtn.className = 'icon-btn';
                removeAttrBtn.style.fontSize = '0.7rem';
                removeAttrBtn.addEventListener('click', () => {
                    item.attributes.splice(attrIdx, 1);
                    renderFormatBuilder();
                    saveFormatBuilderDataAsync();
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
                if (d.id === "calendarEventTypes" && d.data().data) {
                    calendarEventTypes = JSON.parse(d.data().data);
                }
                if (d.id === "formatArchives" && d.data().data) {
                    formatArchives = JSON.parse(d.data().data);
                }
            });
        } catch (e) {
            console.error(e);
        }
    } else {
        const saved = localStorage.getItem('formatBuilderData');
        if (saved) formatBuilderData = JSON.parse(saved);
        
        const savedTypes = localStorage.getItem('calendarEventTypes');
        if (savedTypes) calendarEventTypes = JSON.parse(savedTypes);

        const savedArchives = localStorage.getItem('formatArchives');
        if (savedArchives) formatArchives = JSON.parse(savedArchives);
    }

    if (formatBuilderData.length === 0) {
        formatBuilderData = JSON.parse(JSON.stringify(defaultFormatBuilderData));
    } else if (!formatBuilderData.some(d => d.name === "特記事項")) {
        formatBuilderData.push({
            id: Date.now(), 
            name: "特記事項", 
            attributes: [{ id: Date.now()+1, val: "勤務形態や特定派遣であるなど、懸念点や特殊な条件がある場合のみ記載し、特にない場合は「なし」としてください", type: "rule" }]
        });
    }

    renderFormatBuilder();
    renderEventTypes();
    updateCalendarModalTypeSelect();
}

function saveCalendarEventTypes() {
    const dataStr = JSON.stringify(calendarEventTypes);
    if (auth && auth.currentUser) {
        const docRef = doc(db, "users", auth.currentUser.uid, "settings", "calendarEventTypes");
        updateDoc(docRef, { data: dataStr }).catch(() => {
            addDoc(collection(db, "users", auth.currentUser.uid, "settings"), { data: dataStr });
        });
    } else {
        localStorage.setItem('calendarEventTypes', dataStr);
    }
}

function renderEventTypes() {
    const list = document.getElementById('event-types-list');
    if (!list) return;
    list.innerHTML = '';
    calendarEventTypes.forEach((t, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = '4px';
        
        const colorIndicator = document.createElement('div');
        colorIndicator.style.width = '16px';
        colorIndicator.style.height = '16px';
        colorIndicator.style.borderRadius = '50%';
        colorIndicator.style.backgroundColor = t.color;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = t.name;
        nameSpan.style.flex = "1";
        
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        delBtn.onclick = () => {
            calendarEventTypes.splice(index, 1);
            saveCalendarEventTypes();
            renderEventTypes();
            updateCalendarModalTypeSelect();
            updateCalendarEvents();
        };
        
        div.appendChild(colorIndicator);
        div.appendChild(nameSpan);
        div.appendChild(delBtn);
        list.appendChild(div);
    });
}

window.addNewEventType = function() {
    const nameInput = document.getElementById('new-event-type-name');
    const colorInput = document.getElementById('new-event-type-color');
    const name = nameInput.value.trim();
    if (name) {
        calendarEventTypes.push({ name: name, color: colorInput.value });
        saveCalendarEventTypes();
        renderEventTypes();
        updateCalendarModalTypeSelect();
        updateCalendarEvents();
        nameInput.value = "";
    }
};

window.openEventTypeModal = function() {
    document.getElementById('event-type-modal').style.display = 'flex';
};

function updateCalendarModalTypeSelect() {
    const select = document.getElementById('calendar-modal-input-type');
    if (!select) return;
    select.innerHTML = '';
    calendarEventTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        select.appendChild(opt);
    });
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
    
    // 冒頭
    let prompt = `以下の企業情報を調査・整理し、指定のフォーマットで出力してください。見やすい表形式などのリッチテキスト装飾は【厳禁】です。\n\n■ 抽出項目とルール\n- 企業名\n`;

    let varCount = 1;
    validItems.forEach(item => {
        prompt += `- ${item.name}\n`;
        if (item.description) {
            prompt += `  (説明: ${item.description})\n`;
        }
        
        if (item.attributes && item.attributes.length > 0) {
            item.attributes.forEach(attr => {
                if (attr.type === "hashtag") {
                    const ruleVal = attr.val ? attr.val : "重要なキーワードには「#IT」「#BtoB」のように";
                    prompt += `  (ルール: ${ruleVal}ハッシュタグを付けてください)\n`;
                } else if (attr.type === "color" && attr.condition) {
                    prompt += `  (ルール: 「${attr.condition}」に該当する場合は、セルの末尾に <!-- color:${attr.color} --> と記載してください)\n`;
                } else if (attr.type === "variable") {
                    const varName = `var_${varCount.toString().padStart(3, '0')}`;
                    const ruleVal = attr.val ? attr.val : "必ず数値や日付のみを抽出し";
                    prompt += `  (ルール: ${ruleVal}、セルの末尾に <!-- ${varName}: (抽出した値) --> と記載してください)\n`;
                    varCount++;
                } else if (attr.type === "rule" && attr.val) {
                    prompt += `  (ルール: ${attr.val})\n`;
                }
            });
        }
    });

    // 中間
    prompt += `\n人間が見やすい表などの出力ではなく、純粋なデータ行のみを出力せよ。\n\n`;
    prompt += `出力フォーマット：\n/ (対象企業名1) / (調査内容) / ... /\n/ (対象企業名2) / (調査内容) / ... /\n\n`;
    
    // 末尾
    prompt += `必ず「/」で情報が区切られたデータ行のみを出力すること。Markdownの表形式(ヘッダー行や---の区切り線)は絶対に生成しないでください。`;
    
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
    let delimiter = '|';
    for (let i = 0; i < lines.length; i++) {
        // match |---| or /---/
        if (lines[i].replace(/\s/g, '').match(/^[\|/][-:\|/]+[\|/]$/)) {
            separatorIndex = i;
            delimiter = lines[i].trim().startsWith('/') ? '/' : '|';
            break;
        }
    }
    
    if (separatorIndex <= 0) {
        // ヘッダーや区切り行が見つからない場合のフォールバック（AIが//区切りのデータのみ出力した場合）
        if (markdown.includes('/')) {
            const validItems = formatBuilderData.filter(d => d.name.trim() !== "");
            const expectedHeaders = ["企業名", ...validItems.map(d => d.name)];
            
            const results = [];
            // // または改行でレコードを分割
            const rows = markdown.split(/\/\/|\n/g);
            for (let row of rows) {
                if (row.trim() === '') continue;
                // 各行を / で分割
                const cells = row.split('/').map(c => c.replace(/\*\*/g, '').trim()).filter(c => c);
                if (cells.length > 0) {
                    const rowData = {};
                    for (let i = 0; i < expectedHeaders.length && i < cells.length; i++) {
                        rowData[expectedHeaders[i]] = cells[i];
                    }
                    if (rowData["企業名"] && rowData["企業名"] !== "企業名" && !rowData["企業名"].includes("対象企業名") && !rowData["企業名"].includes("---")) results.push(rowData);
                }
            }
            if (results.length > 0) return results;
        }
        
        throw new Error("フォーマットのヘッダー行、または区切り行（/---/ 等）が見つかりません。AIがフォーマットを省略してデータから出力しています。「ヘッダーを省略しない」ようAIに指示してください。");
    }

    const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const escapedDelim = escapeRegex(delimiter);
    const stripRegex = new RegExp(`^${escapedDelim}|${escapedDelim}$`, 'g');

    const headerLine = lines[separatorIndex - 1].trim().replace(stripRegex, '');
    const headers = headerLine.split(delimiter).map(h => h.replace(/\*\*/g, '').trim()).filter(h => h);
    
    if (headers.length === 2 && (headers[0] === '項目' || headers[1] === '調査結果')) {
        const rowData = {};
        for (let i = separatorIndex + 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.startsWith(delimiter)) continue;
            
            const cleanLine = line.replace(stripRegex, '');
            const cells = cleanLine.split(delimiter).map(c => c.replace(/\*\*/g, '').trim());
            if (cells.length >= 2) {
                const cleanH = cells[0].trim();
                if (cleanH && !/^[-:\s]+$/.test(cleanH) && !['項目', '調査結果', '内容'].includes(cleanH)) {
                    rowData[cleanH] = cells.slice(1).join(delimiter).trim();
                }
            }
        }
        return [rowData];
    } else {
        const data = [];
        for (let i = separatorIndex + 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.startsWith(delimiter)) continue;
            
            const cleanLine = line.replace(stripRegex, '');
            const cells = cleanLine.split(delimiter).map(c => c.replace(/\*\*/g, '').trim());
            
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
        if (auth && auth.currentUser) {
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
        if (auth && auth.currentUser) {
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

function getAllTags() {
    const tags = new Set();
    const hashRegex = /#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FA5]+/g;
    mockData.forEach(item => {
        // 本文やメモからタグを抽出
        Object.values(item).forEach(val => {
            if (typeof val === 'string') {
                const matches = val.match(hashRegex);
                if (matches) matches.forEach(m => tags.add(m));
            }
        });
        if (item.memo) {
            const matches = item.memo.match(hashRegex);
            if (matches) matches.forEach(m => tags.add(m));
        }
    });
    return Array.from(tags).sort();
}

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

    const allTags = getAllTags();
    
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
        fieldSelect.addEventListener('change', (e) => { 
            row.field = e.target.value;
            // タグの場合はオペレータを contains に固定
            if(row.field === "_tags") row.operator = "contains";
            renderQueryBuilder(); 
        });
        
        // Operator Select
        const opSelect = document.createElement('select');
        opSelect.style.padding = '4px';
        if (row.field === "_bookmarked") {
            opSelect.innerHTML = `<option value="is_true">である</option>`;
            row.operator = "is_true";
        } else if (row.field === "_tags") {
            opSelect.innerHTML = `<option value="contains">を含む</option>`;
            row.operator = "contains";
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
        
        // Value Input / Select
        let valInput;
        if (row.field === "_tags") {
            valInput = document.createElement('select');
            valInput.style.padding = '4px';
            valInput.style.flex = '1';
            valInput.innerHTML = `<option value="">(タグを選択)</option>`;
            allTags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag;
                opt.textContent = tag;
                if (row.value === tag) opt.selected = true;
                valInput.appendChild(opt);
            });
            valInput.addEventListener('change', (e) => { row.value = e.target.value; });
        } else {
            valInput = document.createElement('input');
            valInput.type = 'text';
            valInput.placeholder = "値";
            valInput.value = row.value;
            valInput.style.padding = '4px';
            valInput.style.flex = '1';
            if (row.field === "_bookmarked") valInput.style.display = 'none';
            valInput.addEventListener('input', (e) => { row.value = e.target.value; });
        }
        
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
            // タグが既にクエリ行に存在するかチェック
            let foundRowIdx = -1;
            for (let i = 0; i < queryRows.length; i++) {
                if (queryRows[i].field === "_tags" && queryRows[i].value.includes(tag)) {
                    foundRowIdx = i;
                    break;
                }
            }

            if (foundRowIdx !== -1) {
                // 存在する場合は削除
                queryRows[foundRowIdx].value = queryRows[foundRowIdx].value.replace(tag, "").trim();
                // 行が空になったら行ごと削除（ただし最後の1行は残す）
                if (queryRows[foundRowIdx].value === "") {
                    if (queryRows.length > 1) {
                        queryRows.splice(foundRowIdx, 1);
                    } else {
                        queryRows[foundRowIdx].field = "all"; // リセット
                    }
                }
            } else {
                // 存在しない場合は追加
                let targetRowIdx = queryRows.findIndex(r => r.field === "_tags");
                if (targetRowIdx === -1) {
                    // _tags行がない場合、空の最初の行があればそれを使う
                    if (queryRows.length === 1 && queryRows[0].value === "") {
                        queryRows[0].field = "_tags";
                        queryRows[0].value = tag;
                    } else {
                        // 新しい行を追加
                        queryRows.push({ id: Date.now(), bracketOpen: false, not: false, field: "_tags", operator: "contains", value: tag, bracketClose: false, logic: "AND" });
                    }
                } else {
                    // 既存の_tags行に追加
                    queryRows[targetRowIdx].value = (queryRows[targetRowIdx].value + " " + tag).trim();
                }
            }
            renderQueryBuilder();
            applyFiltersAndRender();
        });
        quickTagsContainer.appendChild(btn);
    });
}

async function updateItemData(id, updates) {
    // 対象データを取得してカスタムイベントかどうか判定
    const targetItem = mockData.find(d => d.id === id);
    const isCustomEvent = targetItem && targetItem._meta && targetItem._meta.isCustomEvent;

    if (auth && auth.currentUser && !isCustomEvent) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid, "companies", id);
            await updateDoc(docRef, updates);
        } catch (e) {
            console.warn("Firestore updateDoc failed, falling back to local update:", e.message);
            // Firestoreに存在しないドキュメントの場合、ローカルで処理
            const idx = mockData.findIndex(d => d.id === id);
            if (idx !== -1) {
                mockData[idx] = { ...mockData[idx], ...updates };
            }
            loadData();
        }
    } else {
        const idx = mockData.findIndex(d => d.id === id);
        if (idx !== -1) {
            mockData[idx] = { ...mockData[idx], ...updates };
            localStorage.setItem('mockData', JSON.stringify(mockData));
            loadData();
        }
    }
}

async function deleteItemData(id) {
    if (confirm("本当にこのデータを削除しますか？この操作は元に戻せません。")) {
        // 対象データを取得してカスタムイベントかどうか判定
        const targetItem = mockData.find(d => d.id === id);
        const isCustomEvent = targetItem && targetItem._meta && targetItem._meta.isCustomEvent;

        if (auth && auth.currentUser && !isCustomEvent) {
            try {
                const docRef = doc(db, "users", auth.currentUser.uid, "companies", id);
                await deleteDoc(docRef);
            } catch (e) {
                console.warn("Firestore deleteDoc failed, falling back to local delete:", e.message);
                // Firestoreに存在しないドキュメントの場合、ローカルで処理
                mockData = mockData.filter(d => d.id !== id);
                loadData();
            }
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

    // カレンダー専用イベントをテーブルから除外
    const tableData = data.filter(item => !(item._meta && item._meta.isCustomEvent));

    if (tableData.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='10'>表示できるデータがありません。</td></tr>";
        return;
    }

    const ignoreHeaders = ['id', 'createdAt', 'userId', '会社名', '企業名', 'isHidden', 'memo', '_meta', '項目', '調査結果', '内容'];
    const headerSet = new Set();
    tableData.forEach(item => {
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

    tableData.forEach(item => {
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

                const linkDiv = document.createElement('div');
                linkDiv.style.display = 'flex';
                linkDiv.style.flexWrap = 'wrap';
                linkDiv.style.gap = '4px';
                
                const metaLinks = (item._meta && item._meta.links) ? item._meta.links : [
                    {title: "OpenWork", url: `https://google.com/search?q=${encodeURIComponent(companyName + " OpenWork")}`},
                    {title: "採用ページ", url: `https://google.com/search?q=${encodeURIComponent(companyName + " 採用ページ")}`}
                ];

                metaLinks.forEach(l => {
                    const lBtn = document.createElement('a');
                    lBtn.href = l.url;
                    lBtn.target = "_blank";
                    lBtn.className = "external-link";
                    lBtn.textContent = l.title;
                    linkDiv.appendChild(lBtn);
                });

                const linkManageBtn = document.createElement('button');
                linkManageBtn.className = "action-btn-small";
                linkManageBtn.textContent = "🔗 リンク";
                linkManageBtn.onclick = (e) => {
                    e.stopPropagation();
                    openLinksModal(item.id);
                };
                linkDiv.appendChild(linkManageBtn);

                const noteManageBtn = document.createElement('button');
                noteManageBtn.className = "action-btn-small";
                noteManageBtn.textContent = "📝 ノート";
                noteManageBtn.onclick = (e) => {
                    e.stopPropagation();
                    openNotesModal(item.id);
                };
                linkDiv.appendChild(noteManageBtn);

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
    if (auth && auth.currentUser) {
        const colRef = collection(db, "users", auth.currentUser.uid, "companies");
        if (unsubscribeSnapshot) unsubscribeSnapshot();
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

        const calRef = collection(db, "users", auth.currentUser.uid, "calendar");
        if (unsubscribeCalendarSnapshot) unsubscribeCalendarSnapshot();
        unsubscribeCalendarSnapshot = onSnapshot(calRef, (snapshot) => {
            mockCalendarData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            updateCalendarEvents();
        });
    } else {
        mockCalendarData = localStorage.getItem('mockCalendarData') ? JSON.parse(localStorage.getItem('mockCalendarData')) : [];
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

// --- Links Management ---
let currentLinkCompanyId = null;

window.openLinksModal = function(companyId) {
    currentLinkCompanyId = companyId;
    const item = mockData.find(d => d.id === companyId);
    if (!item) return;
    const companyName = item['企業名'] || item['会社名'] || '企業';
    document.getElementById('links-modal-title').textContent = `${companyName} のリンク管理`;
    renderLinksList();
    document.getElementById('links-modal').style.display = 'flex';
};

function renderLinksList() {
    const item = mockData.find(d => d.id === currentLinkCompanyId);
    const list = document.getElementById('links-list');
    list.innerHTML = "";
    if (!item) return;
    
    let links = (item._meta && item._meta.links) ? item._meta.links : [];
    if (links.length === 0) {
        list.innerHTML = "<p style='color:var(--text-color); opacity:0.6;'>登録されているリンクはありません。</p>";
        return;
    }
    
    links.forEach((l, idx) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '8px';
        div.style.alignItems = 'center';
        div.style.padding = '8px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = '4px';
        
        const titleInput = document.createElement('input');
        titleInput.className = 'glass-input';
        titleInput.value = l.title;
        titleInput.style.flex = "1";
        titleInput.addEventListener('change', (e) => { l.title = e.target.value; saveCurrentLinks(links); });
        
        const urlInput = document.createElement('input');
        urlInput.className = 'glass-input';
        urlInput.value = l.url;
        urlInput.style.flex = "2";
        urlInput.addEventListener('change', (e) => { l.url = e.target.value; saveCurrentLinks(links); });
        
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        delBtn.onclick = () => {
            links.splice(idx, 1);
            saveCurrentLinks(links);
            renderLinksList();
        };
        
        div.appendChild(titleInput);
        div.appendChild(urlInput);
        div.appendChild(delBtn);
        list.appendChild(div);
    });
}

window.addNewLink = function() {
    const titleInput = document.getElementById('new-link-title');
    const urlInput = document.getElementById('new-link-url');
    if (!titleInput.value.trim() || !urlInput.value.trim()) {
        alert("タイトルとURLを入力してください。");
        return;
    }
    
    const item = mockData.find(d => d.id === currentLinkCompanyId);
    if (!item) return;
    if (!item._meta) item._meta = {};
    if (!item._meta.links) {
        const companyName = item['企業名'] || item['会社名'] || '';
        item._meta.links = [
            {title: "OpenWork", url: `https://google.com/search?q=${encodeURIComponent(companyName + " OpenWork")}`},
            {title: "採用ページ", url: `https://google.com/search?q=${encodeURIComponent(companyName + " 採用ページ")}`}
        ];
    }
    
    item._meta.links.push({ title: titleInput.value.trim(), url: urlInput.value.trim() });
    saveCurrentLinks(item._meta.links);
    
    titleInput.value = "";
    urlInput.value = "";
    renderLinksList();
};

function saveCurrentLinks(newLinksArray) {
    const item = mockData.find(d => d.id === currentLinkCompanyId);
    if (!item) return;
    if (!item._meta) item._meta = {};
    item._meta.links = newLinksArray;
    updateItemData(currentLinkCompanyId, { _meta: item._meta });
}

// --- Notes Management ---
let currentNoteCompanyId = null;
let currentNoteId = null;

window.openNotesModal = function(companyId) {
    currentNoteCompanyId = companyId;
    const item = mockData.find(d => d.id === companyId);
    if (!item) return;
    const companyName = item['企業名'] || item['会社名'] || '企業';
    document.getElementById('notes-modal-title').textContent = `${companyName} のノート`;
    currentNoteId = null;
    renderNotesSidebar();
    showNoteEditor(null);
    document.getElementById('notes-modal').style.display = 'flex';
};

function renderNotesSidebar() {
    const item = mockData.find(d => d.id === currentNoteCompanyId);
    const list = document.getElementById('notes-sidebar-list');
    list.innerHTML = "";
    if (!item) return;
    
    const notes = (item._meta && item._meta.notes) ? item._meta.notes : [];
    
    if (notes.length === 0) {
        list.innerHTML = "<p style='color:var(--text-color); opacity:0.6; font-size:0.85rem;'>ノートがありません。</p>";
        return;
    }
    
    notes.forEach((note) => {
        const btn = document.createElement('button');
        btn.className = 'btn text';
        btn.style.textAlign = 'left';
        btn.style.width = '100%';
        btn.style.justifyContent = 'flex-start';
        btn.style.whiteSpace = 'nowrap';
        btn.style.overflow = 'hidden';
        btn.style.textOverflow = 'ellipsis';
        btn.textContent = note.title || "無題のノート";
        if (currentNoteId === note.id) {
            btn.style.background = 'var(--primary)';
            btn.style.color = '#fff';
        }
        btn.onclick = () => {
            currentNoteId = note.id;
            renderNotesSidebar();
            showNoteEditor(note);
        };
        list.appendChild(btn);
    });
}

function showNoteEditor(note) {
    const container = document.getElementById('note-editor-container');
    const emptyState = document.getElementById('note-empty-state');
    const titleInput = document.getElementById('note-edit-title');
    const contentInput = document.getElementById('note-edit-content');
    
    if (!note) {
        container.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    
    titleInput.value = note.title || "";
    contentInput.value = note.content || "";
}

window.createNewNote = function() {
    const item = mockData.find(d => d.id === currentNoteCompanyId);
    if (!item) return;
    if (!item._meta) item._meta = {};
    if (!item._meta.notes) item._meta.notes = [];
    
    const newNote = {
        id: Date.now(),
        title: "新規ノート",
        content: ""
    };
    
    item._meta.notes.push(newNote);
    currentNoteId = newNote.id;
    saveCurrentNotes(item._meta.notes);
    renderNotesSidebar();
    showNoteEditor(newNote);
};

const noteSaveBtn = document.getElementById('note-save-btn');
if (noteSaveBtn) {
    noteSaveBtn.addEventListener('click', () => {
        if (!currentNoteId) return;
        const item = mockData.find(d => d.id === currentNoteCompanyId);
        if (!item || !item._meta || !item._meta.notes) return;
        
        const titleInput = document.getElementById('note-edit-title');
        const contentInput = document.getElementById('note-edit-content');
        
        const noteIdx = item._meta.notes.findIndex(n => n.id === currentNoteId);
        if (noteIdx !== -1) {
            item._meta.notes[noteIdx].title = titleInput.value.trim();
            item._meta.notes[noteIdx].content = contentInput.value;
            saveCurrentNotes(item._meta.notes);
            renderNotesSidebar(); // reflect title changes
            alert("ノートを保存しました！");
        }
    });
}

const noteDeleteBtn = document.getElementById('note-delete-btn');
if (noteDeleteBtn) {
    noteDeleteBtn.addEventListener('click', () => {
        if (!currentNoteId) return;
        if (confirm("このノートを本当に削除しますか？")) {
            const item = mockData.find(d => d.id === currentNoteCompanyId);
            if (!item || !item._meta || !item._meta.notes) return;
            
            item._meta.notes = item._meta.notes.filter(n => n.id !== currentNoteId);
            saveCurrentNotes(item._meta.notes);
            currentNoteId = null;
            renderNotesSidebar();
            showNoteEditor(null);
        }
    });
}

function saveCurrentNotes(newNotesArray) {
    const item = mockData.find(d => d.id === currentNoteCompanyId);
    if (!item) return;
    if (!item._meta) item._meta = {};
    item._meta.notes = newNotesArray;
    updateItemData(currentNoteCompanyId, { _meta: item._meta });
}
