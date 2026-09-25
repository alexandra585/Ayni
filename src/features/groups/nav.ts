"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { myGroupIds } from "@/domain/model";
import { useAyni } from "@/store/ayni";

/** Archiva un grupo y, como el prototipo, pasa al primer grupo activo que quede (o a la lista). */
export function useArchiveAndGo(id: string) {
  const router = useRouter();
  return useCallback(async () => {
    await useAyni.getState().archive(id);
    const mine = myGroupIds(useAyni.getState().s);
    router.push(mine.length ? "/groups/" + mine[0] : "/groups");
  }, [id, router]);
}
