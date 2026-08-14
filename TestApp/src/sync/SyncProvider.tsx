import NetInfo from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { pendingCount } from './queue';
import { drain } from './engine';
import { pullAll } from './pull';

/**
 * Orquestador de sincronizacion. Dispara el drenado en cuatro momentos:
 *   - justo al iniciar sesion, sin esperar un temporizador
 *   - cuando vuelve la conexion
 *   - cuando la app pasa a primer plano
 *   - tras cada reconexion del canal realtime (desde NotificationProvider)
 *
 * Tras cada pull exitoso invalida las queries de React Query: sin esto, los
 * datos ya estaban frescos en SQLite pero cada pantalla seguia mostrando
 * cache previa hasta una recarga manual.
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

const debug = (...args: unknown[]) => {
  if (process.env.EXPO_PUBLIC_REALTIME_DEBUG === 'true') {
    console.info('[sync]', ...args);
  }
};

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastPullAt, setLastPullAt] = useState<Date | null>(null);
  const tokenRef = useRef(token);
  const inFlightRef = useRef(false);
  const rerunRequestedRef = useRef(false);

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

    // Coalescer de reentrada. Un evento que entra durante un pull no puede
    // perderse: pide una segunda vuelta al terminar en vez de lanzar escrituras
    // SQLite en paralelo o simplemente ignorarse.
    if (inFlightRef.current) {
      rerunRequestedRef.current = true;
      debug('sync coalesced while another cycle is in flight');
      return;
    }
    inFlightRef.current = true;

    setSyncing(true);
    try {
      do {
        rerunRequestedRef.current = false;
        const drained = await drain(tokenRef.current);
        const pulled = await pullAll(tokenRef.current);
        setLastPullAt(new Date());

        // Invalidar solo si algo cambio de verdad. Este ciclo corre al iniciar
        // sesion, al reconectar, al volver a primer plano y en CADA evento
        // realtime; invalidar siempre obligaba a todas las pantallas montadas
        // a recalcularse aunque el servidor no trajera nada nuevo.
        const changed = drained.sent > 0 || drained.failed > 0 || pulled.fetched > 0;
        if (changed) {
          // Los datos ya estan en SQLite; invalidar todas las vistas derivadas
          // hace que un evento websocket actualice modulo, historial y KPI.
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['units'] }),
            queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
            queryClient.invalidateQueries({ queryKey: ['stats'] }),
            queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['history'] }),
            queryClient.invalidateQueries({ queryKey: ['history-unit'] }),
            queryClient.invalidateQueries({ queryKey: ['archivable'] }),
            queryClient.invalidateQueries({ queryKey: ['deletion-requests'] }),
          ]);
          debug('cache invalidated after sync');
        } else {
          debug('sync sin cambios: no se invalida cache');
        }
      } while (rerunRequestedRef.current && tokenRef.current);
    } catch (error) {
      debug('sync failed', error instanceof Error ? error.message : error);
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
      onlineManager.setOnline(isOnline);
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
