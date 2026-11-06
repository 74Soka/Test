"use client";

import { useId, useMemo, useState } from "react";
import { correspond, nomComplet } from "@/lib/domaine/texte";
import { Bouton } from "./ui";

export type ClientChoisissable = {
  id: string;
  nom: string;
  prenom: string;
  commune: string;
  telephone?: string | null;
};

/** Recherche d'un client dans une liste (parrain, client d'une commande…). */
export function ChoixClient({
  label,
  clients,
  valeur,
  onChange,
  erreur,
  aide,
  placeholder = "Nom, commune ou téléphone",
}: {
  label: string;
  clients: ClientChoisissable[];
  valeur: string | null;
  onChange: (id: string | null) => void;
  erreur?: string;
  aide?: string;
  placeholder?: string;
}) {
  const id = useId();
  const [texte, setTexte] = useState("");
  const choisi = clients.find((c) => c.id === valeur) ?? null;

  const resultats = useMemo(() => {
    if (!texte.trim()) return [];
    return clients
      .filter((c) => correspond(texte, [c.prenom, c.nom, c.commune, c.telephone]))
      .slice(0, 8);
  }, [texte, clients]);

  if (choisi) {
    return (
      <div>
        <p className="mb-1.5 font-medium text-stone-800">{label}</p>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-marque-50 px-4 py-2 ring-1 ring-marque-600/30">
          <div className="min-w-0">
            <p className="truncate font-semibold">{nomComplet(choisi)}</p>
            <p className="truncate text-sm text-stone-600">{choisi.commune}</p>
          </div>
          <Bouton variante="discret" taille="petit" onClick={() => onChange(null)}>
            Changer
          </Bouton>
        </div>
        {erreur && <p className="mt-1 text-sm font-medium text-red-700">{erreur}</p>}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-stone-800">
        {label}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        aria-invalid={erreur ? true : undefined}
        className="block w-full rounded-xl border-0 bg-white px-3.5 py-3 ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-marque-600 focus:outline-none aria-invalid:ring-2 aria-invalid:ring-red-600"
      />
      {aide && !erreur && <p className="mt-1 text-sm text-stone-500">{aide}</p>}
      {erreur && <p className="mt-1 text-sm font-medium text-red-700">{erreur}</p>}
      {texte.trim() && (
        <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
          {resultats.length === 0 && <li className="px-4 py-3 text-stone-500">Aucun client trouvé.</li>}
          {resultats.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-4 py-3 text-left hover:bg-marque-50"
                onClick={() => {
                  onChange(c.id);
                  setTexte("");
                }}
              >
                <span className="block font-medium">{nomComplet(c)}</span>
                <span className="block text-sm text-stone-600">{c.commune}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
