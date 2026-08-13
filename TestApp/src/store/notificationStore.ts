import { create } from 'zustand';
import type { AppNotification } from '@/domain/notifications';

/**
 * Estado global de notificaciones (Zustand).
 *
 * Un solo store para que la campana pueda vivir en cualquier pantalla (Screen
 * movil, dashboard web) y todas lean/escriban el mismo contador — sin pasar
 * props por seis niveles ni duplicar el panel por pantalla.
 */

interface NotificationStoreState {
  items: AppNotification[];
  unreadCount: number;
  connected: boolean;
  panelOpen: boolean;
  toast: AppNotification | null;

  setInitial: (items: AppNotification[]) => void;
  addIncoming: (items: AppNotification[]) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  setConnected: (connected: boolean) => void;
  openPanel: () => void;
  closePanel: () => void;
  dismissToast: () => void;
  reset: () => void;
}

function countUnread(items: AppNotification[]): number {
  return items.filter((item) => !item.isRead).length;
}

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  items: [],
  unreadCount: 0,
  connected: false,
  panelOpen: false,
  toast: null,

  setInitial: (items) => set({ items, unreadCount: countUnread(items) }),

  addIncoming: (incoming) =>
    set((state) => {
      // Un mismo evento puede llegar duplicado si el WS reconecta justo
      // cuando tambien corrio un pull; se descarta por id.
      const knownIds = new Set(state.items.map((item) => item.id));
      const fresh = incoming.filter((item) => !knownIds.has(item.id));
      if (fresh.length === 0) return state;

      const items = [...fresh, ...state.items];
      return { items, unreadCount: countUnread(items), toast: fresh[0] };
    }),

  markRead: (id) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      );
      return { items, unreadCount: countUnread(items) };
    }),

  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, isRead: true })),
      unreadCount: 0,
    })),

  setConnected: (connected) => set({ connected }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  dismissToast: () => set({ toast: null }),
  reset: () => set({ items: [], unreadCount: 0, connected: false, panelOpen: false, toast: null }),
}));
