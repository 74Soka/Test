"use client";

import dynamic from "next/dynamic";
import type { ProprietesCarte } from "./carte-leaflet";

/** Carte OpenStreetMap (Leaflet), chargée uniquement dans le navigateur. */
export const Carte = dynamic<ProprietesCarte>(() => import("./carte-leaflet"), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full animate-pulse rounded-xl bg-stone-200" />,
});

export type { Position } from "./carte-leaflet";
