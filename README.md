# Paniers : commandes, tournées et fidélité

Application web pour gérer des livraisons de paniers de fruits et légumes. Elle couvre les clients, les commandes,
les livraisons par secteur et, plus tard, les tournées optimisées et la carte de fidélité. Elle est pensée pour le
téléphone : gros boutons, textes lisibles dehors, et on peut l'installer sur l'écran d'accueil.

## Où en est-on ?

| Phase | Contenu | État |
|---|---|---|
| **1** | Clients, secteurs, catalogue, commandes, vue Livraisons | ✅ livrée, à valider |
| 2 | Tournées optimisées (carte, ordre de passage, Google Maps / Waze) | à venir |
| 3 | Fidélité et parrainage (tampons, récompenses, VIP / Ultra) | ✅ livrée, à valider |
| 3 bis | Bouton « Livré » dans l'écran de tournée | avec la Phase 2 |

### Ce que fait la Phase 1

- **Clients**
  - Recherche par nom, commune ou téléphone, sans se soucier des accents, et filtre par secteur.
  - Adresse en **autocomplétion**, à partir de la Base Adresse Nationale.
  - **Secteur proposé automatiquement** d'après la commune.
  - **Mini-carte** dont on peut déplacer le repère (chemin, portail…). Si l'adresse est introuvable, on la saisit à
    la main et on place le repère.
  - Notes de livraison (code portail…), appel et SMS en un geste.
  - **Parrain** choisi par recherche, liste des **filleuls**.
  - Client **inactif** : il ne commande plus, mais on garde son historique.
  - **Suppression RGPD** : la fiche et toutes ses commandes. Un écran détaille ce qui sera effacé.
- **Secteurs** : un jour et un créneau (matin, après-midi ou journée), les communes couvertes et le point de départ de
  la tournée.
- **Catalogue** : les paniers et les **suppléments de saison**. On désactive un supplément hors saison : il disparaît
  de la saisie mais reste dans l'historique.
- **Commandes**
  - Saisie rapide avec des boutons **+ / −**, total calculé.
  - Date **proposée selon le secteur** du client (le prochain jour de tournée).
  - Bouton **« Recommander comme la dernière fois »**.
  - Statuts : à livrer, livrée (avec l'heure de livraison), annulée.
  - Règles vérifiées par la base elle-même :
    - **au moins un panier** par commande ;
    - **une commande par client et par semaine** ;
    - **prix figés** au moment de la commande : changer un prix au catalogue ne modifie pas les commandes déjà
      saisies.
- **Livraisons** : vue **semaine** ou **jour**, groupée par jour puis par secteur, avec le **récapitulatif à préparer**
  (nombre de paniers de chaque sorte et de suppléments) et le total.

### Fidélité et parrainage

Tout se règle dans *Réglages → Fidélité et parrainage* (et le nombre de tampons par panier dans le *Catalogue*).

| Événement | Tampons (réglages par défaut) |
|---|---|
| Création d'un client | +1 |
| Client rattaché à un parrain | +1 pour le parrain |
| Panier 30 € livré | +1 par panier |
| Panier 50 € livré | +2 par panier |
| Commande livrée d'un filleul | +1 pour le parrain |
| Correction manuelle (fiche client) | + ou −, avec une raison |

| Récompense | Coût | Pour qui |
|---|---|---|
| Supplément offert | 5 | tous |
| Confiture + supplément offerts | 10 | tous |
| Panier 30 € offert | 20 | VIP : 5 filleuls déjà livrés |
| Panier 50 € offert | 30 | Ultra : 10 filleuls déjà livrés |

- Les tampons sont un **journal** : chaque gain garde son motif, sa date et sa commande. Le solde se calcule à partir
  de ce journal.
- Ceux d'une commande sont posés **à la livraison**, une seule fois, même si on la marque deux fois comme livrée. Ils
  sont retirés si la livraison est annulée.
- Une récompense s'utilise **sur une commande** (section *Fidélité* de la saisie). Ses tampons sont retirés du solde,
  comme sur une carte papier (7 tampons − 5 = 2), et rendus si la commande est annulée. Ce qui est offert apparaît dans
  la commande et dans le récapitulatif à préparer. Les articles offerts ne rapportent pas de tampons.
- Si un filleul est supprimé (RGPD), son parrain garde les tampons gagnés grâce à lui.

## Technologies

- [Next.js 16](https://nextjs.org) (App Router), TypeScript, Tailwind CSS 4
- [Supabase](https://supabase.com) : base Postgres, authentification, sécurité par lignes (RLS)
- Géocodage : [service de géocodage de l'IGN](https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage).
  Il a pris le relais de `api-adresse.data.gouv.fr`, avec le même format, et il est gratuit. Le module est isolé
  dans `src/lib/geocodage/`.
- Cartes : Leaflet + OpenStreetMap

---

## Mise en route

### 1. Créer le projet Supabase (gratuit)

1. Créez un compte sur [supabase.com](https://supabase.com), puis un projet. Choisissez une région en Europe (par
   exemple *West EU (Paris)*) pour que les données de vos clients restent dans l'UE.
2. **Fermez les inscriptions libres** : *Authentication → Sign In / Providers*, désactivez *Allow new users to sign
   up*. Les comptes seront créés par vous seul (étape 4).
3. **Créez les tables** : *SQL Editor → New query*, collez le contenu de
   `supabase/migrations/20261106000000_phase1_clients_commandes.sql`, puis cliquez sur *Run*.
4. *(Facultatif)* **Données de démonstration** : même opération avec `supabase/seed.sql`. Vous obtenez 3 secteurs du
   Var, 20 clients fictifs et des commandes sur 3 week-ends.

### 2. Configurer l'application

```bash
npm install
cp .env.example .env.local
```

Dans `.env.local`, renseignez les valeurs de *Project Settings → API Keys* :

| Variable | Où la trouver | Remarque |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | *Project Settings → Data API* | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé *publishable* (ou ancienne *anon*) | publique, protégée par la RLS |
| `SUPABASE_SECRET_KEY` | clé *secret* (ou ancienne *service_role*) | **secrète** : sert seulement au script de création de compte |

> `.env.local` est ignoré par git : vos clés ne sont jamais commitées.

### 3. Créer votre compte administrateur

```bash
npm run creer-admin -- vous@exemple.fr "un mot de passe solide"
# Plus tard, pour un livreur :
npm run creer-admin -- livreur@exemple.fr "mot de passe" livreur
```

### 4. Lancer

```bash
npm run dev
```

Ouvrez <http://localhost:3000>.

**Sur votre téléphone, à la maison** : lancez `npm run dev -- -H 0.0.0.0`, puis ouvrez `http://<adresse-IP-de-l-ordinateur>:3000`
sur le téléphone, connecté au même Wi-Fi.

### Variante : Supabase en local (nécessite Docker)

```bash
npx supabase start      # démarre Supabase sur votre machine
npx supabase db reset   # applique les migrations + les données de démo
npx supabase status     # affiche l'URL et les clés à mettre dans .env.local
```

---

## Tests

| Commande | Ce qui est testé | Prérequis |
|---|---|---|
| `npm test` | Logique métier : dates de livraison, téléphones, prix, recherche, secteur proposé, récapitulatif, géocodage (réponses simulées) | aucun |
| `npm run test:db` | La base : **RLS** (anonyme, compte sans profil, livreur, admin), parrainage sans boucle, règles des commandes, suppression RGPD, données de démo | un serveur Postgres (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Parcours complets sur un téléphone simulé : connexion, création de client, commande, recommander, doublon de semaine, statut, livraisons, saisie manuelle d'adresse, suppression RGPD, catalogue | Postgres (`TEST_DATABASE_URL`) + Chromium |

`TEST_DATABASE_URL` désigne un serveur Postgres (version 15 ou plus) où les tests créent puis suppriment des bases
jetables. Exemple avec Supabase local : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Les tests de bout en bout font tourner l'application contre une **imitation minimale de Supabase**
(`tests/e2e/faux-supabase.ts`) branchée sur une vraie base Postgres avec les données de démo. Ils n'ont besoin ni de
Docker ni d'un projet en ligne. Cette imitation ne reproduit pas la RLS : la RLS est couverte par `npm run test:db`.

Avant le premier `npm run test:e2e`, installez le navigateur de test : `npx playwright install chromium`.

Autres vérifications : `npm run lint`, `npm run typecheck`, `npm run build`.

---

## Sécurité et RGPD

- **RLS activée sur toutes les tables.** Seuls les comptes présents dans la table `profils` voient des données.
  L'admin lit et écrit, le livreur lit seulement. Un compte créé sans profil ne voit **rien**, même si les
  inscriptions étaient rouvertes par erreur. Le rôle anonyme n'a aucun droit.
- Chaque action côté serveur revérifie que l'utilisateur est administrateur avant de toucher aux données.
- La clé secrète n'est utilisée que par le script `creer-admin`, jamais par l'application.
- **Droit à l'effacement** : *Fiche client → Supprimer le client et ses données…* supprime la fiche, les commandes et
  leurs lignes. Les filleuls restent clients, sans parrain.
- Données hébergées dans la région Supabase choisie (UE recommandée).

## Organisation du code

```
supabase/
  migrations/      schéma SQL versionné (tables, règles, RLS)
  seed.sql         données de démonstration (Var)
src/
  app/
    connexion/     connexion par e-mail + mot de passe
    (app)/         écrans protégés : livraisons, clients, commandes, reglages
    api/geocodage/ recherche d'adresses (passe par le serveur)
  components/      boutons, champs, carte, recherche d'adresse, compteur +/−
  lib/
    domaine/       règles métier pures (testées) : dates, prix, téléphones…
    geocodage/     géocodeur interchangeable (interface + implémentation IGN)
    supabase/      clients Supabase et types de la base
    donnees.ts     lectures de la base
  proxy.ts         rafraîchit la session, protège les pages
scripts/creer-admin.ts
tests/
  unit/  db/  e2e/
```

### Changer de service de géocodage

L'application ne connaît que l'interface `Geocodeur` (`src/lib/geocodage/types.ts`). Pour changer de fournisseur,
écrivez une autre implémentation et branchez-la dans `src/lib/geocodage/index.ts`. L'adresse du service IGN peut aussi
être modifiée avec la variable `GEOCODAGE_URL`.

### Modifier la base

> La première migration a été appliquée à la main dans l'éditeur SQL du projet. Si vous utilisez un jour la CLI
> (`supabase db push`), marquez-la d'abord comme appliquée :
> `npx supabase migration repair --status applied 20261106000000`.

Ajoutez un **nouveau** fichier dans `supabase/migrations/` (ne modifiez pas un fichier déjà appliqué). Mettez ensuite
à jour `src/lib/supabase/database.types.ts`, par exemple avec
`npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts`.

## Mise en ligne (Netlify, gratuit, usage commercial autorisé)

Tout se fait depuis un navigateur, même sur téléphone :

1. Sur [netlify.com](https://www.netlify.com), créez un compte **avec GitHub**.
2. *Add new project → Import an existing project → GitHub*, autorisez l'accès au dépôt, puis choisissez-le avec la
   branche à publier.
3. **Avant de lancer le déploiement**, ajoutez les variables d'environnement (*Add environment variables*) :
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Elles sont intégrées au moment de la
   construction : si on les ajoute après, il faut relancer un déploiement.
4. *Deploy*. Les réglages de construction sont dans `netlify.toml`. Chaque nouveau commit sur la branche est ensuite
   publié automatiquement.
5. Rendez le projet **public** (bouton *Make public*, ou *Project configuration → Access & security*). Sinon, Netlify
   demande une connexion Netlify avant même d'afficher l'application. L'application garde sa propre connexion : rendre
   le projet public n'expose aucune donnée.
6. Sur le téléphone, ouvrez l'adresse du site, connectez-vous, puis *Ajouter à l'écran d'accueil*.

**En cas de page « Page not found » de Netlify partout** : le module Next.js de Netlify n'a pas tourné, et le
dossier `.next` brut a été publié. Ce module est déclaré dans `netlify.toml`, avec sa version fixée dans
`package.json` (`@netlify/plugin-nextjs`) : vérifiez que ces deux fichiers sont à jour, puis relancez un déploiement.

Ne mettez jamais `SUPABASE_SECRET_KEY` dans l'hébergeur : elle ne sert qu'au script `creer-admin`.

L'offre gratuite de Vercel, l'autre hébergeur courant pour Next.js, est réservée à un usage non commercial.
