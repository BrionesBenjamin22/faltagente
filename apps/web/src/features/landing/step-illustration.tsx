import { Check, Circle, type LucideIcon } from "lucide-react";
import styles from "./benefits-carousel.module.css";

export function StepIllustration({ Icon, labels }: { Icon: LucideIcon; labels: readonly [string, string] }) {
  return <div className={styles.art} aria-hidden="true">
    <span className={styles.floatingTop}><Circle size={9} fill="currentColor" />{labels[0]}</span>
    <div className={styles.artCenter}><Icon strokeWidth={1.6} /></div>
    <span className={styles.floatingBottom}><Check size={14} />{labels[1]}</span>
  </div>;
}
