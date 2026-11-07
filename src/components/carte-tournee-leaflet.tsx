"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

export type PointCarte = { id: string; lat: number; lng: number; numero: number; livre: boolean };

export type ProprietesCarteTournee = {
  depart: { lat: number; lng: number };
  points: PointCarte[];
  couleur: string;
  onChoisir?: (id: string) => void;
  hauteur?: number;
};

function icone(texte: string, fond: string) {
  return L.divIcon({
    className: "",
    html: `<div class="numero-carte" style="background:${fond}">${texte}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function Cadrer({ points }: { points: [number, number][] }) {
  const carte = useMap();
  const cle = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length > 1) carte.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carte, cle]);
  return null;
}

export default function CarteTourneeLeaflet({ depart, points, couleur, onChoisir, hauteur = 280 }: ProprietesCarteTournee) {
  const trace: [number, number][] = [[depart.lat, depart.lng], ...points.map((p) => [p.lat, p.lng] as [number, number])];
  return (
    <MapContainer
      center={[depart.lat, depart.lng]}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: hauteur }}
      className="w-full rounded-xl ring-1 ring-stone-300"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Cadrer points={trace} />
      <Polyline positions={trace} pathOptions={{ color: couleur, weight: 3, opacity: 0.7 }} />
      {points.length > 0 && (
        <Polyline
          positions={[trace[trace.length - 1], trace[0]]}
          pathOptions={{ color: couleur, weight: 2, opacity: 0.4, dashArray: "6 6" }}
        />
      )}
      <Marker position={[depart.lat, depart.lng]} icon={icone("⌂", "#44403c")} />
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={icone(String(p.numero), p.livre ? "#15803d" : couleur)}
          eventHandlers={onChoisir ? { click: () => onChoisir(p.id) } : undefined}
        />
      ))}
    </MapContainer>
  );
}
