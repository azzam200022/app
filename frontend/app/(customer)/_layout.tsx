import React from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font, radius } from "@/src/lib/theme";
import { useCart } from "@/src/context/CartContext";

function renderTabIcon(icon: "home" | "shopping-cart" | "package" | "user") {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={icon} size={size} color={color} />
    </View>
  );
}

export default function CustomerLayout() {
  const { cart } = useCart();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11, marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          direction: "rtl",
          borderTopColor: colors.brandTertiary,
          borderTopWidth: 1,
          paddingTop: 8,
          shadowColor: colors.brandPrimary,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 8,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "الرئيسية", tabBarIcon: renderTabIcon("home") }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "السلة",
          tabBarBadge: cart.count > 0 ? cart.count : undefined,
           tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.onSurface, fontFamily: font.bodyBold },
          tabBarIcon: renderTabIcon("shopping-cart"),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "طلباتي", tabBarIcon: renderTabIcon("package") }}
      />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{ title: "حسابي", tabBarIcon: renderTabIcon("user") }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: { width: 36, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabIconActive: { backgroundColor: colors.brandTertiary },
});
