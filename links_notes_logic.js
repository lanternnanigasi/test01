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

document.getElementById('note-save-btn').addEventListener('click', () => {
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

document.getElementById('note-delete-btn').addEventListener('click', () => {
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

function saveCurrentNotes(newNotesArray) {
    const item = mockData.find(d => d.id === currentNoteCompanyId);
    if (!item) return;
    if (!item._meta) item._meta = {};
    item._meta.notes = newNotesArray;
    updateItemData(currentNoteCompanyId, { _meta: item._meta });
}
