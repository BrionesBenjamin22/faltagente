"use client";

import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { LocationCombobox } from "@/features/locations/location-combobox";
import { useLocations } from "@/features/locations/hooks";
import { useSports } from "@/features/sports/hooks";
import { errorMessage } from "@/lib/http";
import type { MatchManagement } from "../types";
import type { CreateMatchValues } from "./create-validation";
import styles from "./create-match.module.css";

export function MatchFormFields({ form, busy, initial }: { form: UseFormReturn<CreateMatchValues>; busy: boolean; initial?: MatchManagement }) {
  const { register: registerField, clearErrors, control, setValue, formState: { errors } } = form;
  const sports = useSports();
  const locations = useLocations();
  const restricted = !!initial?.hasConfirmedParticipants || !!initial?.hasActiveWaitlist;
  const register = (name: keyof CreateMatchValues, options: Parameters<typeof registerField>[1] = {}) => registerField(name, { ...options, onChange: event => { clearErrors(name); if (name === "date" || name === "time") { clearErrors("date"); clearErrors("time"); } void options.onChange?.(event); } });
  const sportId = useWatch({ control, name: "sportId" });
  const sportFormatId = useWatch({ control, name: "sportFormatId" });
  const locationId = useWatch({ control, name: "locationId" });
  const selectedSport = sports.data?.find(sport => sport.id === sportId);
  const fieldError = (name: keyof CreateMatchValues) => errors[name] ? <p id={`create-${name}-error`} className="error">{errors[name]?.message}</p> : null;
  const describedBy = (name: keyof CreateMatchValues, help?: string) => [help, errors[name] ? `create-${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <>
      <fieldset className={styles.group} disabled={busy || restricted}><legend>Qué y cuándo juegan</legend>
        {sports.isPending ? <p role="status">Cargando deportes…</p> : sports.isError ? <><p className="error" role="alert">{errorMessage(sports.error)}</p><button type="button" className="button secondary" onClick={() => void sports.refetch()}>Reintentar deportes</button></> : !sports.data?.length ? <p role="status">No hay deportes disponibles. Intentá nuevamente más tarde.</p> : null}
        <div className={styles.pair}><div className="field"><label htmlFor="create-sportId">Deporte</label><select id="create-sportId" {...register("sportId", { onChange: () => setValue("sportFormatId", "") })} value={sportId} disabled={sports.isPending || sports.isError} aria-invalid={!!errors.sportId} aria-describedby={describedBy("sportId")}><option value="">Elegí un deporte</option>{initial && !sports.data?.some(sport => sport.id === initial.sport.id) ? <option value={initial.sport.id}>{initial.sport.name}{initial.sport.active ? "" : " (inactivo)"}</option> : null}{sports.data?.map(sport => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select>{fieldError("sportId")}</div>
        <div className="field"><label htmlFor="create-sportFormatId">Formato (opcional)</label><select id="create-sportFormatId" {...register("sportFormatId")} value={sportFormatId} disabled={!selectedSport?.formats.length && !initial?.sportFormat} aria-invalid={!!errors.sportFormatId} aria-describedby={describedBy("sportFormatId")}><option value="">Sin formato</option>{initial?.sportFormat && sportId === initial.sport.id && !selectedSport?.formats.some(format => format.id === initial.sportFormat?.id) ? <option value={initial.sportFormat.id}>{initial.sportFormat.name}{initial.sportFormat.active ? "" : " (inactivo)"}</option> : null}{selectedSport?.formats.map(format => <option key={format.id} value={format.id}>{format.name}</option>)}</select>{fieldError("sportFormatId")}</div></div>
        <div className={styles.pair}><div className="field"><label htmlFor="create-date">Fecha</label><input id="create-date" type="date" {...register("date")} aria-invalid={!!errors.date} aria-describedby={describedBy("date", "create-timezone")} />{fieldError("date")}</div><div className="field"><label htmlFor="create-time">Hora</label><input id="create-time" type="time" {...register("time")} aria-invalid={!!errors.time} aria-describedby={describedBy("time", "create-timezone")} />{fieldError("time")}</div></div><p id="create-timezone" className={`muted ${styles.help}`}>Fecha y hora de Buenos Aires (Argentina).</p>
      </fieldset>
      <fieldset className={styles.group} disabled={busy || restricted}><legend>Dónde juegan</legend>
        <div className="field">{initial ? <><label htmlFor="create-locationId">Localidad</label><select id="create-locationId" {...register("locationId")} value={locationId} disabled={locations.isPending || locations.isError} aria-invalid={!!errors.locationId} aria-describedby={describedBy("locationId")}>
          {!locations.data?.some(location => location.id === initial.location.id) ? <option value={initial.location.id}>{initial.location.name}{initial.location.active ? "" : " (inactiva)"}</option> : null}{locations.data?.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>{locations.isError ? <><p role="alert" className="error">{errorMessage(locations.error)}</p><button type="button" className="button secondary" onClick={() => void locations.refetch()}>Reintentar localidades</button></> : null}</> : <Controller name="locationId" control={control} render={({ field }) => <LocationCombobox id="create-locationId" label="Localidad" value={field.value} onChange={value => { field.onChange(value); clearErrors("locationId"); }} disabled={busy} invalid={!!errors.locationId} describedBy={describedBy("locationId")} />} />}{fieldError("locationId")}</div>
        <div className="field"><label htmlFor="create-placeName">Nombre del lugar</label><input id="create-placeName" placeholder="Por ejemplo, Club del barrio" maxLength={120} {...register("placeName")} aria-invalid={!!errors.placeName} aria-describedby={describedBy("placeName")} />{fieldError("placeName")}</div>
        <div className="field"><label htmlFor="create-address">Dirección</label><input id="create-address" placeholder="Calle, número o esquina" maxLength={200} {...register("address")} aria-invalid={!!errors.address} aria-describedby={describedBy("address")} />{fieldError("address")}</div>
      </fieldset>
      <fieldset className={styles.group} disabled={busy}><legend>Lugares e información</legend><div className={styles.pair}>
        <div className="field"><label htmlFor="create-pricePerPerson">Precio por persona (ARS)</label><input id="create-pricePerPerson" disabled={restricted} inputMode="decimal" placeholder="Por ejemplo, 5000.00" {...register("pricePerPerson")} aria-invalid={!!errors.pricePerPerson} aria-describedby={describedBy("pricePerPerson", "create-price-help")} /><p id="create-price-help" className={`muted ${styles.help}`}>Usá punto para los decimales. Si es gratis, ingresá 0.</p>{fieldError("pricePerPerson")}</div>
        <div className="field"><label htmlFor="create-totalPlaces">Lugares para jugadores</label><input id="create-totalPlaces" disabled={!!initial && !initial.canAdjustCapacity} type="number" inputMode="numeric" min={initial ? Math.max(1, initial.occupiedPlaces + (initial.heldPlaces ?? 0)) : 1} max={2147483647} step={1} placeholder="Por ejemplo, 4" {...register("totalPlaces")} aria-invalid={!!errors.totalPlaces} aria-describedby={describedBy("totalPlaces", "create-places-help")} /><p id="create-places-help" className={`muted ${styles.help}`}>Son los lugares que ofrecés. Tu lugar como organizador no se descuenta.{initial && (initial.heldPlaces ?? 0) > 0 ? ` Hay ${initial.heldPlaces} lugares protegidos por ofertas pendientes.` : ""}</p>{fieldError("totalPlaces")}</div>
      </div><div className="field"><label htmlFor="create-description">Descripción (opcional)</label><textarea id="create-description" className={styles.textarea} placeholder="Nivel de juego o información útil para quienes se sumen" maxLength={2000} {...register("description")} aria-invalid={!!errors.description} aria-describedby={describedBy("description")} />{fieldError("description")}</div></fieldset>
  </>;
}
