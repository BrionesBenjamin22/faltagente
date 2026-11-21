import { matchDateFormat, matchPriceFormat } from "../format";
import type { MatchHistoryPage } from "../types";

const fields: Record<string, string> = { sport: "Deporte", sportId: "Deporte", sportFormat: "Formato", sportFormatId: "Formato", location: "Localidad", locationId: "Localidad", startsAt: "Fecha y hora", placeName: "Lugar", venueName: "Lugar", address: "Dirección", pricePerPerson: "Precio por persona", totalPlaces: "Capacidad", availablePlaces: "Lugares disponibles", description: "Descripción", status: "Estado", cancelledAt: "Fecha de cancelación", cancellationReason: "Motivo de cancelación" };
const states: Record<string, string> = { OPEN: "Abierto", CLOSED: "Completo", CANCELLED: "Cancelado" };
const events = { PUBLISHED: "Partido publicado", UPDATED: "Partido actualizado", CANCELLED: "Partido cancelado" };
function valueLabel(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Sin informar";
  if (typeof value === "object") return "name" in value && typeof value.name === "string" ? value.name : JSON.stringify(value);
  if ((field === "startsAt" || field === "cancelledAt") && typeof value === "string" && Number.isFinite(Date.parse(value))) return matchDateFormat.format(new Date(value));
  if (field === "pricePerPerson" && Number.isFinite(Number(value))) return matchPriceFormat.format(Number(value));
  if (field === "status") return states[String(value)] ?? String(value);
  return String(value);
}
export function HistoryChanges({ item }: { item: MatchHistoryPage["items"][number] }) {
  return <><p>{events[item.event]}</p>{item.event !== "PUBLISHED" ? <dl className="audit-data">{Object.entries(item.changes).map(([field, change]) => <div key={field}><dt>{fields[field] ?? field}</dt><dd>{valueLabel(field, change.before)} → {valueLabel(field, change.after)}</dd></div>)}</dl> : null}</>;
}
