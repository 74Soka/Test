"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { correspond, nomComplet } from "@/lib/domaine/texte";
import { cx, PointCouleur } from "@/components/ui";

type ClientLigne = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  adresse: string;
  code_postal: string;
  commune: string;
  secteur_id: string;
  actif: boolean;
};

type SecteurLigne = { id: string; nom: string; couleur: string };

export function ListeClients({ clients, secteurs }: { clients: ClientLigne[]; secteurs: SecteurLigne[] }) {
  const [recherche, setRecherche] = useState("");
  const [secteur, setSecteur] = useState<string | null>(null);
  const [inactifs, setInactifs] = useState(false);
  const parId = useMemo(() => new Map(secteurs.map((s) => [s.id, s])), [secteurs]);

  const filtres = useMemo(
    () =>
      clients.filter(
        (c) =>
          (inactifs || c.actif) &&
          (!secteur || c.secteur_id === secteur) &&
          correspond(recherche, [c.prenom, c.nom, c.commune, c.adresse, c.code_postal, c.telephone]),
      ),
    [clients, recherche, secteur, inactifs],
  );
  const nombreInactifs = clients.filter((c) => !c.actif).length;

  return (
    <div className="space-y-3">
      <input
        type="search"
        aria-label="Rechercher un client"
        placeholder="Rechercher : nom, commune, téléphone…"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className="block w-full rounded-xl border-0 bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-marque-600 focus:outline-none"
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrer par secteur">
        <Filtre actif={secteur === null} onClick={() => setSecteur(null)}>
          Tous
        </Filtre>
        {secteurs.map((s) => (
          <Filtre key={s.id} actif={secteur === s.id} onClick={() => setSecteur(secteur === s.id ? null : s.id)}>
            <PointCouleur couleur={s.couleur} />
            {s.nom}
          </Filtre>
        ))}
      </div>

      <p className="text-sm text-stone-600" aria-live="polite">
        {filtres.length} client{filtres.length > 1 ? "s" : ""}
        {nombreInactifs > 0 && (
          <>
            {" · "}
            <button type="button" className="font-semibold text-marque-800 underline" onClick={() => setInactifs(!inactifs)}>
              {inactifs ? "masquer" : "afficher"} les inactifs ({nombreInactifs})
            </button>
          </>
        )}
      </p>

      {filtres.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-stone-600 ring-1 ring-stone-200">
          Aucun client ne correspond.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-3xl bg-white shadow-[0_2px_8px_rgb(53_3_122/0.06)] ring-1 ring-marque-100">
          {filtres.map((c) => {
            const s = parId.get(c.secteur_id);
            return (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-marque-50">
                  {s && <PointCouleur couleur={s.couleur} />}
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate font-semibold", !c.actif && "text-stone-400")}>
                      {nomComplet(c)}
                      {!c.actif && " (inactif)"}
                    </span>
                    <span className="block truncate text-sm text-stone-600">
                      {c.adresse}, {c.commune}
                    </span>
                  </span>
                  <span aria-hidden className="text-2xl text-stone-300">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Filtre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1",
        actif ? "bg-marque-800 text-white ring-marque-800" : "bg-white text-stone-800 ring-stone-300",
      )}
    >
      {children}
    </button>
  );
}
