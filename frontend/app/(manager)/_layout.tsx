import React, { useCallback, useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

export default function ManagerLayout() {
  const [supportUnread, setSupportUnread] = useState(0);
  const refreshSupportUnread = useCallback(async () => {
    try {
      const result = await api.adminSupportUnreadCount();
      setSupportUnread(Number(result?.count) || 0);
    } catch {}
  }, []);

  useEffect(() => {
    void refreshSupportUnread();
    const interval = setInterval(() => { void refreshSupportUnread(); }, 20000);
    return () => clearInterval(interval);
  }, [refreshSupportUnread]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11, marginTop: 2 },
        tabBarStyle: { backgroundColor: colors.surface, direction: "rtl", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "لوحة التحكم", tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="agent-statistics" options={{ title: "إحصاءات المندوبين", tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} /> }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ title: "إضافة", tabBarIcon: ({ color, size }) => <Feather name="plus-circle" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "الطلبات", tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }} />
       <Tabs.Screen name="support" options={{ title: "الدعم", tabBarBadge: supportUnread > 0 ? (supportUnread > 99 ? "99+" : supportUnread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.onSurface, fontFamily: font.bodyBold }, tabBarIcon: ({ color, size }) => <Feather name="headphones" size={size} color={color} /> }} />
      <Tabs.Screen name="agents" options={{ href: null }} />
      <Tabs.Screen name="sync-settings" options={{ href: null }} />
      <Tabs.Screen name="returns" options={{ href: null }} />
      <Tabs.Screen name="banners" options={{ href: null }} />
      <Tabs.Screen name="coupons" options={{ href: null }} />
      <Tabs.Screen name="branches" options={{ href: null }} />
      <Tabs.Screen name="delivery-areas" options={{ title: "التوصيل", tabBarIcon: ({ color, size }) => <Feather name="truck" size={size} color={color} /> }} />
    </Tabs>
  );
}
