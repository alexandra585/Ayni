"use client";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { buildReport } from "@/domain/actions";
import { filtersFor, isP, mlist, mstatus } from "@/domain/model";
import type { Group, LedgerEntryWithId, MemberFilter, MemberStatus } from "@/domain/types";
import { copyText, saveFile } from "@/lib/clipboard";
import { fdt, short, xlm } from "@/lib/format";

export function downloadReport(g: Group) {
  const r = buildReport(g);
  saveFile(r.filename, r.content, "text/csv;charset=utf-8");
}

/** Insignia de estado de pago (junta y pandero). */
export function StatusBadge({ st, g }: { st: MemberStatus; g?: Group }) {
  if (st === "paid") return <Badge tone="paid" icon="check">{g && isP(g) ? "Aportó" : "Pagó"}</Badge>;
  if (st === "late") return <Badge tone="late" icon="alert">Atrasado</Badge>;
  if (st === "nofunds") return <Badge tone="late" icon="alert">Sin saldo</Badge>;
  if (st === "wait") return <Badge tone="neutral">Inscrito</Badge>;
  return <Badge tone="pending" icon="clock">Pendiente</Badge>;
}

/** Chips de filtro por estado (con contadores). */
export function FilterChips({ g, f, onChange }: { g: Group; f: MemberFilter; onChange: (f: MemberFilter) => void }) {
  const F = filtersFor(g);
  if (!F) return null;
  const ms = mlist(g);
  return (
    <div className="chips" role="group" aria-label="Filtrar por estado de pago">
      {F.map(([key, label]) => {
        const n = key === "all" ? ms.length : ms.filter((m) => mstatus(g, m) === key).length;
        return (
          <button key={key} className="chip" data-f={key} aria-pressed={f === key} onClick={() => onChange(key)}>
            {label} <span className="ct">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Fila del registro completo (ledgerRow del prototipo). */
export function LedgerRow({ t, padded }: { t: LedgerEntryWithId; padded?: boolean }) {
  const o = t.type === "out";
  return (
    <li className="lrow" style={padded ? { paddingInline: 24 } : undefined}>
      <span className={"lico" + (o ? " out" : "")}><Icon name={t.method === "Devolución automática" ? "refund" : o ? "out" : "inn"} /></span>
      <div>
        <b>{t.desc}</b>
        <button className="hash" aria-label="Copiar código de transacción" onClick={() => copyText(t.hash, "Código de transacción copiado")}>
          tx {short(t.hash)} · {t.method || ""}
        </button>
      </div>
      <div className="lamt">{o ? "− " : "+ "}{xlm(t.amount)}<small>{fdt(t.at)}</small></div>
    </li>
  );
}
