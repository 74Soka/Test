"use client";

import { useEffect, useState, useTransition } from "react";
import { enregistrerClient, type DonneesClient } from "./actions";
import { Carte as CarteOsm } from "@/components/carte";
import { ChoixClient, type ClientChoisissable } from "@/components/choix-client";
import { RechercheAdresse } from "@/components/recherche-adresse";
import { Bouton, Carte, Champ, MessageErreur, MessageInfo, PointCouleur, ZoneTexte, cx } from "@/components/ui";
import { libelleTournee, secteurPropose, secteursPourCommune, type Creneau } from "@/lib/domaine/secteurs";
import type { Resultat } from "@/lib/erreurs";
import { meilleurePosition, texteAdresse } from "@/lib/geocodage/localiser";
import type { AdresseTrouvee } from "@/lib/geocodage/types";

export type SecteurFormulaire = {
  id: string;
  nom: string;
  jour: number;
  creneau: Creneau;
  couleur: string;
  depart_lat: number;
  depart_lng: number;
  communes: { code_insee: string; nom: string }[];
};

type Adresse = NonNullable<DonneesClient["adresse"]>;

const CENTRE_VAR = { lat: 43.43, lng: 6.22 };

export function FormulaireClient({
  id,
  initial,
  secteurs,
  clients,
}: {
  id?: string;
  initial: DonneesClient;
  secteurs: SecteurFormulaire[];
  clients: ClientChoisissable[];
}) {
  const [donnees, setDonnees] = useState<DonneesClient>(initial);
  const [rechercheOuverte, setRechercheOuverte] = useState(!initial.adresse);
  const [modeManuel, setModeManuel] = useState(false);
  const [infoSecteur, setInfoSecteur] = useState<string | null>(null);
  const [reperePlace, setReperePlace] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const champs = resultat && !resultat.ok ? (resultat.champs ?? {}) : {};

  const maj = (partiel: Partial<DonneesClient>) => setDonnees((d) => ({ ...d, ...partiel }));
  const adresse = donnees.adresse as Adresse | undefined;
  const secteurChoisi = secteurs.find((s) => s.id === donnees.secteurId);
  const centreCarte = secteurChoisi
    ? { lat: secteurChoisi.depart_lat, lng: secteurChoisi.depart_lng }
    : secteurs[0]
      ? { lat: secteurs[0].depart_lat, lng: secteurs[0].depart_lng }
      : CENTRE_VAR;
  const position = adresse?.lat != null && adresse?.lng != null ? { lat: adresse.lat, lng: adresse.lng } : null;

  // Fiche sans repère (importée) : on le place tout de suite d'après l'adresse,
  // l'équipe n'a plus qu'à vérifier (et à le déplacer si besoin)
  useEffect(() => {
    const a = initial.adresse as Adresse | undefined;
    if (!a?.ligne || a.lat != null || !a.codePostal) return;
    const controle = new AbortController();
    const params = new URLSearchParams({ q: texteAdresse({ ligne: a.ligne, codePostal: a.codePostal, commune: a.commune }), type: "adresse" });
    fetch(`/api/geocodage?${params}`, { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((corps: { resultats?: AdresseTrouvee[] } | null) => {
        const trouvee = corps?.resultats ? meilleurePosition(a, corps.resultats) : null;
        if (!trouvee) return;
        setDonnees((d) => {
          const actuelle = d.adresse as Adresse | undefined;
          // L'équipe a déjà changé l'adresse ou placé le repère : on ne touche à rien
          if (!actuelle || actuelle.lat != null || actuelle.ligne !== a.ligne) return d;
          return {
            ...d,
            adresse: { ...actuelle, lat: trouvee.lat, lng: trouvee.lng, codeInsee: actuelle.codeInsee ?? trouvee.codeInsee, source: "adresse" },
          };
        });
        setReperePlace(true);
      })
      .catch(() => {});
    return () => controle.abort();
  }, [initial.adresse]);

  function choisirAdresse(a: AdresseTrouvee) {
    maj({
      adresse: {
        ligne: a.ligne,
        codePostal: a.codePostal,
        commune: a.commune,
        codeInsee: a.codeInsee,
        lat: a.lat,
        lng: a.lng,
        source: "adresse",
      },
    });
    setRechercheOuverte(false);
    setModeManuel(false);

    const propose = secteurPropose(a.codeInsee, secteurs);
    if (propose) {
      maj({ secteurId: propose.id });
      setInfoSecteur(`Secteur proposé d'après la commune : ${propose.nom}.`);
    } else if (secteursPourCommune(a.codeInsee, secteurs).length > 1) {
      setInfoSecteur("Plusieurs secteurs couvrent cette commune : choisissez le bon ci-dessous.");
    } else {
      setInfoSecteur(`Aucun secteur ne couvre ${a.commune} : choisissez-en un ci-dessous.`);
    }
  }

  function majAdresseManuelle(partiel: Partial<Adresse>) {
    const base: Adresse = adresse ?? {
      ligne: "",
      codePostal: "",
      commune: "",
      codeInsee: null,
      lat: null,
      lng: null,
      source: null,
    };
    maj({ adresse: { ...base, codeInsee: null, ...partiel } });
  }

  function deplacerRepere(p: { lat: number; lng: number }) {
    if (!adresse && !modeManuel) return;
    majAdresseManuelle({ lat: p.lat, lng: p.lng, source: "manuelle", codeInsee: adresse?.codeInsee ?? null });
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(async () => {
          const r = await enregistrerClient(donnees, id);
          setResultat(r);
          if (!r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
    >
      {resultat && !resultat.ok && <MessageErreur>{resultat.erreur}</MessageErreur>}

      <Carte className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Champ
            label="Prénom"
            name="prenom"
            autoComplete="off"
            autoCapitalize="words"
            value={donnees.prenom ?? ""}
            onChange={(e) => maj({ prenom: e.target.value })}
            erreur={champs.prenom}
          />
          <Champ
            label="Nom"
            name="nom"
            autoComplete="off"
            autoCapitalize="words"
            value={donnees.nom}
            onChange={(e) => maj({ nom: e.target.value })}
            erreur={champs.nom}
            required
          />
        </div>
        <Champ
          label="Téléphone"
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={donnees.telephone ?? ""}
          onChange={(e) => maj({ telephone: e.target.value })}
          erreur={champs.telephone}
          placeholder="06 12 34 56 78"
        />
        <Champ
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={donnees.email ?? ""}
          onChange={(e) => maj({ email: e.target.value })}
          erreur={champs.email}
        />
      </Carte>

      <Carte className="space-y-4">
        <h2 className="text-lg font-bold">Adresse de livraison</h2>

        {rechercheOuverte && !modeManuel && (
          <>
            <RechercheAdresse<AdresseTrouvee>
              type="adresse"
              label="Rechercher l'adresse"
              placeholder="Ex. 12 rue des Lilas Hyères"
              proche={centreCarte}
              erreur={champs.adresse ?? champs["adresse.ligne"]}
              onChoix={choisirAdresse}
              secours={{ libelle: "Saisir l'adresse à la main ›", onClick: () => setModeManuel(true) }}
            />
            <div className="flex flex-wrap gap-2">
              <Bouton variante="discret" taille="petit" onClick={() => setModeManuel(true)}>
                Adresse introuvable ? Saisir à la main
              </Bouton>
              {adresse && (
                <Bouton variante="discret" taille="petit" onClick={() => setRechercheOuverte(false)}>
                  Garder l&apos;adresse actuelle
                </Bouton>
              )}
            </div>
          </>
        )}

        {modeManuel && (
          <div className="space-y-3">
            <MessageInfo>Saisissez l&apos;adresse puis touchez la carte à l&apos;endroit exact de la livraison.</MessageInfo>
            <Champ
              label="Adresse (numéro, rue, lieu-dit)"
              name="ligne"
              value={adresse?.ligne ?? ""}
              onChange={(e) => majAdresseManuelle({ ligne: e.target.value })}
              erreur={champs["adresse.ligne"]}
            />
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Champ
                label="Code postal"
                name="codePostal"
                inputMode="numeric"
                maxLength={5}
                value={adresse?.codePostal ?? ""}
                onChange={(e) => majAdresseManuelle({ codePostal: e.target.value })}
                erreur={champs["adresse.codePostal"]}
              />
              <Champ
                label="Commune"
                name="commune"
                value={adresse?.commune ?? ""}
                onChange={(e) => majAdresseManuelle({ commune: e.target.value })}
                erreur={champs["adresse.commune"]}
              />
            </div>
            <Bouton
              variante="discret"
              taille="petit"
              onClick={() => {
                setModeManuel(false);
                setRechercheOuverte(true);
              }}
            >
              Revenir à la recherche d&apos;adresse
            </Bouton>
          </div>
        )}

        {adresse && !rechercheOuverte && !modeManuel && (
          <div className="flex items-start justify-between gap-3">
            <p>
              <span className="block font-semibold">{adresse.ligne}</span>
              <span className="block text-stone-600">
                {adresse.codePostal} {adresse.commune}
              </span>
            </p>
            <Bouton variante="secondaire" taille="petit" onClick={() => setRechercheOuverte(true)}>
              Changer
            </Bouton>
          </div>
        )}

        {(adresse || modeManuel) && (
          <div className="space-y-1">
            <CarteOsm position={position} centre={centreCarte} onDeplacer={deplacerRepere} />
            <p className={cx("text-sm", champs["adresse.position"] ? "font-medium text-red-700" : "text-stone-600")}>
              {champs["adresse.position"] && !position
                ? champs["adresse.position"]
                : position
                ? adresse?.source === "manuelle"
                  ? "Position placée à la main. Faites glisser le repère pour l'ajuster."
                  : reperePlace
                    ? "Repère placé automatiquement d'après l'adresse : vérifiez-le, et faites-le glisser si besoin."
                    : "Faites glisser le repère si la maison est ailleurs (chemin, portail…)."
                : id
                  ? "Pas encore de repère : il sera placé d'après l'adresse à l'enregistrement. Vous pouvez aussi toucher la carte."
                  : "Touchez la carte pour placer le repère de livraison."}
            </p>
          </div>
        )}

        <Champ
          label="Complément d'adresse"
          name="complementAdresse"
          value={donnees.complementAdresse ?? ""}
          onChange={(e) => maj({ complementAdresse: e.target.value })}
          placeholder="Bâtiment, étage, nom sur la boîte…"
        />
        <ZoneTexte
          label="Notes de livraison"
          name="notesLivraison"
          value={donnees.notesLivraison ?? ""}
          onChange={(e) => maj({ notesLivraison: e.target.value })}
          placeholder="Code portail, où déposer le panier, chien…"
        />
      </Carte>

      <Carte>
        <fieldset>
          <legend className="mb-1 text-lg font-bold">Secteur</legend>
          {infoSecteur && <p className="mb-2 text-sm text-sky-800">{infoSecteur}</p>}
          {champs.secteurId && <p className="mb-2 text-sm font-medium text-red-700">{champs.secteurId}</p>}
          {secteurs.length === 0 && (
            <p className="text-stone-600">Aucun secteur : créez-en un dans Réglages › Secteurs.</p>
          )}
          <div className="space-y-2">
            {secteurs.map((s) => (
              <label
                key={s.id}
                className={cx(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-4 py-2 ring-1",
                  donnees.secteurId === s.id ? "bg-marque-50 ring-2 ring-marque-600" : "bg-white ring-stone-300",
                )}
              >
                <input
                  type="radio"
                  name="secteurId"
                  value={s.id}
                  checked={donnees.secteurId === s.id}
                  onChange={() => maj({ secteurId: s.id })}
                  className="size-5 accent-marque-700"
                />
                <PointCouleur couleur={s.couleur} />
                <span>
                  <span className="block font-semibold">{s.nom}</span>
                  <span className="block text-sm text-stone-600">{libelleTournee(s)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Carte>

      <Carte className="space-y-4">
        <ChoixClient
          label="Parrain (facultatif)"
          clients={clients}
          valeur={donnees.parrainId ?? null}
          onChange={(parrainId) => maj({ parrainId })}
          erreur={champs.parrainId}
          aide="Le client qui l'a recommandé."
        />
        <Champ
          label="Date d'inscription"
          name="dateInscription"
          type="date"
          value={donnees.dateInscription}
          onChange={(e) => maj({ dateInscription: e.target.value })}
          erreur={champs.dateInscription}
        />
      </Carte>

      <Bouton type="submit" taille="grand" className="w-full" disabled={enCours}>
        {enCours ? "Enregistrement…" : id ? "Enregistrer les modifications" : "Créer le client"}
      </Bouton>
    </form>
  );
}
