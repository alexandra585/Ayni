"use client";
import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Diálogo modal (equivale a openSheet/closeOverlay del prototipo). Cierra con Esc o clic en el fondo. El foco lo gestiona ModalHost. */
export function Sheet({ children, wide, onClose }: { children: ReactNode; wide?: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" id="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"sheet" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby="sh-t">
        {children}
      </div>
    </div>
  );
}

export function SheetHead({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return (
    <div className="panel-head" style={{ margin: 0 }}>
      <h3 id="sh-t">{title}</h3>
      <button className="btn btn-ghost btn-sm" id="sh-x" aria-label="Cerrar" onClick={onClose} type="button">
        <Icon name="x" />
      </button>
    </div>
  );
}
