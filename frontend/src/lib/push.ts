import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "@/src/lib/api";

export async function registerForPush() {
  if ((Platform.OS !== "ios" && Platform.OS !== "android") || !Device.isDevice) return;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
    }

    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && canAskAgain) {
      const permission = await Notifications.requestPermissionsAsync();
      status = permission.status;
    }
    if (status !== "granted") return;

    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    await api.registerPushToken({
      platform: Platform.OS,
      device_token: String(tokenResponse.data),
    });
  } catch (error) {
    console.warn("[push] Device registration failed", error);
  }
}
