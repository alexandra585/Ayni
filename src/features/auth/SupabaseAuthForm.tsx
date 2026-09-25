"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { EMAIL } from "@/domain/validation";
import { signInSupabase, signUpSupabase } from "./supabase-auth";

/** Acceso real con Supabase Auth (correo + contraseña). Reutiliza el diseño del onboarding del prototipo. */
export function SupabaseAuthForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    setInfo("");
    if (mode === "signup" && name.length < 3) return setErr("Escribe tu nombre para que tu grupo te reconozca.");
    if (!EMAIL.test(email)) return setErr("Escribe un correo válido, por ejemplo nombre@correo.com.");
    if (password.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    setErr("");
    setBusy(true);
    const r =
      mode === "signup"
        ? await signUpSupabase({ email, password, name, phone: String(f.get("phone") ?? "").trim(), address: String(f.get("address") ?? "").trim() })
        : await signInSupabase({ email, password });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    if ("needsConfirmation" in r && r.needsConfirmation) return setInfo("Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.");
    // el efecto de LoginScreen redirige cuando el estado ya tiene al usuario
  };

  return (
    <div className="panel onb">
      <p className="eyebrow">Tu cuenta Ayni</p>
      <h1>{mode === "signin" ? "Entra a tu cuenta" : "Crea tu cuenta"}</h1>
      <p className="muted">Modo conectado: tu cuenta y tus grupos viven en Supabase; los pagos son en Stellar Testnet (sin dinero real).</p>
      <form id="onb" noValidate onSubmit={onSubmit} style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {mode === "signup" ? (
          <div className="field">
            <label htmlFor="o-name">Nombre y apellido</label>
            <input id="o-name" name="name" autoComplete="name" maxLength={40} placeholder="Rosa Quispe" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="o-mail">Correo electrónico</label>
          <input id="o-mail" name="email" type="email" autoComplete="email" maxLength={80} placeholder="rosa.quispe@correo.com" />
        </div>
        <div className="field">
          <label htmlFor="o-pass">Contraseña</label>
          <input id="o-pass" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} />
          <span className="hint">Mínimo 8 caracteres.</span>
        </div>
        {mode === "signup" ? (
          <>
            <div className="field">
              <label htmlFor="o-phone">Celular</label>
              <input id="o-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={15} placeholder="987 654 321" />
            </div>
            <div className="field">
              <label htmlFor="o-addr">Dirección</label>
              <input id="o-addr" name="address" autoComplete="street-address" maxLength={100} placeholder="Jr. Los Olivos 245, San Martín de Porres" />
            </div>
          </>
        ) : null}
        {err ? <p className="err" id="o-err" role="alert">{err}</p> : null}
        {info ? <p className="infobox" role="status">{info}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          <Icon name="finger" />
          {busy ? "Un momento…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); setInfo(""); }}>
          {mode === "signin" ? "No tengo cuenta: crear una" : "Ya tengo cuenta: entrar"}
        </button>
      </form>
    </div>
  );
}
