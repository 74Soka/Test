import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth";
import { compterTelephonesClients } from "@/lib/notifications";
import { clientSupabase } from "@/lib/supabase/serveur";
import { Carte, EnTetePage, TitreSection } from "@/components/ui";
import { FormulaireMessage } from "./formulaire";
import { LIENS_MESSAGE } from "./liens";

export const metadata: Metadata = { title: "Notification aux clients" };

const DATE_HEURE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function PageMessages() {
  await exigerAdmin();
  const supabase = await clientSupabase();
  const [abonnes, { data: historique }] = await Promise.all([
    compterTelephonesClients(),
    supabase.from("messages_clients").select("*").order("envoye_le", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <EnTetePage titre="Notification aux clients" sousTitre="Nouveau produit, information…" retour="/reglages" />
      <div className="space-y-6">
        <p className="text-stone-700">
          Envoyée tout de suite à <strong>{abonnes}</strong> téléphone{abonnes > 1 ? "s" : ""} : les clients qui ont
          activé les notifications.
        </p>
        <FormulaireMessage abonnes={abonnes} />

        {historique && historique.length > 0 && (
          <Carte aria-label="Historique des envois">
            <TitreSection>Historique des envois</TitreSection>
            <ul className="divide-y divide-stone-100">
              {historique.map((m) => (
                <li key={m.id} className="py-3">
                  <p className="font-semibold">{m.titre}</p>
                  <p className="text-stone-700">{m.corps}</p>
                  <p className="text-sm text-stone-600">
                    {DATE_HEURE.format(new Date(m.envoye_le))} · {m.telephones ?? "?"} téléphone
                    {(m.telephones ?? 0) > 1 ? "s" : ""} ·{" "}
                    {LIENS_MESSAGE[m.lien as keyof typeof LIENS_MESSAGE] ?? m.lien}
                  </p>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </>
  );
}
