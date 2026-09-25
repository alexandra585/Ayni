"use client";
import { pendingReminders } from "@/domain/actions";
import { condMet, jstats, mlist, mstatus } from "@/domain/model";
import type { JuntaGroup, PanderoGroup } from "@/domain/types";
import { useAyni } from "@/store/ayni";

/** Panel flotante "Modo demo — Solo para demostración". Las acciones cambian el estado real de la app. */
function DemoFloat({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <details className="demo-float">
      <summary>
        <span>Modo demo</span>
        <span className="demo-float-tag">Solo para demostración</span>
      </summary>
      <div className="demo-float-body">
        <p>{note}</p>
        <div className="demo-float-actions">{children}</div>
      </div>
    </details>
  );
}

export function JuntaDemoPanel({ id }: { id: string }) {
  const g = useAyni((x) => x.s.groups[id]) as JuntaGroup;
  const st = useAyni.getState;
  const s = jstats(g);
  const pend = pendingReminders(g);
  const met = condMet(g);
  return (
    <DemoFloat note="Simula acciones de otros miembros sin alterar el flujo real de la interfaz.">
      {s.free && g.admissionsOpen ? <button className="btn btn-secondary" id="sim-join" onClick={() => st().simJoin(id)}>Simular que alguien se une</button> : null}
      {pend.length ? <button className="btn btn-secondary" id="sim-pay" onClick={() => st().simPay(id)}>Simular pago de otro miembro</button> : null}
      {g.rule === "fecha" && !met ? <button className="btn btn-secondary" id="sim-date" onClick={() => st().simDate(id)}>Simular que llegó la fecha de cierre</button> : null}
    </DemoFloat>
  );
}

export function PanderoDemoPanel({ id }: { id: string }) {
  const g = useAyni((x) => x.s.groups[id]) as PanderoGroup;
  const st = useAyni.getState;
  if (g.phase === "terminado") return null;
  const others = g.phase === "juego" ? mlist(g).filter((m) => m.id !== "me" && mstatus(g, m) === "nofunds") : [];
  return (
    <DemoFloat note="Simula acciones del pandero sin cambiar la lógica real de la interfaz.">
      {g.phase === "reclutando" ? <button className="btn btn-secondary" id="ps-join" onClick={() => st().psJoin(id)}>Simular que alguien se une</button> : null}
      {g.phase === "espera" ? <button className="btn btn-secondary" id="ps-start" onClick={() => st().startGame(id)}>Simular que pasó el mes</button> : null}
      {others.length ? <button className="btn btn-secondary" id="ps-pay" onClick={() => st().psPay(id)}>Simular que {others[0].name.split(" ")[0]} recarga</button> : null}
      {g.phase === "juego" ? <button className="btn btn-secondary" id="ps-next" onClick={() => st().monthEnd(id)}>Simular fin de mes</button> : null}
    </DemoFloat>
  );
}
