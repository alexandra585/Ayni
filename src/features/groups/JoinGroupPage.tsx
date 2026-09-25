"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { APP_MODE } from "@/config/app";
import { useJoinGroup } from "@/features/groups/useJoinGroup";
import { useUi } from "@/store/ui";

/** /groups/join — Unirme a un grupo con código AYNI-XXXX (9 caracteres, incluido el guion). */
export function JoinGroupPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const join = useJoinGroup();
  const toast = useUi((u) => u.toast);
  const open = useUi((u) => u.open);
  useEffect(() => input.current?.focus(), []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await join(input.current!.value);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      input.current?.focus();
      return;
    }
    setErr("");
    if (r.kind === "already") { toast("Ya eres parte de este grupo"); router.push("/groups/" + r.id); }
    else if (r.kind === "needs-terms") open({ t: "terms", id: r.id });
    else router.push("/groups/" + r.id);
  };

  return (
    <div className="groups-page join-page">
      <div className="groups-page-head">
        <div>
          <span className="flow-chip">Grupos</span>
          <h1>Unirme a un grupo</h1>
          <p>Ingresa el código completo que te compartió la persona que creó el grupo.</p>
        </div>
        <button className="btn btn-ghost" id="join-back" onClick={() => router.push("/groups")}>Volver a mis grupos</button>
      </div>
      <div className="panel">
        <h2>Código de invitación</h2>
        <form className="join-form" id="join" noValidate onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="j-code">Código del grupo</label>
            <div className="row">
              <input id="j-code" ref={input} maxLength={9} placeholder="AYNI-XXXX" autoComplete="off" aria-describedby="join-help" />
              <button className="btn btn-primary" type="submit" disabled={busy}>Unirme</button>
            </div>
            <span className="hint" id="join-help">El código tiene 9 caracteres, incluido el guion: AYNI-XXXX.</span>
          </div>
          {err ? <p className="err" id="j-err" role="alert">{err}</p> : null}
        </form>
        {APP_MODE === "demo" ? (
          <div className="join-demo">
            <p className="caption">Códigos para probar en esta demo:</p>
            <p className="caption" style={{ marginTop: 7 }}>
              <button type="button" className="hash" data-try="AYNI-5B32" onClick={() => { input.current!.value = "AYNI-5B32"; input.current!.focus(); }}>AYNI-5B32</button> · junta abierta &nbsp;{" "}
              <button type="button" className="hash" data-try="AYNI-C7LM" onClick={() => { input.current!.value = "AYNI-C7LM"; input.current!.focus(); }}>AYNI-C7LM</button> · ingreso cerrado &nbsp;{" "}
              <button type="button" className="hash" data-try="AYNI-P8RV" onClick={() => { input.current!.value = "AYNI-P8RV"; input.current!.focus(); }}>AYNI-P8RV</button> · pandero privado
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
