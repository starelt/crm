require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('./firebase');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Servir el CRM Frontend

const { META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, PORT, META_TEMPLATE_NAME } = process.env;

app.get('/', (req, res) => {
    res.send('API WispHub-Meta y CRM funcionando correctamente.');
});

// ==========================================
// 1. WEBHOOK PARA RECIBIR MENSAJES DE META
// ==========================================

// Verificación inicial de Meta
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = "wisphub_meta_token";
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
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
                let from = msg.from; // Número de quien envía
                let name = body.entry[0].changes[0].value.contacts ? body.entry[0].changes[0].value.contacts[0].profile.name : from;
                let text = "";

                if (msg.type === "text") {
                    text = msg.text.body;
                } else {
                    text = `[Mensaje tipo: ${msg.type}]`;
                }

                // Guardar en Firebase
                if (db) {
                    await db.collection('chats').doc(from).set({
                        phone: from,
                        name: name,
                        lastMessage: text,
                        lastUpdated: Date.now()
                    }, { merge: true });

                    await db.collection('chats').doc(from).collection('messages').add({
                        text: text,
                        timestamp: Date.now(),
                        direction: 'inbound',
                        type: msg.type
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
// 2. ENDPOINT PARA WISPHUB (Plantillas)
// ==========================================
app.post('/wisphub-webhook', async (req, res) => {
    let meta_token = META_ACCESS_TOKEN;
    if (req.headers.authorization) {
        meta_token = req.headers.authorization.replace('Bearer ', '').trim();
    }

    const phone_number_id = req.body.phone_number_id || META_PHONE_NUMBER_ID;

    if (!meta_token || !phone_number_id) {
        return res.status(400).json({ error: "Falta Token." });
    }

    const { telefono, cliente, monto, fecha_vencimiento } = req.body;
    if (!telefono) return res.status(400).json({ error: "Teléfono obligatorio" });

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
                    name: META_TEMPLATE_NAME || "recordatorio_pago",
                    language: { code: "es" },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: cliente || "Cliente" },
                                { type: "text", text: monto || "0.00" },
                                { type: "text", text: fecha_vencimiento || "hoy" }
                            ]
                        }
                    ]
                }
            }
        });

        if (db) {
            const textPreview = `[Plantilla WispHub enviada: ${monto}]`;
            await db.collection('chats').doc(phone_number).set({
                phone: phone_number,
                name: cliente || phone_number,
                lastMessage: textPreview,
                lastUpdated: Date.now()
            }, { merge: true });

            await db.collection('chats').doc(phone_number).collection('messages').add({
                text: textPreview,
                timestamp: Date.now(),
                direction: 'outbound',
                type: 'template'
            });
        }
        res.status(200).json({ success: true, meta_response: response.data });
    } catch (error) {
        res.status(500).json({ error: "Error", details: error.message });
    }
});

// ==========================================
// 3. API INTERNA PARA EL CRM (Frontend)
// ==========================================

app.get('/api/chats', async (req, res) => {
    if (!db) return res.json([]);
    try {
        const snapshot = await db.collection('chats').orderBy('lastUpdated', 'desc').get();
        const chats = [];
        snapshot.forEach(doc => chats.push(doc.data()));
        res.json(chats);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo chats" });
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
            await db.collection('chats').doc(phone).set({ lastMessage: text, lastUpdated: Date.now() }, { merge: true });
            await db.collection('chats').doc(phone).collection('messages').add({
                text: text, timestamp: Date.now(), direction: 'outbound', type: 'text'
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error enviando a Meta" });
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

// Asignar y Notificar
app.post('/api/assign', async (req, res) => {
    if (!db) return res.status(500).json({ error: "Sin BD" });
    const { phone, technicianId } = req.body; // phone = cliente, technicianId = id del tecnico
    const phone_number_id = process.env.META_PHONE_NUMBER_ID;
    const meta_token = process.env.META_ACCESS_TOKEN;

    try {
        // Obtener datos del cliente
        const clientDoc = await db.collection('chats').doc(phone).get();
        const clientData = clientDoc.exists ? clientDoc.data() : { name: phone, phone: phone };

        // Obtener datos del técnico
        const techDoc = await db.collection('technicians').doc(technicianId).get();
        if (!techDoc.exists) return res.status(404).json({ error: "Técnico no encontrado" });
        const techData = techDoc.data();

        // 1. Guardar la asignación en el chat
        await db.collection('chats').doc(phone).set({
            assignedToId: technicianId,
            assignedToName: techData.name
        }, { merge: true });

        // 2. Enviar WhatsApp al Técnico (Usando Plantilla 'nueva_averia')
        // Tienes que crear esta plantilla en Meta Developers.
        if (meta_token && phone_number_id) {
            await axios({
                method: 'POST',
                url: `https://graph.facebook.com/v19.0/${phone_number_id}/messages`,
                headers: { 'Authorization': `Bearer ${meta_token}`, 'Content-Type': 'application/json' },
                data: {
                    messaging_product: "whatsapp",
                    to: techData.phone,
                    type: "template",
                    template: {
                        name: "nueva_averia", // Nombre de la plantilla en Meta
                        language: { code: "es" },
                        components: [
                            {
                                type: "body",
                                parameters: [
                                    { type: "text", text: techData.name }, // {{1}} Tecnico
                                    { type: "text", text: clientData.name }, // {{2}} Cliente
                                    { type: "text", text: clientData.phone }  // {{3}} Tel Cliente
                                ]
                            }
                        ]
                    }
                }
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error asignando:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error en asignación" });
    }
});

const port = PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
