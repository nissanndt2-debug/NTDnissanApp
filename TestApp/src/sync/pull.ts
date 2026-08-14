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

  // Las peticiones salen TODAS a la vez. Son independientes entre si y su costo
  // es latencia de red, no CPU: contra el backend desplegado cada una tarda
  // ~300 ms, asi que en serie el ciclo completo medía ~4.4 s y en paralelo
  // ~0.6 s. Esto corre en cada login, cada vuelta a primer plano y cada evento
  // realtime, asi que era el retraso mas visible de toda la app.
  const batches = await Promise.all(
    SYNCED_STATUSES.map(async (status) => {
      try {
        return await unitsApi.listByStatus(status, token);
      } catch {
        // Sin red o error del servidor: se reintenta en el siguiente ciclo.
        // Se devuelve null para no confundirlo con "el servidor no tiene nada".
        return null;
      }
    })
  );

  // Las ESCRITURAS siguen en serie a proposito: `upsertFromServer` abre una
  // transaccion en SQLite y varias simultaneas se bloquearian entre si. Lo que
  // se paralelizo es la espera de red, que es donde estaba el tiempo.
  for (const batch of batches) {
    if (!batch) continue;

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
