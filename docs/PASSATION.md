# Passation du projet Frais et Français

État au **9 novembre 2026**. Ce document résume ce que l'assistant précédent savait : à lire avant de reprendre le
travail, avec le `README.md` (fonctionnalités, mise en route, mise en service) et `CLAUDE.md` (règles).

## 1. En ligne

| Élément | Où |
|---|---|
| Code | GitHub `74Soka/Test`, branche **`claude/basket-orders-app-91823x`** (c'est elle que Netlify publie) |
| Site | https://sensational-moxie-3b258f.netlify.app (Netlify, offre gratuite, badge « Powered by Netlify ») |
| Base | Supabase, projet `yrmscxuyehhwvimqfpwr` (région UE), clé publique dans les variables Netlify |
| Variables Netlify | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ; facultatives : `ORS_API_KEY`, `BREVO_API_KEY`, `EMAIL_EXPEDITEUR`, `EMAIL_ALERTES`, `SITE_URL` |

Aucun secret n'est dans le dépôt. Le propriétaire a un compte administrateur (e-mail + mot de passe) dans
l'application.

## 2. ⚠️ À faire en premier

1. **Migration en attente** : `supabase/migrations/20261109120000_avis_annonces_rappels.sql` (merci après livraison,
   avis, annonce des paniers, rappels du jeudi) n'a **pas encore été confirmée** comme collée dans Supabase. Le
   dernier commit porte `[skip netlify]` : le site en ligne n'a donc pas encore ce code. Demander au propriétaire de
   la coller (*SQL Editor → Run*) ; elle active aussi `pg_cron` et `pg_net`. Ensuite, pousser un commit sans
   `[skip netlify]` pour déployer, puis lui faire ouvrir l'application une fois en admin (l'adresse du site est
   notée pour les rappels).
2. Les migrations 20261106 à 20261109000000 sont appliquées en production.

## 3. Comment on travaille avec le propriétaire

- Il n'a **pas d'ordinateur** : tout se fait depuis son téléphone (Supabase, Netlify, GitHub, OVH dans le navigateur).
- Migrations : il colle lui-même le SQL. Le serveur MCP Supabase de l'assistant était souvent injoignable
  (`ERR_PROXY_TUNNEL`), et le réseau de l'environnement bloque `*.supabase.co`, Instagram, `api.heigit.org` : on ne
  peut pas vérifier la base depuis l'environnement, on lui demande de vérifier à l'écran.
- Il valide phase par phase (« Go », « C'est fait »). Il aime voir des captures d'écran du rendu.

## 4. Fonctionnel (résumé)

- **Équipe** (`/livraisons`, `/clients`, `/commandes`, `/reglages`, `/tournee`) : clients (géocodage IGN, secteur
  déduit de la commune, parrain, RGPD), catalogue (paniers 30 € / 50 € + suppléments de saison), commandes (au moins
  un panier, une par semaine), livraisons par secteur, tournées.
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
  la composition, rappels du jeudi 12 h et 19 h (`pg_cron` → `/api/rappels` avec un jeton secret en base). Sur
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
- [ ] **Compte livreur** : le propriétaire doit donner l'e-mail ; il crée l'utilisateur dans Supabase Auth, puis on
      ajoute `insert into profils (id, role) values ('<uuid>', 'livreur')`.
- [ ] **Vraie liste de clients** à importer à la place des clients de démo (garder catalogue et réglages).
- [ ] **Nom de domaine OVH** (en cours d'achat) : DNS vers Netlify, `SITE_URL`, *Site URL* et *Redirect URLs* dans
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
