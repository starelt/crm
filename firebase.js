const admin = require('firebase-admin');

// Debes generar este archivo JSON desde Firebase -> Configuración del proyecto -> Cuentas de servicio
// Y pegarlo en la raíz del proyecto. Si estás en DigitalOcean, puedes pasar el JSON comprimido en una variable de entorno
// o subir el archivo al repositorio (cuidado con la seguridad). 

// Para hacerlo más seguro en DigitalOcean, leeremos las credenciales desde una variable de entorno.
let db = null;

try {
    if (process.env.FIREBASE_CREDENTIALS) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("Conectado a Firebase Firestore con éxito.");
    } else {
        console.warn("ADVERTENCIA: FIREBASE_CREDENTIALS no está configurado. El CRM no guardará los mensajes.");
    }
} catch (error) {
    console.error("Error conectando a Firebase:", error);
}

module.exports = db;
