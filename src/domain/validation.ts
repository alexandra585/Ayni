/** Validación de formularios con Zod. Los mensajes son los del prototipo. */
import { z } from "zod";
import type { WizardData } from "./types";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[0-9 +]{6,15}$/;

type Result<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

function run<S extends z.ZodTypeAny>(schema: S, input: unknown): Result<z.infer<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[r.error.issues.length - 1];
  return { ok: false, error: issue.message, field: issue.path[0] ? String(issue.path[0]) : undefined };
}

/** Devuelve el PRIMER problema (como el prototipo: valida en orden y se detiene). */
function first<S extends z.ZodTypeAny>(schema: S, input: unknown): Result<z.infer<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: issue.message, field: issue.path[0] ? String(issue.path[0]) : undefined };
}

/* ---- Onboarding y perfil ---- */
const person = (msgs: { name: string; mail: string }) =>
  z.object({
    name: z.string().trim().min(3, msgs.name),
    email: z.string().trim().regex(EMAIL, msgs.mail),
    phone: z.string().trim().refine((v) => !v || PHONE.test(v), "El celular solo puede tener números."),
    address: z.string().trim().default(""),
  });

export const onboardingSchema = person({
  name: "Escribe tu nombre para que tu grupo te reconozca.",
  mail: "Escribe un correo válido, por ejemplo nombre@correo.com.",
});
export const profileSchema = person({ name: "Escribe tu nombre.", mail: "Escribe un correo válido." });
export const validateOnboarding = (i: unknown) => first(onboardingSchema, i);
export const validateProfile = (i: unknown) => first(profileSchema, i);

/* ---- Unirse / agregar por código ---- */
export const emailSchema = z.string().trim().regex(EMAIL, "Escribe un correo válido.");
export const validateEmail = (v: string) => first(emailSchema, v);

/* ---- Monto ---- */
export function validateGoal(v: string): { ok: boolean; value: number } {
  const n = parseFloat(v);
  return { ok: n > 0 && n <= 1_000_000, value: n };
}
export const topupSchema = z
  .number()
  .refine((a) => a >= 1, "Ingresa al menos 1 XLM.")
  .refine((a) => a <= 100_000, "En la demo el máximo por recarga es 100,000 XLM.");
export const validateTopup = (a: number) => first(topupSchema, a);

/* ---- Wizard "Crear nuevo grupo" ---- */
/** Errores en el mismo orden del prototipo; si varios aplican, gana el último (igual que el original). */
export function validateWizardStep(w: WizardData): string {
  const P = w.kind === "pandero", n = parseInt(w.capacity, 10), st = w.step;
  const schema = z.object({}).superRefine((_, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (st === 0 && !w.name.trim()) bad("Ponle un nombre al grupo para que los miembros lo reconozcan.");
    if (P && st === 1 && !(parseFloat(w.cuota) > 0)) bad("El aporte debe ser mayor a cero.");
    if (P && st === 1 && !(n >= 2 && n <= 50)) bad("Un pandero debe tener entre 2 y 50 participantes.");
    if (P && st === 2 && !w.accept) bad("Debes aceptar los términos para crear el pandero.");
    if (!P && st === 1 && !w.nature) bad("Elige la naturaleza del grupo.");
    if (!P && st === 1 && !(parseFloat(w.goal) > 0)) bad("El monto objetivo debe ser mayor a cero.");
    if (!P && st === 1 && !w.dueDate) bad("Elige la fecha límite de pago.");
    if (!P && st === 2 && w.rule === "fecha" && !w.releaseDate) bad("Elige la fecha de cierre.");
    if (!P && st === 3 && !(n >= 2 && n <= 200)) bad("El grupo debe tener entre 2 y 200 participantes.");
  });
  const r = run(schema, {});
  return r.ok ? "" : r.error;
}
