# Plan: Catálogo de daños por zona + reparación obligatoria

> Estado: **implementado** (2026-08-12) en `src/domain/zones.ts`,
> `src/ui/DamageSheet.tsx`, `app/(app)/reportar.tsx`, `src/data/units.ts` y
> `src/data/stats.ts`. No modifica backend ni esquema de base de datos — todo
> el cambio vive en el cliente (Expo). Complementa `ARQUITECTURA.md`, no lo
> reemplaza.
>
> Decisiones tomadas durante la implementación que amplían este documento:
> - El grado (V1/V2/V3) ya no se pregunta para hallazgos que no son trabajo de
>   carrocería (llanta, limpieza, equipo, documentación): se guarda un valor
>   interno y se excluyen de `estimateHours()` y de "Carga de trabajo" en el
>   dashboard, para no inflar la cola de reparación con horas que no existen.
> - La foto pasa de booleano a tres estados (`always` / `optional` / `never`)
>   por tipo de hallazgo, no un único "siempre obligatoria".
> - `defect.zone` ahora guarda `"CODIGO - Etiqueta"` (antes solo la etiqueta)
>   para tener una llave estable en analítica; `displayLabel()` recorta el
>   código al mostrarlo en pantalla.
> - "Motor" y "Eléctrico" (chips fuera del diagrama) se retiraron: su
>   contenido vive ahora dentro de la zona Cofre en el esquema.

---

## 1. Origen: la hoja de inspección de 17 áreas

El punto de partida fue una hoja de inspección de planta con 17 áreas del
vehículo y sus puntos de verificación, más una clasificación de qué tipos de
incidente obligan a reparación física.

### Tipos de incidente donde reparar es obligatorio

| Categoría | Incidentes |
|---|---|
| Trabajo de pintura | Corrosión |
| Paneles | Deformación, Abolladuras, Protuberancias, Partes faltantes |
| Operación/funcionamiento | Cualquier falla que impida el uso de una función (operación incompleta, incorrecta, difícil de operar); cualquier fallo de sellado o filtrado de agua |

### Las 17 áreas de inspección (fuente original)

| # | Área | Qué se inspecciona |
|---|---|---|
| 1 | Documentación | Número de chasis/documentos; hoja de equipamiento (según modelo) |
| 2 | Cofre, motor, batería | Operación y ruido al abrir/cerrar; fugas (aceite, líquido de frenos); partes faltantes; tapones; indicador de carga de batería |
| 3 | Frente: cofre, toldo, parabrisas, faros, parrilla, fascia | Daño de apariencia (panel/pintura); daño en luces/niebla; fugas y componentes colgando debajo |
| 4 | Lado izq. y toldo, salpicadera frontal izq., neumático y rin | Daño de apariencia; tapón de válvula (presencia); daño; presión de neumáticos (43 PSI en almacenamiento) |
| 5 | Puerta frontal izquierda | Daño de apariencia; operación y ruido al abrir/cerrar |
| 6 | Interior frontal izq., llaves, equipamiento, protección | Revestimientos (coincidencia con asientos); limpieza (estribo, alfombra, volante, palanca, asientos); daños; operación (incl. repuestos); presencia de equipo según hoja; protectores |
| 7 | Puerta trasera izquierda | Daño de apariencia (panel, pintura, equipo); operación y ruido |
| 8 | Interior trasero | Limpieza de vestiduras, estribo, alfombras, asientos; daños |
| 9 | Neumático/rin, salpicadera trasera izq., lado izq., cuarto trasero, toldo | Tapón de válvula; daño; presión (mín. 45 lb); daño de apariencia |
| 10 | Cara trasera: cajuela, medallón, parachoques, luces | Daño de apariencia (panel, pintura, equipo); componentes colgando debajo |
| 11 | Tapa de cajuela, interior de cajuela izq., cuarto trasero, toldo | Operación y ruido; daño de apariencia (manchas, decoloración); rueda de emergencia (presencia/conformidad); equipo de la hoja (gato, kit primeros auxilios); ensamble correcto |
| 12 | Neumático/rin, salpicadera trasera der., lado der., cuarto trasero, toldo | Igual que área 9, lado derecho |
| 13 | Puerta trasera derecha | Igual que área 7, lado derecho |
| 14 | Puerta frontal derecha | Igual que área 5, lado derecho |
| 15 | Interior frontal derecho | Limpieza; presencia de equipo según hoja |
| 16 | Lado derecho y toldo, salpicadera frontal der., neumático y rin | Igual que área 4, lado derecho *(corregido — ver erratas)* |
| 17 | Motor y luces de advertencia | Encendido y operación de motor; luces de advertencia encendidas |

### Erratas detectadas y confirmadas

- **Área 16** estaba duplicada textualmente como el lado izquierdo del área 4.
  Confirmado: el área 16 es el **lado derecho** equivalente al área 4.
- **Presión de neumáticos**: el área 4 dice 43 PSI (almacenamiento, todos los
  modelos) y las áreas 9/12 dicen "mínimo 45 lb". Quedan como dos umbrales
  reales distintos (delantero en almacenamiento vs. trasero) — no se
  unificaron porque no se confirmó si es un solo valor mal transcrito.

---

## 2. La decisión de diseño: gestión por excepción, no checklist

Requisito explícito del negocio: el operador debe capturar lo más rápido
posible. Un checklist de 17 áreas que se recorre una por una — aunque esté
todo bien — es exactamente el tipo de fricción que el rediseño de captura ya
eliminó (ver `ARQUITECTURA.md`, sección de decisiones UX).

**Regla adoptada:** no existe una pantalla de inspección aparte. El operador
solo interactúa cuando **encuentra** algo. Desde el esquema del vehículo
(`VehicleDiagram`) toca la zona donde está el problema, elige qué tipo de
hallazgo es de un menú **contextual a esa zona**, y reporta — con foto solo si
el hallazgo es visual.

Esto es una ampliación del flujo que ya existe (`reportar.tsx` +
`DamageSheet.tsx`), no una funcionalidad nueva. Las 17 áreas no se convierten
en 17 pantallas ni en 17 pasos obligatorios: se convierten en **el catálogo
de opciones que aparece según qué zona del diagrama se tocó**.

---

## 3. Modelo de datos: sin cambios en backend

El backend y SQLite ya guardan un defecto como:

```
{ zona: string, tipo: string, grado: V1|V2|V3, fotos: string[] }
```

Eso es suficiente para todo lo que sigue. La inteligencia de "qué tipos
mostrar según la zona" y "si pide foto o no" vive **solo en el cliente**, como
configuración estática (`src/domain/zones.ts`), no como un campo nuevo en la
base de datos. Cero cambios en `backend_python`.

### Categorías de hallazgo

Cada tipo de hallazgo del catálogo se etiqueta con estos atributos, que
determinan su comportamiento en la UI:

| Categoría | Ejemplos | ¿Pide foto? | ¿Reparación obligatoria (→ V1 automático)? |
|---|---|---|---|
| Cosmético / panel | Rayón, Abolladura, Golpe, Pintura | Sí | Solo si es Corrosión, Deformación, Protuberancia o Parte faltante |
| Operación | Puerta con ruido, difícil de abrir, no cierra | No | Sí, si impide el uso de la función |
| Fuga / sellado | Fuga de aceite, filtración de agua, empañado | Opcional (si hay mancha visible) | Sí, siempre |
| Eléctrico / luces | Luz fundida, testigo de advertencia encendido | No | Depende del caso |
| Neumático | Tapón de válvula ausente, presión baja, rin dañado | Sí si es visible | No (se corrige, no se "repara") |
| Limpieza | Vestiduras/alfombras sucias | No | No |
| Equipo faltante | Gato, kit de primeros auxilios, refacción | No | No — se reporta igual |
| Documentación | Chasis no coincide, hoja de equipo incompleta | No | No |

### Reparación obligatoria → severidad automática

Cuando el tipo elegido tiene `mandatoryRepair: true`, la severidad se fija
sola en **V1**. Esto no es una regla de estados nueva: V1 ya significa en el
flujo actual "no puede ir por la vía de garantía, debe pasar por reparación
física" (ver `ARQUITECTURA.md`). Solo se está aplicando automáticamente algo
que el sistema ya entiende.

---

## 4. Cómo se reorganizan las zonas

Varias de las 17 áreas ya son zonas existentes en el SVG del vehículo — el
cambio es ampliar qué menú de hallazgos aparece al tocarlas, no crear zonas
nuevas para todo:

| Zona del diagrama (ya existe) | Menú ampliado con |
|---|---|
| Cofre | Cosmético + área 2 (fugas, batería, tapones) + área 17 (luces de advertencia, arranque) |
| Puertas (4 zonas) | Cosmético + operación (ruido, difícil de operar, no cierra) |
| Cajuela | Cosmético exterior + área 11 (rueda de emergencia, gato, kit) |
| Neumáticos (4 zonas) | Válvula, presión, rin |

Zonas que no son paneles visibles desde arriba van como **chips fuera del
diagrama** (patrón que ya existe con Motor/Interior/Bajos/Eléctrico):

- **Interior delantero** (áreas 6, 15) — limpieza, equipo
- **Interior trasero** (área 8) — limpieza
- **Documentación** (área 1)

---

## 5. Cambios técnicos previstos

| Archivo | Cambio |
|---|---|
| `src/domain/zones.ts` | El catálogo pasa de una lista plana de 6 tipos a un mapa **zona → tipos de hallazgo permitidos**, cada uno con `category`, `requiresPhoto` y `mandatoryRepair` |
| `src/ui/DamageSheet.tsx` | El paso de cámara se vuelve condicional: se salta por completo si el tipo elegido no requiere foto |
| `app/(app)/reportar.tsx` | Aplica el auto-V1 cuando el tipo tiene `mandatoryRepair: true` |
| `OFF_DIAGRAM_ZONES` (en `zones.ts`) | Se amplía: Interior delantero, Interior trasero, Documentación (hoy solo tiene Motor, Interior, Bajos, Eléctrico) |

Nada de esto toca `backend_python`, el esquema de PostgreSQL, ni la tabla
`unit`/`defect` de SQLite.

---

## 6. Pendiente de decidir antes de implementar

**Documentación y equipo faltante no son daños físicos del vehículo** — son
verificaciones de otra naturaleza (presencia/ausencia, no cosmético ni
funcional). Dos caminos:

- **(a)** Capturarlos igual como un `UnitDefect` más, solo que con categoría
  `documentation` / `equipment`, reutilizando el mismo mecanismo (recomendado
  por simplicidad: cero infraestructura nueva).
- **(b)** Dejarlos fuera del alcance por ahora y enfocarse solo en daño
  físico/funcional del vehículo, revisando documentación/equipo en un momento
  posterior del proyecto.

---

## 7. Qué NO se está construyendo (alcance descartado)

Se consideró y se descartó una "Fase 2" de checklist PDI completo — una
pantalla separada donde el operador recorre las 17 áreas una por una marcando
pasa/falla. Se descartó explícitamente porque:

- Rompe el objetivo de velocidad de captura (<5 min/unidad).
- No es el patrón de "gestión por excepción" que pidió el negocio.
- Habría requerido tablas y endpoints nuevos en el backend
  (`UnitInspection`, `ChecklistItem`) que hoy no existen.

El diseño final logra cubrir el mismo contenido de las 17 áreas **sin** esa
pantalla, integrándolo al flujo de captura ya existente.
