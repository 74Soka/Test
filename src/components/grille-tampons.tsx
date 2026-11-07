import { cx } from "./ui";

/** Carte à tampons façon papier : 10 cases, les tampons au-delà sont indiqués à part. */
export function GrilleTampons({ solde }: { solde: number }) {
  const remplis = Math.max(0, Math.min(solde, 10));
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-5 gap-1.5" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cx(
              "flex size-8 items-center justify-center rounded-full border-2 text-sm",
              i < remplis ? "border-marque-700 bg-marque-700 text-white" : "border-dashed border-stone-300",
            )}
          >
            {i < remplis ? "✓" : i + 1 === 5 || i + 1 === 10 ? "🎁" : ""}
          </span>
        ))}
      </div>
      {solde > 10 && <span className="text-lg font-bold text-marque-800">+{solde - 10}</span>}
    </div>
  );
}
