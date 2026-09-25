"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LandingNav } from "@/components/layout/LandingNav";
import { Icon } from "@/components/ui/Icon";
import { APP_MODE } from "@/config/app";
import { validateOnboarding } from "@/domain/validation";
import { useAyni } from "@/store/ayni";
import { SupabaseAuthForm } from "./SupabaseAuthForm";

/** Destino tras iniciar sesión: solo rutas internas (evita open-redirect). */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/groups";
}

export function LoginScreen() {
  const router = useRouter();
  const me = useAyni((s) => s.s.me);
  useEffect(() => {
    if (me) router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, [me, router]);

  return (
    <>
      <LandingNav />
      <main id="app" data-auth="false">
        <div className="portal-shell">
          <section className="portal-content">
            <div id="view">{APP_MODE === "supabase" ? <SupabaseAuthForm /> : <Onboarding />}</div>
          </section>
        </div>
      </main>
    </>
  );
}

/** Crear cuenta (demo): el registro de la passkey es simulado. */
function Onboarding() {
  const router = useRouter();
  const signUp = useAyni((s) => s.signUp);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateOnboarding({
      name: nameRef.current!.value,
      email: emailRef.current!.value,
      phone: phoneRef.current!.value,
      address: addressRef.current!.value,
    });
    if (!r.ok) {
      setErr(r.error);
      const f = r.field === "email" ? emailRef : r.field === "phone" ? phoneRef : nameRef;
      f.current?.focus();
      return;
    }
    setErr("");
    signUp({ name: r.data.name, email: r.data.email, phone: r.data.phone, address: r.data.address });
    router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
  };

  return (
    <div className="panel onb">
      <p className="eyebrow">Tu cuenta Ayni</p>
      <h1>Crea tu cuenta</h1>
      <p className="muted">Tu cuenta se protege con la huella o Face ID de tu celular. No hay contraseñas ni frases secretas.</p>
      <form id="onb" noValidate onSubmit={onSubmit} style={{ display: "grid", gap: 16, marginTop: 20 }}>
        <div className="field">
          <label htmlFor="o-name">Nombre y apellido</label>
          <input id="o-name" ref={nameRef} autoComplete="name" maxLength={40} placeholder="Rosa Quispe" />
        </div>
        <div className="field">
          <label htmlFor="o-mail">Correo electrónico</label>
          <input id="o-mail" ref={emailRef} type="email" autoComplete="email" maxLength={80} placeholder="rosa.quispe@correo.com" />
          <span className="hint">Para avisos de tu cuenta y recuperar el acceso.</span>
        </div>
        <div className="field">
          <label htmlFor="o-phone">Celular</label>
          <input id="o-phone" ref={phoneRef} type="tel" inputMode="tel" autoComplete="tel" maxLength={15} placeholder="987 654 321" />
          <span className="hint">Para recibir los recordatorios del grupo por WhatsApp.</span>
        </div>
        <div className="field">
          <label htmlFor="o-addr">Dirección</label>
          <input id="o-addr" ref={addressRef} autoComplete="street-address" maxLength={100} placeholder="Jr. Los Olivos 245, San Martín de Porres" />
        </div>
        {err ? <p className="err" id="o-err" role="alert">{err}</p> : null}
        <button className="btn btn-primary btn-block" type="submit">
          <Icon name="finger" />
          Crear cuenta con mi huella
        </button>
        <p className="caption">Demo: el registro de la passkey es simulado.</p>
      </form>
    </div>
  );
}
