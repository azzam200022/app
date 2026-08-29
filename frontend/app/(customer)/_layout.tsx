import React from "react";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font } from "@/src/lib/theme";
import { useCart } from "@/src/context/CartContext";

export default function CustomerLayout() {
  const { cart } = useCart();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "الرئيسية", tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "السلة",
          tabBarBadge: cart.count > 0 ? cart.count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.gold, color: "#1A1A1A", fontFamily: font.bodyBold },
          tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "طلباتي", tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "حسابي", tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
