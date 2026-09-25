"use client";
import { useCavos } from "@cavos/kit/react";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { connectedWallets, WALLETS } from "@/domain/actions";
import { isP, mstatus, myGroupIds } from "@/domain/model";
import type { WalletMove } from "@/domain/types";
import { copyText } from "@/lib/clipboard";
import { fdt, fmt, REF, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

/** /wallet — Billetera. */
export function WalletScreen() {
  const { isAuthenticated, isLoading: cavosLoading, wallet, walletStatus, authError } = useCavos();
  const [stroops, setStroops] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const s = useAyni((x) => x.s);
  const { disconnectWallet } = useAyni.getState();
  const open = useUi((u) => u.open);
  const w = s.wallet!;
  const conn = w.conn || {};
  /** modo supabase: saldo y pagos reales en Stellar Testnet (solo Freighter). */
  const live = APP_MODE === "supabase";

  useEffect(() => {
    let alive = true;
    setStroops(null);
    setBalanceError(null);
    if (wallet?.chain !== "stellar") return () => { alive = false; };

    void wallet.balance().then((value) => {
      if (alive) setStroops(value);
    }).catch(() => {
      if (alive) setBalanceError("No se pudo consultar el saldo XLM.");
    });

    return () => { alive = false; };
  }, [wallet]);

  const cavosBalance = stroops == null ? null : Number(stroops) / 10_000_000;

  const mine = myGroupIds(s);
  const locked = mine.reduce((a, id) => {
    const g = s.groups[id];
    return a + (!isP(g) && g.status === "custodia" ? g.members.me.paid || 0 : 0);
  }, 0);
  const pend = mine.filter((id) => {
    const g = s.groups[id];
    return isP(g) && g.phase === "juego" && mstatus(g, g.members.me) === "nofunds";
  });
  const need = pend.reduce((a, id) => a + (s.groups[id] as { cuota: number }).cuota, 0);
  const moves = w.moves.slice(0, 12);

  return (
    <div className="wal">
      <div className="main">
        <section className="wal-hero" aria-label="Saldo disponible">
          <span className="lbl">Saldo disponible</span>
          <span className="tot">{cavosBalance == null ? "— XLM" : xlm(cavosBalance)}</span>
          <span style={{ fontSize: 14, opacity: 0.85 }}>≈ S/ {fmt((cavosBalance ?? 0) * REF)} · tipo de cambio referencial</span>
          {wallet?.chain === "stellar" ? (
            <button className="addr" id="copy-addr" aria-label="Copiar dirección de mi billetera" onClick={() => copyText(wallet.address, "Dirección copiada")}>
              <Icon name="copy" />{short(wallet.address)}
            </button>
          ) : (
            <span style={{ fontSize: 14, opacity: 0.85 }}>
              {cavosLoading || !isAuthenticated ? "Conectando wallet Stellar Testnet…" : "Wallet Stellar Testnet no conectada."}
            </span>
          )}
          <span style={{ fontSize: 14, opacity: 0.85 }}>Stellar Testnet · status: {wallet?.chain === "stellar" ? wallet.status : "no conectada"}</span>
          {balanceError || authError ? <p className="err" role="alert">{balanceError ?? authError}</p> : null}
        </section>

        <div className="panel">
          <div className="panel-head"><h2>Wallets conectadas</h2><span className="caption">{connectedWallets(s).length} conectada{connectedWallets(s).length === 1 ? "" : "s"}</span></div>
          <p className="muted" style={{ fontSize: 14 }}>Tu saldo solo se recarga desde una wallet Stellar conectada.</p>
          <ul className="assets" style={{ marginTop: 8 }}>
            {(live ? WALLETS.filter((x) => x.k === "cavos") : WALLETS).map((x) => {
              const on = conn[x.k];
              return (
                <li className="asset" key={x.k}>
                  <span className={"tok " + (x.kind === "emb" ? "tok-usdc" : "tok-xlm")} aria-hidden="true">{x.t[0]}</span>
                  <div>
                    <b>{x.t}</b>
                    <small>{x.type} · {wallet?.chain === "stellar" ? "conectada · " + short(wallet.address) : "no conectada"}</small>
                  </div>
                  <div>
                    {live ? (
                      <span className="caption">{wallet?.chain === "stellar" ? wallet.status : "—"}</span>
                    ) : on ? (
                      <button className="btn btn-ghost btn-sm" data-disc={x.k} onClick={() => disconnectWallet(x.k)}>Desconectar</button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" data-conn={x.k} onClick={() => open({ t: "connect", k: x.k })}>Conectar</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {pend.length ? (
          <div className="warn" style={{ margin: 0 }}>
            <span>Tienes {pend.length} aporte{pend.length > 1 ? "s" : ""} de pandero sin cobrar ({xlm(need)}). Al recargar se cobra{pend.length > 1 ? "n" : ""} automáticamente.</span>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-head"><h2>Moneda</h2></div>
          <ul className="assets">
            <li className="asset">
              <span className="tok tok-xlm" aria-hidden="true">✦</span>
              <div>
                <b>Stellar Lumens (XLM)</b>
                <small>Ayni opera solo con XLM: cuotas, aportes, pozos y devoluciones. Las comisiones de red las cubre Ayni.</small>
              </div>
              <div className="v">{cavosBalance == null ? "— XLM" : xlm(cavosBalance)}</div>
            </li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>En bóvedas</h2></div>
          <p className="muted" style={{ fontSize: 14 }}>Cuotas de juntas que siguen bloqueadas: <b className="num" style={{ color: "var(--ink)" }}>{xlm(locked)}</b>. No forman parte de tu saldo disponible.</p>
        </div>
      </div>

      <div className="main">
        <div className="panel">
          <div className="panel-head"><h2>Movimientos</h2><span className="caption">Últimos {Math.min(12, w.moves.length)}</span></div>
          <ul className="ledger">{moves.map((t) => <MoveRow key={t.id} t={t} />)}</ul>
        </div>
        <p className="fine">
          {live
            ? "MVP TESTNET ONLY: aquí solo se muestra tu wallet Cavos en Stellar Testnet (XLM de prueba, sin valor real). Los pagos aún no están implementados."
            : "Billetera en la red Stellar protegida con passkey. Solo se recarga desde Freighter, Cavos o Privy. Saldos y recargas son simulados en esta demo."}
        </p>
      </div>
    </div>
  );
}

function MoveRow({ t }: { t: WalletMove }) {
  const o = t.type === "out";
  return (
    <li className="lrow">
      <span className={"lico" + (o ? " out" : "")}><Icon name={/^Devolución/.test(t.desc) ? "refund" : o ? "out" : "inn"} /></span>
      <div>
        <b>{t.desc}</b>
        <button className="hash" onClick={() => copyText(t.hash, "Código copiado")}>tx {short(t.hash)}</button>
      </div>
      <div className="lamt">{o ? "− " : "+ "}{xlm(t.amount)}<small>{fdt(t.at)}</small></div>
    </li>
  );
}
