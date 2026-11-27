import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // pnpm stores runtime packages outside apps/web in the monorepo root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    const apiBase = process.env.API_INTERNAL_URL?.replace(/\/+$/, "");

    if (process.env.VERCEL && !apiBase) {
      throw new Error("API_INTERNAL_URL es obligatoria para desplegar en Vercel.");
    }

    if (!apiBase) return [];

    let destination: URL;
    try {
      destination = new URL(apiBase);
    } catch {
      throw new Error("API_INTERNAL_URL debe ser una URL absoluta válida.");
    }

    if (
      destination.username ||
      destination.password ||
      destination.pathname.replace(/\/+$/, "") !== "/api/v1" ||
      destination.search ||
      destination.hash
    ) {
      throw new Error("API_INTERNAL_URL debe terminar en /api/v1 sin credenciales, query ni fragmento.");
    }

    if (process.env.VERCEL && destination.protocol !== "https:") {
      throw new Error("API_INTERNAL_URL debe usar HTTPS en Vercel.");
    }

    if (process.env.VERCEL && process.env.NEXT_PUBLIC_API_URL !== "/api/v1") {
      throw new Error("NEXT_PUBLIC_API_URL debe ser /api/v1 en Vercel.");
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
