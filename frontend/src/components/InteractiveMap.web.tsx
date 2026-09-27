import React, { useEffect, useMemo, useCallback } from "react";
import { ViewStyle } from "react-native";

export type MapRegion = { lat: number; lng: number; zoom: number };
type Props = { center: { lat: number; lng: number }; zoom?: number; onRegionChange?: (region: MapRegion) => void; style?: ViewStyle };

function createMapHtml(center: { lat: number; lng: number }, zoom: number) {
  const initial = JSON.stringify({ lat: center.lat, lng: center.lng, zoom });
  return [
    "<!doctype html>",
    "<html lang=\"ar\" dir=\"rtl\"><head>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\" />",
    "<link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\" crossorigin=\"\" />",
    "<style>html,body,#map{height:100%;width:100%;margin:0;background:#e8eee8}.leaflet-control-attribution{font-size:9px}</style></head>",
    "<body><div id=\"map\"></div>",
    "<script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\"></script>",
    "<script>",
    "const initial = " + initial + ";",
    "const map = L.map(\"map\", { zoomControl: true, attributionControl: true, tap: true }).setView([initial.lat, initial.lng], initial.zoom);",
    "L.tileLayer(\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\", { maxZoom: 19, attribution: \"&copy; OpenStreetMap contributors\" }).addTo(map);",
    "const sendRegion = () => { const c = map.getCenter(); window.parent.postMessage(JSON.stringify({ type: \"region\", lat: c.lat, lng: c.lng, zoom: map.getZoom() }), \"*\"); };",
    "map.on(\"moveend zoomend\", sendRegion); map.whenReady(sendRegion);",
    "</script></body></html>",
  ].join("\n");
}

export default function InteractiveMap({ center, zoom = 16, onRegionChange, style }: Props) {
  const html = useMemo(() => createMapHtml(center, zoom), []);
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(typeof event.data === "string" ? event.data : "");
      if (data?.type === "region" && Number.isFinite(data.lat) && Number.isFinite(data.lng)) onRegionChange?.({ lat: Number(data.lat), lng: Number(data.lng), zoom: Number(data.zoom) || zoom });
    } catch {}
  }, [onRegionChange, zoom]);
  useEffect(() => { window.addEventListener("message", handleMessage); return () => window.removeEventListener("message", handleMessage); }, [handleMessage]);
  const IFrame = "iframe" as any;
  return <IFrame title="خريطة اختيار موقع التوصيل" srcDoc={html} style={{ width: "100%", height: "100%", border: 0, ...(style as any) }} />;
}