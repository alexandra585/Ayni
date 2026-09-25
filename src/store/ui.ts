import { create } from "zustand";
import { APP_MODE } from "@/config/app";
import type { Change } from "@/domain/actions";
import type { WalletKey } from "@/domain/types";

export type Modal =
  | { t: "notifs" }
  | { t: "members"; id: string }
  | { t: "ledger"; id: string }
  | { t: "pay"; gid: string }
  | { t: "dispose"; id: string }
  | { t: "confirmDispose"; id: string; to: string }
  | { t: "settings"; id: string }
  | { t: "goal"; id: string }
  | { t: "remove"; id: string; mid: string }
  | { t: "recalc"; id: string; ch: Change }
  | { t: "terms"; id: string; readOnly?: boolean }
  | { t: "archived"; id: string }
  | { t: "receive" }
  | { t: "connect"; k: WalletKey; after?: () => void }
  | { t: "topup"; ctx?: { gid?: string; need?: number } }
  | { t: "topupRun"; k: WalletKey; amt: number; ctx?: { gid?: string; need?: number } };

interface UiState {
  modal: Modal | null;
  toastMsg: string | null;
  /** true mientras se cierra sesión: evita que el guard agregue ?next= */
  loggingOut: boolean;
  setLoggingOut: (v: boolean) => void;
  /** false mientras (modo supabase) se restaura la sesión: evita redirigir al login antes de tiempo */
  authReady: boolean;
  setAuthReady: (v: boolean) => void;
  open: (m: Modal) => void;
  close: () => void;
  toast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set) => ({
  modal: null,
  toastMsg: null,
  loggingOut: false,
  setLoggingOut: (loggingOut) => set({ loggingOut }),
  authReady: APP_MODE !== "supabase",
  setAuthReady: (authReady) => set({ authReady }),
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
  toast: (msg) => {
    clearTimeout(toastTimer);
    set({ toastMsg: msg });
    toastTimer = setTimeout(() => set({ toastMsg: null }), 3000);
  },
}));
