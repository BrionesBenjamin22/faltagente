import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";
import headerStyles from "./site-header.module.css";

const state = vi.hoisted(() => ({
  session: { authenticated: false, refreshAvailable: false, user: null as { name: string } | null },
  expires: 0, now: 0, pending: false, feedback: "", refresh: vi.fn(), logout: vi.fn(),
}));
vi.mock("@/features/auth/session", () => ({ useSession: () => state }));
beforeEach(() => { state.session.authenticated = false; state.session.user = null; });

it("keeps anonymous navigation limited to login and register across page content changes", () => {
  const view = render(<Shell>Landing</Shell>);
  const navigation = screen.getByRole("navigation", { name: "Cuenta" });
  expect(within(navigation).queryByRole("link", { name: "Partidos" })).not.toBeInTheDocument();
  expect(within(navigation).getByRole("link", { name: "Ingresar" })).toHaveAttribute("href", "/auth/login");
  expect(within(navigation).getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/auth/register");
  view.rerender(<Shell>Ingreso</Shell>);
  expect(within(navigation).queryByRole("link", { name: "Partidos" })).not.toBeInTheDocument();
  view.rerender(<Shell>Descubrimiento</Shell>);
  expect(within(navigation).queryByRole("link", { name: "Partidos" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
});

it("preserves the authenticated home match link and account menu", () => {
  state.session.authenticated = true; state.session.user = { name: "Benjamín" };
  render(<Shell>Home</Shell>);
  expect(screen.getByRole("link", { name: "Partidos" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("button", { name: "Mi cuenta" })).toBeInTheDocument();
});

it.each([false, true])("keeps desktop navigation in a responsive container and the theme control outside it (authenticated=%s)", (authenticated) => {
  state.session.authenticated = authenticated;
  state.session.user = authenticated ? { name: "Benjamín" } : null;
  render(<Shell>Contenido</Shell>);
  const banner = screen.getByRole("banner");
  const navigation = within(banner).getByRole("navigation", { name: "Cuenta" });
  // JSDOM checks the responsive CSS hook; actual breakpoint layout is reviewed manually.
  expect(navigation).toHaveClass(headerStyles.navigation);
  const theme = within(banner).getByRole("button", { name: /Cambiar tema/ });
  expect(navigation).not.toContainElement(theme);
  expect(within(banner).getByRole("link", { name: "Falta Gente Beta" })).toHaveAttribute("href", "/");
  expect(within(banner).getAllByRole("navigation")).toHaveLength(1);
});
