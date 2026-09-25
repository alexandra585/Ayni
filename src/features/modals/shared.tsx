"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Preview } from "@/domain/actions";
import { xlm } from "@/lib/format";
import { getPaymentRail, type PaymentRail } from "@/services/payment-rail";

/** Lista de pasos "Procesando…" (los puntos se encienden uno a uno). */
export function ProcSteps({ labels, on }: { labels: string[]; on: number }) {
  return (
    <ul className="proc">
      {labels.map((l, i) => (
        <li key={i} className={i < on ? "on" : ""}>
          <span className="dot">{i < on ? <Icon name="check" /> : null}</span>
          {l}
        </li>
      ))}
    </ul>
  );
}

/** Enciende un paso cada `ms`; devuelve cuántos están encendidos (0..n) y llama a `onDone` al terminar. */
export function useSteps(n: number, ms: number, onDone?: () => void, active = true) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (!active) return;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (i < n) {
        i++;
        setOn(i);
        t = setTimeout(tick, ms);
        return;
      }
      onDone?.();
    };
    tick();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, n, ms]);
  return on;
}

/** Rail de pagos activo según el modo (demo simulado · Stellar Testnet). */
export function useRail(): PaymentRail {
  return getPaymentRail();
}

function CmpRow({ l, a, b, f }: { l: string; a: number; b: number; f: (x: number) => string | number }) {
  return (
    <div><dt>{l}</dt><dd>{f(a)}</dd><dd className="arr">→</dd><dd className="new">{f(b)}</dd></div>
  );
}

/** Comparación antes → después del recálculo de cuotas (previewHTML del prototipo). */
export function PreviewView({ p }: { p: Preview }) {
  const imp: { ico: string; node: React.ReactNode }[] = [];
  if (p.removed)
    imp.push({ ico: "trash", node: <>Se elimina a <b>{p.removed.name}</b>{p.removedRefund ? <> y se le devuelven <b>{xlm(p.removedRefund)}</b> de inmediato.</> : ". No había abonado."}</> });
  if (p.newC > p.oldC + 0.004)
    imp.push({ ico: "alert", node: <><b>{p.more.length}</b> miembro{p.more.length === 1 ? "" : "s"} deberá{p.more.length === 1 ? "" : "n"} abonar más. Cada uno verá lo que le falta.</> });
  if (p.refunds.length)
    imp.push({ ico: "refund", node: <><b>{p.refunds.length}</b> miembro{p.refunds.length === 1 ? "" : "s"} recibirá{p.refunds.length === 1 ? "" : "n"} una devolución inmediata en su billetera (total {xlm(p.totalRefund)}).</> });
  if (Math.abs(p.newC - p.oldC) < 0.005 && !p.removed) imp.push({ ico: "check", node: <>La cuota no cambia.</> });
  if (p.me)
    imp.push({
      ico: "user",
      node: p.me.ref ? <>Tú recibes una devolución de <b>{xlm(p.me.ref)}</b>.</> : p.me.owe > 0 ? <>Tu saldo pendiente pasa de {xlm(p.me.before)} a <b>{xlm(p.me.owe)}</b>.</> : <>Tu cuota queda completa.</>,
    });
  return (
    <>
      <dl className="cmp">
        <CmpRow l="Monto objetivo" a={p.oldGoal} b={p.newGoal} f={xlm} />
        <CmpRow l="Cupos" a={p.oldCap} b={p.newCap} f={(x) => x} />
        <CmpRow l="Cuota por miembro" a={p.oldC} b={p.newC} f={xlm} />
      </dl>
      <ul className="impact">
        {imp.map((x, i) => (<li key={i}><Icon name={x.ico} /><span>{x.node}</span></li>))}
      </ul>
    </>
  );
}
