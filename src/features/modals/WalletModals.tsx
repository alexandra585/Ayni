"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetHead } from "@/components/ui/Sheet";
import { connectedWallets, WALLETS, walletInfo } from "@/domain/actions";
import { stellarAddr } from "@/domain/env";
import type { WalletKey } from "@/domain/types";
import { validateEmail, validateTopup } from "@/domain/validation";
import { APP_MODE } from "@/config/app";
import { copyText } from "@/lib/clipboard";
import { short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { ProcSteps, useSteps } from "./shared";

/* ------------------------------------------------------------------ Mi dirección */
export function ReceiveModal() {
  const { close } = useUi.getState();
  const address = useAyni((x) => x.s.wallet!.address);
  return (
    <Sheet onClose={close}>
      <SheetHead title="Mi dirección Stellar" onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>Es la dirección de tu cuenta Ayni en la red Stellar. Las recargas se hacen desde Freighter, Cavos o Privy.</p>
      <p className="code-lg" style={{ fontSize: 15, letterSpacing: ".02em", overflowWrap: "anywhere" }}>{address}</p>
      <button className="btn btn-primary btn-block" id="rc-copy" onClick={() => copyText(address, "Dirección copiada")}><Icon name="copy" />Copiar dirección</button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Conectar wallet */
export function ConnectModal({ k, after }: { k: WalletKey; after?: () => void }) {
  const { close, toast } = useUi.getState();
  const me = useAyni((x) => x.s.me!);
  const x = walletInfo(k);
  const [stage, setStage] = useState<"form" | "run">(x.kind === "emb" ? "form" : "run");
  const [labels, setLabels] = useState<string[]>(
    k === "freighter" ? ["Abriendo la extensión Freighter", "Aprobaste la conexión en Freighter", "Conectada a Ayni"] : ["Abriendo " + x.t, "Aprobaste la conexión", "Conectada a Ayni"],
  );
  const [err, setErr] = useState("");
  const mail = useRef<HTMLInputElement>(null);

  const finish = async () => {
    let addr = stellarAddr();
    if (APP_MODE === "supabase" && k === "freighter") {
      try {
        const { connectFreighter } = await import("@/services/stellar/freighter");
        addr = await connectFreighter();
      } catch (e) {
        close();
        toast(e instanceof Error ? e.message : "No se pudo conectar Freighter");
        return;
      }
    }
    useAyni.getState().connectWallet(k, addr);
    if (APP_MODE === "supabase" && k === "freighter") {
      const { refreshSnapshot } = await import("@/repositories/supabase");
      await refreshSnapshot();
    }
    toast(x.t + " conectada");
    if (after) after();
    else close();
  };
  const on = useSteps(labels.length, 500, finish, stage === "run");

  useEffect(() => { if (stage === "form") mail.current?.focus(); }, [stage]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const m = mail.current!.value.trim();
    const r = validateEmail(m);
    if (!r.ok) { setErr(r.error); mail.current?.focus(); return; }
    setLabels(["Verificando " + m, "Abriendo tu wallet " + x.t + " en Stellar", "Conectada a Ayni"]);
    setStage("run");
  };

  if (stage === "run")
    return (
      <Sheet onClose={close}>
        <h3 id="sh-t">Conectando {x.t}</h3>
        <ProcSteps labels={labels} on={on} />
      </Sheet>
    );
  return (
    <Sheet wide onClose={close}>
      <SheetHead title={"Conectar " + x.t} onClose={close} />
      <p className="muted" style={{ fontSize: 14 }}>{x.t} crea o abre una wallet Stellar vinculada a tu correo. No necesitas instalar nada ni guardar frases secretas.</p>
      <form id="cn" noValidate onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div className="field"><label htmlFor="cn-mail">Correo electrónico</label><input id="cn-mail" ref={mail} type="email" defaultValue={me.email || ""} /></div>
        {err ? <p className="err" id="cn-err" role="alert">{err}</p> : null}
        <button className="btn btn-primary btn-block" type="submit">Continuar con {x.t}</button>
        <p className="caption">Conexión simulada.</p>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Recargar billetera */
export function TopupModal({ ctx }: { ctx?: { gid?: string; need?: number } }) {
  const { open, close } = useUi.getState();
  const s = useAyni((z) => z.s);
  const conn = s.wallet!.conn || {};
  const [w, setW] = useState<WalletKey>(conn.freighter ? "freighter" : (connectedWallets(s)[0] || WALLETS[0]).k);
  const [amount, setAmount] = useState(String(Math.max(100, Math.ceil(ctx?.need || 0))));
  const [err, setErr] = useState("");
  const x = walletInfo(w);
  const on = !!conn[w];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const a = parseFloat(amount);
    const r = validateTopup(a);
    if (!r.ok) { setErr(r.error); return; }
    const amt = Math.round(a * 100) / 100;
    const run = () => open({ t: "topupRun", k: w, amt, ctx });
    if (on) run();
    else open({ t: "connect", k: w, after: run });
  };

  return (
    <Sheet wide onClose={close}>
      <SheetHead title="Recargar billetera" onClose={close} />
      <form id="tp" noValidate onSubmit={onSubmit} style={{ display: "grid", gap: 16, marginTop: 8 }}>
        {ctx?.need ? <div className="infobox"><Icon name="alert" /><span>Te faltan {xlm(ctx.need)} para completar el pago.</span></div> : null}
        <div className="field">
          <span style={{ font: "600 14px/20px var(--font-sans)" }}>Recargar desde</span>
          {WALLETS.map((wl) => {
            const cw = conn[wl.k];
            return (
              <button key={wl.k} type="button" className={"opt" + (w === wl.k ? " rec" : "")} data-w={wl.k} aria-pressed={w === wl.k} onClick={() => { setW(wl.k); setErr(""); }}>
                <span className="mk"><Icon name="wallet" /></span>
                <span><b>{wl.t}</b><small>{wl.type} · {cw ? "conectada · " + short(cw.addr) : "no conectada: se conectará al continuar"}</small></span>
                {wl.k === "freighter" ? <Badge tone="paid">Recomendada</Badge> : null}
              </button>
            );
          })}
        </div>
        <div className="field">
          <label htmlFor="tp-amt">Monto en XLM</label>
          <input id="tp-amt" type="number" inputMode="decimal" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="hint">Solo se acepta XLM. La comisión de red la cubre Ayni.</span>
        </div>
        {err ? <p className="err" role="alert">{err}</p> : null}
        <button className="btn btn-primary btn-block" type="submit"><Icon name="finger" />{on ? "Firmar en " + x.t : "Conectar " + x.t + " y recargar"}</button>
        <p className="caption">Recarga simulada; no se mueven fondos reales.</p>
      </form>
    </Sheet>
  );
}

export function TopupRunModal({ k, amt, ctx }: { k: WalletKey; amt: number; ctx?: { gid?: string; need?: number } }) {
  const { open, close, toast } = useUi.getState();
  const x = walletInfo(k);
  const [done, setDone] = useState(false);
  const labels = [k === "freighter" ? "Firmando en la extensión Freighter" : "Firmando en " + x.t, "Transacción enviada a la red Stellar", "Acreditado en tu billetera"];
  const on = useSteps(labels.length, 550, () => {
    useAyni.getState().topup(x.t, amt);
    if (ctx?.gid) {
      toast("Recarga lista. Ahora puedes pagar tu cuota.");
      open({ t: "pay", gid: ctx.gid });
      return;
    }
    setDone(true);
  });

  if (done)
    return (
      <Sheet onClose={close}>
        <div style={{ textAlign: "center" }}>
          <Badge tone="paid" icon="check" style={{ marginBottom: 12 }}>Acreditado</Badge>
          <h3 id="sh-t">Recarga completa</h3>
          <p className="muted" style={{ margin: "8px 0 20px" }}>{xlm(amt)} ya están en tu billetera.</p>
          <button className="btn btn-primary btn-block" id="tp-ok" onClick={close} autoFocus>Listo</button>
        </div>
      </Sheet>
    );
  return (
    <Sheet onClose={close}>
      <h3 id="sh-t">Recargando</h3>
      <p className="muted" style={{ fontSize: 14 }}>{x.t} · {xlm(amt)}</p>
      <ProcSteps labels={labels} on={on} />
    </Sheet>
  );
}
