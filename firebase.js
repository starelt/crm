const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db = null;

try {
    if (process.env.FIREBASE_CREDENTIALS) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        const app = initializeApp({
            credential: cert(serviceAccount)
        });
        db = getFirestore(app);
        console.log("Conectado a Firebase Firestore con éxito.");
    } else {
        console.warn("ADVERTENCIA: FIREBASE_CREDENTIALS no está configurado. El CRM no guardará los mensajes.");
    }
} catch (error) {
    console.error("Error conectando a Firebase:", error);
}

module.exports = db;
