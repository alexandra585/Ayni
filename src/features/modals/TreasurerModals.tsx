"use client";
import { useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetHead } from "@/components/ui/Sheet";
import { preview, type Change } from "@/domain/actions";
import { cuotaOf, freeUsers, isAdmin, jstats, mlist } from "@/domain/model";
import type { JuntaGroup } from "@/domain/types";
import { validateGoal } from "@/domain/validation";
import { r2, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { PreviewView, useRail } from "./shared";
import { APP_MODE } from "@/config/app";

/* ------------------------------------------------------------------ Panel del tesorero */
export function SettingsModal({ id }: { id: string }) {
  const { open, close } = useUi.getState();
  const s = useAyni((x) => x.s);
  const g = s.groups[id] as JuntaGroup;
  const st = jstats(g);
  const c = cuotaOf(g);
  const [err, setErr] = useState("");
  const code = useRef<HTMLInputElement>(null);
  const free = freeUsers(s, g);

  if (!isAdmin(g)) return null; // un participante nunca ve este panel (además lo impone RLS en la BD)

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    const r = await addMember(id, code.current!.value);
    if (!r.ok) { setErr(r.error); code.current?.focus(); return; }
    close();
    if ("recalc" in r) open({ t: "recalc", id, ch: { capDelta: 1, addUser: r.recalc } });
  };

  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Panel del tesorero" onClose={close} />
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 4 }}>
        <span className="j-private-badge"><Icon name="lock" />Solo tú ves esto</span>
      </div>
      <div className="j-settings-sheet">
        <div className="j-setting-row">
          <div>
            <span className="j-setting-label">Monto objetivo</span>
            <span className="j-setting-value">{xlm(g.goal)}</span>
            <span className="j-setting-help">Cuota actual: {xlm(c)} × {g.capacity} cupos.</span>
          </div>
          <button className="btn btn-secondary" id="ad-goal" onClick={() => open({ t: "goal", id })}>Cambiar monto</button>
        </div>
        <div className="j-setting-row">
          <div>
            <span className="j-setting-label">Ingreso de miembros</span>
            <span className="j-setting-help">{g.admissionsOpen ? "Las personas con el código pueden unirse." : "Solo tú puedes agregar personas con su código de usuario."}</span>
          </div>
          <button className={"j-switch" + (g.admissionsOpen ? "" : " off")} id="ad-open" aria-pressed={g.admissionsOpen} onClick={() => toggleAdmissions(id)}>
            <span className="j-switch-track" aria-hidden="true" />Ingreso abierto: {g.admissionsOpen ? "Sí" : "No"}
          </button>
        </div>
        <div className="j-setting-row">
          <form className="j-add-form" id="ad-add" noValidate onSubmit={onAdd}>
            <div className="field">
              <label htmlFor="ad-code">Código de usuario</label>
              <input id="ad-code" ref={code} maxLength={8} placeholder="USR-XXXX" autoComplete="off" />
              <span className="j-setting-help">
                {st.free ? st.free + " lugar" + (st.free > 1 ? "es" : "") + " disponible" + (st.free > 1 ? "s" : "") + "." : "Si agregas a alguien, se suma un cupo y la cuota se recalcula."}
              </span>
            </div>
            <button className="btn btn-primary" type="submit">Agregar</button>
            {err ? <p className="err" id="ad-err" role="alert">{err}</p> : null}
            {APP_MODE === "demo" && free.length ? (
              <p className="j-setting-help">
                Demo: puedes probar con <button type="button" className="hash" id="ad-try" onClick={() => { code.current!.value = free[0].code; code.current!.focus(); }}>{free[0].code}</button> ({free[0].name}).
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </Sheet>
  );
}

/** Acciones del tesorero: en modo supabase pasan por el repositorio remoto (RLS/RPC); en demo, por el dominio. */
async function toggleAdmissions(id: string) {
  if (APP_MODE === "supabase") {
    const { setAdmissionsRemote } = await import("@/repositories/supabase");
    await setAdmissionsRemote(id, !(useAyni.getState().s.groups[id] as JuntaGroup).admissionsOpen);
    return;
  }
  useAyni.getState().toggleAdmissions(id);
}
async function addMember(id: string, code: string) {
  if (APP_MODE === "supabase") {
    const { addMemberByCodeRemote } = await import("@/repositories/supabase");
    return addMemberByCodeRemote(id, code);
  }
  return useAyni.getState().addByCode(id, code);
}
async function applyChangeAny(id: string, ch: Change) {
  if (APP_MODE === "supabase") {
    const { applyChangeRemote } = await import("@/repositories/supabase");
    return applyChangeRemote(id, ch);
  }
  useAyni.getState().applyChange(id, ch);
}

/* ------------------------------------------------------------------ Cambiar monto */
export function GoalModal({ id }: { id: string }) {
  const { close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const [val, setVal] = useState(String(g.goal));
  const v = validateGoal(val);
  const p = v.ok ? preview(g, { goal: r2(v.value) }) : null;
  const canApply = v.ok && Math.abs(v.value - g.goal) > 0.004;
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Cambiar monto objetivo" onClose={close} />
      <div className="alertbox"><Icon name="alert" /><span>Cambiar el monto recalcula lo que debe pagar cada miembro. Si la cuota baja, quienes ya pagaron más reciben una devolución inmediata. Se notificará a todo el grupo.</span></div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="gl-v">Nuevo monto objetivo (XLM)</label>
        <input id="gl-v" type="number" inputMode="decimal" min={1} step={10} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      </div>
      <div id="gl-prev">{p ? <PreviewView p={p} /> : <p className="err" style={{ marginTop: 12 }}>Ingresa un monto mayor a cero.</p>}</div>
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" id="gl-c" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" id="gl-ok" disabled={!canApply} onClick={async () => { await applyChangeAny(id, { goal: r2(v.value) }); close(); }}>Aplicar y recalcular</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Quitar miembro */
export function RemoveModal({ id, mid }: { id: string; mid: string }) {
  const { close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const [mode, setMode] = useState<"free" | "drop">("free");
  const m = g.members[mid];
  if (!m) return null;
  const ch: Change = { removeId: mid, capDelta: mode === "drop" ? -1 : 0 };
  const p = preview(g, ch);
  return (
    <Sheet wide onClose={close}>
      <SheetHead title={"¿Quitar a " + m.name + " del grupo?"} onClose={close} />
      <div className="alertbox"><Icon name="alert" /><span>Esta acción no se puede deshacer. {m.paid > 0 ? "Se le devolverán " + xlm(m.paid) + " de inmediato." : "No había abonado."}</span></div>
      <div className="field" style={{ marginTop: 16 }}>
        <span style={{ font: "600 14px/20px var(--font-sans)" }}>¿Qué pasa con su lugar?</span>
        <div className="radios">
          <label><input type="radio" name="rmm" value="free" checked={mode === "free"} onChange={() => setMode("free")} /><span><b>Dejar el lugar libre</b><small>La cuota no cambia; otra persona puede ocuparlo.</small></span></label>
          <label><input type="radio" name="rmm" value="drop" checked={mode === "drop"} onChange={() => setMode("drop")} /><span><b>Quitar el lugar</b><small>El grupo queda con un cupo menos y el monto se reparte entre los demás.</small></span></label>
        </div>
      </div>
      <PreviewView p={p} />
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" id="rm-c" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" id="rm-ok" style={{ background: "var(--achiote)", color: "var(--surface-raised)" }} onClick={async () => { await applyChangeAny(id, ch); close(); }}>
          <Icon name="trash" />Sí, quitar
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Agregar un cupo */
export function RecalcModal({ id, ch }: { id: string; ch: Change }) {
  const { close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const p = preview(g, ch);
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Agregar un cupo" onClose={close} />
      <div className="alertbox"><Icon name="alert" /><span>El grupo está lleno. Agregar a {ch.addUser!.name} suma un cupo y recalcula la cuota de todos; quienes pagaron de más recibirán una devolución.</span></div>
      <PreviewView p={p} />
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" id="rc-c" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" id="rc-ok" onClick={async () => { await applyChangeAny(id, ch); close(); }}>Agregar y recalcular</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Disposición del fondo */
export function DisposeModal({ id }: { id: string }) {
  const { open, close } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const s = jstats(g);
  const ms = mlist(g).filter((m) => m.id !== "me");
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Enviar a un participante" onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>Se enviará todo el monto recolectado: <b style={{ color: "var(--ink)" }}>{xlm(s.total)}</b>.</p>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="dp-sel">Participante</label>
        <select id="dp-sel" value={to} onChange={(e) => setTo(e.target.value)} autoFocus>
          <option value="">Elige un participante</option>
          {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {err ? <p className="err" id="dp-err" role="alert">{err}</p> : null}
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" id="dp-c" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" id="dp-go" onClick={() => { if (!to) { setErr("Elige a quién enviar el fondo."); return; } open({ t: "confirmDispose", id, to }); }}>Continuar</button>
      </div>
    </Sheet>
  );
}

export function ConfirmDisposeModal({ id, to }: { id: string; to: string }) {
  const { close, toast } = useUi.getState();
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const rail = useRail();
  const [busy, setBusy] = useState(false);
  const s = jstats(g);
  const name = to === "me" ? "tu wallet" : g.members[to]?.name || "";
  const go = async () => {
    setBusy(true);
    try {
      await rail.releaseFund({ groupId: id, to });
      close();
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : "No se pudo disponer el fondo");
    }
  };
  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Confirmar" onClose={close} />
      <div className="alertbox"><Icon name="alert" /><span>Esta operación no se puede deshacer. {xlm(s.total)} saldrán de la bóveda hacia {name} y quedará en el registro público.</span></div>
      <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" id="cf-c" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" id="cf-go" onClick={go} disabled={busy} autoFocus>
          <Icon name="finger" />{busy ? "Procesando…" : "Confirmar con mi huella"}
        </button>
      </div>
    </Sheet>
  );
}
