"use client";
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
  const s = useAyni((x) => x.s);
  const { disconnectWallet } = useAyni.getState();
  const open = useUi((u) => u.open);
  const w = s.wallet!;
  const conn = w.conn || {};
  /** modo supabase: saldo y pagos reales en Stellar Testnet (solo Freighter). */
  const live = APP_MODE === "supabase";

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
          <span className="tot">{xlm(w.bal)}</span>
          <span style={{ fontSize: 14, opacity: 0.85 }}>≈ S/ {fmt(w.bal * REF)} · tipo de cambio referencial</span>
          {w.address ? (
            <button className="addr" id="copy-addr" aria-label="Copiar dirección de mi billetera" onClick={() => copyText(w.address, "Dirección copiada")}>
              <Icon name="copy" />{short(w.address)}
            </button>
          ) : (
            <span style={{ fontSize: 14, opacity: 0.85 }}>Aún no conectaste una wallet de Stellar Testnet.</span>
          )}
          {live ? (
            <div className="row">
              {w.address ? (
                <a className="btn btn-on" id="friendbot" href={"https://friendbot.stellar.org/?addr=" + encodeURIComponent(w.address)} target="_blank" rel="noreferrer">
                  <Icon name="plus" />Fondear con Friendbot (Testnet)
                </a>
              ) : (
                <button className="btn btn-on" id="connect-freighter" onClick={() => open({ t: "connect", k: "freighter" })}><Icon name="wallet" />Conectar Freighter</button>
              )}
              {w.address ? <button className="btn btn-line" id="receive" onClick={() => open({ t: "receive" })}><Icon name="inn" />Mi dirección</button> : null}
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-on" id="topup" onClick={() => open({ t: "topup" })}><Icon name="plus" />Recargar desde wallet Stellar</button>
              <button className="btn btn-line" id="receive" onClick={() => open({ t: "receive" })}><Icon name="inn" />Mi dirección</button>
            </div>
          )}
        </section>

        <div className="panel">
          <div className="panel-head"><h2>Wallets conectadas</h2><span className="caption">{connectedWallets(s).length} conectada{connectedWallets(s).length === 1 ? "" : "s"}</span></div>
          <p className="muted" style={{ fontSize: 14 }}>Tu saldo solo se recarga desde una wallet Stellar conectada.</p>
          <ul className="assets" style={{ marginTop: 8 }}>
            {(live ? WALLETS.filter((x) => x.k === "freighter") : WALLETS).map((x) => {
              const on = conn[x.k];
              return (
                <li className="asset" key={x.k}>
                  <span className={"tok " + (x.kind === "emb" ? "tok-usdc" : "tok-xlm")} aria-hidden="true">{x.t[0]}</span>
                  <div>
                    <b>{x.t}{x.k === "freighter" ? <> <span className="gtag tes" style={{ verticalAlign: 2 }}>Recomendada</span></> : null}</b>
                    <small>{x.type} · {on ? "conectada · " + short(on.addr) : x.d}</small>
                  </div>
                  <div>
                    {on ? (
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
              <div className="v">{xlm(w.bal)}</div>
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
            ? "MVP TESTNET ONLY: el saldo es el de tu wallet en Stellar Testnet (XLM de prueba, sin valor real). Los pagos los firmas tú con Freighter y el servidor los verifica antes de registrarlos."
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
