let activeChat = null;
let allChats = [];
let allTechs = [];
let uniqueTags = new Set();

// Elementos del DOM - Sidebar Layout
const chatListEl = document.getElementById('chat-list');
const messagesContainerEl = document.getElementById('messages-container');
const messageInputEl = document.getElementById('message-input');
const sendButtonEl = document.getElementById('send-button');
const activeContactNameEl = document.getElementById('active-contact-name');
const activeAvatarEl = document.getElementById('active-avatar');
const activeTagsContainerEl = document.getElementById('active-tags-container');
const activeTechAssignedEl = document.getElementById('active-tech-assigned');
const tagFilterEl = document.getElementById('tag-filter');
const searchInputEl = document.getElementById('search-input');

// Elementos Header Personalizable
const brandNameEl = document.getElementById('brand-name');
const brandAvatarEl = document.getElementById('brand-avatar');
const brandAvatarInitialEl = document.getElementById('brand-avatar-initial');
const logoUploadEl = document.getElementById('logo-upload');

// Elementos Modales
const tagModalEl = document.getElementById('tag-modal');
const btnAddTagEl = document.getElementById('btn-add-tag');
const btnCancelTagEl = document.getElementById('btn-cancel-tag');
const btnSaveTagEl = document.getElementById('btn-save-tag');
const tagNameInputEl = document.getElementById('tag-name-input');
const tagColorInputEl = document.getElementById('tag-color-input');

const techModalEl = document.getElementById('tech-modal');
const btnManageTechsEl = document.getElementById('btn-manage-techs');
const btnCloseTechsEl = document.getElementById('btn-close-techs');
const techListEl = document.getElementById('tech-list');
const btnAddTechEl = document.getElementById('btn-add-tech');

const assignModalEl = document.getElementById('assign-modal');
const btnAssignTechEl = document.getElementById('btn-assign-tech');
const btnCancelAssignEl = document.getElementById('btn-cancel-assign');
const assignTechListEl = document.getElementById('assign-tech-list');

// Cargar estado guardado de la marca
function loadBrandState() {
    const savedName = localStorage.getItem('brandName');
    if (savedName) brandNameEl.textContent = savedName;
    
    brandAvatarInitialEl.textContent = brandNameEl.textContent.charAt(0).toUpperCase();

    const savedLogo = localStorage.getItem('brandLogo');
    if (savedLogo) {
        brandAvatarEl.style.backgroundImage = `url(${savedLogo})`;
        brandAvatarInitialEl.style.display = 'none';
    }
}

brandNameEl.addEventListener('input', () => {
    localStorage.setItem('brandName', brandNameEl.textContent);
    if (!localStorage.getItem('brandLogo')) {
        brandAvatarInitialEl.textContent = brandNameEl.textContent.charAt(0).toUpperCase();
    }
});

brandAvatarEl.addEventListener('click', () => logoUploadEl.click());
logoUploadEl.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const dataUrl = evt.target.result;
            localStorage.setItem('brandLogo', dataUrl);
            brandAvatarEl.style.backgroundImage = `url(${dataUrl})`;
            brandAvatarInitialEl.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
});


// Cargar lista de chats y tecnicos
async function loadData() {
    try {
        const [chatsRes, techsRes] = await Promise.all([
            fetch('/api/chats').catch(()=>({json:()=>[]})),
            fetch('/api/technicians').catch(()=>({json:()=>[]}))
        ]);
        
        allChats = await chatsRes.json();
        allTechs = await techsRes.json();
        
        extractUniqueTags();
        renderChats();
    } catch (error) {
        console.error("Error al cargar datos. Verifica que el servidor Node.js esté corriendo.", error);
    }
}

function extractUniqueTags() {
    uniqueTags.clear();
    allChats.forEach(chat => {
        if(chat.tags) chat.tags.forEach(t => uniqueTags.add(t.name.toUpperCase()));
    });
    
    // Rellenar select
    const currentVal = tagFilterEl.value;
    tagFilterEl.innerHTML = '<option value="">Todas las etiquetas (Sin Filtro)</option>';
    uniqueTags.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        tagFilterEl.appendChild(opt);
    });
    tagFilterEl.value = currentVal;
}

function renderChats() {
    const filterValue = tagFilterEl.value.toLowerCase();
    const searchValue = searchInputEl.value.toLowerCase();

    const filteredChats = allChats.filter(chat => {
        let matchFilter = true;
        let matchSearch = true;

        if (filterValue) {
            matchFilter = chat.tags && chat.tags.some(t => t.name.toLowerCase() === filterValue);
        }
        if (searchValue) {
            const name = (chat.name || '').toLowerCase();
            const phone = (chat.phone || '').toLowerCase();
            matchSearch = name.includes(searchValue) || phone.includes(searchValue);
        }
        return matchFilter && matchSearch;
    });

    chatListEl.innerHTML = '';
    filteredChats.forEach(chat => {
        const date = new Date(chat.lastUpdated);
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const div = document.createElement('div');
        div.className = `chat-item ${activeChat === chat.phone ? 'active' : ''}`;
        div.onclick = () => selectChat(chat.phone, chat.name || chat.phone, chat.tags, chat.assignedToName);
        
        let tagsHtml = '';
        if (chat.tags && chat.tags.length > 0) {
            tagsHtml = '<div style="display: flex; gap: 4px; margin-top: 4px;">';
            chat.tags.forEach(t => {
                tagsHtml += `<span style="background: ${t.color}; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px;">${t.name}</span>`;
            });
            tagsHtml += '</div>';
        }

        let assignHtml = chat.assignedToName ? `<div style="font-size:11px; color:#00a884; font-weight:bold; margin-top:2px;">Despachado a: ${chat.assignedToName}</div>` : '';

        div.innerHTML = `
            <div class="avatar" style="background-color: ${getColorForString(chat.phone)}">${(chat.name || chat.phone).charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-name-time">
                    <span class="chat-name">${chat.name || '+' + chat.phone}</span>
                    <span class="chat-time">${timeStr}</span>
                </div>
                <div class="chat-last-message">${chat.lastMessage || 'Nuevo chat'}</div>
                ${assignHtml}
                ${tagsHtml}
            </div>
        `;
        chatListEl.appendChild(div);
    });

    if (activeChat) {
        const currentActiveChatData = allChats.find(c => c.phone === activeChat);
        if (currentActiveChatData) {
            renderActiveTags(currentActiveChatData.tags);
            activeTechAssignedEl.textContent = currentActiveChatData.assignedToName ? `(Resp: ${currentActiveChatData.assignedToName})` : '';
        }
    }
}

function renderActiveTags(tags) {
    activeTagsContainerEl.innerHTML = '';
    if (!tags) return;
    tags.forEach(t => {
        const span = document.createElement('span');
        span.style.background = t.color;
        span.style.color = 'white';
        span.style.fontSize = '12px';
        span.style.padding = '4px 8px';
        span.style.borderRadius = '12px';
        span.style.display = 'flex';
        span.style.alignItems = 'center';
        span.style.gap = '4px';
        
        span.innerHTML = `${t.name} <span style="cursor:pointer; font-weight:bold; font-size:14px;" onclick="removeTag('${t.name}')">&times;</span>`;
        activeTagsContainerEl.appendChild(span);
    });
}

// Seleccionar un chat
async function selectChat(phone, name, tags, assignedToName) {
    activeChat = phone;
    document.getElementById('no-chat-selected').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    
    activeContactNameEl.textContent = name || '+' + phone;
    activeAvatarEl.textContent = (name || phone).charAt(0).toUpperCase();
    activeAvatarEl.style.backgroundColor = getColorForString(phone);
    activeTechAssignedEl.textContent = assignedToName ? `(Resp: ${assignedToName})` : '';
    
    renderChats(); 
    await loadMessages(phone);
}

// Cargar mensajes
async function loadMessages(phone) {
    if (!phone) return;
    try {
        const response = await fetch(`/api/messages/${phone}`);
        const messages = await response.json();
        
        messagesContainerEl.innerHTML = '';
        messages.forEach(msg => {
            const isSent = msg.direction === 'outbound';
            const date = new Date(msg.timestamp);
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const div = document.createElement('div');
            div.className = `message ${isSent ? 'sent' : 'received'}`;
            div.innerHTML = `<div>${msg.text}</div><div class="message-time">${timeStr}</div>`;
            messagesContainerEl.appendChild(div);
        });
        
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    } catch (error) {
        console.error("Error al cargar mensajes:", error);
    }
}

// Enviar un mensaje
async function sendMessage() {
    const text = messageInputEl.value.trim();
    if (!text || !activeChat) return;
    
    messageInputEl.value = '';
    
    try {
        const div = document.createElement('div');
        div.className = 'message sent';
        div.innerHTML = `<div>${text}</div><div class="message-time">Enviando...</div>`;
        messagesContainerEl.appendChild(div);
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
        
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: activeChat, text: text })
        });
        
        if (response.ok) {
            await loadMessages(activeChat); 
        } else {
            alert('Error al enviar mensaje. ¿Pasaron 24 horas?');
        }
    } catch (error) {
        alert('Error de conexión. ¿Está corriendo el servidor Node?');
    }
}

// -- ETIQUETAS --
btnAddTagEl.addEventListener('click', () => {
    if (!activeChat) return;
    tagNameInputEl.value = '';
    tagModalEl.style.display = 'flex';
});

btnCancelTagEl.addEventListener('click', () => tagModalEl.style.display = 'none');

btnSaveTagEl.addEventListener('click', async () => {
    if (!activeChat) return;
    const name = tagNameInputEl.value.trim();
    const color = tagColorInputEl.value;
    
    if (!name) return alert("Ingresa un nombre para la etiqueta");
    tagModalEl.style.display = 'none';
    
    await fetch(`/api/chats/${activeChat}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    loadData();
});

async function removeTag(tagName) {
    if (!activeChat) return;
    await fetch(`/api/chats/${activeChat}/tags/${encodeURIComponent(tagName)}`, { method: 'DELETE' });
    loadData();
}

// -- GESTIÓN DE TÉCNICOS --
btnManageTechsEl.onclick = () => {
    renderTechList();
    techModalEl.style.display = 'flex';
};
btnCloseTechsEl.onclick = () => techModalEl.style.display = 'none';

function renderTechList() {
    techListEl.innerHTML = '';
    allTechs.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tech-item';
        div.innerHTML = `
            <div><strong>${t.name}</strong> (${t.brigade || 'Sin brigada'})<br><small>${t.phone}</small></div>
            <div>
                <span style="background:#e9edef; padding:4px 8px; border-radius:4px; font-size:12px; margin-right:10px;">Casos: ${t.activeCases}</span>
                <button class="btn-secondary" onclick="deleteTech('${t.id}')">Eliminar</button>
            </div>
        `;
        techListEl.appendChild(div);
    });
}

btnAddTechEl.onclick = async () => {
    const name = document.getElementById('tech-name').value;
    const phone = document.getElementById('tech-phone').value;
    const brigade = document.getElementById('tech-brigade').value;
    if(!name || !phone) return alert("Nombre y Teléfono son requeridos");
    
    await fetch('/api/technicians', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, phone, brigade })
    });
    
    document.getElementById('tech-name').value = '';
    document.getElementById('tech-phone').value = '';
    document.getElementById('tech-brigade').value = '';
    loadData().then(renderTechList);
};

async function deleteTech(id) {
    await fetch(`/api/technicians/${id}`, { method: 'DELETE' });
    loadData().then(renderTechList);
}

// -- DESPACHO --
btnAssignTechEl.onclick = () => {
    if(!activeChat) return;
    assignTechListEl.innerHTML = '';
    allTechs.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tech-item';
        div.innerHTML = `
            <div><strong>${t.name}</strong> (${t.brigade})</div>
            <div>
                <span style="margin-right:10px; font-size:12px;">Carga: ${t.activeCases}</span>
                <button class="btn-primary" onclick="assignToTech('${t.id}')">Despachar</button>
            </div>
        `;
        assignTechListEl.appendChild(div);
    });
    assignModalEl.style.display = 'flex';
};

btnCancelAssignEl.onclick = () => assignModalEl.style.display = 'none';

async function assignToTech(techId) {
    if(!activeChat) return;
    const btn = event.target;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    try {
        await fetch('/api/assign', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone: activeChat, technicianId: techId })
        });
        assignModalEl.style.display = 'none';
        alert('Asignado y Notificado vía WhatsApp');
        loadData();
    } catch(e) {
        alert('Error asignando');
        btn.textContent = 'Despachar';
        btn.disabled = false;
    }
}


// Eventos UI
sendButtonEl.addEventListener('click', sendMessage);
messageInputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
tagFilterEl.addEventListener('change', renderChats);
searchInputEl.addEventListener('input', renderChats);

function getColorForString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#00a884', '#00bfa5', '#009688', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#03a9f4'];
    return colors[Math.abs(hash) % colors.length];
}

setInterval(loadData, 5000);
loadBrandState();
loadData();
