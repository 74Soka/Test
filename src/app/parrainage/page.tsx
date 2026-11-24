import type { Metadata } from "next";
import Link from "next/link";
import { formaterPrix } from "@/lib/domaine/argent";
import { aujourdhui } from "@/lib/domaine/dates";
import { lireFidelitePublique, type FidelitePublique } from "@/lib/fidelite-publique";
import { INSTAGRAM, TELEPHONE_COMMANDES } from "@/lib/paniers-publics";

/**
 * Page publique, sans compte : le programme de parrainage et de fidélité
 * (graines, récompenses, cadeaux), lien court à envoyer par SMS
 * (fraisetfrancais.fr/parrainage). Les règles viennent des réglages.
 */

const DESCRIPTION =
  "Parrainez vos proches et gagnez des graines de fidélité : suppléments, confitures et paniers offerts. Frais et Français, paniers de fruits et légumes livrés dans le Var.";

export const metadata: Metadata = {
  title: { absolute: "Parrainage et fidélité · Frais et Français" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { title: "Parrainage et fidélité · Frais et Français", description: DESCRIPTION, locale: "fr_FR" },
};

// Toujours à jour : les règles peuvent changer dans les réglages
export const dynamic = "force-dynamic";

const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateLongue = (iso: string) => DATE_LONGUE.format(new Date(`${iso}T00:00:00Z`)).replace(/^1 /, "1er ");

const graines = (n: number) => `${n} ${n > 1 ? "graines" : "graine"}`;

const classesBouton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-lg font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-feuille-600";

const NIVEAUX = {
  standard: null,
  vip: { libelle: "VIP", classes: "bg-peche-600 text-white" },
  ultra: { libelle: "Ultra", classes: "bg-marque-800 text-white" },
} as const;

export default async function PageParrainage() {
  const d = await lireFidelitePublique();
  const cadeauFilleul = d.recompenses.find((r) => r.type === "bienvenue_filleul");
  const cadeauParrain = d.recompenses.find((r) => r.type === "cadeau_parrain");
  const recompenses = d.recompenses.filter((r) => r.type === "tampons").sort((a, b) => a.graines - b.graines);
  const cadeauxAVenir = d.cadeaux_debut && d.cadeaux_debut > aujourdhui() ? d.cadeaux_debut : null;

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
          <h1 className="font-titre text-3xl leading-tight text-marque-800">Parrainage et fidélité</h1>
          <p className="text-lg font-semibold text-stone-700">Frais et Français vous remercie 🌱</p>
        </div>
      </header>

      {/* Les cadeaux du parrainage */}
      <section
        aria-label="Le parrainage"
        className="flex flex-col gap-4 rounded-3xl bg-marque-800 p-5 text-white shadow-[0_4px_16px_rgb(53_3_122/0.25)]"
      >
        <div>
          <p className="text-sm font-extrabold tracking-widest uppercase opacity-85">🎉 Le parrainage</p>
          <h2 className="font-titre text-2xl leading-tight">Faites découvrir nos paniers, tout le monde est gagnant !</h2>
          {cadeauxAVenir && <p className="mt-1 font-semibold opacity-90">Dès le {dateLongue(cadeauxAVenir)}.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#fff] px-4 py-3 text-[#1c1917]">
            <p className="text-xs font-extrabold tracking-wider text-[#57534e] uppercase">Votre filleul</p>
            <p className="text-lg font-extrabold">🥚 {cadeauFilleul?.description ?? "Un cadeau dans son premier panier"}</p>
          </div>
          <div className="rounded-2xl bg-[#fff] px-4 py-3 text-[#1c1917]">
            <p className="text-xs font-extrabold tracking-wider text-[#57534e] uppercase">Vous, le parrain</p>
            <p className="text-lg font-extrabold">
              🍓 {cadeauParrain?.nom.replace(/\s+au parrain$/i, "") ?? "Un cadeau"}
              {d.graines_parrainage > 0 && ` + ${graines(d.graines_parrainage)}`}
            </p>
            {d.graines_par_commande_filleul > 0 && (
              <p className="font-semibold text-[#57534e]">
                puis {graines(d.graines_par_commande_filleul)} à chacune de ses livraisons 🌱
              </p>
            )}
          </div>
        </div>
      </section>

      {/* En 3 étapes */}
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 ring-1 ring-marque-100">
        <h2 className="font-titre text-xl text-marque-800">Parrainer en 3 étapes</h2>
        <ol className="flex flex-col gap-3">
          <Etape numero={1}>
            Retrouvez <strong>votre code de parrainage</strong> dans votre espace client, rubrique <strong>Fidélité</strong>.
            Un bouton l&apos;envoie par SMS ou WhatsApp.
          </Etape>
          <Etape numero={2}>
            Votre proche crée son compte sur <strong>fraisetfrancais.fr/inscription</strong> et saisit votre code (ou
            nous donne votre nom).
          </Etape>
          <Etape numero={3}>Dès sa première livraison, les cadeaux sont pour vous deux ! 🎁</Etape>
        </ol>
        <div className="flex flex-wrap gap-3">
          <Link href="/espace/fidelite" className={`${classesBouton} flex-1 bg-marque-700 text-white`}>
            Mon code ›
          </Link>
          <Link href="/inscription" className={`${classesBouton} flex-1 bg-peche-600 text-white`}>
            Créer mon compte
          </Link>
        </div>
        <p className="text-sm text-stone-600">Sans limite de filleuls. Cadeaux réservés aux nouveaux clients.</p>
      </section>

      {/* Les graines */}
      <section
        aria-label="Les graines de fidélité"
        className="flex flex-col gap-3 rounded-3xl bg-feuille-50 p-5 ring-2 ring-feuille-700"
      >
        <h2 className="font-titre text-xl text-feuille-900">Les graines de fidélité 🌱</h2>
        <p className="text-stone-800">
          À chaque panier livré, vous gagnez des graines. Elles s&apos;ajoutent sur votre carte de fidélité et se
          transforment en cadeaux.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.graines_bienvenue > 0 && <Gain graines={d.graines_bienvenue}>à la création de votre compte</Gain>}
          {d.paniers.map((p) => (
            <Gain key={p.nom} graines={p.graines}>
              par {p.nom.replace(/\s*\d+([,.]\d+)?\s*€\s*$/, "")} {formaterPrix(p.prix_centimes)} livré
            </Gain>
          ))}
          <Gain graines={1}>par supplément panier (20 € ou 30 €)</Gain>
          {d.graines_parrainage > 0 && <Gain graines={d.graines_parrainage}>par filleul parrainé</Gain>}
          {d.graines_par_commande_filleul > 0 && (
            <Gain graines={d.graines_par_commande_filleul}>à chaque livraison de vos filleuls</Gain>
          )}
        </ul>
      </section>

      {/* Les récompenses */}
      {recompenses.length > 0 && (
        <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 ring-1 ring-marque-100">
          <h2 className="font-titre text-xl text-marque-800">Vos récompenses 🎁</h2>
          <ul className="flex flex-col gap-3">
            {recompenses.map((r) => (
              <Recompense key={r.nom} recompense={r} donnees={d} />
            ))}
          </ul>
          <p className="text-sm text-stone-600">
            Choisissez votre récompense en commandant dans votre espace client, ou demandez-la-nous. Les graines
            utilisées sont retirées de votre carte.
          </p>
        </section>
      )}

      {/* Niveaux */}
      <section
        aria-label="Clients VIP et Ultra"
        className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-marque-800 bg-marque-50 p-5"
      >
        <h2 className="font-titre text-xl text-marque-800">Devenez VIP, puis Ultra ⭐</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs font-extrabold tracking-wider text-peche-700 uppercase">Client VIP</p>
            <p className="text-lg font-extrabold">Dès {d.filleuls_vip} filleuls</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-xs font-extrabold tracking-wider text-marque-700 uppercase">Client Ultra</p>
            <p className="text-lg font-extrabold">Dès {d.filleuls_ultra} filleuls</p>
          </div>
        </div>
        <p className="text-stone-700">
          Ils débloquent les plus belles récompenses : des paniers entiers offerts !
          {d.filleuls_livres_seulement && " Un filleul compte dès qu'il a été livré une première fois."}
        </p>
      </section>

      <footer className="flex flex-col items-center gap-4 text-center text-stone-600">
        <Link href="/paniers" className={`${classesBouton} bg-feuille-700 text-base text-white`}>
          🧺 Voir les paniers de la semaine ›
        </Link>
        <a
          href={INSTAGRAM.url}
          target="_blank"
          rel="noopener"
          className={`${classesBouton} bg-gradient-to-r from-marque-800 via-[#8a3fd1] to-peche-600 text-base text-white`}
        >
          Suivez-nous sur Instagram · {INSTAGRAM.compte}
        </a>
        <p>
          Une question ? Appelez-nous au{" "}
          <a href={`tel:${TELEPHONE_COMMANDES.international}`} className="font-extrabold text-marque-800 underline">
            {TELEPHONE_COMMANDES.affiche}
          </a>
        </p>
      </footer>
    </main>
  );
}

function Etape({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-peche-600 font-titre text-lg text-white"
      >
        {numero}
      </span>
      <p className="pt-1 text-stone-800">{children}</p>
    </li>
  );
}

function Gain({ graines: n, children }: { graines: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
      <span className="shrink-0 font-titre text-2xl text-feuille-700 tabular-nums">+{n}</span>
      <span className="text-stone-800">
        <strong>{n > 1 ? "graines" : "graine"}</strong> {children}
      </span>
    </li>
  );
}

function Recompense({
  recompense: r,
  donnees: d,
}: {
  recompense: FidelitePublique["recompenses"][number];
  donnees: FidelitePublique;
}) {
  const niveau = NIVEAUX[r.niveau];
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-marque-50 px-4 py-3 ring-1 ring-marque-100">
      <span className="flex w-16 shrink-0 flex-col items-center leading-none">
        <span className="font-titre text-3xl text-peche-600 tabular-nums">{r.graines}</span>
        <span className="text-xs font-bold text-stone-600">graines 🌱</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-extrabold">{r.nom}</span>
        {r.description && <span className="block text-stone-700">{r.description}</span>}
        {niveau && (
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${niveau.classes}`}>
            Clients {niveau.libelle} ({r.niveau === "vip" ? d.filleuls_vip : d.filleuls_ultra} filleuls)
          </span>
        )}
      </span>
    </li>
  );
}
