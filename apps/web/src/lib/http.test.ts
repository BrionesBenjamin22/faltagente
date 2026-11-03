import { afterEach, beforeEach, expect, it, vi } from "vitest";

const publicApi = "http://localhost:3001/api/v1";
const internalApi = "http://api:3001/api/v1";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", publicApi);
  vi.stubEnv("API_INTERNAL_URL", internalApi);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockResponse(status = 200, body: unknown = { id: "match" }) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("uses cookies and obtains a fresh CSRF token before each mutation", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-one" }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }))).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-two" }))).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const { mutate } = await import("./http");
  await mutate("/auth/login", { email: "test@example.com", password: "secret" });
  await mutate("/auth/logout");
  expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: "include", method: "POST", headers: { "X-CSRF-Token": "csrf-one" } });
  expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("csrf-two");
});

it("does not automatically refresh failed authenticated requests", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "Sesión finalizada." }), { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  const { request } = await import("./http");
  await expect(request("/users/me")).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps browser requests on the public API even when an internal URL is configured", async () => {
  const fetch = mockResponse();
  const { request } = await import("./http");
  await expect(request("/matches/match")).resolves.toEqual({ id: "match" });
  expect(fetch).toHaveBeenCalledWith(`${publicApi}/matches/match`, expect.objectContaining({
    credentials: "include", cache: "no-store",
  }));
});

it("uses the internal Docker API for server requests without forwarding cookies", async () => {
  vi.stubGlobal("window", undefined);
  const fetch = mockResponse();
  const { request } = await import("./http");
  await request("/matches/match");
  expect(fetch).toHaveBeenCalledWith(`${internalApi}/matches/match`, expect.objectContaining({
    headers: { "Content-Type": "application/json" }, cache: "no-store",
  }));
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Cookie");
});

it("falls back to the public API for server processes outside Docker", async () => {
  vi.stubGlobal("window", undefined);
  vi.stubEnv("API_INTERNAL_URL", undefined);
  const fetch = mockResponse();
  const { request } = await import("./http");
  await request("/matches/match");
  expect(fetch.mock.calls[0][0]).toBe(`${publicApi}/matches/match`);
});

it("reads the server-only URL at request time rather than freezing it during import", async () => {
  vi.stubGlobal("window", undefined);
  const fetch = mockResponse();
  const { request } = await import("./http");
  vi.stubEnv("API_INTERNAL_URL", "http://replacement-api:3001/api/v1");
  await request("/matches/match");
  expect(fetch.mock.calls[0][0]).toBe("http://replacement-api:3001/api/v1/matches/match");
});

it("preserves the typed not-found error when using the internal API", async () => {
  vi.stubGlobal("window", undefined);
  mockResponse(404, { code: "NOT_FOUND", message: "No existe", requestId: "request" });
  const { request, ApiError } = await import("./http");
  const error = await request("/matches/missing").catch(error => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "No existe" });
});
