# Integración WispHub a Meta WhatsApp Cloud API

Este es el código fuente (Backend) para recibir Webhooks de WispHub y enviar Plantillas Oficiales de WhatsApp a través de Meta.

## Estructura del proyecto
- `server.js`: Contiene toda la lógica. Recibe la petición en `/wisphub-webhook` y la envía a Meta.
- `package.json`: Dependencias de Node.js (Express, Axios, dotenv).
- `.env.example`: Plantilla de variables de entorno (credenciales).

---

## Cómo subir esto a DigitalOcean (App Platform)

DigitalOcean "App Platform" es la forma más fácil de alojar este código. Sigue estos pasos cuando Meta te desbloquee la cuenta:

### 1. Sube el código a GitHub
1. Crea una cuenta gratuita en [GitHub](https://github.com/).
2. Crea un nuevo "Repositorio Privado" llamado `wisphub-meta-api`.
3. Sube los archivos `server.js` y `package.json` a ese repositorio. *(No subas archivos `.env` reales a GitHub nunca)*.

### 2. Conecta GitHub con DigitalOcean
1. Entra a tu cuenta de **DigitalOcean** y ve a **"Apps"** (App Platform).
2. Haz clic en **Create App** (Crear App).
3. Selecciona **GitHub** como proveedor y autoriza tu cuenta.
4. Selecciona el repositorio `wisphub-meta-api` que acabas de crear.
5. DigitalOcean detectará automáticamente que es una aplicación de Node.js.

### 3. Configura las Variables de Entorno
En la pantalla de configuración de DigitalOcean, verás una sección llamada **"Environment Variables"** (Variables de Entorno). Haz clic en "Edit" y agrega estas dos:

* Key: `META_ACCESS_TOKEN` | Value: *(Pega aquí tu Token Largo de Meta)*
* Key: `META_PHONE_NUMBER_ID` | Value: *(Pega aquí el ID de tu número de teléfono)*
* Key: `META_TEMPLATE_NAME` | Value: `recordatorio_pago` *(O el nombre exacto de tu plantilla en Meta)*

### 4. Lanzar la App
1. Elige el plan más barato (Basic - $5/mes).
2. Haz clic en **Launch App** (Lanzar App).
3. Espera un par de minutos a que se construya. Cuando termine, DigitalOcean te dará una URL pública (ejemplo: `https://wisphub-api-xyz.ondigitalocean.app`).

### 5. Configurar WispHub
1. Ve a tu panel de WispHub.
2. Ve a la sección de **Webhooks** o **Notificaciones por API**.
3. Pega la URL que te dio DigitalOcean y agrégale `/wisphub-webhook` al final. 
   *(Ejemplo: `https://wisphub-api-xyz.ondigitalocean.app/wisphub-webhook`)*
4. Configúralo para que se dispare cuando haya un recordatorio de pago.

¡Listo! Tu integración funcionará 24/7.
