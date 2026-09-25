import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unreadCount } from "@/domain/actions";
import { isMember, myGroupIds } from "@/domain/model";
import { emptyState } from "@/fixtures/demo/seed";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { freezeEnv } from "../helpers";

let restore: () => void;
beforeEach(() => {
  restore = freezeEnv();
  useAyni.setState({ s: emptyState() });
  useUi.setState({ modal: null, toastMsg: null });
});
afterEach(() => restore());

const signUp = () => useAyni.getState().signUp({ name: "Rosa Quispe", email: "rosa@correo.com", phone: "", address: "" });

describe("DemoRepository (store en memoria)", () => {
  it("al crear la cuenta siembra los grupos de ejemplo y a mí como miembro de 2 grupos activos", () => {
    signUp();
    const s = useAyni.getState().s;
    expect(s.me?.name).toBe("Rosa Quispe");
    expect(s.me?.code).toMatch(/^USR-/);
    expect(myGroupIds(s).sort()).toEqual(["g1", "g2"]);
    expect(isMember(s.groups.ga) && s.groups.ga.archived).toBe(true);
    expect(s.wallet?.bal).toBe(350);
    // igual que el prototipo: el aviso de víspera (checkTimed) reemplaza al toast de bienvenida
    expect(useUi.getState().toastMsg).toBe("Mañana cierra la junta de Vigilancia Jr. Los Olivos");
  });

  it("cerrar sesión limpia todo el estado", () => {
    signUp();
    useAyni.getState().logout();
    const s = useAyni.getState().s;
    expect(s.me).toBeNull();
    expect(Object.keys(s.groups)).toHaveLength(0);
  });

  it("las acciones no mutan el estado anterior (inmutabilidad para React)", () => {
    signUp();
    const before = useAyni.getState().s;
    useAyni.getState().simJoin("g1");
    const after = useAyni.getState().s;
    expect(after).not.toBe(before);
    expect(Object.keys(before.groups.g1.members)).toHaveLength(23);
    expect(Object.keys(after.groups.g1.members)).toHaveLength(24);
  });

  it("notificaciones: sin leer → marcar una / todas como leídas", () => {
    signUp();
    useAyni.getState().checkTimed(); // la junta g1 cierra mañana → aviso
    expect(unreadCount(useAyni.getState().s)).toBe(2);
    useAyni.getState().markRead(0);
    expect(unreadCount(useAyni.getState().s)).toBe(1);
    useAyni.getState().markAllRead();
    expect(unreadCount(useAyni.getState().s)).toBe(0);
  });

  it("checkTimed es idempotente (no duplica el aviso de víspera)", () => {
    signUp();
    useAyni.getState().checkTimed();
    const n = useAyni.getState().s.notifs.length;
    useAyni.getState().checkTimed();
    expect(useAyni.getState().s.notifs).toHaveLength(n);
  });

  it("al cumplirse la condición de cierre pasa a 'listo' 700 ms después (autoRelease)", () => {
    vi.useFakeTimers();
    try {
      signUp();
      useAyni.getState().simDate("g1");
      expect(useAyni.getState().s.groups.g1).toMatchObject({ status: "custodia" });
      vi.advanceTimersByTime(750);
      expect(useAyni.getState().s.groups.g1).toMatchObject({ status: "listo" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("el agente prepara mensajes tras 500 ms", () => {
    vi.useFakeTimers();
    try {
      signUp();
      useAyni.getState().runAgent("g1");
      expect(useAyni.getState().s.agent.g1).toEqual({ busy: true });
      vi.advanceTimersByTime(600);
      expect(useAyni.getState().s.agent.g1.msgs).toHaveLength(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it("actualizar el perfil propaga el nombre a mis membresías", () => {
    signUp();
    useAyni.getState().updateProfile({ name: "Rosa M. Quispe", email: "r@x.com", phone: "", address: "" });
    const s = useAyni.getState().s;
    expect(s.me?.name).toBe("Rosa M. Quispe");
    expect(s.groups.g1.members.me.name).toBe("Rosa M. Quispe");
  });
});
