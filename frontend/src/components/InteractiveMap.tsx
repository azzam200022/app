import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

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
    "<style>html,body,#map{height:100%;width:100%;margin:0;background:#e8eee8}.leaflet-control-attribution{font-size:9px}.marker-wrap{background:transparent;border:0}.destination-marker{width:24px;height:24px;border-radius:50% 50% 50% 0;background:#d64045;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:rotate(-45deg);position:relative}.destination-marker:after{content:\"\";position:absolute;width:8px;height:8px;border-radius:50%;background:#fff;top:5px;left:5px}.agent-marker{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#176b52;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);font-size:21px;line-height:1}</style></head>",
    "<body><div id=\"map\"></div>",
    "<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\"></script>",
    "<script>",
    "const initial = " + initial + ";",
    "const markerSeed = " + markerSeed + ";",
    "const map = L.map(\"map\", { zoomControl: true, attributionControl: true, tap: true }).setView([initial.lat, initial.lng], initial.zoom);",
    "L.tileLayer(\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\", { maxZoom: 19, attribution: \"&copy; OpenStreetMap contributors\" }).addTo(map);",
    "const destinationIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='destination-marker' aria-label='موقع الزبون'></div>\", iconSize: [30, 30], iconAnchor: [15, 28] });",
    "const agentIcon = L.divIcon({ className: \"marker-wrap\", html: \"<div class='agent-marker' aria-label='مندوب التوصيل'>🚗</div>\", iconSize: [44, 44], iconAnchor: [22, 22] });",
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
    "window.addEventListener('message', (event) => { const data = event.data || {}; if (data.type === 'markers') updateMarkers(data.payload || {}, false); });",
    "const sendRegion = () => { const c = map.getCenter(); const message = JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng, zoom: map.getZoom() }); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message); else if (window.parent) window.parent.postMessage(message, '*'); };",
    "map.on('moveend zoomend', sendRegion); map.whenReady(() => { updateMarkers(markerSeed, true); sendRegion(); });",
    "</script></body></html>",
  ].join("\\n");
}

export default function InteractiveMap({ center, zoom = 16, destination, agent, followAgent = false, onRegionChange, style }: Props) {
  const webRef = useRef<WebView>(null);
  const markerPayload = useMemo(() => JSON.stringify({ destination: destination || null, agent: agent || null, followAgent }), [destination?.lat, destination?.lng, destination?.at, agent?.lat, agent?.lng, agent?.at, followAgent]);
  const html = useMemo(() => createMapHtml(center, zoom, { destination: destination || null, agent: agent || null, followAgent }), []);
  const syncMarkers = () => { webRef.current?.injectJavaScript("window.updateMapMarkers(" + markerPayload + "); true;"); };
  useEffect(() => { const timer = setTimeout(syncMarkers, 0); return () => clearTimeout(timer); }, [markerPayload]);
  return (
    <View style={[styles.root, style]}>
      <WebView ref={webRef} source={{ html }} originWhitelist={["*"]} javaScriptEnabled domStorageEnabled onLoadEnd={syncMarkers} onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data?.type === "region" && Number.isFinite(data.lat) && Number.isFinite(data.lng)) onRegionChange?.({ lat: Number(data.lat), lng: Number(data.lng), zoom: Number(data.zoom) || zoom });
        } catch {}
      }} style={styles.webview} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, overflow: "hidden" }, webview: { flex: 1, backgroundColor: "transparent" } });
