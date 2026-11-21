import { expect, it } from "vitest";
import { getSupportContact } from "./support-contact";

it("builds one recipient and a fixed subject without collecting personal data", () => {
  const contact = getSupportContact("soporte@example.com");
  expect(contact?.email).toBe("soporte@example.com");
  const link = new URL(contact!.href);
  expect(link.protocol).toBe("mailto:");
  expect(decodeURIComponent(link.pathname)).toBe("soporte@example.com");
  expect([...link.searchParams]).toEqual([["subject", "Falta Gente: quejas y sugerencias"]]);
  expect(link.hash).toBe("");
});

it("accepts surrounding spaces and safely encodes an address alias", () => {
  const contact = getSupportContact("  soporte+beta@example.com  ");
  expect(contact?.email).toBe("soporte+beta@example.com");
  expect(decodeURIComponent(new URL(contact!.href).pathname)).toBe("soporte+beta@example.com");
});

it.each([
  undefined, "", "   ", "correo-invalido", "soporte@", "@example.com",
  "soporte@example.com,otro@example.com", "soporte@example.com;otro@example.com",
  "soporte@example.com?bcc=otro@example.com", "soporte@example.com&body=privado",
  "soporte@example.com#fragmento", "mailto:soporte@example.com",
  "soporte\r\nBcc:otro@example.com", "soporte@example.com\nBcc:otro@example.com",
  "soporte%0d%0aBcc@example.com", "soporte%3Fbody@example.com",
  "so porte@example.com", `${"a".repeat(250)}@example.com`,
])("does not offer a contact for absent, malformed or injected configuration: %s", (value) => {
  expect(getSupportContact(value)).toBeNull();
});
