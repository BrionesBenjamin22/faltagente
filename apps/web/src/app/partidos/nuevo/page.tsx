import type { Metadata } from "next";
import { CreateMatchScreen } from "@/features/matches/publication/create-match";

export const metadata: Metadata = { title: "Publicar partido | Falta Gente" };
export default function NewMatchPage() { return <CreateMatchScreen />; }
