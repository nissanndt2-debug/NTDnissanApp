import type {
  Grade,
  Plant,
  RoleId,
  ScmDecision,
  UnitStatus,
} from "./constants";

export interface User {
  id: number;
  email: string;
  name: string;
  roleId: RoleId;
  providerId?: number | null;
  plant?: Plant | null;
}

export interface Defect {
  id: number;
  /** id local mientras el defecto vive solo en el dispositivo */
  localId?: string;
  unitId: number;
  type: string;
  zone: string;
  grade: Grade;
  description?: string | null;
  isResolved: boolean;
  photoUrls: string[];
  /** rutas locales de fotos aun no subidas */
  pendingPhotos?: string[];
  /** Último error al subir evidencia; se conserva la foto para reintentar. */
  photoError?: string | null;
}

export interface Unit {
  id: number;
  localId?: string;
  vin: string;
  market: string;
  lane: string;
  statusName: UnitStatus;
  plant?: Plant | null;
  providerId?: number | null;
  isAvailableToday: boolean;
  estimatedRepairHours?: number | null;
  estimatedCompletionDate?: string | null;
  priorityRank?: number | null;
  priorityNote?: string | null;
  scmDecision?: ScmDecision | null;
  registeredBy?: string;
  createdAt?: string;
  updatedAt?: string;
  defects: Defect[];
  /** estado local de sincronizacion, no viene del servidor */
  _sync: SyncState;
}

export type SyncState = "synced" | "pending" | "failed";

/** Una mutacion encolada mientras no hay red. */
export interface QueuedMutation {
  id: string;
  kind: MutationKind;
  /** id de unidad (numerico si ya existe en servidor, localId si nacio offline) */
  targetId: string;
  payload: string;
  attempts: number;
  lastError?: string | null;
  createdAt: number;
  nextAttemptAt: number;
}

export type MutationKind =
  | "CREATE_UNIT"
  | "ADD_DEFECT"
  | "UPDATE_STATUS"
  | "UPDATE_PRIORITY"
  | "UPDATE_ESTIMATED_TIME"
  | "UPDATE_DEFECT_GRADE"
  | "REORDER_PRIORITY"
  | "UPLOAD_PHOTO";

export interface AuthSession {
  user: User;
  token: string;
  refreshToken: string;
}

export interface Provider {
  id: number;
  name: string;
  code?: string | null;
}

export interface UnitModel {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  roleId: RoleId;
  roleName?: string;
  providerId?: number | null;
  providerName?: string | null;
  plant?: Plant | null;
}

export interface HistoryRow {
  unitId: number;
  vin: string;
  market?: string;
  lane?: string;
  newStatus: UnitStatus;
  previousStatus?: UnitStatus | null;
  changedAt: string;
  changedByName?: string | null;
  registeredByName?: string | null;
  note?: string | null;
  /** Tipo de evento cuando la fila no corresponde a un cambio de estatus. */
  eventType?: "STATUS_CHANGE" | "PRIORITY_UPDATED" | "SCM_DECISION" | string;
  /** Destino explicito que se guarda junto con comentarios operativos. */
  noteDestination?: string | null;
  photoUrls?: string[];
}

export interface DeletionRequest {
  id: number;
  unitId: number;
  requestedById: number;
  requestedByName?: string | null;
  vin: string;
  market?: string;
  lane?: string;
  plant?: Plant | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decisionNote?: string | null;
  requestedAt?: string;
}
