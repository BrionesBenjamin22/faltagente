"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { MatchDetail } from "../types";
import { canShareMatch, matchShareUrl } from "./share-links";

const subscribeBrowser = () => () => {};
const serverOrigin = () => "";
const browserOrigin = () => window.location.origin;
const serverFalse = () => false;
const nativeSupport = () => typeof navigator.share === "function";

export function useMatchSharing(match: MatchDetail) {
  const origin = useSyncExternalStore(subscribeBrowser, browserOrigin, serverOrigin);
  const nativeAvailable = useSyncExternalStore(subscribeBrowser, nativeSupport, serverFalse);
  const subscribeEligibility = useCallback((notify: () => void) => {
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      clearTimeout(timer);
      notify();
      const remaining = Date.parse(match.startsAt) - Date.now();
      if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    }
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [match.startsAt]);
  const eligible = useSyncExternalStore(subscribeEligibility, () => canShareMatch(match, Date.now()), serverFalse);
  const [feedback, setFeedback] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = origin ? matchShareUrl(origin, match.id) : "";
  const isCurrent = () => canShareMatch(match, Date.now());

  async function copy() {
    if (!isCurrent() || busy) return;
    setFeedback("");
    setBusy(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setManualCopy(false);
      setFeedback("Enlace copiado correctamente");
    } catch {
      setManualCopy(true);
    } finally {
      setBusy(false);
    }
  }

  async function share(text: string) {
    if (!isCurrent() || busy) return;
    setFeedback("");
    setBusy(true);
    try {
      await navigator.share({ text, url });
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")) {
        setFeedback("Lo sentimos! No pudimos abrir las aplicaciones. Intente nuevamente o use otra opción para compartir.");
      }
    } finally {
      setBusy(false);
    }
  }

  return { eligible, nativeAvailable, url, feedback, manualCopy, busy, copy, share, isCurrent };
}
