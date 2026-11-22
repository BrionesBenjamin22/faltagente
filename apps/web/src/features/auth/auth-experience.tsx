
import { AuthForm } from "@/features/auth/auth-form";
import styles from "@/features/auth/auth-hero.module.css";

export function AuthExperience({
  mode,
  success,
}: {
  mode: "login" | "register";
  success?: string;
}) {
  const registerMode = mode === "register";

  return (
    <div className={styles.experience} data-auth-experience>
      <div className={styles.layout}>
        <aside
          className={styles.story}
          aria-label="Bienvenida a Falta Gente"
        >
          <p className={styles.kicker}>
            TODOS LOS DEPORTES. UN MISMO LUGAR.
          </p>

          <h2>
            {registerMode
              ? "Tu equipo te está esperando."
              : "Nos vemos en la cancha."}
          </h2>

          <p className={styles.description}>
            Encontrá tu próximo partido, completá equipos
            y volvé a jugar.
          </p>
        </aside>

        <div className={styles.formContainer}>
          <AuthForm mode={mode} success={success} />
        </div>
      </div>
    </div>
  );
}
