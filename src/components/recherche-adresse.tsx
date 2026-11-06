"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdresseTrouvee, CommuneTrouvee, Proximite } from "@/lib/geocodage/types";
import { cx } from "./ui";

type Props<T> = {
  type: T extends AdresseTrouvee ? "adresse" : "commune";
  label: string;
  placeholder?: string;
  proche?: Proximite | null;
  erreur?: string;
  aide?: string;
  onChoix: (resultat: T) => void;
  /** Vider le champ après un choix (utile pour ajouter plusieurs communes) */
  viderApresChoix?: boolean;
  valeurInitiale?: string;
};

/**
 * Champ de recherche avec suggestions (adresses ou communes), interrogeant
 * /api/geocodage au fil de la frappe.
 */
export function RechercheAdresse<T extends AdresseTrouvee | CommuneTrouvee>({
  type,
  label,
  placeholder,
  proche,
  erreur,
  aide,
  onChoix,
  viderApresChoix,
  valeurInitiale = "",
}: Props<T>) {
  const id = useId();
  const [texte, setTexte] = useState(valeurInitiale);
  const [resultats, setResultats] = useState<T[]>([]);
  const [etat, setEtat] = useState<"repos" | "recherche" | "erreur" | "vide">("repos");
  const [ouvert, setOuvert] = useState(false);
  const derniere = useRef(0);

  const procheLat = proche?.lat;
  const procheLng = proche?.lng;

  useEffect(() => {
    const requete = texte.trim();
    if (!ouvert || requete.length < 3) {
      return;
    }
    const numero = ++derniere.current;
    const minuteur = setTimeout(async () => {
      setEtat("recherche");
      const params = new URLSearchParams({ q: requete, type });
      if (procheLat !== undefined && procheLng !== undefined) {
        params.set("lat", String(procheLat));
        params.set("lng", String(procheLng));
      }
      try {
        const res = await fetch(`/api/geocodage?${params}`);
        const corps = (await res.json()) as { resultats?: T[]; erreur?: string };
        if (numero !== derniere.current) return;
        if (!res.ok || !corps.resultats) {
          setEtat("erreur");
          setResultats([]);
          return;
        }
        setResultats(corps.resultats);
        setEtat(corps.resultats.length ? "repos" : "vide");
      } catch {
        if (numero === derniere.current) setEtat("erreur");
      }
    }, 300);
    return () => clearTimeout(minuteur);
  }, [texte, type, procheLat, procheLng, ouvert]);

  function choisir(r: T) {
    onChoix(r);
    setOuvert(false);
    setResultats([]);
    setTexte(viderApresChoix ? "" : "libelle" in r ? r.libelle : `${r.nom} (${r.codePostal})`);
  }

  const afficherListe = ouvert && texte.trim().length >= 3;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block font-medium text-stone-800">
        {label}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={afficherListe}
        aria-controls={`${id}-liste`}
        aria-invalid={erreur ? true : undefined}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setOuvert(true);
        }}
        onFocus={() => setOuvert(true)}
        className="block w-full rounded-xl border-0 bg-white px-3.5 py-3 ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-marque-600 focus:outline-none aria-invalid:ring-2 aria-invalid:ring-red-600"
      />
      {aide && !erreur && <p className="mt-1 text-sm text-stone-500">{aide}</p>}
      {erreur && <p className="mt-1 text-sm font-medium text-red-700">{erreur}</p>}

      {afficherListe && (
        <div
          id={`${id}-liste`}
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-stone-200"
        >
          {etat === "recherche" && resultats.length === 0 && <p className="px-4 py-3 text-stone-500">Recherche…</p>}
          {etat === "erreur" && (
            <p className="px-4 py-3 text-red-700">Le service d&apos;adresses ne répond pas. Réessayez ou saisissez à la main.</p>
          )}
          {etat === "vide" && <p className="px-4 py-3 text-stone-500">Aucun résultat.</p>}
          <ul role="listbox">
            {resultats.map((r) => {
              const cle = "libelle" in r ? `${r.libelle}-${r.lat}` : r.codeInsee;
              return (
                <li key={cle} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => choisir(r)}
                    className={cx("block w-full px-4 py-3 text-left hover:bg-marque-50", "border-t border-stone-100")}
                  >
                    {"libelle" in r ? (
                      <>
                        <span className="block font-medium">{r.ligne}</span>
                        <span className="block text-sm text-stone-600">
                          {r.codePostal} {r.commune}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block font-medium">{r.nom}</span>
                        <span className="block text-sm text-stone-600">{r.codePostal}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
