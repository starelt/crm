// =====================================================
// StarElectronic CRM - Professional App Logic
// =====================================================

let activeChat = null;
let allChats = [];
let allTechs = [];
let allLabels = []; // etiquetas globales guardadas
let currentTagColor = '#e53935';
let newLabelColor = '#e53935';

// ===== NAVEGACIÓN =====
const navItems = document.querySelectorAll('.nav-item[data-section]');
const sections = document.querySelectorAll('.section');

// Filtrar No leídos
if(document.getElementById('btn-filter-unread')) document.getElementById('btn-filter-unread').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    renderChatList();
});

// Nuevo contacto manual
const contactModal = document.getElementById('contact-modal');
if(document.getElementById('btn-new-contact')) document.getElementById('btn-new-contact').addEventListener('click', () => contactModal.style.display = 'flex');
if(document.getElementById('btn-cancel-contact')) document.getElementById('btn-cancel-contact').addEventListener('click', () => contactModal.style.display = 'none');
if(document.getElementById('btn-cancel-contact-top')) document.getElementById('btn-cancel-contact-top').addEventListener('click', () => contactModal.style.display = 'none');

if(document.getElementById('btn-save-contact')) document.getElementById('btn-save-contact').addEventListener('click', async () => {
    const name = document.getElementById('contact-name-input').value.trim();
    const phone = document.getElementById('contact-phone-input').value.trim();
    if (!name || !phone) return showToast('Nombre y teléfono son obligatorios', 'error');

    document.getElementById('btn-save-contact').textContent = 'Guardando...';
    try {
        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        contactModal.style.display = 'none';
        document.getElementById('contact-name-input').value = '';
        document.getElementById('contact-phone-input').value = '';
        showToast('Contacto guardado exitosamente', 'success');
        loadData();
    } catch (e) {
        showToast('Error al guardar contacto', 'error');
    } finally {
        document.getElementById('btn-save-contact').textContent = 'Guardar';
    }
});

// Navegación
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const section = item.dataset.section;
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${section}`)?.classList.add('active');

        if (section === 'contacts') renderContactsTable();
        if (section === 'labels') renderLabelsGrid();
        if (section === 'staff') renderStaffGrid();
    });
});

// ===== BRAND / LOGO =====
const brandNameEl = document.getElementById('brand-name');
const logoAvatarEl = document.getElementById('logo-avatar');
const logoInitialEl = document.getElementById('logo-initial');
const logoUploadEl = document.getElementById('logo-upload');
const settingsAvatarEl = document.getElementById('settings-avatar');
const settingsAvatarInitialEl = document.getElementById('settings-avatar-initial');
const settingsLogoUploadEl = document.getElementById('settings-logo-upload');
const settingsBrandNameEl = document.getElementById('settings-brand-name');

function loadBrandState() {
    const savedName = localStorage.getItem('brandName') || 'StarElectronic CRM';
    brandNameEl.textContent = savedName;
    settingsBrandNameEl.value = savedName;
    logoInitialEl.textContent = savedName.charAt(0).toUpperCase();
    settingsAvatarInitialEl.textContent = savedName.charAt(0).toUpperCase();

    const savedLogo = localStorage.getItem('brandLogo');
    if (savedLogo) {
        logoAvatarEl.style.backgroundImage = `url(${savedLogo})`;
        logoInitialEl.style.display = 'none';
        settingsAvatarEl.style.backgroundImage = `url(${savedLogo})`;
        settingsAvatarInitialEl.style.display = 'none';
    }

    // Cargar etiquetas globales
    const savedLabels = localStorage.getItem('globalLabels');
    if (savedLabels) allLabels = JSON.parse(savedLabels);
}

brandNameEl.addEventListener('input', () => {
    const name = brandNameEl.textContent;
    localStorage.setItem('brandName', name);
    logoInitialEl.textContent = name.charAt(0).toUpperCase();
    settingsAvatarInitialEl.textContent = name.charAt(0).toUpperCase();
    settingsBrandNameEl.value = name;
});

if(document.getElementById('nav-logo-btn')) document.getElementById('nav-logo-btn').addEventListener('click', () => logoUploadEl.click());

function applyLogoFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const url = e.target.result;
        localStorage.setItem('brandLogo', url);
        logoAvatarEl.style.backgroundImage = `url(${url})`;
        logoInitialEl.style.display = 'none';
        settingsAvatarEl.style.backgroundImage = `url(${url})`;
        settingsAvatarInitialEl.style.display = 'none';
        showToast('Logo actualizado');
    };
    reader.readAsDataURL(file);
}

logoUploadEl.addEventListener('change', e => applyLogoFile(e.target.files[0]));
settingsAvatarEl.addEventListener('click', () => settingsLogoUploadEl.click());
settingsLogoUploadEl.addEventListener('change', e => applyLogoFile(e.target.files[0]));

if(document.getElementById('btn-save-settings')) document.getElementById('btn-save-settings').addEventListener('click', () => {
    const name = settingsBrandNameEl.value.trim() || 'StarElectronic CRM';
    brandNameEl.textContent = name;
    localStorage.setItem('brandName', name);
    logoInitialEl.textContent = name.charAt(0).toUpperCase();
    showToast('Configuración guardada', 'success');
});

// ===== CARGA DE DATOS =====
async function loadData() {
    try {
        const [chatsRes, techsRes] = await Promise.all([
            fetch('/api/chats').catch(() => null),
            fetch('/api/technicians').catch(() => null)
        ]);
        
        allChats = (chatsRes && chatsRes.ok) ? await chatsRes.json() : [];
        allTechs = (techsRes && techsRes.ok) ? await techsRes.json() : [];
        
        if (!Array.isArray(allChats)) allChats = [];
        if (!Array.isArray(allTechs)) allTechs = [];

        updateStats();
        renderChips();
        renderChatList();
        renderContactsTable();

        // Actualizar datos del chat activo si hay uno abierto
        if (activeChat) {
            const currentActive = allChats.find(c => c.phone === activeChat);
            if (currentActive) {
                renderActiveTags(currentActive.tags);
                document.getElementById('active-status').textContent = currentActive.assignedToName
                    ? `Asignado a: ${currentActive.assignedToName}`
                    : 'WhatsApp';
            }
            await loadMessages(activeChat, true); // Actualizar mensajes en silencio
        }

    } catch (e) {
        console.error('Error cargando datos:', e);
    }
}

function updateStats() {
    document.getElementById('stat-total').textContent = allChats.length;
    document.getElementById('stat-staff').textContent = allTechs.length;

    const tags = new Set();
    allChats.forEach(c => c.tags?.forEach(t => tags.add(t.name)));
    allLabels.forEach(l => tags.add(l.name));
    document.getElementById('stat-labels').textContent = tags.size;
}

// ===== CHIPS DE FILTRO =====
let activeFilter = '';

function renderChips() {
    const tags = new Set();
    allChats.forEach(c => c.tags?.forEach(t => tags.add(JSON.stringify({ name: t.name, color: t.color }))));
    allLabels.forEach(l => tags.add(JSON.stringify({ name: l.name, color: l.color })));

    const chipsEl = document.getElementById('label-chips');
    const current = activeFilter;
    chipsEl.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.className = `chip ${!current ? 'active' : ''}`;
    allChip.textContent = 'Todas';
    allChip.dataset.tag = '';
    allChip.addEventListener('click', () => { activeFilter = ''; renderChips(); renderChatList(); });
    chipsEl.appendChild(allChip);

    tags.forEach(tagJson => {
        const tag = JSON.parse(tagJson);
        const chip = document.createElement('button');
        chip.className = `chip ${current === tag.name ? 'active' : ''}`;
        chip.textContent = tag.name;
        chip.style.setProperty('--chip-color', tag.color);
        if (current === tag.name) {
            chip.style.background = tag.color;
            chip.style.borderColor = tag.color;
        }
        chip.addEventListener('click', () => {
            activeFilter = tag.name;
            renderChips();
            renderChatList();
        });
        chipsEl.appendChild(chip);
    });
}

// ===== LISTA DE CHATS =====
const searchInputEl = document.getElementById('search-input');
searchInputEl.addEventListener('input', renderChatList);

function renderChatList() {
    const search = searchInputEl.value.toLowerCase();
    const chatListEl = document.getElementById('chat-list');
    const showOnlyUnread = document.getElementById('btn-filter-unread').classList.contains('active');

    let filtered = allChats.filter(c => {
        const matchTag = !activeFilter || c.tags?.some(t => t.name === activeFilter);
        const name = (c.name || c.phone || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const matchSearch = !search || name.includes(search) || phone.includes(search);
        const matchUnread = !showOnlyUnread || (c.unreadCount && c.unreadCount > 0);
        return matchTag && matchSearch && matchUnread;
    });

    if (filtered.length === 0) {
        chatListEl.innerHTML = `<div class="loading-chats"><span class="material-symbols-rounded" style="font-size:36px;color:var(--text-muted)">inbox</span><p>Sin conversaciones</p></div>`;
        return;
    }

    chatListEl.innerHTML = '';
    filtered.forEach(chat => {
        const date = new Date(chat.lastUpdated);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        let timeStr;
        if (diffDays === 0) timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        else if (diffDays === 1) timeStr = 'Ayer';
        else timeStr = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

        const div = document.createElement('div');
        div.className = `chat-item ${activeChat === chat.phone ? 'active' : ''}`;
        div.addEventListener('click', () => selectChat(chat));

        let tagsHtml = '';
        if (chat.tags?.length) {
            tagsHtml = chat.tags.map(t =>
                `<span class="tag-badge" style="background:${t.color}">${t.name}</span>`
            ).join('');
        }

        let assignHtml = chat.assignedToName
            ? `<span class="assigned-badge">↗ ${chat.assignedToName}</span>`
            : '';

        let unreadBadge = (chat.unreadCount && chat.unreadCount > 0) 
            ? `<span class="unread-badge">${chat.unreadCount}</span>` 
            : '';

        div.innerHTML = `
            <div class="avatar" style="background:${getColorForString(chat.phone)}">${(chat.name || chat.phone).charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="chat-row-1">
                    <span class="chat-name">${chat.name || '+' + chat.phone}</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="chat-time">${timeStr}</span>
                        ${unreadBadge}
                    </div>
                </div>
                <div class="chat-preview" style="${chat.unreadCount > 0 ? 'font-weight:600; color:var(--text-main);' : ''}">${chat.lastMessage || 'Nueva conversación'}</div>
                <div class="chat-badges">${tagsHtml}${assignHtml}</div>
            </div>
        `;
        chatListEl.appendChild(div);
    });
}

// ===== SELECCIONAR CHAT =====
async function selectChat(chat) {
    activeChat = chat.phone;
    
    // Marcar como leido
    if (chat.unreadCount && chat.unreadCount > 0) {
        chat.unreadCount = 0; // Local
        fetch(`/api/chats/${chat.phone}/read`, { method: 'POST' }).catch(()=>{});
    }

    document.getElementById('no-chat-selected').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';

    document.getElementById('active-name').textContent = chat.name || '+' + chat.phone;
    const activeAvatarEl = document.getElementById('active-avatar');
    activeAvatarEl.textContent = (chat.name || chat.phone).charAt(0).toUpperCase();
    activeAvatarEl.style.background = getColorForString(chat.phone);

    document.getElementById('active-status').textContent = chat.assignedToName
        ? `Asignado a: ${chat.assignedToName}`
        : 'WhatsApp';

    renderChatList();
    renderActiveTags(chat.tags);
    await loadMessages(chat.phone, false);
}

function renderActiveTags(tags) {
    const bar = document.getElementById('active-tags-bar');
    bar.innerHTML = '';
    if (!tags) return;
    tags.forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag-badge';
        span.style.background = t.color;
        span.innerHTML = `${t.name} <span class="remove-tag" onclick="removeTag('${t.name}')">×</span>`;
        bar.appendChild(span);
    });
}

// ===== MENSAJES =====
let lastMessageCount = 0;

async function loadMessages(phone, silent = false) {
    if (!phone) return;
    const container = document.getElementById('messages-container');
    if (!silent) {
        container.innerHTML = '<div class="loading-chats"><div class="spinner"></div></div>';
    }
    
    try {
        const res = await fetch(`/api/messages/${phone}`);
        const messages = await res.json();
        
        // Si estamos actualizando en silencio y no hay mensajes nuevos, no hacer nada para evitar parpadeos
        if (silent && messages.length === lastMessageCount) return;
        
        lastMessageCount = messages.length;
        container.innerHTML = '';
        
        if (!messages.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">No hay mensajes aún</div>';
            return;
        }
        
        messages.forEach(msg => {
            const isSent = msg.direction === 'outbound';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = `message ${isSent ? 'sent' : 'received'}`;
            div.innerHTML = `<div>${msg.text}</div><div class="message-time">${time}</div>`;
            container.appendChild(div);
        });
        
        // Solo hacer auto-scroll si no estamos en modo silencioso o si llegaron mensajes nuevos
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        if (!silent) container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Error cargando mensajes</div>';
    }
}

// ===== ENVIAR MENSAJE =====
if(document.getElementById('send-button')) document.getElementById('send-button').addEventListener('click', sendMessage);
if(document.getElementById('message-input')) document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChat) return;

    input.value = '';

    // Limpiar badge localmente al enviar
    const currentActive = allChats.find(c => c.phone === activeChat);
    if (currentActive) {
        currentActive.unreadCount = 0;
        renderChatList();
    }

    try {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: activeChat, text })
        });
        if (res.ok) {
            await loadMessages(activeChat);
            showToast('Mensaje enviado', 'success');
        } else {
            showToast('Error al enviar. ¿Pasaron 24h?', 'error');
        }
    } catch (e) {
        showToast('Error de conexión', 'error');
    }
}

// ===== ETIQUETAS (Modal) =====
if(document.getElementById('btn-add-tag')) document.getElementById('btn-add-tag').addEventListener('click', () => {
    if (!activeChat) return;
    document.getElementById('tag-name-input').value = '';
    document.getElementById('tag-modal').style.display = 'flex';
});

if(document.getElementById('btn-cancel-tag')) document.getElementById('btn-cancel-tag').addEventListener('click', () => {
    document.getElementById('tag-modal').style.display = 'none';
});
if(document.getElementById('btn-cancel-tag2')) document.getElementById('btn-cancel-tag2').addEventListener('click', () => {
    document.getElementById('tag-modal').style.display = 'none';
});

// Color presets en modal de tag
document.querySelectorAll('#tag-modal .color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        currentTagColor = btn.dataset.color;
        document.getElementById('tag-color-input').value = currentTagColor;
        document.querySelectorAll('#tag-modal .color-preset').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});
if(document.getElementById('tag-color-input')) document.getElementById('tag-color-input').addEventListener('input', e => {
    currentTagColor = e.target.value;
});

if(document.getElementById('btn-save-tag')) document.getElementById('btn-save-tag').addEventListener('click', async () => {
    if (!activeChat) return;
    const name = document.getElementById('tag-name-input').value.trim().toUpperCase();
    if (!name) return showToast('Ingresa un nombre', 'error');
    const color = document.getElementById('tag-color-input').value;

    document.getElementById('tag-modal').style.display = 'none';

    await fetch(`/api/chats/${activeChat}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });

    // Guardar en labels globales si no existe
    if (!allLabels.find(l => l.name === name)) {
        allLabels.push({ name, color });
        localStorage.setItem('globalLabels', JSON.stringify(allLabels));
    }

    showToast(`Etiqueta "${name}" asignada`, 'success');
    loadData();
});

async function removeTag(tagName) {
    if (!activeChat) return;
    await fetch(`/api/chats/${activeChat}/tags/${encodeURIComponent(tagName)}`, { method: 'DELETE' });
    const chat = allChats.find(c => c.phone === activeChat);
    if (chat) {
        chat.tags = chat.tags?.filter(t => t.name !== tagName) || [];
        renderActiveTags(chat.tags);
    }
    showToast('Etiqueta removida');
    loadData();
}

// ===== TÉCNICOS (Despacho) =====
if(document.getElementById('btn-assign-tech')) document.getElementById('btn-assign-tech').addEventListener('click', () => {
    if (!activeChat) return;
    const list = document.getElementById('assign-tech-list');
    list.innerHTML = '';

    if (!allTechs.length) {
        list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted)">No hay técnicos registrados.<br>Ve a la sección <strong>Staff</strong> para agregar.</div>`;
    } else {
        allTechs.forEach(t => {
            const item = document.createElement('div');
            item.className = 'assign-item';
            item.innerHTML = `
                <div class="assign-item-info">
                    <div class="staff-avatar" style="width:36px;height:36px;font-size:14px">${t.name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="assign-item-name">${t.name}</div>
                        <div class="assign-item-brigade">${t.brigade || 'Sin brigada'} • ${t.activeCases || 0} casos activos</div>
                    </div>
                </div>
                <button class="btn-primary" onclick="assignToTech('${t.id}', this)" style="padding:6px 14px; font-size:12px">Despachar</button>
            `;
            list.appendChild(item);
        });
    }
    document.getElementById('assign-modal').style.display = 'flex';
});

if(document.getElementById('btn-cancel-assign')) document.getElementById('btn-cancel-assign').addEventListener('click', () => {
    document.getElementById('assign-modal').style.display = 'none';
});

async function assignToTech(techId, btn) {
    btn.textContent = '...';
    btn.disabled = true;
    try {
        await fetch('/api/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: activeChat, technicianId: techId })
        });
        document.getElementById('assign-modal').style.display = 'none';
        showToast('Técnico asignado y notificado por WhatsApp', 'success');
        loadData();
    } catch (e) {
        showToast('Error al asignar', 'error');
        btn.textContent = 'Despachar';
        btn.disabled = false;
    }
}

// ===== GESTIÓN DE TÉCNICOS (Staff Section) =====
if(document.getElementById('btn-manage-techs')) document.getElementById('btn-manage-techs').addEventListener('click', () => {
    navItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="staff"]')?.classList.add('active');
    sections.forEach(s => s.classList.remove('active'));
    document.getElementById('section-staff').classList.add('active');
    renderStaffGrid();
});

if(document.getElementById('btn-add-tech')) document.getElementById('btn-add-tech').addEventListener('click', async () => {
    const name = document.getElementById('tech-name').value.trim();
    const phone = document.getElementById('tech-phone').value.trim();
    const brigade = document.getElementById('tech-brigade').value.trim();
    if (!name || !phone) return showToast('Nombre y teléfono son requeridos', 'error');

    await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, brigade })
    });

    document.getElementById('tech-name').value = '';
    document.getElementById('tech-phone').value = '';
    document.getElementById('tech-brigade').value = '';
    showToast(`Técnico "${name}" agregado`, 'success');
    await loadData();
    renderStaffGrid();
});

function renderStaffGrid() {
    const grid = document.getElementById('staff-grid');
    if (!allTechs.length) {
        grid.innerHTML = `<div style="padding:32px;color:var(--text-muted);text-align:center;width:100%">No hay técnicos registrados aún.</div>`;
        return;
    }
    grid.innerHTML = '';
    allTechs.forEach(t => {
        const card = document.createElement('div');
        card.className = 'staff-card';
        card.innerHTML = `
            <div class="staff-card-top">
                <div class="staff-avatar">${t.name.charAt(0).toUpperCase()}</div>
                <div class="staff-info">
                    <div class="staff-name">${t.name}</div>
                    <div class="staff-brigade">${t.brigade || 'Sin brigada'}</div>
                </div>
            </div>
            <div class="staff-card-meta">
                <span class="meta-badge"><span class="material-symbols-rounded">phone</span>${t.phone}</span>
                <span class="meta-badge cases-badge"><span class="material-symbols-rounded">task</span>${t.activeCases || 0} casos</span>
            </div>
            <div class="staff-card-actions" style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn-secondary" onclick="viewTechDetails('${t.id}', '${t.name}')" style="padding:6px 12px; font-size:12px;">
                    <span class="material-symbols-rounded" style="font-size:16px;">visibility</span> Ver Asignados
                </button>
                <button class="icon-btn" onclick="deleteTech('${t.id}')" title="Eliminar Técnico">
                    <span class="material-symbols-rounded" style="font-size:20px; color:var(--danger);">delete</span>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function deleteTech(id) {
    if (!confirm('¿Seguro que deseas eliminar este técnico?')) return;
    await fetch(`/api/technicians/${id}`, { method: 'DELETE' });
    showToast('Técnico eliminado');
    await loadData();
    renderStaffGrid();
}

// ===== ASIGNACIONES DE TÉCNICOS (Detalles) =====
function viewTechDetails(techId, techName) {
    document.getElementById('td-tech-name').textContent = techName;
    const grid = document.getElementById('tech-assignments-grid');
    grid.innerHTML = '';

    const assignments = allChats.filter(c => c.assignedToId === techId);

    if (assignments.length === 0) {
        grid.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted); width: 100%;">Este técnico no tiene ningún cliente asignado actualmente.</div>`;
    } else {
        assignments.forEach(chat => {
            const card = document.createElement('div');
            card.className = 'assign-card';
            
            let tagsHtml = chat.tags?.map(t =>
                `<span class="tag-badge" style="background:${t.color}">${t.name}</span>`
            ).join('') || '';

            card.innerHTML = `
                <div class="assign-card-header">
                    <div class="ac-client">
                        <div class="ac-avatar" style="background:${getColorForString(chat.phone)}; color:white">${(chat.name || chat.phone).charAt(0).toUpperCase()}</div>
                        <div class="ac-info">
                            <h4>${chat.name || '+' + chat.phone}</h4>
                            <p>+${chat.phone}</p>
                        </div>
                    </div>
                </div>
                ${tagsHtml ? `<div style="display:flex; gap:4px; flex-wrap:wrap;">${tagsHtml}</div>` : ''}
                <div class="assign-card-footer">
                    <span style="font-size: 11px; color: var(--text-muted)">Asignado</span>
                    <button class="btn-unassign" onclick="unassignClient('${chat.phone}', '${techId}', '${techName}')">
                        <span class="material-symbols-rounded" style="font-size:14px">person_remove</span> Liberar
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });
    }
    
    document.getElementById('tech-details-modal').style.display = 'flex';
}

if(document.getElementById('btn-close-tech-details')) document.getElementById('btn-close-tech-details').addEventListener('click', () => {
    document.getElementById('tech-details-modal').style.display = 'none';
});

async function unassignClient(phone, techId, techName) {
    if (!confirm('¿Liberar a este cliente del técnico?')) return;
    try {
        await fetch('/api/unassign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        showToast('Asignación liberada', 'success');
        await loadData();
        viewTechDetails(techId, techName); // Refrescar el modal
        renderStaffGrid(); // Refrescar contador en tarjetas de staff
    } catch (e) {
        showToast('Error al liberar', 'error');
    }
}

// ===== SECCIÓN CONTACTOS =====
function renderContactsTable() {
    const tbody = document.getElementById('contacts-tbody');
    tbody.innerHTML = '';
    allChats.forEach(c => {
        const tr = document.createElement('tr');
        const tagsHtml = c.tags?.map(t =>
            `<span class="tag-badge" style="background:${t.color}">${t.name}</span>`
        ).join('') || '–';
        tr.innerHTML = `
            <td><strong>${c.name || '–'}</strong></td>
            <td>+${c.phone}</td>
            <td><div style="display:flex;gap:4px;flex-wrap:wrap">${tagsHtml}</div></td>
            <td>${c.assignedToName || '–'}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.lastMessage || '–'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ===== SECCIÓN ETIQUETAS =====
if(document.getElementById('btn-new-tag')) document.getElementById('btn-new-tag').addEventListener('click', () => {
    document.getElementById('new-label-name').value = '';
    document.getElementById('create-label-modal').style.display = 'flex';
});

if(document.getElementById('btn-create-label')) document.getElementById('btn-create-label').addEventListener('click', () => {
    document.getElementById('new-label-name').value = '';
    document.getElementById('create-label-modal').style.display = 'flex';
});

if(document.getElementById('btn-close-label-modal')) document.getElementById('btn-close-label-modal').addEventListener('click', () => {
    document.getElementById('create-label-modal').style.display = 'none';
});

if(document.getElementById('btn-cancel-label')) document.getElementById('btn-cancel-label').addEventListener('click', () => {
    document.getElementById('create-label-modal').style.display = 'none';
});

document.querySelectorAll('#create-label-modal .color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        newLabelColor = btn.dataset.color;
        document.getElementById('new-label-color').value = newLabelColor;
        document.querySelectorAll('#create-label-modal .color-preset').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});
if(document.getElementById('new-label-color')) document.getElementById('new-label-color').addEventListener('input', e => {
    newLabelColor = e.target.value;
});

if(document.getElementById('btn-save-label')) document.getElementById('btn-save-label').addEventListener('click', () => {
    const name = document.getElementById('new-label-name').value.trim().toUpperCase();
    if (!name) return showToast('Ingresa un nombre', 'error');
    const color = document.getElementById('new-label-color').value;

    if (!allLabels.find(l => l.name === name)) {
        allLabels.push({ name, color });
        localStorage.setItem('globalLabels', JSON.stringify(allLabels));
    }
    document.getElementById('create-label-modal').style.display = 'none';
    showToast(`Etiqueta "${name}" creada`, 'success');
    renderChips();
    renderLabelsGrid();
    updateStats();
});

function renderLabelsGrid() {
    const grid = document.getElementById('labels-grid');
    const allTagsMap = new Map();

    allLabels.forEach(l => allTagsMap.set(l.name, { ...l, count: 0 }));
    allChats.forEach(c => c.tags?.forEach(t => {
        if (!allTagsMap.has(t.name)) allTagsMap.set(t.name, { ...t, count: 0 });
        allTagsMap.get(t.name).count++;
    }));

    if (!allTagsMap.size) {
        grid.innerHTML = `<div style="padding:32px;color:var(--text-muted)">No hay etiquetas creadas aún.</div>`;
        return;
    }

    grid.innerHTML = '';
    allTagsMap.forEach((label, name) => {
        const card = document.createElement('div');
        card.className = 'label-card';
        card.innerHTML = `
            <div class="label-color-dot" style="background:${label.color}"></div>
            <div class="label-info">
                <div class="label-name">${name}</div>
                <div class="label-count">${label.count} cliente${label.count !== 1 ? 's' : ''}</div>
            </div>
            <button class="icon-btn" onclick="deleteLabel('${name}')" title="Eliminar etiqueta">
                <span class="material-symbols-rounded" style="font-size:16px;color:var(--danger)">delete</span>
            </button>
        `;
        grid.appendChild(card);
    });
}

function deleteLabel(name) {
    allLabels = allLabels.filter(l => l.name !== name);
    localStorage.setItem('globalLabels', JSON.stringify(allLabels));
    showToast(`Etiqueta eliminada`);
    renderLabelsGrid();
    renderChips();
    updateStats();
}
// ===== RESPUESTAS RÁPIDAS =====
let allQuickResponses = [];

async function loadQuickResponses() {
    try {
        const res = await fetch('/api/quick-responses');
        const data = await res.json();
        allQuickResponses = Array.isArray(data) ? data : [];
        renderQuickResponsesGrid();
    } catch(e) { 
        console.error("Error cargando QR", e); 
        allQuickResponses = [];
        renderQuickResponsesGrid();
    }
}

function renderQuickResponsesGrid() {
    const tbody = document.getElementById('qr-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (allQuickResponses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No hay respuestas rápidas guardadas.</td></tr>`;
        return;
    }

    allQuickResponses.forEach(qr => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${qr.name}</strong></td>
            <td><span class="meta-badge">${qr.type || 'Personal'}</span></td>
            <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary);">${qr.message}</td>
            <td>
                <button class="icon-btn" onclick="editQR('${qr.id}')" title="Editar">
                    <span class="material-symbols-rounded" style="font-size:18px; color:var(--primary);">edit</span>
                </button>
                <button class="icon-btn" onclick="deleteQR('${qr.id}')" title="Eliminar">
                    <span class="material-symbols-rounded" style="font-size:18px; color:var(--danger);">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editQR(id) {
    const qr = allQuickResponses.find(q => q.id === id);
    if (!qr) return;
    document.getElementById('qr-id').value = qr.id;
    document.getElementById('qr-name').value = qr.name;
    document.getElementById('qr-type').value = qr.type || 'Personal';
    document.getElementById('qr-message').value = qr.message;
    document.getElementById('qr-modal-title').textContent = 'Editar Respuesta';
    document.getElementById('qr-modal').style.display = 'flex';
}

async function deleteQR(id) {
    if (!confirm('¿Seguro que deseas eliminar esta respuesta rápida?')) return;
    await fetch(`/api/quick-responses/${id}`, { method: 'DELETE' });
    showToast('Respuesta eliminada');
    await loadQuickResponses();
}

// Botón nuevo QR
const btnNewQr = document.getElementById('btn-new-qr');
if(btnNewQr) {
    btnNewQr.addEventListener('click', () => {
        document.getElementById('qr-id').value = '';
        document.getElementById('qr-name').value = '';
        document.getElementById('qr-type').value = 'Personal';
        document.getElementById('qr-message').value = '';
        document.getElementById('qr-modal-title').textContent = 'Agregar Respuesta';
        document.getElementById('qr-modal').style.display = 'flex';
    });
}

// Modal QR actions
const btnCancelQr = document.getElementById('btn-cancel-qr');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const btnSaveQr = document.getElementById('btn-save-qr');

if(btnCancelQr) btnCancelQr.addEventListener('click', () => document.getElementById('qr-modal').style.display = 'none');
if(btnCloseQrModal) btnCloseQrModal.addEventListener('click', () => document.getElementById('qr-modal').style.display = 'none');

if(btnSaveQr) {
    btnSaveQr.addEventListener('click', async () => {
        const id = document.getElementById('qr-id').value;
        const name = document.getElementById('qr-name').value.trim();
        const type = document.getElementById('qr-type').value;
        const message = document.getElementById('qr-message').value.trim();
        
        if(!name || !message) {
            alert("Nombre y Mensaje son obligatorios");
            return;
        }

        const data = { id, name, type, message };
        await fetch('/api/quick-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        document.getElementById('qr-modal').style.display = 'none';
        showToast('Respuesta guardada');
        await loadQuickResponses();
    });
}

// Popup en chat
const btnOpenQr = document.getElementById('btn-open-qr');
const qrPopupMenu = document.getElementById('qr-popup-menu');
const qrPopupList = document.getElementById('qr-popup-list');

if(btnOpenQr) {
    btnOpenQr.addEventListener('click', (e) => {
        e.stopPropagation();
        if(qrPopupMenu.style.display === 'block') {
            qrPopupMenu.style.display = 'none';
        } else {
            // Llenar popup
            qrPopupList.innerHTML = '';
            if(allQuickResponses.length === 0) {
                qrPopupList.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 12px;">No hay respuestas rápidas. Créalas en la sección "Rápidas".</div>`;
            } else {
                allQuickResponses.forEach(qr => {
                    const item = document.createElement('div');
                    item.className = 'qr-popup-item';
                    item.innerHTML = `<div class="qr-popup-name">${qr.name}</div><div class="qr-popup-msg">${qr.message}</div>`;
                    item.onclick = () => {
                        const input = document.getElementById('message-input');
                        input.value = input.value ? input.value + ' ' + qr.message : qr.message;
                        input.focus();
                        qrPopupMenu.style.display = 'none';
                    };
                    qrPopupList.appendChild(item);
                });
            }
            qrPopupMenu.style.display = 'block';
        }
    });
}

document.addEventListener('click', (e) => {
    if(qrPopupMenu && qrPopupMenu.style.display === 'block' && !qrPopupMenu.contains(e.target) && e.target !== btnOpenQr) {
        qrPopupMenu.style.display = 'none';
    }
});

// ===== TOAST =====
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ===== COLORES =====
function getColorForString(str) {
    if (!str) return '#4f46e5';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#0284c7'];
    return colors[Math.abs(hash) % colors.length];
}

// ===== INICIALIZACIÓN =====
setInterval(loadData, 8000);
loadBrandState();
loadData();
loadQuickResponses();

// ===== EMOJI PICKER =====
document.addEventListener('DOMContentLoaded', () => {
    if (typeof picmoPopup !== 'undefined') {
        const btnEmoji = document.getElementById('btn-emoji');
        const messageInput = document.getElementById('message-input');
        if (btnEmoji && messageInput) {
            const picker = picmoPopup.createPopup({}, {
                referenceElement: btnEmoji,
                triggerElement: btnEmoji,
                position: 'top-start'
            });
            
            btnEmoji.addEventListener('click', () => {
                picker.toggle();
            });
            
            picker.addEventListener('emoji:select', (selection) => {
                const cursorPos = messageInput.selectionStart;
                const text = messageInput.value;
                messageInput.value = text.slice(0, cursorPos) + selection.emoji + text.slice(cursorPos);
                messageInput.focus();
                // Move cursor after inserted emoji
                messageInput.selectionStart = messageInput.selectionEnd = cursorPos + selection.emoji.length;
            });
        }
    }
});



