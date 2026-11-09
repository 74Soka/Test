import type { Metadata } from "next";
import { exigerClient } from "@/lib/auth";
import { supprimerMonCompte } from "../../actions";
import { Bouton, Carte, EnTetePage, MessageErreur } from "@/components/ui";

export const metadata: Metadata = { title: "Supprimer mon compte" };

export default async function PageSupprimerCompte({ searchParams }: PageProps<"/espace/compte/supprimer">) {
  const { utilisateur } = await exigerClient();
  const { erreur } = await searchParams;
  return (
    <>
      <EnTetePage titre="Supprimer mon compte" retour="/espace/compte" />
      <Carte className="space-y-4">
        {erreur === "confirmation" && <MessageErreur>Cochez la case pour confirmer.</MessageErreur>}
        {erreur === "echec" && <MessageErreur>La suppression n&apos;a pas abouti. Réessayez ou contactez-nous.</MessageErreur>}
        <p>Seront supprimés définitivement :</p>
        <ul className="list-inside list-disc text-stone-700">
          <li>votre compte ({utilisateur.email}) ;</li>
          <li>vos coordonnées et votre adresse ;</li>
          <li>vos commandes, y compris celle de cette semaine ;</li>
          <li>vos graines et récompenses.</li>
        </ul>
        <form action={supprimerMonCompte} className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="confirmation" value="oui" className="mt-1 size-5" required />
            <span>Je comprends que c&apos;est définitif.</span>
          </label>
          <Bouton type="submit" variante="danger" className="w-full">
            Supprimer définitivement
          </Bouton>
        </form>
      </Carte>
    </>
  );
}
