"use client";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetHead } from "@/components/ui/Sheet";
import { cuotaOf, owed } from "@/domain/model";
import type { JuntaGroup } from "@/domain/types";
import { r2, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { ProcSteps, useRail, useSteps } from "./shared";

type Phase = { t: "form" } | { t: "processing" } | { t: "done"; hash: string };

/** Pagar mi cuota (fondo común): formulario → procesando → comprobante. */
export function PayModal({ gid }: { gid: string }) {
  const { open, close, toast } = useUi.getState();
  const g = useAyni((x) => x.s.groups[gid]) as JuntaGroup;
  const bal = useAyni((x) => x.s.wallet?.bal ?? 0);
  const rail = useRail();
  const me = g.members.me;
  const [due0] = useState(() => owed(g, me)); // el monto se fija al abrir; el estado cambia al registrar el pago
  const [paid0] = useState(() => me.paid);
  const [phase, setPhase] = useState<Phase>({ t: "form" });

  const labels = rail.payLabels(xlm(due0));
  const on = useSteps(labels.length, 550, undefined, phase.t === "processing");
  const started = useRef(false);

  useEffect(() => {
    if (phase.t !== "processing" || started.current) return;
    started.current = true;
    rail
      .payContribution({ groupId: gid, amount: due0 })
      .then(({ hash }) => setPhase({ t: "done", hash }))
      .catch((e) => {
        close();
        toast(e instanceof Error && e.message ? e.message : "No se pudo completar el pago");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.t]);

  if (due0 <= 0 && phase.t === "form") return null;

  if (phase.t === "processing")
    return (
      <Sheet onClose={close}>
        <h3 id="sh-t">Procesando pago</h3>
        <ProcSteps labels={labels} on={on} />
      </Sheet>
    );

  if (phase.t === "done")
    return (
      <Sheet onClose={close}>
        <div style={{ textAlign: "center" }}>
          <Badge tone="paid" icon="check" style={{ marginBottom: 12 }}>Pagó</Badge>
          <h3 id="sh-t">Cuota pagada</h3>
          <p className="muted" style={{ margin: "8px 0 4px" }}>{xlm(due0)} ya están bloqueados en la bóveda.</p>
          <p className="caption num">tx {short(phase.hash)}</p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} id="pay-ok" onClick={close} autoFocus>Listo</button>
        </div>
      </Sheet>
    );

  const can = rail.canPay(due0);
  return (
    <Sheet onClose={close}>
      <SheetHead title={paid0 > 0 ? "Completar mi cuota" : "Pagar mi cuota"} onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>{g.name} · {g.periodo || "este ciclo"}</p>
      <p className="vault-amount" style={{ marginTop: 8 }}>{xlm(due0)}</p>
      {paid0 > 0 ? <p className="caption">Cuota actual {xlm(cuotaOf(g))} · ya abonaste {xlm(paid0)}</p> : null}
      {rail.kind === "demo" ? (
        <div className="bal-line" style={{ marginTop: 12 }}><span>Se debitará de tu billetera</span><span>Saldo: <span className="num">{xlm(bal)}</span></span></div>
      ) : (
        <div className="bal-line" style={{ marginTop: 12 }}><span>Se pagará desde tu wallet Freighter</span><span>Stellar Testnet</span></div>
      )}
      {can.ok ? (
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} id="pay-go" autoFocus onClick={() => setPhase({ t: "processing" })}>
          <Icon name="finger" />{rail.kind === "demo" ? "Confirmar con mi huella" : "Firmar con Freighter"}
        </button>
      ) : (
        <div className="warn">
          <span>Saldo insuficiente: te faltan {xlm(r2(can.missing))}</span>
          <button className="btn btn-accent btn-sm" id="pay-top" onClick={() => open({ t: "topup", ctx: { gid, need: r2(due0 - bal) } })}>Recargar billetera</button>
        </div>
      )}
      <p className="caption" style={{ marginTop: 14 }}>
        Solo tú puedes pagar tu cuota. Todo se paga en XLM y va directo a la bóveda. {rail.kind === "demo" ? "Pago simulado." : "MVP Testnet: no se mueve dinero real."}
      </p>
    </Sheet>
  );
}
