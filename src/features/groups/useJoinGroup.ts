"use client";
import { useCallback } from "react";
import type { JoinResult } from "@/domain/actions";
import { useAyni } from "@/store/ayni";

/**
 * Unirse por código. En modo demo usa el dominio en memoria; en modo supabase
 * llama a la RPC `join_group_by_code` (ver repositories/supabase.ts) y refresca el estado.
 */
export function useJoinGroup() {
  return useCallback(async (code: string): Promise<JoinResult> => {
    const { APP_MODE } = await import("@/config/app");
    if (APP_MODE === "supabase") {
      const { joinGroupByCode } = await import("@/repositories/supabase");
      return joinGroupByCode(code);
    }
    return useAyni.getState().joinByCode(code);
  }, []);
}

/** Unirse a un pandero tras aceptar los términos (demo: dominio · supabase: RPC `join_pandero`). */
export function useJoinPandero() {
  return useCallback(async (id: string): Promise<boolean> => {
    const { APP_MODE } = await import("@/config/app");
    if (APP_MODE === "supabase") {
      const { joinPanderoRemote } = await import("@/repositories/supabase");
      return joinPanderoRemote(id);
    }
    return useAyni.getState().joinPandero(id);
  }, []);
}
