import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MatchDetail } from "../types";
import { MatchSharing } from "./match-sharing";

const match: MatchDetail = {
  id: "10000000-0000-4000-8000-000000000001",
  sport: { id: "sport", name: "Fútbol", slug: "futbol" },
  sportFormat: null, startsAt: "2099-11-26T01:30:00Z",
  location: { id: "location", name: "Tolosa" }, placeName: "Cancha", address: "1 y 63",
  pricePerPerson: "7000", availablePlaces: 0, description: "", status: "OPEN",
  organizer: { id: "organizer", name: "Organizador" },
};
const url = `http://localhost:3000/partidos/${match.id}`;

beforeEach(() => {
  window.history.replaceState({}, "", `/partidos/${match.id}?success=private#contacto`);
  vi.stubGlobal("navigator", { clipboard: undefined, share: undefined });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function open(data = match) {
  const view = render(<MatchSharing match={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Compartir partido" }));
  return view;
}

it("opens a named floating dialog and restores trigger focus after Escape", async () => {
  open();
  expect(screen.getByRole("dialog", { name: "Compartir partido" })).not.toHaveAttribute("aria-modal");
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Compartir partido" })).toHaveFocus();
});

it("dismisses the desktop popover on an outside pointer interaction", async () => {
  open();
  // DismissableLayer installs the outside listener after the opening pointer event.
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  fireEvent(document.body, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  fireEvent.click(document.body);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("uses a modal sheet on mobile, locks background scroll and closes with focus restoration", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => true,
  }));
  open();
  expect(screen.getByRole("dialog", { name: "Compartir partido" })).toHaveAttribute("aria-modal", "true");
  expect(document.body).toHaveAttribute("data-scroll-locked");
  expect(screen.getByRole("button", { name: "Cerrar opciones para compartir" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar opciones para compartir" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(document.body).not.toHaveAttribute("data-scroll-locked");
  expect(screen.getByRole("button", { name: "Compartir partido" })).toHaveFocus();
});

it("closes the mobile sheet when its backdrop is pressed", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => true,
  }));
  open();
  const backdrop = screen.getByRole("dialog").querySelector('[aria-hidden="true"]')!;
  fireEvent.click(backdrop);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("offers sharing without requiring a session, including full and closed future matches", () => {
  open({ ...match, status: "CLOSED" });
  const toggle = screen.getByRole("button", { name: "Compartir partido" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeVisible();
  for (const name of ["WhatsApp", "Telegram", "X"]) {
    const link = screen.getByRole("link", { name: new RegExp(`^${name} \\(`) });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(screen.queryByRole("button", { name: "Otras aplicaciones" })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Copiar enlace" })).not.toBeInTheDocument();
});

it.each([
  { ...match, status: "CANCELLED" as const },
  { ...match, startsAt: "2000-01-01T00:00:00Z" },
])("does not offer sharing for inactive matches", data => {
  render(<MatchSharing match={data} />);
  expect(screen.queryByRole("button", { name: "Compartir partido" })).not.toBeInTheDocument();
});

it("copies only the clean public URL and confirms only after the operation resolves", async () => {
  let resolve!: () => void;
  const writeText = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
  expect(writeText).toHaveBeenCalledWith(url);
  expect(screen.queryByText("Enlace copiado correctamente")).not.toBeInTheDocument();
  await act(async () => resolve());
  expect(screen.getByRole("status")).toHaveTextContent("Enlace copiado correctamente");
});

it.each([undefined, { writeText: vi.fn().mockRejectedValue(new Error("denied")) }])("offers manual copy when clipboard is unavailable or denied", async clipboard => {
  vi.stubGlobal("navigator", { clipboard });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
  const input = await screen.findByRole("textbox", { name: "Enlace del partido" });
  expect(input).toHaveValue(url);
  expect(input).toHaveAttribute("readOnly");
  fireEvent.focus(input);
  expect((input as HTMLInputElement).selectionEnd).toBe(url.length);
  expect(screen.queryByText("Enlace copiado correctamente")).not.toBeInTheDocument();
  expect(screen.getByText(/Seleccioná|Seleccionalo/)).toBeInTheDocument();
});

it("invokes native sharing directly with text and URL and does not claim a message was sent", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Otras aplicaciones" }));
  expect(share).toHaveBeenCalledWith({ url, text: expect.stringContaining("Fútbol en Tolosa") });
  await waitFor(() => expect(screen.getByRole("button", { name: "Otras aplicaciones" })).toBeEnabled());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([
  { error: new DOMException("Cancelled", "AbortError"), message: false },
  { error: new Error("Failed"), message: true },
])("handles native cancellation and failure without removing alternatives", async ({ error, message }) => {
  vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(error) });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Otras aplicaciones" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Otras aplicaciones" })).toBeEnabled());
  expect(Boolean(screen.queryByRole("status"))).toBe(message);
  expect(screen.getByRole("link", { name: /^Telegram/ })).toBeVisible();
});

it("hides sharing at the exact start time without navigation", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-11-26T01:29:59Z"));
  open();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("button", { name: "Compartir partido" })).not.toBeInTheDocument();
});

it("rechecks eligibility on focus after a suspended tab and before external navigation", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-11-26T01:29:59Z"));
  open();
  const link = screen.getByRole("link", { name: /^WhatsApp/ });
  vi.setSystemTime(new Date(match.startsAt));
  expect(fireEvent.click(link)).toBe(false);
  fireEvent.focus(window);
  expect(screen.queryByRole("button", { name: "Compartir partido" })).not.toBeInTheDocument();
});
