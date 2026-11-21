import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { CommunityGuidelines } from "./community-guidelines";

it("exposes community guidance and feedback without a session provider", () => {
  render(<CommunityGuidelines />);
  expect(screen.getByRole("heading", { level: 1, name: "Normas comunitarias" })).toBeInTheDocument();
  for (const name of [
    "Respetá a quienes comparten el partido",
    "Publicá información clara y honesta",
    "Reservá con el compromiso de ir",
    "Si no podés ir, avisá con tiempo",
  ]) {
    expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  }
  const support = screen.getByRole("region", { name: "Quejas y sugerencias" });
  expect(support).toHaveAttribute("id", "quejas-y-sugerencias");
  expect(screen.getByRole("link", { name: "Ir a quejas y sugerencias" })).toHaveAttribute("href", "#quejas-y-sugerencias");
  expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
});

it.each([undefined, "", "   ", "incorrecto", "soporte@example.com?bcc=otro@example.com"])(
  "shows availability notice without offering a fake send action for %s",
  (supportEmail) => {
    const { container } = render(<CommunityGuidelines supportEmail={supportEmail} />);
    expect(screen.getByText("El canal de soporte estará disponible próximamente.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Escribir a soporte" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  },
);

it("offers external email with manual address fallback and no delivery confirmation", () => {
  render(<CommunityGuidelines supportEmail="soporte@example.com" />);
  const support = screen.getByRole("region", { name: "Quejas y sugerencias" });
  const link = within(support).getByRole("link", { name: "Escribir a soporte" });
  expect(link).toHaveAttribute("href", "mailto:soporte@example.com?subject=Falta%20Gente%3A%20quejas%20y%20sugerencias");
  expect(link).toHaveAccessibleDescription("Se abrirá tu aplicación de correo. Revisá y enviá el mensaje desde allí.");
  expect(within(support).getByText("soporte@example.com")).toBeInTheDocument();
  expect(screen.queryByText("El canal de soporte estará disponible próximamente.")).not.toBeInTheDocument();
  expect(within(support).queryByRole("status")).not.toBeInTheDocument();
  expect(within(support).queryByRole("textbox")).not.toBeInTheDocument();
});
