# Body App — Nissan NDT

Trazabilidad de reparacion de planchas. Tres piezas, un solo repo:

```
TestApp/          App Expo. Operadores en Android + dashboard del admin en web.
backend_python/   API FastAPI + WebSocket.
```

Los **operadores** capturan daños desde el telefono; el **ADMIN** ve los KPIs
en el navegador. Es la misma base de codigo: `TestApp/app/dashboard.tsx` se
restringe solo con `roleId === ADMIN` y `Platform.OS === 'web'`.

## Arrancar en local

**Backend** (necesita Docker):

```bash
cd backend_python/backend_python
docker compose up --build
```

Levanta la API en `:3001` con Postgres ya cargado (schema + usuarios de
prueba). Detalle en [backend_python/backend_python/README.md](backend_python/backend_python/README.md).

**App**:

```bash
cd TestApp
npm install
npx expo start
```

Apunta la app al backend con `TestApp/.env.local` (copia `.env.example`).

## Usuarios de prueba

Contraseña `admin123` para todos: `admin@`, `wws@`, `scm@`, `body@`,
`carrier@`, `wty@` (todos `@nissan.com`).

## Desplegado

| Pieza | Servicio |
|---|---|
| Backend | Render (imagen Docker desde GHCR) |
| Base de datos | Neon (Postgres) |
| Fotos | Cloudinary |
| Dashboard web | Vercel |
| APK | EAS Build (perfil `interna`) |

Procedimientos: [DEPLOY.md](backend_python/backend_python/DEPLOY.md) para el
backend, [WEB-DEPLOY.md](TestApp/WEB-DEPLOY.md) para el dashboard.

Todo corre en capa gratuita. El backend en Render se duerme tras 15 min sin
trafico: la primera peticion puede tardar ~50 s, no es un fallo.

## Configuracion

Ningun secreto esta en el repo. Cada entorno necesita:

| Variable | Donde |
|---|---|
| `DATABASE_URL` | backend |
| `JWT_SECRET` | backend |
| `CLOUDINARY_URL` | backend — `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `EXPO_PUBLIC_API_BASE_URL` | app |
| `EXPO_PUBLIC_REALTIME_URL` | app |

Las de la app se hornean en el bundle al compilar, no se leen en tiempo de
ejecucion: si cambia la URL del backend hay que volver a compilar.
