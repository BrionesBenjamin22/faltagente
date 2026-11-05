import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { matchesService } from "./service";
import MatchPage from "@/app/partidos/[id]/page";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([404, 400])("uses the existing not-found convention for API %i", async status => {
  vi.spyOn(matchesService, "detail").mockRejectedValue(new ApiError(status, "NOT_FOUND", "No existe"));
  await expect(MatchPage({ params: Promise.resolve({ id: "unknown" }) })).rejects.toThrow("NEXT_NOT_FOUND");
});
it("keeps recoverable errors within the detail's client query", async () => {
  vi.spyOn(matchesService, "detail").mockRejectedValue(new Error("offline"));
  const page = await MatchPage({ params: Promise.resolve({ id: "id" }) });
  expect(page.props).toEqual({ id: "id", initialData: undefined });
});

it("shows loading on the real client recovery path after server retrieval fails", async () => {
  vi.spyOn(matchesService, "detail").mockRejectedValueOnce(new Error("server temporarily offline"));
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  const page = await MatchPage({ params: Promise.resolve({ id: "id" }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Cargando partido…")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a partidos" })).toHaveAttribute("href", "/partidos");
  view.unmount();
  client.clear();
});
