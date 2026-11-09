# Frais et Français : commandes, tournées et fidélité

Application web pour gérer des livraisons de paniers de fruits et légumes. Elle couvre les clients, les commandes,
les livraisons par secteur, les tournées optimisées, la carte de fidélité et un espace où les clients commandent
eux-mêmes. Elle est pensée pour le téléphone : gros boutons, textes lisibles dehors, et on peut l'installer sur l'écran
d'accueil.

## Où en est-on ?

| Phase | Contenu | État |
|---|---|---|
| **1** | Clients, secteurs, catalogue, commandes, vue Livraisons | ✅ livrée, à valider |
| 2 | Tournées optimisées (carte, ordre de passage, Google Maps / Waze, bouton « Livré » hors connexion) | ✅ livrée, à valider |
| 3 | Fidélité et parrainage (tampons, récompenses, VIP / Ultra, cadeaux de parrainage) | ✅ livrée, à valider |
| 4 | Espace client : inscription, composition des paniers, commande en ligne, carte de fidélité, alertes e-mail | ✅ livrée, à valider |
| 5 | Notifications de livraison : départ de tournée avec heure estimée, « vous êtes le prochain » | ✅ livrée, à valider |

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
- **Cadeaux de parrainage**, en plus des tampons, à partir du 1er janvier 2027 (date réglable) :
  - **le filleul** reçoit 6 œufs BIO offerts dans sa première commande, ajoutés d'office ;
  - **le parrain** reçoit une confiture offerte, une par filleul, dès que celui-ci a commandé.
    Elle est signalée sur sa fiche et dans sa prochaine commande (bouton *Offrir*).

### Tournées (Phase 2)

Onglet **Tournée**, pour un jour et un secteur :

- **carte** avec le point de départ et les arrêts numérotés (en vert une fois livrés), et **liste** dans l'ordre de
  passage ;
- **Optimiser l'ordre** : calcule le meilleur ordre depuis le point de départ, retour compris. En cours de tournée, les
  arrêts déjà livrés restent en tête et le reste repart du dernier arrêt livré ;
- **Réorganiser** : flèches ↑ ↓, puis *Enregistrer l'ordre* ;
- **Prochain arrêt** mis en avant, avec **Waze** et **Google Maps** en un geste. Juste après « Livré », un bouton **Y
  aller avec Waze** part vers l'arrêt suivant. Waze n'accepte qu'une destination par lien, d'où un lien par arrêt ;
  le trajet suit alors le trafic en temps réel. On peut aussi ouvrir les prochains arrêts d'un coup dans Google
  Maps, qui limite à 10 arrêts et tient compte du trafic ;
- sur chaque arrêt : notes de livraison (code portail…), contenu, cadeaux à remettre, montant à encaisser, appel ;
- **bouton « Livré »** : statut, heure de livraison et tampons de fidélité. Il marche **sans réseau** : l'appui est
  gardé dans le téléphone, avec son heure, et envoyé dès que la connexion revient. Laissez alors la page ouverte.

**En voiture, sur les routes** (module `src/lib/tournees/`, fournisseur interchangeable). Avec une **clé
OpenRouteService** :

- l'**ordre** est choisi d'après les vrais temps de conduite entre tous les arrêts, sens uniques compris. Les temps
  viennent d'OpenRouteService ; l'ordre est calculé par l'application. Jusqu'à 15 arrêts, c'est le **meilleur ordre
  possible** (calcul exact, message « Meilleur ordre possible »). Au-delà, c'est un très bon ordre, sans garantie ;
- la **carte** dessine le trajet le plus rapide par les routes, retour compris ;
- l'écran affiche la **distance et le temps de route** de la tournée, le **temps entre chaque arrêt** (« 🚗 12 min ·
  8 km depuis l'arrêt précédent »), le temps restant en cours de tournée et le retour au départ ;
- le dernier itinéraire reste dans le téléphone. En zone blanche, le tracé reste affiché.

Sans clé, tout est calculé à vol d'oiseau. C'est correct, mais les routes sont ignorées. Si le service ne répond pas,
l'application fait de même et le signale.

Les temps OpenRouteService viennent des limitations de vitesse et du type de route, pas du trafic du jour. Le temps
passé à chaque arrêt n'est pas compté. Pour le trafic en direct, partez de chaque arrêt avec Waze.

**Obtenir la clé (gratuite)** : créez un compte sur [openrouteservice.org](https://openrouteservice.org) (compte
HeiGIT), puis demandez une clé (*token*) au plan gratuit *Standard*. Le plan gratuit couvre largement une tournée :
environ 2 000 itinéraires et 500 matrices par jour. Ajoutez la clé dans la variable d'environnement `ORS_API_KEY`
(dans Netlify : *Project configuration → Environment variables*), puis redéployez. Le service est servi par
`api.heigit.org` (l'ancienne adresse `api.openrouteservice.org` ferme à l'automne 2026). `ORS_URL` permet de pointer
vers une autre adresse, par exemple une installation à vous.

**Livreurs** : un compte au rôle `livreur` ne voit que l'onglet Tournée. Il peut marquer les livraisons et changer
l'ordre, mais ne touche ni aux clients ni aux commandes.

### Espace client (commande en ligne)

Les clients ont leur propre compte (e-mail + mot de passe), sur le même site. Ils arrivent sur **/espace** :

- **Accueil** : prochaine livraison (jour de leur secteur), heure de clôture, leur commande de la semaine, la
  **composition des paniers** et un résumé de leur carte de fidélité ;
- **Commander** : paniers (avec leur contenu) et suppléments, au moins un panier. Ils peuvent utiliser leurs
  récompenses : l'article prévu par la récompense, ou les suppléments de leur choix (nombre réglable par récompense).
  Les cadeaux de parrainage (œufs du filleul, confiture du parrain) s'ajoutent tout seuls quand leur article est réglé.
  Modification et annulation jusqu'à la **clôture** (vendredi 12 h par défaut). Paiement à la livraison ;
- **Fidélité** : tampons, récompenses, filleuls, niveaux VIP / Ultra, historique ;
- **Commandes** : historique ; **Compte** : téléphone, consignes de livraison, mot de passe, **suppression du compte
  et de toutes ses données** (RGPD).

**Inscription** : un client déjà dans vos fiches crée son compte avec l'e-mail que vous avez noté : après confirmation
de l'adresse, son compte est relié à sa fiche tout seul. Une nouvelle personne indique son adresse et son téléphone :
son inscription attend votre validation (*Clients → inscriptions en ligne à valider*), où vous choisissez le secteur
(proposé d'après la commune) et le parrain, ou reliez l'inscription à une fiche existante.

**Côté équipe** : *Réglages → Composition des paniers* (un texte par panier et par semaine, avec « Reprendre la semaine
précédente ») et *Réglages → Commandes en ligne* (ouverture, jour et heure de clôture, message affiché aux clients).
Les commandes passées en ligne portent la mention 🌐 *en ligne*. Après la clôture, vous pouvez toujours modifier une
commande vous-même.

**Alertes e-mail** : à chaque commande, modification ou annulation en ligne, et à chaque nouvelle inscription, un
e-mail part vers `EMAIL_ALERTES`, avec le détail et le lien vers la commande.

### Notifications de livraison

Les clients activent les notifications depuis leur espace (accueil ou *Compte*). Le jour de la livraison :

- **Démarrer la tournée** (écran Tournée) : chaque client à livrer reçoit « 🚚 Votre livraison est en route ! Vous êtes
  le 3e arrêt, arrivée estimée vers 10 h 15 ». L'heure vient du temps de route réel jusqu'à chaque arrêt, plus 4 min
  par arrêt précédent ;
- à chaque **« Livré »**, le client suivant reçoit « 📍 Vous êtes le prochain ! Le livreur arrive dans environ 12 min ».
  Un appui fait hors connexion et envoyé plus de 15 min après ne prévient plus personne, pour éviter une alerte en
  retard ;
- chaque message ne part qu'une fois par commande, même si l'on touche deux fois le bouton.

Ce sont des notifications web, gratuites, sans App Store : sur Android elles marchent dans Chrome ; sur iPhone (iOS
16.4 ou plus récent), il faut d'abord **ajouter l'application à l'écran d'accueil** (l'espace client montre comment).
Sur la fiche d'un client, l'équipe voit combien de téléphones sont abonnés et peut envoyer une notification de test.
Aucun réglage : les clés de signature sont créées par l'application à la première visite de l'équipe sur la tournée.

#### Mise en service de l'espace client

1. **Base** : coller `supabase/migrations/20261108000000_espace_client.sql` puis
   `supabase/migrations/20261109000000_notifications_livraison.sql` dans l'éditeur SQL de Supabase (*Run*).
2. **Supabase → Authentication → Sign In / Providers** : activez *Allow new users to sign up* et laissez *Confirm
   email* activé. Ouvrir les inscriptions est sans risque : un compte qui n'est ni dans l'équipe ni relié à une fiche
   ne voit que le catalogue et la composition des paniers (vérifié par les tests de la base).
3. **Supabase → Authentication → URL Configuration** : *Site URL* = l'adresse du site (Netlify, puis votre nom de
   domaine) ; ajoutez `https://<adresse du site>/**` dans *Redirect URLs*.
4. **E-mails aux clients (confirmation, mot de passe oublié)** : le service d'e-mails fourni par Supabase n'écrit
   qu'aux membres de votre équipe Supabase. Pour écrire à vos clients, créez un compte gratuit
   [Brevo](https://www.brevo.com) (environ 300 e-mails par jour), authentifiez votre nom de domaine (*Senders, Domains &
   Dedicated IPs*), puis dans *Supabase → Authentication → Emails → SMTP Settings* : hôte `smtp-relay.brevo.com`, port
   `587`, identifiant et mot de passe SMTP donnés par Brevo (*SMTP & API*), adresse d'envoi sur votre domaine.
5. **Modèles d'e-mails en français** (*Authentication → Emails → Templates*) : collez
   `supabase/templates/confirmation.html` dans *Confirm signup* (sujet : « Confirmez votre adresse e-mail ») et
   `supabase/templates/mot-de-passe.html` dans *Reset password* (sujet : « Votre nouveau mot de passe »). Ces liens
   marchent même si le client ouvre l'e-mail sur un autre appareil.
6. **Alertes à l'équipe** : dans Netlify, variables `BREVO_API_KEY` (clé API Brevo, *SMTP & API → API keys*),
   `EMAIL_EXPEDITEUR` (adresse d'envoi vérifiée dans Brevo) et `EMAIL_ALERTES` (vos adresses), puis redéployez.

## Technologies

- [Next.js 16](https://nextjs.org) (App Router), TypeScript, Tailwind CSS 4
- [Supabase](https://supabase.com) : base Postgres, authentification, sécurité par lignes (RLS)
- Géocodage : [service de géocodage de l'IGN](https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage).
  Il a pris le relais de `api-adresse.data.gouv.fr`, avec le même format, et il est gratuit. Le module est isolé
  dans `src/lib/geocodage/`.
- Cartes : Leaflet + OpenStreetMap
- Identité Frais et Français : logo `public/logo.svg` (icônes de l'application tirées du logo), couleurs dans
  `src/app/globals.css` (aubergine pour la marque, vert feuille pour ce qui est fait, pêche pour ce qui est offert),
  polices Alfa Slab One (titres) et Nunito (texte), servies par le site lui-même : aucun appel à Google Fonts

---

## Mise en route

### 1. Créer le projet Supabase (gratuit)

1. Créez un compte sur [supabase.com](https://supabase.com), puis un projet. Choisissez une région en Europe (par
   exemple *West EU (Paris)*) pour que les données de vos clients restent dans l'UE.
2. **Inscriptions** : sans espace client, fermez-les (*Authentication → Sign In / Providers*, désactivez *Allow new
   users to sign up*). Pour l'espace client, ouvrez-les : voir « Mise en service de l'espace client ».
3. **Créez les tables** : *SQL Editor → New query*, collez le contenu de chaque fichier de `supabase/migrations/`,
   dans l'ordre, puis cliquez sur *Run*.
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
| `npm run test:db` | La base : **RLS** (anonyme, compte sans profil, client, livreur, admin), parrainage sans boucle, règles des commandes, fidélité, commande en ligne (clôture, récompenses, cadeaux), inscriptions, suppression RGPD, données de démo | un serveur Postgres (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Parcours complets sur un téléphone simulé : équipe (clients, commandes, livraisons, tournée, fidélité, catalogue) et clients (inscription, confirmation, commande en ligne, validation, alertes e-mail, suppression du compte) | Postgres (`TEST_DATABASE_URL`) + Chromium |

`TEST_DATABASE_URL` désigne un serveur Postgres (version 15 ou plus) où les tests créent puis suppriment des bases
jetables. Exemple avec Supabase local : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Les tests de bout en bout font tourner l'application contre une **imitation minimale de Supabase**
(`tests/e2e/faux-supabase.ts`) branchée sur une vraie base Postgres avec les données de démo. Ils n'ont besoin ni de
Docker ni d'un projet en ligne. Chaque requête y est exécutée avec l'identité de son jeton : la RLS s'applique comme en
vrai. Elle imite aussi OpenRouteService et Brevo.

Avant le premier `npm run test:e2e`, installez le navigateur de test : `npx playwright install chromium`.

Autres vérifications : `npm run lint`, `npm run typecheck`, `npm run build`.

---

## Sécurité et RGPD

- **RLS activée sur toutes les tables.** L'équipe (table `profils`) : l'admin lit et écrit, le livreur lit seulement.
  Un **client** ne lit que ses propres données (fiche, commandes, tampons) et n'écrit que par des fonctions qui
  vérifient tout (clôture, compte actif, règles des récompenses). Un compte ni équipe ni client ne voit que le
  catalogue actif et la composition des paniers. Le rôle anonyme n'a aucun droit.
- Chaque action côté serveur revérifie que l'utilisateur est administrateur avant de toucher aux données.
- La clé secrète n'est utilisée que par le script `creer-admin`, jamais par l'application.
- **Droit à l'effacement** : *Fiche client → Supprimer le client et ses données…* supprime la fiche, les commandes et
  leurs lignes. Les filleuls restent clients, sans parrain. Le client peut aussi supprimer lui-même son compte et
  toutes ses données depuis *Compte*.
- Données hébergées dans la région Supabase choisie (UE recommandée).

## Organisation du code

```
supabase/
  migrations/      schéma SQL versionné (tables, règles, RLS)
  seed.sql         données de démonstration (Var)
src/
  app/
    connexion/     connexion par e-mail + mot de passe (équipe et clients)
    inscription/, mot-de-passe-oublie/, nouveau-mot-de-passe/, auth/confirmer/
    (app)/         écrans de l'équipe : livraisons, clients, commandes, reglages
    (terrain)/     tournée (admin et livreurs)
    espace/        espace client : accueil, commander, fidélité, commandes, compte
    api/           recherche d'adresses, itinéraires (passent par le serveur)
  components/      boutons, champs, carte, recherche d'adresse, compteur +/−
  lib/
    domaine/       règles métier pures (testées) : dates, prix, téléphones…
    geocodage/     géocodeur interchangeable (interface + implémentation IGN)
    tournees/      optimisation et itinéraires (OpenRouteService), file hors connexion
    emails/        alertes e-mail (Brevo), isolées
    espace-client.ts  lectures de l'espace client
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

> Les migrations ont été appliquées à la main dans l'éditeur SQL du projet. Si vous utilisez un jour la CLI
> (`supabase db push`), marquez-les d'abord comme appliquées :
> `npx supabase migration repair --status applied 20261106000000 20261107000000 20261107120000 20261108000000 20261109000000`.

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
