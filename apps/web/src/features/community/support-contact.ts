import { z } from "zod";

const supportEmailSchema = z.string().trim().max(254).email().refine(
  (email) => !/[\s%?&#,;:]/u.test(email),
);

export type SupportContact = { email: string; href: string };

export function getSupportContact(value: string | undefined): SupportContact | null {
  const result = supportEmailSchema.safeParse(value);
  if (!result.success) return null;

  const email = result.data;
  const recipient = encodeURIComponent(email).replace("%40", "@");
  const subject = encodeURIComponent("Falta Gente: quejas y sugerencias");
  return { email, href: `mailto:${recipient}?subject=${subject}` };
}
