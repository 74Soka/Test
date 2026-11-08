import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { clientSupabase } from "@/lib/supabase/serveur";
import { Carte, EnTetePage } from "@/components/ui";
import { FormulaireCommandesEnLigne } from "./formulaire";

export const metadata: Metadata = { title: "Commandes en ligne" };

export default async function PageCommandesEnLigne() {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const { data: p, error } = await supabase.from("parametres_commandes").select("*").maybeSingle();
  if (error || !p) throw new Error(error?.message ?? "Paramètres des commandes introuvables.");

  return (
    <>
      <EnTetePage titre="Commandes en ligne" retour="/reglages" />
      <Carte>
        <FormulaireCommandesEnLigne
          initial={{
            commandes_ouvertes: p.commandes_ouvertes,
            cloture_jour: p.cloture_jour,
            cloture_heure: p.cloture_heure.slice(0, 5),
            message_clients: p.message_clients ?? "",
          }}
        />
      </Carte>
    </>
  );
}
