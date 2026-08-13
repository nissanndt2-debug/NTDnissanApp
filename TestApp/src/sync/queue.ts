import * as Crypto from 'expo-crypto';
import { getDb, query, run } from '@/db';
import type { MutationKind, QueuedMutation } from '@/domain/types';

/**
 * Bandeja de salida (outbox).
 *
 * Regla de oro de la app: NINGUNA pantalla llama a la red directamente para
 * escribir. Toda escritura hace dos cosas en una transaccion local:
 *   1. aplica el cambio optimista a SQLite (el operador ve el resultado ya)
 *   2. encola la mutacion aqui
 * El motor la drena cuando hay red. Si no hay, el operador sigue trabajando.
 */

export function newId(): string {
  return Crypto.randomUUID();
}

export async function enqueue(
  kind: MutationKind,
  targetId: string,
  payload: unknown
): Promise<string> {
  const id = newId();
  await run(
    `INSERT INTO outbox (id, kind, target_id, payload, attempts, created_at, next_attempt_at)
     VALUES (?, ?, ?, ?, 0, ?, 0)`,
    id,
    kind,
    targetId,
    JSON.stringify(payload),
    Date.now()
  );
  return id;
}

/** Mutaciones listas para intentar, en orden de creacion (FIFO estricto). */
export async function readyMutations(limit = 25): Promise<QueuedMutation[]> {
  const rows = await query<{
    id: string;
    kind: MutationKind;
    target_id: string;
    payload: string;
    attempts: number;
    last_error: string | null;
    created_at: number;
    next_attempt_at: number;
  }>(
    `SELECT * FROM outbox
     WHERE next_attempt_at <= ?
     ORDER BY created_at ASC
     LIMIT ?`,
    Date.now(),
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    targetId: row.target_id,
    payload: row.payload,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
  }));
}

export async function removeMutation(id: string): Promise<void> {
  await run('DELETE FROM outbox WHERE id = ?', id);
}

/** Backoff exponencial con techo de 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1_000, 5 * 60_000);
}

export async function markFailure(id: string, attempts: number, error: string): Promise<void> {
  await run(
    'UPDATE outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?',
    attempts + 1,
    error.slice(0, 500),
    Date.now() + backoffMs(attempts + 1),
    id
  );
}

/**
 * Descarta una mutacion irrecuperable (4xx) y marca la fila afectada.
 *
 * Solo se marca 'failed' si la unidad AUN no tiene id de servidor. Caso tipico
 * que justifica el matiz: el pull trae la unidad y le asigna id antes de que
 * drene su CREATE_UNIT; ese POST entonces responde 409 (VIN duplicado) aunque
 * la unidad si esta en el servidor. Marcarla en rojo seria una falsa alarma.
 */
export async function discard(id: string, targetId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
    await db.runAsync(
      "UPDATE unit SET sync_state = 'failed' WHERE local_id = ? AND id IS NULL",
      targetId
    );
  });
  console.warn(`[outbox] mutacion descartada ${id}: ${error}`);
}

export async function pendingCount(): Promise<number> {
  const rows = await query<{ n: number }>('SELECT COUNT(*) as n FROM outbox');
  return rows[0]?.n ?? 0;
}

export async function failedCount(): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*) as n FROM outbox WHERE attempts >= 3'
  );
  return rows[0]?.n ?? 0;
}
