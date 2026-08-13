import type { Grade, Plant, RoleId, ScmDecision, UnitStatus } from './constants';

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

export type SyncState = 'synced' | 'pending' | 'failed';

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
  | 'CREATE_UNIT'
  | 'ADD_DEFECT'
  | 'UPDATE_STATUS'
  | 'UPDATE_PRIORITY'
  | 'UPDATE_ESTIMATED_TIME'
  | 'UPDATE_DEFECT_GRADE'
  | 'REORDER_PRIORITY'
  | 'UPLOAD_PHOTO';

export interface AuthSession {
  user: User;
  token: string;
  refreshToken: string;
}
