import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { canAccess, type ScreenName } from '@/domain/permissions';
import type { RoleId } from '@/domain/constants';

/**
 * Primitivas de control de acceso a nivel de elemento visual.
 *
 * La regla de negocio es "si no le pertenece, ni se muestra" — no basta con
 * deshabilitar un boton (`disabled`), porque un boton deshabilitado sigue
 * revelando que la accion existe y a veces sigue siendo inspeccionable. Estas
 * dos primitivas devuelven `null` cuando el rol no califica, asi que el
 * elemento no llega a montarse.
 *
 * OJO — esto es control de acceso de INTERFAZ, no de datos. Decide que ve el
 * operador en la pantalla; no reemplaza la validacion de propiedad/rol que
 * tendria que vivir en el backend antes de servir cualquier dato (ver
 * ARQUITECTURA.md, "Deuda heredada del backend"). Ocultar un boton no impide
 * que alguien con el JWT llame al endpoint directo.
 */

/** Oculta el contenido si el rol actual no tiene acceso a esa pantalla. */
export function Can({ screen, children }: { screen: ScreenName; children: ReactNode }) {
  const { user } = useAuth();
  if (!canAccess(screen, user?.roleId)) return null;
  return <>{children}</>;
}

/** Oculta el contenido salvo que el rol actual este en la lista dada. */
export function CanRole({ roles, children }: { roles: RoleId[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.roleId)) return null;
  return <>{children}</>;
}
