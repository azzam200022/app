import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { Feather } from "@expo/vector-icons";
import { colors, font, radius } from "@/src/lib/theme";
import { useCart } from "@/src/context/CartContext";
import { useAuth } from "@/src/context/AuthContext";

function CustomerTabIcon({ icon, color, size, focused }: { icon: "home" | "shopping-cart" | "package" | "user"; color: string; size: number; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Feather name={icon} size={size} color={color} />
    </View>
  );
}

export default function CustomerLayout() {
  const { cart } = useCart();
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void NavigationBar.setVisibilityAsync("hidden").catch(() => {});
    return () => {
      void NavigationBar.setVisibilityAsync("visible").catch(() => {});
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11, marginTop: 3 },
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          direction: "rtl",
          borderTopColor: colors.border,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          marginHorizontal: 12,
          marginBottom: 8,
          paddingTop: 6,
          paddingBottom: 6,
          shadowColor: "#18372B",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 7,
          ...(Platform.OS === "web" ? { height: 72 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "الرئيسية", tabBarIcon: ({ color, size, focused }) => <CustomerTabIcon icon="home" color={color} size={size} focused={focused} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "السلة",
          tabBarBadge: cart.count > 0 ? cart.count : undefined,
           tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.onSurface, fontFamily: font.bodyBold },
          tabBarIcon: ({ color, size, focused }) => <CustomerTabIcon icon="shopping-cart" color={color} size={size} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={user?.role === "customer" ? { title: "طلباتي", tabBarIcon: ({ color, size, focused }) => <CustomerTabIcon icon="package" color={color} size={size} focused={focused} /> } : { href: null }}
      />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{ title: "حسابي", tabBarIcon: ({ color, size, focused }) => <CustomerTabIcon icon="user" color={color} size={size} focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: { width: 42, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: "transparent" },
  tabIconActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary },
});
