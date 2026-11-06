// Types de la base, au format produit par `supabase gen types typescript`.
// À régénérer après chaque migration :
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      articles: {
        Row: {
          actif: boolean;
          categorie: Database["public"]["Enums"]["categorie_article"];
          created_at: string;
          id: string;
          nom: string;
          ordre: number;
          prix_centimes: number;
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          categorie: Database["public"]["Enums"]["categorie_article"];
          created_at?: string;
          id?: string;
          nom: string;
          ordre?: number;
          prix_centimes: number;
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          categorie?: Database["public"]["Enums"]["categorie_article"];
          created_at?: string;
          id?: string;
          nom?: string;
          ordre?: number;
          prix_centimes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          actif: boolean;
          adresse: string;
          code_insee: string | null;
          code_postal: string;
          commune: string;
          complement_adresse: string | null;
          created_at: string;
          date_inscription: string;
          email: string | null;
          id: string;
          lat: number | null;
          lng: number | null;
          nom: string;
          notes_livraison: string | null;
          parrain_id: string | null;
          prenom: string;
          secteur_id: string;
          source_position: Database["public"]["Enums"]["source_position"] | null;
          telephone: string | null;
          updated_at: string;
        };
        Insert: {
          actif?: boolean;
          adresse: string;
          code_insee?: string | null;
          code_postal: string;
          commune: string;
          complement_adresse?: string | null;
          created_at?: string;
          date_inscription?: string;
          email?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          nom: string;
          notes_livraison?: string | null;
          parrain_id?: string | null;
          prenom?: string;
          secteur_id: string;
          source_position?: Database["public"]["Enums"]["source_position"] | null;
          telephone?: string | null;
          updated_at?: string;
        };
        Update: {
          actif?: boolean;
          adresse?: string;
          code_insee?: string | null;
          code_postal?: string;
          commune?: string;
          complement_adresse?: string | null;
          created_at?: string;
          date_inscription?: string;
          email?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          nom?: string;
          notes_livraison?: string | null;
          parrain_id?: string | null;
          prenom?: string;
          secteur_id?: string;
          source_position?: Database["public"]["Enums"]["source_position"] | null;
          telephone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_parrain_id_fkey";
            columns: ["parrain_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_secteur_id_fkey";
            columns: ["secteur_id"];
            isOneToOne: false;
            referencedRelation: "secteurs";
            referencedColumns: ["id"];
          },
        ];
      };
      commandes: {
        Row: {
          client_id: string;
          created_at: string;
          date_livraison: string;
          id: string;
          livree_le: string | null;
          notes: string | null;
          semaine: string;
          statut: Database["public"]["Enums"]["statut_commande"];
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          date_livraison: string;
          id?: string;
          livree_le?: string | null;
          notes?: string | null;
          statut?: Database["public"]["Enums"]["statut_commande"];
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          date_livraison?: string;
          id?: string;
          livree_le?: string | null;
          notes?: string | null;
          statut?: Database["public"]["Enums"]["statut_commande"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commandes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      lignes_commande: {
        Row: {
          article_id: string;
          categorie: Database["public"]["Enums"]["categorie_article"];
          commande_id: string;
          libelle: string;
          prix_unitaire_centimes: number;
          quantite: number;
        };
        Insert: {
          article_id: string;
          categorie: Database["public"]["Enums"]["categorie_article"];
          commande_id: string;
          libelle: string;
          prix_unitaire_centimes: number;
          quantite: number;
        };
        Update: {
          article_id?: string;
          categorie?: Database["public"]["Enums"]["categorie_article"];
          commande_id?: string;
          libelle?: string;
          prix_unitaire_centimes?: number;
          quantite?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lignes_commande_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lignes_commande_commande_id_fkey";
            columns: ["commande_id"];
            isOneToOne: false;
            referencedRelation: "commandes";
            referencedColumns: ["id"];
          },
        ];
      };
      profils: {
        Row: {
          created_at: string;
          id: string;
          nom: string | null;
          role: Database["public"]["Enums"]["role_utilisateur"];
        };
        Insert: {
          created_at?: string;
          id: string;
          nom?: string | null;
          role: Database["public"]["Enums"]["role_utilisateur"];
        };
        Update: {
          created_at?: string;
          id?: string;
          nom?: string | null;
          role?: Database["public"]["Enums"]["role_utilisateur"];
        };
        Relationships: [];
      };
      secteur_communes: {
        Row: {
          code_insee: string;
          nom: string;
          secteur_id: string;
        };
        Insert: {
          code_insee: string;
          nom: string;
          secteur_id: string;
        };
        Update: {
          code_insee?: string;
          nom?: string;
          secteur_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "secteur_communes_secteur_id_fkey";
            columns: ["secteur_id"];
            isOneToOne: false;
            referencedRelation: "secteurs";
            referencedColumns: ["id"];
          },
        ];
      };
      secteurs: {
        Row: {
          couleur: string;
          created_at: string;
          creneau: Database["public"]["Enums"]["creneau_livraison"];
          depart_adresse: string;
          depart_lat: number;
          depart_lng: number;
          id: string;
          jour: number;
          nom: string;
          updated_at: string;
        };
        Insert: {
          couleur?: string;
          created_at?: string;
          creneau?: Database["public"]["Enums"]["creneau_livraison"];
          depart_adresse: string;
          depart_lat: number;
          depart_lng: number;
          id?: string;
          jour: number;
          nom: string;
          updated_at?: string;
        };
        Update: {
          couleur?: string;
          created_at?: string;
          creneau?: Database["public"]["Enums"]["creneau_livraison"];
          depart_adresse?: string;
          depart_lat?: number;
          depart_lng?: number;
          id?: string;
          jour?: number;
          nom?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      changer_statut_commande: {
        Args: {
          p_commande_id: string;
          p_statut: Database["public"]["Enums"]["statut_commande"];
        };
        Returns: undefined;
      };
      enregistrer_commande: {
        Args: {
          p_client_id: string;
          p_commande_id?: string | null;
          p_date_livraison: string;
          p_lignes: Json;
          p_notes?: string | null;
        };
        Returns: string;
      };
      est_admin: { Args: never; Returns: boolean };
      est_equipe: { Args: never; Returns: boolean };
    };
    Enums: {
      categorie_article: "panier" | "supplement";
      creneau_livraison: "matin" | "apres_midi" | "journee";
      role_utilisateur: "admin" | "livreur";
      source_position: "adresse" | "manuelle";
      statut_commande: "a_livrer" | "livree" | "annulee";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
