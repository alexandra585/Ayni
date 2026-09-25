"use client";
import { useEffect, useRef } from "react";
import { useUi } from "@/store/ui";
import { ArchivedModal, LedgerModal, NotifsModal, TermsModal } from "./MiscModals";
import { PayModal } from "./PayModal";
import { ConfirmDisposeModal, DisposeModal, GoalModal, RecalcModal, RemoveModal, SettingsModal } from "./TreasurerModals";
import { ConnectModal, ReceiveModal, TopupModal, TopupRunModal } from "./WalletModals";

/** Renderiza el diálogo activo y gestiona el foco (equivale a openSheet/closeOverlay del prototipo). */
export function ModalHost() {
  const modal = useUi((u) => u.modal);
  const last = useRef<Element | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (modal && !wasOpen.current) last.current = document.activeElement;
    if (!modal && wasOpen.current) {
      const el = last.current as HTMLElement | null;
      if (el && document.body.contains(el)) el.focus();
    }
    wasOpen.current = !!modal;
  }, [modal]);

  if (!modal) return <div id="overlay" />;
  let body: React.ReactNode = null;
  switch (modal.t) {
    case "notifs": body = <NotifsModal />; break;
    case "ledger": body = <LedgerModal id={modal.id} />; break;
    case "pay": body = <PayModal key={modal.gid} gid={modal.gid} />; break;
    case "dispose": body = <DisposeModal id={modal.id} />; break;
    case "confirmDispose": body = <ConfirmDisposeModal id={modal.id} to={modal.to} />; break;
    case "settings": body = <SettingsModal id={modal.id} />; break;
    case "goal": body = <GoalModal id={modal.id} />; break;
    case "remove": body = <RemoveModal id={modal.id} mid={modal.mid} />; break;
    case "recalc": body = <RecalcModal id={modal.id} ch={modal.ch} />; break;
    case "terms": body = <TermsModal id={modal.id} readOnly={modal.readOnly} />; break;
    case "archived": body = <ArchivedModal id={modal.id} />; break;
    case "receive": body = <ReceiveModal />; break;
    case "connect": body = <ConnectModal key={modal.k} k={modal.k} after={modal.after} />; break;
    case "topup": body = <TopupModal ctx={modal.ctx} />; break;
    case "topupRun": body = <TopupRunModal k={modal.k} amt={modal.amt} ctx={modal.ctx} />; break;
  }
  return <div id="overlay">{body}</div>;
}
