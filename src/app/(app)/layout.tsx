import { exigerAdmin } from "@/lib/auth";
import { NavigationBas } from "@/components/navigation-bas";

export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  await exigerAdmin();

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>
      <NavigationBas />
    </>
  );
}
