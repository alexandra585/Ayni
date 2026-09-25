import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { joinByCode, joinPanderoAfterTerms } from "@/domain/actions";
import { isValidInviteCodeFormat, normalizeInviteCode } from "@/domain/model";
import { freezeEnv, makeCtx, type TestCtx } from "../helpers";

let restore: () => void;
let ctx: TestCtx;
beforeEach(() => { restore = freezeEnv(); ctx = makeCtx(); });
afterEach(() => restore());

describe("código de invitación AYNI-XXXX", () => {
  it("exige exactamente 9 caracteres, incluido el guion", () => {
    expect(isValidInviteCodeFormat("AYNI-5B32")).toBe(true);
    expect(isValidInviteCodeFormat("5B32")).toBe(false); // no acepta solo los últimos 4
    expect(isValidInviteCodeFormat("AYNI5B32")).toBe(false);
    expect(isValidInviteCodeFormat("AYNI-5B321")).toBe(false);
    expect(isValidInviteCodeFormat("XXXX-5B32")).toBe(false);
  });
  it("normaliza mayúsculas y espacios", () => {
    expect(normalizeInviteCode("  ayni-5b32 ")).toBe("AYNI-5B32");
  });
});

describe("unirse a un grupo", () => {
  it("rechaza longitudes distintas de 9 con un mensaje claro", () => {
    const r = joinByCode(ctx, "5B32");
    expect(r).toEqual({ ok: false, error: "El código debe tener 9 caracteres, por ejemplo AYNI-5B32." });
  });
  it("rechaza un código de 9 caracteres con formato incorrecto", () => {
    const r = joinByCode(ctx, "ABCD-12345");
    expect(r.ok).toBe(false);
  });
  it("rechaza códigos inexistentes", () => {
    const r = joinByCode(ctx, "AYNI-ZZZZ");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("No encontramos un grupo");
  });
  it("une a una junta abierta (AYNI-5B32) y suma un miembro", () => {
    const before = Object.keys(ctx.s.groups.g3.members).length;
    const r = joinByCode(ctx, "ayni-5b32");
    expect(r).toEqual({ ok: true, id: "g3", kind: "joined" });
    expect(Object.keys(ctx.s.groups.g3.members).length).toBe(before + 1);
    expect(ctx.s.groups.g3.members.me.name).toBe("Rosa Quispe");
    expect(ctx.toasts).toContain("Te uniste a Promoción 5.° B · Santa Rosa");
  });
  it("informa si el ingreso está cerrado y da el código de usuario (AYNI-C7LM)", () => {
    const r = joinByCode(ctx, "AYNI-C7LM");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("cerró el ingreso");
    expect((r as { error: string }).error).toContain("USR-TEST");
  });
  it("un pandero privado (AYNI-P8RV) pide aceptar términos antes de unirse", () => {
    expect(joinByCode(ctx, "AYNI-P8RV")).toEqual({ ok: true, id: "g5", kind: "needs-terms" });
    expect(ctx.s.groups.g5.members.me).toBeUndefined();
    expect(joinPanderoAfterTerms(ctx, "g5")).toBe(true);
    expect(ctx.s.groups.g5.members.me).toBeDefined();
  });
  it("no vuelve a unir a quien ya es miembro", () => {
    expect(joinByCode(ctx, ctx.s.groups.g1.code!)).toEqual({ ok: true, id: "g1", kind: "already" });
  });
  it("no deja unirse a una junta llena", () => {
    const g = ctx.s.groups.g3;
    g.capacity = Object.keys(g.members).length;
    const r = joinByCode(ctx, "AYNI-5B32");
    expect((r as { error: string }).error).toBe("Este grupo ya está completo.");
  });
});
