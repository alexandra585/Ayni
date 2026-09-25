import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "@/fixtures/demo/seed";
import { JuntaView } from "@/features/fund-group/JuntaView";
import { ModalHost } from "@/features/modals/ModalHost";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { freezeEnv } from "../helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => "/groups/g1",
}));

let restore: () => void;
beforeEach(() => {
  restore = freezeEnv();
  push.mockClear();
  useAyni.setState({ s: emptyState() });
  useUi.setState({ modal: null, toastMsg: null });
  useAyni.getState().signUp({ name: "Rosa Quispe", email: "rosa@correo.com", phone: "", address: "" });
});
afterEach(() => restore());

const renderJunta = (id = "g1") => render(<><JuntaView id={id} /><ModalHost /></>);

describe("vista del tesorero (fondo común)", () => {
  it("muestra el estado del fondo: 650 XLM de 1,200, 13 de 24 pagaron, 54%", () => {
    renderJunta();
    expect(screen.getByText("Fondo reunido")).toBeInTheDocument();
    expect(screen.getByText("13 de 24 ya pagaron")).toBeInTheDocument();
    expect(screen.getByText("54%")).toBeInTheDocument();
    expect(screen.getByText(/de 1,200\.00 XLM/)).toBeInTheDocument();
  });

  it("el tesorero ve el acceso al Panel del tesorero, que se abre como modal superpuesto (no debajo del historial)", () => {
    renderJunta();
    fireEvent.click(screen.getByRole("button", { name: "Abrir panel del tesorero" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Panel del tesorero")).toBeInTheDocument();
    expect(within(dialog).getByText("Solo tú ves esto")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cambiar monto" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Ingreso abierto: Sí/ })).toBeInTheDocument();
  });

  it("un participante (no tesorero) NO ve el panel del tesorero ni puede quitar miembros", () => {
    // me uno a la junta de otra persona
    act(() => { useAyni.getState().joinByCode("AYNI-5B32"); });
    renderJunta("g3");
    expect(screen.queryByRole("button", { name: "Abrir panel del tesorero" })).toBeNull();
    expect(screen.queryByText("Quitar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Recordar a los que faltan/ })).toBeNull();
    // aunque se fuerce el modal, no renderiza nada para un participante
    act(() => useUi.getState().open({ t: "settings", id: "g3" }));
    expect(screen.queryByText("Panel del tesorero")).toBeNull();
  });

  it("el tesorero puede quitar a un miembro: confirma con el efecto en la cuota y devuelve lo abonado", async () => {
    renderJunta();
    const quitar = screen.getAllByRole("button", { name: /Quitar a .* del grupo/ });
    expect(quitar.length).toBeGreaterThan(0);
    const before = Object.keys(useAyni.getState().s.groups.g1.members).length;
    fireEvent.click(quitar[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Esta acción no se puede deshacer.", { exact: false })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/Quitar el lugar/));
    expect(within(dialog).getByText("Cupos")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Sí, quitar/ }));
    await waitFor(() => expect(Object.keys(useAyni.getState().s.groups.g1.members).length).toBe(before - 1));
    expect(useAyni.getState().s.groups.g1.capacity).toBe(23);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("filtros de miembros: Atrasado deja solo a quienes no pagaron", () => {
    renderJunta();
    fireEvent.click(screen.getByRole("button", { name: /^Atrasado/ }));
    expect(screen.getAllByText("Atrasado", { selector: ".badge" }).length).toBe(10);
    expect(screen.queryAllByText("Pagó", { selector: ".badge" }).length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /^Pagó/ }));
    expect(screen.getAllByText("Pagó", { selector: ".badge" })).toHaveLength(13);
  });

  it("'Ver más' muestra el resto de la lista (23 miembros → 6 visibles + 17)", () => {
    renderJunta();
    expect(screen.getByText("Ver más (17)")).toBeInTheDocument();
  });
});

describe("modo demo (panel flotante)", () => {
  it("'Simular pago de otro miembro' actualiza contador, progreso y registro", () => {
    renderJunta();
    expect(screen.getByText("Solo para demostración")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simular pago de otro miembro" }));
    expect(screen.getByText("14 de 24 ya pagaron")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getAllByText(/pagó su cuota/).length).toBeGreaterThan(0);
  });

  it("'Simular que alguien se une' llena el cupo libre y el botón desaparece", () => {
    renderJunta();
    fireEvent.click(screen.getByRole("button", { name: "Simular que alguien se une" }));
    expect(screen.getByText(/24 de 24 lugares ocupados/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simular que alguien se une" })).toBeNull();
  });

  it("'Simular que llegó la fecha de cierre' habilita la disposición del fondo", async () => {
    renderJunta("g1");
    fireEvent.click(screen.getByRole("button", { name: "Simular que llegó la fecha de cierre" }));
    await waitFor(() => expect(screen.getByText("¿Qué quieres hacer con el fondo?")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole("button", { name: /Recolectar en mi wallet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar a un participante/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir panel del tesorero" })).toBeNull(); // el panel solo aplica en custodia
  });
});

describe("pago de la cuota", () => {
  it("con saldo suficiente: confirma → procesa → 'Cuota pagada' y el ledger se actualiza", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderJunta();
      fireEvent.click(screen.getByRole("button", { name: /Pagar mi cuota/ }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Saldo:", { exact: false })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: /Confirmar con mi huella/ }));
      expect(screen.getByText("Procesando pago")).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      await waitFor(() => expect(screen.getByText("Cuota pagada")).toBeInTheDocument());
      expect(useAyni.getState().s.wallet!.bal).toBe(300);
      expect(useAyni.getState().s.groups.g1.members.me.paid).toBe(50);
      fireEvent.click(screen.getByRole("button", { name: "Listo" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("con saldo insuficiente ofrece recargar y no permite pagar", () => {
    act(() => { useAyni.getState().run((ctx) => { ctx.s.wallet!.bal = 20; }); });
    renderJunta();
    fireEvent.click(screen.getByRole("button", { name: /Pagar mi cuota/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Saldo insuficiente: te faltan 30\.00 XLM/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Confirmar con mi huella/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Recargar billetera" }));
    expect(screen.getByText("Recargar desde")).toBeInTheDocument();
  });
});
