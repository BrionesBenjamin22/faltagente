"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import styles from "./notifications.module.css";

type Variant = "success" | "error" | "warning" | "info";
type Options = { duration?: number; id?: string };
type Notification = { id: string; key: number; variant: Variant; message: string; duration: number };
type Notify = Record<Variant, (message: string, options?: Options) => string>;
export const notificationDurations: Record<Variant, number> = { success: 4000, info: 4000, warning: 5000, error: 6000 };
const icons = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
const labels = { success: "Éxito", error: "Error", warning: "Advertencia", info: "Información" };
const NotificationContext = createContext<Notify | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback((key: number) => setItems(current => current.filter(item => item.key !== key)), []);
  const notify = useMemo<Notify>(() => {
    const send = (variant: Variant) => (message: string, options: Options = {}) => {
      const key = ++sequence.current;
      const id = options.id ?? `notification-${key}`;
      const duration = options.duration && Number.isFinite(options.duration) && options.duration > 0 ? options.duration : notificationDurations[variant];
      setItems(current => current.some(item => item.id === id) ? current : [...current.slice(-2), { id, key, message, variant, duration }]);
      return id;
    };
    return { success: send("success"), error: send("error"), warning: send("warning"), info: send("info") };
  }, []);
  return <NotificationContext value={notify}>{children}<div className={styles.stack} aria-label="Notificaciones">
    <AnimatePresence initial={false}>{items.map(item => <Toast key={item.key} item={item} dismiss={dismiss} />)}</AnimatePresence>
  </div></NotificationContext>;
}

export function useNotify() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("NotificationProvider required");
  return notify;
}

function Toast({ item, dismiss }: { item: Notification; dismiss: (key: number) => void }) {
  const [remaining, setRemaining] = useState(item.duration);
  const interaction = useRef({ hover: false, focus: false });
  const clock = useRef({ remaining: item.duration, last: 0 });
  const reducedMotion = useReducedMotion();
  // A single clock drives both dismissal and the progress bar, including pauses.
  useEffect(() => {
    clock.current.last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      if (!interaction.current.hover && !interaction.current.focus) {
        clock.current.remaining = Math.max(0, clock.current.remaining - (now - clock.current.last));
        setRemaining(clock.current.remaining);
        if (clock.current.remaining === 0) { clearInterval(timer); dismiss(item.key); }
      }
      clock.current.last = now;
    }, 50);
    return () => clearInterval(timer);
  }, [dismiss, item.key]);
  function pause(kind: "hover" | "focus", active: boolean) {
    const now = Date.now();
    if (!interaction.current.hover && !interaction.current.focus) {
      clock.current.remaining = Math.max(0, clock.current.remaining - (now - clock.current.last));
      setRemaining(clock.current.remaining);
    }
    clock.current.last = now;
    interaction.current[kind] = active;
  }
  const Icon = icons[item.variant];
  return <motion.div className={styles.toast} data-variant={item.variant}
    initial={{ opacity: 0, y: reducedMotion ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}
    onMouseEnter={() => pause("hover", true)} onMouseLeave={() => pause("hover", false)}
    onFocusCapture={() => pause("focus", true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) pause("focus", false); }}>
    <div className={styles.message} role={item.variant === "error" ? "alert" : "status"} aria-atomic="true"><Icon size={22} aria-hidden="true" /><span><span className={styles.srOnly}>{labels[item.variant]}: </span>{item.message}</span></div>
    <button type="button" className={styles.close} aria-label="Cerrar notificación" onClick={() => dismiss(item.key)}><X size={18} aria-hidden="true" /></button>
    <div className={styles.track} aria-hidden="true"><div className={styles.progress} style={{ transform: `scaleX(${remaining / item.duration})` }} /></div>
  </motion.div>;
}
