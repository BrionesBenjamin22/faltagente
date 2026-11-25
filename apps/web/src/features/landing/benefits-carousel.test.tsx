import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BenefitsCarousel } from "./benefits-carousel";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function mountCarousel() {
  render(<BenefitsCarousel />);
  const track = screen.getByRole("group", { name: "Cómo funciona Falta Gente" });
  Object.defineProperty(track, "setPointerCapture", { value: vi.fn(), configurable: true });
  return { track };
}

it("presents the approved copy and selects each step through indicators", () => {
  mountCarousel();
  expect(screen.getByRole("region", { name: "Jugar juntos es más fácil." })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "1 de 3" })).getByText("Explorá partidos por localidad y deporte. Filtrá por fecha, horario, formato, precio y lugares disponibles.")).toBeInTheDocument();
  expect(screen.getByText("Cerca tuyo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Encontrá tu partido" }));
  expect(screen.getByRole("button", { name: "Ir a Encontrá tu partido" })).toHaveAttribute("aria-current", "true");
  expect(within(screen.getByRole("group", { name: "2 de 3" })).getByText("¿Tenés ganas de jugar? Revisá los encuentros disponibles y elegí el que mejor se adapte a vos.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Sumate a jugar" }));
  expect(within(screen.getByRole("group", { name: "3 de 3" })).getByText("Reservá tu lugar y, si querés, anotá a tus compañeros. Ya estás más cerca de entrar a la cancha.")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("3 de 3");
});

it("cycles with arrows and keeps only the active slide in the accessibility tree", () => {
  mountCarousel();
  fireEvent.click(screen.getByRole("button", { name: "Paso anterior" }));
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "1 de 3" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("group", { hidden: true }).find(element => element.getAttribute("aria-label") === "1 de 3")).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  expect(screen.getAllByRole("group", { name: /^[123] de 3$/ })).toHaveLength(1);
});

it("supports circular keyboard navigation and Home/End without intercepting controls", () => {
  const { track } = mountCarousel();
  fireEvent.keyDown(track, { key: "ArrowLeft" });
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
  fireEvent.keyDown(track, { key: "ArrowRight" });
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  fireEvent.keyDown(track, { key: "End" });
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
  fireEvent.keyDown(track, { key: "Home" });
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  const next = screen.getByRole("button", { name: "Paso siguiente" });
  next.focus();
  fireEvent.click(next);
  expect(next).toHaveFocus();
});

it("recognizes horizontal swipes, wraps, and ignores vertical, short or cancelled gestures", () => {
  const { track } = mountCarousel();
  function pointer(type: string, x: number, y = 100, id = 1) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerId: { value: id }, button: { value: 0 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: y } });
    fireEvent(track, event);
  }
  pointer("pointerdown", 100); pointer("pointerup", 120);
  pointer("pointerdown", 100); pointer("pointerup", 120, 220);
  pointer("pointerdown", 100); pointer("pointercancel", 100); pointer("pointerup", 220);
  pointer("pointerdown", 100); pointer("pointerup", 220, 100, 2);
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
  pointer("pointerdown", 100); pointer("pointerup", 220);
  expect(screen.getByRole("group", { name: "3 de 3" })).toBeInTheDocument();
  pointer("pointerdown", 220); pointer("pointerup", 100);
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
});

it("does not advance automatically", () => {
  vi.useFakeTimers(); mountCarousel();
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("group", { name: "1 de 3" })).toBeInTheDocument();
});
