// Types de la base, générés par Supabase à partir du projet.
// À régénérer après chaque migration :
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      abonnements_push: {
        Row: {
          appareil: string | null
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          appareil?: string | null
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          appareil?: string | null
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      annonces_composition: {
        Row: {
          envoyee_le: string
          semaine: string
        }
        Insert: {
          envoyee_le?: string
          semaine: string
        }
        Update: {
          envoyee_le?: string
          semaine?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          actif: boolean
          categorie: Database["public"]["Enums"]["categorie_article"]
          created_at: string
          id: string
          nom: string
          ordre: number
          prix_centimes: number
          tampons: number
          updated_at: string
        }
        Insert: {
          actif?: boolean
          categorie: Database["public"]["Enums"]["categorie_article"]
          created_at?: string
          id?: string
          nom: string
          ordre?: number
          prix_centimes: number
          tampons?: number
          updated_at?: string
        }
        Update: {
          actif?: boolean
          categorie?: Database["public"]["Enums"]["categorie_article"]
          created_at?: string
          id?: string
          nom?: string
          ordre?: number
          prix_centimes?: number
          tampons?: number
          updated_at?: string
        }
        Relationships: []
      }
      avis_livraison: {
        Row: {
          commande_id: string
          commentaire: string | null
          created_at: string
          note: number | null
          traite_le: string | null
          updated_at: string
        }
        Insert: {
          commande_id: string
          commentaire?: string | null
          created_at?: string
          note?: number | null
          traite_le?: string | null
          updated_at?: string
        }
        Update: {
          commande_id?: string
          commentaire?: string | null
          created_at?: string
          note?: number | null
          traite_le?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avis_livraison_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: true
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      cadeaux: {
        Row: {
          article_id: string
          categorie: Database["public"]["Enums"]["categorie_article"]
          libelle: string
          quantite: number
          utilisation_id: string
        }
        Insert: {
          article_id: string
          categorie: Database["public"]["Enums"]["categorie_article"]
          libelle: string
          quantite: number
          utilisation_id: string
        }
        Update: {
          article_id?: string
          categorie?: Database["public"]["Enums"]["categorie_article"]
          libelle?: string
          quantite?: number
          utilisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadeaux_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadeaux_utilisation_id_fkey"
            columns: ["utilisation_id"]
            isOneToOne: false
            referencedRelation: "recompenses_utilisees"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          actif: boolean
          adresse: string
          code_insee: string | null
          code_postal: string
          commune: string
          complement_adresse: string | null
          created_at: string
          date_inscription: string
          email: string | null
          id: string
          lat: number | null
          lng: number | null
          nom: string
          notes_livraison: string | null
          parrain_id: string | null
          prenom: string
          secteur_id: string
          source_position: Database["public"]["Enums"]["source_position"] | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse: string
          code_insee?: string | null
          code_postal: string
          commune: string
          complement_adresse?: string | null
          created_at?: string
          date_inscription?: string
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nom: string
          notes_livraison?: string | null
          parrain_id?: string | null
          prenom?: string
          secteur_id: string
          source_position?:
            | Database["public"]["Enums"]["source_position"]
            | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string
          code_insee?: string | null
          code_postal?: string
          commune?: string
          complement_adresse?: string | null
          created_at?: string
          date_inscription?: string
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nom?: string
          notes_livraison?: string | null
          parrain_id?: string | null
          prenom?: string
          secteur_id?: string
          source_position?:
            | Database["public"]["Enums"]["source_position"]
            | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_secteur_id_fkey"
            columns: ["secteur_id"]
            isOneToOne: false
            referencedRelation: "secteurs"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes: {
        Row: {
          ordre_tournee: number | null
          client_id: string
          created_at: string
          date_livraison: string
          id: string
          livree_le: string | null
          notes: string | null
          secteur_id: string | null
          semaine: string | null
          source: Database["public"]["Enums"]["source_commande"]
          statut: Database["public"]["Enums"]["statut_commande"]
          updated_at: string
        }
        Insert: {
          ordre_tournee?: number | null
          client_id: string
          created_at?: string
          date_livraison: string
          id?: string
          livree_le?: string | null
          notes?: string | null
          secteur_id?: string | null
          semaine?: string | null
          source?: Database["public"]["Enums"]["source_commande"]
          statut?: Database["public"]["Enums"]["statut_commande"]
          updated_at?: string
        }
        Update: {
          ordre_tournee?: number | null
          client_id?: string
          created_at?: string
          date_livraison?: string
          id?: string
          livree_le?: string | null
          notes?: string | null
          secteur_id?: string | null
          semaine?: string | null
          source?: Database["public"]["Enums"]["source_commande"]
          statut?: Database["public"]["Enums"]["statut_commande"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commandes_secteur_id_fkey"
            columns: ["secteur_id"]
            isOneToOne: false
            referencedRelation: "secteurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "commandes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      compositions: {
        Row: {
          article_id: string
          contenu: string
          semaine: string
          updated_at: string
        }
        Insert: {
          article_id: string
          contenu: string
          semaine: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          contenu?: string
          semaine?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compositions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      comptes_clients: {
        Row: {
          client_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comptes_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comptes_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "comptes_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      inscriptions: {
        Row: {
          adresse: string
          code_insee: string | null
          code_postal: string
          commune: string
          complement_adresse: string | null
          created_at: string
          email: string
          lat: number | null
          lng: number | null
          nom: string
          notes_livraison: string | null
          parrain: string | null
          prenom: string
          statut: Database["public"]["Enums"]["statut_inscription"]
          telephone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adresse: string
          code_insee?: string | null
          code_postal: string
          commune: string
          complement_adresse?: string | null
          created_at?: string
          email: string
          lat?: number | null
          lng?: number | null
          nom: string
          notes_livraison?: string | null
          parrain?: string | null
          prenom?: string
          statut?: Database["public"]["Enums"]["statut_inscription"]
          telephone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adresse?: string
          code_insee?: string | null
          code_postal?: string
          commune?: string
          complement_adresse?: string | null
          created_at?: string
          email?: string
          lat?: number | null
          lng?: number | null
          nom?: string
          notes_livraison?: string | null
          parrain?: string | null
          prenom?: string
          statut?: Database["public"]["Enums"]["statut_inscription"]
          telephone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lignes_commande: {
        Row: {
          article_id: string
          categorie: Database["public"]["Enums"]["categorie_article"]
          commande_id: string
          libelle: string
          prix_unitaire_centimes: number
          quantite: number
        }
        Insert: {
          article_id: string
          categorie: Database["public"]["Enums"]["categorie_article"]
          commande_id: string
          libelle: string
          prix_unitaire_centimes: number
          quantite: number
        }
        Update: {
          article_id?: string
          categorie?: Database["public"]["Enums"]["categorie_article"]
          commande_id?: string
          libelle?: string
          prix_unitaire_centimes?: number
          quantite?: number
        }
        Relationships: [
          {
            foreignKeyName: "lignes_commande_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lignes_commande_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_envoyees: {
        Row: {
          commande_id: string
          envoyee_le: string
          type: Database["public"]["Enums"]["type_notification"]
        }
        Insert: {
          commande_id: string
          envoyee_le?: string
          type: Database["public"]["Enums"]["type_notification"]
        }
        Update: {
          commande_id?: string
          envoyee_le?: string
          type?: Database["public"]["Enums"]["type_notification"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_envoyees_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      parametres_commandes: {
        Row: {
          cloture_heure: string
          cloture_jour: number
          commandes_ouvertes: boolean
          id: boolean
          message_clients: string | null
          updated_at: string
        }
        Insert: {
          cloture_heure?: string
          cloture_jour?: number
          commandes_ouvertes?: boolean
          id?: boolean
          message_clients?: string | null
          updated_at?: string
        }
        Update: {
          cloture_heure?: string
          cloture_jour?: number
          commandes_ouvertes?: boolean
          id?: boolean
          message_clients?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parametres_fidelite: {
        Row: {
          parrainage_cadeaux_debut: string
          filleuls_livres_seulement: boolean
          filleuls_ultra: number
          filleuls_vip: number
          id: boolean
          tampons_bienvenue: number
          tampons_parrain_par_commande: number
          tampons_parrainage: number
          updated_at: string
        }
        Insert: {
          parrainage_cadeaux_debut?: string
          filleuls_livres_seulement?: boolean
          filleuls_ultra?: number
          filleuls_vip?: number
          id?: boolean
          tampons_bienvenue?: number
          tampons_parrain_par_commande?: number
          tampons_parrainage?: number
          updated_at?: string
        }
        Update: {
          parrainage_cadeaux_debut?: string
          filleuls_livres_seulement?: boolean
          filleuls_ultra?: number
          filleuls_vip?: number
          id?: boolean
          tampons_bienvenue?: number
          tampons_parrain_par_commande?: number
          tampons_parrainage?: number
          updated_at?: string
        }
        Relationships: []
      }
      profils: {
        Row: {
          created_at: string
          id: string
          nom: string | null
          role: Database["public"]["Enums"]["role_utilisateur"]
        }
        Insert: {
          created_at?: string
          id: string
          nom?: string | null
          role: Database["public"]["Enums"]["role_utilisateur"]
        }
        Update: {
          created_at?: string
          id?: string
          nom?: string | null
          role?: Database["public"]["Enums"]["role_utilisateur"]
        }
        Relationships: []
      }
      rappels_envoyes: {
        Row: {
          client_id: string
          date_livraison: string
          envoye_le: string
          moment: string
        }
        Insert: {
          client_id: string
          date_livraison: string
          envoye_le?: string
          moment: string
        }
        Update: {
          client_id?: string
          date_livraison?: string
          envoye_le?: string
          moment?: string
        }
        Relationships: [
          {
            foreignKeyName: "rappels_envoyes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rappels_envoyes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "rappels_envoyes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      recompenses: {
        Row: {
          type: Database["public"]["Enums"]["type_recompense"]
          actif: boolean
          article_id: string | null
          cout_tampons: number
          created_at: string
          description: string | null
          id: string
          nb_offerts: number
          niveau: Database["public"]["Enums"]["niveau_fidelite"]
          nom: string
          ordre: number
          updated_at: string
        }
        Insert: {
          type?: Database["public"]["Enums"]["type_recompense"]
          actif?: boolean
          article_id?: string | null
          cout_tampons: number
          created_at?: string
          description?: string | null
          id?: string
          nb_offerts?: number
          niveau?: Database["public"]["Enums"]["niveau_fidelite"]
          nom: string
          ordre?: number
          updated_at?: string
        }
        Update: {
          type?: Database["public"]["Enums"]["type_recompense"]
          actif?: boolean
          article_id?: string | null
          cout_tampons?: number
          created_at?: string
          description?: string | null
          id?: string
          nb_offerts?: number
          niveau?: Database["public"]["Enums"]["niveau_fidelite"]
          nom?: string
          ordre?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recompenses_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      recompenses_utilisees: {
        Row: {
          filleul_id: string | null
          type: Database["public"]["Enums"]["type_recompense"]
          commande_id: string
          cout_tampons: number
          created_at: string
          id: string
          nom: string
          recompense_id: string | null
        }
        Insert: {
          filleul_id?: string | null
          type?: Database["public"]["Enums"]["type_recompense"]
          commande_id: string
          cout_tampons: number
          created_at?: string
          id?: string
          nom: string
          recompense_id?: string | null
        }
        Update: {
          filleul_id?: string | null
          type?: Database["public"]["Enums"]["type_recompense"]
          commande_id?: string
          cout_tampons?: number
          created_at?: string
          id?: string
          nom?: string
          recompense_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recompenses_utilisees_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recompenses_utilisees_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recompenses_utilisees_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "recompenses_utilisees_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "recompenses_utilisees_recompense_id_fkey"
            columns: ["recompense_id"]
            isOneToOne: false
            referencedRelation: "recompenses"
            referencedColumns: ["id"]
          },
        ]
      }
      secteur_communes: {
        Row: {
          code_insee: string
          nom: string
          secteur_id: string
        }
        Insert: {
          code_insee: string
          nom: string
          secteur_id: string
        }
        Update: {
          code_insee?: string
          nom?: string
          secteur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secteur_communes_secteur_id_fkey"
            columns: ["secteur_id"]
            isOneToOne: false
            referencedRelation: "secteurs"
            referencedColumns: ["id"]
          },
        ]
      }
      secteurs: {
        Row: {
          couleur: string
          created_at: string
          creneau: Database["public"]["Enums"]["creneau_livraison"]
          depart_adresse: string
          depart_lat: number
          depart_lng: number
          id: string
          jour: number
          nom: string
          updated_at: string
        }
        Insert: {
          couleur?: string
          created_at?: string
          creneau?: Database["public"]["Enums"]["creneau_livraison"]
          depart_adresse: string
          depart_lat: number
          depart_lng: number
          id?: string
          jour: number
          nom: string
          updated_at?: string
        }
        Update: {
          couleur?: string
          created_at?: string
          creneau?: Database["public"]["Enums"]["creneau_livraison"]
          depart_adresse?: string
          depart_lat?: number
          depart_lng?: number
          id?: string
          jour?: number
          nom?: string
          updated_at?: string
        }
        Relationships: []
      }
      tampons: {
        Row: {
          client_id: string
          commande_id: string | null
          created_at: string
          filleul_id: string | null
          id: string
          motif: Database["public"]["Enums"]["motif_tampon"]
          note: string | null
          quantite: number
        }
        Insert: {
          client_id: string
          commande_id?: string | null
          created_at?: string
          filleul_id?: string | null
          id?: string
          motif: Database["public"]["Enums"]["motif_tampon"]
          note?: string | null
          quantite: number
        }
        Update: {
          client_id?: string
          commande_id?: string | null
          created_at?: string
          filleul_id?: string | null
          id?: string
          motif?: Database["public"]["Enums"]["motif_tampon"]
          note?: string | null
          quantite?: number
        }
        Relationships: [
          {
            foreignKeyName: "tampons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tampons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "tampons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "tampons_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tampons_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tampons_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "tampons_filleul_id_fkey"
            columns: ["filleul_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      tournees: {
        Row: {
          date_livraison: string
          demarree_le: string
          secteur_id: string
        }
        Insert: {
          date_livraison: string
          demarree_le?: string
          secteur_id: string
        }
        Update: {
          date_livraison?: string
          demarree_le?: string
          secteur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournees_secteur_id_fkey"
            columns: ["secteur_id"]
            isOneToOne: false
            referencedRelation: "secteurs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      confitures_parrain_dues: {
        Row: {
          client_id: string | null
          filleul_id: string | null
          filleul_nom: string | null
          filleul_prenom: string | null
          premiere_commande: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      fidelite_clients: {
        Row: {
          client_id: string | null
          commandes_non_annulees: number | null
          confitures_dues: number | null
          parrain_id: string | null
          filleuls: number | null
          filleuls_comptes: number | null
          filleuls_livres: number | null
          niveau: Database["public"]["Enums"]["niveau_fidelite"] | null
          solde: number | null
          tampons_gagnes: number | null
          tampons_utilises: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "confitures_parrain_dues"
            referencedColumns: ["filleul_id"]
          },
          {
            foreignKeyName: "clients_parrain_id_fkey"
            columns: ["parrain_id"]
            isOneToOne: false
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
    }
    Functions: {
      abonnements_clients_actifs: {
        Args: never
        Returns: { auth: string; client_id: string; endpoint: string; p256dh: string }[]
      }
      abonnements_du_client: {
        Args: { p_client_id: string }
        Returns: { auth: string; endpoint: string; p256dh: string }[]
      }
      annuler_ma_commande: { Args: { p_commande_id: string }; Returns: undefined }
      cle_publique_push: { Args: never; Returns: string }
      cles_push: { Args: never; Returns: Json }
      cles_push_robot: { Args: { p_jeton: string }; Returns: Json }
      changer_statut_commande: {
        Args: {
          p_commande_id: string
          p_statut: Database["public"]["Enums"]["statut_commande"]
        }
        Returns: undefined
      }
      donner_mon_avis: {
        Args: { p_commande_id: string; p_commentaire: string; p_note: number }
        Returns: undefined
      }
      demarrer_tournee: { Args: { p_date: string; p_secteur_id: string }; Returns: Json }
      enregistrer_abonnement_push: {
        Args: { p_appareil?: string; p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      enregistrer_cles_push: { Args: { p_privee: string; p_publique: string }; Returns: undefined }
      enregistrer_ordre_tournee: {
        Args: { p_commandes: string[] }
        Returns: undefined
      }
      envoyer_inscription: {
        Args: {
          p_adresse: string
          p_code_insee: string
          p_code_postal: string
          p_commune: string
          p_complement_adresse: string
          p_lat: number
          p_lng: number
          p_nom: string
          p_notes_livraison: string
          p_parrain: string
          p_prenom: string
          p_telephone: string
        }
        Returns: undefined
      }
      ma_fidelite: { Args: never; Returns: Json }
      ma_situation: { Args: never; Returns: Json }
      marquer_livraison: {
        Args: { p_commande_id: string; p_livree: boolean; p_livree_le?: string }
        Returns: undefined
      }
      modifier_mes_coordonnees: {
        Args: { p_notes_livraison: string; p_telephone: string }
        Returns: undefined
      }
      noter_url_site: { Args: { p_url: string }; Returns: undefined }
      passer_commande: {
        Args: {
          p_lignes: Json
          p_notes?: string
          p_nouvelles_recompenses?: Json
          p_recompenses_gardees?: string[]
        }
        Returns: Json
      }
      rappels_a_envoyer: {
        Args: { p_jeton: string; p_moment: string }
        Returns: {
          auth: string
          client_id: string
          cloture: string
          date_livraison: string
          endpoint: string
          p256dh: string
          prenom: string
        }[]
      }
      reserver_annonce: { Args: { p_semaine: string }; Returns: boolean }
      reserver_notifications: {
        Args: { p_commandes: string[]; p_type: Database["public"]["Enums"]["type_notification"] }
        Returns: string[]
      }
      supprimer_abonnement_push: { Args: { p_endpoint: string }; Returns: undefined }
      supprimer_abonnement_robot: { Args: { p_endpoint: string; p_jeton: string }; Returns: undefined }
      supprimer_mon_compte: { Args: never; Returns: undefined }
      traiter_avis: { Args: { p_commande_id: string; p_traite: boolean }; Returns: undefined }
      valider_inscription: {
        Args: {
          p_client_id?: string
          p_parrain_id?: string
          p_secteur_id?: string
          p_user_id: string
        }
        Returns: string
      }
      enregistrer_commande: {
        Args: {
          p_client_id: string
          p_commande_id?: string
          p_date_livraison: string
          p_lignes: Json
          p_notes?: string
          p_recompenses?: Json
        }
        Returns: string
      }
    }
    Enums: {
      categorie_article: "panier" | "supplement"
      creneau_livraison: "matin" | "apres_midi" | "journee"
      motif_tampon:
        | "bienvenue"
        | "parrainage"
        | "commande"
        | "commande_filleul"
        | "ajustement"
      niveau_fidelite: "standard" | "vip" | "ultra"
      role_utilisateur: "admin" | "livreur"
      source_commande: "equipe" | "client"
      source_position: "adresse" | "manuelle"
      statut_commande: "a_livrer" | "livree" | "annulee"
      statut_inscription: "en_attente" | "refusee"
      type_notification: "depart" | "prochain" | "merci"
      type_recompense: "tampons" | "bienvenue_filleul" | "cadeau_parrain"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categorie_article: ["panier", "supplement"],
      creneau_livraison: ["matin", "apres_midi", "journee"],
      motif_tampon: [
        "bienvenue",
        "parrainage",
        "commande",
        "commande_filleul",
        "ajustement",
      ],
      niveau_fidelite: ["standard", "vip", "ultra"],
      role_utilisateur: ["admin", "livreur"],
      source_commande: ["equipe", "client"],
      source_position: ["adresse", "manuelle"],
      statut_commande: ["a_livrer", "livree", "annulee"],
      statut_inscription: ["en_attente", "refusee"],
      type_notification: ["depart", "prochain", "merci"],
      type_recompense: ["tampons", "bienvenue_filleul", "cadeau_parrain"],
    },
  },
} as const
