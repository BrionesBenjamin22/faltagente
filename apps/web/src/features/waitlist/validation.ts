import { z } from "zod";
import { MAX_RESERVATION_PLACES } from "@/features/matches/reservation-limits";

export const waitlistPlacesSchema = (maximum: number) => {
  const limit = Math.min(MAX_RESERVATION_PLACES, maximum);
  return z.number().int("Ingresá una cantidad entera de lugares.").min(1, "Solicitá al menos un lugar.").max(limit, `Podés solicitar hasta ${limit} lugares.`);
};
