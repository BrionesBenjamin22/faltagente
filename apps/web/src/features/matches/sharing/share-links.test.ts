import { describe, expect, it } from "vitest";
import { canShareMatch, matchShareLinks, matchShareText, matchShareUrl } from "./share-links";

const match = {
  sport: { id: "sport", name: "Vóley & amigos", slug: "voley" },
  sportFormat: { id: "format", name: "6 vs 6", slug: "6" },
  location: { id: "location", name: "Tolosa #1" },
  startsAt: "2026-11-26T01:30:00Z",
};

describe("sharing public match data", () => {
  it("constructs a stable URL using only the frontend origin and match ID", () => {
    expect(matchShareUrl("https://falta-gente.example/partidos?success=1#contacto", "id"))
      .toBe("https://falta-gente.example/partidos/id");
    expect(matchShareUrl("https://falta-gente.example", "id?private=1#hash"))
      .toBe("https://falta-gente.example/partidos/id%3Fprivate%3D1%23hash");
  });
  it("shares the format and Buenos Aires local date, without availability claims", () => {
    const text = matchShareText(match);
    expect(text).toMatch(/^Vóley & amigos · 6 vs 6 en Tolosa #1 — 25 nov 2026, (22:30|10:30 p\. m\.)\./);
    expect(text).toContain("Consultá los detalles y la disponibilidad en Falta Gente.");
    expect(text).not.toContain("lugares disponibles");
  });
  it("supports sports without a format", () => {
    expect(matchShareText({ ...match, sportFormat: null })).toMatch(/^Vóley & amigos en Tolosa/);
  });
  it("encodes special characters and includes the URL exactly once at each fixed destination", () => {
    const url = "https://falta-gente.example/partidos/id";
    const text = matchShareText(match);
    const links = matchShareLinks(url, text).map(link => new URL(link.href));
    expect(links.map(link => link.origin)).toEqual(["https://wa.me", "https://t.me", "https://x.com"]);
    expect(links[0].searchParams.get("text")).toBe(`${text}\n${url}`);
    for (const link of links.slice(1)) {
      expect(link.searchParams.get("url")).toBe(url);
      expect(link.searchParams.get("text")).toBe(text);
    }
    for (const link of links) expect(decodeURIComponent(link.href).split(url)).toHaveLength(2);
  });
  it.each(["OPEN", "CLOSED"] as const)("allows future %s matches, including full matches", status => {
    expect(canShareMatch({ ...match, status }, Date.parse(match.startsAt) - 1)).toBe(true);
  });
  it("rejects cancelled, invalid, started and past matches", () => {
    expect(canShareMatch({ ...match, status: "CANCELLED" }, 0)).toBe(false);
    expect(canShareMatch({ startsAt: "invalid", status: "OPEN" }, 0)).toBe(false);
    expect(canShareMatch({ ...match, status: "OPEN" }, Date.parse(match.startsAt))).toBe(false);
    expect(canShareMatch({ ...match, status: "OPEN" }, Date.parse(match.startsAt) + 1)).toBe(false);
  });
});
