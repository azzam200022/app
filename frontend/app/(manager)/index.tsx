import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { api, formatPrice } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function ManagerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api.adminStats(), api.adminOrders()]);
      setStats(s); setRecent(o.slice(0, 6));
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cards = stats ? [
    { label: "المنتجات", value: stats.products, icon: "box", color: colors.brandPrimary },
    { label: "طلبات نشطة", value: stats.active_orders, icon: "clock", color: colors.gold },
    { label: "تم التوصيل", value: stats.delivered, icon: "check-circle", color: colors.success },
    { label: "الإيرادات", value: formatPrice(stats.revenue), icon: "trending-up", color: colors.brandSecondary, wide: true },
  ] : [];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View>
            <T color="rgba(255,255,255,0.75)" size={type.sm}>لوحة تحكم المدير</T>
            <T weight="displayBold" size={type["2xl"]} color="#fff">{user?.name}</T>
          </View>
          <Pressable testID="mgr-logout" onPress={async () => { await logout(); router.replace("/login"); }} style={styles.iconBtn}>
            <Feather name="log-out" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}>
          <View style={styles.statsGrid}>
            {cards.map((c) => (
              <View key={c.label} style={[styles.statCard, c.wide && { width: "100%" }]}>
                <View style={[styles.statIcon, { backgroundColor: c.color + "1A" }]}><Feather name={c.icon as any} size={20} color={c.color} /></View>
                <T weight="displayBold" size={type["2xl"]} style={{ marginTop: spacing.sm }}>{c.value}</T>
                <T color={colors.muted} size={type.sm}>{c.label}</T>
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            <QuickAction icon="camera" label="إضافة منتج" onPress={() => router.push("/(manager)/scan")} testID="qa-add" />
            <QuickAction icon="users" label="المندوبون" onPress={() => router.push("/(manager)/agents")} testID="qa-agents" />
            <QuickAction icon="box" label="المنتجات" onPress={() => router.push("/(manager)/products")} testID="qa-products" />
          </View>

          <Pressable testID="qa-sync" onPress={() => router.push("/(manager)/sync-settings")} style={styles.syncCard}>
            <View style={styles.syncIcon}><Feather name="link" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <T weight="bold" color="#fff">ربط نقطة البيع (الكاشير)</T>
              <T size={type.sm} color="rgba(255,255,255,0.8)">مزامنة المخزون والأسعار تلقائياً</T>
            </View>
            <Feather name="chevron-left" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <View style={styles.sectionHead}>
            <T weight="displayBold" size={type.lg}>أحدث الطلبات</T>
            <Pressable onPress={() => router.push("/(manager)/orders")}><T color={colors.brandPrimary} weight="semi">عرض الكل</T></Pressable>
          </View>
          {recent.length === 0 ? <T color={colors.muted} style={{ textAlign: "center", padding: spacing.xl }}>لا توجد طلبات بعد</T> : recent.map((o) => (
            <Pressable key={o.id} testID={`mgr-order-${o.id}`} onPress={() => router.push("/(manager)/orders")} style={styles.orderRow}>
              <View style={{ flex: 1 }}>
                <T weight="bold">#{o.id.replace("ORD", "")} • {o.customer_name}</T>
                <T color={colors.muted} size={type.sm}>{o.items.length} منتج • {formatPrice(o.total)}</T>
              </View>
              <StatusPill status={o.status} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.qa}>
      <View style={styles.qaIcon}><Feather name={icon} size={22} color={colors.brandPrimary} /></View>
      <T weight="semi" size={type.sm} style={{ textAlign: "center" }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "47%", flexGrow: 1, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  actionsRow: { flexDirection: "row-reverse", gap: spacing.md, marginTop: spacing.lg },
  syncCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  syncIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  qa: { flex: 1, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center", gap: spacing.sm },
  qaIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  orderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
});
