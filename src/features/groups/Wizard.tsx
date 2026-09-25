"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { newWizard, termsList, wizSteps } from "@/domain/actions";
import { NATURES } from "@/domain/model";
import type { WizardData } from "@/domain/types";
import { validateWizardStep } from "@/domain/validation";
import { fdate, r2, xlm } from "@/lib/format";
import { useCreateGroup } from "@/features/groups/useCreateGroup";

function Radio({ name, value, checked, onChange, icon, label, desc }: { name: string; value: string; checked: boolean; onChange: () => void; icon: IconName; label: string; desc: string }) {
  return (
    <label>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <Icon name={icon} />
      <b>{label}</b>
      <small>{desc}</small>
    </label>
  );
}

/** /groups/new — Crear nuevo grupo (Grupo con fondo común: 4 pasos · Pandero: 3 pasos). */
export function Wizard() {
  const router = useRouter();
  const createGroup = useCreateGroup();
  const [w, setW] = useState<WizardData>(() => {
    const kind = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("kind") === "pandero" ? "pandero" : "junta";
    return newWizard(kind);
  });
  const errRef = useRef<HTMLParagraphElement>(null);
  const set = (patch: Partial<WizardData>) => setW((x) => ({ ...x, ...patch, error: "" }));

  const P = w.kind === "pandero";
  const st = w.step;
  const N = wizSteps(w);
  const titles = P
    ? ["¿Qué tipo de grupo quieres crear?", "Aporte, participantes y visibilidad", "Revisa y acepta los términos"]
    : ["¿Qué tipo de grupo quieres crear?", "Monto a reunir", "¿Cuándo cierra la recolección?", "¿Cuántos participantes?"];

  useEffect(() => {
    if (w.error) errRef.current?.focus();
  }, [w.error]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const error = validateWizardStep(w);
    if (error) { setW((x) => ({ ...x, error })); return; }
    if (st < N - 1) { setW((x) => ({ ...x, step: x.step + 1, error: "" })); return; }
    const id = await createGroup(w);
    router.push("/groups/" + id + "/created");
  };

  const back = () => {
    if (st === 0) router.push("/groups");
    else setW((x) => ({ ...x, step: x.step - 1, error: "" }));
  };

  let body: ReactNode = null;
  if (st === 0) {
    body = (
      <>
        <div className="choice" style={{ gridTemplateColumns: "1fr 1fr" }} role="radiogroup" aria-label="Tipo de grupo">
          <Radio name="kind" value="junta" checked={w.kind === "junta"} onChange={() => set({ kind: "junta" })} icon="users" label="Grupo con fondo común" desc="Juntas, comités, condominios, clubes o grupos de trabajo" />
          <Radio name="kind" value="pandero" checked={w.kind === "pandero"} onChange={() => set({ kind: "pandero" })} icon="coins" label="Pandero" desc="El pozo se deposita a una persona distinta en cada ronda" />
        </div>
        <div className="field" style={{ marginTop: 24 }}>
          <label htmlFor="w-name">Nombre del grupo</label>
          <input id="w-name" value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder={P ? "Pandero del mercado" : "Ej. Fondo del edificio"} maxLength={60} />
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          {P ? "En un pandero quien lo crea no es tesorero: no puede eliminar participantes ni cambiar el aporte." : "Serás el tesorero: podrás administrar miembros, monto objetivo e ingreso al grupo."}
        </p>
      </>
    );
  } else if (P && st === 1) {
    body = (
      <div className="form-grid">
        <div className="field">
          <label htmlFor="w-cuota">Aporte mensual por persona (XLM)</label>
          <input id="w-cuota" type="number" inputMode="decimal" min={1} step={1} value={w.cuota} onChange={(e) => set({ cuota: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="w-cap">Número de participantes</label>
          <input id="w-cap" type="number" inputMode="numeric" min={2} max={50} step={1} value={w.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="Ej. 10" />
          <span className="hint">También es el número de rondas (meses).</span>
        </div>
        <div className="field full">
          <span style={{ font: "600 16px/24px var(--font-sans)" }}>Visibilidad</span>
          <div className="choice" style={{ gridTemplateColumns: "1fr 1fr" }} role="radiogroup" aria-label="Visibilidad">
            <Radio name="vis" value="publico" checked={w.visibility === "publico"} onChange={() => set({ visibility: "publico" })} icon="globe" label="Público" desc="Se publica en el foro; sin código de grupo" />
            <Radio name="vis" value="privado" checked={w.visibility === "privado"} onChange={() => set({ visibility: "privado" })} icon="key" label="Privado" desc="No aparece en el foro; se entra con código" />
          </div>
        </div>
      </div>
    );
  } else if (P && st === 2) {
    const cap = parseInt(w.capacity, 10) || 0;
    const cu = parseFloat(w.cuota) || 0;
    body = (
      <>
        <dl className="summary">
          <div><dt>Pandero</dt><dd>{w.name}</dd></div>
          <div><dt>Aporte mensual</dt><dd className="num">{xlm(cu)}</dd></div>
          <div><dt>Participantes y rondas</dt><dd>{cap}</dd></div>
          <div><dt>Pozo por ronda</dt><dd className="num">{xlm(cu * cap)}</dd></div>
          <div><dt>Visibilidad</dt><dd>{w.visibility === "publico" ? "Público (foro)" : "Privado (código)"}</dd></div>
        </dl>
        <ol className="terms">{termsList({ cuota: cu, capacity: cap }, APP_MODE === "supabase").map((t) => <li key={t}>{t}</li>)}</ol>
        <label className="check">
          <input type="checkbox" id="w-accept" checked={w.accept} onChange={(e) => set({ accept: e.target.checked })} />
          Leí y acepto los términos, incluido el débito automático de mi aporte.
        </label>
      </>
    );
  } else if (!P && st === 1) {
    body = (
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="w-nature">Naturaleza del grupo</label>
          <select id="w-nature" className="nature-select" value={w.nature} onChange={(e) => set({ nature: e.target.value })}>
            {NATURES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <span className="hint">Esto ayuda a describir el grupo con palabras sencillas para sus miembros.</span>
        </div>
        <div className="field">
          <label htmlFor="w-goal">Monto objetivo a reunir (XLM)</label>
          <input id="w-goal" type="number" inputMode="decimal" min={1} step={10} value={w.goal} onChange={(e) => set({ goal: e.target.value })} />
          <span className="hint">Se divide entre los participantes.</span>
        </div>
        <div className="field">
          <label htmlFor="w-due">Fecha límite de pago</label>
          <input id="w-due" type="date" value={w.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          <span className="hint">Después de esta fecha, quien no pagó aparece como Atrasado.</span>
        </div>
      </div>
    );
  } else if (!P && st === 2) {
    body = (
      <>
        <div className="field">
          <span style={{ font: "600 16px/24px var(--font-sans)" }}>Regla de cierre</span>
          <div className="choice" style={{ gridTemplateColumns: "1fr 1fr" }} role="radiogroup" aria-label="Regla de liberación">
            <Radio name="rule" value="fecha" checked={w.rule === "fecha"} onChange={() => set({ rule: "fecha" })} icon="cal" label="En una fecha" desc="Se paga lo recaudado ese día" />
            <Radio name="rule" value="meta" checked={w.rule === "meta"} onChange={() => set({ rule: "meta" })} icon="target" label="Al completar la meta" desc="Se paga cuando todos pagan" />
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          {w.rule === "fecha" ? (
            <div className="field">
              <label htmlFor="w-rel">Fecha de cierre</label>
              <input id="w-rel" type="date" value={w.releaseDate} onChange={(e) => set({ releaseDate: e.target.value })} />
            </div>
          ) : null}
        </div>
        <div className="infobox"><Icon name="key" /><span>Al cierre, como tesorero podrás recolectar todo el monto en tu wallet o enviarlo a uno de los participantes.</span></div>
      </>
    );
  } else if (!P && st === 3) {
    const n = parseInt(w.capacity, 10) || 0;
    const gl = parseFloat(w.goal) || 0;
    body = (
      <>
        <div className="field">
          <label htmlFor="w-cap">Número de participantes (incluyéndote)</label>
          <input id="w-cap" type="number" inputMode="numeric" min={2} max={200} step={1} value={w.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="Ej. 24" />
          <span className="hint">No necesitas sus nombres: recibirás un código y cada persona se une desde su celular.</span>
        </div>
        <dl className="summary" style={{ marginTop: 20 }}>
          <div><dt>Grupo</dt><dd>{w.name}</dd></div>
          <div><dt>Naturaleza</dt><dd>{w.nature}</dd></div>
          <div><dt>Monto objetivo</dt><dd className="num">{xlm(gl)}</dd></div>
          <div><dt>Cuota por participante</dt><dd className="num" id="s-cuota">{n >= 2 ? xlm(r2(gl / n)) : "—"}</dd></div>
          <div><dt>Cierre</dt><dd>{w.rule === "fecha" ? fdate(w.releaseDate) : "Al completar la meta"}</dd></div>
        </dl>
      </>
    );
  }

  return (
    <div className="panel wiz">
      <span className="flow-chip">Crear grupo · Paso {st + 1} de {N}</span>
      <div className="wiz-steps" style={{ marginTop: 16 }} aria-hidden="true">
        {Array.from({ length: N }, (_, i) => <span key={i} className={i <= st ? "on" : ""} />)}
      </div>
      <h2>{titles[st]}</h2>
      <form id="wiz" noValidate onSubmit={onSubmit}>
        {body}
        {w.error ? <p className="err" ref={errRef} style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5 }} role="alert" tabIndex={-1}>{w.error}</p> : null}
        <div className="row" style={{ marginTop: 32, justifyContent: "space-between", gap: 16 }}>
          <button type="button" className="btn btn-ghost" id="w-back" onClick={back}>{st === 0 ? "Cancelar" : "Atrás"}</button>
          <button type="submit" className="btn btn-primary">
            {st === N - 1 ? (P ? "Aceptar y crear pandero" : "Crear grupo y obtener código") : "Continuar"}
          </button>
        </div>
      </form>
    </div>
  );
}
