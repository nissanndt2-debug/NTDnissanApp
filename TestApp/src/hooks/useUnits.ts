import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { listByStatus } from '@/data/units';
import type { UnitStatus } from '@/domain/constants';
import type { Unit } from '@/domain/types';

/**
 * Lectura de unidades desde SQLite. Nunca falla por falta de red: si no hay
 * conexion simplemente devuelve lo ultimo que se sincronizo.
 */
export function useUnits(statuses: UnitStatus | UnitStatus[]) {
  const list = Array.isArray(statuses) ? statuses : [statuses];

  return useQuery<Unit[]>({
    queryKey: ['units', ...list],
    queryFn: async () => {
      const groups = await Promise.all(list.map(listByStatus));
      return groups.flat();
    },
    refetchInterval: 15_000,
    initialData: [],
    // La lista vacia es un marcador de posicion, no un resultado: sin esto el
    // `staleTime` global la daria por buena y la pantalla abriria vacia.
    initialDataUpdatedAt: 0,
  });
}

/** Invalida todo lo que depende de unidades tras una mutacion. */
export function useRefreshUnits() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['units'] });
    await queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    await queryClient.invalidateQueries({ queryKey: ['stats'] });
  }, [queryClient]);
}
