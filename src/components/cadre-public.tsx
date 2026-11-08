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
        <img src="/icon.svg" alt="" width={72} height={72} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-2xl font-bold">{titre}</h1>
        {sousTitre && <p className="mt-1 text-stone-600">{sousTitre}</p>}
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">{children}</div>
      {pied && <div className="mt-6 space-y-3 text-center text-sm text-stone-600">{pied}</div>}
    </main>
  );
}
