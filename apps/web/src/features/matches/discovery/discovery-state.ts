"use client";
import { useSyncExternalStore } from "react";
import { validLocalDate } from "../local-date";
import type { MatchFilters } from "../types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const changed = "discovery-filters-change";
function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener(changed, notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener(changed, notify); };
}
function snapshot() { return window.location.search; }
function serverSnapshot() { return ""; }

export function parseDiscovery(search: string): MatchFilters & { locationId?: string } {
  const params = new URLSearchParams(search);
  const id = (key: string) => { const value = params.get(key); return value && uuid.test(value) ? value : undefined; };
  const sportId = id("sport");
  const date = params.get("date") ?? "";
  return { locationId: id("location"), sportId, sportFormatId: sportId ? id("format") : undefined, date: validLocalDate(date) ? date : undefined };
}
export function writeDiscovery(values: MatchFilters & { locationId?: string }, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of [["location", values.locationId], ["sport", values.sportId], ["format", values.sportFormatId], ["date", values.date]]) {
    if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history[replace ? "replaceState" : "pushState"](window.history.state, "", next);
  window.dispatchEvent(new Event(changed));
}
export function useDiscoverySearch() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }
