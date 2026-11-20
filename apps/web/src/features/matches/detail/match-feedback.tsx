"use client";

import { useEffect, useState } from "react";

export function MatchFeedback({ success }: { success?: string }) {
  const [message] = useState(success === "match-updated" ? "Partido actualizado correctamente" : "");
  useEffect(() => {
    if (success !== "match-updated") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [success]);
  return message ? <p className="notice" role="status">{message}</p> : null;
}
