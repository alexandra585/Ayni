"use client";
import { getSupabase } from "@/lib/supabase/client";
import { refreshSnapshot } from "@/repositories/supabase";

export interface AuthInput { email: string; password: string; name?: string; phone?: string; address?: string }

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "User already registered": "Ese correo ya tiene una cuenta. Inicia sesión.",
  "Email not confirmed": "Confirma tu correo antes de entrar (revisa tu bandeja).",
};
const human = (m: string) => MESSAGES[m] ?? m;

export async function signInSupabase({ email, password }: AuthInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: human(error.message) };
  await refreshSnapshot();
  return { ok: true };
}

export async function signUpSupabase({ email, password, name, phone, address }: AuthInput): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }> {
  const { data, error } = await getSupabase().auth.signUp({ email, password, options: { data: { name, phone, address } } });
  if (error) return { ok: false, error: human(error.message) };
  if (!data.session) return { ok: true, needsConfirmation: true }; // proyecto con confirmación de correo activada
  await refreshSnapshot();
  return { ok: true, needsConfirmation: false };
}

export async function signOutSupabase(): Promise<void> {
  await getSupabase().auth.signOut();
}
