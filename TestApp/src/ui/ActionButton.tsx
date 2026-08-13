import { ActivityIndicator, Pressable, Text } from 'react-native';
import { COLORS } from './theme';

type Variant = 'primary' | 'success' | 'danger' | 'neutral';

const STYLES: Record<Variant, string> = {
  primary: 'bg-primary',
  success: 'bg-synced',
  danger: 'bg-v1',
  neutral: 'bg-canvas border-2 border-line',
};

const TEXT: Record<Variant, string> = {
  primary: 'text-white',
  success: 'text-white',
  danger: 'text-white',
  neutral: 'text-ink',
};

/**
 * Boton de accion. 56 px minimo: se usa con guantes.
 * La etiqueta nombra lo que va a pasar ("Entregar a Body"), nunca el mecanismo.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      className={`items-center justify-center rounded-2xl active:opacity-80 ${
        compact ? 'min-h-[48px] px-5' : 'min-h-[56px] px-6'
      } ${STYLES[variant]} ${disabled ? 'opacity-30' : ''}`}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'neutral' ? COLORS.ink : COLORS.white} />
      ) : (
        <Text className={`text-base font-bold ${TEXT[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
