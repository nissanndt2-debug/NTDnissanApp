import { getDb } from '@/db';
import type { Grade, UnitStatus } from '@/domain/constants';
import { FINDING_TYPES, ZONES, zoneCode } from '@/domain/zones';

/**
 * Datos de demostracion para revisar la interfaz sin backend.
 *
 * Se escriben con `sync_state = 'synced'` y con id de servidor, asi que NO
 * pasan por la bandeja de salida ni intentan subirse: son solo material para
 * ver las pantallas llenas. Al conectar el backend real, `pull.ts` sobrescribe
 * estas filas por VIN y la siembra deja de usarse.
 *
 * Solo se siembran hallazgos de carroceria (categoria `panel`) sobre paneles
 * reales: es lo que hace creible un reporte de defecto de demostracion. El
 * resto del catalogo (fugas, equipo, documentacion) se prueba a mano desde
 * `reportar.tsx`, no tiene sentido generarlo al azar.
 */

const VIN_PREFIX = '3N1AB7AP0KY';

/** Cuantas unidades sembrar en cada etapa del flujo. */
const DISTRIBUTION: { status: UnitStatus; count: number }[] = [
  { status: 'REPORTED', count: 6 },
  { status: 'SENT', count: 4 },
  { status: 'DELIVERED', count: 7 },
  { status: 'RECEIVED', count: 5 },
  { status: 'IN_REPAIR', count: 3 },
  { status: 'WTY_PENDING', count: 2 },
  { status: 'RELEASED', count: 3 },
  { status: 'WWS_RELEASED', count: 4 },
];

const MARKETS = ['Domestico', 'Exportacion', 'Traslado'];
const GRADES: Grade[] = ['V1', 'V2', 'V3'];
const PANELS = ZONES.filter((zone) => zone.kind === 'panel');
const PANEL_FINDINGS = FINDING_TYPES.filter((finding) => finding.category === 'panel');
const NON_MANDATORY_PANEL_FINDINGS = PANEL_FINDINGS.filter((finding) => !finding.mandatoryRepair);

/** Pseudoaleatorio con semilla: la demo se ve igual en cada arranque. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export async function seedDemoData(): Promise<void> {
  const db = await getDb();

  const existing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM unit WHERE vin LIKE ?',
    `${VIN_PREFIX}%`
  );
  if ((existing?.n ?? 0) > 0) return;

  const random = makeRandom(20260811);
  const now = new Date();
  let serial = 100000;
  let unitId = 9000;
  let defectId = 90000;

  // Sin transaccion a proposito: en web `expo-sqlite` corre sobre wa-sqlite y
  // una transaccion larga con escrituras encadenadas se queda colgada. Es una
  // siembra de demo; si se corta a la mitad, basta con volver a entrar.
  for (const { status, count } of DISTRIBUTION) {
    for (let index = 0; index < count; index += 1) {
      serial += Math.floor(random() * 900) + 11;
      unitId += 1;

      const vin = `${VIN_PREFIX}${serial}`;
      const localId = `demo-${unitId}`;
      const created = new Date(now.getTime() - Math.floor(random() * 8) * 3600_000);
      const rank = status === 'RECEIVED' && index < 3 ? index + 1 : null;

      await db.runAsync(
        `INSERT OR IGNORE INTO unit (id, local_id, vin, market, lane, status_name, plant,
                                     provider_id, is_available_today, priority_rank,
                                     registered_by, created_at, updated_at, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, 'A1', NULL, 1, ?, ?, ?, ?, 'synced')`,
        unitId,
        localId,
        vin,
        MARKETS[Math.floor(random() * MARKETS.length)],
        String(Math.floor(random() * 24) + 1),
        status,
        rank,
        'Demo Nissan',
        created.toISOString(),
        created.toISOString()
      );

      // 1-3 defectos por unidad. WTY_PENDING nunca lleva V1 (regla de
      // negocio: pasaria a reparacion fisica), asi que ahi solo se eligen
      // hallazgos que no fuerzan reparacion obligatoria.
      const forceNonMandatory = status === 'WTY_PENDING';
      const pool = forceNonMandatory ? NON_MANDATORY_PANEL_FINDINGS : PANEL_FINDINGS;
      const howMany = 1 + Math.floor(random() * 3);

      for (let d = 0; d < howMany; d += 1) {
        defectId += 1;
        const zone = PANELS[Math.floor(random() * PANELS.length)];
        const finding = pool[Math.floor(random() * pool.length)];

        let grade: Grade;
        if (finding.mandatoryRepair) {
          grade = 'V1';
        } else {
          const gradePool = forceNonMandatory ? GRADES.slice(1) : GRADES;
          grade = gradePool[Math.floor(random() * gradePool.length)] as Grade;
        }

        await db.runAsync(
          `INSERT OR IGNORE INTO defect (id, local_id, unit_local_id, type, zone, grade,
                                         description, is_resolved, photo_urls,
                                         pending_photos, sync_state)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, '[]', '[]', 'synced')`,
          defectId,
          `demo-d-${defectId}`,
          localId,
          `${finding.id} - ${finding.label}`,
          zoneCode(zone.id),
          grade,
          `${finding.label} en ${zone.label}`
        );
      }
    }
  }
}
