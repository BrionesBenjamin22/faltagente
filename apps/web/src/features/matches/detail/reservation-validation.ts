import { z } from "zod";
import { MAX_RESERVATION_PLACES } from "../reservation-limits";
export const reservationReasonSchema = z.string().trim().max(500, "El motivo puede tener hasta 500 caracteres.");
export const retainedPlacesSchema = (currentPlaces: number) => z.number().int("Ingresá una cantidad entera de lugares.").min(1, "Conservá al menos el lugar del titular.").max(Math.min(currentPlaces, MAX_RESERVATION_PLACES), "Sólo podés reducir la cantidad de lugares, hasta un máximo de 100.");
