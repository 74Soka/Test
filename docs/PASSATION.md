# Passation du projet Frais et Français

État au **9 novembre 2026**. Ce document résume ce que l'assistant précédent savait : à lire avant de reprendre le
travail, avec le `README.md` (fonctionnalités, mise en route, mise en service) et `CLAUDE.md` (règles).

## 1. En ligne

| Élément | Où |
|---|---|
| Code | GitHub `74Soka/Test`, branche **`claude/basket-orders-app-91823x`** (c'est elle que Netlify publie) |
| Site | https://sensational-moxie-3b258f.netlify.app (Netlify, offre gratuite, badge « Powered by Netlify ») |
| Base | Supabase, projet `yrmscxuyehhwvimqfpwr` (région UE), clé publique dans les variables Netlify |
| Variables Netlify | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ; facultatives : `ORS_API_KEY`, `BREVO_API_KEY`, `EMAIL_EXPEDITEUR`, `EMAIL_ALERTES`, `SITE_URL`, `VAPID_CLE_PUBLIQUE`, `VAPID_CLE_PRIVEE` (clés des notifications, prioritaires sur la base) |

Aucun secret n'est dans le dépôt. Le propriétaire a un compte administrateur (e-mail + mot de passe) dans
l'application.

## 2. ⚠️ À faire en premier

0. **Mis en ligne le 9 novembre 2026** (branche publiée `claude/basket-orders-app-91823x` mise à jour) : migrations
   jusqu'à `20261110120000` collées par le propriétaire (vérifié à l'écran, sauf `20261110000000` qu'il a recollée
   juste avant la mise en ligne), 3 vrais secteurs, clients importés, compte admin julian8312@hotmail.fr. Domaine
   `fraisetfrancais.fr` branché chez OVH (A → 75.2.60.5, www → CNAME Netlify) ; offre Netlify conseillée : Personal.
1. ~~Migration en attente~~ (fait) : `supabase/migrations/20261109120000_avis_annonces_rappels.sql` (merci après livraison,
   avis, annonce des paniers, rappels du jeudi) n'a **pas encore été confirmée** comme collée dans Supabase. Le
   dernier commit porte `[skip netlify]` : le site en ligne n'a donc pas encore ce code. Demander au propriétaire de
   la coller (*SQL Editor → Run*) ; elle active aussi `pg_cron` et `pg_net`. Ensuite, pousser un commit sans
   `[skip netlify]` pour déployer, puis lui faire ouvrir l'application une fois en admin (l'adresse du site est
   notée pour les rappels).
2. Les migrations 20261106 à 20261109000000 sont appliquées en production.
3. **Migration en attente** : `20261110000000_secteur_ponctuel.sql` (secteur choisi pour une seule commande,
   `commandes.secteur_id` ; la date suit le jour de ce secteur dans la même semaine). À coller après la précédente.
4. **Import des vrais clients** (fichier « Livraisons 2026.xlsx », 107 clients ayant commandé en 2026) et des 3 vrais
   secteurs : SQL préparé hors dépôt (données personnelles) et envoyé au propriétaire ; à confirmer. Secteurs :
   1 = samedi matin (Toulon 83000, La Garde, La Farlède, Solliès, Le Pradet, La Crau, Carqueiranne, Cuers,
   Pierrefeu, Puget-Ville, Hyères), 2 = samedi après-midi (Toulon 83100/83200, Le Revest, La Valette),
   3 = dimanche matin (Sanary, Six-Fours, La Londe, Ollioules, Saint-Mandrier, La Seyne). Toulon est dans les secteurs
   1 et 2 (le code postal tranche à l'import ; dans l'application, on choisit). Départ des tournées :
   337 route de la Farlède, 83130 La Garde (à saisir dans Réglages, le géocodage étant bloqué ici). Les clients
   importés n'ont pas encore de position : prévoir un bouton « Placer les clients sur la carte ».
5. **Migration en attente** : `20261110120000_page_paniers.sql`, fonction `paniers_publics()` ouverte sans compte
   (informations publiques seulement) pour la page `/paniers`, lien des campagnes SMS. Numéro et Instagram dans
   `src/lib/paniers-publics.ts`. La recette de la semaine de l'ancienne page (artefact « Panier Frais et Français »)
   n'est pas reprise : pas encore de champ « recette » dans l'application.
6. ~~Migration en attente~~ (appliquée, vérifiée par le connecteur Supabase) : `20261111000000_recette_semaine.sql` (table `recettes`, saisie dans Réglages →
   Composition, affichée sur `/paniers` ; remplace `prive.paniers_publics()`). Commit `[skip netlify]` : ne pas
   publier avant que le propriétaire l'ait collée. Ingrédients « dans le panier / en supplément » repérés par mots
   communs (`src/lib/domaine/recettes.ts`). Données d'essai de la semaine dernière : `tests/fixtures/semaine-derniere.ts`.

7. **Réveil du site** (`20261112000000_reveil_site.sql`, appliquée par le connecteur Supabase) : tâche pg_cron
   `reveil-site`, toutes les 5 min de 7 h à 21 h (Paris) → `GET /api/reveil`. Mesures Netlify du 9 novembre :
   médiane 0,2 à 0,3 s, pointes de 3 à 9 s = démarrages à froid. Région des fonctions (Francfort) : offre Pro
   seulement, non retenue. Arrêt : `select cron.unschedule('reveil-site');`

8. **Alertes aux administrateurs** (`20261113000000_alertes_equipe.sql`, appliquée par le connecteur) : chaque
   administrateur active « 🔔 Alertes sur ce téléphone » dans Réglages ; inscription à valider et commande
   passée / modifiée / annulée en ligne → `demander_alerte_equipe` (vérifie que c'est bien la sienne, anti-doublon
   2 min) → `pg_net` → `POST /api/alertes` (jeton) → push aux téléphones des admins. S'ajoute aux e-mails Brevo.

9. **Notification libre aux clients** (`20261114000000_messages_clients.sql`, appliquée) : Réglages → « 📣
   Notification aux clients » (titre 60, message 200, page ouverte au toucher), envoi immédiat à tous les clients
   actifs abonnés, historique dans `messages_clients`, double envoi refusé pendant 2 min.

10. **Codes de parrainage** (`20261115000000_codes_parrainage.sql`, appliquée) : `clients.code_parrainage` =
    2 lettres du prénom + 2 du nom + 4 derniers chiffres du téléphone (EVCA9616, affiché « EVCA 9616 »), calculé par
    déclencheur, suffixe chiffré en cas de doublon, rien sans téléphone (TCT, Melting Box). Le filleul le tape dans
    /espace/bienvenue (vérifié en direct, « ✓ Code valide » / « Code invalide, veuillez réessayer. ») ; à la
    validation, le parrain est retrouvé et présélectionné. Le client voit et partage son code dans Fidélité.

11. **Paiement à la livraison** (`20261116000000_paiements.sql`, appliquée) : boutons « Livré et payé » / « Livré »
    (tournée, file hors connexion, page commande). Journal `mouvements_compte` (+ dû, − réglé/avoir), vue
    `soldes_clients` ; déclencheur sur `commandes.statut/payee` : livraison = +total, payé = règle tout le solde ;
    annuler la livraison retire ses mouvements. La tournée affiche « À encaisser » avec le dû antérieur. Fiche client :
    carte « Compte » (paiement reçu, somme due, avoir). Espace client : « Reste à régler ».
12. **« Comment nous avez-vous connu ? »** (`20261117000000_connu_par.sql`, appliquée) : liste facultative sous le
    code de parrainage, `inscriptions.connu_par`, affichée à la validation et dans l'e-mail d'alerte.

13. **Historique des paniers** (administrateur seulement) : Réglages → Historique des paniers (`/reglages/historique`),
    semaine en cours ouverte puis semaines passées, numéro de semaine ISO (`numeroSemaine`), paniers et recette ;
    semaines à venir à part. **Chaque semaine**, le propriétaire envoie les paniers dans la conversation : l'assistant
    enregistre la composition (`compositions`, lundi de la semaine) et rédige la recette (`recettes`) à partir du
    panier, par le connecteur Supabase, puis vérifie `/paniers`.

14. **Semaine montrée aux clients** (`20261118000000_paniers_semaine_ouverte.sql`, appliquée) : `/paniers` change de
    semaine à la clôture des commandes (comme l'espace client), plus le samedi. Les semaines passées restent en base
    (historique) et ne sont jamais montrées ; une semaine non saisie affiche « La composition sera bientôt publiée ».

15. **Règle définitive (demande du propriétaire)** (`20261119000000_paniers_jusqu_au_dimanche.sql`, appliquée) :
    `/paniers` montre le panier de la semaine **jusqu'au dimanche 23 h** (Paris), puis la semaine suivante dès
    qu'elle est saisie. Après la clôture (vendredi 12 h), bandeau « Les commandes de cette semaine sont closes »
    (`semaine_close`). L'espace client, lui, suit la semaine qu'on peut commander.

## 3. Comment on travaille avec le propriétaire

- Il n'a **pas d'ordinateur** : tout se fait depuis son téléphone (Supabase, Netlify, GitHub, OVH dans le navigateur).
- **Connecteur Supabase (claude.ai)** disponible depuis le 9 novembre 2026 : outils `mcp__Supabase__*` sur le projet
  `yrmscxuyehhwvimqfpwr` (lecture et écriture directes). Chaque semaine, le propriétaire envoie les paniers et
  suppléments : l'assistant enregistre composition, recette et catalogue lui-même (choix « solution 2 »).
- Migrations : il colle lui-même le SQL. Le serveur MCP Supabase de l'assistant était souvent injoignable
  (`ERR_PROXY_TUNNEL`), et le réseau de l'environnement bloque `*.supabase.co`, Instagram, `api.heigit.org` : on ne
  peut pas vérifier la base depuis l'environnement, on lui demande de vérifier à l'écran.
- Il valide phase par phase (« Go », « C'est fait »). Il aime voir des captures d'écran du rendu.

## 4. Fonctionnel (résumé)

- **Équipe** (`/livraisons`, `/clients`, `/commandes`, `/reglages`, `/tournee`) : clients (géocodage IGN, secteur
  déduit de la commune, parrain, RGPD), catalogue (paniers 30 € / 50 € + suppléments de saison), commandes (au moins
  un panier ou 30 € de suppléments, une par semaine), livraisons par secteur, tournées.
- **Tournées** : ordre optimal exact jusqu'à 15 arrêts (Held-Karp) sur les temps de route OpenRouteService (matrice,
  `api.heigit.org`), au-delà heuristique ; tracé routier ; « Livré » hors connexion (file d'attente locale) ; Waze /
  Google Maps ; bouton « Démarrer la tournée ».
- **Fidélité** (règles en base, modifiables) : +1 tampon à la création, +1 au parrain par filleul, +1 par Panier 30 €
  et +2 par Panier 50 € livrés, +1 au parrain à chaque commande livrée d'un filleul. Récompenses : 5 = supplément,
  10 = confiture + supplément, VIP (5 filleuls) 20 = Panier 30 €, Ultra (10 filleuls) 30 = Panier 50 €. Tampons
  déduits à l'usage. Cadeaux de parrainage (à partir du 1er janvier 2027) : œufs BIO au filleul et confiture au
  parrain à la première commande du filleul.
- **Espace client** (`/espace`) : inscription e-mail + mot de passe ; un compte dont l'e-mail confirmé correspond à
  une fiche y est relié tout seul, sinon inscription validée par l'admin. Composition des paniers par semaine,
  commande en ligne jusqu'à la **clôture (vendredi 12 h** par défaut, réglable), récompenses (article imposé ou N
  suppléments au choix, `recompenses.nb_offerts`), fidélité, historique, compte, suppression RGPD.
- **Notifications web** (Web Push, VAPID en base dans `prive.cles_push`, créées à la première visite de l'équipe) :
  départ de tournée avec heure estimée (+4 min par arrêt), « vous êtes le prochain », merci après livraison, annonce de
  la composition, rappels du jeudi 12 h et 18 h (`pg_cron` → `/api/rappels` avec un jeton secret en base). Sur
  iPhone : seulement si l'application est ajoutée à l'écran d'accueil (iOS 16.4+).
- **E-mails** (Brevo, facultatif) : alertes à l'équipe (commande, modification, annulation, inscription, avis).
  Modèles d'e-mails Supabase en français dans `supabase/templates/`.
- **Identité** : logo `public/logo.svg` (pêche + aubergine), aubergine `#35037a` / vert feuille / pêche, polices
  Alfa Slab One + Nunito (paquets `@fontsource`, sans Google Fonts).

## 5. Technique

- Next.js 16.4 (App Router, Turbopack, `src/proxy.ts`), React 19, Tailwind 4, zod 4, Supabase (`@supabase/ssr`),
  Leaflet, web-push 3.6.7, déployé sur Netlify (`@netlify/plugin-nextjs`).
- Dossiers clés : `src/app/(app)` (équipe), `src/app/(terrain)` (tournée, admin + livreurs), `src/app/espace`
  (clients), `src/lib/domaine` (règles pures testées), `src/lib/tournees`, `src/lib/notifications`,
  `src/lib/emails`, `src/lib/geocodage`.
- Rôles : table `profils` (`admin`, `livreur`) ; un client n'a pas de profil mais une ligne `comptes_clients`.
- Sécurité : RLS partout, fonctions `prive.*` SECURITY DEFINER + enveloppes `public.*` INVOKER. Seules trois
  fonctions sont ouvertes sans compte (rappels), protégées par le jeton de `prive.parametres_robot`.

## 6. Tests

- `npm test` (unitaires), `tests/db` (base : RLS, règles, sécurité), `tests/e2e` (Playwright, Pixel 7).
- Base de test : un Postgres 16 local sur le port 54329, par exemple
  `TEST_DATABASE_URL=postgresql://postgres@localhost:54329/postgres`. Les tests créent et suppriment leurs bases.
- Les parcours de bout en bout tournent contre `tests/e2e/faux-supabase.ts` : imitation de l'API Supabase sur un
  vrai Postgres (RLS appliquée selon le jeton), plus faux OpenRouteService, Brevo et service de push.
- Pièges connus : en développement, le bouton des outils Next recouvre l'onglet en bas à gauche (naviguer par URL) ;
  Chromium sans écran refuse les notifications (les tests simulent l'autorisation et le service de push).
- Dernier état : 277 tests unitaires et de base, 21 parcours, tous verts.

## 7. Ce qui reste (demandé ou prévu)

- [ ] Faire coller la migration `20261109120000` puis déployer (voir § 2).
- [x] **Premier compte livreur** créé le 10 novembre 2026 (rôle `livreur` dans `profils`). Procédure : le
      propriétaire crée l'utilisateur dans Supabase Auth, l'assistant ajoute la ligne `profils`.
- [x] **Droits des livreurs resserrés** (`20261120000000_droits_livreurs.sql`, appliquée) : lecture limitée aux
      commandes de la veille aux 7 jours à venir (tous secteurs), leurs lignes, cadeaux, clients et comptes ; plus rien
      de la fidélité, des avis, recettes, rappels, annonces. Envoi à tous les clients : admin seul.
- [x] **Clé privée des notifications hors de la base** (10 novembre 2026) : `VAPID_CLE_PUBLIQUE` / `VAPID_CLE_PRIVEE`
      dans Netlify (mêmes valeurs qu'avant), `20261121000000_cle_privee_hors_base.sql` appliquée, clé privée effacée
      de `prive.cles_push`. `VAPID_CLE_PRIVEE` n'était pas marquée secrète dans Netlify : la cocher « secret ».
- [x] **E-mails de commande** : le client reçoit « Votre commande est confirmée / modifiée / annulée » (détail, total,
      clôture, lien vers son espace) ; l'équipe ne reçoit plus d'e-mail de commande (notifications seulement). Les
      e-mails d'inscription et d'avis à l'équipe restent.
- [x] **Commande sans panier** (`20261122000000_commande_sans_panier.sql`) : possible avec au moins 30 € de
  suppléments achetés (les cadeaux ne comptent pas). Règle en base (`prive.minimum_sans_panier_centimes()`) et dans
  les deux formulaires (`manquePourCommander`, `src/lib/domaine/commandes.ts`). Même code d'erreur PN002.
- [x] **Mode sombre** sur tout le site (suit le réglage du téléphone) : tout est dans `src/app/globals.css`
  (bloc `prefers-color-scheme: dark` : gris inversés, nuances claires assombries, cartes blanches et textes de
  couleur foncés éclaircis ; boutons pleins inchangés). Captures clair/sombre à la demande :
  `CAPTURES_SOMBRE=<dossier> npx playwright test tests/e2e/espace-client.spec.ts tests/e2e/zz-captures-sombre.spec.ts`.
- [x] **E-mail « compte validé »** au client quand l'administrateur valide son inscription
  (`emailCompteValide`, envoyé par `validerInscription`).
- [x] **Invitation aux notifications** sur l'accueil de l'espace client, pour tous les clients tant que le
  téléphone n'est pas abonné (« Activez les notifications pour savoir quand le livreur arrive »), et une astuce
  dans l'e-mail de confirmation de commande.
- [x] **Supplément libre** (`20261123000000_supplement_libre.sql`, appliquée) : l'équipe ajoute sur une commande
  un supplément hors catalogue, nom et prix saisis (« + Ajouter un supplément libre »). Ligne de commande sans
  article (`article_id` vide ; clé primaire `id`, unicité (commande, article) pour le catalogue). Compte dans le
  total, le compte client et les 30 € ; pas de graines. Le client le voit sans pouvoir le modifier ; sa
  modification en ligne le garde (`p_libres` null). Erreur PN053.
- [x] **Secteur V** (vendredi après-midi, vert, créé le 13 novembre 2026, sans commune : clients rattachés un par
  un depuis leur fiche). **Réservé à l'équipe** (`secteurs.interne`, `20261125000000_secteurs_internes.sql`) : absent
  de la page publique, nom caché au client (seuls date et créneau). Case « Réservé à l'équipe » dans le formulaire
  d'un secteur. Clôture le jour même à 12 h (`20261124000000_cloture_meme_jour.sql` : une livraison le jour de la
  clôture se clôture ce jour-là, plus une semaine avant).
- [x] **Montant reçu et mode de paiement** à la livraison (`20261126000000_paiement_recu.sql`, appliquée) : sous
  chaque arrêt, « Montant reçu (€) » (proposé : ce qui est à encaisser) et « Paiement » (Espèces / Chèque). Le compte
  reçoit le montant réellement reçu ; la différence reste due ou devient un avoir. Sans montant (anciens appuis,
  « Marquer comme livrée »), payé = tout est réglé. Erreur PN054.
- [x] **« Mon solde »** dans l'espace client (onglet Compte) : « Vous devez X € » / « Frais et Français vous doit
  X € » / « À jour », et les 10 derniers mouvements.
- [x] **Inscription reliée à une fiche existante** (`20261127…` puis `20261128000000_inscription_met_a_jour_fiche.sql`,
  appliquées) : les informations de l'inscription remplacent celles de la fiche (nom, prénom, e-mail, téléphone,
  adresse et repère, consignes) ; ce que le client a laissé vide garde la valeur de la fiche. Nouvelle adresse
  sans repère : l'ancien repère est retiré. Secteur et parrain inchangés.
- [x] **Repère automatique** (`src/lib/geocodage/localiser.ts`) : une fiche sans repère est placée d'après son
  adresse (même code postal, même rue, précision rue ou numéro) à l'ouverture du formulaire et à l'enregistrement ;
  une fiche existante s'enregistre même sans repère (une nouvelle fiche le demande toujours). Bouton « Les placer
  automatiquement » dans Clients (par paquets de 25). Au 13 novembre 2026 : 104 fiches sur 111 sans repère.
- [x] **Solde dans le montant à régler** (`DetailARegler`, `aReglerALaLivraison`) : commande + dû, ou − avoir,
  précisé ligne par ligne, dans l'accueil et le formulaire de l'espace client, l'e-mail de confirmation et le
  formulaire de commande de l'équipe (la tournée le faisait déjà). Avoir plus grand que la commande : 0 € à régler,
  le reste pour la fois suivante.
- [x] **Récapitulatif des encaissements** (`src/lib/domaine/encaissements.ts`, `RecapEncaissements`) : espèces,
  chèques, avoirs déduits, reste dû, pas encore livré, encaissé en plus ; par secteur et tous secteurs. Page
  Livraisons (semaine ou jour, administrateur) et Tournée (le jour, livreur et administrateur). Vérification
  affichée : retombe sur le montant des commandes à préparer.
- [x] **Compléments à la livraison** (`20261129000000_complements_livreur.sql`, appliquée) : dans la tournée,
  « ➕ Compléments » sous chaque arrêt à livrer : liste des suppléments du catalogue (prix du catalogue), ajout et
  −/+ ; la commande et le montant à encaisser suivent. Fonction `modifier_complement` (livreur : commandes de ses
  tournées seulement ; commande « à livrer » seulement, sinon PN055).
- [ ] **Tests dépendants de l'heure** : le vendredi après la clôture (12 h), deux parcours échouent
  (`espace-client` « page publique… » et `notifications` « …prochain ») car les commandes passent à la semaine
  suivante. À rendre indépendants de l'heure (horloge simulée côté serveur).
- [x] **Commandes de l'équipe jusqu'au dimanche 12 h** : la base ne bloque pas l'équipe (seuls les clients
  s'arrêtent à la clôture du vendredi). La date proposée par défaut à l'équipe reste la semaine en cours jusqu'au
  dimanche 12 h, puis passe à la semaine suivante (`debutCommandesEquipe`, `src/lib/domaine/dates.ts`).
- [ ] **Vraie liste de clients** à importer à la place des clients de démo (garder catalogue et réglages).
- [ ] **Nom de domaine OVH** (en cours d'achat ; décision du 9 novembre 2026 : seul le domaine est chez OVH, le site
      reste sur Netlify, offre payante si besoin, pas de VPS) : DNS vers Netlify, `SITE_URL`, *Site URL* et *Redirect URLs* dans
      Supabase ; puis **Brevo** (domaine authentifié, SMTP dans Supabase, clé API dans Netlify) et ouverture des
      inscriptions (*Allow new users to sign up*). Pas à pas dans le README, « Mise en service de l'espace client ».
- [ ] **Mentions légales et politique de confidentialité** : à ajouter quand il donnera raison sociale, statut,
      SIRET, adresse.
- [ ] **Badge Netlify** : conseillé de passer à l'offre payante de Netlify (retirer le badge par du code serait
      contraire à leurs conditions).
- [ ] **Stores** : Google Play (TWA) puis App Store (Capacitor + compilation dans le nuage), une fois le badge retiré
      et le compte développeur créé (D-U-N-S si société).
- [ ] Clé **OpenRouteService** (`ORS_API_KEY`) à mettre dans Netlify si ce n'est pas fait (sinon tournées à vol
      d'oiseau).
- [ ] Sécurité Supabase : activer la protection contre les mots de passe divulgués si l'offre le permet.
