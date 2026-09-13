import React from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font } from "@/src/lib/theme";

export default function ManagerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: "rgba(251,247,238,0.7)",
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 10 },
        tabBarStyle: { backgroundColor: colors.brandPrimary, direction: "rtl", borderTopColor: colors.brandSecondary, borderTopWidth: StyleSheet.hairlineWidth, ...(Platform.OS === "web" ? { height: 56 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "لوحة التحكم", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: "المنتجات", tabBarIcon: ({ color, size }) => <Feather name="box" size={size} color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: "إضافة", tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "الطلبات", tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }} />
      <Tabs.Screen name="agents" options={{ href: null }} />
      <Tabs.Screen name="sync-settings" options={{ href: null }} />
      <Tabs.Screen name="returns" options={{ href: null }} />
    </Tabs>
  );
}
