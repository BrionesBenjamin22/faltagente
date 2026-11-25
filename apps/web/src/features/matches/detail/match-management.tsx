"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "../service";
import { CancelMatchPanel } from "./cancel-match";

const retry = (attempt: number, error: Error) => !(error instanceof ApiError && error.status < 500) && attempt < 1;

export function MatchManagement({ id, organizerId }: { id: string; organizerId: string }) {
  const session = useSession();
  if (!session.session?.authenticated || session.session.user?.id !== organizerId) return null;
  return <OrganizerManagement key={`${session.session.user.id}:${id}`} id={id} ownerId={session.session.user.id} />;
}

function OrganizerManagement({ id, ownerId }: { id: string; ownerId: string }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const result = useRef<HTMLParagraphElement>(null);
  const management = useQuery({ queryKey: ["match-management", ownerId, id], queryFn: () => matchesService.management(id), retry });
  useEffect(() => { if (cancelled) result.current?.focus(); }, [cancelled]);
  useEffect(() => { if (!cancelling && restoreFocus.current) { cancelButton.current?.focus(); restoreFocus.current = false; } }, [cancelling]);
  return <>
    {cancelled ? <p className="notice" role="status" ref={result} tabIndex={-1}>Partido cancelado correctamente</p> : null}
    <div className="actions mt-6"><Link href="/mis-partidos" className="button secondary">Mis partidos</Link>{management.data?.canEdit ? <Link className="button" href={`/partidos/${id}/editar`}>Editar</Link> : null}{management.data?.canCancel ? <button ref={cancelButton} type="button" className="button secondary" disabled={cancelling} onClick={() => setCancelling(true)}>Cancelar partido</button> : null}</div>
    {management.data?.hasConfirmedParticipants && management.data.canEdit ? <p className="muted">Con participantes confirmados o lugares ocupados, sólo podés editar descripción y capacidad. Si cancelás el partido, también se cancelarán sus reservas confirmadas.</p> : null}
    {cancelling && management.data ? <CancelMatchPanel initial={management.data} ownerId={ownerId} onClose={() => { restoreFocus.current = true; setCancelling(false); }} onCancelled={() => { setCancelling(false); setCancelled(true); }} /> : null}
    {management.isPending ? <p role="status">Cargando acciones del partido…</p> : management.isError ? <div><p className="error" role="alert">{errorMessage(management.error)}</p><button type="button" className="button secondary" disabled={management.isFetching} onClick={() => void management.refetch()}>Reintentar acciones del partido</button></div> : null}
  </>;
}
