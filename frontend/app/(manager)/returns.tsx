import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { api, formatPrice } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "full", label: "فاتورة كاملة" },
  { key: "partial", label: "مرتجع جزئي" },
];

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function ManagerReturns() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [returns, setReturns] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setReturns(await api.adminReturns());
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(
    () => filter === "all" ? returns : returns.filter((item) => item.return_type === filter),
    [returns, filter],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="returns-back" onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-right" size={20} color={colors.brandPrimary} />
          </Pressable>
          <View style={styles.titleCopy}>
            <T weight="displayBold" size={type.xl}>المرتجعات</T>
            <T color={colors.muted} size={type.sm}>متابعة مرتجعات الزبائن والمندوبين</T>
          </View>
          <View style={styles.headerIcon}><Feather name="rotate-ccw" size={20} color={colors.brandPrimary} /></View>
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((item) => (
            <Pressable key={item.key} testID={"return-filter-" + item.key} onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.filterActive]}>
              <T size={type.sm} weight="bold" color={filter === item.key ? "#fff" : colors.onSurfaceSecondary}>{item.label}</T>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : visible.length === 0 ? (
        <View style={styles.center}><EmptyState icon="rotate-ccw" title="لا توجد مرتجعات" subtitle="ستظهر هنا المرتجعات التي يسجلها المندوبون" /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={"return-card-" + item.id}>
              <View style={styles.cardTop}>
                <View style={styles.idBlock}>
                  <T weight="bold">{item.id}</T>
                  <T color={colors.muted} size={type.sm}>طلب #{String(item.order_id || "").replace("ORD", "")}</T>
                </View>
                <View style={[styles.typePill, item.return_type === "full" ? styles.fullPill : styles.partialPill]}>
                  <T size={11} weight="bold" color={item.return_type === "full" ? colors.brandPrimary : "#A15C00"}>{item.return_type === "full" ? "فاتورة كاملة" : "مرتجع جزئي"}</T>
                </View>
              </View>
              <View style={styles.info}><Feather name="user" size={15} color={colors.muted} /><T size={type.sm}>{item.customer_name || "زبون غير معروف"}</T></View>
              <View style={styles.info}><Feather name="truck" size={15} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>المندوب: {item.agent_name || "غير معروف"}</T></View>
              <View style={styles.itemsBox}>
                {(item.items || []).map((line: any) => (
                  <View key={line.product_id} style={styles.itemRow}>
                    <T size={type.sm} numberOfLines={1} style={{ flex: 1 }}>{line.name}</T>
                    <T size={type.sm} color={colors.muted}>× {line.quantity}</T>
                    <T size={type.sm} weight="semi">{formatPrice(line.line_total)}</T>
                  </View>
                ))}
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.info}><Feather name="clock" size={14} color={colors.muted} /><T size={11} color={colors.muted}>{formatDate(item.created_at)}</T></View>
                <T weight="displayBold" color={colors.error}>{formatPrice(item.total)}</T>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: "#fff", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  titleCopy: { flex: 1, alignItems: "flex-end" },
  headerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  filter: { flex: 1, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  filterActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  idBlock: { alignItems: "flex-end", gap: 2 },
  typePill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  fullPill: { backgroundColor: colors.brandTertiary },
  partialPill: { backgroundColor: "#FFF3E0" },
  info: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  itemsBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs },
  itemRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
});