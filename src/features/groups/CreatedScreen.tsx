"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cuotaOf, inviteText, isP } from "@/domain/model";
import { copyText } from "@/lib/clipboard";
import { xlm } from "@/lib/format";
import { useAyni } from "@/store/ayni";

/** /groups/[id]/created — confirmación tras crear un grupo. */
export function CreatedScreen({ id }: { id: string }) {
  const router = useRouter();
  const g = useAyni((x) => x.s.groups[id]);
  useEffect(() => {
    if (!g) router.replace("/groups");
  }, [g, router]);
  if (!g) return null;
  const P = isP(g);
  return (
    <div className="panel wiz" style={{ textAlign: "center" }}>
      <Badge tone="locked" icon="lock">Reglas bloqueadas</Badge>
      <h2 style={{ fontSize: 28, lineHeight: "34px", marginTop: 12 }}>
        {P ? "Tu pandero está " + (g.visibility === "publico" ? "publicado" : "listo") : "Tu grupo está listo"}
      </h2>
      <p className="muted" style={{ marginTop: 8 }}>
        {P
          ? (g.visibility === "publico"
              ? "Ya aparece en el foro de panderos. Los panderos públicos no tienen código: cualquiera se une desde el foro."
              : "Es privado: no aparece en el foro y solo entra quien tenga este código.") +
            " El juego empieza un mes después de completar los " + g.capacity + " participantes."
          : "Comparte este código. Cada participante se une desde su celular y paga su propia cuota de " + xlm(cuotaOf(g)) + "."}
      </p>
      {g.code ? (
        <p className="code-lg">{g.code}</p>
      ) : (
        <p className="code-lg" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0, fontSize: 22 }}>Publicado en el foro</p>
      )}
      <p className="caption">1 de {g.capacity} lugares ocupados · tú ya estás dentro</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        {g.code ? (
          <button className="btn btn-primary" id="c-copy" autoFocus onClick={() => copyText(inviteText(g), "Invitación copiada")}><Icon name="copy" />Copiar invitación</button>
        ) : null}
        <button className="btn btn-secondary" id="c-go" autoFocus={!g.code} onClick={() => router.push("/groups/" + id)}>Ir al grupo</button>
        {P && g.visibility === "publico" ? <button className="btn btn-ghost" id="c-forum" onClick={() => router.push("/forum")}>Ver en el foro</button> : null}
      </div>
    </div>
  );
}
