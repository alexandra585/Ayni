import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGroupFromWizard, newWizard, wizSteps } from "@/domain/actions";
import { cuotaOf } from "@/domain/model";
import type { JuntaGroup, PanderoGroup } from "@/domain/types";
import { validateWizardStep } from "@/domain/validation";
import { freezeEnv, makeCtx } from "../helpers";

let restore: () => void;
beforeEach(() => { restore = freezeEnv(); });
afterEach(() => restore());

describe("wizard Crear nuevo grupo", () => {
  it("tiene 4 pasos para fondo común y 3 para pandero", () => {
    expect(wizSteps({ kind: "junta" })).toBe(4);
    expect(wizSteps({ kind: "pandero" })).toBe(3);
  });

  it("paso 1: exige nombre", () => {
    const w = newWizard();
    expect(validateWizardStep(w)).toContain("Ponle un nombre");
    expect(validateWizardStep({ ...w, name: "Fondo del edificio" })).toBe("");
  });

  it("fondo común: valida monto, fecha, cierre y número de participantes", () => {
    const base = { ...newWizard(), name: "X" };
    expect(validateWizardStep({ ...base, step: 1, goal: "0" })).toContain("mayor a cero");
    expect(validateWizardStep({ ...base, step: 1, dueDate: "" })).toContain("fecha límite");
    expect(validateWizardStep({ ...base, step: 2, rule: "fecha", releaseDate: "" })).toContain("fecha de cierre");
    expect(validateWizardStep({ ...base, step: 2, rule: "meta", releaseDate: "" })).toBe("");
    expect(validateWizardStep({ ...base, step: 3, capacity: "1" })).toContain("entre 2 y 200");
    expect(validateWizardStep({ ...base, step: 3, capacity: "201" })).toContain("entre 2 y 200");
    expect(validateWizardStep({ ...base, step: 3, capacity: "24" })).toBe("");
  });

  it("pandero: valida aporte, 2–50 participantes y aceptación de términos", () => {
    const base = { ...newWizard("pandero"), name: "P" };
    expect(validateWizardStep({ ...base, step: 1, cuota: "0", capacity: "10" })).toContain("aporte");
    expect(validateWizardStep({ ...base, step: 1, cuota: "100", capacity: "51" })).toContain("entre 2 y 50");
    expect(validateWizardStep({ ...base, step: 2, accept: false })).toContain("aceptar los términos");
    expect(validateWizardStep({ ...base, step: 2, accept: true })).toBe("");
  });

  it("crea un fondo común: el creador es tesorero, cuota = meta / cupos, con código AYNI-XXXX", () => {
    const ctx = makeCtx();
    const id = createGroupFromWizard(ctx, { ...newWizard(), name: "Fondo del edificio", goal: "1200", capacity: "24", nature: "Condominios pequeños" });
    const g = ctx.s.groups[id] as JuntaGroup;
    expect(g.creator).toBe("me");
    expect(g.nature).toBe("Condominios pequeños");
    expect(cuotaOf(g)).toBe(50);
    expect(g.code).toMatch(/^AYNI-[A-Z0-9]{4}$/);
    expect(g.members.me).toBeDefined();
    expect(Object.keys(g.members)).toHaveLength(1);
  });

  it("crea un pandero público sin código y uno privado con código", () => {
    const ctx = makeCtx();
    const pub = ctx.s.groups[createGroupFromWizard(ctx, { ...newWizard("pandero"), name: "P", cuota: "200", capacity: "10", visibility: "publico" })] as PanderoGroup;
    const priv = ctx.s.groups[createGroupFromWizard(ctx, { ...newWizard("pandero"), name: "Q", cuota: "200", capacity: "10", visibility: "privado" })] as PanderoGroup;
    expect(pub.code).toBeNull();
    expect(priv.code).toMatch(/^AYNI-/);
    expect(pub.phase).toBe("reclutando");
  });

  it("con regla 'meta' la fecha de cierre es la fecha límite de pago", () => {
    const ctx = makeCtx();
    const w = { ...newWizard(), name: "M", capacity: "5", rule: "meta" as const, dueDate: "2026-12-01", releaseDate: "2027-01-01" };
    const g = ctx.s.groups[createGroupFromWizard(ctx, w)] as JuntaGroup;
    expect(g.releaseDate).toBe("2026-12-01");
  });
});
