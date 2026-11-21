import type { Metadata } from "next";
import { CommunityGuidelines } from "@/features/community/community-guidelines";

export const metadata: Metadata = {
  title: "Normas comunitarias | Falta Gente",
  description: "Pautas de convivencia y compromiso para compartir partidos en Falta Gente. Consultá el canal de quejas y sugerencias.",
};

export default function CommunityGuidelinesPage() {
  return <CommunityGuidelines supportEmail={process.env.NEXT_PUBLIC_SUPPORT_EMAIL} />;
}
