import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Wizard } from "@/features/groups/Wizard";
import { JoinGroupPage } from "@/features/groups/JoinGroupPage";
import { ModalHost } from "@/features/modals/ModalHost";
import { PanderoView } from "@/features/pandero/PanderoView";
import { emptyState } from "@/fixtures/demo/seed";
import { useAyni } from "@/store/ayni";
import { useUi } from "@/store/ui";
import { freezeEnv } from "../helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => "/",
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

describe("Pandero (UI)", () => {
  it("estado C — ronda activa: pozo, receptor, progreso y orden de turnos", () => {
    render(<PanderoView id="g2" />);
    expect(screen.getByText("Pozo de la ronda actual")).toBeInTheDocument();
    expect(screen.getByText(/Este mes recibe/)).toBeInTheDocument();
    expect(screen.getByText("8 de 8 ya aportaron")).toBeInTheDocument();
    expect(screen.getByText("Orden de turnos")).toBeInTheDocument();
    expect(screen.getByText(/Ronda 3 · se deposita el/)).toBeInTheDocument();
    expect(screen.getByText(/Creaste este pandero, pero tienes los mismos derechos/)).toBeInTheDocument();
  });

  it("estado E → D: 'Simular fin de mes' avanza de ronda y, con 350 XLM, deja al usuario sin saldo con botón de recarga", () => {
    render(<PanderoView id="g2" />);
    fireEvent.click(screen.getByRole("button", { name: "Simular fin de mes" }));
    expect(screen.getByText(/Ronda 2 de 8/)).toBeInTheDocument();
    expect(screen.getByText(/No se pudo debitar 400\.00 XLM/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recargar y pagar/ })).toBeInTheDocument();
  });

  it("el pandero no ofrece acciones de tesorero (sin panel, sin quitar miembros)", () => {
    render(<PanderoView id="g2" />);
    expect(screen.queryByRole("button", { name: /Panel del tesorero/ })).toBeNull();
    expect(screen.queryByText("Quitar")).toBeNull();
  });

  it("estado A — reclutando: el demo llena cupos hasta completar y pasa a 'espera' (B)", () => {
    act(() => { useAyni.getState().joinPandero("g5"); });
    render(<PanderoView id="g5" />);
    expect(screen.getByText(/Faltan 1 participante para empezar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simular que alguien se une" }));
    expect(screen.getByText(/El juego empieza el/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular que pasó el mes" })).toBeInTheDocument();
  });

  it("'Términos' abre el diálogo de solo lectura", () => {
    render(<><PanderoView id="g2" /><ModalHost /></>);
    fireEvent.click(screen.getByRole("button", { name: "Términos" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Términos y condiciones")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Aceptar y unirme/ })).toBeNull();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Cerrar" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unirse a un pandero exige aceptar los términos", async () => {
    render(<ModalHost />);
    act(() => useUi.getState().open({ t: "terms", id: "f0" }));
    const join = screen.getByRole("button", { name: "Aceptar y unirme" });
    expect(join).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Leí y acepto los términos/));
    expect(join).toBeEnabled();
    fireEvent.click(join);
    await waitFor(() => expect(useAyni.getState().s.groups.f0.members.me).toBeDefined());
    expect(push).toHaveBeenCalledWith("/groups/f0");
  });
});

describe("Unirme a un grupo (UI)", () => {
  it("rechaza un código de longitud incorrecta y muestra el error", async () => {
    render(<JoinGroupPage />);
    fireEvent.change(screen.getByLabelText("Código del grupo"), { target: { value: "5B32" } });
    fireEvent.click(screen.getByRole("button", { name: "Unirme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El código debe tener 9 caracteres");
    expect(push).not.toHaveBeenCalled();
  });
  it("con un código válido de junta abierta te une y navega al grupo", async () => {
    render(<JoinGroupPage />);
    fireEvent.change(screen.getByLabelText("Código del grupo"), { target: { value: "ayni-5b32" } });
    fireEvent.click(screen.getByRole("button", { name: "Unirme" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/groups/g3"));
    expect(useAyni.getState().s.groups.g3.members.me).toBeDefined();
  });
  it("un pandero privado abre los términos antes de unirse", async () => {
    render(<><JoinGroupPage /><ModalHost /></>);
    fireEvent.change(screen.getByLabelText("Código del grupo"), { target: { value: "AYNI-P8RV" } });
    fireEvent.click(screen.getByRole("button", { name: "Unirme" }));
    expect(await screen.findByText("Términos y condiciones")).toBeInTheDocument();
  });
});

describe("Wizard Crear grupo (UI)", () => {
  it("fondo común: 4 pasos, validación y creación con redirección a la pantalla 'creado'", async () => {
    render(<Wizard />);
    expect(screen.getByText("Crear grupo · Paso 1 de 4")).toBeInTheDocument();
    expect(screen.getByText("Grupo con fondo común")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ponle un nombre al grupo");
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Fondo del edificio" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Monto a reunir")).toBeInTheDocument();
    // naturaleza del grupo (5 opciones) y sin campo "Periodo"
    const nature = screen.getByLabelText("Naturaleza del grupo") as HTMLSelectElement;
    expect([...nature.options].map((o) => o.value)).toEqual(["Comités escolares", "Juntas vecinales", "Condominios pequeños", "Equipos / clubes", "Grupos de trabajadores"]);
    expect(screen.queryByLabelText(/Periodo/i)).toBeNull();
    fireEvent.change(nature, { target: { value: "Condominios pequeños" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("¿Cuándo cierra la recolección?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear grupo y obtener código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("entre 2 y 200");
    fireEvent.change(screen.getByLabelText(/Número de participantes/), { target: { value: "24" } });
    expect(screen.getByText("50.00 XLM")).toBeInTheDocument(); // cuota en vivo
    fireEvent.click(screen.getByRole("button", { name: "Crear grupo y obtener código" }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const id = push.mock.calls[0][0].split("/")[2];
    expect(push.mock.calls[0][0]).toMatch(/\/created$/);
    const g = useAyni.getState().s.groups[id];
    expect(g).toMatchObject({ name: "Fondo del edificio", nature: "Condominios pequeños", creator: "me", capacity: 24 });
  });

  it("pandero: 3 pasos, exige aceptar los términos", async () => {
    render(<Wizard />);
    fireEvent.click(screen.getByLabelText(/^Pandero/));
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Pandero del mercado" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Crear grupo · Paso 2 de 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Número de participantes/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar y crear pandero" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Debes aceptar los términos");
    fireEvent.click(screen.getByLabelText(/Leí y acepto los términos/));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar y crear pandero" }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });
});
