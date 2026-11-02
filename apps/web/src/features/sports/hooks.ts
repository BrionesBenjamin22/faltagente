"use client";
import { useQuery } from "@tanstack/react-query";
import { sportsService } from "./service";

export function useSports() {
  return useQuery({ queryKey: ["sports"], queryFn: sportsService.list, staleTime: 300_000 });
}
