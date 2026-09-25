"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { isAdmin, isMember, isP, KIND, mstatus, myGroupIds, owed, groupIds } from "@/domain/model";
import { validateProfile } from "@/domain/validation";
import { StatusBadge } from "@/features/ledger/shared";
import { useSession } from "@/features/auth/useSession";
import { copyText } from "@/lib/clipboard";
import { fdate, fdt, fmt, initials, REF, short, xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";

/** /profile — Perfil (orden y contenido del prototipo). */
export function ProfileScreen() {
  const router = useRouter();
  const s = useAyni((x) => x.s);
  const updateProfile = useAyni((x) => x.updateProfile);
  const open = useUi((u) => u.open);
  const { signOut } = useSession();
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const mailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addrRef = useRef<HTMLInputElement>(null);
  const me = s.me!;
  const w = s.wallet!;

  const ids = myGroupIds(s);
  let paidCount = 0, total = 0, admins = 0, pands = 0;
  ids.forEach((id) => {
    const g = s.groups[id], m = g.members.me;
    if (isP(g)) { pands++; total += (m.paidRound || 0) * g.cuota; paidCount += m.paidRound || 0; }
    else { if (m.paid > 0) { paidCount++; total += m.paid; } if (isAdmin(g)) admins++; }
  });
  const arc = groupIds(s).filter((k) => s.groups[k].archived && isMember(s.groups[k]));

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    const r = validateProfile({ name: nameRef.current!.value, email: mailRef.current!.value, phone: phoneRef.current!.value, address: addrRef.current!.value });
    if (!r.ok) {
      setErr(r.error);
      if (r.field === "email") mailRef.current?.focus();
      return;
    }
    await updateProfile({ name: r.data.name, email: r.data.email, phone: r.data.phone, address: r.data.address });
    setEdit(false);
    setErr("");
  };

  return (
    <div className="prof">
      <div className="main">
        <div className="panel">
          <div className="pcard">
            <span className="avatar-lg" aria-hidden="true">{initials(me.name)}</span>
            <div>
              <h1>{me.name}</h1>
              <p className="caption">{ids.length} grupos · tesorero en {admins}</p>
            </div>
            {edit ? null : <button className="btn btn-secondary btn-sm" id="p-edit" onClick={() => { setEdit(true); setTimeout(() => nameRef.current?.focus(), 0); }}>Editar perfil</button>}
          </div>
          {edit ? (
            <form id="pf" noValidate onSubmit={onSave} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div className="field"><label htmlFor="p-name">Nombre y apellido</label><input id="p-name" ref={nameRef} defaultValue={me.name} maxLength={40} /></div>
              <div className="field"><label htmlFor="p-mail">Correo electrónico</label><input id="p-mail" ref={mailRef} type="email" defaultValue={me.email} maxLength={80} /></div>
              <div className="field"><label htmlFor="p-phone">Celular</label><input id="p-phone" ref={phoneRef} type="tel" defaultValue={me.phone} maxLength={15} /></div>
              <div className="field"><label htmlFor="p-addr">Dirección</label><input id="p-addr" ref={addrRef} defaultValue={me.address} maxLength={100} /></div>
              {err ? <p className="err" id="p-err" role="alert">{err}</p> : null}
              <div className="row">
                <button className="btn btn-primary" type="submit">Guardar cambios</button>
                <button className="btn btn-ghost" type="button" id="p-cancel" onClick={() => { setEdit(false); setErr(""); }}>Cancelar</button>
              </div>
            </form>
          ) : (
            <dl className="kv" style={{ marginTop: 16 }}>
              <div><dt>Correo</dt><dd>{me.email}</dd></div>
              <div><dt>Celular</dt><dd>{me.phone || "Sin registrar"}</dd></div>
              <div><dt>Dirección</dt><dd>{me.address || "Sin registrar"}</dd></div>
              <div><dt>Miembro desde</dt><dd>{fdate(me.since)}</dd></div>
            </dl>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Mi código de usuario</h2></div>
          <div className="codebox">
            <div>
              <p className="uc">{me.code}</p>
              <p className="caption">Compártelo con un tesorero para que te agregue a un grupo con ingreso cerrado.</p>
            </div>
            <button className="btn btn-secondary btn-sm" id="p-code" onClick={() => copyText(me.code, "Código de usuario copiado")}><Icon name="copy" />Copiar</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Seguridad</h2></div>
          <dl className="kv">
            <div><dt>Acceso</dt><dd><Badge tone="paid" icon="finger">Passkey activa</Badge></dd></div>
            <div><dt>Dirección Stellar</dt><dd><button className="hash" id="p-addr-copy" onClick={() => copyText(w.address, "Dirección copiada")}>{short(w.address)} · copiar</button></dd></div>
            <div><dt>Frase secreta</dt><dd>No necesitas una</dd></div>
          </dl>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Billetera</h2><button className="btn btn-ghost btn-sm" id="p-wallet" onClick={() => router.push("/wallet")}>Abrir billetera</button></div>
          <p className="vault-amount" style={{ marginTop: 0 }}>{xlm(w.bal)}</p>
          <p className="caption">Stellar Lumens · ≈ S/ {fmt(w.bal * REF)} referencial</p>
          <button className="btn btn-accent btn-sm" style={{ marginTop: 12 }} id="p-topup" onClick={() => open({ t: "topup" })}><Icon name="plus" />Recargar</button>
        </div>

        <button className="btn btn-ghost" id="p-out" onClick={signOut}>Cerrar sesión (reinicia la demo)</button>
      </div>

      <div className="main">
        <div className="stats">
          <div className="stat"><b>{ids.length - pands}</b><span>Juntas</span></div>
          <div className="stat"><b>{pands}</b><span>Panderos</span></div>
          <div className="stat"><b>{paidCount}</b><span>Pagos hechos</span></div>
          <div className="stat"><b>{fmt(total, 0)}</b><span>XLM aportados</span></div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Mis grupos</h2><button className="btn btn-ghost btn-sm" id="p-groups" onClick={() => router.push("/groups")}>Ir a grupos</button></div>
          <ul className="members">
            {ids.length ? ids.map((id) => {
              const g = s.groups[id];
              const st = mstatus(g, g.members.me);
              const role = isP(g) ? (g.creator === "me" ? "Creaste el pandero" : "Participante") : isAdmin(g) ? "Tesorero" : "Participante";
              const canPay = !isP(g) && g.status !== "liberado" && owed(g, g.members.me) > 0;
              return (
                <li className="member" key={id}>
                  <span className="avatar" aria-hidden="true"><Icon name={KIND[g.kind].ico} /></span>
                  <div className="m-main">
                    <b>{g.name}</b>
                    <small>{role} · {isP(g) ? (g.visibility === "publico" ? "Pandero público" : "Pandero privado · " + g.code) : "código " + g.code}</small>
                  </div>
                  <div className="m-end">
                    {!isP(g) && g.status === "liberado" ? <Badge tone="neutral">Cerrado</Badge> : <StatusBadge st={st} g={g} />}
                    {canPay
                      ? <button className="btn btn-primary btn-sm" data-pp={id} onClick={() => open({ t: "pay", gid: id })}>Pagar</button>
                      : <button className="btn btn-ghost btn-sm" data-og={id} onClick={() => router.push("/groups/" + id)}>Ver</button>}
                  </div>
                </li>
              );
            }) : <li className="member"><p className="caption">Aún no estás en ningún grupo.</p></li>}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Archivados</h2><span className="caption">{arc.length}</span></div>
          {arc.length ? (
            <ul className="members">
              {arc.map((k) => {
                const g = s.groups[k];
                return (
                  <li className="member" key={k}>
                    <span className="avatar" aria-hidden="true"><Icon name={KIND[g.kind].ico} /></span>
                    <div className="m-main">
                      <b>{g.name}</b>
                      <small>
                        {isP(g) ? "Pandero " + (g.visibility === "publico" ? "público" : "privado") : ("nature" in g && g.nature ? g.nature : KIND[g.kind].label) + " · " + (isAdmin(g) ? "Tesorero" : "Participante")} · archivado el {fdate(g.archivedAt)}
                      </small>
                    </div>
                    <div className="m-end"><button className="btn btn-ghost btn-sm" data-arc={k} onClick={() => open({ t: "archived", id: k })}>Ver resumen</button></div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="caption">Los grupos que se archiven al terminar aparecerán aquí.</p>}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Actividad reciente</h2><button className="btn btn-ghost btn-sm" id="p-notifs" onClick={() => open({ t: "notifs" })}><Icon name="bell" />Notificaciones</button></div>
          <ul className="ledger">
            {w.moves.slice(0, 5).map((t) => {
              const o = t.type === "out";
              return (
                <li className="lrow" key={t.id}>
                  <span className={"lico" + (o ? " out" : "")}><Icon name={o ? "out" : "inn"} /></span>
                  <div><b>{t.desc}</b><span className="caption">{fdt(t.at)}</span></div>
                  <div className="lamt">{o ? "− " : "+ "}{xlm(t.amount)}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
