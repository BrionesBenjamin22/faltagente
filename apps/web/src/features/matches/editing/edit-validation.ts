import { createMatchSchema, type CreateMatchValues } from "../publication/create-validation";
import type { MatchManagement, UpdateMatchInput } from "../types";

const localParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function matchEditValues(match: MatchManagement): CreateMatchValues {
  const parts = Object.fromEntries(localParts.formatToParts(new Date(match.startsAt)).map(part => [part.type, part.value]));
  return { sportId: match.sport.id, sportFormatId: match.sportFormat?.id ?? "", locationId: match.location.id, date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, placeName: match.placeName, address: match.address, pricePerPerson: match.pricePerPerson, totalPlaces: String(match.totalPlaces), description: match.description ?? "" };
}

// Validate only effective changes: unchanged historical values need no replacement.
export function matchEditInput(values: CreateMatchValues, match: MatchManagement): { input: UpdateMatchInput; errors: Partial<Record<keyof CreateMatchValues, string>> } {
  const original = matchEditValues(match);
  const input: UpdateMatchInput = { expectedVersion: match.version };
  const errors: Partial<Record<keyof CreateMatchValues, string>> = {};
  const restricted = match.hasConfirmedParticipants || !!match.hasActiveWaitlist;
  for (const key of Object.keys(original) as (keyof CreateMatchValues)[]) {
    if (key === "date" || key === "time") continue;
    const value = values[key].trim();
    const before = original[key].trim();
    const equal = key === "pricePerPerson" || key === "totalPlaces" ? value !== "" && Number(value) === Number(before) : value === before;
    if (equal) continue;
    if (restricted && key !== "description" && key !== "totalPlaces") { errors[key] = "Con participantes, espera u ofertas sólo podés cambiar descripción y capacidad."; continue; }
    if (key === "totalPlaces" && !match.canAdjustCapacity) { errors[key] = "No pudimos verificar los cupos. Intentá recargar el partido."; continue; }
    const parsed = createMatchSchema.shape[key].safeParse(value);
    if (!parsed.success) { errors[key] = parsed.error.issues[0].message; continue; }
    if (key === "totalPlaces") {
      if (Number(value) < match.occupiedPlaces + (match.heldPlaces ?? 0)) errors[key] = `La capacidad debe conservar al menos ${match.occupiedPlaces + (match.heldPlaces ?? 0)} lugares confirmados o protegidos.`;
      else input.totalPlaces = Number(value);
    } else if (key === "description" || key === "sportFormatId") input[key] = parsed.data || null;
    else input[key] = parsed.data;
  }
  if (values.date !== original.date || values.time !== original.time) {
    const date = createMatchSchema.shape.date.safeParse(values.date);
    const time = createMatchSchema.shape.time.safeParse(values.time);
    if (!date.success) errors.date = date.error.issues[0].message;
    if (!time.success) errors.time = time.error.issues[0].message;
    if (restricted) errors.date = "No podés cambiar la fecha con participantes, espera u ofertas.";
    else if (date.success && time.success) {
      const startsAt = `${values.date}T${values.time}:00-03:00`;
      if (Date.parse(startsAt) <= Date.now()) errors.date = "Seleccione una fecha y hora futuras.";
      else if (Date.parse(startsAt) !== Date.parse(match.startsAt)) input.startsAt = startsAt;
    }
  }
  return { input, errors };
}
