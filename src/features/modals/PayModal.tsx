"use client";
import { useEffect, useRef, useState } from "react";
import { useCavos } from "@cavos/kit/react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetHead } from "@/components/ui/Sheet";
import { cuotaOf, owed } from "@/domain/model";
import type { JuntaGroup } from "@/domain/types";
import { r2, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { refreshSnapshot } from "@/repositories/supabase";
import { assertFreighterTestnet, signAndSubmitPayment } from "@/services/stellar/freighter";
import { ProcSteps, useRail, useSteps } from "./shared";

type PaymentReceipt = { hash: string; amount: string; provider?: "cavos" | "freighter" };
type Phase = { t: "form" } | { t: "processing" } | ({ t: "registering" } & PaymentReceipt)
  | ({ t: "register-error"; message: string } & PaymentReceipt) | ({ t: "done" } & PaymentReceipt);

/** Pagar mi cuota (fondo común): formulario → procesando → comprobante. */
export function PayModal({ gid }: { gid: string }) {
  const { open, close, toast } = useUi.getState();
  const g = useAyni((x) => x.s.groups[gid]) as JuntaGroup;
  const bal = useAyni((x) => x.s.wallet?.bal ?? 0);
  const { wallet } = useCavos();
  const freighterAddress = useAyni((x) => x.s.wallet?.conn?.freighter?.addr);
  const [provider, setProvider] = useState<"cavos" | "freighter">("cavos");
  const [freighterReady, setFreighterReady] = useState(false);
  const [freighterError, setFreighterError] = useState<string | null>(null);
  const rail = useRail();
  const treasuryAddress = process.env.NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC;
  const me = g.members.me;
  const [due0] = useState(() => owed(g, me)); // el monto se fija al abrir; el estado cambia al registrar el pago
  const [paid0] = useState(() => me.paid);
  const [phase, setPhase] = useState<Phase>({ t: "form" });

  const labels = rail.payLabels(xlm(due0));
  const on = useSteps(labels.length, 550, undefined, phase.t === "processing");
  const started = useRef(false);
  const registering = useRef(false);

  useEffect(() => {
    if (provider !== "freighter" || !freighterAddress) return;
    let active = true;
    const check = () => {
      setFreighterReady(false);
      void assertFreighterTestnet(freighterAddress).then(() => {
        if (active) { setFreighterReady(true); setFreighterError(null); }
      }).catch((error: unknown) => {
        if (active) setFreighterError(error instanceof Error ? error.message : "No se pudo comprobar Freighter.");
      });
    };
    check();
    window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, [provider, freighterAddress]);

  const registerPayment = async (payment: PaymentReceipt) => {
    if (registering.current) return;
    registering.current = true;
    setPhase({ t: "registering", ...payment });
    try {
      const response = await fetch("/api/stellar/contribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: payment.hash, groupId: gid, ...(payment.provider === "freighter" ? { provider: "freighter" } : {}) }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) {
        setPhase({ t: "register-error", ...payment, message: result.message || "No se pudo registrar el aporte." });
        return;
      }
    } catch {
      setPhase({ t: "register-error", ...payment, message: "No se pudo confirmar el registro. Reintenta con el mismo hash." });
      return;
    } finally {
      registering.current = false;
    }
    try {
      await refreshSnapshot();
    } catch {
      setPhase({ t: "register-error", ...payment, message: "El aporte está registrado, pero no se pudo actualizar la información. Reintenta para recargarla." });
      return;
    }
    setPhase({ t: "done", ...payment });
  };

  useEffect(() => {
    if (phase.t !== "processing" || started.current) return;
    started.current = true;
    const pay = async () => {
      if (rail.kind === "stellar-testnet") {
        if (provider === "cavos" && (wallet?.chain !== "stellar" || wallet.status === "needs-device-approval")) {
          throw new Error("Conecta una wallet Cavos Stellar autorizada para continuar.");
        }
        if (!treasuryAddress?.startsWith("G")) {
          throw new Error("No hay una dirección de tesorería Testnet válida configurada.");
        }

        const response = await fetch("/api/stellar/contribution?groupId=" + encodeURIComponent(gid), { cache: "no-store" });
        const due = await response.json() as { ok?: boolean; amountStroops?: string; message?: string };
        if (!response.ok || !due.ok || !due.amountStroops) {
          throw new Error(due.message || "No tienes cuota pendiente.");
        }

        const amountStroops = BigInt(due.amountStroops);
        if (amountStroops <= 0n) throw new Error("No tienes cuota pendiente.");
        if (provider === "freighter") {
          if (!freighterAddress) throw new Error("Conecta Freighter desde Billetera.");
          const hash = await signAndSubmitPayment({ from: freighterAddress, to: treasuryAddress, amountStroops, memo: "AYNI:" + gid.replaceAll("-", "").slice(0, 20) });
          await registerPayment({ hash, amount: xlm(Number(amountStroops) / 10_000_000), provider: "freighter" });
          return;
        }
        if (wallet?.chain !== "stellar") throw new Error("Conecta una wallet Cavos Stellar autorizada para continuar.");
        const hash = await wallet.execute(
          amountStroops,
          process.env.NEXT_PUBLIC_STELLAR_TREASURY_PUBLIC!,
        );
        await registerPayment({ hash, amount: xlm(Number(amountStroops) / 10_000_000) });
        return;
      }

      const { hash } = await rail.payContribution({ groupId: gid, amount: due0 });
      setPhase({ t: "done", hash, amount: xlm(due0) });
    };

    void pay()
      .catch((e) => {
        if (provider === "freighter") {
          started.current = false;
          setFreighterError(e instanceof Error ? e.message : "No se pudo completar el pago.");
          setPhase({ t: "form" });
          return;
        }
        close();
        toast(e instanceof Error && e.message ? e.message : "No se pudo completar el pago");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.t]);

  if (due0 <= 0 && phase.t === "form") return null;

  if (phase.t === "registering" || phase.t === "register-error")
    return (
      <Sheet onClose={close}>
        <h3 id="sh-t">{phase.t === "registering" ? "Registrando aporte" : "Registro pendiente"}</h3>
        <p className="muted">{phase.provider === "freighter" ? "El envío se ha solicitado. Conserva este hash para verificarlo y completar el registro sin repetir el pago." : "Los XLM ya fueron enviados. Conserva este hash para completar el registro."}</p>
        <p className="caption num" style={{ overflowWrap: "anywhere" }}>{phase.hash}</p>
        {phase.t === "register-error" ? <>
          <p role="alert">{phase.message}</p>
          <button className="btn btn-primary btn-block" onClick={() => void registerPayment({ hash: phase.hash, amount: phase.amount, provider: phase.provider })}>Reintentar registro</button>
        </> : <p role="status">Verificando el pago y actualizando el grupo…</p>}
      </Sheet>
    );

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
          <Badge tone="paid" icon="check" style={{ marginBottom: 12 }}>{rail.kind === "demo" ? "Transferencia enviada" : "Pago confirmado"}</Badge>
          <h3 id="sh-t">{rail.kind === "demo" ? "Aporte transferido" : "Aporte registrado"}</h3>
          <p className="muted" style={{ margin: "8px 0 4px" }}>{phase.amount} enviados a la tesorería Testnet.</p>
          <p className="caption num">tx {short(phase.hash)}</p>
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} id="pay-ok" onClick={close} autoFocus>Listo</button>
        </div>
      </Sheet>
    );

  const demoCanPay = rail.kind === "demo" ? rail.canPay(due0) : null;
  const cavosCanPay =
    wallet?.chain === "stellar" &&
    wallet.status !== "needs-device-approval" &&
    Boolean(treasuryAddress?.startsWith("G"));
  return (
    <Sheet onClose={close}>
      <SheetHead title={paid0 > 0 ? "Completar mi cuota" : "Pagar mi cuota"} onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>{g.name} · {g.periodo || "este ciclo"}</p>
      <p className="vault-amount" style={{ marginTop: 8 }}>{xlm(due0)}</p>
      {paid0 > 0 ? <p className="caption">Cuota actual {xlm(cuotaOf(g))} · ya abonaste {xlm(paid0)}</p> : null}
      {rail.kind === "demo" ? (
        <div className="bal-line" style={{ marginTop: 12 }}><span>Se debitará de tu billetera</span><span>Saldo: <span className="num">{xlm(bal)}</span></span></div>
      ) : (
        <div className="bal-line" style={{ marginTop: 12 }}><span>Se pagará desde tu wallet {provider === "cavos" ? "Cavos" : "Freighter"}</span><span>Stellar Testnet</span></div>
      )}
      {rail.kind === "stellar-testnet" && freighterAddress ? <fieldset className="pay-wallet-selector">
        <legend>Wallet para este pago</legend>
        <div className="pay-wallet-options">
          <label className="pay-wallet-option">
            <span className="pay-wallet-copy"><b>Cavos</b><small>Wallet embebida</small></span>
            <span className="pay-wallet-selected" aria-hidden="true">Seleccionada</span>
            <input type="radio" name="payment-wallet" aria-label="Pagar con Cavos" checked={provider === "cavos"} onChange={() => setProvider("cavos")} />
          </label>
          <label className="pay-wallet-option">
            <span className="pay-wallet-copy"><b>Freighter</b><small>Extensión Stellar</small></span>
            <span className="pay-wallet-selected" aria-hidden="true">Seleccionada</span>
            <input type="radio" name="payment-wallet" aria-label="Pagar con Freighter" checked={provider === "freighter"} onChange={() => setProvider("freighter")} />
          </label>
        </div>
      </fieldset> : null}
      {provider === "freighter" && freighterError ? <p className="err" role="alert">{freighterError}</p> : null}
      {rail.kind === "demo" && demoCanPay?.ok ? (
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} id="pay-go" autoFocus onClick={() => setPhase({ t: "processing" })}>
          <Icon name="finger" />Confirmar con mi huella
        </button>
      ) : rail.kind === "demo" && demoCanPay && !demoCanPay.ok ? (
        <div className="warn">
          <span>Saldo insuficiente: te faltan {xlm(r2(demoCanPay.missing))}</span>
          <button className="btn btn-accent btn-sm" id="pay-top" onClick={() => open({ t: "topup", ctx: { gid, need: r2(due0 - bal) } })}>Recargar billetera</button>
        </div>
      ) : provider === "freighter" ? (
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} id="pay-go" disabled={!freighterReady || !freighterAddress || !treasuryAddress?.startsWith("G")} onClick={() => setPhase({ t: "processing" })}>Pagar con Freighter</button>
      ) : cavosCanPay ? (
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} id="pay-go" autoFocus onClick={() => setPhase({ t: "processing" })}>
          <Icon name="finger" />Pagar con Cavos
        </button>
      ) : (
        <div className="warn"><span>Conecta una wallet Cavos Stellar autorizada y configura el destino Testnet.</span></div>
      )}
      <p className="caption" style={{ marginTop: 14 }}>
        Solo tú puedes pagar tu cuota. Todo se paga en XLM y va directo a la bóveda. {rail.kind === "demo" ? "Pago simulado." : "MVP Testnet: no se mueve dinero real."}
      </p>
    </Sheet>
  );
}
