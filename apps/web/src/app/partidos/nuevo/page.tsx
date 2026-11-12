import type { Metadata } from "next";
import { CreateMatchScreen } from "@/features/matches/create-match";

export const metadata: Metadata = { title: "Publicar partido | Falta Gente" };
export default function NewMatchPage() { return <CreateMatchScreen />; }
