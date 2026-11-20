"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useSession } from "@/features/auth/session";
import { SessionLoading } from "@/features/auth/session-loading";
import { useLocations } from "@/features/locations/hooks";
import { useSports } from "@/features/sports/hooks";
import { ApiError, errorMessage } from "@/lib/http";
import { useCreateMatch } from "./use-create-match";
import { createMatchInput, createMatchSchema, type CreateMatchValues } from "./create-validation";
import styles from "./create-match.module.css";
import { MatchFormFields } from "./match-form-fields";

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
  const form = useForm<CreateMatchValues>({
    defaultValues: { sportId: "", sportFormatId: "", locationId: session.session?.user?.primaryLocation?.id ?? "", date: "", time: "", placeName: "", address: "", pricePerPerson: "", totalPlaces: "", description: "" },
  });
  const { control, handleSubmit, setError, setFocus, formState: { isSubmitting } } = form;
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
  return <div className={styles.page}>
    <div className={`actions ${styles.navigation}`}><Link href="/partidos">Volver a partidos</Link><Link href="/mis-partidos">Mis partidos</Link></div>
    <header className={styles.header}><h1>Publicar partido</h1><p className="muted">Ya tenés el lugar. Contá cuándo juegan y cuántos lugares faltan.</p></header>
    <form className={styles.form} onSubmit={handleSubmit(submit)} noValidate aria-busy={busy}>
      <MatchFormFields form={form} busy={busy} />
      {feedback ? <p role="alert" className="error">{feedback}</p> : null}
      {published ? <p role="status" className="notice">Partido publicado correctamente. Volviendo al inicio…</p> : null}
      <div className="actions"><button className="button" type="submit" disabled={busy || !sports.data?.length || !locations.data?.length}>{busy ? "Publicando…" : "Publicar partido"}</button><Link href="/partidos" className="button secondary">Volver</Link></div>
    </form>
  </div>;
}
