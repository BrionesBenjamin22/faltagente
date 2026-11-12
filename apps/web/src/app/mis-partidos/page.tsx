import type { Metadata } from "next";
import { MyMatchesScreen } from "@/features/matches/my-matches";

export const metadata: Metadata = { title: "Mis partidos | Falta Gente" };
export default function MyMatchesPage() { return <MyMatchesScreen />; }
