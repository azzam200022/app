import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, resolveImage, formatPrice, STATUS_LABEL, STATUS_FLOW } from "@/src/lib/api";
import { printOrder } from "@/src/lib/receipt";
import { staticMapUrl, openDirections } from "@/src/lib/maps";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function OrderDetail() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setOrder(await api.order(id!)); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const cancel = async () => {
    try { await api.cancelOrder(id!); show("تم إلغاء الطلب"); load(); } catch (e: any) { show(e.message, "error"); }
  };

  if (loading || !order) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;

  const cancelled = order.status === "cancelled";
  const currentIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="od-back" onPress={() => router.canGoBack() ? router.back() : router.replace("/(customer)/orders")} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <T weight="displayBold" size={type.xl}>طلب #{order.id.replace("ORD", "")}</T>
        {user?.role === "manager" ? (
          <Pressable testID="od-print" onPress={async () => { try { await printOrder(order); } catch { show("تعذّرت الطباعة", "error"); } }} hitSlop={10} style={styles.back}>
            <Feather name="printer" size={20} color={colors.brandPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        {isNew === "1" && (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={26} color={colors.success} />
            <View style={{ flex: 1 }}>
              <T weight="bold" color={colors.success}>تم استلام طلبك بنجاح!</T>
              <T color={colors.onSurfaceTertiary} size={type.sm}>سنبدأ تجهيزه على الفور</T>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>حالة الطلب</T>
          {cancelled ? (
            <View style={styles.cancelRow}><Feather name="x-circle" size={20} color={colors.error} /><T weight="bold" color={colors.error}>تم إلغاء الطلب</T></View>
          ) : (
            STATUS_FLOW.map((st, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              return (
                <View key={st} style={styles.step}>
                  <View style={styles.stepIndicator}>
                    <View style={[styles.dot, done ? styles.dotDone : styles.dotIdle, active && styles.dotActive]}>
                      {done && <Feather name="check" size={12} color="#fff" />}
                    </View>
                    {i < STATUS_FLOW.length - 1 && <View style={[styles.connector, done && i < currentIdx ? styles.connectorDone : null]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.lg }}>
                    <T weight={active ? "bold" : "semi"} color={done ? colors.onSurface : colors.muted}>{STATUS_LABEL[st]}</T>
                    {active && <T size={type.sm} color={colors.brandPrimary}>الحالة الحالية</T>}
                  </View>
                </View>
              );
            })
          )}
          {order.agent_name && <View style={styles.agentRow}><Feather name="truck" size={16} color={colors.brandPrimary} /><T size={type.sm} weight="semi">المندوب: {order.agent_name}</T></View>}
        </View>

        {/* Items */}
        <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>المنتجات</T>
        <View style={styles.itemsCard}>
          {order.items.map((it: any, idx: number) => (
            <View key={it.product_id} style={[styles.item, idx < order.items.length - 1 && styles.itemBorder]}>
              <Image source={{ uri: resolveImage(it.image_url) }} style={styles.itemImg} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <T weight="semi" numberOfLines={2}>{it.name}</T>
                <T color={colors.muted} size={type.sm}>{it.quantity} × {formatPrice(it.price)}</T>
              </View>
              <T weight="bold" color={colors.brandPrimary}>{formatPrice(it.line_total)}</T>
            </View>
          ))}
        </View>

        {/* Address & total */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}><Feather name="map-pin" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary} style={{ flex: 1 }}>{order.address}</T></View>
          <View style={styles.infoRow}><Feather name="phone" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary}>{order.phone}</T></View>
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs }]}>
            <T weight="bold">الإجمالي (دفع عند الاستلام)</T>
            <T weight="displayBold" size={type.lg} color={colors.brandPrimary}>{formatPrice(order.total)}</T>
          </View>
        </View>

        {order.location ? (
          <Pressable testID="od-map" onPress={() => openDirections(order.location.lat, order.location.lng, order.address)} style={styles.mapCard}>
            <Image source={{ uri: staticMapUrl(order.location.lat, order.location.lng, 600, 220) }} style={styles.mapImg} contentFit="cover" />
            <View style={styles.mapFoot}><Feather name="navigation" size={15} color={colors.brandPrimary} /><T weight="bold" size={type.sm} color={colors.brandPrimary}>موقع التوصيل المحدد — فتح في الخرائط</T></View>
          </Pressable>
        ) : null}

        {(order.status === "pending" || order.status === "confirmed") && (
          <Button title="إلغاء الطلب" variant="outline" icon="x" onPress={cancel} testID="od-cancel" style={{ marginTop: spacing.lg, borderColor: colors.error }} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  successBox: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#E7F0EC", borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg },
  timelineCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  step: { flexDirection: "row-reverse", gap: spacing.md },
  stepIndicator: { alignItems: "center", width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dotIdle: { backgroundColor: colors.surfaceTertiary },
  dotDone: { backgroundColor: colors.brandPrimary },
  dotActive: { borderWidth: 3, borderColor: colors.brandTertiary },
  connector: { width: 2, flex: 1, backgroundColor: colors.surfaceTertiary, marginVertical: 2 },
  connectorDone: { backgroundColor: colors.brandPrimary },
  agentRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  cancelRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  itemsCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, padding: spacing.md },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  infoCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.lg, gap: spacing.md },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, justifyContent: "space-between" },
  mapCard: { marginTop: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  mapImg: { width: "100%", height: 150, backgroundColor: colors.surfaceSecondary },
  mapFoot: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.md },
});
