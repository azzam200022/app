import "react-native-gesture-handler";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { I18nManager, LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { CartProvider } from "@/src/context/CartContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { registerForPush } from "@/src/lib/push";
import { storage } from "@/src/utils/storage";

LogBox.ignoreAllLogs(true);

// Push notifications — module scope config
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function AppServices() {
  const { user } = useAuth();
  const router = useRouter();

  // register for push whenever a user is present
  useEffect(() => {
    if (user?.user_id) registerForPush(user.user_id);
  }, [user?.user_id]);

  // notification tap handling + denied nudge
  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) (url.startsWith("http") ? Linking.openURL(url) : router.push(url));
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) (url.startsWith("http") ? Linking.openURL(url) : router.push(url));
    });
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const last = await storage.getItem("pushNudgeAt", 0);
      if (last && Date.now() - Number(last) <= 7 * 24 * 60 * 60 * 1000) return;
      await storage.setItem("pushNudgeAt", Date.now());
    })();
    return () => tapSub.remove();
  }, [router]);

  return null;
}

// Force RTL for the Arabic-only experience.
try {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
} catch {}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "Tajawal-Regular": require("../assets/fonts/Tajawal-Regular.ttf"),
    "Tajawal-Medium": require("../assets/fonts/Tajawal-Medium.ttf"),
    "Tajawal-Bold": require("../assets/fonts/Tajawal-Bold.ttf"),
    "Cairo-Regular": require("../assets/fonts/Cairo-Regular.ttf"),
    "Cairo-SemiBold": require("../assets/fonts/Cairo-SemiBold.ttf"),
    "Cairo-Bold": require("../assets/fonts/Cairo-Bold.ttf"),
  });

  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <AppServices />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FBFBF9" } }}>
                <Stack.Screen name="checkout" options={{ presentation: "modal" }} />
              </Stack>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
