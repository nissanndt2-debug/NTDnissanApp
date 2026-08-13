import { useEffect, useRef } from 'react';
import { Animated, Image, View } from 'react-native';

const TRUCK = require('../../assets/truck-loading.png');

type TruckLoaderProps = {
  /** Ancho visual del camión. La altura conserva la proporción del recurso. */
  size?: number;
  accessibilityLabel?: string;
};

/**
 * Indicador de carga de la operación: el camión avanza suavemente en vez del
 * spinner genérico. Se reutiliza en pantallas y acciones para no perder la
 * referencia visual de que la unidad sigue en proceso.
 */
export function TruckLoader({
  size = 112,
  accessibilityLabel = 'Cargando',
}: TruckLoaderProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const travel = Math.max(4, Math.round(size * 0.06));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      style={{ width: size, height: Math.round(size * 0.56), justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-travel, travel],
              }),
            },
          ],
        }}
      >
        <Image
          source={TRUCK}
          resizeMode="contain"
          style={{ width: size, height: Math.round(size * 0.56) }}
        />
      </Animated.View>
    </View>
  );
}
