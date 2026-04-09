import React, { useEffect, useRef } from 'react';

// SAU campus stop coordinates
const STOPS = {
  'Main Gate 1':    { lat: 28.481506696970786, lng: 77.20156655401924 },
  'Main Gate 2':    { lat: 28.484021948032776, lng: 77.1983732789934 },
  'Rajpur Khurd Road': { lat: 28.488978658164335, lng: 77.19388845282725 },
  'Gaushala Road':  { lat: 28.48331524485649, lng: 77.18885118170873 },
};

export default function MapView({ autos }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const stopMarkersRef = useRef([]);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([28.5244, 77.1855], 17);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add stop markers
      Object.entries(STOPS).forEach(([name, pos]) => {
        const icon = L.divIcon({
          html: `<div style="
            background: rgba(77,159,255,0.9); color: #fff;
            padding: 3px 7px; border-radius: 6px; font-size: 10px;
            font-family: 'DM Sans', sans-serif; font-weight: 500;
            white-space: nowrap; border: 1px solid rgba(77,159,255,0.5);
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          ">${name}</div>`,
          className: '',
          iconAnchor: [0, 0],
        });
        stopMarkersRef.current.push(L.marker([pos.lat, pos.lng], { icon }).addTo(map));
      });

      if (autos) updateMarkers(L, map, autos);
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !autos) return;
    updateMarkers(window.L, mapInstanceRef.current, autos);
  }, [autos]);

  function updateMarkers(L, map, autos) {
    autos.forEach(auto => {
      const lat = auto.lat || 28.5244;
      const lng = auto.lng || 77.1855;
      const isAvail = auto.status === 'available';
      const color = isAvail ? '#00e5a0' : '#f5a623';

      const icon = L.divIcon({
        html: `<div style="
          width: 36px; height: 36px; border-radius: 50%;
          background: ${color}22; border: 2px solid ${color};
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; box-shadow: 0 0 12px ${color}55;
          transition: all 0.5s;
        ">🛺</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (markersRef.current[auto.id]) {
        markersRef.current[auto.id].setLatLng([lat, lng]).setIcon(icon);
      } else {
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:'DM Sans',sans-serif;color:#f0f0f8;background:#1a1a28;padding:8px;border-radius:8px;min-width:120px;">
              <strong>${auto.driver_name}</strong>
              <br/><span style="color:#aaa;font-size:11px;">${isAvail ? '✅ Available' : '🔸 On Trip'} · ${auto.location}</span>
            </div>
          `);
        markersRef.current[auto.id] = marker;
      }
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapRef} style={{
        height: 260, borderRadius: 16, overflow: 'hidden',
        border: '1px solid var(--border)',
      }} />
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        display: 'flex', gap: 6, flexWrap: 'wrap',
      }}>
        {[
          { color: '#00e5a0', label: 'Available' },
          { color: '#f5a623', label: 'On Trip' },
          { color: '#4d9fff', label: 'Stop' },
        ].map(l => (
          <div key={l.label} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 10, color: '#f0f0f8',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
