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

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || colors.muted;
  return (
    <View style={[pill.wrap, { backgroundColor: c + "1A", borderColor: c }]}>
      <View style={[pill.dot, { backgroundColor: c }]} />
      <T size={type.sm} weight="bold" color={c}>{STATUS_LABEL[status] || status}</T>
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
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const o = await api.myOrders(force);
      setOrders(o);
    } catch (e: any) { show(e.message, "error"); }
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
        <T weight="displayBold" size={type.xl}>طلباتي</T>
      </View>
      {loading && orders.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="package" title="لا توجد طلبات بعد" subtitle="ابدأ التسوق لتظهر طلباتك هنا" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable testID={`order-${item.id}`} onPress={() => router.push(`/order/${item.id}`)} style={styles.card}>
              <View style={styles.cardTop}>
                <T weight="bold">طلب #{item.id.replace("ORD", "")}</T>
                <StatusPill status={item.status} />
              </View>
              {item.agent_name ? <View style={styles.agentRow}><Feather name="truck" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>المندوب: {item.agent_name}{item.agent_phone ? " • " + item.agent_phone : ""}</T></View> : null}
              {item.status === "delivery_failed" && item.delivery_failed_reason ? <View style={styles.agentRow}><Feather name="alert-triangle" size={14} color={colors.error} /><T size={type.sm} weight="semi" color={colors.error}>سبب التعذر: {item.delivery_failed_reason}</T></View> : null}
              <View style={styles.cardRow}>
                <T color={colors.muted} size={type.sm}>{new Date(item.created_at).toLocaleDateString("ar-EG")}</T>
                <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
              </View>
              <View style={styles.cardBottom}>
                <T weight="displayBold" color={colors.brandPrimary} size={type.lg}>{formatPrice(item.amount_due ?? item.total)}</T>
                <View style={styles.trackRow}>
                  <T color={colors.brandPrimary} weight="semi" size={type.sm}>تتبّع الطلب</T>
                  <Feather name="chevron-left" size={16} color={colors.brandPrimary} />
                </View>
              </View>
              <Pressable
                testID={"reorder-" + item.id}
                onPress={(event) => { event.stopPropagation(); void reorder(item.id); }}
                disabled={reorderingId !== null}
                style={({ pressed }) => [styles.reorderButton, pressed && styles.reorderButtonPressed, reorderingId !== null && reorderingId !== item.id && styles.reorderButtonDisabled]}
              >
                {reorderingId === item.id ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Feather name="refresh-cw" size={16} color={colors.brandPrimary} />}
                <T color={colors.brandPrimary} weight="bold" size={type.sm}>{reorderingId === item.id ? "جارٍ تجهيز السلة..." : "إعادة الطلب"}</T>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  agentRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  trackRow: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  reorderButton: { minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md },
  reorderButtonPressed: { opacity: 0.72 },
  reorderButtonDisabled: { opacity: 0.45 },
});

const pill = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
