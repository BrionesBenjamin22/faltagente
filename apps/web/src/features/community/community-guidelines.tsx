import Link from "next/link";
import { getSupportContact } from "./support-contact";
import styles from "./community-guidelines.module.css";

const guidelines = [
  {
    title: "Respetá a quienes comparten el partido",
    description: "Tratemos con respeto al organizador, a los demás participantes y al personal del lugar. Evitá insultos, discriminación y conductas violentas. La buena convivencia también es parte de jugar.",
  },
  {
    title: "Publicá información clara y honesta",
    description: "Si organizás, revisá el deporte, el lugar, la fecha, el horario, el precio por persona y los lugares que ofrecés. Compartí las condiciones del encuentro para que quienes se sumen sepan qué esperar.",
  },
  {
    title: "Reservá con el compromiso de ir",
    description: "Tomá únicamente los lugares que vos y tus acompañantes van a utilizar. Respetá las condiciones publicadas y llegá a horario: hay otras personas que cuentan con ustedes para completar el partido.",
  },
  {
    title: "Si no podés ir, avisá con tiempo",
    description: "Evitá bajarte a último momento si podés anticiparlo. Si necesitás cancelar tu participación o el partido que organizás, hacelo lo antes posible para que los demás puedan reorganizarse.",
  },
] as const;

export function CommunityGuidelines({ supportEmail }: { supportEmail?: string }) {
  const contact = getSupportContact(supportEmail);

  return (
    <article className={styles.page} aria-labelledby="community-title">
      <header className={styles.introduction}>
        <h1 id="community-title">Normas comunitarias</h1>
        <p className={styles.commitment}>Si reservás, comprometete a ir. El partido ajeno se respeta.</p>
        <p>Falta Gente conecta a personas que quieren jugar. Estas pautas nos ayudan a cuidar el tiempo de los demás y a disfrutar cada encuentro, aunque todavía no nos conozcamos.</p>
        <a href="#quejas-y-sugerencias">Ir a quejas y sugerencias</a>
      </header>

      <div className={styles.guidelines}>
        {guidelines.map(({ title, description }) => (
          <section className={styles.guideline} key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </section>
        ))}
      </div>

      <section className={styles.support} id="quejas-y-sugerencias" aria-labelledby="support-title">
        <h2 id="support-title">Quejas y sugerencias</h2>
        <p>¿Algo no funcionó como esperabas? ¿Tenés una idea para mejorar Falta Gente? Contanos qué pasó y en qué pantalla, o compartí tu sugerencia.</p>
        <p className={styles.help}>No incluyas contraseñas, códigos de acceso ni información privada de otras personas.</p>
        {contact ? (
          <>
            <a className="button" href={contact.href} aria-describedby="support-email-help">Escribir a soporte</a>
            <p className={styles.help} id="support-email-help">Se abrirá tu aplicación de correo. Revisá y enviá el mensaje desde allí.</p>
            <p className={styles.address}>También podés escribir directamente a <span>{contact.email}</span>.</p>
          </>
        ) : (
          <p className={styles.availability}>El canal de soporte estará disponible próximamente.</p>
        )}
      </section>

      <Link className="button secondary" href="/">Volver al inicio</Link>
    </article>
  );
}
