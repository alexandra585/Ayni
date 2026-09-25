"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isMember, isP } from "@/domain/model";
import { JuntaView } from "@/features/fund-group/JuntaView";
import { PanderoView } from "@/features/pandero/PanderoView";
import { useAyni } from "@/store/ayni";

/** /groups/[groupId] — decide entre la vista de fondo común y la de Pandero. */
export function GroupScreen({ id }: { id: string }) {
  const router = useRouter();
  const g = useAyni((x) => x.s.groups[id]);
  const member = isMember(g);
  useEffect(() => {
    if (!member) router.replace("/groups");
  }, [member, router]);
  if (!g || !member) return null;
  return isP(g) ? <PanderoView id={id} /> : <JuntaView id={id} />;
}
