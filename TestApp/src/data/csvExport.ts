import { query } from '@/db';
import { displayLabel } from '@/domain/zones';

/**
 * Exportacion a CSV. Se arma a mano (sin libreria) porque el formato es
 * simple y una dependencia nueva solo para "unir con comas y escapar
 * comillas" no se justifica.
 *
 * Fuente: la MISMA base local que alimenta el resto del dashboard — no una
 * consulta aparte con otra logica. Si el numero en pantalla y el CSV alguna
 * vez no coincidieran, seria un bug, no una diferencia esperada.
 */

interface ExportRow {
  vin: string;
  market: string;
  lane: string;
  status_name: string;
  plant: string | null;
  registered_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  defect_type: string | null;
  defect_zone: string | null;
  defect_grade: string | null;
  defect_resolved: number | null;
}

function csvField(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  // Comillas dobles si el campo trae coma, comilla o salto de linea.
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const HEADERS = [
  'VIN',
  'Mercado',
  'Carril',
  'Estado',
  'Planta',
  'Registrada por',
  'Creada',
  'Actualizada',
  'Tipo de defecto',
  'Zona',
  'Grado',
  'Defecto resuelto',
];

/** Unidades activas (todo salvo ACCEPTED/ARCHIVED) con sus defectos, una fila por defecto. */
export async function buildUnitsCsv(): Promise<string> {
  const rows = await query<ExportRow>(
    `SELECT u.vin, u.market, u.lane, u.status_name, u.plant, u.registered_by,
            u.created_at, u.updated_at,
            d.type as defect_type, d.zone as defect_zone, d.grade as defect_grade,
            d.is_resolved as defect_resolved
     FROM unit u
     LEFT JOIN defect d ON d.unit_local_id = u.local_id
     WHERE u.status_name NOT IN ('ACCEPTED', 'ARCHIVED')
     ORDER BY u.created_at DESC, u.vin`
  );

  const lines = [HEADERS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.vin,
        row.market,
        row.lane,
        row.status_name,
        row.plant ?? '',
        row.registered_by ?? '',
        row.created_at ?? '',
        row.updated_at ?? '',
        row.defect_type ? displayLabel(row.defect_type) : '',
        row.defect_zone ? displayLabel(row.defect_zone) : '',
        row.defect_grade ?? '',
        row.defect_resolved == null ? '' : row.defect_resolved ? 'Si' : 'No',
      ]
        .map(csvField)
        .join(',')
    );
  }

  return lines.join('\r\n');
}

/** Dispara la descarga en el navegador. Solo tiene sentido en web. */
export function downloadCsv(csv: string, filename: string): void {
  // BOM UTF-8: sin esto Excel en Windows muestra acentos rotos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
