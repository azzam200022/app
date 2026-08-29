import "react-native-gesture-handler";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { I18nManager, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { CartProvider } from "@/src/context/CartContext";
import { ToastProvider } from "@/src/context/ToastContext";

LogBox.ignoreAllLogs(true);

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
