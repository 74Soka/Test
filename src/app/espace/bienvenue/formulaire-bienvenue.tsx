"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { envoyerMonInscription, verifierCodeParrainage, type DemandeInscription } from "../actions";
import { codeComplet, normaliserCode } from "@/lib/domaine/parrainage";
import { RechercheAdresse } from "@/components/recherche-adresse";
import { Bouton, Carte, Champ, MessageErreur, Selection, ZoneTexte } from "@/components/ui";
import type { AdresseTrouvee } from "@/lib/geocodage/types";

type Adresse = NonNullable<DemandeInscription["adresse"]>;

const CONNU_PAR = ["Un proche, le bouche-à-oreille", "Au marché", "Instagram", "Facebook", "Un flyer", "Autre"];

type EtatCode = "vide" | "incomplet" | "verification" | "valide" | "invalide";

/** Vérifie le code de parrainage pendant la saisie (une demande par code complet). */
function useEtatCode(saisie: string): EtatCode {
  const normalise = normaliserCode(saisie);
  const [resultats, setResultats] = useState<Record<string, boolean>>({});
  const complet = codeComplet(normalise);
  useEffect(() => {
    if (!complet || normalise in resultats) return;
    let annule = false;
    const minuteur = window.setTimeout(async () => {
      const valide = await verifierCodeParrainage(normalise).catch(() => false);
      if (!annule) setResultats((r) => ({ ...r, [normalise]: valide }));
    }, 400);
    return () => {
      annule = true;
      window.clearTimeout(minuteur);
    };
  }, [normalise, complet, resultats]);
  if (!normalise) return "vide";
  if (!complet) return normalise.length >= 8 ? "invalide" : "incomplet";
  if (!(normalise in resultats)) return "verification";
  return resultats[normalise] ? "valide" : "invalide";
}

export function FormulaireBienvenue({
  initial,
}: {
  initial: Omit<DemandeInscription, "adresse"> & { adresse: Adresse | null };
}) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [manuel, setManuel] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const maj = (partiel: Partial<typeof d>) => setD((x) => ({ ...x, ...partiel }));
  const code = useEtatCode(d.parrain);
  const [codeRefuse, setCodeRefuse] = useState<string | null>(null);
  const [choixConnu, setChoixConnu] = useState(() =>
    !d.connuPar ? "" : CONNU_PAR.includes(d.connuPar) ? d.connuPar : "Autre",
  );
  const adresse = d.adresse;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const codeEnvoye = normaliserCode(d.parrain);
        demarrer(async () => {
          const r = await envoyerMonInscription({ ...d, adresse: d.adresse ?? (undefined as unknown as Adresse) });
          if (!r.ok) {
            setErreur(r.erreur);
            setChamps(r.champs ?? {});
            setCodeRefuse(r.champs?.parrain ? codeEnvoye : null);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          router.push("/espace");
          router.refresh();
        });
      }}
    >
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <Carte className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Prénom" name="prenom" autoComplete="given-name" value={d.prenom} onChange={(e) => maj({ prenom: e.target.value })} erreur={champs.prenom} />
          <Champ label="Nom" name="nom" autoComplete="family-name" required value={d.nom} onChange={(e) => maj({ nom: e.target.value })} erreur={champs.nom} />
        </div>
        <Champ
          label="Téléphone"
          name="telephone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          value={d.telephone}
          onChange={(e) => maj({ telephone: e.target.value })}
          erreur={champs.telephone}
          aide="Pour vous prévenir le jour de la livraison."
        />
      </Carte>

      <Carte className="space-y-4">
        {manuel ? (
          <>
            <Champ
              label="Adresse (numéro, rue, lieu-dit)"
              name="ligne"
              value={adresse?.ligne ?? ""}
              onChange={(e) =>
                maj({ adresse: { ligne: e.target.value, codePostal: adresse?.codePostal ?? "", commune: adresse?.commune ?? "", codeInsee: null, lat: null, lng: null } })
              }
              erreur={champs["adresse.ligne"] ?? champs.adresse}
            />
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Champ
                label="Code postal"
                name="codePostal"
                inputMode="numeric"
                value={adresse?.codePostal ?? ""}
                onChange={(e) =>
                  maj({ adresse: { ligne: adresse?.ligne ?? "", codePostal: e.target.value, commune: adresse?.commune ?? "", codeInsee: null, lat: null, lng: null } })
                }
                erreur={champs["adresse.codePostal"]}
              />
              <Champ
                label="Commune"
                name="commune"
                value={adresse?.commune ?? ""}
                onChange={(e) =>
                  maj({ adresse: { ligne: adresse?.ligne ?? "", codePostal: adresse?.codePostal ?? "", commune: e.target.value, codeInsee: null, lat: null, lng: null } })
                }
                erreur={champs["adresse.commune"]}
              />
            </div>
          </>
        ) : (
          <RechercheAdresse<AdresseTrouvee>
            type="adresse"
            label="Votre adresse"
            placeholder="Ex. : 12 rue des Lilas, Hyères"
            valeurInitiale={adresse ? `${adresse.ligne} ${adresse.codePostal} ${adresse.commune}` : ""}
            erreur={champs.adresse ?? champs["adresse.ligne"]}
            onChoix={(a) =>
              maj({ adresse: { ligne: a.ligne, codePostal: a.codePostal, commune: a.commune, codeInsee: a.codeInsee, lat: a.lat, lng: a.lng } })
            }
            secours={{ libelle: "Je ne trouve pas mon adresse ›", onClick: () => setManuel(true) }}
          />
        )}
        {adresse && !manuel && (
          <p className="rounded-2xl bg-marque-50 px-3 py-2 text-stone-700">
            📍 {adresse.ligne}, {adresse.codePostal} {adresse.commune}
          </p>
        )}
        <Champ
          label="Complément d'adresse (facultatif)"
          name="complement"
          value={d.complement}
          onChange={(e) => maj({ complement: e.target.value })}
          placeholder="Bâtiment, étage, lieu-dit…"
        />
        <ZoneTexte
          label="Consignes de livraison (facultatif)"
          name="notesLivraison"
          value={d.notesLivraison}
          maxLength={500}
          onChange={(e) => maj({ notesLivraison: e.target.value })}
          placeholder="Code du portail, où déposer le panier…"
        />
      </Carte>

      <Carte className="space-y-2">
        <Champ
          label="Code de parrainage (facultatif)"
          name="parrain"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={d.parrain}
          onChange={(e) => maj({ parrain: e.target.value })}
          placeholder="Ex. EVCA 9616"
          erreur={
            // L'erreur du serveur ne vaut que pour le code qu'il a refusé (le client a pu le corriger entre-temps)
            (codeRefuse !== null && codeRefuse === normaliserCode(d.parrain) ? champs.parrain : undefined) ??
            (code === "invalide" ? "Code invalide, veuillez réessayer." : undefined)
          }
          aide="Un client vous a parrainé ? Indiquez son code : vous en profiterez tous les deux."
        />
        {code === "verification" && <p className="text-sm text-stone-600">Vérification du code…</p>}
        {code === "valide" && (
          <p role="status" className="font-semibold text-feuille-700">
            ✓ Code valide
          </p>
        )}
        <Selection
          label="Comment nous avez-vous connu ? (facultatif)"
          name="connuParChoix"
          value={choixConnu}
          onChange={(e) => {
            setChoixConnu(e.target.value);
            maj({ connuPar: e.target.value === "Autre" ? "" : e.target.value });
          }}
        >
          <option value="">Choisir…</option>
          {CONNU_PAR.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selection>
        {choixConnu === "Autre" && (
          <Champ
            label="Précisez"
            name="connuPar"
            maxLength={100}
            value={d.connuPar ?? ""}
            onChange={(e) => maj({ connuPar: e.target.value })}
          />
        )}
      </Carte>

      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Envoi…" : "Envoyer mon inscription"}
      </Bouton>
    </form>
  );
}
