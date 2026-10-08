import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type Marker = { lat: number; lng: number; kind: 'pickup' | 'dropoff' | 'driver' | 'me'; label?: string };

const GHANA_CENTER: [number, number] = [5.6037, -0.187];

const icon = (kind: Marker['kind']) =>
  L.divIcon({
    className: '',
    html: `<span class="pin pin-${kind}"></span>`,
    iconSize: kind === 'driver' ? [30, 30] : [22, 22],
    iconAnchor: kind === 'driver' ? [15, 15] : [11, 11],
  });

export default function MapView({
  markers,
  onPick,
  className = '',
}: {
  markers: Marker[];
  onPick?: (p: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const fitted = useRef('');

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true }).setView(GHANA_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('click', e => pick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: icon(mk.kind), keyboard: false });
      if (mk.label) marker.bindTooltip(mk.label, { direction: 'top', offset: [0, -10] });
      marker.addTo(g);
    }
    const route = markers.filter(x => x.kind === 'pickup' || x.kind === 'dropoff');
    if (route.length === 2)
      L.polyline(
        route.map(x => [x.lat, x.lng] as [number, number]),
        { color: '#1d4a35', weight: 4, dashArray: '6 8', opacity: 0.8 }
      ).addTo(g);

    // Only re-frame the map when the set of stops changes, not on every driver location tick.
    const key = markers
      .filter(x => x.kind !== 'driver')
      .map(x => `${x.kind}:${x.lat.toFixed(4)},${x.lng.toFixed(4)}`)
      .join('|');
    if (key === fitted.current || !markers.length) return;
    fitted.current = key;
    if (markers.length === 1) m.setView([markers[0].lat, markers[0].lng], 15);
    else m.fitBounds(L.latLngBounds(markers.map(x => [x.lat, x.lng] as [number, number])), { padding: [60, 60], maxZoom: 15 });
  }, [markers]);

  return <div ref={el} className={`map ${onPick ? 'map-pickable' : ''} ${className}`} />;
}
