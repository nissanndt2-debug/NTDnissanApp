import { getDb, query, queryOne, run } from "@/db";
import {
  GRADE_HOURS,
  type Grade,
  type UnitStatus,
  canTransition,
} from "@/domain/constants";
import type { Defect, Unit } from "@/domain/types";
import { categoryOfStoredType, isHourBearing } from "@/domain/zones";
import { enqueue, newId } from "@/sync/queue";

/**
 * Repositorio de unidades.
 *
 * Toda la app lee de SQLite y escribe con el patron
 * "aplicar local + encolar". Ninguna pantalla llama a la red por su cuenta:
 * asi el comportamiento con y sin conexion es EL MISMO y no hay dos caminos
 * de codigo que mantener.
 */

interface UnitRow {
  id: number | null;
  local_id: string;
  vin: string;
  market: string;
  lane: string;
  status_name: UnitStatus;
  plant: string | null;
  provider_id: number | null;
  is_available_today: number;
  estimated_repair_hours: number | null;
  estimated_completion: string | null;
  priority_rank: number | null;
  priority_note: string | null;
  scm_decision: string | null;
  registered_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  sync_state: Unit["_sync"];
}

interface DefectRow {
  id: number | null;
  local_id: string;
  unit_local_id: string;
  type: string;
  zone: string;
  grade: Grade;
  description: string | null;
  is_resolved: number;
  photo_urls: string;
  pending_photos: string;
  photo_error: string | null;
  sync_state: Unit["_sync"];
}

function toUnit(row: UnitRow, defects: Defect[]): Unit {
  return {
    id: row.id ?? 0,
    localId: row.local_id,
    vin: row.vin,
    market: row.market,
    lane: row.lane,
    statusName: row.status_name,
    plant: row.plant as Unit["plant"],
    providerId: row.provider_id,
    isAvailableToday: row.is_available_today === 1,
    estimatedRepairHours: row.estimated_repair_hours,
    estimatedCompletionDate: row.estimated_completion,
    priorityRank: row.priority_rank,
    priorityNote: row.priority_note,
    scmDecision: row.scm_decision as Unit["scmDecision"],
    registeredBy: row.registered_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    defects,
    _sync: row.sync_state,
  };
}

function toDefect(row: DefectRow, unitId: number): Defect {
  return {
    id: row.id ?? 0,
    localId: row.local_id,
    unitId,
    type: row.type,
    zone: row.zone,
    grade: row.grade,
    description: row.description,
    isResolved: row.is_resolved === 1,
    photoUrls: JSON.parse(row.photo_urls) as string[],
    pendingPhotos: JSON.parse(row.pending_photos) as string[],
    photoError: row.photo_error,
  };
}

/** Lee unidades por estado desde la base LOCAL. Nunca falla por falta de red. */
export async function listByStatus(status: UnitStatus): Promise<Unit[]> {
  const unitRows = await query<UnitRow>(
    "SELECT * FROM unit WHERE status_name = ? ORDER BY priority_rank IS NULL, priority_rank ASC, created_at DESC",
    status,
  );
  if (unitRows.length === 0) return [];

  const defectRows = await query<DefectRow>(
    `SELECT * FROM defect WHERE unit_local_id IN (${unitRows.map(() => "?").join(",")})`,
    ...unitRows.map((row) => row.local_id),
  );

  const byUnit = new Map<string, DefectRow[]>();
  for (const row of defectRows) {
    const list = byUnit.get(row.unit_local_id) ?? [];
    list.push(row);
    byUnit.set(row.unit_local_id, list);
  }

  return unitRows.map((row) =>
    toUnit(
      row,
      (byUnit.get(row.local_id) ?? []).map((defectRow) =>
        toDefect(defectRow, row.id ?? 0),
      ),
    ),
  );
}

export interface NewUnitInput {
  vin: string;
  market: string;
  lane: string;
  registeredById: number;
  registeredByName: string;
  providerId?: number;
  plant?: string | null;
  initialStatus: UnitStatus;
  defects: { type: string; zone: string; grade: Grade; photoUri?: string }[];
}

/**
 * Crea la unidad y sus defectos EN UNA sola transaccion local, y encola
 * las mutaciones correspondientes. El operador ve la unidad creada al
 * instante, tenga red o no.
 */
export async function createUnit(input: NewUnitInput): Promise<string> {
  const db = await getDb();
  const unitLocalId = newId();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO unit (id, local_id, vin, market, lane, status_name, plant, provider_id,
                         is_available_today, registered_by, created_at, updated_at, sync_state)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'pending')`,
      unitLocalId,
      input.vin,
      input.market,
      input.lane,
      input.initialStatus,
      input.plant ?? null,
      input.providerId ?? null,
      input.registeredByName,
      now,
      now,
    );

    for (const defect of input.defects) {
      const defectLocalId = newId();
      await db.runAsync(
        `INSERT INTO defect (id, local_id, unit_local_id, type, zone, grade, description,
                             is_resolved, photo_urls, pending_photos, sync_state)
         VALUES (NULL, ?, ?, ?, ?, ?, ?, 0, '[]', ?, 'pending')`,
        defectLocalId,
        unitLocalId,
        defect.type,
        defect.zone,
        defect.grade,
        `${defect.type} en ${defect.zone}`,
        JSON.stringify(defect.photoUri ? [defect.photoUri] : []),
      );
    }
  });

  // Encolar: primero la unidad, luego sus defectos, luego las fotos.
  await enqueue("CREATE_UNIT", unitLocalId, {
    vin: input.vin,
    market: input.market,
    lane: input.lane,
    registeredById: input.registeredById,
    ...(input.providerId ? { providerId: input.providerId } : {}),
  });

  const createdDefects = await query<DefectRow>(
    "SELECT * FROM defect WHERE unit_local_id = ?",
    unitLocalId,
  );

  for (const defect of createdDefects) {
    await enqueue("ADD_DEFECT", unitLocalId, {
      localDefectId: defect.local_id,
      defectType: defect.type,
      zone: defect.zone,
      grade: defect.grade,
      registeredById: input.registeredById,
      description: defect.description,
    });

    const pending = JSON.parse(defect.pending_photos) as string[];
    for (const localUri of pending) {
      await enqueue("UPLOAD_PHOTO", unitLocalId, {
        defectLocalId: defect.local_id,
        localUri,
      });
    }
  }

  return unitLocalId;
}

/**
 * Agrega un hallazgo a una unidad ya reportada desde la revisión WWS.
 *
 * Igual que la captura inicial, primero queda disponible en SQLite y se
 * encola para el backend; el operador no tiene que esperar Wi‑Fi para seguir
 * nivelando las demás unidades.
 */
export async function addDefectToUnit(
  unit: Unit,
  input: {
    type: string;
    zone: string;
    grade: Grade;
    registeredById: number;
    photoUri?: string;
  },
): Promise<void> {
  if (!unit.localId) throw new Error("La unidad no tiene identificador local.");

  const defectLocalId = newId();
  const description = `${input.type} en ${input.zone}`;

  // Protege la evidencia local frente al pull mientras el defecto y su foto
  // todavía no existen en el servidor.
  await run(
    "UPDATE unit SET sync_state = 'pending', updated_at = ? WHERE local_id = ?",
    new Date().toISOString(),
    unit.localId,
  );

  await run(
    `INSERT INTO defect (id, local_id, unit_local_id, type, zone, grade, description,
                         is_resolved, photo_urls, pending_photos, sync_state)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, 0, '[]', ?, 'pending')`,
    defectLocalId,
    unit.localId,
    input.type,
    input.zone,
    input.grade,
    description,
    JSON.stringify(input.photoUri ? [input.photoUri] : []),
  );

  await enqueue("ADD_DEFECT", unit.localId, {
    localDefectId: defectLocalId,
    defectType: input.type,
    zone: input.zone,
    grade: input.grade,
    registeredById: input.registeredById,
    description,
  });

  if (input.photoUri) {
    await enqueue("UPLOAD_PHOTO", unit.localId, {
      defectLocalId,
      localUri: input.photoUri,
    });
  }
}

/** Reintenta únicamente la evidencia que falló, sin duplicar el defecto. */
export async function retryDefectPhotoUpload(
  unit: Unit,
  defect: Defect,
): Promise<void> {
  if (!unit.localId || !defect.localId) {
    throw new Error("No se puede identificar la evidencia para reintentar.");
  }

  const photos = defect.pendingPhotos ?? [];
  if (photos.length === 0) {
    throw new Error("No hay una foto pendiente para volver a subir.");
  }

  await run(
    "UPDATE defect SET photo_error = NULL, sync_state = 'pending' WHERE local_id = ?",
    defect.localId,
  );
  await run(
    "UPDATE unit SET sync_state = 'pending', updated_at = ? WHERE local_id = ?",
    new Date().toISOString(),
    unit.localId,
  );

  for (const localUri of photos) {
    await enqueue("UPLOAD_PHOTO", unit.localId, {
      defectLocalId: defect.localId,
      localUri,
    });
  }
}

/**
 * Descarta una unidad recien creada: borra la fila local, sus defectos (por
 * cascada) y las mutaciones que aun no salieron del dispositivo.
 *
 * Sostiene el "Deshacer" de la captura. Solo es seguro mientras la unidad no
 * haya llegado al servidor; por eso exige que siga sin `id`.
 */
export async function discardUnit(unitLocalId: string): Promise<boolean> {
  const row = await queryOne<{ id: number | null }>(
    "SELECT id FROM unit WHERE local_id = ?",
    unitLocalId,
  );
  if (!row || row.id != null) return false;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM outbox WHERE target_id = ?", unitLocalId);
    await db.runAsync(
      "DELETE FROM defect WHERE unit_local_id = ?",
      unitLocalId,
    );
    await db.runAsync("DELETE FROM unit WHERE local_id = ?", unitLocalId);
  });
  return true;
}

/**
 * Cambio de estado. Valida la transicion en el cliente porque el backend
 * actual no lo hace (ver ARQUITECTURA.md).
 */
export async function changeStatus(
  unitLocalId: string,
  from: UnitStatus,
  to: UnitStatus,
  changedById: number,
  extra?: { note?: string; estimatedRepairHours?: number },
): Promise<void> {
  if (!canTransition(from, to)) {
    throw new Error(`Transicion invalida: ${from} -> ${to}`);
  }

  await run(
    "UPDATE unit SET status_name = ?, sync_state = 'pending', updated_at = ? WHERE local_id = ?",
    to,
    new Date().toISOString(),
    unitLocalId,
  );

  await enqueue("UPDATE_STATUS", unitLocalId, {
    newStatus: to,
    changedById,
    ...(extra?.note ? { note: extra.note } : {}),
    ...(extra?.estimatedRepairHours
      ? { estimatedRepairHours: extra.estimatedRepairHours }
      : {}),
  });
}

/** Cambio de estado en LOTE: una accion del operador, N unidades. */
export async function changeStatusBulk(
  targets: { localId: string; from: UnitStatus }[],
  to: UnitStatus,
  changedById: number,
  extra?: { note?: string; estimatedRepairHours?: number },
): Promise<{ ok: number; skipped: number }> {
  let ok = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      await changeStatus(target.localId, target.from, to, changedById, extra);
      ok += 1;
    } catch {
      skipped += 1;
    }
  }

  return { ok, skipped };
}

/**
 * Horas estimadas derivadas de la severidad, sin pedir nada al servidor.
 * Solo cuentan los defectos SIN resolver: al liberar una unidad el backend
 * marca todos como resueltos, y seguir sumandolos inflaria la estimacion.
 *
 * Tambien se excluyen los hallazgos que no son trabajo de carroceria (llanta,
 * limpieza, equipo faltante, documentacion): un gato faltante no le cuesta
 * horas de Body Shop a nadie, y contarlo infla la cola de reparacion con
 * trabajo que no existe. Un `type` sin prefijo reconocido (datos capturados
 * antes de este catalogo) cuenta por defecto para no perder horas ya
 * estimadas de antes.
 */
export function estimateHours(
  defects: { grade: Grade; type: string; isResolved?: boolean }[],
): number {
  return defects
    .filter((defect) => !defect.isResolved)
    .filter((defect) => {
      const category = categoryOfStoredType(defect.type);
      return category ? isHourBearing(category) : true;
    })
    .reduce((total, defect) => total + GRADE_HOURS[defect.grade], 0);
}

/** Nivelacion de WWS: cambia el grado de un defecto. */
export async function updateDefectGrade(
  unitLocalId: string,
  defect: Defect,
  newGrade: Grade,
  updatedById: number,
): Promise<void> {
  await run(
    "UPDATE defect SET grade = ?, sync_state = 'pending' WHERE local_id = ?",
    newGrade,
    defect.localId!,
  );

  // No se guarda `defect.id` aqui a proposito: si el defecto nacio offline
  // todavia no lo tiene. El motor lo resuelve al drenar, cuando el ADD_DEFECT
  // previo ya paso.
  await enqueue("UPDATE_DEFECT_GRADE", unitLocalId, {
    defectLocalId: defect.localId,
    grade: newGrade,
    updatedById,
  });
}

/**
 * Reordena la cola de prioridad. Escribe los rangos locales de inmediato y
 * encola UNA sola mutacion para todo el lote (el backend expone
 * `PUT /units/priority/order` justamente para esto).
 */
export async function reorderPriority(
  ordered: Unit[],
  assignedById: number,
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const [index, unit] of ordered.entries()) {
      await db.runAsync(
        'UPDATE unit SET "priority_rank" = ? WHERE local_id = ?',
        index + 1,
        unit.localId!,
      );
    }
  });

  const serverIds = ordered
    .map((unit) => unit.id)
    .filter((id): id is number => !!id);
  if (serverIds.length > 0) {
    await enqueue("REORDER_PRIORITY", "queue", {
      unitIds: serverIds,
      assignedById,
    });
  }
}

/** Agrega una unidad a la cola de prioridad al final. */
export async function addToQueue(
  unit: Unit,
  assignedById: number,
): Promise<void> {
  const rows = await query<{ max_rank: number | null }>(
    "SELECT MAX(priority_rank) as max_rank FROM unit WHERE priority_rank IS NOT NULL",
  );
  const rank = (rows[0]?.max_rank ?? 0) + 1;

  await run(
    "UPDATE unit SET priority_rank = ? WHERE local_id = ?",
    rank,
    unit.localId!,
  );
  await enqueue("UPDATE_PRIORITY", unit.localId!, { rank, assignedById });
}

/** Guarda una nota operativa sin alterar la posición actual de la cola. */
export async function updatePriorityNote(
  unit: Unit,
  note: string,
  assignedById: number,
): Promise<void> {
  await run(
    "UPDATE unit SET priority_note = ?, sync_state = 'pending', updated_at = ? WHERE local_id = ?",
    note.trim() || null,
    new Date().toISOString(),
    unit.localId!,
  );
  await enqueue("UPDATE_PRIORITY", unit.localId!, {
    note: note.trim() || undefined,
    rank: unit.priorityRank ?? undefined,
    assignedById,
  });
}

/** Ajusta manualmente la estimación de una reparación ya iniciada. */
export async function updateEstimatedRepairHours(
  unit: Unit,
  estimatedRepairHours: number,
  changedById: number,
): Promise<void> {
  if (!Number.isFinite(estimatedRepairHours) || estimatedRepairHours <= 0) {
    throw new Error("La estimación debe ser mayor a cero.");
  }
  await run(
    "UPDATE unit SET estimated_repair_hours = ?, sync_state = 'pending', updated_at = ? WHERE local_id = ?",
    estimatedRepairHours,
    new Date().toISOString(),
    unit.localId!,
  );
  await enqueue("UPDATE_ESTIMATED_TIME", unit.localId!, {
    estimatedRepairHours,
    updatedById: changedById,
  });
}

/**
 * Reconcilia lo que devolvio el servidor contra el cache local.
 *
 * La parte delicada es NO duplicar filas. Una unidad (o un defecto) creada en
 * el dispositivo ya existe localmente con un uuid; cuando el servidor la
 * devuelve con su id numerico hay que reutilizar esa fila, no insertar otra.
 * Por eso se busca primero por id de servidor y, si no aparece, por su
 * identidad natural (VIN para unidades; tipo+zona para defectos).
 */
export async function upsertFromServer(serverUnits: Unit[]): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    for (const unit of serverUnits) {
      const byServerId = await db.getFirstAsync<{ local_id: string }>(
        "SELECT local_id FROM unit WHERE id = ?",
        unit.id,
      );

      // Fallback: una unidad creada offline todavia no tiene id, pero su VIN
      // ya la identifica. Sin esto quedarian dos filas para el mismo carro.
      const byVin = byServerId
        ? null
        : await db.getFirstAsync<{ local_id: string }>(
            "SELECT local_id FROM unit WHERE vin = ? AND id IS NULL",
            unit.vin,
          );

      const localId = byServerId?.local_id ?? byVin?.local_id ?? newId();

      await db.runAsync(
        `INSERT INTO unit (id, local_id, vin, market, lane, status_name, plant, provider_id,
                           is_available_today, estimated_repair_hours, estimated_completion,
                           priority_rank, priority_note, registered_by, created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
         ON CONFLICT(local_id) DO UPDATE SET
           id = excluded.id,
           status_name = excluded.status_name,
           priority_rank = excluded.priority_rank,
           estimated_repair_hours = excluded.estimated_repair_hours,
           estimated_completion = excluded.estimated_completion,
           updated_at = excluded.updated_at,
           sync_state = 'synced'`,
        unit.id,
        localId,
        unit.vin,
        unit.market,
        unit.lane,
        unit.statusName,
        unit.plant ?? null,
        unit.providerId ?? null,
        unit.isAvailableToday ? 1 : 0,
        unit.estimatedRepairHours ?? null,
        unit.estimatedCompletionDate ?? null,
        unit.priorityRank ?? null,
        unit.priorityNote ?? null,
        unit.registeredBy ?? null,
        unit.createdAt ?? null,
        unit.updatedAt ?? null,
      );

      for (const defect of unit.defects ?? []) {
        const defectByServerId = await db.getFirstAsync<{ local_id: string }>(
          "SELECT local_id FROM defect WHERE id = ?",
          defect.id,
        );

        // Mismo problema que con las unidades: un defecto capturado offline ya
        // tiene fila local con uuid. Se reutiliza emparejando por tipo+zona
        // dentro de la misma unidad, en vez de crear un `srv-<id>` paralelo.
        const defectByShape = defectByServerId
          ? null
          : await db.getFirstAsync<{ local_id: string }>(
              `SELECT local_id FROM defect
               WHERE unit_local_id = ? AND type = ? AND zone = ? AND id IS NULL
               LIMIT 1`,
              localId,
              defect.type,
              defect.zone,
            );

        const defectLocalId =
          defectByServerId?.local_id ??
          defectByShape?.local_id ??
          `srv-${defect.id}`;

        await db.runAsync(
          `INSERT INTO defect (id, local_id, unit_local_id, type, zone, grade, description,
                               is_resolved, photo_urls, pending_photos, sync_state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'synced')
           ON CONFLICT(local_id) DO UPDATE SET
             id = excluded.id,
             grade = excluded.grade,
             is_resolved = excluded.is_resolved,
             photo_urls = excluded.photo_urls,
             sync_state = 'synced'`,
          defect.id,
          defectLocalId,
          localId,
          defect.type,
          defect.zone,
          defect.grade,
          defect.description ?? null,
          defect.isResolved ? 1 : 0,
          JSON.stringify(defect.photoUrls ?? []),
        );
      }
    }
  });
}
