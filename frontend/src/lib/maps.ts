import { Linking, Platform } from "react-native";

// Keyless Yandex static map (returns a PNG). ll/pt use lon,lat order.
export function staticMapUrl(lat: number, lng: number, w = 600, h = 260, zoom = 16): string {
  return `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=${zoom}&size=${w},${h}&l=map&pt=${lng},${lat},pm2rdm`;
}

// Two pins: destination (red) + delivery agent (green), auto-fit.
export function staticMapUrlTwo(dLat: number, dLng: number, aLat: number, aLng: number, w = 600, h = 260): string {
  const pts = `${dLng},${dLat},pm2rdm~${aLng},${aLat},pm2gnm`;
  return `https://static-maps.yandex.ru/1.x/?size=${w},${h}&l=map&pt=${pts}`;
}

// Open turn-by-turn navigation to the destination in the device's maps app.
export function openDirections(lat?: number | null, lng?: number | null, fallbackQuery?: string) {
  if (lat != null && lng != null) {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
      android: `google.navigation:q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    });
    Linking.openURL(url as string).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
    );
    return;
  }
  if (fallbackQuery) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`);
  }
}

export function openLocation(lat?: number | null, lng?: number | null, fallbackQuery?: string) {
  if (lat != null && lng != null) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    return;
  }
  if (fallbackQuery) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`);
}
