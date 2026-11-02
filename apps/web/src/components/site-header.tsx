import Link from "next/link";
import { AccountMenu } from "./account-menu";

export function SiteHeader({ authenticated }: { authenticated: boolean }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">Falta Gente <span>Beta</span></Link>
        <nav aria-label="Cuenta">
          {authenticated ? (
            <><Link href="/">Partidos</Link><AccountMenu /></>
          ) : (
            <><Link href="/auth/login">Ingresar</Link><Link className="button" href="/auth/register">Crear cuenta</Link></>
          )}
        </nav>
      </div>
    </header>
  );
}
