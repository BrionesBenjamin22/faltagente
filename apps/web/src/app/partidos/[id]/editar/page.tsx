import type { Metadata } from "next";
import { EditMatchScreen } from "@/features/matches/editing/edit-match";

export const metadata: Metadata = { title: "Editar partido | Falta Gente" };
export default async function EditMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditMatchScreen id={id} />;
}
