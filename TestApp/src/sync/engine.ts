import { ApiError, NetworkError, apiUploadPhoto } from "@/api/client";
import { units } from "@/api/endpoints";
import { getDb, query, run } from "@/db";
import type { QueuedMutation } from "@/domain/types";
import { discard, markFailure, readyMutations, removeMutation } from "./queue";

/**
 * Motor de drenado del outbox.
 *
 * Dos problemas que resuelve y que son la razon de que esto no sea trivial:
 *
 * 1. REMAPEO DE IDs. Una unidad creada sin red solo tiene `local_id` (uuid).
 *    Sus defectos y cambios de estado apuntan a ese uuid. Cuando la unidad
 *    finalmente se crea en el servidor y recibe un id numerico, hay que
 *    resolver ese uuid -> id antes de enviar las mutaciones que le siguen.
 *
 * 2. ORDEN. El drenado es FIFO estricto y se detiene ante el primer fallo de
 *    red, porque enviar `UPDATE_STATUS` de una unidad cuyo `CREATE_UNIT` aun
 *    no paso produciria un 404 y perderia el trabajo del operador.
 */

let draining = false;

export interface DrainResult {
  sent: number;
  failed: number;
  stoppedByNetwork: boolean;
}

/** uuid local -> id de servidor, para unidades nacidas offline. */
async function resolveServerId(localId: string): Promise<number | null> {
  // Si ya es numerico, la mutacion nacio con una unidad que ya existia.
  const asNumber = Number(localId);
  if (Number.isInteger(asNumber) && asNumber > 0) return asNumber;

  const rows = await query<{ id: number | null }>(
    "SELECT id FROM unit WHERE local_id = ?",
    localId,
  );
  return rows[0]?.id ?? null;
}

/**
 * Empareja un defecto local con el id que le dio el servidor.
 *
 * El backend responde con la unidad completa, no con el defecto creado, asi que
 * hay que identificarlo por (tipo, zona). Se descartan los ids que ya estan
 * tomados por otra fila local para no asignar el mismo id dos veces cuando una
 * unidad tiene defectos parecidos.
 */
async function matchServerDefectId(
  unit: { defects?: { id: number; type: string; zone: string }[] },
  defectType: string,
  zone: string,
): Promise<number | null> {
  const candidates = (unit.defects ?? []).filter(
    (defect) => defect.type === defectType && defect.zone === zone,
  );
  if (candidates.length === 0) return null;

  const taken = await query<{ id: number }>(
    "SELECT id FROM defect WHERE id IS NOT NULL",
  );
  const takenIds = new Set(taken.map((row) => row.id));

  const free = candidates.find((defect) => !takenIds.has(defect.id));
  return free?.id ?? null;
}

async function applyServerId(localId: string, serverId: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE unit SET id = ?, sync_state = 'synced' WHERE local_id = ?",
      serverId,
      localId,
    );
  });
}

async function syncUnitPhotoState(unitLocalId: string): Promise<void> {
  const rows = await query<{ pending: number }>(
    `SELECT COUNT(*) as pending
     FROM defect
     WHERE unit_local_id = ? AND pending_photos != '[]'`,
    unitLocalId,
  );
  await run(
    "UPDATE unit SET sync_state = ? WHERE local_id = ?",
    (rows[0]?.pending ?? 0) > 0 ? "pending" : "synced",
    unitLocalId,
  );
}

async function recordPhotoFailure(
  defectLocalId: string | undefined,
  reason: string,
): Promise<void> {
  if (!defectLocalId) return;
  await run(
    "UPDATE defect SET photo_error = ?, sync_state = 'failed' WHERE local_id = ?",
    reason.slice(0, 400),
    defectLocalId,
  );
  await run(
    `UPDATE unit SET sync_state = 'pending'
     WHERE local_id = (SELECT unit_local_id FROM defect WHERE local_id = ?)`,
    defectLocalId,
  );
}

async function handle(mutation: QueuedMutation, token: string): Promise<void> {
  const payload = JSON.parse(mutation.payload) as Record<string, unknown>;

  switch (mutation.kind) {
    case "CREATE_UNIT": {
      const created = await units.create(payload as never, token);
      await applyServerId(mutation.targetId, created.id);
      return;
    }

    case "ADD_DEFECT": {
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId) {
        // La unidad aun no existe en servidor: reintentar despues, no descartar.
        throw new NetworkError("Unidad padre aun sin id de servidor");
      }

      const localDefectId = payload.localDefectId as string;
      const updated = await units.addDefect(unitId, payload as never, token);

      // Guardar el id que asigno el servidor. Sin esto el defecto local se
      // queda sin id para siempre y cualquier UPDATE_DEFECT_GRADE posterior
      // no tiene a que apuntar.
      const serverId = await matchServerDefectId(
        updated,
        payload.defectType as string,
        payload.zone as string,
      );

      await run(
        "UPDATE defect SET id = ?, sync_state = 'synced' WHERE local_id = ?",
        serverId,
        localDefectId,
      );
      await syncUnitPhotoState(mutation.targetId);
      return;
    }

    case "UPLOAD_PHOTO": {
      const defectLocalId = payload.defectLocalId as string;
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId)
        throw new NetworkError("Unidad padre aun sin id de servidor");

      const rows = await query<{
        id: number | null;
        photo_urls: string;
        pending_photos: string;
      }>(
        "SELECT id, photo_urls, pending_photos FROM defect WHERE local_id = ?",
        defectLocalId,
      );
      const defectId = rows[0]?.id ?? null;
      if (!defectId) throw new NetworkError("Defecto aun sin id de servidor");

      // La misma mutation id es la clave idempotente de Cloudinary: si el
      // POST de adjuntar falla después de la subida, el reintento reutiliza la
      // imagen en vez de crear otra referencia que nunca se mostrará.
      const uploaded = await apiUploadPhoto(
        payload.localUri as string,
        token,
        defectLocalId,
        mutation.id,
      );
      await units.addDefectPhoto(
        unitId,
        defectId,
        { url: uploaded.url },
        token,
      );

      const urls = JSON.parse(rows[0]?.photo_urls ?? "[]") as string[];
      const pending = JSON.parse(rows[0]?.pending_photos ?? "[]") as string[];
      await run(
        "UPDATE defect SET photo_urls = ?, pending_photos = ?, photo_error = NULL, sync_state = 'synced' WHERE local_id = ?",
        JSON.stringify([...new Set([...urls, uploaded.url])]),
        JSON.stringify(
          pending.filter((uri) => uri !== (payload.localUri as string)),
        ),
        defectLocalId,
      );
      await syncUnitPhotoState(mutation.targetId);
      return;
    }

    case "UPDATE_STATUS": {
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId)
        throw new NetworkError("Unidad padre aun sin id de servidor");
      await units.updateStatus(unitId, payload as never, token);
      await run(
        "UPDATE unit SET sync_state = 'synced' WHERE local_id = ?",
        mutation.targetId,
      );
      return;
    }

    case "UPDATE_PRIORITY": {
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId)
        throw new NetworkError("Unidad padre aun sin id de servidor");
      await units.updatePriority(unitId, payload as never, token);
      return;
    }

    case "UPDATE_ESTIMATED_TIME": {
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId)
        throw new NetworkError("Unidad padre aun sin id de servidor");
      await units.updateEstimatedTime(unitId, payload as never, token);
      return;
    }

    case "UPDATE_DEFECT_GRADE": {
      const unitId = await resolveServerId(mutation.targetId);
      if (!unitId)
        throw new NetworkError("Unidad padre aun sin id de servidor");

      const defectLocalId = payload.defectLocalId as string;

      // El id se resuelve AQUI, no en el momento de encolar: si el defecto
      // nacio offline, su ADD_DEFECT va antes en la cola (FIFO) y ya le
      // asigno un id de servidor cuando llegamos a este punto.
      const rows = await query<{ id: number | null }>(
        "SELECT id FROM defect WHERE local_id = ?",
        defectLocalId,
      );
      const defectId = rows[0]?.id ?? null;

      if (!defectId) {
        // Su ADD_DEFECT todavia no pasa. Reintentar, no descartar.
        throw new NetworkError("Defecto aun sin id de servidor");
      }

      await units.updateDefectGrade(
        unitId,
        defectId,
        {
          grade: payload.grade as string,
          updatedById: payload.updatedById as number,
        },
        token,
      );
      await run(
        "UPDATE defect SET sync_state = 'synced' WHERE local_id = ?",
        defectLocalId,
      );
      return;
    }

    case "REORDER_PRIORITY": {
      const ids = payload.unitIds as number[];
      // Solo se reordenan unidades que ya existen en servidor.
      if (!ids || ids.length === 0) return;
      await units.reorderPriority(
        { unitIds: ids, assignedById: payload.assignedById as number },
        token,
      );
      return;
    }
  }
}

export async function drain(token: string | null): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, stoppedByNetwork: false };

  if (!token || draining) return result;
  draining = true;

  try {
    const batch = await readyMutations();

    for (const mutation of batch) {
      try {
        await handle(mutation, token);
        await removeMutation(mutation.id);
        result.sent += 1;
      } catch (error) {
        const payload = JSON.parse(mutation.payload) as Record<string, unknown>;
        if (mutation.kind === "UPLOAD_PHOTO") {
          await recordPhotoFailure(
            payload.defectLocalId as string | undefined,
            error instanceof Error ? error.message : "No se pudo subir la foto",
          );
        }
        if (error instanceof NetworkError) {
          // Sin red: detener el lote. El orden FIFO debe preservarse.
          await markFailure(mutation.id, mutation.attempts, error.message);
          result.stoppedByNetwork = true;
          break;
        }

        if (error instanceof ApiError && !error.retriable) {
          // 4xx: el servidor rechaza esto y lo seguira rechazando.
          await discard(mutation.id, mutation.targetId, error.message);
          result.failed += 1;
          continue;
        }

        await markFailure(
          mutation.id,
          mutation.attempts,
          error instanceof Error ? error.message : "error desconocido",
        );
        result.failed += 1;
      }
    }
  } finally {
    draining = false;
  }

  return result;
}
