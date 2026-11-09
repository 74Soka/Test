"use client";

import { useState } from "react";
import { Bouton } from "@/components/ui";

/** Le code de parrainage du client, à partager (SMS, WhatsApp…) ou copier. */
export function PartagerCode({ code }: { code: string }) {
  const [copie, setCopie] = useState(false);
  const texte = `Je commande mes paniers de fruits et légumes chez Frais et Français 🍑 Inscris-toi avec mon code de parrainage ${code} : fraisetfrancais.fr/inscription`;

  async function partager() {
    if (navigator.share) {
      try {
        await navigator.share({ text: texte });
        return;
      } catch {
        // annulé par le client : rien à faire
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2500);
    } catch {
      setCopie(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-marque-50 p-4 text-center ring-1 ring-marque-100">
      <p className="text-sm font-bold tracking-wider text-stone-600 uppercase">Votre code de parrainage</p>
      <p className="font-titre text-3xl tracking-widest text-marque-800 select-all">{code}</p>
      <Bouton className="w-full" onClick={partager}>
        {copie ? "✓ Message copié" : "Partager mon code"}
      </Bouton>
    </div>
  );
}
