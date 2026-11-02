import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MatchCard } from "./match-card";
import type { Match, MatchSport, MatchSportFormat } from "./service";

const baseMatch = {
  id: "match-1",
  location: { id: "location-1", name: "Tolosa", type: "LOCALIDAD" },
  startsAt: "2026-11-01T22:00:00Z",
  venueName: "Club de encuentro",
  address: "Calle 1",
  pricePerPerson: "5000",
  availablePlaces: 2,
  status: "OPEN",
  description: null,
} satisfies Omit<Match, "sport" | "sportFormat">;

it.each<{ sport: MatchSport; sportFormat: MatchSportFormat | null; label: string }>([
  {
    sport: { id: "sport-football", name: "Fútbol", slug: "futbol" },
    sportFormat: { id: "format-football-5", name: "Fútbol 5", slug: "futbol-5" },
    label: "Fútbol · Fútbol 5 · Tolosa",
  },
  {
    sport: { id: "sport-padel", name: "Pádel", slug: "padel" },
    sportFormat: { id: "format-doubles", name: "Dobles", slug: "dobles" },
    label: "Pádel · Dobles · Tolosa",
  },
  {
    sport: { id: "sport-volleyball", name: "Vóley", slug: "voley" },
    sportFormat: null,
    label: "Vóley · Tolosa",
  },
])("shows $sport.name with its optional format from the API", ({ sport, sportFormat, label }) => {
  render(<MatchCard match={{ ...baseMatch, sport, sportFormat }} />);

  expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: baseMatch.venueName })).toBeInTheDocument();
  expect(screen.getByText("2 lugares disponibles")).toBeInTheDocument();
});
