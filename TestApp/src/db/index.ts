import * as SQLite from 'expo-sqlite';
import { DDL, SCHEMA_VERSION } from './schema';

const DB_NAME = 'bodyapp.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Apertura perezosa + migracion. Se llama una vez desde el layout raiz;
 * el resto de la app usa `getDb()` sin preocuparse por el ciclo de vida.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(DDL);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    'schema_version'
  );
  const current = row ? Number(row.value) : 0;

  if (current === SCHEMA_VERSION) return;

  // Punto unico donde se agregan migraciones incrementales a futuro.
  // if (current < 2) { await db.execAsync('ALTER TABLE ...'); }

  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    'schema_version',
    String(SCHEMA_VERSION)
  );
}

/** Utilidad para lecturas tipadas. */
export async function query<T>(sql: string, ...args: SQLite.SQLiteBindValue[]) {
  const db = await getDb();
  return db.getAllAsync<T>(sql, ...args);
}

export async function queryOne<T>(sql: string, ...args: SQLite.SQLiteBindValue[]) {
  const db = await getDb();
  return db.getFirstAsync<T>(sql, ...args);
}

export async function run(sql: string, ...args: SQLite.SQLiteBindValue[]) {
  const db = await getDb();
  return db.runAsync(sql, ...args);
}

/** Borra todo menos la bandeja de salida. Se usa al cerrar sesion. */
export async function resetLocalCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM defect; DELETE FROM unit;');
}
