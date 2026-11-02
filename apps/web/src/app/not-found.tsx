import type { Metadata } from "next";
import { NotFoundGlitch } from "@/components/ui/be-ui-404-not-found";

export const metadata: Metadata = { title: "Página no encontrada | Falta Gente" };

export default function NotFound() {
  return <NotFoundGlitch />;
}
