# Revisión de experiencia de usuario y comparativo funcional — Body App (NTDnissanApp)

> Basado en: prueba en vivo del dashboard web en producción
> (`https://dist-web-ivory-rho.vercel.app`, modo demo, rol ADMIN) + lectura de
> código fuente de las 9 pantallas operativas, el dashboard, el login y el
> export CSV en `TestApp/`. Comparado contra `INVENTARIO-FUNCIONAL.md`
> (auditoría previa de `body-app/` + `backend_python/` originales).

---

## 0. Hallazgo bloqueante — el login real está caído en producción

Antes de cualquier mejora visual: **hoy nadie puede iniciar sesión con
credenciales reales en `https://dist-web-ivory-rho.vercel.app`.**

Probé el login normal (no demo) dos veces con `admin@nissan.com` / `admin123`
(credenciales del propio `README.md`). Ambas fallaron con el mensaje genérico
"No se pudo iniciar sesion. Revisa tus datos o la conexion." Descarté las dos
causas ya documentadas en `WEB-DEPLOY.md`:

- **¿Cold start de Render (~50 s)?** No — `GET /health` respondió al instante
  con `200 {"ok":true,...}`.
- **¿Faltan cabeceras COOP/COEP (el fallo "más caro de diagnosticar")?** No —
  `window.crossOriginIsolated` es `true`.

Golpeando `POST /auth/login` directo desde la consola del navegador, el
backend responde:

```
500 {"detail":"consuming input failed: SSL connection has been closed unexpectedly"}
```

Reproducido dos veces seguidas, no es un parpadeo. Esto es un error de
**Postgres (Neon)**, no de credenciales ni de red del cliente: el pool de
conexiones del backend está reutilizando una conexión que Neon ya cerró (Neon
también duerme/recicla conexiones en capa gratuita, igual que Render duerme el
servicio) y no la está reconectando ni reintentando. Como `/health` no toca la
base de datos, sigue respondiendo bien mientras todo lo que sí la usa —
login incluido — falla.

**Impacto:** esto no es specific al login. Cualquier endpoint que consulte
Postgres después de un rato de inactividad probablemente falle igual hasta
que algo "despierte" la conexión de casualidad. Es el hallazgo de mayor
prioridad de esta revisión porque invalida todo lo demás: no importa qué tan
buena sea la pantalla de login si el backend no puede autenticar a nadie.

**Sugerido (no es un cambio visual, es backend):** validar la conexión antes
de usarla (`SELECT 1` / `pool_pre_ping` si es SQLAlchemy, o el equivalente en
el driver que estén usando — `asyncpg`/`psycopg`) y reconectar automáticamente
ante `SSLError`/`ConnectionDoesNotExistError`, en vez de dejar que la
excepción suba tal cual a un 500.

---

## 1. Propuestas de mejora — diseño, UX, jerarquía, velocidad y modernidad

Antes de las propuestas: el rediseño actual ya resuelve bien varias cosas que
normalmente habría que pedir — banda oscura consistente en las 9 pantallas,
objetivos de toque de 56-72 px pensados para operar con guantes, estados
vacíos que invitan en vez de alarmar, acciones en lote donde el flujo real es
por lote (Recibir, Entregar, Liberar), y el badge de sincronización siempre
visible y accionable. Las propuestas de abajo son ajustes puntuales sobre esa
base, no una reescritura.

### 1.1 Diferenciar el mensaje de error de login según la causa real

1. **Qué cambiarías:** en `app/login.tsx`, el `catch` de `handleSubmit` hoy
   pone el mismo texto sin importar la causa. Cambiar a: si la API devuelve
   `401` → "Correo o contraseña incorrectos"; si devuelve `5xx` o falla la
   red → "No se pudo conectar con el servidor, intenta de nuevo en unos
   segundos."
2. **Por qué mejora la experiencia:** hoy un operador con la contraseña
   correcta pero el backend caído (como está ahora mismo, ver hallazgo 0) ve
   exactamente el mismo mensaje que alguien que se equivocó al escribir. Lo
   más probable es que reintente retecleando la contraseña varias veces en
   vez de simplemente esperar — el mensaje le hace perder tiempo culpando a
   la causa equivocada.
3. **Impacto en rendimiento/usabilidad:** cambio de una rama condicional
   sobre el código HTTP que ya se recibe; cero llamadas de red adicionales,
   cero impacto en velocidad. Baja directamente los reintentos fallidos y,
   con eso, los reportes de "no puedo entrar" que en realidad son del
   servidor.
4. **Prioridad:** **Alta** — más aún mientras el hallazgo 0 siga sin
   resolverse.

### 1.2 Mostrar/ocultar contraseña en el login

1. **Qué cambiarías:** agregar un ícono de ojo al campo de contraseña
   (`app/login.tsx`) que alterne `secureTextEntry`.
2. **Por qué mejora la experiencia:** son dispositivos de piso, a veces
   compartidos, a veces operados con guantes o con poca luz. Un campo oculto
   sin forma de verificarlo antes de enviar es la causa más común de "mi
   contraseña no funciona" cuando en realidad fue un error de tecleo — que
   hoy, además, cae en el mismo mensaje genérico de 1.1.
3. **Impacto en rendimiento/usabilidad:** es un `useState` booleano local, sin
   red ni recómputo; impacto en velocidad nulo. Reduce fricción en la
   pantalla que todos usan primero.
4. **Prioridad:** Media.

### 1.3 Sacar el modo demo del build de producción real

1. **Qué cambiarías:** el bloque "Ver la app sin backend (modo demo)" (con
   los 6 roles de ejemplo) sigue presente en `login.tsx` de la build que ya
   está en Vercel. El propio comentario en el código dice que es para
   "revisión de interfaz sin backend" — es decir, pensado para ustedes, no
   para el operador real. Condicionar su visibilidad a una variable de
   entorno de build (p. ej. `EXPO_PUBLIC_ENABLE_DEMO=1`) y no incluirla en el
   build que usan los operadores.
2. **Por qué mejora la experiencia:** menos ruido en la pantalla que todo el
   mundo ve primero, y evita que alguien nuevo la toque por error y crea que
   "ya entró" viendo datos de ejemplo (`3N1AB7AP0KY...`, `Demo Nissan`) en
   vez de las unidades reales de la planta.
3. **Impacto en rendimiento/usabilidad:** condicional en tiempo de build, no
   en runtime — cero costo. Reduce superficie de confusión sin quitarles a
   ustedes la herramienta de revisión (solo cambia en qué build aparece).
4. **Prioridad:** Media.

### 1.4 Habilitar el dashboard también en el celular para ADMIN

1. **Qué cambiarías:** hoy `app/dashboard.tsx` se bloquea con
   `Platform.OS !== 'web'` y en la pantalla de Operaciones del celular el
   ADMIN solo ve una tarjeta que le dice "el dashboard completo... está
   disponible solo en la versión de escritorio. Ábrelo desde una PC en la
   misma red." Permitir que esa misma pantalla se abra también desde el
   celular como una opción más dentro de Operaciones.
2. **Por qué mejora la experiencia:** el dashboard no depende de ninguna
   librería de gráficos pesada — son paneles con barras y un donut simple
   (`KpiCard`/`BarRow`/`Panel`), no `Chart.js` ni SVG complejo. No hay una
   razón técnica visible para que un ADMIN caminando la planta con el
   teléfono tenga que ir a buscar una computadora para ver algo tan básico
   como "¿dónde está el cuello de botella hoy?".
3. **Impacto en rendimiento/usabilidad:** riesgo bajo — mismos componentes
   que ya corren bien en web, mismas consultas SQL locales. Sube la
   usabilidad para el rol que en teoría debe poder ver el estado completo
   "en cualquier pantalla".
4. **Prioridad:** Media (no bloquea nada, pero es una fricción real y
   evitable para ese rol).

### 1.5 Umbral de "acumulación detectada" por etapa, no uno fijo para todas

1. **Qué cambiarías:** hoy tanto en el Panel del día como en el Dashboard, la
   marca ámbar de "acumulación detectada" se dispara con el mismo número fijo
   (≥5 unidades) para las 8-9 etapas del flujo, sin importar que unas etapas
   normalmente acumulen más que otras. Reemplazarlo por un mapa estático
   `{ REPORTED: 8, DELIVERED: 5, IN_REPAIR: 10, ... }` en vez de una sola
   constante.
2. **Por qué mejora la experiencia:** una alerta que se dispara igual en toda
   etapa dice menos cuanto más etapas tenga: si "En reparación" normalmente
   trae 8 unidades y "Entregada" normalmente trae 2, ambas encendiéndose en 5
   hace que la señal deje de ser confiable donde de verdad importa.
3. **Impacto en rendimiento/usabilidad:** sigue siendo una comparación contra
   una constante — solo cambia de un número a una tabla fija ya en el
   cliente, sin consultas nuevas. Cero impacto en velocidad; la señal de
   "algo se está atorando" se vuelve más precisa.
4. **Prioridad:** Baja — es un ajuste fino, no corrige nada roto hoy.

### 1.6 Confirmación breve tras una acción en lote

1. **Qué cambiarías:** en Recibir, Entregar y Liberar (`BulkAction`), hoy la
   única señal de que "sí funcionó" es que las unidades seleccionadas
   desaparecen de la lista. Agregar un toast breve tipo "5 unidades recibidas"
   al confirmar (si `NotificationToast.tsx`, que ya existe en el proyecto
   para otros eventos, no cubre ya este caso).
2. **Por qué mejora la experiencia:** en un flujo offline-first, que algo
   desaparezca de la pantalla no siempre significa lo mismo que "ya se envió
   al servidor" (puede seguir pendiente en la cola de sincronización). Una
   confirmación explícita del número de unidades procesadas le da al
   operador una prueba clara de qué pasó, sin tener que interpretar la
   ausencia de algo como éxito.
3. **Impacto en rendimiento/usabilidad:** un toast es una notificación local,
   no una llamada de red; no añade pasos porque no requiere interacción del
   usuario para desaparecer. Sube la sensación de control y confianza,
   especialmente en zonas con mal WiFi de planta donde el estado de "pendiente
   por sincronizar" es real y frecuente.
4. **Prioridad:** Media.

### 1.7 Retroalimentación háptica en confirmaciones

1. **Qué cambiarías:** un pulso corto de vibración (`expo-haptics`,
   `impactAsync('light')`) al confirmar una acción irreversible o de lote
   (Liberar, Aceptar, Rechazar, Entregar).
2. **Por qué mejora la experiencia:** es el tipo de detalle que hace que una
   app de piso se sienta hecha a propósito en vez de "una web metida en un
   teléfono" — confirma físicamente que el toque registró, sin que el
   operador tenga que mirar la pantalla para saberlo (útil con guantes o
   manos ocupadas).
3. **Impacto en rendimiento/usabilidad:** llamada asíncrona y no bloqueante;
   no compite con la animación ni con el guardado. Impacto en velocidad
   percibida: nulo o positivo.
4. **Prioridad:** Baja — es pulido, no corrige nada.

---

## 2. Comparación funcional: app anterior (`body-app`) vs nueva (`NTDnissanApp`)

Contra la Sección Q de `INVENTARIO-FUNCIONAL.md` (61 funcionalidades). Marcado
según lo verificado leyendo las 9 pantallas de `TestApp/app/(app)/`, el
dashboard, el login y `csvExport.ts` — no es una prueba en vivo contra el
backend real (que hoy no responde, ver hallazgo 0), es lectura directa de
código.

| Módulo | Estado | Notas |
|---|---|---|
| **Auth** (login, refresh token, logout, cambio de contraseña) | ⚠️ Parcial | Login sí existe, pero con arquitectura distinta (SecureStore + boot offline-autenticado, no refresh rotativo de 14 min porque el modelo es local-first). **No encontré pantalla de cambio de contraseña propia** en ninguna de las 9 rutas — si existe, no vive en `app/(app)/`. |
| **Nav / permisos por rol** | ✅ Migrada, mejorada | Tabs filtradas por rol (`href: null` para rutas accesibles sin ser tab) + hub "Operaciones" para ADMIN. Más ordenado que el menú plano de 11 rutas del original. |
| **Notificaciones** | 🆕 Ampliada | Campana + panel + toast + **push notifications** (`push_token_controller.py`, `routes/push_tokens.py` en el backend — no existían en el original). Store único compartido entre header móvil y navbar web. |
| **Home / Panel del día** | ✅ Migrada, rediseñada | El "tablero del día" original se convirtió en "Tu trabajo ahora" (una acción principal con conteo) + "Flujo del día" (funnel de 8 etapas con marca de acumulación). Más orientado a acción que el original. |
| **Decisión SCM sobre unidad no disponible / Archivar / Solicitud de borrado** | ❌ No encontrada | No vi pantalla ni acción equivalente a D.2-D.5 en ninguna de las 9 rutas leídas. Puede vivir en otro lugar no revisado, o no estar migrada aún. |
| **Perfil: Catálogo de Modelos, Proveedores, Gestión de Usuarios (CRUD)** | ❌ No encontrada | No existe pantalla `perfil.tsx` ni equivalente en `app/(app)/`. Si el alta de usuarios/proveedores/modelos hoy se hace solo por script (`db-init/03-seed-users.sql`) y no por UI, es una funcionalidad real del original que no tiene equivalente operable por un ADMIN desde la app. |
| **Reportar unidad** | ✅ Migrada y rediseñada a fondo | El selector buscable de tipo/zona (AIAG) se reemplazó por el diagrama SVG "toca la parte dañada" + `DamageSheet` (tipo → severidad si aplica → foto si aplica). Probado en vivo: funciona, incluye escaneo de VIN + contador de caracteres + memoria de carril/mercado. Es la pantalla con más trabajo de rediseño de las nueve. |
| **Override de defecto por WWS (`isFromWws`)** | ❌ No migrada | Coincide con lo documentado: era huérfana en el frontend original también (nadie la usaba). No es una pérdida real. |
| **Gestión WWS** (nivelar, entregar, liberar) | ✅ Migrada, simplificada | Nivelar: severidad se corrige con un tap que cicla V1→V2→V3 (antes era un modal de edición). Entregar y Liberar: acción en lote con `BulkAction`, Liberar mantiene el checkbox de doble confirmación física del original. |
| **Recibir** | ✅ Migrada, simplificada a lote | El original confirmaba de a una con notas opcionales; el nuevo es 100% en lote (coincide con el patrón real: "una madrina descarga 10-15 unidades juntas"). Se pierde el campo de notas de recepción — si se usaba, es una regresión menor. |
| **Reparar** | ⚠️ Migrada con cambio de comportamiento deliberado | Iniciar/Liberar/Marcar no disponible sí están. **Editar tiempo estimado (I.8) ya no existe**: las horas se derivan solo de la severidad y no son editables — es una simplificación a propósito ("el operador no captura números"), pero también quita la vía de excepción para un caso que de verdad tarde más de lo estándar. Tampoco vi "Reactivar unidad" (I.7). |
| **Prioridad** | ✅ Migrada, mejor resuelta | Reordenar con flechas arriba/abajo en vez de drag & drop — funciona igual en web y móvil, más preciso con guantes. **El bug documentado del original (editar nota reordena al final) no puede repetirse porque el campo de nota simplemente ya no existe** en esta pantalla: se resolvió quitando la superficie del bug, no arreglándolo. |
| **Validar (WTY)** | ✅ Migrada | Aprobar → `WTY_RELEASED`, Rechazar → `SENT`. **La asimetría del original persiste igual**: rechazar aquí no pide motivo (a diferencia de Aceptar, que sí lo exige) — sigue siendo la Pregunta Abierta #3 de la auditoría original, sin resolver en la nueva app tampoco. |
| **Aceptar** | ✅ Migrada, mejorada | Aceptar en lote + rechazo individual con motivo obligatorio, igual que el original (L.4-L.6), con mejor UI (selección múltiple visible, resumen "N seleccionadas" fijo abajo). |
| **Dashboards** | ⚠️ Parcial, con adiciones nuevas | KPIs, severidad (donut) y Pareto sí están, y se agregó "cuello de botella" automático + "actividad en vivo" + "unidades por sincronizar" (nada de esto existía en el original). **Pero la tendencia mensual de 30 días, el resumen por proveedor/modelo/tiempo (3 vistas) y el Top 5 proveedores no aparecen** — probablemente porque el modelo local-first no conserva historial de unidades `ACCEPTED`/`ARCHIVED` (se excluyen del `pull` a propósito), así que no hay de dónde sacar una tendencia larga sin cambiar la arquitectura de sync. |
| **Logs / Historial** | ❌ No encontrada como pantalla | No existe `logs.tsx` en `app/(app)/`. Filtros, tabla histórico agrupada, ver/eliminar fotos desde el historial, ver notas y archivar-desde-Logs (N.1-N.11) no tienen equivalente visible. |
| **Exportar a Excel** | ⚠️ Reemplazada por CSV, con menos columnas | El original exportaba 16 columnas con estilo Nissan desde Logs; lo nuevo es un CSV genérico de 12 columnas armado a mano, disponible desde el Dashboard (no desde un módulo de historial, porque ese módulo no existe aquí). Cubre menos, pero es consistente: usa la misma base local que alimenta el resto del dashboard, así que no puede desincronizarse del número en pantalla. |
| **Mojibake / copy sin acentos** (Pregunta abierta #15 del original) | ✅ Resuelto, consistentemente | La app nueva evita acentos en literales de texto de forma consistente en todas las pantallas revisadas — no encontré el bug de mojibake (`invÃ¡lida`) del original. Probablemente deliberado, precisamente para no repetirlo. |

### Resumen del comparativo

- **Mejor resuelto que el original:** Reportar (todo el flujo de captura por
  diagrama), Prioridad (reordenamiento), notificaciones (push nuevo), Panel
  del día (jerarquía de "una acción principal"), CSV consistente con lo que
  se ve en pantalla.
- **Migrado con cambios deliberados que valen confirmar:** horas de
  reparación ya no editables, notas de Prioridad eliminadas junto con su bug,
  recepción 100% en lote sin notas.
- **Ausente y sin evidencia de que exista en otro lugar:** gestión de
  usuarios/proveedores/modelos (Perfil), Logs/historial completo, decisión
  SCM sobre unidad no disponible, solicitudes de borrado. Si alguna de estas
  cuatro sí vive en otra parte del proyecto que no revisé (otra rama, un panel
  admin aparte, etc.), vale la pena decírmelo para no contarla como faltante.

---

## 3. Preguntas abiertas

1. ¿La gestión de usuarios/proveedores/modelos de unidad se sigue haciendo
   solo por script en el backend (`db-init/03-seed-users.sql`), o hay un
   plan de traerla a la app? Es la ausencia con más impacto operativo de las
   cuatro de la tabla de arriba.
2. ¿El módulo de Logs/historial se descartó a propósito para esta primera
   versión, o falta por construirse?
3. ¿Vale la pena una vía de excepción para ajustar manualmente las horas
   estimadas de reparación en casos atípicos, o la simplificación a "solo se
   deriva de la severidad" fue una decisión final?
4. La asimetría de Validar (rechazo sin motivo) — ¿se deja igual que el
   original a propósito, o es un pendiente?
