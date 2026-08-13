-- Unidades reales de prueba, visibles desde cualquier dispositivo con sesion
-- real (no modo demo). Usa el mismo formato "CODIGO - Etiqueta" que produce
-- la app al capturar (ver src/domain/zones.ts).

INSERT INTO "Unit" (vin, market, lane, "statusId", plant, "isAvailableToday", "registeredById", "createdAt", "updatedAt")
VALUES
  ('3N1AB7AP0LY800101', 'Domestico', '4', 1, 'A1', true, 5, NOW(), NOW()),
  ('3N1AB7AP0LY800102', 'Exportacion', '7', 1, 'A1', true, 5, NOW(), NOW()),
  ('3N1AB7AP0LY800103', 'Traslado', '2', 2, 'A1', true, 2, NOW(), NOW()),
  ('3N1AB7AP0LY800104', 'Domestico', '9', 3, 'A1', true, 2, NOW(), NOW()),
  ('3N1AB7AP0LY800105', 'Domestico', '1', 4, 'A1', true, 3, NOW(), NOW());

INSERT INTO "UnitDefect" ("unitId", "defectType", "zone", "gradeId", "registeredById", "description")
SELECT u.id, d.defect_type, d.zone, d.grade_id, 5, d.defect_type
FROM "Unit" u
JOIN (VALUES
  ('3N1AB7AP0LY800101', 'PN-AB - Abolladura', 'PDI - Puerta del. izq.', 1),
  ('3N1AB7AP0LY800102', 'PN-RY - Rayon', 'COFRE - Cofre', 2),
  ('3N1AB7AP0LY800102', 'TI-PR - Presion baja', 'Rueda del. izq.', 3),
  ('3N1AB7AP0LY800103', 'PN-GL - Golpe', 'DEF - Defensa delantera', 2),
  ('3N1AB7AP0LY800104', 'SL-AC - Fuga de aceite', 'COFRE - Cofre', 1),
  ('3N1AB7AP0LY800105', 'PN-PN - Pintura', 'CD - Costado tras. der.', 2)
) AS d(vin, defect_type, zone, grade_id) ON d.vin = u.vin;
