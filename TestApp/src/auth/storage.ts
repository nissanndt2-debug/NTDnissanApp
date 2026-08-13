import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Almacen de sesion por plataforma.
 *
 * En movil: Keychain / Keystore (expo-secure-store). En web ese modulo no
 * existe — el dashboard corre en navegador — asi que ahi se usa localStorage.
 * No es equivalente en seguridad, pero el dashboard es de solo lectura y vive
 * en una PC de oficina; el material sensible de piso sigue en el llavero.
 *
 * Seguridad: la implementacion web usa sessionStorage, por lo que la sesion
 * se elimina al cerrar el navegador.
 */

const isWeb = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return globalThis.sessionStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.sessionStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.sessionStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
