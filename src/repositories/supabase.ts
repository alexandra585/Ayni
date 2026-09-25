"use client";
/**
 * SupabaseRepository — implementación real de las operaciones de la UI.
 * Lee con RLS (clave anon) y escribe SOLO mediante RPC SECURITY DEFINER (ver supabase/migrations).
 * Después de cada escritura vuelve a cargar el snapshot para que la UI (idéntica a la demo) se actualice.
 */
import type { AddByCodeResult, Change, JoinResult } from "@/domain/actions";
import type { AyniState, PanderoGroup, WizardData } from "@/domain/types";
import { getSupabase } from "@/lib/supabase/client";
import { xlmToStroops } from "@/lib/money";
import { fetchXlmBalance } from "@/services/stellar/horizon";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import {
  buildSnapshot,
  type GroupRow, type LedgerRow, type MemberRow, type NotificationRow, type ProfileRow, type PublicPanderoRow,
  type RoundRow, type TurnRow, type WalletRow,
} from "./snapshot";

const toast = (m: string) => useUi.getState().toast(m);

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(what + ": " + r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

/** Carga todo lo que el usuario puede ver (RLS) y lo convierte al estado de la UI. */
export async function loadSnapshot(): Promise<AyniState | null> {
  const supa = getSupabase();
  const { data: auth } = await supa.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const loadGroups = async () => must<GroupRow[]>(await supa.from("groups").select("*"), "groups");
  let groups = await loadGroups();

  // Evalúa cierres por fecha pendientes (idempotente; solo miembros pueden pedirlo).
  const today = new Date().toISOString().slice(0, 10);
  const due = groups.filter((g) => g.kind !== "pandero" && g.status === "custodia" && g.rule === "fecha" && (g.release_date ?? "9999") <= today);
  if (due.length) {
    await Promise.all(due.map((g) => supa.rpc("refresh_group_status", { p_group: g.id })));
    groups = await loadGroups();
  }

  const [profile, members, ledger, notifications, wallet, panderos, turns, rounds] = await Promise.all([
    supa.from("profiles").select("*").eq("id", uid).single().then((r) => must<ProfileRow>(r as never, "profile")),
    supa.from("group_members").select("*").then((r) => must<MemberRow[]>(r, "members")),
    supa.from("ledger_entries").select("*").order("created_at", { ascending: false }).limit(1000).then((r) => must<LedgerRow[]>(r, "ledger")),
    supa.from("notifications").select("*").order("created_at", { ascending: false }).limit(200).then((r) => must<NotificationRow[]>(r, "notifications")),
    supa.from("wallet_accounts").select("stellar_address, provider, created_at").maybeSingle().then((r) => (r.data as WalletRow | null)),
    supa.rpc("list_public_panderos").then((r) => must<PublicPanderoRow[]>(r, "foro")),
    supa.from("pandero_turns").select("*").then((r) => must<TurnRow[]>(r, "turnos")),
    supa.from("pandero_rounds").select("group_id, round, paid_out").then((r) => must<RoundRow[]>(r, "rondas")),
  ]);

  const profs = await supa.from("profiles").select("id, name, user_code");
  const profilesById: Record<string, { name: string; user_code: string }> = {};
  for (const p of (profs.data ?? []) as { id: string; name: string; user_code: string }[]) profilesById[p.id] = p;

  const balance = wallet ? await fetchXlmBalance(wallet.stellar_address).catch(() => 0) : 0;
  return buildSnapshot({ uid, profile, profilesById, groups, members, ledger, notifications, publicPanderos: panderos, wallet, testnetBalance: balance, turns, rounds });
}

export async function refreshSnapshot(): Promise<void> {
  const s = await loadSnapshot();
  if (s) useAyni.getState().hydrate(s);
}

/** id del usuario autenticado (para traducir "me" ↔ uuid). */
export async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getUser();
  if (!data.user) throw new Error("Sesión expirada");
  return data.user.id;
}

/* ───────────────────────── unirse ───────────────────────── */
const JOIN_ERRORS: Record<string, string> = {
  code_length: "El código debe tener 9 caracteres, por ejemplo AYNI-5B32.",
  code_format: "El código debe tener el formato AYNI-XXXX, por ejemplo AYNI-5B32.",
  not_found: "No encontramos un grupo con ese código. Revisa que esté bien escrito.",
  rate_limited: "Demasiados intentos con códigos inexistentes. Espera unos minutos e inténtalo de nuevo.",
  pandero_full: "Este pandero ya completó sus participantes.",
  group_full: "Este grupo ya está completo.",
};

let pendingPanderoCode: string | null = null;

export async function joinGroupByCode(code: string): Promise<JoinResult> {
  const { data, error } = await getSupabase().rpc("join_group_by_code", { p_code: code });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; result?: "joined" | "already" | "needs_terms"; group_id?: string; name?: string; cuota_stroops?: string; capacity?: number; visibility?: "publico" | "privado" };
  if (!r.ok) {
    if (r.error === "admissions_closed") {
      const me = useAyni.getState().s.me;
      return { ok: false, error: "El tesorero cerró el ingreso a este grupo. Pídele que te agregue con tu código de usuario: " + (me?.code ?? "") + "." };
    }
    return { ok: false, error: JOIN_ERRORS[r.error ?? ""] ?? "No se pudo unir al grupo." };
  }
  const id = r.group_id!;
  if (r.result === "needs_terms") {
    // el pandero privado aún no es legible: inyectamos lo mínimo para mostrar los términos
    pendingPanderoCode = code.trim().toUpperCase();
    const s = useAyni.getState().s;
    const stub: PanderoGroup = {
      kind: "pandero", name: r.name ?? "Pandero", code: pendingPanderoCode, capacity: r.capacity ?? 2, createdAt: new Date().toISOString(),
      creator: "?", members: {}, ledger: {}, demo: false, cuota: Number(r.cuota_stroops ?? 0) / 1e7, visibility: r.visibility ?? "privado",
      phase: "reclutando", round: 0, order: null, payouts: {}, creatorName: "", broke: {},
    };
    useAyni.getState().hydrate({ ...s, groups: { ...s.groups, [id]: stub } });
    return { ok: true, id, kind: "needs-terms" };
  }
  await refreshSnapshot();
  const g = useAyni.getState().s.groups[id];
  if (r.result === "joined") toast("Te uniste a " + (g?.name ?? "el grupo"));
  return { ok: true, id, kind: r.result === "already" ? "already" : "joined" };
}

export async function joinPanderoRemote(id: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("join_pandero", { p_group: id, p_code: pendingPanderoCode });
  pendingPanderoCode = null;
  const r = data as { ok: boolean; error?: string } | null;
  if (error || !r?.ok) {
    toast(r?.error === "pandero_full" ? "Este pandero ya se completó" : "No se pudo unir al pandero");
    await refreshSnapshot();
    return false;
  }
  await refreshSnapshot();
  toast("Te uniste a " + (useAyni.getState().s.groups[id]?.name ?? "el pandero"));
  return true;
}

/* ───────────────────────── crear ───────────────────────── */
export async function createGroupRemote(w: WizardData): Promise<string> {
  const P = w.kind === "pandero";
  const payload = P
    ? { kind: "pandero", name: w.name.trim(), capacity: parseInt(w.capacity, 10), cuota_stroops: xlmToStroops(parseFloat(w.cuota)).toString(), visibility: w.visibility }
    : {
        kind: "junta", name: w.name.trim(), capacity: parseInt(w.capacity, 10), nature: w.nature, goal_stroops: xlmToStroops(parseFloat(w.goal)).toString(),
        due_date: w.dueDate, release_date: w.rule === "fecha" ? w.releaseDate : w.dueDate, rule: w.rule,
      };
  const { data, error } = await getSupabase().rpc("create_group", { p: payload });
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  return data as string;
}

/* ───────────────────────── tesorero ───────────────────────── */
export async function setAdmissionsRemote(id: string, open: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("set_admissions", { p_group: id, p_open: open });
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  toast(open ? "Ingreso abierto: el código vuelve a funcionar" : "Ingreso cerrado: solo tú puedes agregar miembros");
}

const ADD_ERRORS: Record<string, string> = { own_code: "Ese es tu propio código.", no_user: "No existe un usuario con ese código." };

export async function addMemberByCodeRemote(id: string, code: string): Promise<AddByCodeResult> {
  const { data, error } = await getSupabase().rpc("add_member_by_user_code", { p_group: id, p_code: code });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; result?: "added" | "needs_recalc"; user_id?: string; name?: string };
  if (!r.ok) return { ok: false, error: r.error === "already_member" ? (r.name ?? "Esa persona") + " ya es miembro." : ADD_ERRORS[r.error ?? ""] ?? "No se pudo agregar." };
  const user = { id: r.user_id!, code: code.toUpperCase(), name: r.name ?? "" };
  if (r.result === "added") {
    await refreshSnapshot();
    toast(user.name + " fue agregado al grupo");
    return { ok: true, added: user };
  }
  return { ok: true, recalc: user };
}

export async function applyChangeRemote(id: string, ch: Change): Promise<void> {
  const { data, error } = await getSupabase().rpc("apply_change", {
    p_group: id,
    p_goal: ch.goal != null ? xlmToStroops(ch.goal).toString() : null,
    p_remove: ch.removeId ?? null,
    p_cap_delta: ch.capDelta ?? 0,
    p_add: ch.addUser?.id ?? null,
  });
  const r = data as { ok: boolean; error?: string } | null;
  if (error || !r?.ok) {
    toast("No se pudo aplicar el cambio" + (r?.error ? " (" + r.error + ")" : ""));
    return;
  }
  await refreshSnapshot();
  toast(ch.removeId ? "Miembro eliminado y cuotas recalculadas" : ch.addUser ? ch.addUser.name + " agregado; cuotas recalculadas" : "Monto objetivo actualizado");
}

export async function archiveRemote(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("archive_group", { p_group: id });
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  toast("Grupo archivado para todos los miembros");
}

export async function newCycleRemote(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("new_cycle", { p_group: id });
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  toast("Nuevo ciclo iniciado");
}

/* ───────────────────────── perfil y notificaciones ───────────────────────── */
export async function updateProfileRemote(input: { name: string; email: string; phone: string; address: string }): Promise<void> {
  const uid = await currentUserId();
  const { error } = await getSupabase().from("profiles").update(input).eq("id", uid);
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  toast("Perfil actualizado");
}

export async function disconnectWalletRemote(): Promise<void> {
  const uid = await currentUserId();
  const { error } = await getSupabase().from("wallet_accounts").delete().eq("user_id", uid);
  if (error) throw new Error(error.message);
  await refreshSnapshot();
  toast("Freighter desconectada");
}

export async function markReadRemote(keys: string[] | null): Promise<void> {
  const q = getSupabase().from("notifications").update({ read: true });
  const { error } = keys ? await q.in("key", keys) : await q.eq("read", false);
  if (error) console.error("markRead", error.message);
}
