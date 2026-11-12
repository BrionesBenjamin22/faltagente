import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/http";
import { matchesService } from "@/features/matches/service";
import type { MatchDetail } from "@/features/matches/types";
import { MatchDetailScreen } from "@/features/matches/detail/match-detail";

export const metadata: Metadata = { title: "Detalle de partido | Falta Gente" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let match: MatchDetail | undefined;
  try {
    match = await matchesService.detail(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    // Recoverable API errors use the same client query and its retry action.
  }
  return <MatchDetailScreen key={id} id={id} initialData={match} />;
}
