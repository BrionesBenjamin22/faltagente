import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

const rewrites = nextConfig.rewrites;

if (!rewrites) throw new Error("Next config must define rewrites.");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API proxy rewrites", () => {
  it("does not configure a proxy without a backend URL outside Vercel", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("API_INTERNAL_URL", "");
    expect(await rewrites()).toEqual([]);
  });

  it("preserves the /api/v1 prefix while routing browser requests to the backend", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("API_INTERNAL_URL", "https://falta-gente-api.onrender.com/api/v1");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/v1");

    expect(await rewrites()).toEqual([
      {
        source: "/api/v1/:path*",
        destination: "https://falta-gente-api.onrender.com/api/v1/:path*",
      },
    ]);
  });

  it("fails closed when the Vercel backend URL or public same-origin base is missing", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("API_INTERNAL_URL", "");
    await expect(rewrites()).rejects.toThrow("API_INTERNAL_URL");

    vi.stubEnv("API_INTERNAL_URL", "https://api.example.test/api/v1");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    await expect(rewrites()).rejects.toThrow("NEXT_PUBLIC_API_URL");
  });

  it("rejects insecure or incorrectly prefixed production destinations", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/v1");
    vi.stubEnv("API_INTERNAL_URL", "http://api.example.test/api/v1");
    await expect(rewrites()).rejects.toThrow("HTTPS");

    vi.stubEnv("API_INTERNAL_URL", "https://api.example.test");
    await expect(rewrites()).rejects.toThrow("/api/v1");
  });

  it("rejects backend URLs that contain embedded credentials", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("API_INTERNAL_URL", "https://user:password@api.example.test/api/v1");
    await expect(rewrites()).rejects.toThrow("credenciales");
  });
});
