@AGENTS.md

# Frais et Français — consignes pour l'assistant

Application de commandes et de livraisons de paniers de fruits et légumes (Var) : clients, commandes, tournées,
fidélité, espace client, notifications. **Avant toute chose, lire `docs/PASSATION.md`** (état du projet, décisions,
tâches en cours) et le `README.md`.

## Le propriétaire

- Il travaille **depuis son téléphone, sans ordinateur**. Réponses en **français**, simples, sans jargon ; étapes
  courtes à faire dans Supabase, Netlify ou OVH depuis un navigateur mobile.
- Il valide chaque phase avant la suivante. Proposer, puis faire ; signaler honnêtement ce qui n'a pas pu être vérifié.

## Règles du projet

- Interface et code en **français** (noms de variables, fonctions, commentaires, messages de commit). Mobile d'abord :
  gros boutons, cibles de 48 px, textes lisibles dehors.
- **Aucun secret dans le dépôt** (`.env*` ignorés). L'application n'utilise que la clé publique Supabase et la session
  de l'utilisateur : jamais la clé secrète (seul `scripts/creer-admin.ts` l'emploie).
- **RLS sur toutes les tables.** Logique sensible dans le schéma `prive` (SECURITY DEFINER), exposée par de petites
  fonctions `public` SECURITY INVOKER. Révoquer `execute` à `public, anon` sur chaque nouvelle fonction, `anon` sur
  chaque nouvelle table. Erreurs métier : SQLSTATE `PNxxx` avec un message en français affichable tel quel.
- **Base** : ne jamais modifier une migration déjà appliquée ; ajouter un nouveau fichier `supabase/migrations/`.
  Le propriétaire colle lui-même le SQL dans *Supabase → SQL Editor*. Mettre à jour
  `src/lib/supabase/database.types.ts` (format du générateur Supabase ; à la main si le serveur MCP Supabase est
  injoignable).
- **Déploiement** : Netlify publie chaque commit de la branche. Tant qu'une migration n'est pas appliquée en
  production, terminer le message de commit par **`[skip netlify]`** ; une fois que le propriétaire confirme « C'est
  fait », pousser un commit sans ce marqueur pour déployer.
- Next.js 16 : lire les guides de `node_modules/next/dist/docs/` avant d'écrire du code (`proxy.ts`, `PageProps`
  générés par `next typegen`).

## Avant chaque envoi

```
npm run lint && npm run typecheck
TEST_DATABASE_URL=postgresql://postgres@localhost:54329/postgres npx vitest run   # unitaires + base
TEST_DATABASE_URL=… npx playwright test --trace off                              # parcours sur téléphone simulé
```

Les tests de la base et de bout en bout ont besoin d'un Postgres local (voir `docs/PASSATION.md`, « Tests »).
