import { useAuth } from '@/auth/AuthProvider';
import { changeStatusBulk } from '@/data/units';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { BulkAction } from '@/ui/BulkAction';
import { Screen } from '@/ui/Screen';

/**
 * Recepcion en Body Shop (BODY).
 *
 * Una madrina descarga 10-15 unidades juntas; recibirlas es una sola accion,
 * no una por unidad.
 */
export default function RecibirScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: units, refetch } = useUnits('DELIVERED');

  return (
    <Screen title="Recibir" subtitle="Unidades entregadas por WWS">
      <BulkAction
        units={units}
        actionLabel="Recibir"
        emptyMessage="No hay unidades entregadas pendientes."
        onConfirm={async (selected) => {
          if (!user) return;
          await changeStatusBulk(
            selected.map((unit) => ({ localId: unit.localId!, from: unit.statusName })),
            'RECEIVED',
            user.id
          );
          await refetch();
          refresh();
        }}
      />
    </Screen>
  );
}
