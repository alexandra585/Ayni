"use client";
import { useCavos } from "@cavos/kit/react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { connectedWallets, WALLETS } from "@/domain/actions";
import { isP, mstatus, myGroupIds } from "@/domain/model";
import type { WalletMove } from "@/domain/types";
import { copyText } from "@/lib/clipboard";
import { fdt, short, xlm } from "@/lib/format";
import { currentUserId, disconnectWalletRemote, linkCavosWallet, refreshSnapshot } from "@/repositories/supabase";
import { connectFreighter, fetchFreighterBalance } from "@/services/stellar/freighter";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

/** /wallet — Billetera. */
export function WalletScreen() {
  const { isAuthenticated, address, wallet, walletStatus, openModal } = useCavos();
  const linkAttempted = useRef<string | null>(null);
  const [walletLinkError, setWalletLinkError] = useState<string | null>(null);
  const [stroops, setStroops] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const fundingLock = useRef(false);
  const [fundingMessage, setFundingMessage] = useState<string | null>(null);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const balanceGeneration = useRef(0);
  const testnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet";
  const canFund = testnet && !!wallet && !!address?.startsWith("G");
  const s = useAyni((x) => x.s);
  const { disconnectWallet } = useAyni.getState();
  const open = useUi((u) => u.open);
  const w = s.wallet!;
  const conn = w.conn || {};
  const freighterAddress = conn.freighter?.addr;
  const [freighterBalance, setFreighterBalance] = useState<number | null>(null);
  const [freighterBusy, setFreighterBusy] = useState(false);
  const freighterLock = useRef(false);
  const [freighterError, setFreighterError] = useState<string | null>(null);
  /** Modo live: solo se muestra el estado de Cavos. */
  const live = APP_MODE === "supabase";
  useEffect(() => {
    let active = true;
    setFreighterBalance(null);
    setFreighterError(null);
    if (live && testnet && freighterAddress) {
      void fetchFreighterBalance(freighterAddress).then((balance) => {
        if (active) setFreighterBalance(balance);
      }).catch((error: unknown) => {
        if (active) setFreighterError(error instanceof Error ? error.message : "No se pudo leer el saldo de Freighter.");
      });
    }
    return () => { active = false; };
  }, [freighterAddress, live, testnet]);

  async function freighterAction(action: "connect" | "disconnect" | "balance") {
    if (freighterLock.current) return;
    freighterLock.current = true;
    setFreighterBusy(true);
    setFreighterError(null);
    try {
      if (action === "connect") {
        await connectFreighter();
        await refreshSnapshot();
      } else if (action === "disconnect") {
        await disconnectWalletRemote();
      } else if (freighterAddress) {
        setFreighterBalance(await fetchFreighterBalance(freighterAddress));
      }
    } catch (error) {
      setFreighterError(error instanceof Error ? error.message : "No se pudo completar la acción de Freighter.");
    } finally {
      freighterLock.current = false;
      setFreighterBusy(false);
    }
  }
  const cavosStatus = walletStatus.needsDeviceApproval
    ? "Requiere aprobación del dispositivo"
    : walletStatus.isReady
      ? "Lista"
      : walletStatus.isUndeployed
        ? "Sin desplegar"
        : "Conectada";

  useEffect(() => {
    if (!live || !isAuthenticated || !address?.startsWith("G")) return;

    let active = true;
    void currentUserId().then(async (userId) => {
      if (!active) return;
      const attemptKey = `${userId}:${address}`;
      if (linkAttempted.current === attemptKey) return;
      linkAttempted.current = attemptKey;

      const result = await linkCavosWallet(userId, address);
      if (active && result === "conflict") {
        setWalletLinkError("Esta cuenta Ayni ya tiene otra wallet vinculada.");
      }
    }).catch(() => {
      if (active) setWalletLinkError("No se pudo vincular la wallet Cavos con tu cuenta Ayni.");
    });

    return () => {
      active = false;
    };
  }, [address, isAuthenticated, live]);

  useEffect(() => {
    const generation = ++balanceGeneration.current;
    setFundingMessage(null);
    setFundingError(null);
    if (wallet?.chain !== "stellar") {
      setStroops(null);
      setBalanceError(null);
      setBalanceLoading(false);
      return;
    }

    let active = true;
    setStroops(null);
    setBalanceError(null);
    setBalanceLoading(true);
    void wallet.balance().then((value) => {
      if (active) setStroops(value);
    }).catch(() => {
      if (active) setBalanceError("No se pudo leer el saldo XLM.");
    }).finally(() => {
      if (active) setBalanceLoading(false);
    });

    return () => {
      active = false;
      if (balanceGeneration.current === generation) balanceGeneration.current++;
    };
  }, [address, wallet]);

  async function refreshBalance() {
    if (wallet?.chain !== "stellar") return;
    const generation = balanceGeneration.current;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const value = await wallet.balance();
      if (generation === balanceGeneration.current) setStroops(value);
    } catch {
      if (generation === balanceGeneration.current) setBalanceError("No se pudo leer el saldo XLM.");
    } finally {
      if (generation === balanceGeneration.current) setBalanceLoading(false);
    }
  }

  async function fundWallet() {
    if (!canFund || fundingLock.current || walletLinkError) return;
    fundingLock.current = true;
    setFunding(true);
    setFundingMessage(null);
    setFundingError(null);
    const generation = balanceGeneration.current;
    try {
      if (stroops !== null && stroops > 0n) {
        setFundingMessage("La wallet ya está activa en Testnet.");
        await refreshBalance();
        return;
      }
      const response = await fetch("/api/stellar/friendbot", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudo fondear con Friendbot.");
      if (generation !== balanceGeneration.current) return;
      setFundingMessage(result.message);
      await refreshBalance();
    } catch (error) {
      if (generation === balanceGeneration.current) {
        setFundingError(error instanceof Error ? error.message : "No se pudo fondear con Friendbot.");
      }
    } finally {
      fundingLock.current = false;
      setFunding(false);
    }
  }

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
        <section className="wal-hero" aria-label="Estado de wallet Cavos">
          <span className="lbl">Estado de wallet Cavos</span>
          <span className="tot">{isAuthenticated ? cavosStatus : "No conectada"}</span>
          <span style={{ fontSize: 14, opacity: 0.85 }}>{testnet ? "Stellar Testnet · XLM de prueba sin valor real" : "Stellar"}</span>
        </section>

        <div className="panel">
          <div className="panel-head"><h2>Wallets conectadas</h2><span className="caption">{connectedWallets(s).length} conectada{connectedWallets(s).length === 1 ? "" : "s"}</span></div>
          <p className="muted" style={{ fontSize: 14 }}>Estado de conexión de tu wallet Cavos.</p>
          <ul className="assets" style={{ marginTop: 8 }}>
            {(live ? WALLETS.filter((x) => x.k === "cavos") : WALLETS).map((x) => {
              const on = conn[x.k];
              return (
                <li className="asset" key={x.k}>
                  <span className={"tok " + (x.kind === "emb" ? "tok-usdc" : "tok-xlm")} aria-hidden="true">{x.t[0]}</span>
                  <div>
                    <b>{x.t}</b>
                    <small>{live ? "Wallet embebida" : x.type} · {isAuthenticated ? "conectada" : "no conectada"}</small>
                    {live && address ? <small>Dirección Stellar: {address}</small> : null}
                    {live && walletLinkError ? <small className="err" role="alert">{walletLinkError}</small> : null}
                  </div>
                  <div>
                    {live ? (
                      isAuthenticated ? (
                        <span className="caption">{cavosStatus}</span>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={openModal}>Activar wallet</button>
                      )
                    ) : on ? (
                      <button className="btn btn-ghost btn-sm" data-disc={x.k} onClick={() => disconnectWallet(x.k)}>Desconectar</button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" data-conn={x.k} onClick={() => open({ t: "connect", k: x.k })}>Conectar</button>
                    )}
                  </div>
                </li>
              );
            })}
            {live ? <li className="asset">
              <span className="tok tok-xlm" aria-hidden="true">F</span>
              <div>
                <b>Freighter</b>
                <small>Extensión · {freighterAddress ? "conectada" : "no conectada"}</small>
                {freighterAddress ? <>
                  <small style={{ overflowWrap: "anywhere" }}>Dirección Stellar: {freighterAddress}</small>
                  <small>Saldo Testnet: {freighterBalance === null ? "— XLM" : xlm(freighterBalance)}</small>
                </> : null}
                {freighterError ? <small className="err" role="alert">{freighterError}</small> : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {freighterAddress ? <>
                  <button className="btn btn-ghost btn-sm" disabled={freighterBusy || !testnet} onClick={() => void freighterAction("balance")}>Refrescar saldo</button>
                  <button className="btn btn-ghost btn-sm" disabled={freighterBusy} onClick={() => void freighterAction("disconnect")}>Desconectar</button>
                </> : <button className="btn btn-secondary btn-sm" disabled={freighterBusy || !testnet} onClick={() => void freighterAction("connect")}>
                  {freighterBusy ? "Conectando..." : "Conectar Freighter"}
                </button>}
              </div>
            </li> : null}
          </ul>
        </div>

        {pend.length ? (
          <div className="warn" style={{ margin: 0 }}>
            <span>Tienes {pend.length} aporte{pend.length > 1 ? "s" : ""} de pandero sin cobrar ({xlm(need)}). Al recargar se cobra{pend.length > 1 ? "n" : ""} automáticamente.</span>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-head"><h2>Moneda</h2></div>
          {canFund || (isAuthenticated && wallet?.chain === "stellar") ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {canFund ? <button className="btn btn-secondary btn-sm" disabled={funding || !!walletLinkError} onClick={fundWallet}>
                {funding ? "Fondeando..." : "+ Fondear 10,000 XLM de prueba"}
              </button> : null}
              <button className="btn btn-ghost btn-sm" disabled={balanceLoading || funding} onClick={refreshBalance}>Refrescar saldo</button>
            </div>
          ) : null}
          {fundingMessage ? <p className="muted" role="status">{fundingMessage}</p> : null}
          {fundingError ? <p className="err" role="alert">{fundingError}</p> : null}
          <ul className="assets">
            <li className="asset">
              <span className="tok tok-xlm" aria-hidden="true">✦</span>
              <div>
                <b>Stellar Lumens (XLM)</b>
                <small>Ayni opera solo con XLM: cuotas, aportes, pozos y devoluciones. Las comisiones de red las cubre Ayni.</small>
              </div>
              <div className="v" role={balanceError ? "alert" : undefined}>
                {balanceError ?? (balanceLoading ? "Cargando…" : stroops === null ? "— XLM" : xlm(Number(stroops) / 10_000_000))}
              </div>
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
