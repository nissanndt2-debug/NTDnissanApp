import { apiDownload, apiRequest } from "./client";
import type {
  AuthSession,
  DeletionRequest,
  HistoryRow,
  ManagedUser,
  Provider,
  Unit,
  UnitModel,
} from "@/domain/types";
import type { UnitStatus } from "@/domain/constants";
import type { AppNotification } from "@/domain/notifications";

/**
 * Mapa de endpoints del backend FastAPI (backend_python/app/routes/*).
 * Todo lo que la app consume pasa por aqui: un solo lugar que actualizar
 * si el contrato del servidor cambia.
 */

export const auth = {
  login: (email: string, password: string) =>
    apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  refresh: (refreshToken: string) =>
    apiRequest<{ token: string; refreshToken: string }>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    }),

  me: (token: string) => apiRequest<AuthSession["user"]>("/auth/me", { token }),

  changePassword: (
    body: { currentPassword: string; newPassword: string },
    token: string,
  ) =>
    apiRequest<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body,
      token,
    }),
};

export const units = {
  /**
   * OJO: el backend actual aplica LIMIT sobre filas ya unidas con defectos,
   * no sobre unidades — pedir 100 puede devolver ~30 unidades reales.
   * Ver ARQUITECTURA.md, seccion "Deuda heredada del backend".
   */
  listByStatus: (status: UnitStatus, token: string, limit = 100) =>
    apiRequest<Unit[]>(`/units/?status=${status}&limit=${limit}`, { token }),

  byId: (id: number, token: string) =>
    apiRequest<Unit>(`/units/${id}`, { token }),

  create: (
    body: {
      vin: string;
      market: string;
      lane: string;
      registeredById: number;
      providerId?: number;
    },
    token: string,
  ) => apiRequest<Unit>("/units/", { method: "POST", body, token }),

  addDefect: (
    unitId: number,
    body: {
      defectType: string;
      zone: string;
      grade: string;
      registeredById: number;
      description?: string;
      photoUrls?: string[];
    },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/defects`, {
      method: "POST",
      body,
      token,
    }),

  /** Adjunta la URL segura emitida por Cloudinary al defecto ya creado. */
  addDefectPhoto: (
    unitId: number,
    defectId: number,
    body: { url: string },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/defects/${defectId}/photos`, {
      method: "POST",
      body,
      token,
    }),

  updateStatus: (
    unitId: number,
    body: {
      newStatus: UnitStatus;
      changedById: number;
      note?: string;
      estimatedRepairHours?: number;
    },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/status`, { method: "PUT", body, token }),

  updatePriority: (
    unitId: number,
    body: { note?: string; rank?: number; assignedById: number },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/priority`, {
      method: "PUT",
      body,
      token,
    }),

  updateEstimatedTime: (
    unitId: number,
    body: { estimatedRepairHours: number; updatedById: number },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/estimated-time`, {
      method: "PUT",
      body,
      token,
    }),

  /**
   * OJO con el nombre de la llave: el backend lee `grade`, no `newGrade`
   * (unit_controller.update_defect_grade). Mandar la llave equivocada devuelve
   * 400 "Invalid grade", que el motor trata como no reintentable y descarta —
   * es decir, la nivelacion se perderia en silencio.
   */
  updateDefectGrade: (
    unitId: number,
    defectId: number,
    body: { grade: string; updatedById: number },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/defects/${defectId}`, {
      method: "PUT",
      body,
      token,
    }),

  /** Reordena toda la cola de prioridad de una vez (drag & drop de SCM). */
  reorderPriority: (
    body: { unitIds: number[]; assignedById: number },
    token: string,
  ) =>
    apiRequest<Unit[]>("/units/priority/order", { method: "PUT", body, token }),

  setScmDecision: (
    unitId: number,
    body: { decision: string; note?: string; decidedById: number },
    token: string,
  ) =>
    apiRequest<Unit>(`/units/${unitId}/scm-decision`, {
      method: "PUT",
      body,
      token,
    }),

  archive: (unitId: number, archivedById: number, token: string) =>
    apiRequest<Unit>(`/units/${unitId}/archive`, {
      method: "PUT",
      body: { archivedById },
      token,
    }),

  deleteDefectPhoto: (unitId: number, defectId: number, token: string) =>
    apiRequest<Unit>(`/units/${unitId}/defects/${defectId}/photo`, {
      method: "DELETE",
      token,
    }),

  listArchivable: (token: string) =>
    apiRequest<Unit[]>("/units/archivable", { token }),

  listDeletionRequests: (token: string, status = "PENDING") =>
    apiRequest<DeletionRequest[]>(`/units/deletion-requests?status=${status}`, {
      token,
    }),

  decideDeletionRequest: (
    requestId: number,
    body: { decision: "APPROVE" | "REJECT"; decisionNote?: string },
    token: string,
  ) =>
    apiRequest<DeletionRequest>(
      `/units/deletion-requests/${requestId}/decision`,
      {
        method: "PUT",
        body,
        token,
      },
    ),

  requestDeletion: (unitId: number, reason: string, token: string) =>
    apiRequest<DeletionRequest>(`/units/${unitId}/deletion-requests`, {
      method: "POST",
      body: { reason },
      token,
    }),
};

export const notifications = {
  list: (token: string, limit = 50) =>
    apiRequest<AppNotification[]>(`/notifications/?limit=${limit}`, { token }),

  markRead: (id: number, token: string) =>
    apiRequest<AppNotification>(`/notifications/${id}/read`, {
      method: "PUT",
      token,
    }),

  markAllRead: (token: string) =>
    apiRequest<{ updated: number }>("/notifications/read-all", {
      method: "POST",
      token,
    }),
};

export const pushTokens = {
  register: (deviceToken: string, token: string) =>
    apiRequest<{ ok: boolean }>("/push-tokens/", {
      method: "POST",
      body: { token: deviceToken },
      token,
    }),

  unregister: (deviceToken: string, token: string) =>
    apiRequest<{ ok: boolean }>("/push-tokens/", {
      method: "DELETE",
      body: { token: deviceToken },
      token,
    }),
};

export const providers = {
  // Con barra final: sin ella FastAPI responde 307 y algunos clientes pierden
  // cabeceras o cuerpo al seguir el redirect.
  list: (token: string) => apiRequest<Provider[]>("/providers/", { token }),
  create: (body: { name: string; code?: string }, token: string) =>
    apiRequest<Provider>("/providers/", { method: "POST", body, token }),
  update: (id: number, body: { name: string; code?: string }, token: string) =>
    apiRequest<Provider>(`/providers/${id}`, { method: "PUT", body, token }),
  remove: (id: number, token: string) =>
    apiRequest<{ ok: boolean }>(`/providers/${id}`, {
      method: "DELETE",
      token,
    }),
};

export const unitModels = {
  list: (token: string, includeInactive = true) =>
    apiRequest<UnitModel[]>(
      `/unit-models/?includeInactive=${includeInactive}`,
      { token },
    ),
  create: (body: { code: string; name: string }, token: string) =>
    apiRequest<UnitModel>("/unit-models/", { method: "POST", body, token }),
  update: (
    id: number,
    body: Partial<Pick<UnitModel, "code" | "name" | "isActive">>,
    token: string,
  ) =>
    apiRequest<UnitModel>(`/unit-models/${id}`, { method: "PUT", body, token }),
  remove: (id: number, token: string) =>
    apiRequest<UnitModel>(`/unit-models/${id}`, { method: "DELETE", token }),
};

export const users = {
  list: (token: string) => apiRequest<ManagedUser[]>("/users/", { token }),
  create: (
    body: {
      email: string;
      password: string;
      name: string;
      roleId: number;
      providerId?: number;
      plant?: string;
    },
    token: string,
  ) => apiRequest<ManagedUser>("/users/", { method: "POST", body, token }),
  update: (
    id: number,
    body: Partial<ManagedUser> & { password?: string },
    token: string,
  ) => apiRequest<ManagedUser>(`/users/${id}`, { method: "PUT", body, token }),
  remove: (id: number, token: string) =>
    apiRequest<{ ok: boolean }>(`/users/${id}`, { method: "DELETE", token }),
};

export const logs = {
  list: (
    token: string,
    filters: {
      vin?: string;
      market?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => Boolean(value)) as [
        string,
        string,
      ][],
    );
    const suffix = params.toString();
    return apiRequest<HistoryRow[]>(`/logs/${suffix ? `?${suffix}` : ""}`, {
      token,
    });
  },
  exportExcel: (
    token: string,
    filters: {
      vin?: string;
      market?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => Boolean(value)) as [
        string,
        string,
      ][],
    );
    const suffix = params.toString();
    return apiDownload(`/logs/export${suffix ? `?${suffix}` : ""}`, {
      token,
      timeoutMs: 30_000,
    });
  },
};

export const dashboard = {
  monthlyTimeline: (token: string) =>
    apiRequest<{ date: string; count: number }[]>(
      "/dashboard/monthly-timeline",
      { token },
    ),
  weeklyByProvider: (token: string) =>
    apiRequest<{ date: string; provider: string; count: number }[]>(
      "/dashboard/weekly-by-provider",
      { token },
    ),
  defectsByModel: (token: string) =>
    apiRequest<{ model_code: string; grade: string; count: number }[]>(
      "/dashboard/defects-by-model",
      { token },
    ),
  repairTimeByProvider: (token: string) =>
    apiRequest<{ provider: string; hours: number; units: number }[]>(
      "/dashboard/repair-time-by-provider",
      { token },
    ),
  repairTimeByModel: (token: string) =>
    apiRequest<
      {
        model_code: string;
        model_name?: string | null;
        hours: number;
        units: number;
      }[]
    >("/dashboard/repair-time-by-model", { token }),
};
