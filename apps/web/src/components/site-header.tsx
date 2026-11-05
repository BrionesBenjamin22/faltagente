import Link from "next/link";
import { AccountMenu } from "./account-menu";
import { ThemeMenu } from "@/features/appearance/theme-menu";
import styles from "./site-header.module.css";

export function SiteHeader({ authenticated }: { authenticated: boolean }) {
  return (
    <header className="site-header">
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-3 px-5 py-2 sm:gap-4 sm:px-6 sm:py-[18px]">
        <Link className="brand" href="/">Falta Gente <span>Beta</span></Link>
        <div className="flex shrink-0 items-center gap-3">
          <nav className={styles.navigation} aria-label="Cuenta">
            {authenticated ? (
              <><Link href="/">Partidos</Link><AccountMenu /></>
            ) : (
              <><Link href="/auth/login">Ingresar</Link><Link className="button" href="/auth/register">Crear cuenta</Link></>
            )}
          </nav>
          <ThemeMenu />
        </div>
      </div>
    </header>
  );
}
