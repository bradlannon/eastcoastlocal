'use client';

import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

interface MiniMapProps {
  lat: number;
  lng: number;
  venueName: string;
}

// Bold accent dot marker — orange-red, visible on CartoDB Positron tiles
const venueDotIcon = divIcon({
  className: '',
  html: `<div style="
    width: 14px;
    height: 14px;
    background-color: #E85D26;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function MiniMap({ lat, lng, venueName }: MiniMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={14}
      style={{ height: '200px', width: '100%', borderRadius: '0.5rem' }}
      dragging={false}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <Marker position={[lat, lng]} icon={venueDotIcon} title={venueName} />
    </MapContainer>
  );
}
