import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { Landing } from "./landing";

it("presents all four sports equally while preserving the hero and navigation", () => {
  render(<Landing />);
  expect(screen.getByText("Partidos en Argentina")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Te falta uno.A alguien le falta partido.");
  expect(screen.getByText(/Encontrá el deporte que quieras cerca tuyo, sin conocer al organizador ni depender de un grupo/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Buscar un partido" })).toHaveAttribute("href", "/partidos");
  expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/auth/register");
  expect(screen.getByText("Explorá los partidos sin crear una cuenta.")).toBeInTheDocument();
  const sports = within(screen.getByRole("list", { name: "Deportes disponibles" })).getAllByRole("listitem");
  expect(sports.map(sport => sport.textContent)).toEqual(["Fútbol", "Pádel", "Básquet", "Vóley"]);
});
