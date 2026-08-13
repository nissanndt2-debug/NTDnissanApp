import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth as authApi } from '@/api/endpoints';
import { seedDemoData } from '@/data/demo';
import { resetLocalCache } from '@/db';
import { ROLE_NAME_BY_ID, type RoleId } from '@/domain/constants';
import type { User } from '@/domain/types';
import { deleteItem, getItem, setItem } from './storage';

const DEMO_TOKEN = 'demo';

/**
 * Sesion persistida en el llavero del dispositivo (ver `storage.ts`), no en
 * AsyncStorage: el JWT es material sensible y AsyncStorage es texto plano.
 *
 * Decision offline: si hay token guardado, la app arranca AUTENTICADA sin
 * esperar validacion del servidor. En planta el operador no puede quedarse
 * fuera de la app porque el WiFi se cayo. La validacion ocurre en segundo
 * plano y solo cierra sesion ante un 401 explicito.
 */

const TOKEN_KEY = 'auth.token';
const REFRESH_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Entra sin backend, con datos sembrados. Solo para revisar la interfaz. */
  signInDemo: (roleId: RoleId) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restaurar sesion al arrancar
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          getItem(TOKEN_KEY),
          getItem(USER_KEY),
        ]);

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);
        }
      } catch {
        // Almacen corrupto: arrancar sin sesion.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);

    await Promise.all([
      setItem(TOKEN_KEY, session.token),
      setItem(REFRESH_KEY, session.refreshToken),
      setItem(USER_KEY, JSON.stringify(session.user)),
    ]);

    setToken(session.token);
    setUser(session.user);
  }, []);

  const signInDemo = useCallback(async (roleId: RoleId) => {
    const demoUser: User = {
      id: 999,
      email: `demo.${ROLE_NAME_BY_ID[roleId].toLowerCase()}@nissan.com`,
      name: `Demo ${ROLE_NAME_BY_ID[roleId]}`,
      roleId,
      plant: 'A1',
    };

    try {
      await seedDemoData();
    } catch (error) {
      // La demo entra igual, solo que con las listas vacias.
      console.warn('No se pudo sembrar la demo:', error);
    }

    await Promise.all([
      setItem(TOKEN_KEY, DEMO_TOKEN),
      setItem(USER_KEY, JSON.stringify(demoUser)),
    ]);

    setToken(DEMO_TOKEN);
    setUser(demoUser);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([
      deleteItem(TOKEN_KEY),
      deleteItem(REFRESH_KEY),
      deleteItem(USER_KEY),
    ]);
    await resetLocalCache();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signInDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
