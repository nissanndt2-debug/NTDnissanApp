# Nissan Body App - Backend Python

API REST + WebSocket para la trazabilidad de reparacion de unidades vehiculares (planchas para madrinas).

**Stack:** Python 3.x · FastAPI · Uvicorn · PostgreSQL (`psycopg` + `psycopg_pool`) · JWT (`PyJWT`) · WebSocket/SSE

---

## Docker (local, con Postgres + Azurite)

```bash
docker compose up --build
```

Levanta backend + Postgres (con el schema ya cargado desde `db-init/`) —
todo vive en la red interna de docker-compose. Usuarios de prueba en
`db-init/`: `admin@nissan.com`, `wws@nissan.com`, etc., contrasena
`admin123` para todos. Para probar la subida de fotos en local, define
`CLOUDINARY_URL` en tu entorno antes de `docker compose up` (Cloudinary es
gratis y no necesita emulador).

Para desplegar en Azure de verdad: ver **[DEPLOY.md](./DEPLOY.md)**.

---

## Como correr (local)
1. Crear entorno virtual:

```bash
python -m venv venv
```

2. Instalar dependencias:

```bash
venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. Crear `.env.local` a partir de `.env.example` y ajustar valores reales de JWT/base de datos.

4. Arrancar servidor:

```bash
venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 3001
```

Alternativas de arranque rapido:

```powershell
./start_server.ps1
./start_server.ps1 -Port 8030
./start_server.ps1 -NoReload
```

```cmd
start_server.cmd
```

Los scripts `start_server.ps1` y `start_server.cmd` usan `.env.local` (fallback a `.env`) en la raiz de `backend_Python/`.

La validacion de variables se define en `app/config/environment.py` y la plantilla recomendada esta en `.env.example`.

---

## Nota de despliegue

Si se despliega en Posit Connect, normalmente no se ejecuta `uvicorn` manualmente.
Connect levanta el proceso usando el entrypoint del proyecto y su runtime.

### Posit Connect (Publisher) - configuracion minima recomendada

Para evitar errores de import y de deteccion de modo de app:

- El `type` debe ser `python-fastapi`.
- El `entrypoint` debe ser `main.py` (en la raiz de `backend_Python`).
- El bundle debe incluir `main.py`, `requirements.txt` y toda la carpeta `app/`.
- Publica siempre desde la carpeta `backend_Python/` (no desde `backend_Python/app/`).

Si en `.posit/publish/*.toml` falta la carpeta `app/` en `files`, Connect sube solo `main.py` y `requirements.txt`, y fallan imports como `from app...`.

Valores esperados en los TOML de publicacion:

```toml
type = 'python-fastapi'
entrypoint = 'main.py'
files = [
    '/main.py',
    '/requirements.txt',
    '/app'
]
```

---

## Variables de entorno

Puedes tomar como base `backend_Python/.env.example`.

| Variable | Descripcion |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexion PostgreSQL |
| `JWT_SECRET` | Secreto para firmar/verificar tokens JWT |
| `PORT` | Puerto del servidor (default: 3001) |
| `CORS_ORIGIN` | Origenes permitidos separados por coma |
| `USE_HTTPS` | `true` para habilitar HTTPS |
| `NODE_ENV` | Entorno de ejecucion (default: `development`) |
| `JWT_EXPIRES_IN` | Tiempo de expiracion del access token (default: `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Tiempo de expiracion del refresh token (default: `30d`) |
| `CLOUDINARY_URL` | Credenciales de Cloudinary (`cloudinary://key:secret@cloud_name`) para subir/borrar fotos. Sin esto, `/uploads/photo` responde 501. |
| `BLOB_PUBLIC_BASE_URL` | Legacy: URL base publica de Vercel Blob permitida para validar `photoUrls` de fotos subidas antes de migrar a Cloudinary |
| `BLOB_READ_WRITE_TOKEN` | Legacy: token de Vercel Blob para eliminar esas fotos viejas. Si falta, el borrado queda en modo best-effort (no bloquea metodos de negocio). |

---

## Estructura de carpetas

```
backend_Python/
├── main.py                     # Punto de entrada unico (FastAPI app)
├── requirements.txt
├── .env
└── app/
    ├── config/
    ├── constants/
    ├── controllers/
    ├── middleware/
    ├── realtime/
    ├── repositories/
    ├── routes/
    ├── services/
    ├── types/
    └── utils/
```

---

## API Endpoints principales

### Autenticacion - `/auth`
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/auth/login` | Retorna JWT con datos del usuario |
| POST | `/auth/register` | Crea un usuario nuevo |

### Unidades - `/units`
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/units` | Lista unidades (filtros: `?status=`, `?limit=`) |
| POST | `/units` | Crea una unidad nueva (estado inicial: `REPORTED` o `SENT` segun rol) |
| GET | `/units/:id` | Detalle de una unidad con sus defectos |
| PUT | `/units/:id/status` | Cambia el estado de una unidad |
| PUT | `/units/:id/priority` | Asigna prioridad individual a una unidad |
| PUT | `/units/priority/order` | Reordena toda la cola de prioridad (drag & drop) |
| PUT | `/units/:id/estimated-time` | Actualiza horas estimadas de reparacion |
| PUT | `/units/:id/scm-decision` | SCM registra decision para unidad no disponible |
| PUT | `/units/:id/archive` | Archiva una unidad UNAVAILABLE con decision SCM |
| GET | `/units/archivable` | Lista UNAVAILABLE con decision SCM pendientes de archivar |
| POST | `/units/:id/defects` | Agrega un defecto a una unidad |
| PUT | `/units/:id/defects/:defectId` | Actualiza el grado de un defecto |
| DELETE | `/units/:id/defects/:defectId/photo` | Elimina las fotos del defecto (SCM/ADMIN) |
| GET | `/units/today` | Unidades del dia con datos de SCM (para DailyTrackingWidget) |
| GET | `/units/in-repair` | Unidades actuales en reparacion con tiempos estimados |
| GET | `/units/stats/defects` | Conteo de defectos V1/V2/V3 |
| GET | `/units/stats/by-status` | Conteo de unidades por estado |

### Logs - `/logs`
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/logs` | Historial paginado con timestamps por estado y filtros de fecha |
| GET | `/logs/export` | Exporta el historial a Excel (.xlsx) |

### Notificaciones - `/notifications`
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/notifications` | Notificaciones del usuario autenticado |
| PUT | `/notifications/:id/read` | Marca una notificacion como leida |
| PUT | `/notifications/read-all` | Marca todas como leidas |

### Tiempo real
| Protocolo | Endpoint | Descripcion |
|-----------|----------|-------------|
| SSE | `GET /events` | Stream de eventos de unidades (STATUS_CHANGED, DEFECT_UPDATED, etc.) |
| WebSocket | `ws://host/ws/notifications?token=<JWT>` | Notificaciones push por userId |

---

## Side effects al cambiar estado de unidad

La logica de `unit_repository.update_status()` aplica efectos secundarios automaticos segun el estado destino:

| Estado destino | Efecto |
|---------------|--------|
| `IN_REPAIR` | Calcula `estimatedCompletionDate` considerando la cola; limpia `priorityRank` |
| `RELEASED` | Marca todos los defectos activos como `isResolved = true`; limpia `priorityRank` |
| `WWS_RELEASED` | Marca defectos activos como `isResolved = true` (WTY aprobo, se salta Body); limpia `priorityRank` |
| `REJECTED` | Reabre todos los defectos (`isResolved = false`); guarda `rejectionNote`; limpia `priorityRank` |
| `ACCEPTED` | Limpia `priorityRank` |
| `ARCHIVED` | Guarda `archivedAt` + `archivedById`; limpia `priorityRank` |

---

## Notificaciones por evento

| Evento | Metodo | Destinatarios |
|--------|--------|--------------|
| Unidad reportada | `notify_unit_reported` | WWS, SCM, BODY |
| Entregada a Body | `notify_unit_delivered` | BODY, SCM |
| Liberada por Body | `notify_unit_released` | WWS, SCM, CARRIER (mismo proveedor) |
| Enviada a validacion WTY | `notify_wty_pending` | WTY, SCM_QUALITY, SCM |
| Aprobada por WTY | `notify_wty_released` | WWS, SCM |
| Liberada por WWS | `notify_unit_wws_released` | CARRIER (mismo proveedor), SCM |
| Aceptada | `notify_unit_accepted` | WWS, SCM, BODY |
| Rechazada por Carrier | `notify_unit_rejected` | WWS, SCM, BODY |
| Archivada | `notify_unit_archived` | SCM, WWS |

Las notificaciones estan filtradas por **planta** (A1/A2) y, para CARRIER, solo se envian a usuarios del **mismo proveedor** de la unidad.

---

## Base de datos

El schema completo esta en `docs/database-schema-postgresql.sql`.  
Guia funcional y explicacion de entidades: `docs/DATABASE-README.md`.  
Las migraciones incrementales estan en `docs/database-migration-*.sql`.

Tablas principales:

| Tabla | Descripcion |
|-------|-------------|
| `User` | Usuarios con rol, planta y proveedor |
| `Role` | WWS(1), SCM(2), BODY(3), CARRIER(4), ADMIN(5), WTY(6), SCM_QUALITY(7) |
| `Provider` | Empresas carrier |
| `UnitStatus` | Catalogo de estados posibles |
| `Unit` | Unidades vehiculares con todos sus campos de estado y prioridad |
| `UnitDefect` | Defectos por unidad con grado V1/V2/V3 y flag `isResolved` |
| `UnitEvent` | Auditoria de todos los cambios (status, defectos, notas, SCM) en JSONB |
| `UnitStatusHistory` | Vista de compatibilidad sobre `UnitEvent` |
| `Notification` | Notificaciones por usuario con tipo y estado de lectura |
| `RepairCatalog` | Catalogo de tipos de reparacion con horas estimadas por grado |
