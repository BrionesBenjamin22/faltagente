import { matchDateFormat } from "../format";
import type { MatchDetail } from "../types";

export function canShareMatch(match: Pick<MatchDetail, "status" | "startsAt">, now: number): boolean {
  return (match.status === "OPEN" || match.status === "CLOSED") && Date.parse(match.startsAt) > now;
}

export function matchShareUrl(origin: string, id: string): string {
  return new URL(`/partidos/${encodeURIComponent(id)}`, new URL(origin).origin).href;
}

export function matchShareText(match: Pick<MatchDetail, "sport" | "sportFormat" | "location" | "startsAt">): string {
  return `${match.sport.name}${match.sportFormat ? ` · ${match.sportFormat.name}` : ""} en ${match.location.name} — ${matchDateFormat.format(new Date(match.startsAt))}. Consultá los detalles y la disponibilidad en Falta Gente.`;
}

export function matchShareLinks(url: string, text: string) {
  return [
    { name: "WhatsApp", href: `https://wa.me/?${new URLSearchParams({ text: `${text}\n${url}` })}` },
    { name: "Telegram", href: `https://t.me/share/url?${new URLSearchParams({ url, text })}` },
    { name: "X", href: `https://x.com/intent/tweet?${new URLSearchParams({ url, text })}` },
  ];
}
