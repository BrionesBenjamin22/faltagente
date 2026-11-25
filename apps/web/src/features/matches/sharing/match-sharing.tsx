"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Copy, Share2, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import type { MatchDetail } from "../types";
import { matchShareLinks, matchShareText } from "./share-links";
import { useMatchSharing } from "./use-match-sharing";
import styles from "./match-sharing.module.css";

function SharingBrandIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    {name === "WhatsApp" ? <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.6 18L0 24l6.2-1.6A12 12 0 0 0 24 12c0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 22Zm5.5-7.5c-.3-.1-1.8-.9-2-.9-.3-.1-.5-.1-.7.2l-.9 1.1c-.2.2-.3.2-.6.1a8.2 8.2 0 0 1-4-3.5c-.3-.4.3-.4.9-1.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.3 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.7.9 3.7.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4Z" />
      : name === "Telegram" ? <path d="M21.8 3.2 2.4 10.7c-1.3.5-1.3 1.2-.3 1.5l5 1.6 1.9 5.8c.2.6.1.8.8.8.5 0 .7-.2 1-.5l2.4-2.3 5.1 3.8c.9.5 1.5.3 1.7-.8l3.3-15.5c.3-1.4-.5-2.1-1.5-1.9ZM8 13.4l11.4-7.2c.6-.4 1.1-.2.6.2l-9.4 8.5-.4 4.1L8 13.4Z" />
        : <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l5.7 6.9L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z" />}
  </svg>;
}

const mobileQuery = "(max-width: 599px)";
const subscribeViewport = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const isMobileViewport = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;

export function MatchSharing({ match }: { match: MatchDetail }) {
  const [expanded, setExpanded] = useState(false);
  const mobile = useSyncExternalStore(subscribeViewport, isMobileViewport, serverViewport);
  const titleId = useId();
  const hintId = useId();
  const inputId = useId();
  const sharing = useMatchSharing(match);
  if (!sharing.eligible || !sharing.url) return null;
  const text = matchShareText(match);

  return <Popover.Root open={expanded && sharing.eligible} modal={mobile}
    onOpenChange={open => { if (!open || sharing.isCurrent()) setExpanded(open); }}>
    <span className={styles.root}>
      <Popover.Trigger asChild>
        <button type="button" className={styles.trigger} title="Compartir partido" aria-label="Compartir partido">
          <Share2 size={22} aria-hidden="true" />
        </button>
      </Popover.Trigger>
    </span>
    <Popover.Portal>
      <Popover.Content className={styles.panel} align="end" side="bottom" sideOffset={8} collisionPadding={12}
        aria-labelledby={titleId} aria-describedby={hintId} aria-modal={mobile || undefined} data-mobile={mobile}>
        {mobile ? <div className={styles.backdrop} aria-hidden="true" onClick={() => setExpanded(false)} /> : null}
        <div className={styles.surface}>
          <div className={styles.handle} aria-hidden="true" />
          <div className={styles.heading}>
            <h2 id={titleId}>Compartir partido</h2>
            <Popover.Close className={styles.close} aria-label="Cerrar opciones para compartir"><X size={22} aria-hidden="true" /></Popover.Close>
          </div>
          <p id={hintId} className={styles.hint}>Elegí cómo compartir el enlace del partido.</p>
          <div className={styles.options}>
            <button type="button" className={styles.action} aria-label="Copiar enlace" disabled={sharing.busy} onClick={() => void sharing.copy()}>
              <span className={styles.icon}><Copy size={24} aria-hidden="true" /></span><span>Copiar</span>
            </button>
            {matchShareLinks(sharing.url, text).map(link => <a key={link.name} className={styles.action}
              href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.name} (abre en otra pestaña)`}
              onClick={event => { if (!sharing.isCurrent()) event.preventDefault(); }}>
              <span className={styles.icon}><SharingBrandIcon name={link.name} /></span><span>{link.name}</span>
            </a>)}
            {sharing.nativeAvailable ? <button type="button" className={styles.action} aria-label="Otras aplicaciones" disabled={sharing.busy}
              onClick={() => void sharing.share(text)}>
              <span className={styles.icon}><Share2 size={24} aria-hidden="true" /></span><span>Más</span>
            </button> : null}
          </div>
          {sharing.feedback ? <p role="status" className={styles.feedback}>{sharing.feedback}</p> : null}
          {sharing.manualCopy ? <div className={styles.manual}>
            <label htmlFor={inputId}>Enlace del partido</label>
            <input id={inputId} type="url" value={sharing.url} readOnly onFocus={event => event.currentTarget.select()} />
            <p className={styles.hint}>No pudimos copiar el enlace automáticamente. Seleccionalo y copialo para compartirlo.</p>
          </div> : null}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
