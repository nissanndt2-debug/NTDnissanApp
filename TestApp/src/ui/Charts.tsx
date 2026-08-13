import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { COLORS } from './theme';

/**
 * Graficas construidas con Views (barras) y react-native-svg (dona), ya
 * presente en el proyecto por el esquema del vehiculo.
 *
 * Decision consciente: no se agrega una libreria de graficas nueva. En
 * react-native-web las libs de charts pesan y se comportan distinto entre
 * plataformas; con Views de ancho porcentual y circulos SVG con
 * `strokeDasharray` alcanza para todo lo que este dashboard necesita, con
 * cero dependencias nuevas y el mismo look en movil y navegador.
 */

export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'warn' | 'bad' | 'good';
}) {
  const accent = {
    neutral: 'text-ink',
    warn: 'text-v2',
    bad: 'text-v1',
    good: 'text-synced',
  }[tone];

  return (
    <View className="min-w-[180px] flex-1 rounded-2xl bg-surface p-5">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text className={`mt-2 text-4xl font-bold ${accent}`}>{value}</Text>
      {hint ? <Text className="mt-1 text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

export function BarRow({
  label,
  value,
  max,
  color = 'bg-primary',
  suffix,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
  highlight?: boolean;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;

  return (
    <View className="mb-3">
      <View className="mb-1 flex-row items-center justify-between">
        <Text
          className={`flex-1 text-sm ${
            highlight ? 'font-bold text-ink' : 'text-ink'
          }`}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text className="ml-3 text-sm font-bold text-ink">
          {value}
          {suffix ?? ''}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-canvas">
        <View className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

/**
 * Dona minimalista: un circulo de fondo + un arco por segmento, sin relleno
 * ni sombra. Para proporciones de un todo (severidad, estados) donde una
 * barra ya dice el numero pero la dona deja ver el peso relativo de un
 * vistazo — util en el dashboard de escritorio, no en piso movil.
 */
export function DonutChart({
  segments,
  size = 132,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  const center = size / 2;

  let cumulative = 0;

  return (
    <View className="flex-row items-center gap-4">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G rotation={-90} originX={center} originY={center}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={COLORS.line}
              strokeWidth={thickness}
              fill="none"
            />
            {total > 0
              ? segments
                  .filter((seg) => seg.value > 0)
                  .map((seg) => {
                    const fraction = seg.value / total;
                    const dash = fraction * circumference;
                    const offset = -(cumulative * circumference);
                    cumulative += fraction;
                    return (
                      <Circle
                        key={seg.label}
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={seg.color}
                        strokeWidth={thickness}
                        fill="none"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={offset}
                      />
                    );
                  })
              : null}
          </G>
        </Svg>
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          className="items-center justify-center"
        >
          {centerValue != null ? (
            <Text className="text-2xl font-bold text-ink">{centerValue}</Text>
          ) : null}
          {centerLabel ? (
            <Text className="text-[10px] font-semibold uppercase text-muted">
              {centerLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-1 gap-2">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <View key={seg.label} className="flex-row items-center gap-2">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <Text className="flex-1 text-xs text-ink" numberOfLines={1}>
                {seg.label}
              </Text>
              <Text className="text-xs font-bold text-ink">
                {seg.value} · {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-2xl bg-surface p-5 ${className ?? ''}`}>
      <Text className="text-base font-bold text-ink">{title}</Text>
      {subtitle ? <Text className="mb-3 mt-0.5 text-xs text-muted">{subtitle}</Text> : null}
      <View className={subtitle ? '' : 'mt-3'}>{children}</View>
    </View>
  );
}
