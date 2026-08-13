import { query } from '@/db';
import { GRADE_HOURS, type Grade, type UnitStatus } from '@/domain/constants';

/**
 * Agregados para el dashboard.
 *
 * Se calculan con SQL sobre SQLite en vez de traer todo a memoria y reducir en
 * JS: es la razon de haber elegido una base local real y no un cache de JSON.
 * Tambien significa que el dashboard sigue respondiendo sin conexion.
 */

export interface StatusCount {
  status: UnitStatus;
  count: number;
}

export interface GradeCount {
  grade: Grade;
  count: number;
}

export interface ParetoRow {
  type: string;
  count: number;
  /** porcentaje acumulado, 0-100 */
  cumulative: number;
}

export interface RepairRow {
  vin: string;
  lane: string;
  hours: number;
  estimatedCompletion: string | null;
}

export interface DashboardData {
  byStatus: StatusCount[];
  byGrade: GradeCount[];
  pareto: ParetoRow[];
  inRepair: RepairRow[];
  totalUnits: number;
  totalDefects: number;
  pendingSync: number;
  estimatedBacklogHours: number;
  /** Defectos por unidad activa. Metrica real, sin backend nuevo: es una division. */
  defectsPerVehicle: number;
}

export async function loadDashboard(): Promise<DashboardData> {
  const [statusRows, gradeRows, typeRows, repairRows, totals, backlog] = await Promise.all([
    query<{ status_name: UnitStatus; n: number }>(
      `SELECT status_name, COUNT(*) AS n
       FROM unit
       WHERE status_name NOT IN ('ARCHIVED')
       GROUP BY status_name`
    ),

    query<{ grade: Grade; n: number }>(
      `SELECT d.grade, COUNT(*) AS n
       FROM defect d
       JOIN unit u ON u.local_id = d.unit_local_id
       WHERE d.is_resolved = 0
       GROUP BY d.grade`
    ),

    query<{ type: string; n: number }>(
      `SELECT d.type, COUNT(*) AS n
       FROM defect d
       WHERE d.is_resolved = 0
       GROUP BY d.type
       ORDER BY n DESC
       LIMIT 8`
    ),

    query<{ vin: string; lane: string; estimated_completion: string | null; hours: number | null }>(
      `SELECT vin, lane, estimated_completion, estimated_repair_hours AS hours
       FROM unit
       WHERE status_name = 'IN_REPAIR'
       ORDER BY estimated_completion ASC`
    ),

    query<{ units: number; defects: number; pending: number }>(
      `SELECT
         (SELECT COUNT(*) FROM unit WHERE status_name NOT IN ('ARCHIVED','ACCEPTED')) AS units,
         (SELECT COUNT(*) FROM defect WHERE is_resolved = 0) AS defects,
         (SELECT COUNT(*) FROM outbox) AS pending`
    ),

    // Solo cuenta como "carga de trabajo" lo que de verdad ocupa horas de
    // Body Shop (carroceria, operacion, electrico). Ver estimateHours() en
    // data/units.ts, misma regla aplicada aqui en SQL.
    query<{ grade: Grade; n: number }>(
      `SELECT d.grade, COUNT(*) AS n
       FROM defect d
       JOIN unit u ON u.local_id = d.unit_local_id
       WHERE d.is_resolved = 0
         AND u.status_name IN ('RECEIVED','IN_REPAIR')
         AND (d.type LIKE 'PN-%' OR d.type LIKE 'OP-%' OR d.type LIKE 'EL-%')
       GROUP BY d.grade`
    ),
  ]);

  const totalTypeCount = typeRows.reduce((sum, row) => sum + row.n, 0);
  let running = 0;
  const pareto: ParetoRow[] = typeRows.map((row) => {
    running += row.n;
    return {
      type: row.type,
      count: row.n,
      cumulative: totalTypeCount > 0 ? Math.round((running / totalTypeCount) * 100) : 0,
    };
  });

  return {
    byStatus: statusRows.map((row) => ({ status: row.status_name, count: row.n })),
    byGrade: gradeRows.map((row) => ({ grade: row.grade, count: row.n })),
    pareto,
    inRepair: repairRows.map((row) => ({
      vin: row.vin,
      lane: row.lane,
      hours: row.hours ?? 0,
      estimatedCompletion: row.estimated_completion,
    })),
    totalUnits: totals[0]?.units ?? 0,
    totalDefects: totals[0]?.defects ?? 0,
    pendingSync: totals[0]?.pending ?? 0,
    defectsPerVehicle:
      totals[0]?.units ? Math.round((totals[0].defects / totals[0].units) * 100) / 100 : 0,
    estimatedBacklogHours: backlog.reduce(
      (sum, row) => sum + GRADE_HOURS[row.grade] * row.n,
      0
    ),
  };
}
