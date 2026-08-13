import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { Grade } from '@/domain/constants';
import { ZONES } from '@/domain/zones';
import { COLORS, GRADE_COLOR } from './theme';

/**
 * Esquema del vehiculo: se toca la parte danada en vez de buscarla en una lista.
 *
 * Es la pieza central de la captura. Sustituye dos selectores encadenados
 * (zona -> subzona) por un solo toque sobre algo que el operador ya tiene
 * delante: el coche. La zona tocada queda marcada con el color de la severidad
 * mas alta que tenga, asi que el estado del reporte se lee de un vistazo, sin
 * bajar a la lista de defectos.
 *
 * Vista superior unicamente. Una segunda vista (laterales) duplicaria zonas y
 * obligaria a decidir "en cual de las dos estoy" antes de cada toque; lo que no
 * se ve desde arriba va como chip aparte (motor, interior, bajos, electrico).
 *
 * El SVG solo DIBUJA; quien recibe los toques son `Pressable` transparentes
 * encima de cada zona. El `onPress` de react-native-svg usa su propio
 * hit-testing y en Android no dispara de forma fiable — sobre un tablet de
 * planta eso se traduce en "la app no responde". Los Pressable usan el sistema
 * de toques de React Native, que si es el mismo en las dos plataformas.
 */

const VIEW_W = 320;
const VIEW_H = 640;

/** Severidad mas alta gana el color de la zona: V1 no se puede ocultar tras un V3. */
const WORST: Grade[] = ['V1', 'V2', 'V3'];

function worstGrade(grades: Grade[]): Grade | null {
  return WORST.find((grade) => grades.includes(grade)) ?? null;
}

export function VehicleDiagram({
  marks,
  selectedZone,
  onSelectZone,
}: {
  /** Severidades capturadas por zona. */
  marks: Record<string, Grade[]>;
  selectedZone?: string | null;
  onSelectZone: (zoneId: string) => void;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  };

  // Reproduce lo que hace preserveAspectRatio="xMidYMid meet" (el default del
  // SVG): escala por el lado que primero se queda corto y centra en el otro.
  // Sin esto los Pressable quedarian corridos respecto al dibujo.
  const scale = box.width > 0 && box.height > 0
    ? Math.min(box.width / VIEW_W, box.height / VIEW_H)
    : 0;
  const offsetX = (box.width - VIEW_W * scale) / 2;
  const offsetY = (box.height - VIEW_H * scale) / 2;

  return (
    <View className="h-full w-full" onLayout={onLayout}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        {/* Silueta */}
        <Rect
          x={48}
          y={30}
          width={224}
          height={574}
          rx={46}
          fill={COLORS.surface}
          stroke={COLORS.line}
          strokeWidth={2}
        />
        {/* Eje: da lectura de simetria izquierda/derecha sin escribir "IZQ/DER" */}
        <Line
          x1={160}
          y1={40}
          x2={160}
          y2={594}
          stroke={COLORS.line}
          strokeWidth={1}
          strokeDasharray="4 8"
        />

        {ZONES.map((zone) => {
          const grades = marks[zone.id] ?? [];
          const worst = worstGrade(grades);
          const active = worst ? GRADE_COLOR[worst] : null;
          const selected = selectedZone === zone.id;
          const isWheel = zone.kind === 'wheel';

          return (
            <G key={zone.id}>
              <Rect
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                rx={isWheel ? 10 : 8}
                fill={active ?? (isWheel ? COLORS.canvas : COLORS.surface)}
                fillOpacity={active ? 0.18 : 1}
                stroke={active ?? (selected ? COLORS.ink : COLORS.line)}
                strokeWidth={active || selected ? 2.5 : 1.5}
              />

              {zone.code ? (
                <SvgText
                  x={zone.x + zone.w / 2}
                  y={zone.y + zone.h / 2 + 3}
                  fontSize={zone.w > 80 ? 10 : 11}
                  fontWeight="700"
                  fill={active ?? COLORS.muted}
                  textAnchor="middle"
                >
                  {zone.code}
                </SvgText>
              ) : null}

              {/* Contador: cuantos defectos lleva la zona */}
              {grades.length > 0 ? (
                <G>
                  <Circle
                    cx={zone.x + zone.w - 11}
                    cy={zone.y + 11}
                    r={10}
                    fill={active ?? COLORS.ink}
                  />
                  <SvgText
                    x={zone.x + zone.w - 11}
                    y={zone.y + 15}
                    fontSize={11}
                    fontWeight="700"
                    fill={COLORS.white}
                    textAnchor="middle"
                  >
                    {grades.length}
                  </SvgText>
                </G>
              ) : null}
            </G>
          );
        })}
      </Svg>

      {scale > 0
        ? ZONES.map((zone) => (
            <Pressable
              key={zone.id}
              onPress={() => onSelectZone(zone.id)}
              accessibilityRole="button"
              accessibilityLabel={zone.label}
              style={{
                position: 'absolute',
                left: offsetX + zone.x * scale,
                top: offsetY + zone.y * scale,
                width: zone.w * scale,
                height: zone.h * scale,
              }}
            />
          ))
        : null}
    </View>
  );
}
