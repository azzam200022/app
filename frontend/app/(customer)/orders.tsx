import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { api, formatPrice, STATUS_LABEL } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export const STATUS_COLOR: Record<string, string> = {
  pending: "#C5A059",
  confirmed: "#3A5A40",
  preparing: "#4A524C",
  out_for_delivery: "#285C4D",
  delivered: "#1F4529",
  cancelled: "#8B3A3A",
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
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await api.myOrders();
      setOrders(o);
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <T weight="displayBold" size={type.xl}>طلباتي</T>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="package" title="لا توجد طلبات بعد" subtitle="ابدأ التسوق لتظهر طلباتك هنا" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable testID={`order-${item.id}`} onPress={() => router.push(`/order/${item.id}`)} style={styles.card}>
              <View style={styles.cardTop}>
                <T weight="bold">طلب #{item.id.replace("ORD", "")}</T>
                <StatusPill status={item.status} />
              </View>
              <View style={styles.cardRow}>
                <T color={colors.muted} size={type.sm}>{new Date(item.created_at).toLocaleDateString("ar-EG")}</T>
                <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
              </View>
              <View style={styles.cardBottom}>
                <T weight="displayBold" color={colors.brandPrimary} size={type.lg}>{formatPrice(item.total)}</T>
                <View style={styles.trackRow}>
                  <T color={colors.brandPrimary} weight="semi" size={type.sm}>تتبّع الطلب</T>
                  <Feather name="chevron-left" size={16} color={colors.brandPrimary} />
                </View>
              </View>
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
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  trackRow: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
});

const pill = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
