import React from "react";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font } from "@/src/lib/theme";

export default function ManagerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11 },
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "لوحة التحكم", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: "المنتجات", tabBarIcon: ({ color, size }) => <Feather name="box" size={size} color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: "إضافة", tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "الطلبات", tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }} />
      <Tabs.Screen name="agents" options={{ href: null }} />
    </Tabs>
  );
}
