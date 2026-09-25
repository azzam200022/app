import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { api, formatPrice, getCachedOrders, STATUS_LABEL } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export const STATUS_COLOR: Record<string, string> = {
  pending: "#C5A059",
  confirmed: "#3A5A40",
  preparing: "#4A524C",
  ready_for_delivery: "#8A5A00",
  out_for_delivery: "#285C4D",
  delivered: "#1F4529",
  delivery_failed: "#8B3A3A",
  cancelled: "#8B3A3A",
  returned: "#8B3A3A",
};

const STATUS_DESCRIPTION: Record<string, string> = {
  pending: "استلمنا طلبك، وهو قيد المراجعة.",
  confirmed: "تم تأكيد طلبك.",
  preparing: "يجري تجهيز منتجاتك.",
  ready_for_delivery: "طلبك جاهز للتوصيل.",
  out_for_delivery: "المندوب في الطريق إليك.",
  delivered: "تم تسليم الطلب.",
  delivery_failed: "تعذر التسليم؛ افتح التفاصيل لمعرفة السبب.",
  cancelled: "تم إلغاء هذا الطلب.",
  returned: "أُغلق الطلب كمرتجع.",
};

const STATUS_ICON: Record<string, string> = {
  pending: "clock",
  confirmed: "check-circle",
  preparing: "package",
  ready_for_delivery: "check",
  out_for_delivery: "truck",
  delivered: "check-circle",
  delivery_failed: "alert-triangle",
  cancelled: "x-circle",
  returned: "rotate-ccw",
};

function formatOrderDate(value: unknown) {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" })
    : "التاريخ غير متاح";
}

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || colors.muted;
  return (
    <View style={[pill.wrap, { backgroundColor: c + "1A", borderColor: c }]}>
      <View style={[pill.dot, { backgroundColor: c }]} />
      <T size={type.sm} weight="bold" color={c}>{STATUS_LABEL[status] || status || "حالة غير محددة"}</T>
    </View>
  );
}

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const cachedOrders = getCachedOrders();
  const [orders, setOrders] = useState<any[]>(cachedOrders || []);
  const [loading, setLoading] = useState(cachedOrders === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const o = await api.myOrders(force);
      setOrders(Array.isArray(o) ? o : []);
      setLoadError(null);
    } catch (e: any) {
      const message = e?.message || "تعذر تحميل الطلبات.";
      setLoadError(message);
      show(message, "error");
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [show]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const reorder = useCallback(async (id: string) => {
    if (reorderingId) return;
    setReorderingId(id);
    try {
      const result = await api.reorderOrder(id);
      const unavailable = Array.isArray(result.unavailable_items) ? result.unavailable_items : [];
      const message = unavailable.length
        ? "تمت إضافة " + (result.added_count || 0) + " قطعة إلى السلة، وتعذر إضافة " + unavailable.length + " منتج"
        : "تمت إعادة الطلب وإضافة المنتجات إلى السلة";
      show(message, unavailable.length ? "info" : "success");
      router.push("/cart");
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setReorderingId(null);
    }
  }, [reorderingId, router, show]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerCopy}>
          <T weight="displayBold" size={type.xl}>طلباتي</T>
          <T color={colors.muted} size={type.sm} style={styles.headerSubtitle}>تابع حالة طلبك وتفاصيل التوصيل</T>
        </View>
        {orders.length > 0 && (
          <View style={styles.countBadge}>
            <T weight="bold" size={type.sm} color={colors.brandPrimary}>{orders.length}</T>
          </View>
        )}
      </View>
      {loading && orders.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : orders.length === 0 && loadError ? (
        <View style={styles.center}>
          <View style={styles.emptyError}>
            <View style={styles.errorIcon}><Feather name="alert-circle" size={25} color={colors.error} /></View>
            <T weight="displayBold" size={type.lg}>تعذّر تحميل طلباتك</T>
            <T color={colors.muted} style={styles.errorCopy}>تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.</T>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setLoadError(null); setLoading(true); void load(true); }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
            >
              <Feather name="refresh-cw" size={16} color={colors.onBrandPrimary} />
              <T weight="bold" color={colors.onBrandPrimary}>إعادة المحاولة</T>
            </Pressable>
          </View>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="package" title="لا توجد طلبات بعد" subtitle="ابدأ التسوق لتظهر طلباتك هنا" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item, index) => String(item?.id ?? index)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => {
            const status = typeof item?.status === "string" ? item.status : "";
            const statusLabel = STATUS_LABEL[status] || "حالة غير محددة";
            const statusColor = STATUS_COLOR[status] || colors.muted;
            const orderNumber = String(item?.id ?? "").replace(/^ORD/, "") || "—";
            const itemCount = Array.isArray(item?.items) ? item.items.length : 0;
            const statusDescription = STATUS_DESCRIPTION[status] || "اضغط لمتابعة تفاصيل الطلب.";
            return (
              <Pressable
                testID={"order-" + String(item?.id ?? "")}
                accessibilityRole="button"
                accessibilityLabel={"تفاصيل الطلب رقم " + orderNumber + "، الحالة " + statusLabel}
                onPress={() => { if (item?.id) router.push(`/order/${item.id}`); }}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.orderMeta}>
                    <T weight="bold">طلب #{orderNumber}</T>
                  </View>
                  <StatusPill status={status} />
                </View>

                <View style={[styles.statusHero, { backgroundColor: statusColor + "0D", borderColor: statusColor + "35" }]}>
                  <View style={[styles.statusIcon, { backgroundColor: statusColor + "1A" }]}>
                    <Feather name={(STATUS_ICON[status] || "clock") as any} size={19} color={statusColor} />
                  </View>
                  <View style={styles.statusCopy}>
                    <T weight="bold" color={statusColor} numberOfLines={2}>{statusDescription}</T>
                    <T size={type.sm} color={colors.onSurfaceTertiary}>اضغط لمتابعة التفاصيل</T>
                  </View>
                  <Feather name="chevron-left" size={18} color={statusColor} />
                </View>

                {item?.agent_name ? (
                  <View style={styles.agentRow}>
                    <Feather name="truck" size={15} color={colors.brandPrimary} />
                    <T size={type.sm} weight="semi" color={colors.brandPrimary} numberOfLines={1}>
                      المندوب: {item.agent_name}{item.agent_phone ? " • " + item.agent_phone : ""}
                    </T>
                  </View>
                ) : null}
                {status === "delivery_failed" && item?.delivery_failed_reason ? (
                  <View style={styles.agentRow}>
                    <Feather name="alert-triangle" size={15} color={colors.error} />
                    <T size={type.sm} weight="semi" color={colors.error} numberOfLines={2}>سبب التعذر: {item.delivery_failed_reason}</T>
                  </View>
                ) : null}

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Feather name="shopping-bag" size={14} color={colors.muted} />
                    <T color={colors.muted} size={type.sm}>{itemCount} منتج</T>
                  </View>
                  <View style={styles.statItem}>
                    <Feather name="calendar" size={14} color={colors.muted} />
                    <T color={colors.muted} size={type.sm}>{formatOrderDate(item?.created_at)}</T>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  <View>
                    <T color={colors.muted} size={type.sm}>الإجمالي</T>
                    <T weight="displayBold" color={colors.brandPrimary} size={type.lg}>{formatPrice(item?.amount_due ?? item?.total ?? 0)}</T>
                  </View>
                  <View style={styles.trackRow}>
                    <T color={colors.brandPrimary} weight="bold" size={type.sm}>عرض التفاصيل</T>
                    <Feather name="arrow-left" size={16} color={colors.brandPrimary} />
                  </View>
                </View>

                <Pressable
                  testID={"reorder-" + String(item?.id ?? "")}
                  accessibilityRole="button"
                  onPress={(event) => { event.stopPropagation(); if (item?.id) void reorder(item.id); }}
                  disabled={reorderingId !== null}
                  style={({ pressed }) => [styles.reorderButton, pressed && styles.reorderButtonPressed, reorderingId !== null && reorderingId !== item?.id && styles.reorderButtonDisabled]}
                >
                  {reorderingId === item?.id ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Feather name="refresh-cw" size={16} color={colors.brandPrimary} />}
                  <T color={colors.brandPrimary} weight="bold" size={type.sm}>{reorderingId === item?.id ? "جارٍ تجهيز السلة..." : "إعادة الطلب"}</T>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCopy: { flex: 1, gap: 2 },
  headerSubtitle: { marginTop: 1 },
  countBadge: { minWidth: 34, height: 34, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  listContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["3xl"] },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  cardPressed: { opacity: 0.92, borderColor: colors.borderStrong },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  orderMeta: { flex: 1, gap: 3 },
  statusHero: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  statusIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  statusCopy: { flex: 1, gap: 2 },
  agentRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  statsRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  statItem: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  trackRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  reorderButton: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md },
  reorderButtonPressed: { opacity: 0.72 },
  reorderButtonDisabled: { opacity: 0.45 },
  emptyError: { width: "100%", alignItems: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  errorIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#F8EAEA", alignItems: "center", justifyContent: "center" },
  errorCopy: { textAlign: "center", maxWidth: 280 },
  retryButton: { minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.xs },
  retryPressed: { opacity: 0.8 },
});

const pill = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
