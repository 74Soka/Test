import { exigerEquipe } from "@/lib/auth";
import { seDeconnecter } from "@/app/connexion/actions";
import { NavigationBas } from "@/components/navigation-bas";

/** Écrans de terrain : accessibles à l'administrateur et aux livreurs. */
export default async function LayoutTerrain({ children }: { children: React.ReactNode }) {
  const utilisateur = await exigerEquipe();
  const admin = utilisateur.role === "admin";

  return (
    <>
      {!admin && (
        <div className="flex items-center justify-between bg-marque-800 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-white">
          <span className="font-titre">Frais et Français · livreur</span>
          <form action={seDeconnecter}>
            <button type="submit" className="min-h-10 rounded-lg px-3 text-sm font-semibold underline">
              Se déconnecter
            </button>
          </form>
        </div>
      )}
      <main
        className={
          admin
            ? "mx-auto max-w-2xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]"
            : "mx-auto max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        }
      >
        {children}
      </main>
      {admin && <NavigationBas />}
    </>
  );
}
