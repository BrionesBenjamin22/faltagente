"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useSession } from "@/features/auth/session";
import { SessionLoading } from "@/features/auth/session-loading";
import { LocationCombobox } from "@/features/locations/location-combobox";
import { useLocations } from "@/features/locations/hooks";
import { useSports } from "@/features/sports/hooks";
import { ApiError, errorMessage } from "@/lib/http";
import { useCreateMatch } from "./hooks";
import { createMatchInput, createMatchSchema, type CreateMatchValues } from "./create-validation";
import styles from "./create-match.module.css";

export function CreateMatchScreen() {
  const session = useSession();
  const router = useRouter();
  const authenticated = !!session.session?.authenticated;
  useEffect(() => {
    if (!session.isPending && !session.isError && !authenticated) router.replace("/auth/login");
  }, [session.isPending, session.isError, authenticated, router]);
  if (session.isPending) return <SessionLoading />;
  if (session.isError) return <><p className="error" role="alert">{errorMessage(session.error)}</p><button type="button" className="button secondary" onClick={() => void session.refetch()}>Reintentar sesión</button></>;
  if (!authenticated) return <p role="status">Ingresá para publicar un partido.</p>;
  return <CreateMatchForm key={session.session?.user?.id} />;
}

function CreateMatchForm() {
  const session = useSession();
  const router = useRouter();
  const sports = useSports();
  const locations = useLocations();
  const mutation = useCreateMatch();
  const [feedback, setFeedback] = useState("");
  const [published, setPublished] = useState(false);
  const { register: registerField, clearErrors, control, handleSubmit, setError, setFocus, setValue, formState: { errors, isSubmitting } } = useForm<CreateMatchValues>({
    defaultValues: { sportId: "", sportFormatId: "", locationId: session.session?.user?.primaryLocation?.id ?? "", date: "", time: "", placeName: "", address: "", pricePerPerson: "", totalPlaces: "", description: "" },
  });
  const register = (name: keyof CreateMatchValues, options: Parameters<typeof registerField>[1] = {}) => registerField(name, { ...options, onChange: event => { clearErrors(name); if (name === "date" || name === "time") { clearErrors("date"); clearErrors("time"); } void options.onChange?.(event); } });
  const sportId = useWatch({ control, name: "sportId" });
  const selectedSport = sports.data?.find(sport => sport.id === sportId);
  const busy = isSubmitting || published;
  async function submit(values: CreateMatchValues) {
    if (published || mutation.isPending) return;
    setFeedback("");
    const parsed = createMatchSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach(issue => setError(issue.path[0] as keyof CreateMatchValues, { message: issue.message }));
      setFocus(parsed.error.issues[0].path[0] as keyof CreateMatchValues);
      return;
    }
    if (!sports.data?.some(sport => sport.id === parsed.data.sportId)) { setError("sportId", { message: "Seleccione un deporte disponible." }, { shouldFocus: true }); return; }
    if (parsed.data.sportFormatId && !selectedSport?.formats.some(format => format.id === parsed.data.sportFormatId)) { setError("sportFormatId", { message: "Seleccione un formato del deporte elegido." }, { shouldFocus: true }); return; }
    if (!locations.data?.some(location => location.id === parsed.data.locationId)) { setError("locationId", { message: "Seleccione una localidad disponible." }); return; }
    try {
      await mutation.mutateAsync(createMatchInput(parsed.data));
      setPublished(true);
      router.replace("/?success=match-created");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await session.synchronize();
        router.replace("/auth/login");
      }
      setFeedback(error instanceof ApiError && error.code === "PARTICIPATION_DATE_CONFLICT" ? "Lo sentimos! Ya tenés una participación confirmada en esa fecha. Elegí otro día para publicar." : errorMessage(error));
    }
  }
  const fieldError = (name: keyof CreateMatchValues) => errors[name] ? <p id={`create-${name}-error`} className="error">{errors[name]?.message}</p> : null;
  const describedBy = (name: keyof CreateMatchValues, help?: string) => [help, errors[name] ? `create-${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <div className={styles.page}>
    <div className={`actions ${styles.navigation}`}><Link href="/partidos">Volver a partidos</Link><Link href="/mis-partidos">Mis partidos</Link></div>
    <header className={styles.header}><h1>Publicar partido</h1><p className="muted">Ya tenés el lugar. Contá cuándo juegan y cuántos lugares faltan.</p></header>
    <form className={styles.form} onSubmit={handleSubmit(submit)} noValidate aria-busy={busy}>
      <fieldset className={styles.group} disabled={busy}><legend>Qué y cuándo juegan</legend>
        {sports.isPending ? <p role="status">Cargando deportes…</p> : sports.isError ? <><p className="error" role="alert">{errorMessage(sports.error)}</p><button type="button" className="button secondary" onClick={() => void sports.refetch()}>Reintentar deportes</button></> : !sports.data?.length ? <p role="status">No hay deportes disponibles. Intentá nuevamente más tarde.</p> : null}
        <div className={styles.pair}><div className="field"><label htmlFor="create-sportId">Deporte</label><select id="create-sportId" {...register("sportId", { onChange: () => setValue("sportFormatId", "") })} disabled={sports.isPending || sports.isError} aria-invalid={!!errors.sportId} aria-describedby={describedBy("sportId")}><option value="">Elegí un deporte</option>{sports.data?.map(sport => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select>{fieldError("sportId")}</div>
        <div className="field"><label htmlFor="create-sportFormatId">Formato (opcional)</label><select id="create-sportFormatId" {...register("sportFormatId")} disabled={!selectedSport?.formats.length} aria-invalid={!!errors.sportFormatId} aria-describedby={describedBy("sportFormatId")}><option value="">Sin formato</option>{selectedSport?.formats.map(format => <option key={format.id} value={format.id}>{format.name}</option>)}</select>{fieldError("sportFormatId")}</div></div>
        <div className={styles.pair}><div className="field"><label htmlFor="create-date">Fecha</label><input id="create-date" type="date" {...register("date")} aria-invalid={!!errors.date} aria-describedby={describedBy("date", "create-timezone")} />{fieldError("date")}</div><div className="field"><label htmlFor="create-time">Hora</label><input id="create-time" type="time" {...register("time")} aria-invalid={!!errors.time} aria-describedby={describedBy("time", "create-timezone")} />{fieldError("time")}</div></div><p id="create-timezone" className={`muted ${styles.help}`}>Fecha y hora de Buenos Aires (Argentina).</p>
      </fieldset>
      <fieldset className={styles.group} disabled={busy}><legend>Dónde juegan</legend>
        <div className="field"><Controller name="locationId" control={control} render={({ field }) => <LocationCombobox id="create-locationId" label="Localidad" value={field.value} onChange={value => { field.onChange(value); clearErrors("locationId"); }} disabled={busy} invalid={!!errors.locationId} describedBy={describedBy("locationId")} />} />{fieldError("locationId")}</div>
        <div className="field"><label htmlFor="create-placeName">Nombre del lugar</label><input id="create-placeName" placeholder="Por ejemplo, Club del barrio" maxLength={120} {...register("placeName")} aria-invalid={!!errors.placeName} aria-describedby={describedBy("placeName")} />{fieldError("placeName")}</div>
        <div className="field"><label htmlFor="create-address">Dirección</label><input id="create-address" placeholder="Calle, número o esquina" maxLength={200} {...register("address")} aria-invalid={!!errors.address} aria-describedby={describedBy("address")} />{fieldError("address")}</div>
      </fieldset>
      <fieldset className={styles.group} disabled={busy}><legend>Lugares e información</legend><div className={styles.pair}>
        <div className="field"><label htmlFor="create-pricePerPerson">Precio por persona (ARS)</label><input id="create-pricePerPerson" inputMode="decimal" placeholder="Por ejemplo, 5000.00" {...register("pricePerPerson")} aria-invalid={!!errors.pricePerPerson} aria-describedby={describedBy("pricePerPerson", "create-price-help")} /><p id="create-price-help" className={`muted ${styles.help}`}>Usá punto para los decimales. Si es gratis, ingresá 0.</p>{fieldError("pricePerPerson")}</div>
        <div className="field"><label htmlFor="create-totalPlaces">Lugares para jugadores</label><input id="create-totalPlaces" type="number" inputMode="numeric" min={1} max={2147483647} step={1} placeholder="Por ejemplo, 4" {...register("totalPlaces")} aria-invalid={!!errors.totalPlaces} aria-describedby={describedBy("totalPlaces", "create-places-help")} /><p id="create-places-help" className={`muted ${styles.help}`}>Son los lugares que ofrecés. Tu lugar como organizador no se descuenta.</p>{fieldError("totalPlaces")}</div>
      </div><div className="field"><label htmlFor="create-description">Descripción (opcional)</label><textarea id="create-description" className={styles.textarea} placeholder="Nivel de juego o información útil para quienes se sumen" maxLength={2000} {...register("description")} aria-invalid={!!errors.description} aria-describedby={describedBy("description")} />{fieldError("description")}</div></fieldset>
      {feedback ? <p role="alert" className="error">{feedback}</p> : null}
      {published ? <p role="status" className="notice">Partido publicado correctamente. Volviendo al inicio…</p> : null}
      <div className="actions"><button className="button" type="submit" disabled={busy || !sports.data?.length || !locations.data?.length}>{busy ? "Publicando…" : "Publicar partido"}</button><Link href="/partidos" className="button secondary">Volver</Link></div>
    </form>
  </div>;
}
