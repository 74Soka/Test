-- =============================================================================
-- Données de démonstration : 3 secteurs du Var, 20 clients fictifs, catalogue
-- (paniers et suppléments de « Frais et Français »),
-- parrainages et commandes sur trois week-ends (le précédent, l'actuel, le suivant).
-- Les personnes et les numéros de rue sont fictifs ; les positions sont
-- approximatives (centre des communes).
-- Les dates sont calculées à partir du jour où ce script est exécuté.
-- =============================================================================

do $$
declare
  -- Samedi du week-end « en cours » (aujourd'hui si on est samedi, sinon le prochain ;
  -- le dimanche, on reste sur le week-end du jour)
  v_samedi date := case extract(isodow from current_date)::int
                     when 7 then current_date - 1
                     else current_date + (6 - extract(isodow from current_date)::int)
                   end;
  v_ferme_adresse constant text := 'Ferme de démonstration, 83260 La Crau';
  v_ferme_lat constant double precision := 43.1497;
  v_ferme_lng constant double precision := 6.0745;

  s_ouest uuid; s_est uuid; s_centre uuid;
  a_p30 uuid; a_p50 uuid; a_oeufs uuid; a_confiture uuid;
  c uuid[] := '{}';
  v_id uuid;
  v_semaine int;
  v_samedi_semaine date;
  i int;
begin
  ---------------------------------------------------------------------------
  -- Secteurs
  ---------------------------------------------------------------------------
  insert into public.secteurs (nom, jour, creneau, depart_adresse, depart_lat, depart_lng, couleur)
  values ('Toulon Ouest', 6, 'matin', v_ferme_adresse, v_ferme_lat, v_ferme_lng, '#2563eb')
  returning id into s_ouest;

  insert into public.secteurs (nom, jour, creneau, depart_adresse, depart_lat, depart_lng, couleur)
  values ('Toulon Est – Hyères', 6, 'apres_midi', v_ferme_adresse, v_ferme_lat, v_ferme_lng, '#dc2626')
  returning id into s_est;

  insert into public.secteurs (nom, jour, creneau, depart_adresse, depart_lat, depart_lng, couleur)
  values ('Centre Var', 7, 'matin', v_ferme_adresse, v_ferme_lat, v_ferme_lng, '#9333ea')
  returning id into s_centre;

  insert into public.secteur_communes (secteur_id, code_insee, nom) values
    (s_ouest, '83137', 'Toulon'),
    (s_ouest, '83126', 'La Seyne-sur-Mer'),
    (s_ouest, '83129', 'Six-Fours-les-Plages'),
    (s_ouest, '83123', 'Sanary-sur-Mer'),
    (s_ouest, '83090', 'Ollioules'),
    (s_est, '83144', 'La Valette-du-Var'),
    (s_est, '83062', 'La Garde'),
    (s_est, '83098', 'Le Pradet'),
    (s_est, '83034', 'Carqueiranne'),
    (s_est, '83069', 'Hyères'),
    (s_est, '83047', 'La Crau'),
    (s_centre, '83023', 'Brignoles'),
    (s_centre, '83143', 'Le Val'),
    (s_centre, '83140', 'Tourves'),
    (s_centre, '83116', 'Saint-Maximin-la-Sainte-Baume');

  ---------------------------------------------------------------------------
  -- Catalogue
  ---------------------------------------------------------------------------
  insert into public.articles (nom, categorie, prix_centimes, ordre) values ('Panier 30 €', 'panier', 3000, 1) returning id into a_p30;
  insert into public.articles (nom, categorie, prix_centimes, ordre) values ('Panier 50 €', 'panier', 5000, 2) returning id into a_p50;
  insert into public.articles (nom, categorie, prix_centimes, ordre) values
    ('Haricots verts BIO (500 g)', 'supplement', 500, 10),
    ('Kakis BIO (1 barquette)', 'supplement', 500, 11),
    ('Oranges BIO (1 kg)', 'supplement', 500, 12),
    ('Patates douces BIO (1 kg)', 'supplement', 500, 13),
    ('Pommes de terre grenaille BIO (1 kg)', 'supplement', 500, 14),
    ('Confiture artisanale – framboise', 'supplement', 800, 30),
    ('Confiture artisanale – fraise', 'supplement', 800, 31);
  insert into public.articles (nom, categorie, prix_centimes, ordre) values ('Œufs BIO (6)', 'supplement', 300, 20) returning id into a_oeufs;
  insert into public.articles (nom, categorie, prix_centimes, ordre) values ('Confiture artisanale – figue', 'supplement', 800, 32) returning id into a_confiture;

  ---------------------------------------------------------------------------
  -- Clients (fictifs)
  ---------------------------------------------------------------------------
  with nouveaux as (
    insert into public.clients
      (nom, prenom, telephone, email, adresse, code_postal, commune, code_insee, lat, lng, source_position, secteur_id, notes_livraison, date_inscription)
    values
      ('Martin',   'Claire',   '+33610000001', 'claire.martin@example.org',  '12 Rue Démo',         '83000', 'Toulon',               '83137', 43.1251, 5.9301, 'adresse', s_ouest,  'Code portail 1234',                current_date - 400),
      ('Bernard',  'Lucas',    '+33610000002', null,                          '5 Avenue Démo',       '83100', 'Toulon',               '83137', 43.1205, 5.9452, 'adresse', s_ouest,  null,                               current_date - 380),
      ('Dubois',   'Emma',     '+33610000003', 'emma.dubois@example.org',    '8 Chemin Démo',       '83500', 'La Seyne-sur-Mer',     '83126', 43.1012, 5.8800, 'adresse', s_ouest,  'Sonner deux fois',                 current_date - 350),
      ('Thomas',   'Hugo',     '+33610000004', null,                          '21 Boulevard Démo',   '83140', 'Six-Fours-les-Plages', '83129', 43.0941, 5.8403, 'adresse', s_ouest,  null,                               current_date - 300),
      ('Robert',   'Léa',      '+33610000005', 'lea.robert@example.org',     '3 Impasse Démo',      '83110', 'Sanary-sur-Mer',       '83123', 43.1195, 5.8020, 'adresse', s_ouest,  'Laisser devant le garage si absent', current_date - 280),
      ('Richard',  'Nathan',   '+33610000006', null,                          '14 Rue Démo',         '83190', 'Ollioules',            '83090', 43.1399, 5.8480, 'manuelle', s_ouest, 'Maison au bout du chemin de terre', current_date - 250),
      ('Petit',    'Chloé',    '+33610000007', 'chloe.petit@example.org',    '9 Allée Démo',        '83200', 'Toulon',               '83137', 43.1288, 5.9105, 'adresse', s_ouest,  null,                               current_date - 200),
      ('Durand',   'Louis',    '+33610000008', null,                          '30 Avenue Démo',      '83160', 'La Valette-du-Var',    '83144', 43.1380, 5.9840, 'adresse', s_est,    'Interphone « Durand »',            current_date - 390),
      ('Leroy',    'Manon',    '+33610000009', 'manon.leroy@example.org',    '2 Rue Démo',          '83130', 'La Garde',             '83062', 43.1250, 6.0110, 'adresse', s_est,    null,                               current_date - 360),
      ('Moreau',   'Jules',    '+33610000010', null,                          '17 Chemin Démo',      '83220', 'Le Pradet',            '83098', 43.1060, 6.0240, 'adresse', s_est,    'Chien gentil',                     current_date - 330),
      ('Simon',    'Camille',  '+33610000011', 'camille.simon@example.org',  '6 Place Démo',        '83320', 'Carqueiranne',         '83034', 43.0950, 6.0745, 'adresse', s_est,    null,                               current_date - 310),
      ('Laurent',  'Gabriel',  '+33610000012', null,                          '45 Avenue Démo',      '83400', 'Hyères',               '83069', 43.1210, 6.1290, 'adresse', s_est,    'Livrer à la boutique au rez-de-chaussée', current_date - 260),
      ('Lefebvre', 'Inès',     '+33610000013', 'ines.lefebvre@example.org',  '11 Rue Démo',         '83400', 'Hyères',               '83069', 43.1178, 6.1352, 'adresse', s_est,    null,                               current_date - 150),
      ('Michel',   'Raphaël',  '+33610000014', null,                          '7 Chemin Démo',       '83260', 'La Crau',              '83047', 43.1502, 6.0751, 'adresse', s_est,    null,                               current_date - 120),
      ('Garcia',   'Jade',     '+33610000015', 'jade.garcia@example.org',    '19 Rue Démo',         '83170', 'Brignoles',            '83023', 43.4061, 6.0620, 'adresse', s_centre, 'Code 4589B',                       current_date - 340),
      ('David',    'Arthur',   '+33610000016', null,                          '4 Route Démo',        '83143', 'Le Val',               '83143', 43.4392, 6.0735, 'manuelle', s_centre, 'Mas avec volets bleus',           current_date - 290),
      ('Bertrand', 'Louise',   '+33610000017', 'louise.bertrand@example.org', '25 Avenue Démo',     '83170', 'Tourves',              '83140', 43.4090, 5.9245, 'adresse', s_centre, null,                               current_date - 240),
      ('Roux',     'Adam',     '+33610000018', null,                          '10 Boulevard Démo',   '83470', 'Saint-Maximin-la-Sainte-Baume', '83116', 43.4530, 5.8620, 'adresse', s_centre, null,                     current_date - 180),
      ('Vincent',  'Alice',    '+33610000019', 'alice.vincent@example.org',  '15 Rue Démo',         '83170', 'Brignoles',            '83023', 43.4049, 6.0590, 'adresse', s_centre, null,                               current_date - 90),
      ('Fournier', 'Paul',     null,           null,                          '1 Impasse Démo',      '83000', 'Toulon',               '83137', 43.1230, 5.9260, 'adresse', s_ouest,  'Ne commande plus depuis l''été',   current_date - 500)
    returning id, telephone
  )
  select array_agg(id order by coalesce(telephone, '+33619999999')) into c from nouveaux;

  -- Le dernier client (sans téléphone) est inactif
  update public.clients set actif = false where id = c[20];

  -- Parrainages : Claire (1) a parrainé Chloé (7) et Lucas (2) ;
  -- Louis (8) a parrainé Inès (13) et Raphaël (14) ; Jade (15) a parrainé Alice (19).
  update public.clients set parrain_id = c[1]  where id in (c[7], c[2]);
  update public.clients set parrain_id = c[8]  where id in (c[13], c[14]);
  update public.clients set parrain_id = c[15] where id = c[19];

  ---------------------------------------------------------------------------
  -- Commandes : semaine -1 (livrées), semaine 0 et semaine +1 (à livrer)
  ---------------------------------------------------------------------------
  for v_semaine in -1..1 loop
    v_samedi_semaine := v_samedi + 7 * v_semaine;

    for i in 1..19 loop
      -- Environ 3 clients sur 4 commandent chaque semaine
      continue when (i + v_semaine + 3) % 4 = 0;

      insert into public.commandes (client_id, date_livraison, statut, livree_le)
      select c[i],
             case when cl.secteur_id = s_centre then v_samedi_semaine + 1 else v_samedi_semaine end,
             case when v_semaine < 0 then 'livree'::public.statut_commande else 'a_livrer' end,
             case when v_semaine < 0 then (v_samedi_semaine + time '10:30')::timestamptz end
      from public.clients cl where cl.id = c[i]
      returning id into v_id;

      insert into public.lignes_commande (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes)
      select v_id, a.id, a.nom, a.categorie, q.quantite, a.prix_centimes
      from (values
              (case when i % 3 = 0 then a_p50 else a_p30 end, case when i % 5 = 0 then 2 else 1 end),
              (case when i % 4 = 1 then a_oeufs end, 1),
              (case when i % 6 = 2 then a_confiture end, 1)
           ) as q(article_id, quantite)
      join public.articles a on a.id = q.article_id;
    end loop;
  end loop;
end;
$$;
