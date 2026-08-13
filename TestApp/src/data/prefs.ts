import { queryOne, run } from '@/db';

/**
 * Preferencias del operador, en la tabla `meta`.
 *
 * Existe por una sola razon de tiempo: el carril y el mercado casi nunca
 * cambian dentro de un turno. Recordarlos convierte dos campos obligatorios en
 * dos chips que solo se tocan cuando el operador cambia de sitio.
 */

export async function getPref(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setPref(key: string, value: string): Promise<void> {
  await run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}

export const PREF_KEYS = {
  lane: 'pref.lane',
  market: 'pref.market',
} as const;
