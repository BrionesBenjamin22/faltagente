import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Providers, useSession } from "./session";

afterEach(() => vi.unstubAllGlobals());
function Logout({ login = false }: { login?: boolean }) {
  const session = useSession();
  return <><button disabled={session.pending || session.isPending} onClick={() => void session.logout()}>Salir</button><p>{login ? "Login" : session.session?.authenticated ? "Cuenta" : "Visitante"}</p><p data-testid="inline">{session.feedback}</p></>;
}
function mockApi(fail = false) {
  let authenticated = true;
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "test-csrf" }));
    if (path.endsWith("/auth/logout")) {
      if (fail) return new Response(JSON.stringify({ code: "INTERNAL_SERVER_ERROR", message: "private debug" }), { status: 500 });
      authenticated = false;
      return new Response(JSON.stringify({ message: "OK" }));
    }
    return new Response(JSON.stringify({ authenticated, user: authenticated ? { id: "test-user" } : null, refreshAvailable: authenticated }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("emits logout once after the existing credentialed CSRF flow and never rebuilds it on navigation or reload", async () => {
  const fetchMock = mockApi();
  const view = render(<StrictMode><Providers><Logout /></Providers></StrictMode>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Salir" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  expect(await screen.findByText("Sesión cerrada correctamente.")).toBeInTheDocument();
  expect(screen.getAllByText("Sesión cerrada correctamente.")).toHaveLength(1);
  expect(screen.getByTestId("inline")).toBeEmptyDOMElement();
  expect(screen.getByText("Visitante")).toBeInTheDocument();
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const logout = calls.find(([url]) => url.endsWith("/auth/logout"))!;
  expect(logout[1]).toMatchObject({ method: "POST", credentials: "include", headers: { "X-CSRF-Token": "test-csrf" } });
  expect(calls.filter(([url]) => url.endsWith("/auth/logout"))).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar notificación" }));
  await waitFor(() => expect(screen.queryByText("Sesión cerrada correctamente.")).not.toBeInTheDocument());
  view.rerender(<StrictMode><Providers><Logout login /></Providers></StrictMode>);
  expect(screen.getByText("Login")).toBeInTheDocument();
  expect(screen.queryByText("Sesión cerrada correctamente.")).not.toBeInTheDocument();
  view.unmount();
  render(<Providers><Logout /></Providers>);
  expect(screen.queryByText("Sesión cerrada correctamente.")).not.toBeInTheDocument();
});

it("keeps logout failures inline and does not emit a success", async () => {
  mockApi(true);
  render(<Providers><Logout /></Providers>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Salir" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Salir" }));
  await waitFor(() => expect(screen.getByTestId("inline")).toHaveTextContent("Lo sentimos!"));
  expect(screen.queryByText("Sesión cerrada correctamente.")).not.toBeInTheDocument();
  expect(screen.queryByText("private debug")).not.toBeInTheDocument();
  expect(screen.getByText("Cuenta")).toBeInTheDocument();
});
