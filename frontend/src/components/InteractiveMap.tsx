import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, ViewStyle, Text, Pressable } from "react-native";
import { WebView } from "react-native-webview";
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
    "<link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\" crossorigin=\"\" />",
    "<style>html,body,#map{height:100%;width:100%;margin:0;overflow:hidden;touch-action:none;overscroll-behavior:none;background:#eef3f0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.leaflet-container{font:inherit;background:#eef3f0;touch-action:none;overscroll-behavior:none}.leaflet-top.leaflet-left{top:12px;left:12px}.leaflet-control-zoom{border:0!important;border-radius:14px;overflow:hidden;box-shadow:0 8px 20px rgba(18,52,45,.16)!important}.leaflet-control-zoom a{width:38px!important;height:38px!important;line-height:38px!important;background:rgba(255,255,255,.96)!important;color:#183d36!important;border:0!important;font-weight:600;font-size:20px!important}.leaflet-control-zoom a+a{border-top:1px solid #e6ece8!important}.leaflet-control-zoom a:hover{background:#eff7f3!important}.leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,.8)!important;border-radius:8px 0 0!important;padding:2px 5px!important;color:#668078}.leaflet-control-attribution a{color:#35695a}.leaflet-tooltip{border:0;border-radius:8px;box-shadow:0 4px 14px rgba(18,52,45,.16);font-size:12px;font-weight:600;color:#183d36;padding:5px 8px}.marker-wrap{background:transparent;border:0;overflow:visible}.destination-marker{width:20px;height:20px;border-radius:50% 50% 50% 0;background:#d64045;border:2px solid #fff;box-shadow:0 3px 9px rgba(42,36,36,.3);transform:rotate(-45deg);position:relative}.destination-marker:after{content:"";position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;top:5px;left:5px}.agent-marker{width:38px;height:38px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:transparent;border:0;box-shadow:none;font-size:27px;line-height:1;position:relative;z-index:1}.agent-marker:before{display:none}</style></head>",
    "<body><div id=\"map\"></div>",
    "<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\"></script>",
    "<script>",
    "const initial = " + initial + ";",
    "const markerSeed = " + markerSeed + ";",
    "const map = L.map(\"map\", { zoomControl: true, attributionControl: true, dragging: true, touchZoom: true, scrollWheelZoom: true, doubleClickZoom: true, tap: true, bounceAtZoomLimits: false, zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true, inertia: true, inertiaDeceleration: 1400, inertiaMaxSpeed: 1400, easeLinearity: 0.18, wheelPxPerZoomLevel: 80, wheelDebounceTime: 35, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([initial.lat, initial.lng], initial.zoom);",
    "const postMapMessage = (type, payload = {}) => { const message = JSON.stringify({ type, ...payload }); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message); else if (window.parent) window.parent.postMessage(message, '*'); };",
    "let tileErrorReported = false;",
    "const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, detectRetina: false, crossOrigin: true, updateWhenIdle: false, updateInterval: 150, updateWhenZooming: false, keepBuffer: 3, attribution: '&copy; OpenStreetMap contributors' });",
    "tiles.on('tileerror', () => { if (!tileErrorReported) { tileErrorReported = true; postMapMessage('map-error', { code: 'tiles' }); } });",
    "tiles.on('load', () => { tileErrorReported = false; postMapMessage('map-ready'); });",
    "tiles.addTo(map);",
    "const destinationIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='destination-marker' aria-label='موقع الزبون'></div>\", iconSize: [26, 26], iconAnchor: [13, 24] });",
    "const agentIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='agent-marker' aria-label='مندوب التوصيل'>🚗</div>\", iconSize: [38, 38], iconAnchor: [19, 19] });",
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
    "map.on('moveend zoomend', sendRegion); map.whenReady(() => { updateMarkers(markerSeed, true); postMapMessage('map-ready'); sendRegion(); });",
    "</script></body></html>",
  ].join("\n");
}

export default function InteractiveMap({ center, zoom = 16, destination, agent, followAgent = false, onRegionChange, style, onLocate }: Props) {
  const webRef = useRef<WebView>(null);
  // Keep the embedded document stable; viewport and markers are synchronized without reloading it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const markerPayload = useMemo(() => JSON.stringify({ destination: destination || null, agent: agent || null, followAgent }), [destination?.lat, destination?.lng, destination?.at, agent?.lat, agent?.lng, agent?.at, followAgent]);
  const viewportPayload = useMemo(() => JSON.stringify({ lat: center.lat, lng: center.lng, zoom }), [center.lat, center.lng, zoom]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => createMapHtml(center, zoom, { destination: destination || null, agent: agent || null, followAgent }), []);
  const [mapWarning, setMapWarning] = React.useState(false);
  const syncMap = useCallback(() => {
    webRef.current?.injectJavaScript("(function(){if(window.updateMapViewport)window.updateMapViewport(" + viewportPayload + ");if(window.updateMapMarkers)window.updateMapMarkers(" + markerPayload + ");})(); true;");
  }, [markerPayload, viewportPayload]);
  useEffect(() => { const timer = setTimeout(syncMap, 0); return () => clearTimeout(timer); }, [syncMap]);
  return (
    <View style={[styles.root, style]}>
      <WebView ref={webRef} source={{ html }} originWhitelist={["*"]} javaScriptEnabled domStorageEnabled onLoadEnd={syncMap} onError={() => setMapWarning(true)} onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data?.type === "map-error") setMapWarning(true);
          if (data?.type === "map-ready") setMapWarning(false);
          if (data?.type === "region" && Number.isFinite(data.lat) && Number.isFinite(data.lng)) onRegionChange?.({ lat: Number(data.lat), lng: Number(data.lng), zoom: Number(data.zoom) || zoom });
        } catch {}
      }} style={styles.webview} />
      {onLocate ? <Pressable accessibilityRole="button" accessibilityLabel="تحديد موقعي الحالي" onPress={onLocate} style={styles.locateButton}><Feather name="crosshair" size={21} color="#183D36" /></Pressable> : null}
      {mapWarning ? <View pointerEvents="none" style={styles.warning}><Text style={styles.warningText}>تعذر تحميل بلاطات الخريطة. تحقق من اتصال الإنترنت.</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, overflow: "hidden", position: "relative" }, webview: { flex: 1, backgroundColor: "transparent" }, locateButton: { position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 }, warning: { position: "absolute", left: 12, right: 12, bottom: 12, padding: 8, borderRadius: 8, backgroundColor: "rgba(255,248,230,0.96)" }, warningText: { color: "#6b4f00", textAlign: "center", fontSize: 12 } });
