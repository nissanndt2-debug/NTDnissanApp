# Body App Mobile — Arquitectura

App nativa (Expo / React Native) para la trazabilidad de planchas para madrinas
del Body Shop. Reemplaza el uso en piso de la app web `body-app`, conservando el
mismo backend FastAPI y la misma base PostgreSQL.

> **Estado: demo de arquitectura.** El esqueleto está completo y verificado:
> `npx tsc --noEmit` pasa limpio, `npx expo-doctor` da 18/18, y
> `npx expo export --platform android` genera el bundle sin errores.
> Las pantallas son funcionales pero mínimas: sirven para validar las
> decisiones técnicas, no para producción.
>
> **SDK 54** — fijado a esta versión para que corra en el Expo Go instalado
> (Expo Go solo soporta una versión de SDK a la vez).

---

## 1. Por qué nativo y no web

La razón no es estética, es la **conexión**. En piso de planta el WiFi es
intermitente y la app web actual falla de una forma cara: si la red se cae a la
mitad de un reporte, el operador pierde la captura y la vuelve a hacer.

Una app Expo permite algo que un navegador no puede garantizar:

| Capacidad | Web actual | Esta app |
|---|---|---|
| Capturar sin red | No — el `fetch` falla y se pierde el trabajo | Sí — se guarda local y se encola |
| Ver el trabajo del día sin red | No | Sí — lectura desde SQLite |
| Saber qué falta por subir | No existe el concepto | Contador permanente en pantalla |
| Cámara y escáner de VIN | Depende de permisos del navegador | API nativa, más confiable |
| Comprimir fotos antes de subir | No se hace: suben crudas de 3-5 MB | Sí, a ~150-250 KB |

Ese último punto por sí solo es el mayor ahorro de tiempo medido en la app web.

---

## 2. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Runtime | **Expo SDK 54** + React Native 0.81.5 + React 19.1 | Build y OTA sin cadena nativa local |
| Navegación | **Expo Router 6** (basado en archivos) | Mismo modelo mental que el App Router de Next.js que ya usan |
| Lenguaje | **TypeScript 5.9** en modo estricto | El dominio (7 roles × 13 estados) es demasiado grande para tipar a mano |
| Estilos | **NativeWind 4** (Tailwind 3) | El equipo ya escribe Tailwind en `body-app` |
| Animación | **Reanimated 4** + react-native-worklets | Requerido por Expo Router y NativeWind |
| Persistencia local | **expo-sqlite** (WAL) | Espejo local del Postgres; consultas reales, no un caché de JSON |
| Estado de servidor | **TanStack Query** | Cachés, reintentos e invalidación ya resueltos |
| Estado de cliente | **Zustand** | Ligero; el estado pesado vive en SQLite |
| Conectividad | **@react-native-community/netinfo** | Dispara el drenado de la cola al volver la red |
| Cámara / VIN | **expo-camera** | Escáner de códigos integrado |
| Fotos | **expo-image-manipulator** | Compresión previa a la subida |
| Credenciales | **expo-secure-store** | Keychain / Keystore, no texto plano |
| IDs | **expo-crypto** (`randomUUID`) | IDs locales para registros creados sin red |

---

## 3. Estructura

```
AppProyecto/
├── app/                          # Rutas (Expo Router)
│   ├── _layout.tsx               # Providers: Query → Auth → Sync
│   ├── index.tsx                 # Puerta: admin+PC → dashboard, resto → app
│   ├── login.tsx
│   ├── dashboard.tsx             # ← ADMIN, SOLO WEB (sin pestañas)
│   └── (app)/                    # Pantallas operativas de piso
│       ├── _layout.tsx           # Pestañas filtradas por rol
│       ├── index.tsx             # Panel del día
│       ├── operaciones.tsx       # Hub del admin en móvil
│       ├── reportar.tsx          # CARRIER / WWS — captura + escáner VIN
│       ├── gestion.tsx           # WWS — nivelar, entregar, liberar
│       ├── recibir.tsx           # BODY — recepción EN LOTE
│       ├── reparar.tsx           # BODY — cola y liberación
│       ├── prioridad.tsx         # SCM — orden de la cola
│       ├── validar.tsx           # WTY / SCM_QUALITY — garantía
│       └── aceptar.tsx           # CARRIER — aceptar / rechazar
│
├── src/
│   ├── domain/                   # Reglas de negocio, sin dependencias de UI
│   │   ├── constants.ts          # Roles, estados, grados, máquina de estados
│   │   ├── types.ts              # Unit, Defect, User, QueuedMutation
│   │   └── permissions.ts        # Matriz rol → pantalla y rol → pestañas
│   │
│   ├── db/                       # SQLite local
│   │   ├── schema.ts             # DDL + versión de esquema
│   │   └── index.ts              # Apertura, migración, helpers tipados
│   │
│   ├── sync/                     # ← el corazón de la app
│   │   ├── queue.ts              # Bandeja de salida (outbox)
│   │   ├── engine.ts             # Drenado, backoff, remapeo de IDs
│   │   ├── pull.ts               # Descarga del servidor → SQLite
│   │   └── SyncProvider.tsx      # Contexto + disparadores
│   │
│   ├── data/
│   │   ├── units.ts              # Repositorio: leer local, escribir + encolar
│   │   └── stats.ts              # Agregados SQL para el dashboard
│   │
│   ├── hooks/useUnits.ts         # Lectura + invalidación de unidades
│   ├── api/                      # client.ts (HTTP) + endpoints.ts (contrato)
│   ├── auth/AuthProvider.tsx     # Sesión en SecureStore
│   ├── media/photo.ts            # Compresión de imágenes
│   └── ui/                       # Screen, BulkAction, Charts, SyncBadge…
│
├── app.json · babel.config.js · metro.config.js · tailwind.config.js
└── ARQUITECTURA.md
```

### Pantallas por rol

| Rol | Pestañas en móvil | Acciones |
|---|---|---|
| **CARRIER** | Panel · Reportar · Aceptar | Reporta unidades con daño; acepta o rechaza las liberadas |
| **WWS** | Panel · Reportar · Gestión | Nivela severidad, entrega a Body, libera al carrier |
| **BODY** | Panel · Recibir · Reparar | Recibe lotes, inicia y libera reparaciones |
| **SCM** | Panel · Prioridad | Ordena la cola de reparación |
| **WTY / SCM_QUALITY** | Panel · Validar | Aprueba o rechaza unidades en garantía |
| **ADMIN** | Panel · Operaciones | Acceso a las 7 pantallas + dashboard en PC |

El admin no tiene 8 pestañas: tiene un hub "Operaciones" con tarjetas. Las rutas
existen con `href: null` en el navegador de pestañas, lo que las mantiene
navegables por código sin duplicar el árbol de rutas.

---

## 4. Cómo funciona el modo offline

Esta es la decisión central de la que cuelga todo lo demás.

### Regla única

> **Ninguna pantalla llama a la red para escribir.**

Toda escritura hace dos cosas dentro de una transacción local:

1. aplica el cambio a SQLite (el operador ve el resultado de inmediato)
2. encola la mutación en la tabla `outbox`

El motor drena la cola cuando hay red. Con conexión o sin ella, **el código de
la pantalla es idéntico** — no hay dos caminos que mantener ni un "modo offline"
que probar por separado.

```
   Operador toca "Guardar"
            │
            ▼
   ┌─────────────────────┐
   │ transacción SQLite  │  ← el operador ya puede seguir
   │  · escribe la fila  │
   │  · encola mutación  │
   └─────────┬───────────┘
             │
        (hay red?)
         │        │
        sí       no
         │        └──► se queda en outbox, el badge muestra "N por subir"
         ▼
   motor de drenado ──► backend FastAPI
         │
         └─ 5xx / sin red → backoff exponencial (2ⁿ s, techo 5 min)
            4xx           → se descarta y la fila se marca 'failed'
```

### Los dos problemas difíciles que resuelve `engine.ts`

**Remapeo de IDs.** Una unidad creada sin red solo tiene un `local_id` (UUID).
Sus defectos y cambios de estado apuntan a ese UUID. Cuando la unidad
finalmente se crea en el servidor y recibe un `id` numérico, hay que resolver
ese UUID → id antes de enviar las mutaciones que dependen de ella.

**Orden.** El drenado es FIFO estricto y **se detiene ante el primer fallo de
red**. Enviar un `UPDATE_STATUS` de una unidad cuyo `CREATE_UNIT` todavía no
pasó produciría un 404 y perdería el trabajo del operador.

### Distinción de errores

No todos los fallos merecen reintento:

- **5xx / red caída** → reintentable, backoff exponencial
- **4xx (salvo 408/429)** → el servidor rechaza y seguirá rechazando: se
  descarta y la unidad se marca `failed` en rojo para intervención humana

Reintentar un 400 en bucle solo gasta batería.

---

## 4-bis. Separación admin / trabajadores

Un solo código, dos experiencias según plataforma y rol:

```
                    ┌─────────────────────────┐
   login  ────────► │  app/index.tsx (puerta) │
                    └───────────┬─────────────┘
                                │
              ¿web && ADMIN?    │
                  ┌─────────────┴─────────────┐
                 sí                           no
                  │                            │
                  ▼                            ▼
        app/dashboard.tsx              app/(app)/…
        KPIs · Pareto · cuellos        pantallas operativas
        sin pestañas, layout ancho     pestañas según rol
```

- El **dashboard tiene doble candado**: redirige si el rol no es ADMIN *y*
  si la plataforma no es web. No basta con esconder el enlace.
- El ADMIN **sí puede** usar las pantallas operativas en el celular (útil para
  supervisar en piso); lo único exclusivo de PC es el tablero analítico.
- El dashboard calcula todo con **SQL sobre SQLite**, no en JavaScript. Por eso
  sigue respondiendo sin red, y por eso `metro.config.js` habilita WASM: en web
  `expo-sqlite` corre sobre wa-sqlite, que además exige cabeceras COOP/COEP
  para poder usar `SharedArrayBuffer`.
- Las gráficas son `View` con anchos porcentuales, **sin librería de charts**:
  se renderizan idénticas en móvil y navegador, con cero dependencias nuevas.

---

## 5. Decisiones de UX que atacan el objetivo de <5 min/unidad

Del análisis de la app web salieron tres costos dominantes. Cada uno tiene una
respuesta concreta aquí:

| Problema medido en la web | Respuesta en esta app |
|---|---|
| Reporte de 2-4 min: modal por defecto, fotos crudas, N llamadas en serie | Accesos rápidos de defecto en línea, compresión previa, **una** transacción local |
| Cero operaciones en lote: recibir 12 unidades = 12 ciclos de modal | `recibir.tsx` con selección múltiple: dos toques para todo el lote |
| Sin señal de si el trabajo se guardó | `SyncBadge` permanente y tocable en cada pantalla |

Otras decisiones:

- **Botones de 56 px mínimo** — se usan con guantes.
- **Severidad como color consistente** (V1 rojo / V2 ámbar / V3 azul) en toda la app.
- **Horas estimadas derivadas** de los grados (V1=8h, V2=4h, V3=2h) sin pedir nada al servidor.
- **La sesión sobrevive sin red**: si hay token guardado la app arranca autenticada
  y valida en segundo plano. Un operador no puede quedarse fuera porque se cayó el WiFi.

---

## 6. Cómo correrlo

```bash
cd C:\Users\Publico\Desktop\AppProyecto
npm install
```

Copia `.env.example` a `.env.local` y pon la **IP LAN** de la PC donde corre el
backend (no `localhost` — el teléfono no lo resuelve):

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3001
```

Levanta el backend de `ProyecctoNissan` y luego:

```bash
npx expo start
```

Escanea el QR con **Expo Go** (Android/iOS). Para probar el modo offline: pon el
teléfono en modo avión, captura unidades, y observa el contador del badge crecer;
al reactivar la red se drena solo.

> `expo-sqlite`, `expo-camera` y `expo-secure-store` funcionan en Expo Go.
> Si más adelante se añaden notificaciones push nativas hará falta un
> *development build* (`npx expo prebuild` + EAS).

### Sobre la versión de SDK

El proyecto está fijado a **SDK 54** porque Expo Go solo puede ejecutar una
versión de SDK a la vez, y es la instalada. Si algún día se actualiza Expo Go,
la migración es:

```bash
npx expo install expo@latest
npx expo install --fix
npx expo-doctor
```

Dos detalles que dieron guerra al fijar la versión y conviene recordar:

- **`babel-preset-expo` debe estar en `devDependencies` explícitamente.** npm lo
  anida bajo `node_modules/expo/` y Babel no lo resuelve desde la raíz; sin él,
  Metro falla con `Cannot find module 'babel-preset-expo'`.
- **`react-native-worklets` debe ser dependencia directa**, no transitiva de
  Reanimated 4, o la app crashea fuera de Expo Go.

---

## 7. Deuda heredada del backend

Estos son problemas del backend actual que **esta app no puede arreglar sola** y
que conviene resolver del lado servidor:

1. **`LIMIT` sobre filas unidas, no sobre unidades.** En
   `unit_repository.find_by_status_name` el `LEFT JOIN` con defectos hace que
   una unidad con 3 defectos ocupe 3 filas; pedir 100 devuelve ~30 unidades
   reales. La app mitiga leyendo de SQLite, pero la sincronización inicial
   hereda el techo.

2. **Sin transacciones en el servidor.** Crear unidad + N defectos son N+1
   commits independientes. Aquí la transacción local sí es atómica, pero el
   servidor puede quedar en estado parcial.

3. **Sin máquina de estados ni validación de rol** en `PUT /units/{id}/status`.
   Esta app la implementa **del lado cliente** (`domain/constants.ts` →
   `canTransition`) para evitar transiciones imposibles, pero es una defensa
   cosmética: cualquier cliente con un JWT válido puede saltársela.

4. **`POST /units/maintenance/reset-daily-queue` no lo llama nadie.** Sin un
   cron, `isAvailableToday` queda obsoleto y el panel del día muestra datos
   viejos.

---

## 8. Qué falta para producción

- [ ] Endpoint de sincronización delta (`?since=`) en el backend — hoy `pull.ts`
      trae listas completas por estado, una petición por estado
- [ ] Captura y subida de fotos conectada de punta a punta
      (`media/photo.ts` está listo, falta cablearlo en `reportar.tsx`)
- [ ] Notificaciones push (`expo-notifications` + development build)
- [ ] Refresco automático del JWT al expirar (hoy solo se guarda el refresh token)
- [ ] Pantalla de conflictos: qué ve el operador cuando una mutación se descarta
- [ ] Solicitudes de borrado de unidad (CARRIER/WWS → SCM)
- [ ] Decisión SCM sobre unidades UNAVAILABLE y archivado
- [ ] Pruebas del motor de sincronización — es la pieza con más aristas
- [ ] Instrumentación de tiempo por paso para medir el objetivo de 5 min
- [ ] Cabeceras COOP/COEP en el hosting de producción del dashboard web
      (en desarrollo las inyecta `metro.config.js`, pero un servidor estático
      necesita configurarlas o wa-sqlite no arranca)
