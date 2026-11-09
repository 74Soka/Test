/**
 * Écran d'attente affiché tout de suite pendant qu'une page se prépare
 * (fichiers loading.tsx) : on voit que l'appui a été pris en compte.
 */
export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-6">
      <div className="mb-6 flex items-center gap-3 text-marque-800">
        <span
          aria-hidden
          className="size-6 animate-spin rounded-full border-[3px] border-marque-100 border-t-marque-800"
        />
        <span className="text-lg font-semibold">{texte}</span>
      </div>
      <div aria-hidden className="space-y-3">
        <div className="h-8 w-2/3 animate-pulse rounded-xl bg-marque-100" />
        <div className="h-24 animate-pulse rounded-3xl bg-white ring-1 ring-marque-100" />
        <div className="h-24 animate-pulse rounded-3xl bg-white ring-1 ring-marque-100" />
        <div className="h-24 animate-pulse rounded-3xl bg-white ring-1 ring-marque-100" />
      </div>
    </div>
  );
}
