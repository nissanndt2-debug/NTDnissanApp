import { Text, View } from 'react-native';
import type { Grade } from '@/domain/constants';
import { GRADE_BG } from './theme';

/**
 * Severidad como barra de color con conteo. Permite leer la carga de defectos
 * de una unidad sin abrir nada — clave para las listas en lote.
 */
export function GradeDots({ defects }: { defects: { grade: Grade }[] }) {
  const counts = defects.reduce<Record<string, number>>((acc, defect) => {
    acc[defect.grade] = (acc[defect.grade] ?? 0) + 1;
    return acc;
  }, {});

  const grades: Grade[] = ['V1', 'V2', 'V3'];

  return (
    <View className="flex-row items-center gap-1.5">
      {grades
        .filter((grade) => counts[grade])
        .map((grade) => (
          <View
            key={grade}
            className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${GRADE_BG[grade]}`}
          >
            <Text className="text-[11px] font-bold text-white">
              {grade}·{counts[grade]}
            </Text>
          </View>
        ))}
      {defects.length === 0 ? (
        <Text className="text-xs text-muted">Sin defectos</Text>
      ) : null}
    </View>
  );
}
