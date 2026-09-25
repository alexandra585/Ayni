/** Tipos del dominio de Ayni (portados 1:1 del modelo del prototipo). Importes en XLM (2 decimales). */

export type GroupKind = "junta" | "promocion" | "pandero";
export type JuntaStatus = "custodia" | "listo" | "liberado";
export type PanderoPhase = "reclutando" | "espera" | "juego" | "terminado";
export type MemberStatus = "paid" | "pending" | "late" | "nofunds" | "wait";
export type CloseRule = "fecha" | "meta";
export type Visibility = "publico" | "privado";

export interface Member {
  name: string;
  order: number;
  joinedAt: string;
  paid: number;
  paidAt: string | null;
  reminders: number;
  paidRound: number;
  code: string | null;
}
export type MemberWithId = Member & { id: string };

export interface LedgerEntry {
  type: "in" | "out";
  amount: number;
  desc: string;
  hash: string;
  at: string;
  method?: string;
}
export type LedgerEntryWithId = LedgerEntry & { id: string };

interface GroupBase {
  name: string;
  code: string | null;
  capacity: number;
  createdAt: string;
  creator: string;
  members: Record<string, Member>;
  ledger: Record<string, LedgerEntry>;
  demo: boolean;
  archived?: boolean;
  archivedAt?: string;
}

export interface JuntaGroup extends GroupBase {
  kind: "junta" | "promocion";
  nature: string;
  goal: number;
  periodo: string;
  dueDate: string;
  releaseDate: string;
  rule: CloseRule;
  status: JuntaStatus;
  admissionsOpen: boolean;
  dateReached?: boolean;
  readyAt?: string;
  releasedAt?: string | null;
  releasedAmount?: number | null;
  releasedTo?: string | null;
  releasedToName?: string | null;
}

export interface PanderoGroup extends GroupBase {
  kind: "pandero";
  cuota: number;
  visibility: Visibility;
  phase: PanderoPhase;
  round: number;
  order: string[] | null;
  payouts: Record<number, boolean>;
  creatorName: string;
  startDate?: string;
  closedAt?: string;
  /** rondas en las que ya se simuló un débito fallido de otro participante */
  broke: Record<number, boolean>;
}

export type Group = JuntaGroup | PanderoGroup;

export interface Me {
  name: string;
  email: string;
  phone: string;
  address: string;
  since: string;
  code: string;
}

export interface WalletMove {
  id: string;
  type: "in" | "out";
  amount: number;
  desc: string;
  at: string;
  hash: string;
}

export type WalletKey = "freighter" | "cavos" | "privy";
export interface WalletState {
  address: string;
  bal: number;
  conn: Partial<Record<WalletKey, { addr: string; at: string }>>;
  moves: WalletMove[];
}

export type NotifType =
  | "refund"
  | "eve"
  | "full"
  | "closed"
  | "start"
  | "debit"
  | "nofunds"
  | "pot"
  | "owe"
  | "round"
  | "info";

export interface Notif {
  key: string;
  type: NotifType;
  title: string;
  body: string;
  gid: string | null;
  at: string;
  read: boolean;
}

export interface DirUser {
  id: string;
  code: string;
  name: string;
}

export interface AgentMsg {
  id: string;
  name: string;
  text: string;
}
export interface AgentState {
  busy?: boolean;
  msgs?: AgentMsg[];
  note?: string;
}

export type MemberFilter = "all" | MemberStatus;

/** Estado completo de la app (equivale al `state` del prototipo, sin la parte de navegación). */
export interface AyniState {
  me: Me | null;
  wallet: WalletState | null;
  groups: Record<string, Group>;
  dir: DirUser[];
  notifs: Notif[];
  agent: Record<string, AgentState>;
  filter: Record<string, MemberFilter>;
  nameIdx: number;
}

/** Efectos secundarios que el dominio puede pedir a la UI. */
export interface Ctx {
  s: AyniState;
  toast: (msg: string) => void;
}

/** Datos del wizard "Crear nuevo grupo". */
export interface WizardData {
  step: number;
  kind: "junta" | "pandero";
  nature: string;
  name: string;
  goal: string;
  cuota: string;
  periodo: string;
  dueDate: string;
  releaseDate: string;
  rule: CloseRule;
  capacity: string;
  visibility: Visibility;
  accept: boolean;
  error: string;
}
