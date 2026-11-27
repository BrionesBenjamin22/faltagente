"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useSession } from "@/features/auth/session";
import { SessionLoading } from "@/features/auth/session-loading";
import { useSports } from "@/features/sports/hooks";
import { useLocations } from "@/features/locations/hooks";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "../service";
import type { MatchManagement } from "../types";
import { MatchFormFields } from "../publication/match-form-fields";
import type { CreateMatchValues } from "../publication/create-validation";
import { matchEditInput, matchEditValues } from "./edit-validation";
import { useUpdateMatch } from "./use-match-mutations";
import styles from "../publication/create-match.module.css";

export function EditMatchScreen({ id }: { id: string }) {
  const session = useSession();
  const router = useRouter();
  const ownerId = session.session?.authenticated ? session.session.user?.id : undefined;
  useEffect(() => { if (!session.isPending && !session.isError && !ownerId) router.replace("/auth/login"); }, [session.isPending, session.isError, ownerId, router]);
  if (session.isPending) return <SessionLoading />;
  if (session.isError) return <><p className="error" role="alert">{errorMessage(session.error)}</p><button className="button secondary" onClick={() => void session.refetch()}>Reintentar sesión</button></>;
  if (!ownerId) return <p role="status">Ingresá para editar tu partido.</p>;
  return <LoadEditMatch key={`${ownerId}:${id}`} id={id} ownerId={ownerId} />;
}

function LoadEditMatch({ id, ownerId }: { id: string; ownerId: string }) {
  const [revision, setRevision] = useState(0);
  const { synchronize } = useSession();
  const router = useRouter();
  const query = useQuery({ queryKey: ["match-management", ownerId, id], queryFn: () => matchesService.management(id), retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1 });
  useEffect(() => { if (query.error instanceof ApiError && query.error.status === 401) void synchronize().then(() => router.replace("/auth/login")); }, [query.error, synchronize, router]);
  if (query.isPending) return <p role="status">Cargando partido para editar…</p>;
  if (!query.data) return <><p role="alert" className="error">{errorMessage(query.error)}</p><button type="button" className="button secondary" onClick={() => void query.refetch()}>Reintentar partido</button><Link href={`/partidos/${id}`}>Volver al detalle</Link></>;
  if (!query.data.canEdit) return <><p role="status">Este partido no se puede editar porque fue cancelado o ya comenzó.</p><Link href={`/partidos/${id}`}>Volver al detalle</Link></>;
  return <>{query.isError ? <p role="alert" className="error">{errorMessage(query.error)} Tus cambios siguen en el formulario.</p> : null}<EditMatchForm key={revision} initial={query.data} ownerId={ownerId} reload={async () => { const result = await query.refetch(); if (result.isSuccess) setRevision(value => value + 1); }} /></>;
}

function EditMatchForm({ initial, ownerId, reload }: { initial: MatchManagement; ownerId: string; reload: () => Promise<unknown> }) {
  // Keep the original response together with its version throughout editing.
  const [baseline] = useState(initial);
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reloading, setReloading] = useState(false);
  const session = useSession();
  const router = useRouter();
  const sports = useSports();
  const locations = useLocations();
  const mutation = useUpdateMatch(ownerId, baseline.id);
  const form = useForm<CreateMatchValues>({ defaultValues: matchEditValues(baseline) });
  const busy = form.formState.isSubmitting || saved || reloading;
  async function submit(values: CreateMatchValues) {
    if (mutation.isPending || saved || conflict) return;
    setFeedback(""); form.clearErrors();
    const { input, errors } = matchEditInput(values, baseline);
    if (input.sportId && !sports.data?.some(sport => sport.id === input.sportId)) errors.sportId = "Seleccione un deporte disponible.";
    const chosenSport = sports.data?.find(sport => sport.id === (input.sportId ?? baseline.sport.id));
    if (input.sportFormatId && !chosenSport?.formats.some(format => format.id === input.sportFormatId)) errors.sportFormatId = "Seleccione un formato activo del deporte elegido.";
    if (input.locationId && !locations.data?.some(location => location.id === input.locationId)) errors.locationId = "Seleccione una localidad disponible.";
    const invalid = Object.keys(errors) as (keyof CreateMatchValues)[];
    if (invalid.length) { invalid.forEach(key => form.setError(key, { message: errors[key] })); form.setFocus(invalid[0]); return; }
    if (Object.keys(input).length === 1) { setFeedback("No hay cambios para guardar"); return; }
    try {
      await mutation.mutateAsync(input);
      setSaved(true);
      router.replace(`/partidos/${baseline.id}?success=match-updated`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { await session.synchronize(); router.replace("/auth/login"); }
      if (error instanceof ApiError && error.code === "MATCH_VERSION_CONFLICT") setConflict(true);
      setFeedback(errorMessage(error));
    }
  }
  return <div className={styles.page}>
    <header className={styles.header}><h1>Editar partido</h1><p className="muted">Actualizá la información de tu partido.</p></header>
    {(baseline.hasConfirmedParticipants || baseline.hasActiveWaitlist) ? <p id="edit-restrictions" className="notice">Hay participantes confirmados, solicitudes en espera u ofertas pendientes. Sólo podés editar la descripción y la capacidad; los demás datos deben conservarse.</p> : null}
    {!baseline.canAdjustCapacity ? <p className="notice">No pudimos verificar la consistencia de los cupos. Podés editar la descripción. Recargá el partido antes de ajustar la capacidad.</p> : null}
    <form className={styles.form} noValidate onSubmit={form.handleSubmit(submit)} onChange={() => { if (feedback === "No hay cambios para guardar") setFeedback(""); }} aria-busy={busy} aria-describedby={(baseline.hasConfirmedParticipants || baseline.hasActiveWaitlist) ? "edit-restrictions" : undefined}>
      <MatchFormFields form={form} busy={busy} initial={baseline} />
      {feedback ? <p className={feedback === "No hay cambios para guardar" ? "notice" : "error"} role={feedback === "No hay cambios para guardar" ? "status" : "alert"}>{feedback}</p> : null}
      {conflict ? <div className="notice"><p>El partido cambió mientras lo editabas. Tus datos siguen en el formulario. Recargá la versión actual para revisarlos antes de guardar; se descartarán los cambios sin guardar.</p><button type="button" className="button secondary" disabled={busy} onClick={async () => { setReloading(true); try { await reload(); } finally { setReloading(false); } }}>Recargar versión actual</button></div> : null}
      <div className="actions"><button className="button" type="submit" disabled={busy || conflict}>{busy ? "Guardando…" : "Guardar cambios"}</button><Link className="button secondary" href={`/partidos/${baseline.id}`}>Volver</Link></div>
    </form>
  </div>;
}
