import { z } from "zod";

export const waitlistPlacesSchema = (maximum: number) => z.number().int("Ingresá una cantidad entera de lugares.").min(1, "Solicitá al menos un lugar.").max(maximum, `Podés solicitar hasta ${maximum} lugares.`);
