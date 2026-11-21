import { z } from "zod";
import { validLocalDate } from "../local-date";
import type { CreateMatchInput } from "../types";

export const createMatchSchema = z.object({
  sportId: z.string().uuid("Seleccione un deporte."),
  sportFormatId: z.union([z.literal(""), z.string().uuid("Seleccione un formato válido.")]),
  locationId: z.string().uuid("Seleccione una localidad."),
  date: z.string().refine(validLocalDate, "Ingrese una fecha válida."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingrese una hora válida."),
  placeName: z.string().trim().min(2, "Ingrese al menos 2 caracteres.").max(120, "Utilice hasta 120 caracteres."),
  address: z.string().trim().min(2, "Ingrese al menos 2 caracteres.").max(200, "Utilice hasta 200 caracteres."),
  pricePerPerson: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/, "Ingrese un precio no negativo, con hasta 8 enteros y 2 decimales."),
  totalPlaces: z.string().regex(/^\d+$/, "Ingrese una cantidad entera de lugares.").refine(value => Number(value) >= 1 && Number(value) <= 2147483647, "Ingrese entre 1 y 2147483647 lugares."),
  description: z.string().trim().max(2000, "Utilice hasta 2000 caracteres."),
}).superRefine((values, context) => {
  if (validLocalDate(values.date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(values.time) && Date.parse(`${values.date}T${values.time}:00-03:00`) <= Date.now()) {
    context.addIssue({ code: "custom", path: ["date"], message: "Seleccione una fecha y hora futuras." });
  }
});

export type CreateMatchValues = z.input<typeof createMatchSchema>;
export function createMatchInput(values: z.output<typeof createMatchSchema>): CreateMatchInput {
  return {
    sportId: values.sportId,
    sportFormatId: values.sportFormatId || null,
    locationId: values.locationId,
    startsAt: `${values.date}T${values.time}:00-03:00`,
    placeName: values.placeName,
    address: values.address,
    pricePerPerson: values.pricePerPerson,
    totalPlaces: Number(values.totalPlaces),
    description: values.description || null,
  };
}
