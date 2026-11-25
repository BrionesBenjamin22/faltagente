"use client";
import type { ReactNode } from "react";
import { useSession } from "@/features/auth/session";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { BackToTop } from "./back-to-top";
import { AccountNotice } from "./account-notice";
export function Shell({ children }: { children: ReactNode }) {
  const state = useSession();
  const seconds = Number(process.env.NEXT_PUBLIC_SESSION_WARNING_SECONDS ?? "120");
  const warning = state.session?.authenticated && state.expires > 0 && state.now > 0 && state.expires - state.now <= seconds * 1000;
  const restore = !state.session?.authenticated && state.session?.refreshAvailable;
  return <><a className="skip-link" href="#contenido">Ir al contenido</a>
    <SiteHeader authenticated={!!state.session?.authenticated} /><main id="contenido" className="container">
      {warning || restore ? <AccountNotice
        title={restore ? "Recuperá tu sesión" : "Tu sesión está por finalizar"}
        description={restore ? "Tu sesión finalizó. Recuperala para continuar donde estabas." : "Mantené tu sesión activa para seguir usando tu cuenta."}
        actions={<><button className="button" disabled={state.pending} onClick={() => void state.refresh()}>{restore ? "Recuperar sesión" : "Mantener sesión"}</button><button className="button secondary" disabled={state.pending} onClick={() => void state.logout()}>Cerrar sesión</button></>}
        feedback={state.feedback}
      /> : null}
      {state.feedback && !warning && !restore ? <p className="notice" role="status">{state.feedback}</p> : null}{children}
    </main><SiteFooter /><BackToTop /></>;
}
