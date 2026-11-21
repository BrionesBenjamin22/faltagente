import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { Appearance } from "./appearance";
import { ThemeMenu } from "./theme-menu";

const storageKey = "hyt-theme-v1";
const themes = [
  { value: "light", label: "Claro", icon: "lucide-sun" },
  { value: "dark", label: "Oscuro", icon: "lucide-moon" },
  { value: "system", label: "Sistema", icon: "lucide-monitor" },
] as const;

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

function openMenu() {
  const trigger = screen.getByRole("button", { name: /Cambiar tema/ });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

it("opens the explicit three-option menu with a primary pointer press", () => {
  render(<ThemeMenu />);
  const trigger = screen.getByRole("button", { name: /Cambiar tema/ });
  fireEvent(trigger, new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
  expect(localStorage.getItem(storageKey)).toBeNull();
});

it.each(themes)("represents the persisted $value preference with its icon and checked menu option", ({ value, label, icon }) => {
  localStorage.setItem(storageKey, value);
  render(<ThemeMenu />);
  const trigger = screen.getByRole("button", { name: `Cambiar tema: ${label}` });
  expect(trigger.querySelector("svg")).toHaveClass(icon);
  expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  openMenu();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
  for (const theme of themes) {
    expect(screen.getByRole("menuitemradio", { name: theme.label })).toHaveAttribute("aria-checked", String(theme.value === value));
  }
});

it.each(themes)("selects $value, persists it and updates Appearance using the existing theme store", ({ value, label }) => {
  localStorage.setItem(storageKey, value === "dark" ? "light" : "dark");
  render(<><ThemeMenu /><Appearance /></>);
  openMenu();
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
  expect(localStorage.getItem(storageKey)).toBe(value);
  expect(document.documentElement.dataset.theme).toBe(value === "dark" ? "dark" : "light");
  expect(screen.getByRole("radio", { name: label })).toBeChecked();
  expect(screen.getByRole("button", { name: `Cambiar tema: ${label}` })).toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("synchronizes Appearance changes back to the header and preserves the preference on remount", () => {
  const view = render(<><ThemeMenu /><Appearance /></>);
  for (const { value, label } of themes) {
    fireEvent.click(screen.getByRole("radio", { name: label }));
    expect(screen.getByRole("button", { name: `Cambiar tema: ${label}` })).toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBe(value);
  }
  view.unmount();
  render(<ThemeMenu />);
  expect(screen.getByRole("button", { name: "Cambiar tema: Sistema" })).toBeInTheDocument();
});

it("opens, navigates, selects and dismisses through the keyboard with focus returning to the trigger", async () => {
  render(<ThemeMenu />);
  const trigger = openMenu();
  const light = screen.getByRole("menuitemradio", { name: "Claro" });
  await waitFor(() => expect(light).toHaveFocus());
  fireEvent.keyDown(light, { key: "ArrowDown" });
  const dark = screen.getByRole("menuitemradio", { name: "Oscuro" });
  await waitFor(() => expect(dark).toHaveFocus());
  fireEvent.keyDown(dark, { key: "Enter" });
  expect(localStorage.getItem(storageKey)).toBe("dark");
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const menu = screen.getByRole("menu");
  fireEvent.keyDown(menu, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(localStorage.getItem(storageKey)).toBe("dark");
});

it("uses system for an invalid stored value and responds to changes from another tab", () => {
  localStorage.setItem(storageKey, "invalid");
  render(<ThemeMenu />);
  expect(screen.getByRole("button", { name: "Cambiar tema: Sistema" })).toBeInTheDocument();
  act(() => {
    localStorage.setItem(storageKey, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "dark" }));
  });
  expect(screen.getByRole("button", { name: "Cambiar tema: Oscuro" })).toBeInTheDocument();
});
