"use client";

import { useEffect, useRef } from "react";

export type MapPoint = { lat: number; lon: number; label?: string };

/**
 * Leaflet basemap. Loaded entirely client-side because Leaflet needs
 * window/document. The CSS is fetched from unpkg the first time the
 * component mounts so we don't have to ship leaflet/dist/leaflet.css
 * through the Next.js bundler.
 */
export function LeafletMap({
  points,
  height = 320,
}: {
  points: MapPoint[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup = () => {};

    (async () => {
      const L = (await import("leaflet")).default;

      // Inject the stylesheet once.
      const cssId = "leaflet-css";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Fix the default-icon paths that bundlers break.
      // (Leaflet ships images relative to its own URL — webpack/turbo can't find them.)
      const iconBase = "https://unpkg.com/leaflet@1.9.4/dist/images";
      const DefaultIcon = L.icon({
        iconUrl: `${iconBase}/marker-icon.png`,
        iconRetinaUrl: `${iconBase}/marker-icon-2x.png`,
        shadowUrl: `${iconBase}/marker-shadow.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });

      const el = containerRef.current;
      if (!el) return;
      // Bail if already initialized (Leaflet stores _leaflet_id on the container)
      if ((el as any)._leaflet_id) return;

      const map = L.map(el, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      if (points.length === 0) {
        map.setView([0, 0], 2);
      } else {
        const layers = points.map((p) => {
          const m = L.marker([p.lat, p.lon], { icon: DefaultIcon });
          if (p.label) m.bindTooltip(p.label);
          return m;
        });
        const group = L.featureGroup(layers).addTo(map);
        map.fitBounds(group.getBounds().pad(0.2));
      }

      cleanup = () => {
        map.remove();
      };
    })();

    return () => cleanup();
  }, [points]);

  return (
    <div className="chart-wrap" style={{ background: "#fff", padding: 0 }}>
      <div
        ref={containerRef}
        style={{ height, width: "100%", borderRadius: 4, overflow: "hidden" }}
      />
    </div>
  );
}
