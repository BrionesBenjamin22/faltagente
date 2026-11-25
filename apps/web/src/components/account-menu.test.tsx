import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

const session = vi.hoisted(() => ({ session: { user: { name: "Benjamín" } }, pending: false, logout: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ useSession: () => session }));
beforeEach(() => { session.pending = false; session.logout.mockReset(); });

function openMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Mi cuenta" }), { key: "Enter" });
}

it("opens the existing complete account menu and invokes logout once", () => {
  render(<AccountMenu />);
  openMenu();
  for (const [name, href] of [["Perfil", "/account/profile"], ["Seguridad", "/account/security"], ["Apariencia", "/account/appearance"]]) {
    expect(screen.getByRole("menuitem", { name })).toHaveAttribute("href", href);
  }
  fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
  expect(session.logout).toHaveBeenCalledTimes(1);
});

it("blocks logout while an operation is pending", () => {
  session.pending = true;
  render(<AccountMenu />);
  openMenu();
  const logout = screen.getByRole("menuitem", { name: "Cerrar sesión" });
  expect(logout).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(logout);
  expect(session.logout).not.toHaveBeenCalled();
});
