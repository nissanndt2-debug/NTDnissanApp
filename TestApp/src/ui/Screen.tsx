import type { ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from './NotificationBell';
import { SyncBadge } from './SyncBadge';

/**
 * Cascaron comun: banda oscura con marca + titulo + estado de sincronizacion,
 * y el contenido sobre el lienzo claro.
 *
 * La banda oscura no es decorativa: separa "donde estoy y si mi trabajo esta a
 * salvo" de "que tengo que hacer ahora", que es la unica jerarquia que importa
 * en piso. Es la misma banda en las nueve pantallas, siempre a la misma altura.
 *
 * La marca (logo) va pequena y fija arriba: refuerza identidad sin competir
 * con el titulo de la pantalla, que es lo que el operador necesita leer primero.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="bg-ink px-4 pb-3 pt-2">
        <Image
          source={require('../../assets/nissan-logo.png')}
          style={{ height: 14, width: 95 }}
          resizeMode="contain"
          accessibilityLabel="Nissan"
        />
        <View className="mt-2 flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-white">{title}</Text>
            {subtitle ? (
              <Text className="mt-0.5 text-xs text-white/60">{subtitle}</Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1">
            <NotificationBell onDark />
            {right}
          </View>
        </View>
        <View className="mt-2">
          <SyncBadge onDark />
        </View>
      </View>
      {children}
    </SafeAreaView>
  );
}

/** Vacio = invitacion, no error. Dice que falta, no que fallo. */
export function EmptyState({ message }: { message: string }) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-line px-6 py-12">
      <Text className="text-center text-sm text-muted">{message}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-2 mt-5 text-label uppercase text-muted">{children}</Text>
  );
}
