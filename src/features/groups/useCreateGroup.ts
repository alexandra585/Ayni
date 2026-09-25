"use client";
import { useCallback } from "react";
import type { WizardData } from "@/domain/types";
import { useAyni } from "@/store/ayni";

/** Crea un grupo (demo: en memoria · supabase: RPC `create_group`). Devuelve el id del grupo. */
export function useCreateGroup() {
  return useCallback(async (w: WizardData): Promise<string> => {
    const { APP_MODE } = await import("@/config/app");
    if (APP_MODE === "supabase") {
      const { createGroupRemote } = await import("@/repositories/supabase");
      return createGroupRemote(w);
    }
    return useAyni.getState().createGroup(w);
  }, []);
}
