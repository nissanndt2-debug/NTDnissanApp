import { units as unitsApi } from '@/api/endpoints';
import { query } from '@/db';
import type { UnitStatus } from '@/domain/constants';
import type { Unit } from '@/domain/types';
import { upsertFromServer } from '@/data/units';

/**
 * Descarga inicial / refresco desde el backend hacia SQLite.
 *
 * Regla critica: NUNCA pisar filas con `sync_state = 'pending'`. Si un operador
 * cambio el estado de una unidad sin red, ese cambio todavia no llego al
 * servidor; traer la version del servidor encima lo borraria silenciosamente.
 * El outbox es la fuente de verdad hasta que se drena.
 */

/** Estados que vale la pena traer al dispositivo. ARCHIVED y ACCEPTED no. */
const SYNCED_STATUSES: UnitStatus[] = [
  'REPORTED',
  'SENT',
  'DELIVERED',
  'RECEIVED',
  'IN_REPAIR',
  'RELEASED',
  'WTY_PENDING',
  'WTY_RELEASED',
  'WWS_RELEASED',
  'UNAVAILABLE',
];

export interface PullResult {
  fetched: number;
  skippedPending: number;
}

interface PendingKeys {
  ids: Set<number>;
  vins: Set<string>;
}

/**
 * Claves de las filas con cambios locales sin enviar. Se protegen por id
 * cuando ya existen en el servidor y por VIN cuando nacieron en el dispositivo
 * (todavia sin id): en ambos casos el estado local es mas nuevo que el remoto.
 */
async function pendingKeys(): Promise<PendingKeys> {
  const rows = await query<{ id: number | null; vin: string }>(
    "SELECT id, vin FROM unit WHERE sync_state = 'pending'"
  );
  return {
    ids: new Set(rows.filter((row) => row.id != null).map((row) => row.id!)),
    vins: new Set(rows.filter((row) => row.id == null).map((row) => row.vin)),
  };
}

export async function pullAll(token: string): Promise<PullResult> {
  const pending = await pendingKeys();
  const result: PullResult = { fetched: 0, skippedPending: 0 };

  for (const status of SYNCED_STATUSES) {
    let batch: Unit[];
    try {
      batch = await unitsApi.listByStatus(status, token);
    } catch {
      // Sin red o error del servidor: se reintenta en el siguiente ciclo.
      continue;
    }

    const safe = batch.filter((unit) => {
      if (pending.ids.has(unit.id) || pending.vins.has(unit.vin)) {
        result.skippedPending += 1;
        return false;
      }
      return true;
    });

    if (safe.length > 0) {
      await upsertFromServer(safe);
      result.fetched += safe.length;
    }
  }

  return result;
}
