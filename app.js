import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "firebase/auth";
import { 
    collection, addDoc, getDocs, getDoc, setDoc, onSnapshot, deleteDoc, doc, updateDoc, writeBatch
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
const cloudSyncBtn = document.getElementById('cloud-sync-btn');

// --- Sync & Tracker State ---
let hasUnsavedChanges = false;
let deletedCompanyIds = []; // 削除されたIDをトラッキング
let deletedCalendarIds = []; // 削除されたカレンダーID

function trackFirebaseUsage(type, count) {
    if (type === 'read') {
        let reads = parseInt(localStorage.getItem('firebaseReadCount') || '0', 10);
        reads += count;
        localStorage.setItem('firebaseReadCount', reads);
        console.log(`[Firebase Usage] 🔥 READ +${count} (Total: ${reads})`);
    } else if (type === 'write') {
        let writes = parseInt(localStorage.getItem('firebaseWriteCount') || '0', 10);
        writes += count;
        localStorage.setItem('firebaseWriteCount', writes);
        console.log(`[Firebase Usage] ✍️ WRITE +${count} (Total: ${writes})`);
    }
}

function markUnsavedChanges() {
    hasUnsavedChanges = true;
    if (cloudSyncBtn) {
        cloudSyncBtn.classList.remove('secondary');
        cloudSyncBtn.classList.add('primary');
        cloudSyncBtn.style.background = 'var(--danger)';
        cloudSyncBtn.style.color = '#fff';
        cloudSyncBtn.textContent = '☁️ クラウドへ保存 (未保存)';
    }
}

function clearUnsavedChanges() {
    hasUnsavedChanges = false;
    deletedCompanyIds = []; 
    deletedCalendarIds = [];
    mockData.forEach(d => delete d._isDirty); 
    mockCalendarData.forEach(d => delete d._isDirty);
    if (cloudSyncBtn) {
        cloudSyncBtn.classList.remove('primary');
        cloudSyncBtn.classList.add('secondary');
        cloudSyncBtn.style.background = '';
        cloudSyncBtn.style.color = '';
        cloudSyncBtn.textContent = '☁️ クラウドへ保存';
    }
}

if (cloudSyncBtn) {
    cloudSyncBtn.addEventListener('click', async () => {
        if (!auth || !auth.currentUser) {
            alert("クラウド保存はログイン時のみ有効です。");
            return;
        }
        if (!hasUnsavedChanges) {
            alert("保存する変更がありません。");
            return;
        }
        await syncToCloud();
    });
}

function backupCurrentState() {
    localStorage.setItem('backupData', JSON.stringify(mockData));
    localStorage.setItem('backupCalendarData', JSON.stringify(mockCalendarData));
}

function rollbackChanges() {
    const bData = localStorage.getItem('backupData');
    if (bData) mockData = JSON.parse(bData);
    const bCal = localStorage.getItem('backupCalendarData');
    if (bCal) mockCalendarData = JSON.parse(bCal);

    localStorage.setItem('mockData', JSON.stringify(mockData));
    localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));

    clearUnsavedChanges();

    const modal = document.getElementById('auto-save-modal');
    if (modal) modal.style.display = 'none';

    // UIを再描画
    const dataCopy = [...mockData];
    processMetaData(dataCopy);
    currentData = dataCopy;
    renderQuickTags(currentData);
    updateCalendarEvents();
    renderQueryBuilder();
    applyFiltersAndRender();
    
    alert("変更を破棄して以前の状態に戻しました。");
}

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '変更が保存されていません。このページを離れますか？';
        
        // ダイアログ中はJSが停止するため、キャンセルされた直後に発火する
        setTimeout(() => {
            const modal = document.getElementById('auto-save-modal');
            if (modal && hasUnsavedChanges) {
                modal.style.display = 'flex';
                syncToCloud();
            }
        }, 100);
    }
});

const rollbackBtn = document.getElementById('rollback-discard-btn');
if (rollbackBtn) {
    rollbackBtn.addEventListener('click', rollbackChanges);
}

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
console.log("【就活メモ】 アプリバージョン: v1.8.2 (2026-06-28 エラーログ非表示・キュー制御改善版)");

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
let customColumnSettings = { order: [], widths: {} };

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
if (excelModeBtn) {
    excelModeBtn.addEventListener('click', toggleExcelMode);
}

if (toggleCalendarBtn) {
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
}

const closeCalendarBtn = document.getElementById('close-calendar-btn');
if (closeCalendarBtn) {
    closeCalendarBtn.addEventListener('click', () => {
        calendarSection.style.display = 'none';
        toggleCalendarBtn.textContent = '📅 カレンダー表示';
    });
}

// --- Calendar Logic ---
let currentEditingEventId = null;
let currentCompanyId = null;
let isCurrentCompanyEvent = false;
let currentOriginalEventType = null;

const calendarModal = document.getElementById('calendar-edit-modal');
const calendarModalInputTitle = document.getElementById('calendar-modal-input-title');
const calendarModalInputType = document.getElementById('calendar-modal-input-type');
const calendarModalInputDate = document.getElementById('calendar-modal-input-date');
const calendarModalInputMemo = document.getElementById('calendar-modal-input-memo');
const calendarModalDeleteBtn = document.getElementById('calendar-modal-delete-btn');
const calendarModalCompleteBtn = document.getElementById('calendar-modal-complete-btn');
const calendarModalJumpBtn = document.getElementById('calendar-modal-jump-btn');
const calendarModalSaveBtn = document.getElementById('calendar-modal-save-btn');
const calendarModalInputEndDate = document.getElementById('calendar-modal-input-end-date');
const calendarModalGcalBtn = document.getElementById('calendar-modal-gcal-btn');

function openCalendarModal(dateStr, title = "", eventId = null, memo = "", type = "面接", endDate = "", isCompleted = false, companyId = null, isCompanyEvent = false) {
    currentEditingEventId = eventId;
    currentCompanyId = companyId;
    isCurrentCompanyEvent = isCompanyEvent;
    currentOriginalEventType = type;

    calendarModalInputTitle.value = title;
    calendarModalInputDate.value = dateStr;
    if (calendarModalInputEndDate) calendarModalInputEndDate.value = endDate || "";
    calendarModalInputMemo.value = memo;
    if (calendarModalInputType) calendarModalInputType.value = type;
    if (calendarModalDeleteBtn) calendarModalDeleteBtn.style.display = eventId ? 'block' : 'none';
    if (calendarModalCompleteBtn) calendarModalCompleteBtn.style.display = eventId ? 'block' : 'none';
    if (calendarModalGcalBtn) calendarModalGcalBtn.style.display = 'block';
    
    if (calendarModalJumpBtn) {
        if (isCompanyEvent && companyId) {
            calendarModalJumpBtn.style.display = 'block';
            calendarModalJumpBtn.onclick = () => {
                calendarModal.style.display = 'none';
                openNotesModal(companyId);
            };
        } else {
            calendarModalJumpBtn.style.display = 'none';
        }
    }
    
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

if (calendarModalGcalBtn) {
    calendarModalGcalBtn.addEventListener('click', () => {
        const title = calendarModalInputTitle.value.trim() || '無題の予定';
        const dateStr = calendarModalInputDate.value;
        const endDateStr = calendarModalInputEndDate ? calendarModalInputEndDate.value : "";
        const memo = calendarModalInputMemo.value.trim();
        
        if (!dateStr) {
            alert('日付が設定されていません');
            return;
        }
        
        const formatGCalDate = (d) => d.replace(/-/g, '');
        const startDate = formatGCalDate(dateStr);
        let endDate = startDate;
        
        if (endDateStr) {
            const endD = new Date(endDateStr);
            endD.setDate(endD.getDate() + 1);
            endDate = endD.toISOString().split('T')[0].replace(/-/g, '');
        } else {
            const endD = new Date(dateStr);
            endD.setDate(endD.getDate() + 1);
            endDate = endD.toISOString().split('T')[0].replace(/-/g, '');
        }

        const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(memo)}`;
        window.open(gcalUrl, '_blank');
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

    if (currentEditingEventId || isCurrentCompanyEvent) {
        if (isCurrentCompanyEvent && currentCompanyId) {
            const item = mockData.find(d => d.id === currentCompanyId);
            if (item) {
                if (currentOriginalEventType === "締切") {
                    if (!item._meta) item._meta = {};
                    item._meta.deadline = dateStr;
                } else {
                    if (!item.customEvents) item.customEvents = [];
                    // idがない場合はイベントIDで検索するか、typeとdateで検索
                    const targetIdStr = currentEditingEventId ? currentEditingEventId.replace(`${currentCompanyId}_`, '') : '';
                    let cEv = item.customEvents.find(e => `${e.type}_${e.date}` === targetIdStr);
                    if (cEv) {
                        cEv.type = typeVal;
                        cEv.date = dateStr;
                    } else {
                        // 見つからない場合は追加？ あるいは新規作成？
                        // 新規にセット
                        item.customEvents.push({
                            id: Date.now() + Math.random().toString(36).substr(2, 9),
                            type: typeVal,
                            date: dateStr,
                            isCustomEvent: true
                        });
                    }
                }
                item.memo = memo; // メモも同期する場合
                updateItemData(currentCompanyId, item);
            }
            calendarModal.style.display = 'none';
            return;
        }

        // Edit existing standalone calendar event
        const item = mockCalendarData.find(d => d.id === currentEditingEventId);
        if (item) {
            item.title = title;
            item.type = typeVal;
            item.memo = memo;
            item.date = dateStr;
            item.endDate = endDateStr;
            item.isCompleted = isCompleted;
            item._isDirty = true;
            localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
            markUnsavedChanges();
            updateCalendarEvents();
        }
    } else {
        // Add new
        const newItem = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            title: title,
            type: typeVal,
            date: dateStr,
            endDate: endDateStr,
            isCompleted: isCompleted,
            createdAt: new Date().toISOString(),
            memo: memo,
            _isDirty: true
        };
        mockCalendarData.push(newItem);
        localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
        markUnsavedChanges();
        updateCalendarEvents();
    }
    calendarModal.style.display = 'none';
});

calendarModalDeleteBtn.addEventListener('click', async () => {
    if (!currentEditingEventId && !isCurrentCompanyEvent) return;
    if (!confirm("この予定を削除しますか？")) return;

    if (isCurrentCompanyEvent && currentCompanyId) {
        const item = mockData.find(d => d.id === currentCompanyId);
        if (item) {
            if (currentOriginalEventType === "締切") {
                if (item._meta) item._meta.deadline = "";
            } else {
                if (item.customEvents) {
                    const targetIdStr = currentEditingEventId ? currentEditingEventId.replace(`${currentCompanyId}_`, '') : '';
                    item.customEvents = item.customEvents.filter(e => `${e.type}_${e.date}` !== targetIdStr);
                }
            }
            updateItemData(currentCompanyId, item);
        }
        calendarModal.style.display = 'none';
        return;
    }

    mockCalendarData = mockCalendarData.filter(d => d.id !== currentEditingEventId);
    deletedCalendarIds.push(currentEditingEventId);
    localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
    markUnsavedChanges();
    updateCalendarEvents();

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
            const memo = ev.extendedProps.memo || "";
            const rawTitle = ev.extendedProps.rawTitle || ev.title;
            const type = ev.extendedProps.type || "面接";
            const endDate = ev.extendedProps.endDate || "";
            const isCompleted = ev.extendedProps.isCompleted || false;
            const isCompanyEvent = ev.extendedProps.isCompanyEvent || false;
            const companyId = ev.extendedProps.companyId || null;
            openCalendarModal(ev.startStr, rawTitle, ev.id, memo, type, endDate, isCompleted, companyId, isCompanyEvent);
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
                    isCompanyEvent: true,
                    companyId: item.id
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
                        isCompanyEvent: true,
                        companyId: item.id
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
        let importedCount = 0;
        const promises = snapshot.docChanges().map(async (change) => {
            if (change.type === "added") {
                const docData = change.doc.data();
                if (docData.status === "pending" && docData.rawText) {
                    try {
                        const parsedData = parseMarkdownTable(docData.rawText);
                        const colRef = collection(db, "users", auth.currentUser.uid, "companies");
                        for (const item of parsedData) {
                            const companyName = item["企業名"];
                            let existingItem = null;
                            if (companyName) {
                                existingItem = currentData.find(d => d["企業名"] === companyName);
                            }

                            const newMemo = item._parsedMemo || "";
                            const newResume = item._parsedResume || "";
                            const newCustomEvents = item._parsedCalendar || [];
                            
                            delete item._parsedMemo;
                            delete item._parsedResume;
                            delete item._parsedCalendar;

                            if (existingItem && existingItem.id) {
                                // Update existing document
                                const docRef = doc(db, "users", auth.currentUser.uid, "companies", existingItem.id);
                                const updates = {};
                                
                                // Merge memo
                                if (newMemo) {
                                    updates.memo = existingItem.memo ? existingItem.memo + "\n\n" + newMemo : newMemo;
                                }
                                
                                // Merge calendar
                                if (newCustomEvents.length > 0) {
                                    updates.customEvents = [...(existingItem.customEvents || []), ...newCustomEvents];
                                }
                                
                                // Merge any valid string fields that are not "不明" or empty, if the existing one is empty or "不明"
                                Object.keys(item).forEach(key => {
                                    if (key !== "id" && key !== "createdAt" && key !== "isHidden" && key !== "memo" && key !== "resume" && key !== "customEvents") {
                                        const newVal = item[key];
                                        if (newVal && newVal !== "不明" && newVal !== "-" && newVal.trim() !== "") {
                                            const oldVal = existingItem[key];
                                            if (!oldVal || oldVal === "不明" || oldVal === "-" || oldVal.trim() === "") {
                                                updates[key] = newVal;
                                            }
                                        }
                                    }
                                });

                                if (Object.keys(updates).length > 0) {
                                    await updateDoc(docRef, updates);
                                }
                            } else {
                                // Create new document
                                item.createdAt = new Date().toISOString();
                                item.isHidden = false;
                                item.memo = newMemo;
                                item.resume = newResume;
                                item.customEvents = newCustomEvents;
                                await addDoc(colRef, item);
                            }
                        }
                        if (parsedData.length > 0) {
                            importedCount++;
                        }
                        await deleteDoc(doc(db, "users", auth.currentUser.uid, "importQueue", change.doc.id));
                    } catch (e) {
                        console.error("Failed to parse import queue item:", e);
                        console.error("【AIの出力内容（RAW）】\n", docData.rawText);
                        await updateDoc(doc(db, "users", auth.currentUser.uid, "importQueue", change.doc.id), { status: "error", error: e.message });
                    }
                }
            }
        });

        await Promise.all(promises);
        if (importedCount > 0) {
            alert(`Makeからの自動連携データを ${importedCount} 件 新しく取り込みました！`);
        }
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
                await setDoc(docRef, { data: dataStr }, { merge: true });
            } catch (e) {
                console.warn("Failed to save formatArchives:", e);
            }
        }
    }, 1000);
}

window.openFormatArchiveModal = function() {
    renderFormatArchives();
    document.getElementById('format-archive-modal').style.display = 'flex';
};

let columnSettingsSaveTimeout;
function saveColumnSettingsAsync() {
    clearTimeout(columnSettingsSaveTimeout);
    columnSettingsSaveTimeout = setTimeout(async () => {
        const dataStr = JSON.stringify(customColumnSettings);
        localStorage.setItem('customColumnSettings', dataStr);
        if (auth && auth.currentUser) {
            try {
                const docRef = doc(db, "users", auth.currentUser.uid, "settings", "customColumnSettings");
                await setDoc(docRef, { data: dataStr }, { merge: true });
            } catch (e) {
                console.warn("Failed to save customColumnSettings:", e);
            }
        }
    }, 1000);
}

window.openViewSettingsModal = function() {
    renderColumnSettingsList();
    document.getElementById('view-settings-modal').style.display = 'flex';
};

function renderColumnSettingsList() {
    const list = document.getElementById('column-settings-list');
    if (!list) return;
    list.innerHTML = '';

    // headersは現在の表示列から取得（非表示設定なども加味したいが、まずは全データ中のユニークな列）
    const ignoreHeaders = ['id', 'createdAt', 'userId', 'isHidden', 'memo', 'resume', 'customEvents', '_meta', 'アクション'];
    const headerSet = new Set();
    currentData.forEach(item => {
        if (item._meta && item._meta.isCustomEvent) return;
        Object.keys(item).forEach(k => {
            const cleanK = k.trim();
            if (!cleanK || ignoreHeaders.includes(cleanK) || /^[-:\s]+$/.test(cleanK)) return;
            headerSet.add(cleanK);
        });
    });

    let builderHeaders = formatBuilderData
        .filter(d => d && d.name && d.name.trim() !== "")
        .map(d => d.name.trim());
    
    let activeHeaders = builderHeaders.filter(h => headerSet.has(h));
    let extraHeaders = Array.from(headerSet).filter(h => !builderHeaders.includes(h));
    let dynamicHeaders = [...activeHeaders, ...extraHeaders];

    if (customColumnSettings.order && customColumnSettings.order.length > 0) {
        const sorted = [];
        customColumnSettings.order.forEach(h => {
            if (dynamicHeaders.includes(h)) sorted.push(h);
        });
        const remaining = dynamicHeaders.filter(h => !sorted.includes(h));
        dynamicHeaders = [...sorted, ...remaining];
    }

    dynamicHeaders.forEach((h, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.gap = '8px';
        itemDiv.style.padding = '4px 8px';
        itemDiv.style.background = 'var(--bg-alt)';
        itemDiv.style.border = '1px solid var(--border-color)';
        itemDiv.style.borderRadius = '4px';

        const upBtn = document.createElement('button');
        upBtn.innerHTML = '&#9650;';
        upBtn.className = 'icon-btn';
        upBtn.style.fontSize = '0.7rem';
        upBtn.disabled = index === 0;
        upBtn.onclick = () => {
            if (index > 0) {
                const temp = dynamicHeaders[index];
                dynamicHeaders[index] = dynamicHeaders[index - 1];
                dynamicHeaders[index - 1] = temp;
                customColumnSettings.order = dynamicHeaders;
                saveColumnSettingsAsync();
                renderTable(currentData);
                renderColumnSettingsList();
            }
        };

        const downBtn = document.createElement('button');
        downBtn.innerHTML = '&#9660;';
        downBtn.className = 'icon-btn';
        downBtn.style.fontSize = '0.7rem';
        downBtn.disabled = index === dynamicHeaders.length - 1;
        downBtn.onclick = () => {
            if (index < dynamicHeaders.length - 1) {
                const temp = dynamicHeaders[index];
                dynamicHeaders[index] = dynamicHeaders[index + 1];
                dynamicHeaders[index + 1] = temp;
                customColumnSettings.order = dynamicHeaders;
                saveColumnSettingsAsync();
                renderTable(currentData);
                renderColumnSettingsList();
            }
        };

        const nameLabel = document.createElement('span');
        nameLabel.textContent = h;
        nameLabel.style.flex = "1";
        nameLabel.style.fontSize = "0.85rem";
        nameLabel.style.overflow = "hidden";
        nameLabel.style.textOverflow = "ellipsis";
        nameLabel.style.whiteSpace = "nowrap";

        const widthInput = document.createElement('input');
        widthInput.type = 'number';
        widthInput.className = 'glass-input';
        widthInput.style.width = '60px';
        widthInput.style.padding = '2px 4px';
        widthInput.style.fontSize = '0.85rem';
        widthInput.placeholder = '自動';
        widthInput.title = '最小幅(文字数/em)。0を指定すると自動幅計算になります。';
        widthInput.value = (customColumnSettings.widths && customColumnSettings.widths[h]) ? customColumnSettings.widths[h] : 0;
        
        widthInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 0;
            if (!customColumnSettings.widths) customColumnSettings.widths = {};
            if (val > 0) {
                customColumnSettings.widths[h] = val;
            } else {
                delete customColumnSettings.widths[h];
            }
            saveColumnSettingsAsync();
            renderTable(currentData);
        });

        itemDiv.appendChild(upBtn);
        itemDiv.appendChild(downBtn);
        itemDiv.appendChild(nameLabel);
        itemDiv.appendChild(widthInput);
        
        list.appendChild(itemDiv);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const globalEsToggle = document.getElementById('global-es-toggle');
    if (globalEsToggle) {
        const savedEsToggle = localStorage.getItem('isEsEnabled');
        if (savedEsToggle !== null) {
            globalEsToggle.checked = savedEsToggle === 'true';
        }
        globalEsToggle.addEventListener('change', (e) => {
            localStorage.setItem('isEsEnabled', e.target.checked);
        });
    }
    
    // API settings initialization
    const apiEsToggle = document.getElementById('api-es-toggle');
    if (apiEsToggle) {
        const savedApiEsToggle = localStorage.getItem('apiEsEnabled');
        if (savedApiEsToggle !== null) {
            apiEsToggle.checked = savedApiEsToggle === 'true';
        }
    }
    // Note: apiFormatSelect value is restored inside renderFormatArchives() after the options are populated.
    renderFormatArchives();
    const resetBtn = document.getElementById('reset-column-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("列の並び順と幅を初期状態（自動計算）にリセットしますか？")) {
                customColumnSettings = { order: [], widths: {} };
                saveColumnSettingsAsync();
                renderTable(currentData);
                renderColumnSettingsList();
            }
        });
    }
});

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

    const apiSelect = document.getElementById('api-format-select');
    if (apiSelect) {
        const currentVal = apiSelect.value || localStorage.getItem('apiFormatId');
        apiSelect.innerHTML = '<option value="">アーカイブから選択してください...</option>';
        formatArchives.filter(arch => arch.type === "profile").forEach(arch => {
            const opt = document.createElement('option');
            opt.value = arch.id;
            opt.textContent = arch.name;
            apiSelect.appendChild(opt);
        });
        if (currentVal && Array.from(apiSelect.options).some(o => o.value === currentVal)) {
            apiSelect.value = currentVal;
            try {
                const savedCheckedItems = JSON.parse(localStorage.getItem('apiReinvestigateItems') || '[]');
                renderReinvestigateCheckboxes(currentVal, savedCheckedItems);
            } catch(e) {}
        }
    }
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

        const upBtn = document.createElement('button');
        upBtn.innerHTML = '&#9650;';
        upBtn.className = 'icon-btn';
        upBtn.style.fontSize = '0.7rem';
        upBtn.title = '上に移動';
        upBtn.disabled = index === 0;
        upBtn.addEventListener('click', () => {
            if (index > 0) {
                const temp = formatBuilderData[index];
                formatBuilderData[index] = formatBuilderData[index - 1];
                formatBuilderData[index - 1] = temp;
                renderFormatBuilder();
                saveFormatBuilderDataAsync();
            }
        });

        const downBtn = document.createElement('button');
        downBtn.innerHTML = '&#9660;';
        downBtn.className = 'icon-btn';
        downBtn.style.fontSize = '0.7rem';
        downBtn.title = '下に移動';
        downBtn.disabled = index === formatBuilderData.length - 1;
        downBtn.addEventListener('click', () => {
            if (index < formatBuilderData.length - 1) {
                const temp = formatBuilderData[index];
                formatBuilderData[index] = formatBuilderData[index + 1];
                formatBuilderData[index + 1] = temp;
                renderFormatBuilder();
                saveFormatBuilderDataAsync();
            }
        });

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = "項目名 (例: 志望度)";
        nameInput.value = item.name;
        nameInput.style.flex = "1";
        nameInput.style.padding = "6px";
        nameInput.addEventListener('input', (e) => { item.name = e.target.value; saveFormatBuilderDataAsync(); });

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

        topRow.appendChild(upBtn);
        topRow.appendChild(downBtn);
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
                if (d.id === "customColumnSettings" && d.data().data) {
                    customColumnSettings = JSON.parse(d.data().data);
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

        const savedCols = localStorage.getItem('customColumnSettings');
        if (savedCols) customColumnSettings = JSON.parse(savedCols);
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
    renderFormatArchives();
}

function saveCalendarEventTypes() {
    const dataStr = JSON.stringify(calendarEventTypes);
    if (auth && auth.currentUser) {
        const docRef = doc(db, "users", auth.currentUser.uid, "settings", "calendarEventTypes");
        setDoc(docRef, { data: dataStr }, { merge: true }).catch(e => console.warn(e));
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

// --- Format Generator Helper ---
function buildPromptString(itemsList, esEnabled, isApiMode = false, checkedItems = []) {
    let prompt = `【システム動作指定（絶対厳守）】\nあなたはユーザーの入力データを特定のフォーマットに変換して出力するシステムです。以下のルールに一つでも違反した場合、データ取り込みが失敗しシステムがクラッシュします。必ず以下の制約を100%遵守して回答を生成してください。\n\n`;
    
    prompt += `【最重要ルール: 無効データの除外と統合】\n`;
    prompt += `1. 提供されたテキストが企業からのスカウトメールや採用関連のメッセージではない場合（例：単なるおすすめ求人配信、リクナビNEXT等の自動送信メルマガ、スパムメール、登録完了通知など）は、絶対に表の行を作成せず、ただ一言「無効なスカウトメール」とだけ出力してください。\n`;
    prompt += `2. 提供されたテキストの中に「同一企業からの複数のメール内容（例：○○株式会社の面接案内と、同じく○○株式会社の締切案内）」が混ざっている場合、出力行を複数に分けず、必ず「1つの企業（1行）」として情報を統合し、すべての内容を1つの行（やメモ内）にまとめて出力してください。\n`;
    prompt += `3. 各項目の情報（特に初任給、残業時間、休日数などの数値）がメールや調査で「分からない・記載がない」場合は、絶対に「0」や空欄で誤魔化さず、必ず「不明」と出力してください。\n\n`;

    const coreValuesEl = document.getElementById('account-core-values');
    const coreValuesText = coreValuesEl ? coreValuesEl.value.trim() : "";
    const validAccountData = typeof accountData !== 'undefined' ? accountData.filter(a => a.title && a.value && a.value.trim() !== "") : [];
    
    if (coreValuesText || validAccountData.length > 0) {
        prompt += `【ユーザーの基本情報・就活の軸】\n以下の情報を参考に、企業ごとにパーソナライズした調査や添削（リライト）を行ってください。\n\n`;
        if (coreValuesText) {
            prompt += `- 就活の軸 (絶対に譲れないこと等):\n${coreValuesText}\n\n`;
        }
        validAccountData.forEach(a => {
            prompt += `- ${a.title}:\n${a.value}\n\n`;
        });
    }

    prompt += `【抽出項目と個別ルール】\n以下の項目順に、企業情報を調査・整理してください。各項目のルールはシステム要件につき【必ず】実行してください。\n- 企業名\n`;

    let varCount = 1;
    itemsList.forEach(item => {
        prompt += `- ${item.name}\n`;
        if (item.description) {
            prompt += `  (説明: ${item.description})\n`;
        }
        
        if (item.attributes && item.attributes.length > 0) {
            item.attributes.forEach(attr => {
                if (attr.type === "hashtag") {
                    const ruleVal = attr.val ? attr.val : "重要なキーワードには「#IT」「#BtoB」のように";
                    prompt += `  [厳守] ${ruleVal}ハッシュタグを付けてください。\n`;
                } else if (attr.type === "color" && attr.condition) {
                    prompt += `  [厳守: 色付け] 「${attr.condition}」に該当する場合、必ずセルの内容の末尾に「 [[color:${attr.color}]] 」というタグを含めてください。※HTMLコメントではなく必ず二重角括弧を使用すること。\n`;
                } else if (attr.type === "variable") {
                    const varName = `var_${varCount.toString().padStart(3, '0')}`;
                    const ruleVal = attr.val ? attr.val : "必ず数値や日付のみを抽出し";
                    prompt += `  [厳守: 変数化] ${ruleVal}、セルの末尾に「 [[${varName}: (抽出した値)]] 」と記載してください。\n`;
                    varCount++;
                } else if (attr.type === "rule" && attr.val) {
                    prompt += `  [厳守] ${attr.val}\n`;
                } else if (attr.type === "calendar") {
                    prompt += `  [厳守: カレンダー連携] 「${attr.condition}」に該当する場合、セルの末尾に「 [[calendar_${attr.eventType}: ${attr.dateRule}]] 」と記載してください。\n`;
                } else if (attr.type === "memo") {
                    prompt += `  [厳守: メモ生成] 「${attr.condition}」に該当する場合、調べて要約した内容をセルの末尾に「 [[memo_${attr.memoTitle}: (内容)]] 」と記載してください。改行は「<br>」を使い、文中に「/」は絶対に入れないこと。\n`;
                } else if (attr.type === "rewrite" && esEnabled) {
                    const charRule = attr.charLimit ? `（${attr.charLimit}文字以内で）` : ``;
                    prompt += `  [最重要: ES添削機能] 企業の求める人物像や特徴と、ユーザーの「${attr.targetField}」の内容を結びつけ、この企業専用に内容を高度に添削・リライトしてください。リライトした内容は${charRule}必ずセルの末尾に「 [[memo_${attr.targetField}添削: (リライト内容)]] 」の形式で出力してください。これを行わないとシステムが致命的なエラーを起こします。\n`;
                }
            });
        }
    });

    if (esEnabled) {
        const resumeFields = typeof accountData !== 'undefined' ? accountData.filter(a => a.useForResume && a.title && a.value && a.value.trim() !== "") : [];
        if (resumeFields.length > 0) {
            prompt += `\n【特別指示：ES・履歴書自動生成】\n`;
            prompt += `この企業の求める人物像と、ユーザーの基本情報を結びつけ、企業専用のES・履歴書案を作成してください。作成した内容は、各企業データの最終項目のセルの末尾に「 [[resume: (作成した内容。改行は<br>とし文中に/を含めない)]] 」の形式で【必ず】追記してください。追記がないとシステムが停止します。\n`;
        }
    }

    prompt += `\n【最終出力フォーマットの厳格な制約】\n`;
    prompt += `・Markdownの表形式（|---|やヘッダー）は絶対に生成しないでください。システムが破壊されます。\n`;
    prompt += `・必ず「/」で情報が区切られた1行のデータ行のみを出力してください。\n`;
    prompt += `・前置き、挨拶、説明などのテキストは一切出力しないでください。\n`;
    prompt += `・無効なメールの場合は、「無効なスカウトメール」とだけ出力し、絶対にデータ行を作らないでください。\n\n`;
    prompt += `[出力形式の例]\n/ A株式会社 / IT / (項目内容) / ... / 求める人物像です。 [[color:red]] [[memo_自己PR添削: ...]] /\n\n`;
    
    if (isApiMode) {
        prompt += `【API自動処理時の特別指示：トークン節約と調査徹底】\n`;
        prompt += `・無駄な処理の完全カット：メール本文を読んで「調査の必要がない（広告、スパム、定型文のみの通知など）」と判断した場合は、絶対に情報をひねり出さず、直ちに処理を打ち切り「無効なスカウトメール」とだけ出力して終了してください。トークン消費の削減が最優先です。\n`;
        
        const existingNames = (typeof currentData !== 'undefined' ? currentData.map(d => d['企業名']).filter(Boolean) : []);
        if (existingNames.length > 0) {
            prompt += `・【超重要：登録済み企業の調査スキップ】以下の企業は既にデータベースに登録済みです：\n[ ${existingNames.join(', ')} ]\n`;
            prompt += `受信したメールが上記の「登録済み企業」からのものである場合、初任給や職種などの「基本的な企業情報の調査」はトークンの無駄になるため一切行わず、該当する項目はすべて「不明」として出力してください。ただし、メール内に記載されている「新しい締め切り日」「選考ステップの進行」「重要なお知らせ」がある場合のみ、それらを該当項目やメモ欄に抽出して出力してください。（システム側で自動的に既存データと結合・追記します）\n`;
            if (checkedItems && checkedItems.length > 0) {
                prompt += `・【例外：既存企業でも毎回再調査する項目】上記の「登録済み企業」からのメールであっても、以下の項目だけは例外的に毎回必ず最新情報を調査・抽出して出力してください：\n[ ${checkedItems.join(', ')} ]\n`;
            }
        }

        prompt += `・質の高い自律調査：上記に該当しない新規の有効な企業であると判断した場合は、単にメールの内容をコピペ・要約するだけではなく、自身の知識ベース（あるいは利用可能なウェブ検索）をフル活用して「しっかり自分で調査」し、充実した内容を出力してください。\n\n`;
    }
    
    prompt += `それでは、上記の指示を100%遵守し、データ行のみを出力してください。`;
    return prompt;
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
    
    const globalEsToggle = document.getElementById('global-es-toggle');
    const isEsEnabled = globalEsToggle ? globalEsToggle.checked : false;
    const prompt = buildPromptString(formatBuilderData, isEsEnabled);
    
    formatOutput.value = prompt;

});

// --- API Integration Logic ---
const saveApiSettingsBtn = document.getElementById('save-api-settings-btn');
const apiFormatSelect = document.getElementById('api-format-select');
const apiEsToggle = document.getElementById('api-es-toggle');
const apiSettingsStatus = document.getElementById('api-settings-status');

function renderReinvestigateCheckboxes(formatId, savedCheckedItems = []) {
    const container = document.getElementById('api-reinvestigate-container');
    const list = document.getElementById('api-reinvestigate-list');
    if (!container || !list) return;

    const selectedArch = formatArchives.find(arch => String(arch.id) === String(formatId));
    if (!selectedArch || selectedArch.type !== "profile" || !selectedArch.data) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = '';
    
    selectedArch.data.forEach(item => {
        if (!item.name || item.name.trim() === '') return;
        
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '4px';
        label.style.fontSize = '0.85rem';
        label.style.cursor = 'pointer';
        label.style.background = 'rgba(255,255,255,0.8)';
        label.style.padding = '4px 8px';
        label.style.borderRadius = '4px';
        label.style.border = '1px solid var(--border-color)';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'reinvestigate-cb';
        cb.value = item.name.trim();
        if (savedCheckedItems.includes(item.name.trim())) {
            cb.checked = true;
        }
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(item.name.trim()));
        list.appendChild(label);
    });
}

if (apiFormatSelect) {
    apiFormatSelect.addEventListener('change', (e) => {
        renderReinvestigateCheckboxes(e.target.value);
    });
}

if (saveApiSettingsBtn) {
    saveApiSettingsBtn.addEventListener('click', async () => {
        const selectedFormatId = apiFormatSelect ? apiFormatSelect.value : null;
        if (!selectedFormatId) {
            alert("APIで使用するフォーマットをアーカイブから選択してください。");
            return;
        }

        const selectedArch = formatArchives.find(arch => String(arch.id) === String(selectedFormatId));
        if (!selectedArch || selectedArch.type !== "profile") {
            alert("有効なフォーマット全体設計図が選択されていません。");
            return;
        }

        const isEsEnabled = apiEsToggle ? apiEsToggle.checked : false;
        
        const checkedItems = [];
        document.querySelectorAll('.reinvestigate-cb:checked').forEach(cb => {
            checkedItems.push(cb.value);
        });
        
        // 選択されたフォーマットデータからプロンプトを生成
        const prompt = buildPromptString(selectedArch.data, isEsEnabled, true, checkedItems);

        // API用にFirebaseへ保存
        if (auth && auth.currentUser) {
            try {
                saveApiSettingsBtn.disabled = true;
                saveApiSettingsBtn.textContent = "保存中...";
                
                const promptDocRef = doc(db, "users", auth.currentUser.uid, "settings", "latestPrompt");
                await setDoc(promptDocRef, { text: prompt }, { merge: true });
                
                // 次回リロード用に設定状態も保存
                const apiPrefRef = doc(db, "users", auth.currentUser.uid, "settings", "apiPreferences");
                await setDoc(apiPrefRef, { formatId: selectedFormatId, esEnabled: isEsEnabled, reinvestigateItems: checkedItems }, { merge: true });
                localStorage.setItem('apiFormatId', selectedFormatId);
                localStorage.setItem('apiEsEnabled', isEsEnabled);
                localStorage.setItem('apiReinvestigateItems', JSON.stringify(checkedItems));

                if (apiSettingsStatus) {
                    apiSettingsStatus.style.display = 'inline-block';
                    setTimeout(() => apiSettingsStatus.style.display = 'none', 3000);
                }
            } catch (e) {
                console.error("Failed to save API settings:", e);
                alert("API設定の保存に失敗しました。");
            } finally {
                saveApiSettingsBtn.disabled = false;
                saveApiSettingsBtn.textContent = "クラウドに設定を反映（Make.comに適用）";
            }
        } else {
            alert("ログインが必要です。");
        }
    });
}

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
    // 括弧内の改行を <br> に変換する (ES等の長文出力対応)
    markdown = markdown.replace(/\[\[([\s\S]*?)\]\]/g, (match) => {
        return match.replace(/\n/g, '<br>');
    });
    // <!-- --> 内の改行も変換
    markdown = markdown.replace(/<!--([\s\S]*?)-->/g, (match) => {
        return match.replace(/\n/g, '<br>');
    });

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
        // エラーテキスト（無効なメール等）の検知
        const mdTrimmed = markdown.trim();
        if (mdTrimmed.includes('無効なスカウト') || mdTrimmed.includes('指定してください') || mdTrimmed.includes('入力してください') || (mdTrimmed.length < 50 && !mdTrimmed.includes('/'))) {
            // スキップ対象のメールの場合は空配列を返し、エラーを吐かない
            return [];
        }

        // Fallback: AI might have omitted headers and dividers.
        // We will assume lines containing '/' or '|' are data lines, 
        // and map them based on the current formatBuilderData headers.
        const data = [];
        const validItems = formatBuilderData.filter(d => d && d.name && d.name.trim() !== "");
        const fallbackHeaders = ["企業名", ...validItems.map(d => d.name)];
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            
            let delim = null;
            let splitRegex = null;

            if (line.includes(' / ')) {
                delim = '/';
                splitRegex = /\s+\/\s+/;
            } else if (line.startsWith('/') && line.split(/(?<!:)\//).length > 2) {
                delim = '/';
                splitRegex = /(?<!:)\/(?!\d)/;
            } else if (line.includes(' | ')) {
                delim = '|';
                splitRegex = /\s*\|\s*/;
            } else if (line.startsWith('|') && line.split('|').length > 2) {
                delim = '|';
                splitRegex = /\|/;
            }
            
            if (!delim) continue;
            
            const escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const escapedDelim = escapeRegex(delim);
            const stripRegex = new RegExp(`^\\s*${escapedDelim}|${escapedDelim}\\s*$`, 'g');
            
            const cleanLine = line.replace(stripRegex, '');
            const cells = cleanLine.split(splitRegex).map(c => c.replace(/\*\*/g, '').trim());
            
            let parsedResume = "";
            let parsedMemo = "";
            let parsedCalendar = [];

            cells.forEach((cell, idx) => {
                let currentCell = cell;
                
                const resumeMatch = currentCell.match(/(?:<!--|\[\[)\s*resume:\s*([\s\S]*?)(?:-->|\]\]|$)/);
                if (resumeMatch) {
                    parsedResume = resumeMatch[1].trim();
                    currentCell = currentCell.replace(resumeMatch[0], "").trim();
                }

                const memoRegex = /(?:<!--|\[\[)\s*memo_(.*?):\s*([\s\S]*?)(?:-->|\]\]|$)/g;
                let m;
                while ((m = memoRegex.exec(currentCell)) !== null) {
                    if (parsedMemo) parsedMemo += "\n\n";
                    parsedMemo += `【${m[1].trim()}】\n${m[2].trim()}`;
                    currentCell = currentCell.replace(m[0], "").trim();
                }

                const calRegex = /(?:<!--|\[\[)\s*calendar_(.*?):\s*([\s\S]*?)(?:-->|\]\]|$)/g;
                while ((m = calRegex.exec(currentCell)) !== null) {
                    parsedCalendar.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        type: m[1].trim(),
                        date: m[2].trim(),
                        isCustomEvent: true
                    });
                    currentCell = currentCell.replace(m[0], "").trim();
                }
                
                cells[idx] = currentCell;
            });

            // Must have at least company name and another cell
            if (cells.length > 1 && cells[0] !== "") {
                const rowData = {};
                fallbackHeaders.forEach((header, index) => {
                    const cleanH = header.trim();
                    if (!cleanH || /^[-:\s]+$/.test(cleanH) || ['項目', '調査結果', '内容'].includes(cleanH)) {
                        return;
                    }
                    rowData[cleanH] = cells[index] || "";
                });
                
                if (parsedResume) rowData._parsedResume = parsedResume;
                if (parsedMemo) rowData._parsedMemo = parsedMemo;
                if (parsedCalendar.length > 0) rowData._parsedCalendar = parsedCalendar;
                
                data.push(rowData);
            }
        }
        
        if (data.length > 0) {
            return data;
        }

        throw new Error("フォーマットに合致する企業データが見つかりませんでした。メール内に企業情報が含まれていない可能性があります。");
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
            let cells = [];
            if (delimiter === '/') {
                cells = cleanLine.split(/(?<!:)\//).map(c => c.replace(/\*\*/g, '').trim());
            } else {
                cells = cleanLine.split(delimiter).map(c => c.replace(/\*\*/g, '').trim());
            }
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
            let cells = [];
            if (delimiter === '/') {
                // To avoid splitting 'https://', split by slash not preceded by a colon
                cells = cleanLine.split(/(?<!:)\//).map(c => c.replace(/\*\*/g, '').trim());
            } else {
                cells = cleanLine.split(delimiter).map(c => c.replace(/\*\*/g, '').trim());
            }
            
            let parsedResume = "";
            let parsedColor = "";
            let parsedMemo = "";
            let parsedCalendar = [];

            cells.forEach((cell, idx) => {
                let currentCell = cell;
                const resumeMatch = currentCell.match(/(?:<!--|\[\[)\s*resume:\s*([\s\S]*?)(?:-->|\]\]|$)/);
                if (resumeMatch) {
                    parsedResume = resumeMatch[1].trim();
                    currentCell = currentCell.replace(resumeMatch[0], "").trim();
                }
                const memoRegex = /(?:<!--|\[\[)\s*memo_(.*?):\s*([\s\S]*?)(?:-->|\]\]|$)/g;
                let m;
                while ((m = memoRegex.exec(currentCell)) !== null) {
                    if (parsedMemo) parsedMemo += "\n\n";
                    parsedMemo += `【${m[1].trim()}】\n${m[2].trim()}`;
                    currentCell = currentCell.replace(m[0], "").trim();
                }
                const calRegex = /(?:<!--|\[\[)\s*calendar_(.*?):\s*([\s\S]*?)(?:-->|\]\]|$)/g;
                while ((m = calRegex.exec(currentCell)) !== null) {
                    parsedCalendar.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        type: m[1].trim(),
                        date: m[2].trim(),
                        isCustomEvent: true
                    });
                    currentCell = currentCell.replace(m[0], "").trim();
                }
                cells[idx] = currentCell;
            });

            if (cells.length >= headers.length) {
                const rowData = {};
                headers.forEach((header, index) => {
                    const cleanH = header.trim();
                    if (!cleanH || /^[-:\s]+$/.test(cleanH) || ['項目', '調査結果', '内容'].includes(cleanH)) {
                        return; // 不要なキーは保存しない
                    }
                    rowData[cleanH] = cells[index] || "";
                });
                
                if (parsedResume) rowData._parsedResume = parsedResume;
                if (parsedMemo) rowData._parsedMemo = parsedMemo;
                if (parsedCalendar.length > 0) rowData._parsedCalendar = parsedCalendar;

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
                const companyName = item["企業名"];
                let existingItem = null;
                if (companyName) {
                    existingItem = currentData.find(d => d["企業名"] === companyName);
                }

                const newMemo = item._parsedMemo || "";
                const newResume = item._parsedResume || "";
                const newCustomEvents = item._parsedCalendar || [];
                
                delete item._parsedMemo;
                delete item._parsedResume;
                delete item._parsedCalendar;

                if (existingItem && existingItem.id) {
                    // Update existing document
                    const docRef = doc(db, "users", auth.currentUser.uid, "companies", existingItem.id);
                    const updates = {};
                    
                    // Merge memo
                    if (newMemo) {
                        updates.memo = existingItem.memo ? existingItem.memo + "\n\n" + newMemo : newMemo;
                    }
                    
                    // Merge calendar
                    if (newCustomEvents.length > 0) {
                        updates.customEvents = [...(existingItem.customEvents || []), ...newCustomEvents];
                    }
                    
                    // Merge any valid string fields that are not "不明" or empty, if the existing one is empty or "不明"
                    Object.keys(item).forEach(key => {
                        if (key !== "id" && key !== "createdAt" && key !== "isHidden" && key !== "memo" && key !== "resume" && key !== "customEvents") {
                            const newVal = item[key];
                            if (newVal && newVal !== "不明" && newVal !== "-" && newVal.trim() !== "") {
                                const oldVal = existingItem[key];
                                if (!oldVal || oldVal === "不明" || oldVal === "-" || oldVal.trim() === "") {
                                    updates[key] = newVal;
                                }
                            }
                        }
                    });

                    if (Object.keys(updates).length > 0) {
                        await updateDoc(docRef, updates);
                    }
                } else {
                    // Create new document
                    item.createdAt = new Date().toISOString();
                    item.isHidden = false;
                    item.memo = newMemo;
                    item.resume = newResume;
                    item.customEvents = newCustomEvents;
                    await addDoc(colRef, item);
                }
            }
        } else {
            parsedData.forEach(item => {
                const companyName = item["企業名"];
                let existingItem = null;
                if (companyName) {
                    existingItem = mockData.find(d => d["企業名"] === companyName);
                }

                const newMemo = item._parsedMemo || "";
                const newResume = item._parsedResume || "";
                const newCustomEvents = item._parsedCalendar || [];
                
                delete item._parsedMemo;
                delete item._parsedResume;
                delete item._parsedCalendar;

                if (existingItem) {
                    // Update existing
                    if (newMemo) {
                        existingItem.memo = existingItem.memo ? existingItem.memo + "\n\n" + newMemo : newMemo;
                    }
                    if (newCustomEvents.length > 0) {
                        existingItem.customEvents = [...(existingItem.customEvents || []), ...newCustomEvents];
                    }
                    Object.keys(item).forEach(key => {
                        if (key !== "id" && key !== "createdAt" && key !== "isHidden" && key !== "memo" && key !== "resume" && key !== "customEvents") {
                            const newVal = item[key];
                            if (newVal && newVal !== "不明" && newVal !== "-" && newVal.trim() !== "") {
                                const oldVal = existingItem[key];
                                if (!oldVal || oldVal === "不明" || oldVal === "-" || oldVal.trim() === "") {
                                    existingItem[key] = newVal;
                                }
                            }
                        }
                    });
                } else {
                    // Add new
                    item.id = Date.now() + Math.random().toString(36).substr(2, 9);
                    item.createdAt = new Date().toISOString();
                    item.isHidden = false;
                    item.memo = newMemo;
                    item.resume = newResume;
                    item.customEvents = newCustomEvents;
                    mockData.push(item);
                }
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
    
    // 同一企業をグループ化し、グループ内の最新の追加日時でソートするための事前計算
    const latestByCompany = {};
    if (sortVal === 'created_desc') {
        filteredData.forEach(d => {
            const cName = d['企業名'] || d['会社名'] || '不明';
            const cTime = new Date(d.createdAt || 0).getTime();
            if (!latestByCompany[cName] || cTime > latestByCompany[cName]) {
                latestByCompany[cName] = cTime;
            }
        });
    }

    filteredData.sort((a, b) => {
        let valA = 0, valB = 0;
        
        switch (sortVal) {
            case 'created_desc':
                const cNameA = a['企業名'] || a['会社名'] || '不明';
                const cNameB = b['企業名'] || b['会社名'] || '不明';
                
                // 1. グループの最新日時で降順ソート
                if (latestByCompany[cNameB] !== latestByCompany[cNameA]) {
                    return latestByCompany[cNameB] - latestByCompany[cNameA];
                }
                // 2. グループが同じ場合は企業名でまとめる
                if (cNameA !== cNameB) {
                    return cNameA.localeCompare(cNameB);
                }
                // 3. 同じ企業内では、追加日時の降順（最新が上）
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
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
    const idx = mockData.findIndex(d => d.id === id);
    if (idx !== -1) {
        mockData[idx] = { ...mockData[idx], ...updates, _isDirty: true };
        localStorage.setItem('mockData', JSON.stringify(mockData));
        markUnsavedChanges();
        
        // Re-render UI immediately
        renderQueryBuilder();
        applyFiltersAndRender();
        updateCalendarEvents();
    }
}

async function deleteItemData(id, skipConfirm = false) {
    if (skipConfirm || confirm("本当にこのデータを削除しますか？この操作は元に戻せません。")) {
        mockData = mockData.filter(d => d.id !== id);
        deletedCompanyIds.push(id);
        localStorage.setItem('mockData', JSON.stringify(mockData));
        markUnsavedChanges();
        
        // Re-render UI immediately
        renderQueryBuilder();
        applyFiltersAndRender();
        updateCalendarEvents();
    }
}

async function syncToCloud() {
    if (!auth || !auth.currentUser) return;
    try {
        const batch = writeBatch(db);
        let writeCount = 0;
        
        // 1. Handle Deletes
        for (const id of deletedCompanyIds) {
            const docRef = doc(db, "users", auth.currentUser.uid, "companies", id);
            batch.delete(docRef);
            writeCount++;
        }
        for (const id of deletedCalendarIds) {
            const docRef = doc(db, "users", auth.currentUser.uid, "calendar", id);
            batch.delete(docRef);
            writeCount++;
        }
        
        // 2. Handle Updates/Adds
        for (const item of mockData) {
            if (item._isDirty) {
                const docRef = doc(db, "users", auth.currentUser.uid, "companies", item.id);
                const cleanItem = { ...item };
                delete cleanItem._isDirty;
                batch.set(docRef, cleanItem);
                writeCount++;
            }
        }
        for (const item of mockCalendarData) {
            if (item._isDirty) {
                const docRef = doc(db, "users", auth.currentUser.uid, "calendar", item.id);
                const cleanItem = { ...item };
                delete cleanItem._isDirty;
                batch.set(docRef, cleanItem);
                writeCount++;
            }
        }
        
        if (writeCount > 0) {
            await batch.commit();
            trackFirebaseUsage('write', writeCount);
            console.log(`[Firebase Usage] Successfully synced ${writeCount} items to cloud.`);
        }
        
        clearUnsavedChanges();
        backupCurrentState();
        
        const modal = document.getElementById('auto-save-modal');
        if (modal) modal.style.display = 'none';

        alert("クラウドへ同期しました。");
        
        // 念のため再取得 (同期のズレを防ぐため)
        await loadData();
    } catch (e) {
        const modal = document.getElementById('auto-save-modal');
        if (modal) modal.style.display = 'none';
        console.error("Failed to sync to cloud:", e);
        if (e.message && e.message.includes("quota")) {
            console.error("[429 Quota Exceeded] Firebaseの無料読み取り/書き込み枠を超過しました。");
            alert("Firebaseの無料枠を超過しました。明日までクラウドへの保存はできませんが、ローカルでの作業は可能です。");
        } else {
            alert("同期中にエラーが発生しました: " + e.message);
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

    const ignoreHeaders = ['id', 'createdAt', 'userId', '会社名', '企業名', 'isHidden', 'memo', 'resume', 'customEvents', '_meta', '項目', '調査結果', '内容'];
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

    // フォーマット設計図の並び順をベースにする
    const builderHeaders = formatBuilderData
        .filter(d => d && d.name && d.name.trim() !== "")
        .map(d => d.name.trim());
    
    // データが存在する列のみ抽出
    const activeBuilderHeaders = builderHeaders.filter(h => headerSet.has(h));
    
    // 設計図にないヘッダーは末尾に追加
    const extraHeaders = Array.from(headerSet).filter(h => !builderHeaders.includes(h));
    let dynamicHeaders = [...activeBuilderHeaders, ...extraHeaders];

    // カスタム並び順設定が有効な場合、それを適用
    if (customColumnSettings.order && customColumnSettings.order.length > 0) {
        const sorted = [];
        customColumnSettings.order.forEach(h => {
            if (dynamicHeaders.includes(h)) {
                sorted.push(h);
            }
        });
        const remaining = dynamicHeaders.filter(h => !sorted.includes(h));
        dynamicHeaders = [...sorted, ...remaining];
    }

    const headers = [companyKey, "追加日時", ...dynamicHeaders, "アクション"];

    // 各列の平均文字数を計算し、列幅を決定する
    const columnWidths = {};
    headers.forEach(h => {
        if (h === "アクション" || h === companyKey) return;
        let totalLen = 0;
        let count = 0;
        
        // ヘッダー自身の文字数も計算に含める
        totalLen += h.length;
        count++;

        tableData.forEach(item => {
            let val = item[h] || "";
            let text = String(val).replace(/<!--.*?-->/g, "").replace(/\[\[.*?\]\]/g, "").replace(/\*\*/g, "").trim();
            if (text) {
                totalLen += text.length;
                count++;
            }
        });
        
        let avg = Math.round(totalLen / count);
        // 平均が26文字未満ならその平均値(最小7)、超えれば26文字を基準とする
        columnWidths[h] = Math.max(7, Math.min(26, avg));

        // カスタム横幅設定があれば上書き（0の場合は自動計算を維持）
        if (customColumnSettings.widths && customColumnSettings.widths[h]) {
            columnWidths[h] = customColumnSettings.widths[h];
        }
    });

    const thSelectAll = document.createElement('th');
    const cbAll = document.createElement('input');
    cbAll.type = 'checkbox';
    cbAll.id = 'merge-select-all';
    cbAll.title = '全選択/全解除';
    thSelectAll.appendChild(cbAll);
    thSelectAll.style.width = "40px";
    thSelectAll.style.textAlign = "center";
    cbAll.addEventListener('change', (e) => {
        const cbs = document.querySelectorAll('.merge-checkbox');
        cbs.forEach(cb => cb.checked = e.target.checked);
    });
    tableHead.appendChild(thSelectAll);

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
        
        if (columnWidths[h]) {
            th.style.minWidth = columnWidths[h] + "em";
            th.style.maxWidth = "26em";
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

            } else if (h === "追加日時") {
                const dateDiv = document.createElement('div');
                const d = new Date(item.createdAt || 0);
                if (!isNaN(d.getTime()) && d.getTime() > 0) {
                    dateDiv.textContent = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                } else {
                    dateDiv.textContent = "-";
                }
                dateDiv.style.fontSize = "0.85em";
                dateDiv.style.color = "var(--text-color)";
                dateDiv.style.opacity = "0.7";
                td.appendChild(dateDiv);

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

                let text = String(item[h] || "-");
                
                let bgColorClass = "";
                if (text.includes("<!-- color:green -->") || text.includes("[[color:green]]")) bgColorClass = "bg-green";
                else if (text.includes("<!-- color:yellow -->") || text.includes("[[color:yellow]]")) bgColorClass = "bg-yellow";
                else if (text.includes("<!-- color:red -->") || text.includes("[[color:red]]")) bgColorClass = "bg-red";
                
                // 変数や色付けなどのシステム制御タグを非表示にする
                text = text.replace(/(?:<!--|\[\[)\s*(?:var_|resume|color|sort|memo|calendar)[\s\S]*?(?:-->|\]\]|$)/g, "").trim();

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
                
                const buildTextWithDates = (str) => {
                    const frag = document.createDocumentFragment();
                    const dateRegex = /\d{4}-\d{2}-\d{2}/g;
                    let lastIndex = 0;
                    let match;
                    while ((match = dateRegex.exec(str)) !== null) {
                        if (match.index > lastIndex) {
                            frag.appendChild(document.createTextNode(str.substring(lastIndex, match.index)));
                        }
                        const dateStr = match[0];
                        const a = document.createElement('a');
                        a.className = 'date-link';
                        a.textContent = dateStr;
                        // Determine event type
                        let evType = "面接";
                        let evId = null;
                        if (h.includes("締切") || (item._meta && item._meta.deadline === dateStr)) evType = "締切";
                        if (item.customEvents) {
                            const cEv = item.customEvents.find(e => e.date === dateStr);
                            if (cEv) { evType = cEv.type; evId = `${item.id}_${cEv.type}_${cEv.date}`; }
                        }
                        const rawTitle = (item[companyKey] || "不明") + " " + evType;
                        a.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openCalendarModal(dateStr, rawTitle, evId, item.memo || "", evType, "", false, item.id, true);
                        };
                        frag.appendChild(a);

                        // Calculate diff and add badge
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const targetDate = new Date(dateStr);
                        targetDate.setHours(0,0,0,0);
                        const diffTime = targetDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays >= 0 && diffDays <= 31) {
                            const badge = document.createElement('span');
                            badge.className = 'deadline-badge';
                            if (diffDays === 0) {
                                badge.classList.add('deadline-urgent');
                                badge.textContent = '本日';
                            } else if (diffDays <= 3) {
                                badge.classList.add('deadline-warning');
                                badge.textContent = diffDays + '日前';
                            } else if (diffDays <= 7) {
                                badge.classList.add('deadline-notice');
                                badge.textContent = '1週間前';
                            } else if (diffDays <= 31) {
                                badge.classList.add('deadline-info');
                                badge.textContent = '1か月前';
                            }
                            frag.appendChild(badge);
                        }
                        lastIndex = dateRegex.lastIndex;
                    }
                    if (lastIndex < str.length) {
                        frag.appendChild(document.createTextNode(str.substring(lastIndex)));
                    }
                    return frag;
                };
                
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
                    textSpan.appendChild(buildTextWithDates(text));
                    contentDiv.appendChild(bookmarkBtn);
                    contentDiv.appendChild(textSpan);
                } else {
                    contentDiv.appendChild(buildTextWithDates(text));
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
                const regex = /(?:<!--|\[\[)\s*(?:sort|var)_(.*?):\s*(.*?)(?:-->|\]\]|$)/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    let key = match[1].trim();
                    // var_ で始まった場合は var_ をキー名に含めて重複を防ぐ
                    if (match[0].includes('<!-- var_') || match[0].includes('[[var_')) {
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

async function loadData() {
    // 1. ローカルキャッシュから即時描画
    const localData = localStorage.getItem('mockData');
    if (localData) {
        mockData = JSON.parse(localData);
    }
    const localCal = localStorage.getItem('mockCalendarData');
    if (localCal) {
        mockCalendarData = JSON.parse(localCal);
    }

    // 即時描画
    const dataCopy = [...mockData];
    processMetaData(dataCopy);
    currentData = dataCopy;
    renderQuickTags(currentData);
    updateCalendarEvents();
    renderQueryBuilder(); 
    applyFiltersAndRender();

    // 2. クラウドから最新を取得して同期
    if (auth && auth.currentUser) {
        try {
            const colRef = collection(db, "users", auth.currentUser.uid, "companies");
            const snapshot = await getDocs(colRef);
            trackFirebaseUsage('read', snapshot.size);
            
            const fetchedData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            const calRef = collection(db, "users", auth.currentUser.uid, "calendar");
            const calSnap = await getDocs(calRef);
            trackFirebaseUsage('read', calSnap.size);
            
            mockCalendarData = calSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            mockData = fetchedData;
            
            localStorage.setItem('mockData', JSON.stringify(mockData));
            localStorage.setItem('mockCalendarData', JSON.stringify(mockCalendarData));
            
            // クラウドから取得したデータで再描画
            const fetchedDataCopy = [...mockData];
            processMetaData(fetchedDataCopy);
            currentData = fetchedDataCopy;
            
            renderQuickTags(currentData);
            updateCalendarEvents();
            renderQueryBuilder(); 
            applyFiltersAndRender();
            
            clearUnsavedChanges();
            backupCurrentState();
        } catch(e) {
            console.error("Failed to fetch from cloud:", e);
            if (e.message && e.message.includes("quota")) {
                console.error("[429 Quota Exceeded] Firebaseの無料読み取り枠を超過しました。");
            }
        }
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
        tableContainer.scrollBy({ left: 450 });
    } else if (e.key === 'ArrowLeft') {
        tableContainer.scrollBy({ left: -450 });
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
        await deleteItemData(item.id, true); // 削除 (確認ダイアログをスキップ)
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

const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', async function() {
        const cbs = document.querySelectorAll('.merge-checkbox:checked');
        if (cbs.length === 0) {
            alert("削除する行をチェックしてください。");
            return;
        }
        if (!confirm("チェックされた " + cbs.length + " 件のデータを一括削除します。本当によろしいですか？\nこの操作は元に戻せません。")) {
            return;
        }
        if (!auth || !auth.currentUser) return;
        try {
            const promises = [];
            cbs.forEach(cb => {
                promises.push(deleteItemData(cb.value, true)); // 削除 (確認ダイアログをスキップ)
            });
            await Promise.all(promises);
            document.querySelectorAll('.merge-checkbox').forEach(cb => cb.checked = false);
            const selectAllCb = document.getElementById('merge-select-all');
            if (selectAllCb) selectAllCb.checked = false;
        } catch (e) {
            alert("一括削除中にエラーが発生しました: " + e.message);
        }
    });
}
