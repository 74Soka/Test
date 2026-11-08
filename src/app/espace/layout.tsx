import { exigerClient } from "@/lib/auth";
import { NavigationBas } from "@/components/navigation-bas";

/** Espace client : réservé aux comptes clients (l'équipe est renvoyée vers ses écrans). */
export default async function LayoutEspace({ children }: { children: React.ReactNode }) {
  const { situation } = await exigerClient();
  const relie = situation.etat === "client";
  return (
    <>
      <main
        className={
          relie
            ? "mx-auto max-w-2xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]"
            : "mx-auto max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        }
      >
        {children}
      </main>
      {relie && <NavigationBas espace="client" />}
    </>
  );
}
