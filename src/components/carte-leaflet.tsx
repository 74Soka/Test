"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type Position = { lat: number; lng: number };

export type ProprietesCarte = {
  position: Position | null;
  /** Centre utilisé quand aucune position n'est connue */
  centre: Position;
  /** Si fourni, le repère est déplaçable et un appui sur la carte le place. */
  onDeplacer?: (position: Position) => void;
  hauteur?: number;
};

const icone = L.divIcon({
  className: "",
  html: '<div class="repere-carte"></div>',
  iconSize: [32, 42],
  iconAnchor: [16, 40],
});

function Recentrer({ position }: { position: Position | null }) {
  const carte = useMap();
  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) {
      carte.setView([lat, lng], Math.max(carte.getZoom(), 16));
    }
  }, [carte, lat, lng]);
  return null;
}

function PlacerAuClic({ onDeplacer }: { onDeplacer: (p: Position) => void }) {
  useMapEvents({
    click(e) {
      onDeplacer({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function CarteLeaflet({ position, centre, onDeplacer, hauteur = 220 }: ProprietesCarte) {
  const depart = position ?? centre;
  return (
    <MapContainer
      center={[depart.lat, depart.lng]}
      zoom={position ? 16 : 10}
      scrollWheelZoom={false}
      style={{ height: hauteur }}
      className="w-full rounded-xl ring-1 ring-stone-300"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Recentrer position={position} />
      {onDeplacer && <PlacerAuClic onDeplacer={onDeplacer} />}
      {position && (
        <Marker
          position={[position.lat, position.lng]}
          icon={icone}
          draggable={Boolean(onDeplacer)}
          eventHandlers={
            onDeplacer
              ? {
                  dragend(e) {
                    const ll = (e.target as L.Marker).getLatLng();
                    onDeplacer({ lat: ll.lat, lng: ll.lng });
                  },
                }
              : undefined
          }
        />
      )}
    </MapContainer>
  );
}
