import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { ActivityIndicator, View, StyleSheet, Text, Pressable, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

export type MapRegion = { lat: number; lng: number; zoom: number };
export type MapPoint = { lat: number; lng: number; at?: string | null };
type Props = {
  center: { lat: number; lng: number };
  zoom?: number;
  destination?: MapPoint | null;
  agent?: MapPoint | null;
  followAgent?: boolean;
  onRegionChange?: (region: MapRegion) => void;
  style?: ViewStyle;
  onLocate?: () => void;
};

type MarkerPayload = { destination?: MapPoint | null; agent?: MapPoint | null; followAgent?: boolean };

function createMapHtml(center: { lat: number; lng: number }, zoom: number, initialMarkers: MarkerPayload) {
  const initial = JSON.stringify({ lat: center.lat, lng: center.lng, zoom });
  const markerSeed = JSON.stringify(initialMarkers);
  return [
    "<!doctype html>",
    "<html lang=\"ar\" dir=\"rtl\"><head>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\" />",
    "<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css\" crossorigin=\"\" onerror=\"this.onerror=null;this.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';\" />",
    "<style>*{box-sizing:border-box}html,body,#map{height:100%;width:100%;margin:0;background:#e8f0eb;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}html,body{overscroll-behavior:none;overflow:hidden}.leaflet-container{font:inherit;background:#e8f0eb;touch-action:pan-x pan-y}.leaflet-top.leaflet-left{top:14px;left:14px}.leaflet-control-zoom{border:0!important;border-radius:14px!important;overflow:hidden;box-shadow:0 8px 20px rgba(18,52,45,.16)!important}.leaflet-control-zoom a{width:42px!important;height:42px!important;line-height:42px!important;background:rgba(255,255,255,.97)!important;color:#183d36!important;border:0!important;font-weight:600;font-size:20px!important}.leaflet-control-zoom a+a{border-top:1px solid #e6ece8!important}.leaflet-control-zoom a:hover{background:#eff7f3!important}.leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.88)!important;border-radius:8px 0 0!important;padding:3px 6px!important;color:#668078}.leaflet-control-attribution a{color:#35695a}.leaflet-tooltip{border:0;border-radius:8px;box-shadow:0 4px 14px rgba(18,52,45,.16);font-size:12px;font-weight:600;color:#183d36;padding:5px 8px}.marker-wrap{background:transparent;border:0}.destination-marker{width:20px;height:20px;border-radius:50% 50% 50% 0;background:#d64045;border:2px solid #fff;box-shadow:0 3px 9px rgba(42,36,36,.3);transform:rotate(-45deg);position:relative}.destination-marker:after{content:'';position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;top:5px;left:5px}.agent-marker{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#176b52;border:2px solid #fff;box-shadow:0 3px 10px rgba(18,52,45,.3);position:relative}.agent-marker:before{content:'';width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.2)}</style></head>",
    "<body><div id=\"map\"></div>",
    "<script src=\"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\" onerror=\"this.onerror=null;this.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';\"></script>",
    "<script>",
    "const initial = " + initial + ";",
    "const markerSeed = " + markerSeed + ";",
    "if (!window.L) { const message = JSON.stringify({ type: 'map-error', code: 'library' }); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message); else if (window.parent) window.parent.postMessage(message, '*'); throw new Error('Leaflet did not load'); }",
    "const map = L.map('map', { zoomControl: true, attributionControl: true, tap: true, zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true, inertia: true, inertiaDeceleration: 2800, wheelPxPerZoomLevel: 120, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([initial.lat, initial.lng], initial.zoom);",
    "const postMapMessage = (type, payload = {}) => { const message = JSON.stringify({ type, ...payload }); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message); else if (window.parent) window.parent.postMessage(message, '*'); };",
    "const cartoAttribution = '&copy; OpenStreetMap contributors &copy; CARTO';",
    "const osmAttribution = '&copy; OpenStreetMap contributors';",
    "const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';",
    "let tileProvider = 'carto'; let consecutiveTileErrors = 0; let hasLoadedTiles = false; let unavailable = false;",
    "const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, maxNativeZoom: 19, detectRetina: true, crossOrigin: true, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2, attribution: cartoAttribution });",
    "tiles.on('tileload', () => { consecutiveTileErrors = 0; if (!hasLoadedTiles || unavailable) { hasLoadedTiles = true; unavailable = false; postMapMessage('map-ready'); } });",
    "tiles.on('tileerror', () => { consecutiveTileErrors += 1; if (tileProvider === 'carto' && consecutiveTileErrors >= 3) { tileProvider = 'osm'; consecutiveTileErrors = 0; map.attributionControl.removeAttribution(cartoAttribution); map.attributionControl.addAttribution(osmAttribution); tiles.setUrl(osmUrl); postMapMessage('map-loading', { provider: 'osm' }); return; } if (tileProvider === 'osm' && consecutiveTileErrors >= 6) { unavailable = true; postMapMessage('map-error', { code: 'tiles' }); } });",
    "tiles.addTo(map);",
    "const destinationIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='destination-marker' aria-label='موقع الزبون'></div>\", iconSize: [26, 26], iconAnchor: [13, 24] });",
    "const agentIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='agent-marker' aria-label='مندوب التوصيل'></div>\", iconSize: [38, 38], iconAnchor: [19, 19] });",
    "const liveMarkers = {};",
    "const validPoint = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));",
    "function updateMarkers(next, initialFit) {",
    "  const points = [];",
    "  if (validPoint(next.destination)) {",
    "    const p = [Number(next.destination.lat), Number(next.destination.lng)]; points.push(p);",
    "    if (!liveMarkers.destination) liveMarkers.destination = L.marker(p, { icon: destinationIcon, title: 'موقع الزبون' }).addTo(map).bindTooltip('موقع الزبون'); else liveMarkers.destination.setLatLng(p);",
    "  } else if (liveMarkers.destination) { map.removeLayer(liveMarkers.destination); delete liveMarkers.destination; }",
    "  if (validPoint(next.agent)) {",
    "    const p = [Number(next.agent.lat), Number(next.agent.lng)]; points.push(p);",
    "    if (!liveMarkers.agent) liveMarkers.agent = L.marker(p, { icon: agentIcon, title: 'مندوب التوصيل' }).addTo(map).bindTooltip('مندوب التوصيل'); else liveMarkers.agent.setLatLng(p);",
    "  } else if (liveMarkers.agent) { map.removeLayer(liveMarkers.agent); delete liveMarkers.agent; }",
    "  if ((initialFit || next.followAgent) && points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });",
    "  else if ((initialFit || next.followAgent) && points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15));",
    "  setTimeout(() => map.invalidateSize(), 50);",
    "}",
    "window.updateMapMarkers = (next) => updateMarkers(next || {}, false);",
    "window.updateMapViewport = (next) => { if (!validPoint(next)) return; const lat = Number(next.lat); const lng = Number(next.lng); const targetZoom = Number(next.zoom) || map.getZoom(); const c = map.getCenter(); if (Math.abs(c.lat - lat) > 0.00001 || Math.abs(c.lng - lng) > 0.00001 || Math.abs(map.getZoom() - targetZoom) > 0.25) map.setView([lat, lng], targetZoom, { animate: false }); };",
    "window.addEventListener('message', (event) => { const data = event.data || {}; if (data.type === 'viewport') window.updateMapViewport(data.payload || {}); if (data.type === 'markers') updateMarkers(data.payload || {}, false); });",
    "const sendRegion = () => { const c = map.getCenter(); postMapMessage('region', { lat: c.lat, lng: c.lng, zoom: map.getZoom() }); };",
    "map.on('moveend zoomend', sendRegion); map.whenReady(() => { updateMarkers(markerSeed, true); postMapMessage('map-initialized'); sendRegion(); });",
    "</script></body></html>",
  ].join("\n");
}

type MapStatus = 'loading' | 'ready' | 'error';

export default function InteractiveMap({ center, zoom = 16, destination, agent, followAgent = false, onRegionChange, style, onLocate }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const markerPayload = useMemo(() => JSON.stringify({ destination: destination || null, agent: agent || null, followAgent }), [destination?.lat, destination?.lng, destination?.at, agent?.lat, agent?.lng, agent?.at, followAgent]);
  const viewportPayload = useMemo(() => JSON.stringify({ lat: center.lat, lng: center.lng, zoom }), [center.lat, center.lng, zoom]);
  // Keep the embedded document stable; sync camera and markers without reloading it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => createMapHtml(center, zoom, { destination: destination || null, agent: agent || null, followAgent }), []);
  const [mapStatus, setMapStatus] = React.useState<MapStatus>('loading');
  const [retryCount, setRetryCount] = React.useState(0);
  useEffect(() => {
    setMapStatus('loading');
    const timer = window.setTimeout(() => setMapStatus((current) => current === 'loading' ? 'error' : current), 12000);
    return () => window.clearTimeout(timer);
  }, [retryCount]);
  const syncMap = useCallback(() => {
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage({ type: 'viewport', payload: JSON.parse(viewportPayload) }, '*');
    frame.postMessage({ type: 'markers', payload: JSON.parse(markerPayload) }, '*');
  }, [markerPayload, viewportPayload]);
  useEffect(() => { const timer = setTimeout(syncMap, 0); return () => clearTimeout(timer); }, [syncMap]);
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
      if (data?.type === 'map-loading') setMapStatus('loading');
      if (data?.type === 'map-error') setMapStatus('error');
      if (data?.type === 'map-ready') setMapStatus('ready');
      if (data?.type === 'region' && Number.isFinite(data.lat) && Number.isFinite(data.lng)) onRegionChange?.({ lat: Number(data.lat), lng: Number(data.lng), zoom: Number(data.zoom) || zoom });
    } catch {}
  }, [onRegionChange, zoom]);
  useEffect(() => { window.addEventListener('message', handleMessage); return () => window.removeEventListener('message', handleMessage); }, [handleMessage]);
  return (
    <View style={[styles.root, style]}>
      <iframe key={retryCount} ref={frameRef} title='خريطة تفاعلية لاختيار موقع التوصيل' srcDoc={html} onLoad={syncMap} onError={() => setMapStatus('error')} style={{ width: '100%', height: '100%', border: 0 }} />
      {mapStatus === 'loading' ? <View pointerEvents='none' style={styles.loadingOverlay}><ActivityIndicator color='#183D36' size='small' /><Text style={styles.loadingText}>جارٍ تحميل الخريطة...</Text></View> : null}
      {mapStatus === 'error' ? <View style={styles.errorOverlay}><View style={styles.errorCard}><Feather name='map' size={22} color='#183D36' /><Text style={styles.errorText}>تعذر تحميل الخريطة. تحقق من الاتصال ثم أعد المحاولة.</Text><Pressable accessibilityRole='button' onPress={() => setRetryCount((value) => value + 1)} style={styles.retryButton}><Feather name='refresh-cw' size={16} color='#FFFFFF' /><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable></View></View> : null}
      {onLocate ? <Pressable accessibilityRole='button' accessibilityLabel='تحديد موقعي الحالي' onPress={onLocate} style={styles.locateButton}><Feather name='crosshair' size={21} color='#183D36' /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: '#E8F0EB' },
  loadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(242,247,244,0.5)' },
  loadingText: { color: '#355B50', fontSize: 13, fontWeight: '600' },
  errorOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(242,247,244,0.9)', zIndex: 3 },
  errorCard: { width: '100%', maxWidth: 320, alignItems: 'center', gap: 10, padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE8E2', shadowColor: '#183D36', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  errorText: { color: '#355B50', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#183D36' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  locateButton: { position: 'absolute', top: 14, right: 14, width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#183D36', shadowOpacity: 0.18, shadowRadius: 8, elevation: 4, zIndex: 4 },
});
