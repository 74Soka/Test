import type { Metadata } from "next";
import Link from "next/link";
import { formaterPrix } from "@/lib/domaine/argent";
import { aujourdhui, formaterSemaine, NOMS_JOURS } from "@/lib/domaine/dates";
import { libelleTournee } from "@/lib/domaine/secteurs";
import { RecetteSemaine } from "@/components/recette-semaine";
import { ListeSupplements } from "@/components/supplements";
import { ListeProduits } from "@/components/produit";
import {
  INSTAGRAM,
  TELEPHONE_COMMANDES,
  lignesComposition,
  lirePaniersPublics,
} from "@/lib/paniers-publics";

/**
 * Page publique, sans compte : le lien envoyé par SMS aux clients
 * (fraisetfrancais.fr/paniers). Composition, suppléments et livraisons
 * viennent de l'application : rien à refaire chaque semaine.
 */

const DESCRIPTION = "Fruits et légumes frais, livrés le week-end dans le Var. Composition des paniers et commande.";

export const metadata: Metadata = {
  title: { absolute: "Les paniers de la semaine · Frais et Français" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { title: "Les paniers de la semaine · Frais et Français", description: DESCRIPTION, locale: "fr_FR" },
};

// Toujours à jour : la composition peut changer à tout moment
export const dynamic = "force-dynamic";

const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** « 1er janvier 2027 » */
function dateLongue(iso: string): string {
  return DATE_LONGUE.format(new Date(`${iso}T00:00:00Z`)).replace(/^1 /, "1er ");
}

const classesBouton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-lg font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-feuille-600";

export default async function PagePaniers() {
  const d = await lirePaniersPublics();
  // Un secteur sans commune (ex. Secteur V, clients choisis un par un) n'est pas affiché
  const secteursAffiches = d.secteurs.filter((s) => s.communes.length > 0);
  const parrainageAVenir = d.parrainage_debut && d.parrainage_debut > aujourdhui() ? d.parrainage_debut : null;
  const cloture =
    d.cloture_jour && d.cloture_heure
      ? `${NOMS_JOURS[d.cloture_jour - 1]} ${d.cloture_heure.replace(":00", " h").replace(":", " h ")}`
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6 pb-[max(3rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="Logo Frais et Français"
          width={96}
          height={96}
          className="size-24 shrink-0 rounded-full bg-white p-1 shadow-[0_2px_10px_rgb(53_3_122/0.12)]"
        />
        <div className="min-w-0">
          <h1 className="font-titre text-3xl leading-tight text-marque-800">Frais et Français</h1>
          <p className="text-lg font-semibold text-stone-700">Les paniers de la semaine</p>
          {d.semaine && <p className="text-stone-600">{formaterSemaine(d.semaine)}</p>}
        </div>
      </header>

      {d.message && (
        <p className="rounded-2xl bg-peche-50 px-4 py-3 text-lg font-semibold text-peche-900 ring-1 ring-peche-600/30">
          {d.message}
        </p>
      )}

      <section aria-label="Pour commander" className="flex flex-col gap-3 rounded-3xl bg-marque-800 p-5 text-white">
        <div>
          <p className="text-sm font-extrabold tracking-widest uppercase opacity-85">Pour commander</p>
          <p className="font-titre text-3xl tabular-nums">{TELEPHONE_COMMANDES.affiche}</p>
          {cloture && d.commandes_ouvertes && !d.semaine_close && (
            <p className="font-semibold opacity-90">Avant le {cloture} pour la livraison du week-end.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={`tel:${TELEPHONE_COMMANDES.international}`} className={`${classesBouton} flex-1 bg-peche-600 text-white`}>
            📞 Appeler
          </a>
          <a
            href={`sms:${TELEPHONE_COMMANDES.international}`}
            className={`${classesBouton} flex-1 bg-[#fff] text-[#35037a]`}
          >
            💬 Envoyer un SMS
          </a>
        </div>
      </section>

      <section
        aria-label="Déjà client"
        className="flex flex-col gap-3 rounded-3xl bg-feuille-50 p-5 ring-2 ring-feuille-700 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="font-titre text-xl text-feuille-900">Déjà client ?</h2>
          <p className="text-stone-800">Commandez en ligne, suivez vos livraisons et vos graines de fidélité 🌱.</p>
        </div>
        <Link href="/espace" className={`${classesBouton} shrink-0 bg-feuille-700 text-white`}>
          Mon espace client ›
        </Link>
      </section>

      {d.semaine_close && (
        <p
          role="status"
          className="rounded-2xl bg-amber-50 px-4 py-3 text-lg font-semibold text-amber-900 ring-1 ring-amber-200"
        >
          Les commandes de cette semaine sont closes : voici le panier livré ce week-end. Le panier de la semaine
          prochaine arrive très bientôt.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {d.paniers.map((p) => {
          const lignes = lignesComposition(p.contenu);
          return (
            <article
              key={p.id}
              className="flex min-w-0 flex-col gap-2 rounded-3xl bg-white p-5 ring-1 ring-marque-100"
            >
              <h2 className="flex items-baseline justify-between gap-2 font-titre text-2xl text-marque-800">
                <span>{p.nom.replace(/\s*\d+([,.]\d+)?\s*€\s*$/, "")}</span>
                <span className="text-3xl text-peche-600 tabular-nums">{formaterPrix(p.prix_centimes)}</span>
              </h2>
              {lignes.length > 0 ? (
                <ListeProduits lignes={lignes} />
              ) : (
                <p className="text-stone-600">La composition sera bientôt publiée.</p>
              )}
            </article>
          );
        })}
      </div>


      <ListeSupplements supplements={d.supplements} />

      {d.recette && <RecetteSemaine recette={d.recette} paniers={d.paniers} supplements={d.supplements} />}

      {secteursAffiches.length > 0 && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 ring-1 ring-marque-100">
          <h2 className="font-titre text-xl text-marque-800">Livraisons à domicile</h2>
          <ul className="flex flex-col gap-3">
            {secteursAffiches.map((s) => (
              <li key={s.nom}>
                <p className="font-extrabold">{libelleTournee(s)}</p>
                <p className="text-stone-700">{s.communes.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-marque-800 bg-marque-50 p-5">
        <h2 className="font-titre text-xl text-marque-800">Parrainez vos proches</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs font-extrabold tracking-wider text-stone-600 uppercase">Vous, le parrain</p>
            <p className="text-lg font-extrabold">1 pot de confiture artisanale offert</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs font-extrabold tracking-wider text-stone-600 uppercase">Votre filleul</p>
            <p className="text-lg font-extrabold">6 œufs BIO offerts dans son 1er panier</p>
          </div>
        </div>
        <p className="text-stone-700">
          {parrainageAVenir && <strong>Dès le {dateLongue(parrainageAVenir)}. </strong>}
          Votre filleul nous donne votre nom en passant sa première commande. Votre confiture est offerte dès que son
          panier est livré. Offre réservée aux nouveaux clients, sans limite de filleuls.
        </p>
      </section>

      <footer className="flex flex-col items-center gap-4 text-center text-stone-600">
        <a
          href={INSTAGRAM.url}
          target="_blank"
          rel="noopener"
          className={`${classesBouton} bg-gradient-to-r from-marque-800 via-[#8a3fd1] to-peche-600 text-base text-white`}
        >
          Suivez-nous sur Instagram · {INSTAGRAM.compte}
        </a>
        <p>
          Au plaisir de vous lire.
          <br />
          Commandez au{" "}
          <a href={`tel:${TELEPHONE_COMMANDES.international}`} className="font-extrabold text-marque-800 underline">
            {TELEPHONE_COMMANDES.affiche}
          </a>
        </p>
        <Link href="/espace" className={`${classesBouton} bg-feuille-700 text-base text-white`}>
          Déjà client ? Mon espace client ›
        </Link>
      </footer>
    </main>
  );
}
