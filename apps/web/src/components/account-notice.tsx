import type { ReactNode } from "react";
import styles from "./account-notice.module.css";

export function AccountNotice({ title, description, actions, feedback }: {
  title: string;
  description: string;
  actions: ReactNode;
  feedback?: string;
}) {
  return (
    <section className={styles.notice} aria-label={title}>
      <div className={styles.row}>
        <div className={styles.copy}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.actions}>{actions}</div>
      </div>
      {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    </section>
  );
}
