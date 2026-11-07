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
          client_id: string
          created_at: string
          date_livraison: string
          id: string
          livree_le: string | null
          notes: string | null
          semaine: string | null
          statut: Database["public"]["Enums"]["statut_commande"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          date_livraison: string
          id?: string
          livree_le?: string | null
          notes?: string | null
          semaine?: string | null
          statut?: Database["public"]["Enums"]["statut_commande"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          date_livraison?: string
          id?: string
          livree_le?: string | null
          notes?: string | null
          semaine?: string | null
          statut?: Database["public"]["Enums"]["statut_commande"]
          updated_at?: string
        }
        Relationships: [
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
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
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
      parametres_fidelite: {
        Row: {
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
      recompenses: {
        Row: {
          actif: boolean
          article_id: string | null
          cout_tampons: number
          created_at: string
          description: string | null
          id: string
          niveau: Database["public"]["Enums"]["niveau_fidelite"]
          nom: string
          ordre: number
          updated_at: string
        }
        Insert: {
          actif?: boolean
          article_id?: string | null
          cout_tampons: number
          created_at?: string
          description?: string | null
          id?: string
          niveau?: Database["public"]["Enums"]["niveau_fidelite"]
          nom: string
          ordre?: number
          updated_at?: string
        }
        Update: {
          actif?: boolean
          article_id?: string | null
          cout_tampons?: number
          created_at?: string
          description?: string | null
          id?: string
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
          commande_id: string
          cout_tampons: number
          created_at: string
          id: string
          nom: string
          recompense_id: string | null
        }
        Insert: {
          commande_id: string
          cout_tampons: number
          created_at?: string
          id?: string
          nom: string
          recompense_id?: string | null
        }
        Update: {
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
            referencedRelation: "fidelite_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
    }
    Views: {
      fidelite_clients: {
        Row: {
          client_id: string | null
          filleuls: number | null
          filleuls_comptes: number | null
          filleuls_livres: number | null
          niveau: Database["public"]["Enums"]["niveau_fidelite"] | null
          solde: number | null
          tampons_gagnes: number | null
          tampons_utilises: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      changer_statut_commande: {
        Args: {
          p_commande_id: string
          p_statut: Database["public"]["Enums"]["statut_commande"]
        }
        Returns: undefined
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
      source_position: "adresse" | "manuelle"
      statut_commande: "a_livrer" | "livree" | "annulee"
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
      source_position: ["adresse", "manuelle"],
      statut_commande: ["a_livrer", "livree", "annulee"],
    },
  },
} as const
