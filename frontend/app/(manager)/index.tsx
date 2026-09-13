import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { api, formatPrice } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

const STATUS_ROWS = [
  { key: "pending", label: "قيد المراجعة", color: "#8B5CF6" },
  { key: "confirmed", label: "تم التأكيد", color: "#F59E0B" },
  { key: "preparing", label: "قيد التجهيز", color: "#20A88A" },
  { key: "delivered", label: "مكتمل", color: "#AEB7B2" },
];

export default function ManagerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api.adminStats(), api.adminOrders()]);
      setStats(s);
      setOrders(o);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [orders]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((order) => new Date(order.created_at).toDateString() === today);
  }, [orders]);

  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const recent = orders.slice(0, 5);
  const maxStatusCount = Math.max(1, ...STATUS_ROWS.map((row) => counts[row.key] || 0));

  const statCards = stats ? [
    { label: "إجمالي المنتجات", value: stats.products, icon: "shopping-cart", color: colors.brandPrimary },
    { label: "قيد المراجعة", value: counts.pending || 0, icon: "truck", color: "#3C9C91" },
    { label: "قيد التجهيز", value: counts.preparing || 0, icon: "check-circle", color: colors.success },
    { label: "إجمالي الطلبات", value: stats.orders, icon: "users", color: colors.brandSecondary },
  ] : [];

  const quickActions = [
    { icon: "grid", label: "الفئات", onPress: () => router.push("/(manager)/products"), testID: "qa-categories" },
    { icon: "plus-circle", label: "إضافة منتج", onPress: () => router.push("/(manager)/scan"), testID: "qa-add" },
    { icon: "users", label: "المندوبون", onPress: () => router.push("/(manager)/agents"), testID: "qa-agents" },
    { icon: "box", label: "المنتجات", onPress: () => router.push("/(manager)/products"), testID: "qa-products" },
    { icon: "clipboard", label: "الطلبات", onPress: () => router.push("/(manager)/orders"), testID: "qa-orders" },
    { icon: "rotate-ccw", label: "المرتجعات", count: stats?.returns || 0, onPress: () => router.push("/(manager)/returns"), testID: "qa-returns" },
    { icon: "tag", label: "الخصومات", onPress: () => router.push("/(manager)/products"), testID: "qa-discounts" },
    { icon: "printer", label: "الطباعة", onPress: () => router.push("/(manager)/orders"), testID: "qa-print" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Image source={require("../../assets/images/logo-binsaleem.png")} style={styles.logo} contentFit="contain" />
          <View style={styles.greeting}>
            <T color="rgba(255,255,255,0.75)" size={type.sm}>مرحباً 👑</T>
            <T weight="displayBold" size={type["2xl"]} color="#fff">مدير المتجر</T>
            <T color="rgba(255,255,255,0.75)" size={11}>إدارة متجرك بكل سهولة</T>
          </View>
          <Pressable testID="mgr-logout" onPress={async () => { await logout(); router.replace("/login"); }} style={styles.profileBtn}>
            <Feather name="user" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsGrid}>
            {statCards.map((card) => (
              <View key={card.label} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: card.color + "1A" }]}><Feather name={card.icon as any} size={18} color={card.color} /></View>
                <T weight="displayBold" size={type.xl} style={{ marginTop: spacing.xs }}>{card.value}</T>
                <T color={colors.muted} size={10} numberOfLines={1}>{card.label}</T>
              </View>
            ))}
          </View>

          <Pressable testID="dashboard-print-settings" onPress={() => router.push("/(manager)/orders")} style={styles.printBanner}>
            <View style={styles.printIcon}><Feather name="printer" size={25} color="#fff" /></View>
            <View style={styles.printCopy}>
              <T weight="bold" color="#fff" size={type.lg}>الطباعة التلقائية للطلبات</T>
              <T size={type.sm} color="rgba(255,255,255,0.8)">تعمل عند استلام الطلبات الجديدة</T>
            </View>
            <View style={styles.printAction}>
              <T weight="bold" size={11} color={colors.brandPrimary}>إعدادات الطباعة</T>
              <Feather name="chevron-left" size={15} color={colors.brandPrimary} />
            </View>
          </Pressable>

          <View style={styles.sectionTitle}>
            <T weight="displayBold" size={type.lg}>إجراءات سريعة</T>
            <Feather name="zap" size={18} color={colors.gold} />
          </View>
          <View style={styles.quickGrid}>
            {quickActions.map((action) => <QuickAction key={action.testID} {...action} />)}
          </View>

          <View style={styles.insightsRow}>
            <View style={styles.insightCard}>
              <View style={styles.cardTitle}><T weight="displayBold" size={type.lg}>حالة الطلبات</T><Feather name="clipboard" size={17} color={colors.brandPrimary} /></View>
              {STATUS_ROWS.map((row) => {
                const count = counts[row.key] || 0;
                return (
                  <View key={row.key} style={styles.statusRow}>
                    <T size={type.sm} style={{ flex: 1 }}>{row.label}</T>
                    <View style={[styles.statusDot, { backgroundColor: row.color }]} />
                    <T weight="bold" size={type.sm} color={colors.onSurfaceSecondary}>{count}</T>
                  </View>
                );
              })}
            </View>
            <View style={styles.insightCard}>
              <View style={styles.cardTitle}><T weight="displayBold" size={type.lg}>مبيعات اليوم</T><Feather name="bar-chart-2" size={17} color={colors.brandPrimary} /></View>
              <T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{formatPrice(todayRevenue)}</T>
              <T color={colors.muted} size={type.sm}>من {todayOrders.length} طلبات اليوم</T>
              <View style={styles.bars}>
                {STATUS_ROWS.map((row) => {
                  const height = Math.max(12, Math.round(((counts[row.key] || 0) / maxStatusCount) * 100));
                  return <View key={row.key} style={styles.barTrack}><View style={[styles.bar, { height: height + "%", backgroundColor: row.color }]} /></View>;
                })}
              </View>
            </View>
          </View>

          <View style={styles.sectionTitle}>
            <T weight="displayBold" size={type.lg}>أحدث الطلبات</T>
            <Pressable onPress={() => router.push("/(manager)/orders")}><T color={colors.brandPrimary} weight="semi" size={type.sm}>عرض الكل ‹</T></Pressable>
          </View>
          {recent.length === 0 ? <T color={colors.muted} style={{ textAlign: "center", padding: spacing.xl }}>لا توجد طلبات بعد</T> : recent.map((order) => (
            <Pressable key={order.id} testID={"mgr-order-" + order.id} onPress={() => router.push("/(manager)/orders")} style={styles.orderRow}>
              <View style={styles.orderIcon}><Feather name="package" size={17} color={colors.brandPrimary} /></View>
              <View style={styles.orderCopy}>
                <T weight="bold" numberOfLines={1}>{order.customer_name}</T>
                <T color={colors.muted} size={type.sm}>#{order.id.replace("ORD", "")} • {formatPrice(order.total)}</T>
              </View>
              <View style={styles.orderMeta}><StatusPill status={order.status} /><Feather name="chevron-left" size={17} color={colors.muted} /></View>
            </Pressable>
          ))}

          <View style={styles.tip}><Feather name="bulb" size={17} color={colors.gold} /><T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1 }}>تأكد من توفر المندوبين قبل إضافة الطلبات الجديدة للتوصيل.</T></View>
        </ScrollView>
      )}
    </View>
  );
}

function QuickAction({ icon, label, count, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.qa}>
      <View style={styles.qaIcon}>
        <Feather name={icon} size={20} color={colors.brandPrimary} />
        {typeof count === "number" && <View style={styles.qaBadge}><T weight="bold" size={9} color="#fff">{count > 99 ? "99+" : count}</T></View>}
      </View>
      <T weight="semi" size={11} style={{ textAlign: "center" }} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 74 },
  logo: { width: 108, height: 52 },
  greeting: { flex: 1, alignItems: "center", marginHorizontal: spacing.sm },
  profileBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row-reverse", gap: spacing.xs, marginBottom: spacing.md },
  statCard: { flex: 1, minHeight: 94, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  printBanner: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: spacing.md, minHeight: 82 },
  printIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  printCopy: { flex: 1 },
  printAction: { flexDirection: "row-reverse", alignItems: "center", gap: 2, backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  sectionTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.sm },
  quickGrid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm },
  qa: { width: "23.5%", minHeight: 82, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  qaIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  qaBadge: { position: "absolute", top: -3, insetInlineEnd: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  insightsRow: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.lg },
  insightCard: { flex: 1, minHeight: 188, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingVertical: 5 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  barTrack: { flex: 1, height: 56, justifyContent: "flex-end", backgroundColor: colors.surfaceSecondary, borderRadius: 5, overflow: "hidden" },
  bar: { width: "100%", borderRadius: 5 },
  orderRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  orderIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  orderCopy: { flex: 1 },
  orderMeta: { alignItems: "flex-end", gap: spacing.xs },
  tip: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.md },
});
