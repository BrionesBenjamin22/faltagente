"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import styles from "./back-to-top.module.css";

export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY >= window.innerHeight);
    // Read after Next has restored the new route's scroll position.
    const frame = window.requestAnimationFrame(updateVisibility);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [pathname]);

  function returnToTop(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      document.getElementById("site-brand")?.focus({ preventScroll: true });
    }
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return visible ? (
    <button type="button" className={styles.button} aria-label="Volver arriba" onClick={returnToTop}>
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  ) : null;
}
