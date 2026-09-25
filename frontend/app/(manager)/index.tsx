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
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, products] = await Promise.all([api.adminStats(), api.adminOrders(), api.products({}, true)]);
      setStats(s);
      setOrders(o);
      setLowStockProducts((Array.isArray(products) ? products : []).filter((product) => Number(product.stock ?? 0) <= 5));
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

  const toggleComingSoon = async (product: any) => {
    const next = !product.coming_soon;
    try {
      await api.updateProduct(product.id, { coming_soon: next });
      setLowStockProducts((current) => current.map((item) => item.id === product.id ? {
        ...item,
        coming_soon: next,
        available: Number(item.stock ?? 0) > 0 && !next,
        stock_status: next ? "coming_soon" : (Number(item.stock ?? 0) <= 0 ? "out" : "in"),
      } : item));
      show(next ? "تم إيقاف بيع المنتج: يتوفر قريباً" : "تمت إعادة المنتج للبيع");
    } catch (e: any) {
      show(e.message, "error");
    }
  };

  const statCards = stats ? [
    { label: "إجمالي المنتجات", value: stats.products, icon: "shopping-cart", color: colors.brandPrimary },
    { label: "قيد المراجعة", value: counts.pending || 0, icon: "truck", color: "#3C9C91" },
    { label: "قيد التجهيز", value: counts.preparing || 0, icon: "check-circle", color: colors.success },
    { label: "إجمالي الطلبات", value: stats.orders, icon: "users", color: colors.brandSecondary },
  ] : [];

  const quickActions = [
    { icon: "tag", label: "فروع الأقسام", onPress: () => router.push("/(manager)/branches"), testID: "qa-branches" },
    { icon: "alert-triangle", label: "مخزون منخفض", count: lowStockProducts.length, onPress: () => router.push("/(manager)/products"), testID: "qa-low-stock" },
    { icon: "plus-circle", label: "إضافة منتج", onPress: () => router.push("/(manager)/scan"), testID: "qa-add" },
    { icon: "users", label: "المندوبون", onPress: () => router.push("/(manager)/agents"), testID: "qa-agents" },
    { icon: "file-text", label: "تحديث PDF", onPress: () => router.push("/(manager)/sync-settings"), testID: "qa-pdf" },
    { icon: "clipboard", label: "الطلبات", onPress: () => router.push("/(manager)/orders"), testID: "qa-orders" },
    { icon: "rotate-ccw", label: "المرتجعات", count: stats?.returns || 0, onPress: () => router.push("/(manager)/returns"), testID: "qa-returns" },
     { icon: "tag", label: "كود الخصم", count: stats?.coupons || 0, onPress: () => router.push("/(manager)/coupons"), testID: "qa-discounts" },
            { icon: "image", label: "البانورامات", count: stats?.banners || 0, onPress: () => router.push("/(manager)/banners"), testID: "qa-banners" },
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

          <View style={styles.stockSectionTitle}>
            <View style={styles.stockSectionHeading}>
              <T weight="displayBold" size={type.lg}>تنبيه المخزون</T>
              <Feather name="alert-triangle" size={18} color={colors.error} />
            </View>
            <Pressable testID="low-stock-manage" onPress={() => router.push("/(manager)/products")}>
              <T color={colors.brandPrimary} weight="semi" size={type.sm}>إدارة المنتجات ‹</T>
            </Pressable>
          </View>
          {lowStockProducts.length === 0 ? (
            <View style={styles.stockEmpty}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <T color={colors.muted} size={type.sm}>لا توجد منتجات كميتها 5 قطع أو أقل</T>
            </View>
          ) : (
            <View style={styles.stockPanel} testID="low-stock-panel">
              <View style={styles.stockSummary}>
                <View style={styles.stockSummaryIcon}><Feather name="alert-circle" size={20} color={colors.error} /></View>
                <View style={styles.stockSummaryCopy}>
                  <T weight="bold" size={type.base}>منتجات على وشك النفاذ</T>
                  <T color={colors.muted} size={type.sm}>تحتاج إلى مراجعة قبل نفادها</T>
                </View>
                <View style={styles.stockCount}><T weight="displayBold" color={colors.error} size={type.lg}>{lowStockProducts.length}</T></View>
              </View>
              {lowStockProducts.slice(0, 5).map((product) => (
                <View key={product.id} style={styles.stockRow}>
                  <View style={styles.stockRowIcon}><Feather name="package" size={17} color={colors.brandPrimary} /></View>
                  <View style={styles.stockRowCopy}>
                    <T weight="semi" numberOfLines={1}>{product.name}</T>
                    <T color={Number(product.stock ?? 0) === 0 ? colors.error : colors.gold} size={type.sm}>المخزون: {product.stock ?? 0} قطع</T>
                  </View>
                  <Pressable testID={"dashboard-coming-" + product.id} onPress={() => toggleComingSoon(product)} style={[styles.stockAction, product.coming_soon && styles.stockActionActive]}>
                    <Feather name={product.coming_soon ? "clock" : "slash"} size={13} color={product.coming_soon ? colors.gold : colors.brandPrimary} />
                    <T size={10} weight="bold" color={product.coming_soon ? colors.gold : colors.brandPrimary}>{product.coming_soon ? "يتوفر قريباً" : "جعله يتوفر قريباً"}</T>
                  </Pressable>
                </View>
              ))}
              {lowStockProducts.length > 5 ? (
                <Pressable testID="low-stock-view-all" onPress={() => router.push("/(manager)/products")} style={styles.stockMore}>
                  <T color={colors.brandPrimary} weight="semi" size={type.sm}>عرض جميع المنتجات ({lowStockProducts.length}) ‹</T>
                </Pressable>
              ) : null}
            </View>
          )}

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
                  return <View key={row.key} style={styles.barTrack}><View style={[styles.bar, { height: (height + "%") as any, backgroundColor: row.color }]} /></View>;
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

          <View style={styles.tip}><Feather name="info" size={17} color={colors.gold} /><T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1 }}>تأكد من توفر المندوبين قبل إضافة الطلبات الجديدة للتوصيل.</T></View>
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
  stockSectionTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  stockSectionHeading: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  stockPanel: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: "#F2D39A", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stockSummary: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  stockSummaryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF3D6", alignItems: "center", justifyContent: "center" },
  stockSummaryCopy: { flex: 1, alignItems: "flex-end" },
  stockCount: { minWidth: 38, height: 38, borderRadius: 19, backgroundColor: "#FDE8E7", alignItems: "center", justifyContent: "center" },
  stockRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  stockRowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stockRowCopy: { flex: 1, alignItems: "flex-end" },
  stockAction: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  stockActionActive: { backgroundColor: "#FBF1DE" },
  stockMore: { alignItems: "center", paddingVertical: spacing.sm },
  stockEmpty: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
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
