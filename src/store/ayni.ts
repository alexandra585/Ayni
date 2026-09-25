/**
 * Store del dominio (Zustand). Es la implementación "demo" del repositorio:
 * cada acción clona el estado, aplica una regla pura de `domain/` y publica el resultado.
 */
import { create } from "zustand";
import * as A from "@/domain/actions";
import type { AddByCodeResult, Change, JoinResult } from "@/domain/actions";
import { APP_MODE } from "@/config/app";
import { userCode } from "@/domain/env";
import type { AyniState, Ctx, Me, MemberFilter, WalletKey, WizardData } from "@/domain/types";
import { emptyState, seedDemo } from "@/fixtures/demo/seed";
import { useUi } from "./ui";

interface AyniStore {
  s: AyniState;
  /** Ejecuta una regla de dominio sobre un clon del estado y lo publica. */
  run<T>(fn: (ctx: Ctx) => T): T;
  hydrate(s: AyniState): void;

  signUp(input: { name: string; email: string; phone: string; address: string }): void;
  logout(): void;
  updateProfile(input: { name: string; email: string; phone: string; address: string }): Promise<void>;
  checkTimed(): void;

  joinByCode(code: string): JoinResult;
  joinPandero(id: string): boolean;
  createGroup(w: WizardData): string;
  setFilter(id: string, f: MemberFilter): void;

  markAllRead(): void;
  markRead(index: number): void;

  payCuota(gid: string, due: number, hash: string): boolean;
  dispose(id: string, to: string): void;
  newCycle(id: string): Promise<void>;
  archive(id: string): Promise<void>;
  applyChange(id: string, ch: Change): void;
  toggleAdmissions(id: string): void;
  addByCode(id: string, code: string): AddByCodeResult;

  runAgent(id: string): void;
  logAgent(id: string): void;

  simJoin(id: string): void;
  simPay(id: string): void;
  simDate(id: string): void;
  psJoin(id: string): void;
  psPay(id: string): void;
  startGame(id: string): void;
  monthEnd(id: string): void;

  connectWallet(k: WalletKey, addr: string): void;
  disconnectWallet(k: WalletKey): void;
  topup(walletName: string, amt: number, hash?: string): void;
}

const pendingRelease = new Set<string>();

export const useAyni = create<AyniStore>((set, get) => {
  const toast = (m: string) => useUi.getState().toast(m);

  const run = <T,>(fn: (ctx: Ctx) => T): T => {
    const ctx: Ctx = { s: A.cloneState(get().s), toast };
    const out = fn(ctx);
    set({ s: ctx.s });
    scheduleReleases();
    return out;
  };

  /** Equivale a `autoRelease()` del prototipo: 700 ms después pasa a "listo para disponer". */
  function scheduleReleases() {
    A.releasable(get().s).forEach((id) => {
      if (pendingRelease.has(id)) return;
      pendingRelease.add(id);
      setTimeout(() => {
        pendingRelease.delete(id);
        const g = get().s.groups[id];
        if (g) run((ctx) => A.markReady(ctx, id));
      }, 700);
    });
  }

  return {
    s: emptyState(),
    run,
    hydrate: (s) => set({ s }),

    signUp(input) {
      const me: Me = { ...input, name: input.name.slice(0, 40), since: new Date().toISOString(), code: userCode() };
      const s = emptyState();
      s.me = me;
      const ctx: Ctx = { s, toast };
      seedDemo(ctx);
      set({ s: ctx.s });
      toast("Cuenta creada. Te agregamos a grupos de ejemplo.");
      get().checkTimed();
    },
    logout() {
      pendingRelease.clear();
      set({ s: emptyState() });
    },
    async updateProfile(input) {
      if (APP_MODE === "supabase") {
        const { updateProfileRemote } = await import("@/repositories/supabase");
        return updateProfileRemote(input);
      }
      run((ctx) => {
        Object.assign(ctx.s.me!, input);
        Object.keys(ctx.s.groups).forEach((k) => {
          const g = ctx.s.groups[k];
          if (g.members.me) g.members.me.name = input.name;
        });
      });
      toast("Perfil actualizado");
    },
    checkTimed: () => run((ctx) => A.checkTimed(ctx)),

    joinByCode: (code) => run((ctx) => A.joinByCode(ctx, code)),
    joinPandero: (id) => run((ctx) => A.joinPanderoAfterTerms(ctx, id)),
    createGroup: (w) => run((ctx) => A.createGroupFromWizard(ctx, w)),
    setFilter: (id, f) => run((ctx) => { ctx.s.filter[id] = f; }),

    markAllRead() {
      run((ctx) => ctx.s.notifs.forEach((n) => (n.read = true)));
      if (APP_MODE === "supabase") void import("@/repositories/supabase").then((m) => m.markReadRemote(null));
    },
    markRead(i) {
      const key = get().s.notifs[i]?.key;
      run((ctx) => { if (ctx.s.notifs[i]) ctx.s.notifs[i].read = true; });
      if (APP_MODE === "supabase" && key) void import("@/repositories/supabase").then((m) => m.markReadRemote([key]));
    },

    payCuota: (gid, due, hash) => run((ctx) => A.payCuota(ctx, gid, due, hash)),
    dispose: (id, to) => run((ctx) => A.dispose(ctx, id, to)),
    async newCycle(id) {
      if (APP_MODE === "supabase") return (await import("@/repositories/supabase")).newCycleRemote(id);
      run((ctx) => A.newCycle(ctx, id));
    },
    async archive(id) {
      if (APP_MODE === "supabase") return (await import("@/repositories/supabase")).archiveRemote(id);
      run((ctx) => A.archive(ctx, id));
    },
    applyChange: (id, ch) => run((ctx) => A.applyChange(ctx, id, ch)),
    toggleAdmissions: (id) => run((ctx) => A.toggleAdmissions(ctx, id)),
    addByCode: (id, code) => run((ctx) => A.addByCode(ctx, id, code)),

    runAgent(id) {
      const g = get().s.groups[id];
      if (!g || g.kind === "pandero") return;
      const msgs = A.agentMessages(g);
      if (!msgs.length) return;
      run((ctx) => { ctx.s.agent[id] = { busy: true }; });
      setTimeout(() => {
        run((ctx) => {
          ctx.s.agent[id] = { msgs, note: "Mensajes de plantilla (en la versión conectada los redacta el agente de IA)." };
        });
      }, 500);
    },
    logAgent: (id) => run((ctx) => A.logAgent(ctx, id)),

    simJoin: (id) => run((ctx) => A.simJoin(ctx, id)),
    simPay: (id) => run((ctx) => { A.simPay(ctx, id); }),
    simDate: (id) => run((ctx) => A.simDate(ctx, id)),
    psJoin: (id) => run((ctx) => A.psJoin(ctx, id)),
    psPay: (id) => run((ctx) => A.psPay(ctx, id)),
    startGame: (id) => run((ctx) => A.startGame(ctx, id)),
    monthEnd: (id) => run((ctx) => A.monthEnd(ctx, id)),

    connectWallet: (k, addr) => run((ctx) => A.connectWallet(ctx.s, k, addr)),
    disconnectWallet(k) {
      if (APP_MODE === "supabase") { void import("@/repositories/supabase").then((m) => m.disconnectWalletRemote()); return; }
      run((ctx) => A.disconnectWallet(ctx, k));
    },
    topup: (name, amt, hash) => run((ctx) => A.applyTopup(ctx, name, amt, hash)),
  };
});
