import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Shell } from "./shell";
import headerStyles from "./site-header.module.css";

const state = vi.hoisted(() => ({
  session: { authenticated: false, refreshAvailable: false, user: null as { name: string } | null },
  expires: 0, now: 0, pending: false, feedback: "", refresh: vi.fn(), logout: vi.fn(),
}));
vi.mock("@/features/auth/session", () => ({ useSession: () => state }));
vi.mock("@/features/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
beforeEach(() => {
  state.session.authenticated = false; state.session.user = null; state.session.refreshAvailable = false;
  state.expires = 0; state.now = 0; state.pending = false; state.feedback = "";
  state.refresh.mockReset(); state.logout.mockReset();
});

it("groups session recovery, pending actions and feedback in one labelled notice", () => {
  state.session.refreshAvailable = true;
  state.feedback = "Lo sentimos! No pudimos recuperar tu sesión. Intentá nuevamente.";
  const view = render(<Shell>Contenido</Shell>);
  const notice = screen.getByRole("region", { name: "Recuperá tu sesión" });
  expect(within(notice).getByRole("heading", { level: 2 })).toHaveTextContent("Recuperá tu sesión");
  expect(within(notice).getByRole("status")).toHaveTextContent(state.feedback);
  expect(screen.getAllByText(state.feedback)).toHaveLength(1);
  fireEvent.click(within(notice).getByRole("button", { name: "Recuperar sesión" }));
  expect(state.refresh).toHaveBeenCalledTimes(1);
  fireEvent.click(within(notice).getByRole("button", { name: "Cerrar sesión" }));
  expect(state.logout).toHaveBeenCalledTimes(1);
  state.pending = true;
  view.rerender(<Shell>Contenido</Shell>);
  for (const button of within(notice).getAllByRole("button")) expect(button).toBeDisabled();
});

it("offers the existing renewal action when the session is about to expire", () => {
  state.session.authenticated = true;
  state.now = 1000; state.expires = 61000;
  render(<Shell>Contenido</Shell>);
  const notice = screen.getByRole("region", { name: "Tu sesión está por finalizar" });
  fireEvent.click(within(notice).getByRole("button", { name: "Mantener sesión" }));
  expect(state.refresh).toHaveBeenCalledTimes(1);
});

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
  expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Normas comunitarias" })).toHaveAttribute("href", "/normas");
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
