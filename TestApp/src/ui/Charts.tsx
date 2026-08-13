import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
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

  const accentBar = {
    neutral: 'bg-primary',
    warn: 'bg-v2',
    bad: 'bg-v1',
    good: 'bg-synced',
  }[tone];

  return (
    <View
      className="min-w-[180px] flex-1 overflow-hidden rounded-3xl border border-line bg-surface p-5"
      style={{ boxShadow: '0 1px 2px rgba(15, 22, 32, 0.05)' }}
    >
      <View className={`absolute left-0 right-0 top-0 h-1 ${accentBar}`} />
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text selectable className={`mt-2 text-4xl font-bold ${accent}`} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {hint ? <Text selectable className="mt-1 text-xs text-muted">{hint}</Text> : null}
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

/**
 * Curva compacta para tendencias de tiempo. Mantiene la estética ligera del
 * dashboard sin introducir una librería de gráficas distinta para web/móvil.
 */
export function TrendLineChart({
  points,
  color = COLORS.primary,
}: {
  points: { label: string; value: number }[];
  color?: string;
}) {
  const chartWidth = 640;
  const chartHeight = 220;
  const paddingX = 10;
  const paddingY = 18;
  const max = Math.max(1, ...points.map((point) => point.value));
  const spanX = chartWidth - paddingX * 2;
  const spanY = chartHeight - paddingY * 2;
  const coordinates = points.map((point, index) => ({
    x: paddingX + (points.length <= 1 ? spanX / 2 : (index / (points.length - 1)) * spanX),
    y: paddingY + spanY - (point.value / max) * spanY,
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
  const area = coordinates.length
    ? `M ${coordinates[0].x} ${chartHeight - paddingY} L ${coordinates.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${coordinates[coordinates.length - 1].x} ${chartHeight - paddingY} Z`
    : '';
  const featured = coordinates.length ? coordinates[Math.floor(coordinates.length * 0.62)] : null;

  if (points.length === 0) {
    return <Text className="py-14 text-center text-sm text-muted">Sin tendencia disponible todavía.</Text>;
  }

  return (
    <View>
      <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.20" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <Line
            key={ratio}
            x1={paddingX}
            x2={chartWidth - paddingX}
            y1={paddingY + spanY * ratio}
            y2={paddingY + spanY * ratio}
            stroke={COLORS.line}
            strokeOpacity={0.7}
            strokeDasharray="4 7"
          />
        ))}
        <Path d={area} fill="url(#trendFill)" />
        <Polyline points={polyline} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {featured ? <Circle cx={featured.x} cy={featured.y} r={6} fill={color} stroke={COLORS.surface} strokeWidth={4} /> : null}
      </Svg>
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
    <View
      className={`rounded-3xl border border-line bg-surface p-5 ${className ?? ''}`}
      style={{ boxShadow: '0 1px 2px rgba(15, 22, 32, 0.05)' }}
    >
      <Text className="text-base font-bold text-ink">{title}</Text>
      {subtitle ? <Text className="mb-3 mt-0.5 text-xs text-muted">{subtitle}</Text> : null}
      <View className={subtitle ? '' : 'mt-3'}>{children}</View>
    </View>
  );
}
