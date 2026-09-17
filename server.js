require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('./firebase');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const path = require('path');

// Servir archivos del frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); // Fallback por si los archivos se suben a la raíz

app.get('/debug', (req, res) => {
    res.json({
        hasFirebaseCredentials: !!process.env.FIREBASE_CREDENTIALS,
        isDbConnected: !!db,
        firebaseCredLength: process.env.FIREBASE_CREDENTIALS ? process.env.FIREBASE_CREDENTIALS.length : 0,
        hasMetaToken: !!process.env.META_ACCESS_TOKEN,
        hasMetaPhoneId: !!process.env.META_PHONE_NUMBER_ID
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'index.html'), (err2) => {
                if (err2) res.send('API CRMDigitech funcionando correctamente.');
            });
        }
    });
});

app.get('/app.v2.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.v2.js'), (err) => {
        if (err) res.sendFile(path.join(__dirname, 'app.v2.js'));
    });
});

app.get('/styles.v2.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'styles.v2.css'), (err) => {
        if (err) res.sendFile(path.join(__dirname, 'styles.v2.css'));
    });
});

const { META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, PORT, META_TEMPLATE_NAME } = process.env;

// ==========================================
// 1. WEBHOOK PARA RECIBIR MENSAJES DE META
// ==========================================

// Verificación inicial de Meta
app.get('/webhook', (req, res) => {
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && (token === "crmdigitech_meta_token" || token === "wisphub_meta_token")) {
            console.log("WEBHOOK META VERIFICADO");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send("Faltan parámetros");
    }
});

// Recepción de mensajes entrantes de clientes
app.post('/webhook', async (req, res) => {
    try {
        let body = req.body;
        if (body.object) {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                let msg = body.entry[0].changes[0].value.messages[0];
                let from = msg.from; // Número de quien envía o identificador BSUID
                let contactInfo = body.entry[0].changes[0].value.contacts ? body.entry[0].changes[0].value.contacts[0] : null;
                let profileName = contactInfo?.profile?.name || '';
                let rawUsername = contactInfo?.username || contactInfo?.profile?.username || '';
                if (!rawUsername && profileName.startsWith('@')) rawUsername = profileName;
                if (rawUsername && !rawUsername.startsWith('@')) rawUsername = '@' + rawUsername;
                let name = profileName || rawUsername || from;
                let text = "";

                let mediaId = null;
                let mediaUrl = null;
                let mimeType = null;
                let caption = null;

                if (msg.type === "text") {
                    text = msg.text.body;
                } else if (msg.type === "image") {
                    mediaId = msg.image ? msg.image.id : null;
                    mimeType = msg.image ? (msg.image.mime_type || 'image/jpeg') : 'image/jpeg';
                    caption = msg.image ? (msg.image.caption || '') : '';
                    text = caption ? `📷 ${caption}` : "📷 [Imagen]";
                    if (mediaId) mediaUrl = `/api/media/${mediaId}`;
                } else if (msg.type === "audio") {
                    mediaId = msg.audio ? msg.audio.id : null;
                    mimeType = msg.audio ? (msg.audio.mime_type || 'audio/ogg') : 'audio/ogg';
                    text = "🎤 [Nota de voz]";
                    if (mediaId) mediaUrl = `/api/media/${mediaId}`;
                } else if (msg.type === "video") {
                    mediaId = msg.video ? msg.video.id : null;
                    mimeType = msg.video ? (msg.video.mime_type || 'video/mp4') : 'video/mp4';
                    caption = msg.video ? (msg.video.caption || '') : '';
                    text = caption ? `🎥 ${caption}` : "🎥 [Video]";
                    if (mediaId) mediaUrl = `/api/media/${mediaId}`;
                } else if (msg.type === "document") {
                    mediaId = msg.document ? msg.document.id : null;
                    mimeType = msg.document ? (msg.document.mime_type || 'application/pdf') : 'application/pdf';
                    caption = msg.document ? (msg.document.filename || msg.document.caption || '') : '';
                    text = `📄 ${caption || 'Documento'}`;
                    if (mediaId) mediaUrl = `/api/media/${mediaId}`;
                } else if (msg.type === "location") {
                    let lat = msg.location.latitude;
                    let lng = msg.location.longitude;
                    let address = msg.location.name || msg.location.address || "Ubicación compartida";
                    text = `📍 ${address} - Mapa: https://maps.google.com/?q=${lat},${lng}`;
                } else {
                    text = `[Mensaje tipo: ${msg.type}]`;
                }

                // LOGICA DE TÉCNICOS REPORTANDO RESOLUCIÓN
                let handledByTech = false;
                if (msg.type === "text" && msg.text.body.toLowerCase().includes("#listo") && msg.context && msg.context.id && db) {
                    // Verificar si el que envía es un técnico
                    const techsSnapshot = await db.collection('technicians').where('phone', '==', from).get();
                    if (!techsSnapshot.empty) {
                        const techData = techsSnapshot.docs[0].data();
                        
                        // Buscar el chat que tiene este context.id como assignmentMsgId
                        const assignedChats = await db.collection('chats').where('assignmentMsgId', '==', msg.context.id).limit(1).get();
                        
                        if (!assignedChats.empty) {
                            handledByTech = true;
                            const clientDoc = assignedChats.docs[0];
                            const clientId = clientDoc.id;
                            let clientData = clientDoc.data();
                            
                            // Remover etiquetas de AVERIA o INSTALACION (o cualquier etiqueta)
                            // Según requerimiento: "quitar la etiqueta". 
                            // Podríamos limpiar todas o solo las asignadas. Limpiaremos todas para simplificar.
                            const updatedTags = clientData.tags ? clientData.tags.filter(t => !["averia", "instalacion"].includes(t.name.toLowerCase())) : [];
                            
                            await db.collection('chats').doc(clientId).set({
                                assignedToId: null, // Desasignar
                                assignedToName: null,
                                tags: updatedTags,
                                lastUpdated: Date.now()
                            }, { merge: true });
                            
                            // Responder al técnico confirmando
                            const meta_token = process.env.META_ACCESS_TOKEN;
                            const phone_number_id = process.env.META_PHONE_NUMBER_ID;
                            if (meta_token && phone_number_id) {
                                try {
                                    await axios({
                                        method: 'POST',
                                        url: `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
                                        headers: { 'Authorization': `Bearer ${meta_token}`, 'Content-Type': 'application/json' },
                                        data: {
                                            messaging_product: "whatsapp",
                                            to: from,
                                            type: "text",
                                            text: { body: `✅ El caso de +${clientId} ha sido marcado como resuelto.` },
                                            context: { message_id: msg.id }
                                        }
                                    });
                                } catch(e) { console.error("Error confirmando a técnico:", e.message); }
                            }
                        }
                    }
                }

                // Guardar en Firebase (solo si no fue un comando manejado por el técnico para evitar que el CRM del cliente se ensucie con mensajes del técnico, 
                // A MENOS que queramos registrar que el técnico mandó #listo. Lo registraremos en el chat del cliente)
                if (db && !handledByTech) {
                    const chatDoc = await db.collection('chats').doc(from).get();
                    const unreadCount = (chatDoc.exists && chatDoc.data().unreadCount) ? chatDoc.data().unreadCount + 1 : 1;

                    const chatUpdate = {
                        phone: from,
                        name: name,
                        lastMessage: text,
                        lastUpdated: Date.now(),
                        unreadCount: unreadCount
                    };
                    if (rawUsername) chatUpdate.username = rawUsername;
                    if (!/^\d+$/.test(from)) chatUpdate.isUsernameChat = true;

                    await db.collection('chats').doc(from).set(chatUpdate, { merge: true });


                    await db.collection('chats').doc(from).collection('messages').add({
                        text: text,
                        timestamp: Date.now(),
                        direction: 'inbound',
                        type: msg.type,
                        mediaId: mediaId,
                        mediaUrl: mediaUrl,
                        mimeType: mimeType,
                        caption: caption
                    });
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("Error procesando webhook:", error);
        res.sendStatus(500);
    }
});

// ==========================================
// 2. ENDPOINT PARA PASARELA DE MENSAJES (CRMDigitech)
// ==========================================
app.post(['/crmdigitech-webhook', '/gateway-webhook', '/wisphub-webhook'], async (req, res) => {
    console.log("🚨 Notificación CRMDigitech recibida. Datos:", JSON.stringify(req.body, null, 2));
    
    let meta_token = META_ACCESS_TOKEN;
    if (req.headers.authorization) {
        meta_token = req.headers.authorization.replace('Bearer ', '').trim();
    }

    const phone_number_id = req.body.phone_number_id || META_PHONE_NUMBER_ID;

    if (!meta_token || !phone_number_id) {
        return res.status(400).json({ error: "Falta Token." });
    }

    if (!req.body.telefono) return res.status(400).json({ error: "Teléfono obligatorio" });

    let telefono = req.body.telefono;
    let templateName = req.body.template || req.query.template || META_TEMPLATE_NAME || "aviso_wisphub2";
    
    // Meta API prohíbe saltos de línea (\n, \r). Función limpiadora:
    const cleanText = (str) => str ? str.replace(/[\r\n\t]+/g, ' ').replace(/\s{5,}/g, ' ') : "";

    // Construir parámetros dinámicos (var1, var2, var3...)
    const varKeys = Object.keys(req.body).filter(k => k.startsWith('var')).sort();
    let parameters = [];
    
    if (varKeys.length > 0) {
        parameters = varKeys.map(k => ({ type: "text", text: cleanText(req.body[k]) }));
    } else if (req.body.mensaje) {
        parameters = [{ type: "text", text: cleanText(req.body.mensaje) }];
    }

    let phone_number = telefono.toString().replace(/\D/g, ''); 
    if (phone_number.length === 10) phone_number = "1" + phone_number; 

    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
            headers: { 'Authorization': `Bearer ${meta_token}`, 'Content-Type': 'application/json' },
            data: {
                messaging_product: "whatsapp",
                to: phone_number,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: templateName === "aviso_wisphub2" ? "es_DO" : "es" },
                    components: parameters.length > 0 ? [
                        {
                            type: "body",
                            parameters: parameters
                        }
                    ] : []
                }
            }
        });

        if (db) {
            const previewText = parameters.length > 0 ? parameters[0].text : templateName;
            const textPreview = `[Notificación]: ${previewText.substring(0, 30)}...`;
            await db.collection('chats').doc(phone_number).set({
                phone: phone_number,
                lastMessage: textPreview,
                lastUpdated: Date.now()
            }, { merge: true });

            await db.collection('chats').doc(phone_number).collection('messages').add({
                text: parameters.length > 0 ? parameters.map((p, i) => `{{${i+1}}}: ${p.text}`).join(' | ') : templateName,
                timestamp: Date.now(),
                direction: 'outbound',
                type: 'template'
            });
        }
        res.status(200).json({ success: true, meta_response: response.data });
    } catch (error) {
        console.error("Error en webhook wisphub:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error", details: error.message });
    }
});

// ==========================================
// 3. API INTERNA PARA EL CRM (Frontend)
// ==========================================

// ── CRM Stats Endpoint (para DigitallyHub Panel) ──────────────────────────────
const CRM_API_KEY = process.env.CRM_API_KEY || 'digitallyhub_crm_key';

app.get('/api/crm-stats', async (req, res) => {
    const key = req.headers['x-api-key'] || '';
    if (CRM_API_KEY && key !== CRM_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!db) return res.json({ totalChats: 0, unreadChats: 0, activeTechnicians: 0, chatsToday: 0, resolvedToday: 0, tagBreakdown: {} });
    try {
        const snapshot = await db.collection('chats').get();
        const now = Date.now();
        const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
        const todayMs = startOfToday.getTime();

        let totalChats = 0, unreadChats = 0, activeTechnicians = new Set(), chatsToday = 0, resolvedToday = 0;
        const tagBreakdown = {};

        snapshot.forEach(doc => {
            const d = doc.data();
            totalChats++;
            if (d.unreadCount > 0) unreadChats++;
            if (d.assignedToId) activeTechnicians.add(d.assignedToId);
            if (d.lastUpdated && d.lastUpdated >= todayMs) chatsToday++;
            if (d.resolvedAt && d.resolvedAt >= todayMs) resolvedToday++;
            if (d.tags && Array.isArray(d.tags)) {
                d.tags.forEach(t => {
                    if (t.name) tagBreakdown[t.name] = (tagBreakdown[t.name] || 0) + 1;
                });
            }
        });

        res.json({
            totalChats,
            unreadChats,
            activeTechnicians: activeTechnicians.size,
            chatsToday,
            resolvedToday,
            tagBreakdown,
            generatedAt: now
        });
    } catch (error) {
        console.error('Error generating CRM stats:', error.message);
        res.status(500).json({ error: error.message });
    }
});


// Endpoint proxy para servir imágenes, notas de voz, videos y documentos de Meta
app.get('/api/media/:mediaId', async (req, res) => {
    try {
        const { mediaId } = req.params;
        const meta_token = process.env.META_ACCESS_TOKEN;
        if (!meta_token) return res.status(500).send("Falta Token de Meta");

        // 1. Obtener la URL del archivo desde Meta Graph API
        const metaRes = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${meta_token}` }
        });

        const fileUrl = metaRes.data.url;
        const mimeType = metaRes.data.mime_type;

        // 2. Descargar y transmitir el stream binario al cliente
        const fileStream = await axios.get(fileUrl, {
            headers: { 'Authorization': `Bearer ${meta_token}` },
            responseType: 'stream'
        });

        if (mimeType) res.setHeader('Content-Type', mimeType);
        fileStream.data.pipe(res);
    } catch (error) {
        console.error("Error obteniendo multimedia de Meta:", error.response ? error.response.data : error.message);
        res.status(404).send("Multimedia no encontrada o token expirado");
    }
});

// Endpoint de chats (con delta sync)
app.get('/api/chats', async (req, res) => {
    if (!db) return res.json([]);
    try {
        // Protección contra pestañas viejas (V2) que no envían 'since'
        if (req.query.since === undefined) {
            return res.json([]);
        }

        const since = parseInt(req.query.since) || 0;
        let query = db.collection('chats');
        
        if (since > 0) {
            query = query.where('lastUpdated', '>', since);
        } else {
            query = query.orderBy('lastUpdated', 'desc').limit(50);
        }
        
        const snapshot = await query.get();
        const chats = [];
        snapshot.forEach(doc => chats.push(doc.data()));
        res.json(chats);
    } catch (error) {
        console.error("Error obteniendo chats:", error);
        res.status(500).json({ error: "Error obteniendo chats", details: error.message });
    }
});

app.get('/api/messages/:phone', async (req, res) => {
    if (!db) return res.json([]);
    try {
        const phone = req.params.phone;
        const snapshot = await db.collection('chats').doc(phone).collection('messages').orderBy('timestamp', 'asc').get();
        const messages = [];
        snapshot.forEach(doc => messages.push(doc.data()));
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo mensajes" });
    }
});

app.post('/api/send', async (req, res) => {
    const { phone, text } = req.body;
    const phone_number_id = process.env.META_PHONE_NUMBER_ID;
    const meta_token = process.env.META_ACCESS_TOKEN;

    if (!phone || !text) return res.status(400).json({ error: "Faltan datos" });

    try {
        const response = await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
            headers: { 'Authorization': `Bearer ${meta_token}`, 'Content-Type': 'application/json' },
            data: { messaging_product: "whatsapp", to: phone, text: { body: text } }
        });

        if (db) {
            await db.collection('chats').doc(phone).set({ lastMessage: text, lastUpdated: Date.now(), unreadCount: 0 }, { merge: true });
            await db.collection('chats').doc(phone).collection('messages').add({
                text: text, timestamp: Date.now(), direction: 'outbound', type: 'text'
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error enviando a Meta" });
    }
});

// Marcar como leído
app.post('/api/chats/:phone/read', async (req, res) => {
    if (!db) return res.json({ success: false });
    try {
        await db.collection('chats').doc(req.params.phone).set({ unreadCount: 0 }, { merge: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

// Agregar / Editar Contacto
app.post('/api/contacts', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { phone, name, firstName, lastName, address, coordinates, avatarUrl, username } = req.body;
    if (!phone) return res.status(400).json({ error: "Teléfono o identificador obligatorio" });

    let phone_number = phone.toString().trim();
    // Normalizar como teléfono únicamente si contiene dígitos y caracteres telefónicos
    if (/^[\d\s\+\-\(\)]+$/.test(phone_number)) {
        phone_number = phone_number.replace(/\D/g, '');
        if (phone_number.length === 10) phone_number = "1" + phone_number;
    }

    const fName = (firstName || '').trim();
    const lName = (lastName || '').trim();
    let fullName = (name || '').trim();
    if (!fullName && (fName || lName)) {
        fullName = `${fName} ${lName}`.trim();
    }
    if (!fullName) fullName = phone_number;

    const loc = (coordinates || address || '').trim();
    let mapsUrl = null;
    if (loc) {
        mapsUrl = loc.startsWith('http') ? loc : `https://maps.google.com/?q=${encodeURIComponent(loc)}`;
    }

    try {
        const updateData = {
            phone: phone_number,
            name: fullName,
            firstName: fName,
            lastName: lName,
            address: (address || '').trim(),
            coordinates: (coordinates || loc).trim(),
            locationUrl: mapsUrl,
            lastUpdated: Date.now()
        };
        if (avatarUrl !== undefined) {
            updateData.avatarUrl = avatarUrl;
        }
        if (username !== undefined) {
            const cleanUser = username.trim();
            updateData.username = cleanUser ? (cleanUser.startsWith('@') ? cleanUser : `@${cleanUser}`) : '';
        }
        if (!/^\d+$/.test(phone_number)) {
            updateData.isUsernameChat = true;
        }

        await db.collection('chats').doc(phone_number).set(updateData, { merge: true });
        res.json({ success: true, phone: phone_number, name: fullName, username: updateData.username, locationUrl: mapsUrl, avatarUrl });
    } catch (error) {
        console.error("Error guardando contacto:", error);
        res.status(500).json({ error: "Error al guardar contacto" });
    }
});


// Etiquetas
app.post('/api/chats/:phone/tags', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { name, color } = req.body;
    const phone = req.params.phone;

    try {
        const chatRef = db.collection('chats').doc(phone);
        const doc = await chatRef.get();
        let tags = doc.exists && doc.data().tags ? doc.data().tags : [];
        
        const existingIndex = tags.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
        if (existingIndex >= 0) tags[existingIndex].color = color;
        else tags.push({ name, color });

        await chatRef.set({ tags: tags }, { merge: true });
        res.json({ success: true, tags });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

app.delete('/api/chats/:phone/tags/:tagName', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { phone, tagName } = req.params;

    try {
        const chatRef = db.collection('chats').doc(phone);
        const doc = await chatRef.get();
        if (doc.exists && doc.data().tags) {
            let tags = doc.data().tags.filter(t => t.name.toLowerCase() !== tagName.toLowerCase());
            await chatRef.set({ tags: tags }, { merge: true });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

// ==========================================
// 4. API DE TÉCNICOS Y DESPACHO
// ==========================================

app.get('/api/technicians', async (req, res) => {
    if (!db) return res.json([]);
    try {
        // Obtenemos los técnicos
        const snapshot = await db.collection('technicians').get();
        const techs = [];
        snapshot.forEach(doc => techs.push({ id: doc.id, ...doc.data() }));

        // Calcular cuántos chats tiene asignados cada técnico (Balanceo)
        const chatsSnapshot = await db.collection('chats').get();
        const assignments = {};
        chatsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.assignedToId) {
                assignments[data.assignedToId] = (assignments[data.assignedToId] || 0) + 1;
            }
        });

        // Adjuntar conteo
        const techsWithCount = techs.map(t => ({
            ...t,
            activeCases: assignments[t.id] || 0
        }));

        res.json(techsWithCount);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error" });
    }
});

app.post('/api/technicians', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { name, phone, brigade } = req.body;
    try {
        let techPhone = phone.toString().replace(/\D/g, ''); 
        if (techPhone.length === 10) techPhone = "1" + techPhone; 

        const newTech = await db.collection('technicians').add({ name, phone: techPhone, brigade });
        res.json({ success: true, id: newTech.id });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

app.delete('/api/technicians/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    try {
        await db.collection('technicians').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

// Endpoint para ver qué devuelve WispHub exactamente (Para depurar)
app.get('/api/debug-wisphub/:phone', async (req, res) => {
    const wisphub_key = process.env.WISPHUB_API_KEY;
    if (!wisphub_key) return res.status(500).json({ error: "Falta API KEY de WispHub" });
    try {
        const shortPhone = req.params.phone.toString().slice(-10);
        const wisphubRes = await axios({
            method: 'GET',
            url: `https://api.wisphub.net/api/clientes/?telefono_contains=${shortPhone}`,
            headers: { 'Authorization': `Api-Key ${wisphub_key}` }
        });
        res.json(wisphubRes.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Asignar y Notificar
app.post('/api/assign', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { phone, technicianId, tag } = req.body; // phone = cliente, technicianId = id del tecnico
    const phone_number_id = process.env.META_PHONE_NUMBER_ID;
    const meta_token = process.env.META_ACCESS_TOKEN;
    const wisphub_key = process.env.WISPHUB_API_KEY;

    try {
        // Obtener datos base del cliente del CRM
        const clientDoc = await db.collection('chats').doc(phone).get();
        let clientData = clientDoc.exists ? clientDoc.data() : { name: phone, phone: phone };
        let tags = clientData.tags || [];

        // --- INTEGRACIÓN WISPHUB ---
        // Consultar API de WispHub para buscar al cliente por su número de teléfono
        let mapsLink = "No registrada";
        if (wisphub_key) {
            try {
                // El telefono en WispHub puede no tener el codigo de país completo, probamos con los ultimos 10 digitos
                const shortPhone = phone.toString().slice(-10);
                const wisphubRes = await axios({
                    method: 'GET',
                    url: `https://api.wisphub.net/api/clientes/?telefono_contains=${shortPhone}`,
                    headers: { 'Authorization': `Api-Key ${wisphub_key}` }
                });
                
                if (wisphubRes.data.results && wisphubRes.data.results.length > 0) {
                    const wCliente = wisphubRes.data.results[0];
                    // Actualizar nombre y apellido
                    clientData.name = `${wCliente.nombre || ''} ${wCliente.apellidos || ''}`.trim();
                    
                    // Extraer ubicación si existe (puede estar en el cliente o dentro de sus servicios)
                    let coord = wCliente.coordenadas;
                    let dir = wCliente.direccion;
                    
                    if (!coord && wCliente.servicios && wCliente.servicios.length > 0) {
                        coord = wCliente.servicios[0].coordenadas;
                        if (!dir) dir = wCliente.servicios[0].direccion;
                    }

                    if (coord) {
                        mapsLink = `https://www.google.com/maps?q=${coord}`;
                    } else if (dir) {
                        mapsLink = dir;
                    }
                }
            } catch (wError) {
                console.error("Error consultando WispHub API:", wError.message);
                // Si falla WispHub, continuamos con los datos que ya tenemos
            }
        }

        // Obtener datos del técnico
        const techDoc = await db.collection('technicians').doc(technicianId).get();
        if (!techDoc.exists) return res.status(404).json({ error: "Técnico no encontrado" });
        const techData = techDoc.data();

        // 1. Guardar la asignación en el chat (Firebase)
        const updateData = {
            assignedToId: technicianId,
            assignedToName: techData.name,
            name: clientData.name // Guardar el nombre actualizado
        };

        if (tag) {
            const existingIndex = tags.findIndex(t => t.name.toLowerCase() === tag.name.toLowerCase());
            if (existingIndex >= 0) tags[existingIndex].color = tag.color;
            else tags.push({ name: tag.name, color: tag.color });
            updateData.tags = tags;
        }

        await db.collection('chats').doc(phone).set(updateData, { merge: true });

        // 2. Enviar WhatsApp al Técnico
        // Nota: Debes crear una plantilla en Meta Developers llamada "despacho_tecnico"
        // que acepte 4 variables: {{1}} Tecnico, {{2}} Cliente, {{3}} Telefono, {{4}} Ubicacion
        if (meta_token && phone_number_id) {
            try {
                const metaRes = await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
                    headers: { 'Authorization': `Bearer ${meta_token}`, 'Content-Type': 'application/json' },
                    data: {
                        messaging_product: "whatsapp",
                        to: techData.phone,
                        type: "template",
                        template: {
                            name: "despacho_tecnico", // Asegúrate de crear esta plantilla
                            language: { code: "es" },
                            components: [
                                {
                                    type: "body",
                                    parameters: [
                                        { type: "text", text: techData.name }, // {{1}}
                                        { type: "text", text: clientData.name }, // {{2}}
                                        { type: "text", text: phone },  // {{3}}
                                        { type: "text", text: mapsLink } // {{4}}
                                    ]
                                }
                            ]
                        }
                    }
                });
                
                // Guardar el ID del mensaje enviado al técnico para que pueda hacer "reply"
                if (metaRes.data && metaRes.data.messages && metaRes.data.messages.length > 0) {
                    await db.collection('chats').doc(phone).set({
                        assignmentMsgId: metaRes.data.messages[0].id
                    }, { merge: true });
                }
            } catch (notifyError) {
                console.warn("No se pudo notificar al técnico por WhatsApp (plantilla faltante o error Meta):", notifyError.response ? notifyError.response.data : notifyError.message);
                // No rompemos la ejecución, el técnico igual queda asignado en Firebase
            }
        }

        res.json({ success: true, nameUpdated: clientData.name });
    } catch (error) {
        console.error("Error asignando:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error en asignación" });
    }
});

// Desasignar Cliente
app.post('/api/unassign', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { phone } = req.body;
    try {
        await db.collection('chats').doc(phone).set({
            assignedToId: null,
            assignedToName: null
        }, { merge: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

// ==========================================
// 5. API PARA RESPUESTAS RÁPIDAS
// ==========================================
app.get('/api/quick-responses', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    try {
        const snapshot = await db.collection('quickResponses').get();
        const responses = [];
        snapshot.forEach(doc => responses.push({ id: doc.id, ...doc.data() }));
        res.json(responses);
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

app.post('/api/quick-responses', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { id, name, message, type } = req.body;
    try {
        const data = {
            name,
            message,
            type: type || 'Personal',
            updatedAt: Date.now()
        };
        
        if (id) {
            // Edit existing
            await db.collection('quickResponses').doc(id).set(data, { merge: true });
        } else {
            // Create new
            data.createdAt = Date.now();
            await db.collection('quickResponses').add(data);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

app.delete('/api/quick-responses/:id', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    try {
        await db.collection('quickResponses').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

const port = PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
