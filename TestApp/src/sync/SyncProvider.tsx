import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { pendingCount } from './queue';
import { drain } from './engine';
import { pullAll } from './pull';

/**
 * Orquestador de sincronizacion. Dispara el drenado en cuatro momentos:
 *   - justo al iniciar sesion (antes no pasaba: el operador podia esperar
 *     hasta POLL_MS viendo listas vacias despues de entrar)
 *   - cuando vuelve la conexion
 *   - cuando la app pasa a primer plano
 *   - cada POLL_MS si hay algo pendiente, como red de seguridad
 *
 * Tras cada pull exitoso invalida las queries de React Query: sin esto, los
 * datos ya estaban frescos en SQLite pero cada pantalla seguia esperando su
 * propio `refetchInterval` (hasta 15 s mas) para volver a leerlos.
 *
 * Expone `pending` para que la UI muestre siempre cuantos cambios faltan por
 * subir. En piso, esa cifra es la que da confianza al operador.
 */

interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastPullAt: Date | null;
  syncNow: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const POLL_MS = 12_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastPullAt, setLastPullAt] = useState<Date | null>(null);
  const tokenRef = useRef(token);
  const inFlightRef = useRef(false);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  /**
   * Orden obligatorio: PRIMERO empujar (drain), DESPUES traer (pull).
   * Al reves, el pull traeria el estado viejo del servidor y pisaria cambios
   * locales que aun no se han enviado.
   */
  const syncNow = useCallback(async () => {
    if (!tokenRef.current) return;

    // Guard de reentrada. `setSyncing` no sirve para esto: es estado de React
    // y no se ve reflejado hasta el siguiente render, asi que dos disparadores
    // casi simultaneos (volver la red + volver a primer plano) lanzarian dos
    // ciclos solapados escribiendo sobre las mismas filas.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setSyncing(true);
    try {
      await drain(tokenRef.current);
      await pullAll(tokenRef.current);
      setLastPullAt(new Date());
      // Los datos ya estan en SQLite; que las pantallas los lean AHORA, no en
      // su siguiente `refetchInterval`.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['units'] }),
        queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ]);
    } finally {
      inFlightRef.current = false;
      setSyncing(false);
      await refreshPending();
    }
  }, [refreshPending, queryClient]);

  // Sincronizar de inmediato al aparecer un token (login o modo demo), en vez
  // de esperar al primer disparador de red/foreground/temporizador.
  useEffect(() => {
    if (token) void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Reaccionar a cambios de conectividad
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(isOnline);
      if (isOnline) void syncNow();
    });
    return unsubscribe;
  }, [syncNow]);

  // Reaccionar al volver a primer plano
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  // Red de seguridad periodica
  useEffect(() => {
    const interval = setInterval(() => {
      if (online) void syncNow();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [online, syncNow]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  return (
    <SyncContext.Provider
      value={{ online, syncing, pending, lastPullAt, syncNow, refreshPending }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync debe usarse dentro de SyncProvider');
  return context;
}
