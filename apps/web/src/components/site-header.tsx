import Link from "next/link";
import { Goal } from "lucide-react";
import { AccountMenu } from "./account-menu";
import { ThemeMenu } from "@/features/appearance/theme-menu";
import { NotificationBell } from "@/features/notifications/notification-bell";
import styles from "./site-header.module.css";

export function SiteHeader({ authenticated }: { authenticated: boolean }) {
  return (
    <header className="site-header">
      <div className={`${styles.inner} mx-auto flex max-w-[1160px] items-center justify-between gap-3 px-5 py-2 sm:gap-4 sm:px-6 sm:py-[18px]`}>
        <Link id="site-brand" className={`brand ${styles.brand}`} href="/"><Goal className={styles.brandMark} size={30} aria-hidden="true" />Falta Gente <span className={styles.beta}>Beta</span></Link>
        <div className={`${styles.actions} flex shrink-0 items-center gap-3`}>
          <nav className={`${styles.navigation} ${authenticated ? styles.authenticated : ""}`} aria-label="Cuenta">
            {authenticated ? (
              <><Link className={styles.matchesLink} href="/">Partidos</Link><AccountMenu /></>
            ) : (
              <><Link href="/auth/login">Ingresar</Link><Link className="button" href="/auth/register">Crear cuenta</Link></>
            )}
          </nav>
          {authenticated ? <NotificationBell authenticated={authenticated} /> : null}
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
