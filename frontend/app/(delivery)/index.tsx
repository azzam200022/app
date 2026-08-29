import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { api, formatPrice } from "@/src/lib/api";
import { staticMapUrl, openDirections } from "@/src/lib/maps";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function DeliveryHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await api.deliveryOrders()); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); setRefreshing(false); }
  }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markDelivered = async (id: string) => {
    try { await api.deliverySetStatus(id, "delivered"); show("تم تسجيل التوصيل 🎉"); load(); } catch (e: any) { show(e.message, "error"); }
  };

  const active = orders.filter((o) => o.status === "out_for_delivery");
  const done = orders.filter((o) => o.status === "delivered");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View>
            <T color="rgba(255,255,255,0.75)" size={type.sm}>مندوب التوصيل</T>
            <T weight="displayBold" size={type["2xl"]} color="#fff">{user?.name}</T>
          </View>
          <Pressable testID="del-logout" onPress={async () => { await logout(); router.replace("/login"); }} style={styles.iconBtn}>
            <Feather name="log-out" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><T weight="displayBold" size={type.xl} color="#fff">{active.length}</T><T color="rgba(255,255,255,0.75)" size={type.sm}>قيد التوصيل</T></View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}><T weight="displayBold" size={type.xl} color="#fff">{done.length}</T><T color="rgba(255,255,255,0.75)" size={type.sm}>تم توصيلها</T></View>
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="package" title="لا توجد طلبات حالياً" subtitle="ستظهر الطلبات المسندة إليك هنا" /></View>
      ) : (
        <FlatList data={orders} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`del-order-${item.id}`}>
              <View style={styles.cardTop}>
                <T weight="bold">#{item.id.replace("ORD", "")}</T>
                <StatusPill status={item.status} />
              </View>
              <View style={styles.info}><Feather name="user" size={14} color={colors.muted} /><T size={type.sm}>{item.customer_name}</T></View>
              <Pressable style={styles.info} onPress={() => Linking.openURL(`tel:${item.phone}`)}><Feather name="phone" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>{item.phone}</T></Pressable>
              <View style={styles.info}><Feather name="map-pin" size={14} color={colors.muted} /><T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1 }}>{item.address}</T></View>
              <View style={styles.cardBottom}>
                <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
                <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(item.total)} • نقداً</T>
              </View>
              {item.location ? (
                <Pressable testID={`map-${item.id}`} onPress={() => openDirections(item.location.lat, item.location.lng, item.address)} style={styles.mapPreview}>
                  <Image source={{ uri: staticMapUrl(item.location.lat, item.location.lng, 600, 200) }} style={styles.mapImg} contentFit="cover" />
                  <View style={styles.mapPill}><Feather name="navigation" size={13} color="#fff" /><T size={type.sm} weight="bold" color="#fff">فتح الملاحة</T></View>
                </Pressable>
              ) : null}
              <View style={styles.navRow}>
                <Pressable testID={`nav-${item.id}`} onPress={() => openDirections(item.location?.lat, item.location?.lng, item.address)} style={styles.navBtn}>
                  <Feather name="map" size={16} color={colors.brandPrimary} />
                  <T size={type.sm} weight="bold" color={colors.brandPrimary}>التوصيل عبر الخرائط</T>
                </Pressable>
              </View>
              {item.status === "out_for_delivery" && (
                <Button title="تأكيد التوصيل واستلام المبلغ" icon="check-circle" onPress={() => markDelivered(item.id)} testID={`deliver-${item.id}`} style={{ marginTop: spacing.sm, minHeight: 46 }} />
              )}
            </View>
          )} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  statBox: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.2)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  info: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  mapPreview: { marginTop: spacing.md, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mapImg: { width: "100%", height: 130, backgroundColor: colors.surfaceSecondary },
  mapPill: { position: "absolute", bottom: spacing.sm, insetInlineEnd: spacing.sm, flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  navRow: { marginTop: spacing.sm },
  navBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
});
