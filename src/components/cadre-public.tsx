import type { ReactNode } from "react";

/** Mise en page des écrans sans connexion (connexion, inscription, mot de passe). */
export function CadrePublic({
  titre,
  sousTitre,
  children,
  pied,
}: {
  titre: string;
  sousTitre?: string;
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Frais et Français" width={128} height={128} className="mx-auto mb-4" />
        <h1 className="font-titre text-2xl text-marque-800">{titre}</h1>
        {sousTitre && <p className="mt-1 text-stone-600">{sousTitre}</p>}
      </div>
      <div className="rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgb(53_3_122/0.08)] ring-1 ring-marque-100">
        {children}
      </div>
      {pied && <div className="mt-6 space-y-3 text-center text-sm text-stone-600">{pied}</div>}
    </main>
  );
}
