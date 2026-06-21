import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import { 
    collection, addDoc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc, doc, updateDoc
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
console.log("【就活メモ】 アプリバージョン: v1.4.0 (2026-06-20版)");

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
const calendarModalCompleteBtn = document.getElementById('calendar-modal-complete-btn');
const calendarModalSaveBtn = document.getElementById('calendar-modal-save-btn');
const calendarModalInputEndDate = document.getElementById('calendar-modal-input-end-date');

function openCalendarModal(dateStr, title = "", eventId = null, memo = "", type = "面接", endDate = "", isCompleted = false) {
    currentEditingEventId = eventId;
    calendarModalInputTitle.value = title;
    calendarModalInputDate.value = dateStr;
    if (calendarModalInputEndDate) calendarModalInputEndDate.value = endDate || "";
    calendarModalInputMemo.value = memo;
    if (calendarModalInputType) calendarModalInputType.value = type;
    if (calendarModalDeleteBtn) calendarModalDeleteBtn.style.display = eventId ? 'block' : 'none';
    if (calendarModalCompleteBtn) calendarModalCompleteBtn.style.display = eventId ? 'block' : 'none';
    
    // Toggle completed state via button logic
    if (calendarModalCompleteBtn) {
        if (isCompleted) {
            calendarModalCompleteBtn.textContent = '元に戻す (未完了)';
            calendarModalCompleteBtn.dataset.completed = "true";
        } else {
            calendarModalCompleteBtn.textContent = '✓ 終了済みにする';
            calendarModalCompleteBtn.dataset.completed = "false";
        }
    }
    
    calendarModal.style.display = 'flex';
}

if (calendarModalCompleteBtn) {
    calendarModalCompleteBtn.addEventListener('click', () => {
        if (calendarModalCompleteBtn.dataset.completed === "true") {
            calendarModalCompleteBtn.dataset.completed = "false";
            calendarModalCompleteBtn.textContent = '✓ 終了済みにする';
        } else {
            calendarModalCompleteBtn.dataset.completed = "true";
            calendarModalCompleteBtn.textContent = '元に戻す (未完了)';
        }
    });
}

calendarModalSaveBtn.addEventListener('click', async () => {
    const title = calendarModalInputTitle.value.trim();
    const typeVal = calendarModalInputType ? calendarModalInputType.value : "面接";
    const dateStr = calendarModalInputDate.value;
    const endDateStr = calendarModalInputEndDate ? calendarModalInputEndDate.value : "";
    const memo = calendarModalInputMemo.value.trim();
    const isCompleted = calendarModalCompleteBtn ? (calendarModalCompleteBtn.dataset.completed === "true") : false;

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
                await updateDoc(docRef, { title: title, type: typeVal, memo: memo, date: dateStr, endDate: endDateStr, isCompleted: isCompleted });
                found = true;
            } catch (e) {
                console.warn("Firestore updateDoc failed for calendar event:", e.message);
                const item = mockCalendarData.find(d => d.id === currentEditingEventId);
                if (item) {
                    item.title = title;
                    item.type = typeVal;
                    item.memo = memo;
                    item.date = dateStr;
                    item.endDate = endDateStr;
                    item.isCompleted = isCompleted;
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
                item.endDate = endDateStr;
                item.isCompleted = isCompleted;
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
            endDate: endDateStr,
            isCompleted: isCompleted,
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
            const endDate = ev.extendedProps.endDate || "";
            const isCompleted = ev.extendedProps.isCompleted || false;
            openCalendarModal(ev.startStr, rawTitle, ev.id, memo, type, endDate, isCompleted);
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
        
        // 追加ルールによる動的カレンダーイベントの描画
        if (item.customEvents && Array.isArray(item.customEvents)) {
            item.customEvents.forEach(cev => {
                let evColor = 'var(--secondary)';
                const foundType = calendarEventTypes.find(t => t.name === cev.type);
                if (foundType) evColor = foundType.color;

                const title = (item['企業名'] || item['会社名'] || '不明な企業') + ' ' + cev.type;
                events.push({
                    id: item.id + '_' + cev.type + '_' + cev.date,
                    title: title,
                    start: cev.date,
                    allDay: true,
                    backgroundColor: '#fff',
                    borderColor: evColor,
                    textColor: '#000',
                    extendedProps: {
                        memo: item.memo || "",
                        type: cev.type,
                        rawTitle: title,
                        isCompanyEvent: true
                    }
                });
            });
        }
    });

    // カレンダー専用データを追加
    mockCalendarData.forEach(ev => {
        let evColor = 'var(--secondary)';
        const foundType = calendarEventTypes.find(t => t.name === ev.type);
        if (foundType) evColor = foundType.color;

        let endDateForCalendar = ev.endDate;
        if (endDateForCalendar) {
            const endObj = new Date(endDateForCalendar);
            endObj.setDate(endObj.getDate() + 1);
            endDateForCalendar = endObj.toISOString().split('T')[0];
        }
        
        let classNames = [];
        let bgColor = '#fff';
        let borderColor = evColor;
        let textColor = '#000';
        
        if (ev.isCompleted) {
            classNames.push('event-completed');
            bgColor = 'rgba(0, 0, 0, 0.1)';
            borderColor = 'rgba(0, 0, 0, 0.2)';
            textColor = 'rgba(0, 0, 0, 0.4)';
        } else {
            bgColor = evColor;
            textColor = '#fff';
        }

        events.push({
            id: ev.id,
            title: `[${ev.type || '面接'}] ${ev.title}`,
            start: ev.date,
            end: endDateForCalendar,
            allDay: true,
            backgroundColor: bgColor,
            borderColor: borderColor,
            textColor: textColor,
            classNames: classNames,
            extendedProps: {
                memo: ev.memo || "",
                type: ev.type || "面接",
                rawTitle: ev.title,
                endDate: ev.endDate || "",
                isCompleted: ev.isCompleted || false
            }
        });
    });

    return events;
}

let importQueueUnsubscribe = null;

function listenToImportQueue() {
    if (!auth || !auth.currentUser) return;
    const qRef = collection(db, "users", auth.currentUser.uid, "importQueue");
    importQueueUnsubscribe = onSnapshot(qRef, async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const docData = change.doc.data();
                if (docData.status === "pending" && docData.rawText) {
                    try {
                        const parsedData = parseMarkdownTable(docData.rawText);
                        const colRef = collection(db, "users", auth.currentUser.uid, "companies");
                        for (const item of parsedData) {
                            item.createdAt = new Date().toISOString();
                            item.isHidden = false;
                            item.memo = item._parsedMemo || "";
                            item.resume = item._parsedResume || "";
                            item.customEvents = item._parsedCalendar || [];
                            delete item._parsedMemo;
                            delete item._parsedResume;
                            delete item._parsedCalendar;
                            await addDoc(colRef, item);
                        }
                        
                        await deleteDoc(doc(db, "users", auth.currentUser.uid, "importQueue", change.doc.id));
                        alert("Makeからの自動連携データを新しく取り込みました！");
                    } catch (e) {
                        console.error("Failed to parse import queue item:", e);
                        await updateDoc(doc(db, "users", auth.currentUser.uid, "importQueue", change.doc.id), { status: "error", error: e.message });
                    }
                }
            }
        });
    });
}

function updateUI() {
    if ((auth && auth.currentUser) || mockUser) {
        authScreen.classList.remove('active');
        mainScreen.classList.add('active');
        loadData();
        listenToImportQueue();
    } else {
        authScreen.classList.add('active');
        mainScreen.classList.remove('active');
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
        if (importQueueUnsubscribe) {
            importQueueUnsubscribe();
            importQueueUnsubscribe = null;
        }
    }
}

if (auth) {
    onAuthStateChanged(auth, async (user) => {
        //if (user) alert("あなたのUID: " + user.uid); // ★この行を追加
        await loadSettings();
        updateUI();
    });
} else {
    mockUser = localStorage.getItem('mockUser') ? JSON.parse(localStorage.getItem('mockUser')) : null;
    mockData = localStorage.getItem('mockData') ? JSON.parse(localStorage.getItem('mockData')) : [];
    loadSettings().then(() => {
        updateUI();
    });
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
                await setDoc(docRef, { data: dataStr }, { merge: true });
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

// --- Format Saving logic ---
const saveFormatToArchiveBtn = document.getElementById('save-format-to-archive-btn');
if (saveFormatToArchiveBtn) {
    saveFormatToArchiveBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('format-save-name');
        let name = nameInput ? nameInput.value.trim() : "";
        if (!name) name = `保存_${new Date().toLocaleString()}`;
        
        formatArchives.push({
            id: Date.now(),
            name: name,
            type: "profile",
            data: JSON.parse(JSON.stringify(formatBuilderData))
        });
        saveFormatArchivesAsync();
        alert("現在のフォーマット設計図を保存しました！");
        if (nameInput) nameInput.value = "";
    });
}

function renderFormatArchives() {
    const list = document.getElementById('format-archive-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (formatArchives.length === 0) {
        list.innerHTML = "<p style='color: var(--text-color); opacity: 0.7;'>保存されたアーカイブはありません。</p>";
        return;
    }

    formatArchives.forEach((arch, index) => {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.style.flexDirection = 'row';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        
        const label = document.createElement('div');
        if (typeof arch === "string") {
            label.textContent = `[テキスト履歴] ${arch.substring(0, 30)}...`;
        } else if (arch.type === "profile") {
            label.textContent = `[全体設計図] ${arch.name}`;
        } else {
            label.textContent = `[項目] ${arch.name}`;
        }
        
        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';

        const overwriteBtn = document.createElement('button');
        overwriteBtn.className = 'btn secondary';
        overwriteBtn.textContent = '上書き';
        overwriteBtn.style.color = 'var(--danger)';
        overwriteBtn.onclick = () => {
            if (confirm("現在のフォーマットをすべて消去して上書きしますか？")) {
                if (typeof arch === "string") {
                    document.getElementById('format-output').value = arch;
                } else if (arch.type === "profile") {
                    formatBuilderData = JSON.parse(JSON.stringify(arch.data));
                } else {
                    formatBuilderData = [JSON.parse(JSON.stringify(arch))];
                }
                saveFormatBuilderDataAsync();
                renderFormatBuilder();
                document.getElementById('format-archive-modal').style.display = 'none';
            }
        };

        const appendBtn = document.createElement('button');
        appendBtn.className = 'btn primary';
        appendBtn.textContent = '追加';
        appendBtn.onclick = () => {
            if (typeof arch === "string") {
                document.getElementById('format-output').value += '\n' + arch;
            } else if (arch.type === "profile") {
                const newData = JSON.parse(JSON.stringify(arch.data));
                newData.forEach(d => { d.id = Date.now() + Math.random(); formatBuilderData.push(d); });
            } else {
                const newObj = JSON.parse(JSON.stringify(arch));
                newObj.id = Date.now() + Math.random();
                formatBuilderData.push(newObj);
            }
            saveFormatBuilderDataAsync();
            renderFormatBuilder();
            document.getElementById('format-archive-modal').style.display = 'none';
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn text action-btn-danger';
        delBtn.textContent = '削除';
        delBtn.onclick = () => {
            if (confirm("このアーカイブを削除しますか？")) {
                formatArchives.splice(index, 1);
                saveFormatArchivesAsync();
                renderFormatArchives();
            }
        };

        btnGroup.appendChild(appendBtn);
        btnGroup.appendChild(overwriteBtn);
        btnGroup.appendChild(delBtn);
        div.appendChild(label);
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

        const saveArchiveBtn = document.createElement('button');
        saveArchiveBtn.textContent = '💾';
        saveArchiveBtn.className = 'icon-btn';
        saveArchiveBtn.title = 'アーカイブに保存';
        saveArchiveBtn.addEventListener('click', () => {
            formatArchives.push({
                id: Date.now(),
                name: item.name,
                description: item.description,
                attributes: JSON.parse(JSON.stringify(item.attributes))
            });
            saveFormatArchivesAsync();
            alert(`「${item.name}」をアーカイブに保存しました`);
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
        topRow.appendChild(saveArchiveBtn);
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
                    {val: "rule", label: "📝 ルール"},
                    {val: "calendar", label: "📅 カレンダー追加"},
                    {val: "memo", label: "📝 メモ追加"},
                    {val: "rewrite", label: "✨ 自己PR等リライト"}
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
                    } else if (attr.type === "calendar") {
                        const condInput = document.createElement('input');
                        condInput.type = 'text';
                        condInput.placeholder = "条件(例: 面接がある場合)";
                        condInput.value = attr.condition || "";
                        condInput.style.width = "120px";
                        condInput.style.fontSize = "0.85rem";
                        condInput.style.padding = "4px";
                        condInput.addEventListener('input', (e) => { attr.condition = e.target.value; saveFormatBuilderDataAsync(); });
                        
                        const typeInput = document.createElement('input');
                        typeInput.type = 'text';
                        typeInput.placeholder = "種類(例: 面接)";
                        typeInput.value = attr.eventType || "";
                        typeInput.style.width = "80px";
                        typeInput.style.fontSize = "0.85rem";
                        typeInput.style.padding = "4px";
                        typeInput.addEventListener('input', (e) => { attr.eventType = e.target.value; saveFormatBuilderDataAsync(); });

                        const dateInput = document.createElement('input');
                        dateInput.type = 'text';
                        dateInput.placeholder = "日付の指定(例: その面接日)";
                        dateInput.value = attr.dateRule || "";
                        dateInput.style.width = "120px";
                        dateInput.style.fontSize = "0.85rem";
                        dateInput.style.padding = "4px";
                        dateInput.addEventListener('input', (e) => { attr.dateRule = e.target.value; saveFormatBuilderDataAsync(); });

                        extraDiv.appendChild(condInput);
                        extraDiv.appendChild(typeInput);
                        extraDiv.appendChild(dateInput);
                    } else if (attr.type === "memo") {
                        const condInput = document.createElement('input');
                        condInput.type = 'text';
                        condInput.placeholder = "条件(例: 企業特徴を調べた場合)";
                        condInput.value = attr.condition || "";
                        condInput.style.width = "150px";
                        condInput.style.fontSize = "0.85rem";
                        condInput.style.padding = "4px";
                        condInput.addEventListener('input', (e) => { attr.condition = e.target.value; saveFormatBuilderDataAsync(); });

                        const titleInput = document.createElement('input');
                        titleInput.type = 'text';
                        titleInput.placeholder = "タイトル(例: 企業特性)";
                        titleInput.value = attr.memoTitle || "";
                        titleInput.style.width = "150px";
                        titleInput.style.fontSize = "0.85rem";
                        titleInput.style.padding = "4px";
                        titleInput.addEventListener('input', (e) => { attr.memoTitle = e.target.value; saveFormatBuilderDataAsync(); });

                        extraDiv.appendChild(condInput);
                        extraDiv.appendChild(titleInput);
                    } else if (attr.type === "rewrite") {
                        const targetSelect = document.createElement('select');
                        targetSelect.style.fontSize = "0.85rem";
                        targetSelect.style.padding = "4px";
                        
                        // Option for core-values + dynamic account fields
                        const opts = ["就活の軸", ...accountData.map(a => a.title)];
                        if (!opts.includes(attr.targetField)) attr.targetField = opts[0];
                        
                        opts.forEach(t => {
                            const opt = document.createElement('option');
                            opt.value = t;
                            opt.textContent = t;
                            if (attr.targetField === t) opt.selected = true;
                            targetSelect.appendChild(opt);
                        });
                        targetSelect.addEventListener('change', (e) => { attr.targetField = e.target.value; saveFormatBuilderDataAsync(); });

                        const limitInput = document.createElement('input');
                        limitInput.type = 'text';
                        limitInput.placeholder = "文字数制限等(例: 全角400字以内)";
                        limitInput.value = attr.charLimit || "";
                        limitInput.style.width = "180px";
                        limitInput.style.fontSize = "0.85rem";
                        limitInput.style.padding = "4px";
                        limitInput.addEventListener('input', (e) => { attr.charLimit = e.target.value; saveFormatBuilderDataAsync(); });

                        extraDiv.appendChild(targetSelect);
                        extraDiv.appendChild(limitInput);
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
            await setDoc(docRef, { data: dataStr }, { merge: true });
        } catch (e) {}
    }
    localStorage.setItem('formatBuilderData', dataStr);
    
    // 冒頭
    let prompt = ``;
    
    // アカウント情報・就活の軸をプロンプトに追加
    const coreValuesEl = document.getElementById('account-core-values');
    const coreValuesText = coreValuesEl ? coreValuesEl.value.trim() : "";
    
    const validAccountData = accountData.filter(a => a.title && a.value && a.value.trim() !== "");
    
    const globalEsToggle = document.getElementById('global-es-toggle');
    const isEsEnabled = globalEsToggle && globalEsToggle.checked;
    
    if (coreValuesText || validAccountData.length > 0) {
        prompt += `【ユーザーの基本情報・就活の軸】\n以下の情報を参考に、企業ごとにパーソナライズした調査を行ってください。\n\n`;
        if (coreValuesText) {
            prompt += `- 就活の軸 (絶対に譲れないこと等):\n${coreValuesText}\n\n`;
        }
        validAccountData.forEach(a => {
            prompt += `- ${a.title}:\n${a.value}\n\n`;
        });
    }

    prompt += `以下の企業情報を調査・整理し、指定のフォーマットで出力してください。見やすい表形式などのリッチテキスト装飾は【厳禁】です。\n\n■ 抽出項目とルール\n- 企業名\n`;

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
                } else if (attr.type === "calendar") {
                    prompt += `  (ルール: 「${attr.condition}」に該当する場合は、セルの末尾に <!-- calendar_${attr.eventType}: ${attr.dateRule} --> と記載してください。※必ずこのHTMLコメント形式を使うこと)\n`;
                } else if (attr.type === "memo") {
                    prompt += `  (ルール: 「${attr.condition}」に該当する場合は、調べて要約した内容をセルの末尾に <!-- memo_${attr.memoTitle}: (内容) --> と記載してください。※長文の場合、改行は必ず「<br>」を使い、文中には絶対に「/」を含めないこと)\n`;
                }
            });
        }
    });

    if (isEsEnabled) {
        const resumeFields = accountData.filter(a => a.useForResume && a.title && a.value && a.value.trim() !== "");
        if (resumeFields.length > 0) {
            prompt += `\n【特別指示：ES・履歴書自動作成】\n`;
            prompt += `この企業の求める人物像や特徴と、ユーザーの基本情報（就活の軸や自己PRなど）を結びつけて、この企業専用のES・履歴書案（志望動機と自己PR）を作成してください。\n`;
            prompt += `作成したES・履歴書の内容は、各企業の最終項目のセルの末尾に必ず以下の形式で追記してください。\n`;
            prompt += `<!-- resume: (作成した履歴書・ESの内容。改行は「<br>」を使用し、文中には「/」を絶対に含まないこと) -->\n`;
        }
    }

    // 中間
    prompt += `\n人間が見やすい表などの出力ではなく、純粋なデータ行のみを出力せよ。\n\n`;
    prompt += `出力フォーマット：\n/ (対象企業名1) / (調査内容) / ... /\n/ (対象企業名2) / (調査内容) / ... /\n\n`;
    
    // 末尾
    prompt += `必ず「/」で情報が区切られたデータ行のみを出力すること。Markdownの表形式(ヘッダー行や---の区切り線)は絶対に生成しないでください。`;
    
    formatOutput.value = prompt;

    // API連携用に、生成された最終プロンプトテキスト自体もFirestoreに保存する
    if (auth && auth.currentUser) {
        try {
            const promptDocRef = doc(db, "users", auth.currentUser.uid, "settings", "latestPrompt");
            await setDoc(promptDocRef, { text: prompt }, { merge: true });
        } catch (e) {
            console.warn("Failed to save latest prompt to Firebase:", e);
        }
    }
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
                    let extractedMemo = "";
                    let extractedCalendar = [];
                    let extractedResume = "";
                    for (let i = 0; i < cells.length; i++) {
                        const header = expectedHeaders[i] || `未設定項目${i}`;
                        let cellText = cells[i];

                        const calRegex = /<!-- calendar_(.*?):\s*(.*?) -->/g;
                        let calMatch;
                        while ((calMatch = calRegex.exec(cellText)) !== null) {
                            extractedCalendar.push({ type: calMatch[1].trim(), date: calMatch[2].trim() });
                        }
                        cellText = cellText.replace(/<!-- calendar_.*? -->/g, '');

                        const memoRegex = /<!-- memo_(.*?):\s*(.*?) -->/g;
                        let memoMatch;
                        while ((memoMatch = memoRegex.exec(cellText)) !== null) {
                            const title = memoMatch[1].trim();
                            const content = memoMatch[2].trim().replace(/<br>/g, "\n");
                            extractedMemo += `### ${title}\n${content}\n\n`;
                        }
                        cellText = cellText.replace(/<!-- memo_.*? -->/g, '');

                        const resumeRegex = /<!-- resume:\s*(.*?) -->/g;
                        let resumeMatch;
                        while ((resumeMatch = resumeRegex.exec(cellText)) !== null) {
                            extractedResume += resumeMatch[1].trim().replace(/<br>/g, "\n") + "\n\n";
                        }
                        cellText = cellText.replace(/<!-- resume:.*? -->/g, '');

                        rowData[header] = cellText.trim();
                    }
                    if (extractedMemo) rowData._parsedMemo = extractedMemo.trim();
                    if (extractedCalendar.length > 0) rowData._parsedCalendar = extractedCalendar;
                    if (extractedResume) rowData._parsedResume = extractedResume.trim();

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
                item.memo = item._parsedMemo || "";
                item.resume = item._parsedResume || "";
                item.customEvents = item._parsedCalendar || [];
                delete item._parsedMemo;
                delete item._parsedResume;
                delete item._parsedCalendar;
                await addDoc(colRef, item);
            }
        } else {
            parsedData.forEach(item => {
                item.id = Date.now() + Math.random().toString(36).substr(2, 9);
                item.createdAt = new Date().toISOString();
                item.isHidden = false;
                item.memo = item._parsedMemo || "";
                item.resume = item._parsedResume || "";
                item.customEvents = item._parsedCalendar || [];
                delete item._parsedMemo;
                delete item._parsedResume;
                delete item._parsedCalendar;
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
var queryRows = [
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
        
        // Hide row logically but keep in DOM if search-include-hidden is not checked
        const showHidden = document.getElementById('search-include-hidden');
        if (item.isHidden && (!showHidden || !showHidden.checked)) {
            tr.classList.add('is-hidden');
        }

        const tdCheckbox = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'merge-checkbox';
        cb.value = item.id;
        tdCheckbox.appendChild(cb);
        tr.appendChild(tdCheckbox);
        
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

    const selectAllCb = document.getElementById('merge-select-all');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => {
            document.querySelectorAll('.merge-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
    }
}

function processMetaData(dataList) {
    dataList.forEach(item => {
        if (!item._meta) item._meta = {}; 
        
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
    
    // Special Notes from AI extraction
    const specialNotes = [];
    if (item.memo !== undefined) {
        specialNotes.push({ id: 'special_memo', title: '💬 AI抽出メモ', content: item.memo, isSpecial: true, key: 'memo' });
    } else {
        // Fallback for older data
        specialNotes.push({ id: 'special_memo', title: '💬 AI抽出メモ', content: "", isSpecial: true, key: 'memo' });
    }
    
    if (item.resume !== undefined) {
        specialNotes.push({ id: 'special_resume', title: '📄 ES・履歴書', content: item.resume, isSpecial: true, key: 'resume' });
    } else {
        specialNotes.push({ id: 'special_resume', title: '📄 ES・履歴書', content: "", isSpecial: true, key: 'resume' });
    }

    const customNotes = (item._meta && item._meta.notes) ? item._meta.notes : [];
    const allNotes = [...specialNotes, ...customNotes];
    
    if (allNotes.length === 0) {
        list.innerHTML = "<p style='color:var(--text-color); opacity:0.6; font-size:0.85rem;'>ノートがありません。</p>";
        return;
    }
    
    allNotes.forEach((note) => {
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
        } else if (note.isSpecial) {
            btn.style.background = 'rgba(255, 255, 255, 0.1)';
            btn.style.border = '1px dashed var(--border-color)';
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
    const deleteBtn = document.getElementById('note-delete-btn');
    
    // Check for existing copy button
    let copyBtn = document.getElementById('note-copy-btn');
    if (!copyBtn) {
        copyBtn = document.createElement('button');
        copyBtn.id = 'note-copy-btn';
        copyBtn.className = 'btn text';
        copyBtn.textContent = '📋 コピー';
        copyBtn.style.color = 'var(--text-color)';
        const btnContainer = deleteBtn.parentElement;
        btnContainer.insertBefore(copyBtn, deleteBtn.nextSibling);
    }
    
    if (!note) {
        container.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    
    titleInput.value = note.title || "";
    contentInput.value = note.content || "";
    
    if (note.isSpecial) {
        titleInput.readOnly = true;
        titleInput.style.opacity = '0.7';
        deleteBtn.style.display = 'none'; // Cannot delete special notes
    } else {
        titleInput.readOnly = false;
        titleInput.style.opacity = '1';
        deleteBtn.style.display = 'block';
    }

    // Update copy button functionality
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(contentInput.value).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ コピー完了';
            setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        });
    };
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
        if (!item) return;
        
        const titleInput = document.getElementById('note-edit-title');
        const contentInput = document.getElementById('note-edit-content');
        
        if (currentNoteId === 'special_memo') {
            updateItemData(currentNoteCompanyId, { memo: contentInput.value });
            alert("抽出メモを保存しました！");
        } else if (currentNoteId === 'special_resume') {
            updateItemData(currentNoteCompanyId, { resume: contentInput.value });
            alert("ES・履歴書を保存しました！");
        } else {
            if (!item._meta || !item._meta.notes) return;
            const noteIdx = item._meta.notes.findIndex(n => n.id === currentNoteId);
            if (noteIdx !== -1) {
                item._meta.notes[noteIdx].title = titleInput.value.trim();
                item._meta.notes[noteIdx].content = contentInput.value;
                saveCurrentNotes(item._meta.notes);
                renderNotesSidebar(); // reflect title changes
                alert("ノートを保存しました！");
            }
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

// --- Account Screen Logic ---
const navDbBtn = document.getElementById('nav-db-btn');
const navAccountBtn = document.getElementById('nav-account-btn');
const dbSection = document.getElementById('db-section');
const accountSection = document.getElementById('account-section');

if (navDbBtn && navAccountBtn) {
    navDbBtn.addEventListener('click', () => {
        dbSection.style.display = 'block';
        accountSection.style.display = 'none';
        navDbBtn.style.background = 'rgba(255,255,255,0.1)';
        navAccountBtn.style.background = 'transparent';
    });
    navAccountBtn.addEventListener('click', () => {
        dbSection.style.display = 'none';
        accountSection.style.display = 'block';
        navAccountBtn.style.background = 'rgba(255,255,255,0.1)';
        navDbBtn.style.background = 'transparent';
        loadAccountData();
    });
}

let accountData = [];
const DEFAULT_ACCOUNT_FIELDS = [
    { title: "志望動機（なぜこの会社・職種なのか）", value: "", useForResume: true },
    { title: "自己PR（自分の強みやアピールポイント）", value: "", useForResume: true },
    { title: "将来のキャリアプラン（入社後に挑戦したいこと）", value: "", useForResume: true },
    { title: "これまでの職務経歴・実績（どのような成果を上げたか）", value: "", useForResume: true },
    { title: "活かせる経験・スキル・資格", value: "", useForResume: true },
    { title: "仕事で直面した困難とそれを乗り越えた方法", value: "", useForResume: true },
    { title: "自分の長所と短所", value: "", useForResume: true },
    { title: "仕事をする上で大切にしていること・こだわり", value: "", useForResume: true },
    { title: "趣味・特技", value: "", useForResume: false },
    { title: "本人希望記入欄（勤務地、職種、給与、勤務時間などの希望）", value: "", useForResume: false },
    { title: "現在の就職活動の状況・入社可能時期", value: "", useForResume: false }
];

async function loadAccountData() {
    let loadedCoreValues = "";
    if (auth && auth.currentUser) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid, "profile", "data");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                accountData = docSnap.data().fields || [];
                loadedCoreValues = docSnap.data().coreValues || "";
            } else {
                accountData = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_FIELDS));
            }
        } catch (e) {
            console.warn("Failed to load account data from Firebase:", e);
            loadLocalAccountData();
            return;
        }
    } else {
        loadLocalAccountData();
        return;
    }
    const cvEl = document.getElementById('account-core-values');
    if(cvEl) cvEl.value = loadedCoreValues;
    renderAccountFields();
}

function loadLocalAccountData() {
    const local = localStorage.getItem('accountData');
    if (local) {
        accountData = JSON.parse(local);
    } else {
        accountData = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_FIELDS));
    }
    const localCv = localStorage.getItem('accountCoreValues');
    const cvEl = document.getElementById('account-core-values');
    if(cvEl) cvEl.value = localCv || "";
    renderAccountFields();
}

function renderAccountFields() {
    const container = document.getElementById('account-fields-container');
    if (!container) return;
    container.innerHTML = '';
    
    accountData.forEach((field, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'input-group';
        const isChecked = field.useForResume !== false ? 'checked' : '';
        itemDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <input type="text" value="${field.title}" class="account-field-title" data-index="${index}" style="font-weight: bold; font-size: 1.1rem; border: none; background: transparent; color: var(--text-color); width: 60%; outline: none;" placeholder="項目のタイトル">
                <div style="display: flex; gap: 16px; align-items: center;">
                    <label style="font-size: 0.85rem; color: var(--primary); cursor: pointer;">
                        <input type="checkbox" class="account-field-use-for-resume" data-index="${index}" ${isChecked}> ES・履歴書に利用する
                    </label>
                    <button class="btn text account-field-delete-btn" data-index="${index}" style="color: var(--danger); padding: 4px;">✕ 削除</button>
                </div>
            </div>
            <textarea class="account-field-value" data-index="${index}" rows="4" placeholder="内容を入力..." style="width: 100%; border-radius: 8px; border: 1px solid var(--border-color); padding: 12px; background: rgba(255, 255, 255, 0.5);">${field.value}</textarea>
        `;
        container.appendChild(itemDiv);
    });
    
    document.querySelectorAll('.account-field-title').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            accountData[idx].title = e.target.value;
        });
    });
    document.querySelectorAll('.account-field-value').forEach(textarea => {
        textarea.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            accountData[idx].value = e.target.value;
        });
    });
    document.querySelectorAll('.account-field-use-for-resume').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            accountData[idx].useForResume = e.target.checked;
        });
    });
    document.querySelectorAll('.account-field-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (confirm("この項目を削除しますか？")) {
                accountData.splice(idx, 1);
                renderAccountFields();
            }
        });
    });
}

const addAccountFieldBtn = document.getElementById('add-account-field-btn');
if (addAccountFieldBtn) {
    addAccountFieldBtn.addEventListener('click', () => {
        accountData.push({ title: "新しい項目", value: "" });
        renderAccountFields();
    });
}

const saveAccountBtn = document.getElementById('save-account-btn');
if (saveAccountBtn) {
    saveAccountBtn.addEventListener('click', async () => {
        document.querySelectorAll('.account-field-title').forEach(input => {
            const idx = parseInt(input.dataset.index);
            accountData[idx].title = input.value;
        });
        document.querySelectorAll('.account-field-value').forEach(textarea => {
            const idx = parseInt(textarea.dataset.index);
            accountData[idx].value = textarea.value;
        });
        document.querySelectorAll('.account-field-use-for-resume').forEach(checkbox => {
            const idx = parseInt(checkbox.dataset.index);
            accountData[idx].useForResume = checkbox.checked;
        });
        
        saveAccountBtn.textContent = '保存中...';
        
        const coreValuesText = document.getElementById('account-core-values').value;
        if (auth && auth.currentUser) {
            try {
                await setDoc(doc(db, "users", auth.currentUser.uid, "profile", "data"), { fields: accountData, coreValues: coreValuesText });
            } catch (e) {
                console.warn("Failed to save to Firebase:", e);
                localStorage.setItem('accountData', JSON.stringify(accountData));
                localStorage.setItem('accountCoreValues', coreValuesText);
            }
        } else {
            localStorage.setItem('accountData', JSON.stringify(accountData));
            localStorage.setItem('accountCoreValues', coreValuesText);
        }
        
        saveAccountBtn.textContent = '保存しました！';
        setTimeout(() => saveAccountBtn.textContent = '保存', 2000);
    });
}

// --- Merge Logic ---
function getSelectedItems() {
    const checked = Array.from(document.querySelectorAll('.merge-checkbox:checked')).map(cb => cb.value);
    return currentData.filter(d => checked.includes(d.id));
}

async function executeMerge(mode) {
    const selected = getSelectedItems();
    if (selected.length < 2) {
        alert("合成するには2つ以上の行をチェックしてください！");
        return;
    }

    if (!confirm(`${selected.length}件の行を合成しますか？ (操作は元に戻せません)`)) return;

    // ソート順（新しい順に並べるなど）は現在の配列順を基準にする
    const baseItem = JSON.parse(JSON.stringify(selected[0])); 
    const otherItems = selected.slice(1);

    otherItems.forEach(item => {
        Object.keys(item).forEach(key => {
            if (key === 'id' || key === 'createdAt' || key === '_meta' || key === 'isHidden') return;

            if (!baseItem[key] || baseItem[key] === '-' || baseItem[key] === '未設定') {
                baseItem[key] = item[key];
            } else if (item[key] && item[key] !== '-' && item[key] !== '未設定') {
                if (mode === 'keep-new') {
                    // baseItemを「より新しく選択されたもの」とみなし、上書きしない（または上書きするロジック）
                    // ここではリストの上に表示されている方を「ベース(新)」として扱う。
                    // したがってすでに値があるならそのまま。
                } else if (mode === 'keep-old') {
                    // 下にある方(old)を優先するなら上書き
                    baseItem[key] = item[key];
                } else if (mode === 'concat') {
                    // 値が異なる場合のみ結合
                    if (baseItem[key] !== item[key]) {
                        baseItem[key] = baseItem[key] + '\n' + item[key];
                    }
                }
            }
        });
        
        // メモの合成
        if (item.memo) {
            if (!baseItem.memo) baseItem.memo = item.memo;
            else if (mode === 'concat' && baseItem.memo !== item.memo) baseItem.memo += '\n' + item.memo;
            else if (mode === 'keep-old') baseItem.memo = item.memo;
        }
    });

    // 1件目に合成結果を保存し、2件目以降を削除する
    await updateItemData(baseItem.id, baseItem);
    for (const item of otherItems) {
        await deleteItemData(item.id); // 削除
    }

    // チェックを外す
    document.querySelectorAll('.merge-checkbox').forEach(cb => cb.checked = false);
    const selectAllCb = document.getElementById('merge-select-all');
    if (selectAllCb) selectAllCb.checked = false;
    
    alert("合成が完了しました！");
}

const mergeKeepNewBtn = document.getElementById('merge-keep-new-btn');
if (mergeKeepNewBtn) mergeKeepNewBtn.addEventListener('click', () => executeMerge('keep-new'));

const mergeKeepOldBtn = document.getElementById('merge-keep-old-btn');
if (mergeKeepOldBtn) mergeKeepOldBtn.addEventListener('click', () => executeMerge('keep-old'));

const mergeConcatBtn = document.getElementById('merge-concat-btn');
if (mergeConcatBtn) mergeConcatBtn.addEventListener('click', () => executeMerge('concat'));
