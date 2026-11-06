import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Composants d'interface de base. Pensés pour le téléphone : cibles tactiles
 * d'au moins 48 px, textes lisibles en extérieur.
 */

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variante = "principal" | "secondaire" | "danger" | "discret";
type Taille = "normal" | "grand" | "petit";

const VARIANTES: Record<Variante, string> = {
  principal: "bg-marque-700 text-white hover:bg-marque-800 active:bg-marque-900 disabled:bg-stone-400",
  secondaire:
    "bg-white text-stone-900 ring-1 ring-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:text-stone-400",
  danger: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-stone-400",
  discret: "text-marque-800 hover:bg-marque-50 active:bg-marque-100 disabled:text-stone-400",
};

const TAILLES: Record<Taille, string> = {
  petit: "min-h-10 px-3 text-sm",
  normal: "min-h-12 px-4 text-base",
  grand: "min-h-14 px-5 text-lg",
};

function classesBouton(variante: Variante, taille: Taille, className?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-marque-600",
    "disabled:cursor-not-allowed",
    VARIANTES[variante],
    TAILLES[taille],
    className,
  );
}

export function Bouton({
  variante = "principal",
  taille = "normal",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variante?: Variante; taille?: Taille }) {
  return <button type={type} className={classesBouton(variante, taille, className)} {...props} />;
}

export function LienBouton({
  variante = "principal",
  taille = "normal",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; taille?: Taille }) {
  return <Link className={classesBouton(variante, taille, className)} {...props} />;
}

/** Lien externe (tel:, sms:, cartes…) avec l'apparence d'un bouton. */
export function LienExterneBouton({
  variante = "secondaire",
  taille = "normal",
  className,
  ...props
}: ComponentProps<"a"> & { variante?: Variante; taille?: Taille }) {
  return <a className={classesBouton(variante, taille, className)} {...props} />;
}

const classesChamp = cx(
  "block w-full rounded-xl border-0 bg-white px-3.5 py-3 text-stone-900 ring-1 ring-stone-300",
  "placeholder:text-stone-400 focus:ring-2 focus:ring-marque-600 focus:outline-none",
  "aria-invalid:ring-2 aria-invalid:ring-red-600 disabled:bg-stone-100",
);

type Etiquetage = { label: ReactNode; erreur?: string; aide?: ReactNode };

function Etiquette({
  id,
  label,
  erreur,
  aide,
  children,
}: Etiquetage & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-stone-800">
        {label}
      </label>
      {children}
      {aide && !erreur && <p className="mt-1 text-sm text-stone-500">{aide}</p>}
      {erreur && (
        <p id={`${id}-erreur`} className="mt-1 text-sm font-medium text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}

export function Champ({ label, erreur, aide, id, name, className, ...props }: ComponentProps<"input"> & Etiquetage) {
  const ident = id ?? `champ-${name}`;
  return (
    <Etiquette id={ident} label={label} erreur={erreur} aide={aide}>
      <input
        id={ident}
        name={name}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${ident}-erreur` : undefined}
        className={cx(classesChamp, className)}
        {...props}
      />
    </Etiquette>
  );
}

export function ZoneTexte({
  label,
  erreur,
  aide,
  id,
  name,
  className,
  ...props
}: ComponentProps<"textarea"> & Etiquetage) {
  const ident = id ?? `champ-${name}`;
  return (
    <Etiquette id={ident} label={label} erreur={erreur} aide={aide}>
      <textarea
        id={ident}
        name={name}
        rows={3}
        aria-invalid={erreur ? true : undefined}
        className={cx(classesChamp, className)}
        {...props}
      />
    </Etiquette>
  );
}

export function Selection({
  label,
  erreur,
  aide,
  id,
  name,
  className,
  children,
  ...props
}: ComponentProps<"select"> & Etiquetage) {
  const ident = id ?? `champ-${name}`;
  return (
    <Etiquette id={ident} label={label} erreur={erreur} aide={aide}>
      <select
        id={ident}
        name={name}
        aria-invalid={erreur ? true : undefined}
        className={cx(classesChamp, "appearance-auto", className)}
        {...props}
      >
        {children}
      </select>
    </Etiquette>
  );
}

export function Carte({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200", className)} {...props} />;
}

export function TitreSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function EnTetePage({
  titre,
  retour,
  action,
  sousTitre,
}: {
  titre: ReactNode;
  retour?: string;
  action?: ReactNode;
  sousTitre?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-stone-200 bg-stone-100/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      <div className="flex min-h-12 items-center gap-2">
        {retour && (
          <Link
            href={retour}
            aria-label="Retour"
            className="-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl text-stone-700 hover:bg-stone-200"
          >
            ‹
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{titre}</h1>
          {sousTitre && <p className="truncate text-sm text-stone-600">{sousTitre}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Pastille({
  couleur = "gris",
  children,
}: {
  couleur?: "gris" | "vert" | "rouge" | "orange" | "bleu";
  children: ReactNode;
}) {
  const couleurs = {
    gris: "bg-stone-100 text-stone-700 ring-stone-300",
    vert: "bg-marque-50 text-marque-800 ring-marque-600/30",
    rouge: "bg-red-50 text-red-800 ring-red-600/30",
    orange: "bg-amber-50 text-amber-800 ring-amber-600/30",
    bleu: "bg-sky-50 text-sky-800 ring-sky-600/30",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
        couleurs[couleur],
      )}
    >
      {children}
    </span>
  );
}

export function PointCouleur({ couleur, className }: { couleur: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-3 shrink-0 rounded-full", className)}
      style={{ backgroundColor: couleur }}
    />
  );
}

export function MessageErreur({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800 ring-1 ring-red-200">
      {children}
    </div>
  );
}

export function MessageInfo({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{children}</div>;
}

export function EtatVide({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-300 px-4 py-8 text-center text-stone-600">
      <p>{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
