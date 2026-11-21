import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BenefitsCarousel } from "./benefits-carousel";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function mountCarousel() {
  render(<BenefitsCarousel />);
  const track = screen.getByRole("group", { name: "Beneficios de Falta Gente" });
  Object.defineProperty(track, "setPointerCapture", { value: vi.fn(), configurable: true });
  return { track };
}

it("keeps multisport copy and navigates with indicators", () => {
  mountCarousel();
  expect(screen.getByRole("region", { name: "Más fácil juntarse a jugar" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "1 de 3" })).getByText("Explorá partidos por localidad y deporte. Consultá el lugar, la fecha, el horario, el formato, el precio y los lugares libres.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Encontrá un partido" }));
  expect(screen.getByRole("button", { name: "Ir a Encontrá un partido" })).toHaveAttribute("aria-current", "true");
  expect(within(screen.getByRole("group", { name: "2 de 3" })).getByText("Tenés ganas de jugar. Elegí un partido y reservá tu lugar. No necesitás conocer al resto de los jugadores.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Sumá a tus compañeros" }));
  expect(within(screen.getByRole("group", { name: "3 de 3" })).getByText("Si vas con amigos, podrás reservar también sus lugares en el mismo partido. Vos te anotás y sumás a los que se prenden.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Encontrá un partido" }));
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
});

it("supports bounded keyboard navigation and keeps one accessible active slide", () => {
  const { track } = mountCarousel();
  fireEvent.keyDown(track, { key: "ArrowLeft" });
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  fireEvent.keyDown(track, { key: "End" });
  fireEvent.keyDown(track, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Ir a Sumá a tus compañeros" })).toHaveAttribute("aria-current", "true");
  expect(screen.queryByRole("group", { name: "1 de 3" })).not.toBeInTheDocument();
  fireEvent.keyDown(track, { key: "Home" });
  fireEvent.keyDown(track, { key: "ArrowRight" });
  expect(screen.getByRole("group", { name: "2 de 3" }).parentElement).toHaveAttribute("data-position", "active");
});

it("changes slides only for horizontal pointer gestures and clears cancelled gestures", () => {
  const { track } = mountCarousel();
  function pointer(type: string, x: number, y: number) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, button: { value: 0 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: y } });
    fireEvent(track, event);
  }
  pointer("pointerdown", 200, 100);
  pointer("pointerup", 100, 110);
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
  pointer("pointerdown", 100, 100);
  pointer("pointerup", 120, 220);
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
  pointer("pointerdown", 100, 100);
  pointer("pointercancel", 100, 100);
  pointer("pointerup", 220, 100);
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
  pointer("pointerdown", 100, 100);
  pointer("pointerup", 220, 100);
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
});

it("does not advance automatically", () => {
  vi.useFakeTimers();
  mountCarousel();
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
});


it("centers either visible side card, including the card across the end", () => {
  mountCarousel();
  fireEvent.click(screen.getByRole("button", { name: "Ver Encontrá un partido" }));
  expect(screen.getByRole("group", { name: "2 de 3" }).parentElement).toHaveAttribute("data-position", "active");
  fireEvent.click(screen.getByRole("button", { name: "Ver Elegí dónde jugar" }));
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver Sumá a tus compañeros" }));
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver Elegí dónde jugar" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 de 3");
});

it("uses native keyboard-activatable side buttons and retains focus when selected", () => {
  const { track } = mountCarousel();
  const side = screen.getByRole("button", { name: "Ver Encontrá un partido" });
  expect(side.tagName).toBe("BUTTON");
  expect(side).toHaveAttribute("type", "button");
  side.focus();
  // Native Enter/Space activation emits a click with detail zero.
  fireEvent.click(side, { detail: 0 });
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
  expect(track).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Ver Encontrá un partido" })).not.toBeInTheDocument();
});

it("captures a side tap on its button and suppresses its click after a swipe", () => {
  const { track } = mountCarousel();
  const side = screen.getByRole("button", { name: "Ver Sumá a tus compañeros" });
  const capture = vi.fn();
  Object.defineProperty(side, "setPointerCapture", { value: capture });
  function pointer(target: HTMLElement, type: string, x: number) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, button: { value: 0 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: 100 } });
    fireEvent(target, event);
  }
  pointer(side, "pointerdown", 220);
  expect(capture).toHaveBeenCalledWith(1);
  expect(track.setPointerCapture).not.toHaveBeenCalled();
  pointer(side, "pointerup", 100);
  fireEvent.click(side, { detail: 1 });
  expect(screen.getByRole("group", { name: "2 de 3" })).toBeInTheDocument();
  pointer(side, "pointerdown", 100);
  pointer(side, "pointerup", 105);
  fireEvent.click(side, { detail: 1 });
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
});

it("ignores short swipes and remains bounded at either end", () => {
  const { track } = mountCarousel();
  function swipe(start: number, end: number) {
    for (const [type, x] of [["pointerdown", start], ["pointerup", end]] as const) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, { pointerId: { value: 1 }, button: { value: 0 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: 100 } });
      fireEvent(track, event);
    }
  }
  swipe(100, 120);
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  swipe(100, 220);
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  swipe(220, 100);
  swipe(220, 100);
  swipe(220, 100);
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
});
