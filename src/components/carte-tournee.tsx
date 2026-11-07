"use client";

import dynamic from "next/dynamic";
import type { ProprietesCarteTournee } from "./carte-tournee-leaflet";

/** Carte de tournée (Leaflet), chargée uniquement dans le navigateur. */
export const CarteTournee = dynamic<ProprietesCarteTournee>(() => import("./carte-tournee-leaflet"), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-xl bg-stone-200" />,
});
