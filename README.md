# 🔐 Google OAuth Backend

Backend para autenticación con Google OAuth usando Express.js y MySQL.

## 🚀 Despliegue en Render

### Variables de Entorno Requeridas

Configura estas variables en Render Dashboard:

```env
DB_HOST=tu-host-mysql
DB_USER=tu-usuario-mysql
DB_PASSWORD=tu-contraseña-mysql
DB_NAME=nombre-base-datos
DB_PORT=3306

GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret
GOOGLE_CALLBACK_URL=https://tu-servicio.onrender.com/api/auth/google/callback

JWT_SECRET=tu-jwt-secret-seguro
SESSION_SECRET=tu-session-secret-seguro

FRONTEND_URL=https://tu-frontend-url.com
PORT=3000
```

### Configuración de Render

1. **Runtime:** Node
2. **Build Command:** `npm install`
3. **Start Command:** `node bin/www`

### Inicializar Base de Datos

Después del primer deploy, ve a la pestaña "Shell" en Render y ejecuta:

```bash
node -e "require('./config/database').initializeTables().then(() => process.exit(0))"
```

## 🛠️ Tecnologías

- Express.js
- Passport.js (Google OAuth 2.0)
- MySQL2
- JWT
- bcrypt
- CORS

## 📝 Endpoints

- `GET /api` - Health check
- `GET /api/auth/google` - Iniciar OAuth
- `GET /api/auth/google/callback` - Callback de Google
- `GET /api/auth/user` - Obtener usuario actual
- `POST /api/auth/logout` - Cerrar sesión
- `PUT /api/auth/user` - Actualizar perfil

## ⚠️ Notas

- Los servicios gratuitos de Render se duermen después de 15 minutos de inactividad
- Asegúrate de configurar todas las variables de entorno antes del deploy
- Actualiza las URLs de callback en Google Cloud Console
