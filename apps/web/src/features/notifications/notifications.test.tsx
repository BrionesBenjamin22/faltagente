import { StrictMode, useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationProvider, useNotify } from "./notifications";

// Exercise our lifecycle independently of Motion's animation-frame scheduler.
vi.mock("motion/react", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    AnimatePresence: Fragment,
    useReducedMotion: () => true,
    motion: { div: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: Record<string, unknown>) => {
      void _initial; void _animate; void _exit; void _transition;
      return createElement("div", props);
    } },
  };
});

let notify: ReturnType<typeof useNotify>;
function Controls() { const api = useNotify(); useEffect(() => { notify = api; }, [api]); return <a href="/auth/login">Ingresar</a>; }
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function setup() { return render(<NotificationProvider><Controls /></NotificationProvider>); }
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }

it("renders four semantic variants without taking focus and caps the stack at three", () => {
  setup();
  act(() => { notify.success("Guardado"); notify.error("Reintentá la operación"); notify.warning("Pocos lugares"); notify.info("Información disponible"); });
  expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Error: Reintentá la operación");
  expect(screen.getAllByRole("status")).toHaveLength(2);
  expect(screen.getByText("Advertencia:")).toBeInTheDocument();
  expect(screen.getByText("Información:")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Cerrar notificación" })).toHaveLength(3);
  expect(document.activeElement).toBe(document.body);
});

it("expires success/info at 4s, warning at 5s and error at 6s", () => {
  setup();
  act(() => { notify.success("Éxito"); notify.warning("Aviso"); notify.error("Fallo"); });
  advance(3950);
  expect(screen.getByText("Éxito")).toBeInTheDocument();
  advance(250); // includes the short exit transition
  expect(screen.queryByText("Éxito")).not.toBeInTheDocument();
  expect(screen.getByText("Aviso")).toBeInTheDocument();
  advance(1000);
  expect(screen.queryByText("Aviso")).not.toBeInTheDocument();
  expect(screen.getByText("Fallo")).toBeInTheDocument();
  advance(1000);
  expect(screen.queryByText("Fallo")).not.toBeInTheDocument();
  act(() => { notify.info("Info"); });
  advance(4200);
  expect(screen.queryByText("Info")).not.toBeInTheDocument();
});

it("pauses on hover and keyboard focus together, then resumes the remaining time", () => {
  setup();
  act(() => { notify.success("Temporal"); });
  advance(2000);
  const close = screen.getByRole("button", { name: "Cerrar notificación" });
  const toast = close.parentElement!;
  expect(toast.querySelector('[aria-hidden="true"] div')).toHaveStyle({ transform: "scaleX(0.5)" });
  fireEvent.mouseEnter(toast);
  fireEvent.focus(close);
  advance(5000);
  fireEvent.mouseLeave(toast);
  advance(5000);
  expect(screen.getByText("Temporal")).toBeInTheDocument();
  fireEvent.blur(close, { relatedTarget: screen.getByRole("link") });
  advance(1900);
  expect(screen.getByText("Temporal")).toBeInTheDocument();
  advance(300);
  expect(screen.queryByText("Temporal")).not.toBeInTheDocument();
});

it("allows manual close and duration override", () => {
  setup();
  act(() => { notify.info("Cerrar", { duration: 10000 }); });
  advance(5000);
  expect(screen.getByText("Cerrar")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));
  advance(200);
  expect(screen.queryByText("Cerrar")).not.toBeInTheDocument();
  act(() => { notify.info("Corto", { duration: 1000 }); });
  advance(1200);
  expect(screen.queryByText("Corto")).not.toBeInTheDocument();
});

it("deduplicates an event ID in StrictMode while allowing distinct events with the same text", () => {
  function Event() {
    const notify = useNotify();
    useEffect(() => { notify.success("Evento", { id: "event-1" }); }, [notify]);
    return <Controls />;
  }
  render(<StrictMode><NotificationProvider><Event /></NotificationProvider></StrictMode>);
  expect(screen.getAllByText("Evento")).toHaveLength(1);
  act(() => { notify.success("Evento", { id: "event-2" }); });
  expect(screen.getAllByText("Evento")).toHaveLength(2);
});

it("retains visible feedback on rerender and forgets it when the provider remounts", () => {
  const view = setup();
  act(() => { notify.success("Consumido"); });
  view.rerender(<NotificationProvider><Controls /><p>Login</p></NotificationProvider>);
  expect(screen.getAllByText("Consumido")).toHaveLength(1);
  view.unmount();
  setup();
  expect(screen.queryByText("Consumido")).not.toBeInTheDocument();
});
