import type { Metadata, Viewport } from "next";
// Polices de la marque, servies par le site lui-même (aucun appel à Google)
import "@fontsource/alfa-slab-one/400.css";
import "@fontsource-variable/nunito/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Frais et Français", template: "%s · Frais et Français" },
  description: "Paniers de fruits et légumes frais livrés le week-end dans le Var",
  applicationName: "Frais et Français",
  appleWebApp: { capable: true, title: "Frais et Français", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#35037a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
