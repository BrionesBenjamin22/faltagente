import Link from "next/link";
import { Goal } from "lucide-react";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return <footer className={`site-footer ${styles.footer}`}>
    <div className={styles.inner}>
      <Link className={`brand ${styles.brand}`} href="/" aria-label="Falta Gente, inicio"><Goal className={styles.mark} size={30} aria-hidden="true" />Falta Gente <span>Beta</span></Link>
      <p className={styles.copy}>Hecho en Argentina<span className={styles.comma}>,</span> para los que siempre buscan uno más.</p>
      <nav className={styles.links} aria-label="Pie de página"><Link className={styles.howLink} href="#como-funciona">Cómo funciona</Link><Link href="/normas">Normas comunitarias</Link></nav>
    </div>
  </footer>;
}
