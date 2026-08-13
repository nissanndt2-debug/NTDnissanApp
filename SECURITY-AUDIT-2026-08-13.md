# Auditoría integral de seguridad — Nissan Body App

Fecha: 2026-08-13  
Alcance: `TestApp` (Expo web/móvil) y `backend_python/backend_python` (FastAPI, PostgreSQL, Cloudinary y tiempo real).

## Resultado ejecutivo

Se corrigieron vulnerabilidades críticas que permitían operar unidades sin una sesión válida, modificar datos haciéndose pasar por otro usuario y consultar o alterar unidades ajenas por ID. El backend queda como fuente de autoridad para autenticación, permisos, alcance por planta/proveedor y transiciones de negocio.

No se ejecutaron pruebas destructivas contra Cloudinary, PostgreSQL ni servicios externos.

## Hallazgos corregidos

| Severidad original | Hallazgo | Corrección aplicada |
|---|---|---|
| Crítica | Endpoints de unidades mutaban datos sin `require_auth`. | Todas las lecturas operativas y mutaciones exigen JWT válido. |
| Crítica | El cliente enviaba `registeredById`, `changedById`, etc.; era posible suplantar el actor de auditoría. | El actor se deriva exclusivamente de `userId` del JWT. |
| Crítica | IDOR: una unidad podía leerse o modificarse conociendo su ID. | Se valida planta y, para Carrier, proveedor antes de leer, mutar, adjuntar fotos o solicitar/eliminar. Las denegaciones responden 404 para no revelar existencia. |
| Alta | El flujo de estados se controlaba solo desde la interfaz. | Se añadió máquina de estados y rol permitido por transición en backend. |
| Alta | Tokens JWT viajaban en URL de WebSocket/SSE. | WebSocket usa `Sec-WebSocket-Protocol` (`bodyapp.jwt.<JWT>`); SSE sólo acepta `Authorization`. |
| Alta | Refresh tokens se guardaban en texto plano. | Se guarda SHA-256 del token; se rota y cada refresh tiene `jti` único. |
| Alta | Cargas de imagen confiaban en MIME declarado. | Se valida tipo real, integridad, dimensiones, tamaño, clave/ID y límite por usuario. |
| Alta | Podía asociarse una URL pública de otra cuenta Cloudinary. | Sólo se aceptan URLs HTTPS de la cuenta y carpeta Cloudinary configuradas. |
| Media | Cuentas sin planta/proveedor podían caer en consultas globales. | El filtro falla cerrado; una cuenta incompleta no recibe datos. |
| Media | Historial permitía que un usuario cambiara la planta en query string. | Para usuarios no ADMIN la planta viene siempre de la sesión. |
| Media | Errores de Cloudinary, salud de BD y push podían filtrar detalles/tokens. | Respuestas sanitizadas, `/health/db` no expone excepciones y logs de push no incluyen token. |
| Media | CORS y encabezados insuficientes. | CORS de producción exige orígenes HTTPS explícitos; se añadieron CSP, Permissions-Policy, HSTS en producción, límites de cuerpo y cabeceras anti-framing. |
| Media | Sesión web persistía después de cerrar el navegador. | Web usa `sessionStorage` en vez de `localStorage`. |

## Controles implementados

- Autenticación: JWT HS256 con tipo explícito (`access`/`refresh`), expiración y sesión invalidada cuando el usuario cambia o se elimina.
- Autorización: política de roles en backend y control de recursos por planta/proveedor.
- Auditoría: el servidor registra el actor autenticado y no confía en IDs enviados por la app.
- Datos: consultas SQL parametrizadas; límites para historial y solicitudes HTTP.
- Fotos: sólo imágenes JPEG/PNG/WEBP reales, máximo 8 MB y 20 MP; Cloudinary recibe credenciales sólo desde backend.
- Tiempo real: eventos filtrados por planta y autenticados sin token en URL.
- Secretos: no se detectaron secretos activos en archivos rastreados; las coincidencias fueron plantillas/documentación. `CLOUDINARY_URL`, JWT y BD permanecen fuera del frontend.

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `python -m unittest tests.test_security_regressions -v` | 7/7 correctas: aislamiento por planta/proveedor, máquina de estados, MIME spoofing, Cloudinary y refresh único. |
| `python -m compileall -q app main.py tests` | Correcta. |
| `npm run type-check` | Correcta. |
| `pip-audit -r requirements.txt` | Sin vulnerabilidades reportadas. |
| `npm audit --omit=dev --audit-level=high` | Pendientes 12 altas y 10 moderadas transitivas de Expo/Metro/PostCSS. |

## Riesgos residuales y acciones antes de producción

1. **Actualizar Expo de forma planificada.** Las vulnerabilidades de `image-size`, `postcss` y `uuid` sólo tienen arreglo con una actualización mayor de Expo (`expo@57` según `npm audit`). No se aplicó `--force` porque cambiaría SDK/runtime y requiere pruebas completas de móvil y web.
2. **Rate limit distribuido.** Los límites de FastAPI son en memoria por proceso. En producción usar rate limiting en gateway/WAF (Azure Front Door, Container Apps ingress o Redis) para que escale a múltiples réplicas.
3. **Entrega de fotos Cloudinary.** Las URLs actuales son públicas por diseño para mostrarlas en app/web. Si la evidencia debe ser privada, configurar Cloudinary authenticated delivery y servirla mediante un endpoint autorizado/signed URL.
4. **Cookies HttpOnly para web.** `sessionStorage` elimina persistencia al cerrar, pero no elimina el riesgo de XSS de un token disponible a JavaScript. La mejora siguiente es un flujo web con cookie `HttpOnly; Secure; SameSite` y CSRF protection.
5. **Recuperación de contraseña y MFA.** Hoy existe cambio de contraseña autenticado, no recuperación por correo ni MFA. Requiere proveedor de correo/identidad y decisión de negocio.
6. **Base de datos.** Mantener PostgreSQL sin exposición pública, TLS obligatorio, backups cifrados y acceso sólo desde el backend. La autorización de aplicación no sustituye RLS si existen otros consumidores directos de la BD.
7. **Secretos y datos demo.** Rotar `JWT_SECRET`, credenciales Cloudinary/BD y cualquier token usado antes del despliegue. Nunca ejecutar `db-init/02-admin.sql` ni publicar cuentas `admin123` fuera de local.
8. **CORS y TLS.** Definir `NODE_ENV=production` y `CORS_ORIGIN=https://<dominio-web-real>`; no usar `*`. Terminar TLS en el hosting/proxy y conservar HSTS.

## Impacto de despliegue

Después de desplegar esta versión, las sesiones y refresh tokens previos requerirán iniciar sesión de nuevo: los access tokens antiguos no incluyen los claims de sesión actuales y los refresh tokens existentes estaban sin hash. Esto es intencional para cerrar sesiones heredadas.

## Archivos principales modificados

- `backend_python/backend_python/app/middleware/auth.py`
- `backend_python/backend_python/app/controllers/unit_controller.py`
- `backend_python/backend_python/app/utils/unit_access.py`
- `backend_python/backend_python/app/routes/uploads.py`
- `backend_python/backend_python/main.py`
- `TestApp/src/sync/live.ts`
- `TestApp/src/auth/storage.ts`
