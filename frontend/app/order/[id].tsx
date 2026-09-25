import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, getCachedOrders, resolveImage, formatPrice, STATUS_LABEL, STATUS_FLOW } from "@/src/lib/api";
import { printOrder } from "@/src/lib/receipt";
import { staticMapUrl, staticMapUrlTwo, openDirections } from "@/src/lib/maps";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function OrderDetail() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const { user } = useAuth();
  const cachedOrder = getCachedOrders()?.find((item: any) => item.id === id);
  const [order, setOrder] = useState<any>(cachedOrder || null);
  const [loading, setLoading] = useState(!cachedOrder);
  const [loadError, setLoadError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canPrint = user?.role === "manager";

  const goBack = () => {
    if (router.canGoBack()) { router.back(); return; }
    router.replace(user?.role === "manager" ? "/(manager)/orders" : user?.role === "delivery" ? "/(delivery)" : "/(customer)/orders");
  };

  const load = async (force = false) => {
    try {
      const result = await api.order(id!, force);
      if (!result) throw new Error("تعذر العثور على الطلب");
      setOrder(result);
      setLoadError(false);
    } catch (e: any) {
      setLoadError(true);
      if (order) show(e?.message || "تعذر تحديث الطلب", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  // live refresh while out for delivery (tracks agent location)
  useEffect(() => {
    if (!order || order.status !== "out_for_delivery") return;
    const iv = setInterval(async () => { try { setOrder(await api.order(id!, true)); } catch {} }, 15000);
    return () => clearInterval(iv);
  }, [order?.status, id]);

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try { await api.cancelOrder(id!); show("تم إلغاء الطلب"); void load(true); } catch (e: any) { show(e.message, "error"); } finally { setCancelling(false); }
  };

  if (loading && !order) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;

  if (!order) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable testID="od-back-error" onPress={goBack} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
          <T weight="displayBold" size={type.xl}>تفاصيل الطلب</T>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorState}>
          <View style={styles.errorIcon}><Feather name={loadError ? "alert-circle" : "package"} size={26} color={colors.error} /></View>
          <T weight="displayBold" size={type.lg}>تعذّر تحميل تفاصيل الطلب</T>
          <T color={colors.muted} style={styles.errorCopy}>تحقق من اتصالك بالإنترنت ثم أعد المحاولة.</T>
          <Button title="إعادة المحاولة" icon="refresh-cw" onPress={() => { setLoading(true); void load(true); }} style={styles.retryButton} />
        </View>
      </View>
    );
  }

  const cancelled = order.status === "cancelled";
  const failed = order.status === "delivery_failed";
  const returned = order.status === "returned";
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const STATUS_ICON: Record<string, any> = { pending: "clock", confirmed: "check-circle", preparing: "package", ready_for_delivery: "check", out_for_delivery: "truck", delivered: "home" };
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const orderNumber = String(order.id ?? id ?? "").replace(/^ORD/, "");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="od-back" onPress={goBack} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <T weight="displayBold" size={type.xl}>طلب #{orderNumber}</T>
        {canPrint ? (
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
          ) : failed ? (
            <View style={styles.cancelRow}>
              <Feather name="alert-triangle" size={20} color={colors.error} />
              <View style={{ flex: 1 }}>
                <T weight="bold" color={colors.error}>تعذر التسليم</T>
                {order.delivery_failed_reason ? <T size={type.sm} color={colors.error} style={{ marginTop: spacing.xs }}>السبب: {order.delivery_failed_reason}</T> : null}
              </View>
            </View>
          ) : returned ? (
            <View style={styles.cancelRow}><Feather name="rotate-ccw" size={20} color={colors.error} /><T weight="bold" color={colors.error}>تم إغلاق الطلب بسبب المرتجع الكامل</T></View>
          ) : (
            <>
              <View style={styles.stepsRow}>
                {STATUS_FLOW.map((st, i) => {
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  return (
                    <View key={st} style={styles.horizontalStep} accessible accessibilityLabel={STATUS_LABEL[st]}>
                      <View style={styles.horizontalNodeRow}>
                        <View style={[styles.horizontalDot, done ? styles.dotDone : styles.dotIdle, active && styles.dotActive]}>
                          <Feather name={STATUS_ICON[st] || "circle"} size={14} color={done ? "#fff" : colors.muted} />
                        </View>
                        {i < STATUS_FLOW.length - 1 ? <View style={[styles.horizontalConnector, done && i < currentIdx ? styles.connectorDone : null]} /> : <View style={styles.horizontalConnectorPlaceholder} />}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.currentStatus}>
                <View style={styles.currentStatusIcon}><Feather name="check-circle" size={18} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <T size={type.xs} color={colors.brandPrimary} weight="bold">الحالة الحالية</T>
                  <T weight="bold">{STATUS_LABEL[order.status]}</T>
                </View>
              </View>
            </>
          )}
          {order.agent_name && <View style={styles.agentRow}><Feather name="truck" size={16} color={colors.brandPrimary} /><T size={type.sm} weight="semi">المندوب: {order.agent_name}{order.agent_phone ? " • " + order.agent_phone : ""}</T></View>}
        </View>

        {user?.role === "customer" && order.delivery_otp && !["delivered", "returned", "cancelled"].includes(order.status) && (
          <View style={styles.otpCard}>
            <View style={styles.otpHeader}><Feather name="shield" size={20} color={colors.brandPrimary} /><T weight="bold" color={colors.brandPrimary}>رمز استلام الطلب</T></View>
            <T size={type.sm} color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xs }}>احتفظ بالرمز وأعطه للمندوب عند استلام طلبك</T>
            <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.otpValue}>{order.delivery_otp}</T>
          </View>
        )}

        {/* Items */}
        <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>المنتجات</T>
        <View style={styles.itemsCard}>
          {orderItems.map((it: any, idx: number) => (
            <View key={it.product_id} style={[styles.item, idx < orderItems.length - 1 && styles.itemBorder]}>
              <Image source={{ uri: resolveImage(it.image_url) }} style={styles.itemImg} contentFit="cover" cachePolicy="memory-disk" />
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
          <View style={styles.infoRow}><Feather name="user" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary}>{order.customer_name}</T></View>
          <View style={styles.infoRow}><Feather name="phone" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary}>{order.phone}</T></View>
          <View style={styles.infoRow}><Feather name="map-pin" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary} style={{ flex: 1 }}>{order.address}</T></View>
          {order.area && <View style={styles.infoRow}><Feather name="map" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary}>{order.area}</T></View>}
          {order.notes ? <View style={styles.infoRow}><Feather name="message-square" size={16} color={colors.muted} /><T color={colors.onSurfaceTertiary} style={{ flex: 1 }}>{order.notes}</T></View> : null}
          <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs }]}>
            <T weight="bold">الإجمالي (دفع عند الاستلام)</T>
            <T weight="displayBold" size={type.lg} color={colors.brandPrimary}>{formatPrice(order.amount_due ?? order.total)}</T>
          </View>
          {Number(order.returned_total || 0) > 0 && (
            <View style={styles.infoRow}>
              <T color={colors.muted}>قيمة المرتجع</T>
              <T color={colors.error}>{formatPrice(order.returned_total)}</T>
            </View>
          )}
        </View>

        {order.location ? (
          <Pressable testID="od-map" onPress={() => openDirections(order.location.lat, order.location.lng, order.address)} style={styles.mapCard}>
            <Image source={{ uri: staticMapUrl(order.location.lat, order.location.lng, 600, 220) }} style={styles.mapImg} contentFit="cover" />
            <View style={styles.mapFoot}><Feather name="navigation" size={15} color={colors.brandPrimary} /><T weight="bold" size={type.sm} color={colors.brandPrimary}>موقع التوصيل المحدد — فتح في الخرائط</T></View>
          </Pressable>
        ) : null}

        {order.status === "out_for_delivery" && order.agent_location && order.location ? (
          <View style={styles.mapCard}>
            <View style={styles.liveBadge}><View style={styles.liveDot} /><T size={type.sm} weight="bold" color="#fff">تتبّع مباشر</T></View>
            <Image source={{ uri: staticMapUrlTwo(order.location.lat, order.location.lng, order.agent_location.lat, order.agent_location.lng, 600, 240) }} style={styles.mapImg} contentFit="cover" />
            <View style={styles.mapFoot}><Feather name="truck" size={15} color={colors.brandPrimary} /><T weight="bold" size={type.sm} color={colors.brandPrimary}>مندوبك {order.agent_name || ""} في الطريق إليك الآن</T></View>
          </View>
        ) : null}

        {user?.role === "customer" && (order.status === "pending" || order.status === "confirmed") && (
          <Button title={cancelling ? "جارٍ إلغاء الطلب..." : "إلغاء الطلب"} variant="outline" icon="x" onPress={cancel} loading={cancelling} disabled={cancelling} testID="od-cancel" style={{ marginTop: spacing.lg, borderColor: colors.error }} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  errorIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#F8EAEA", alignItems: "center", justifyContent: "center" },
  errorCopy: { textAlign: "center", maxWidth: 290 },
  retryButton: { marginTop: spacing.xs, minWidth: 190 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  successBox: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#E7F0EC", borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg },
  timelineCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stepsRow: { flexDirection: "row-reverse", alignItems: "flex-start", width: "100%", paddingVertical: spacing.sm },
  horizontalStep: { flex: 1, minWidth: 0, alignItems: "stretch" },
  horizontalNodeRow: { height: 32, flexDirection: "row-reverse", alignItems: "center" },
  horizontalDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", zIndex: 1 },
  dotIdle: { backgroundColor: colors.surfaceTertiary },
  dotDone: { backgroundColor: colors.brandPrimary },
  dotActive: { borderWidth: 3, borderColor: colors.brandTertiary },
  horizontalConnector: { flex: 1, height: 2, backgroundColor: colors.surfaceTertiary },
  horizontalConnectorPlaceholder: { flex: 1, height: 2, backgroundColor: "transparent" },
  connectorDone: { backgroundColor: colors.brandPrimary },
  currentStatus: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.md },
  currentStatusIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  agentRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  cancelRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  itemsCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, padding: spacing.md },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  infoCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.lg, gap: spacing.md },
  otpCard: { backgroundColor: "#E7F0EC", borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiary, padding: spacing.lg, marginBottom: spacing.lg },
  otpHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  otpValue: { textAlign: "center", letterSpacing: 8, marginTop: spacing.md },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, justifyContent: "space-between" },
  mapCard: { marginTop: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  mapImg: { width: "100%", height: 150, backgroundColor: colors.surfaceSecondary },
  mapFoot: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  liveBadge: { position: "absolute", top: spacing.sm, insetInlineEnd: spacing.sm, zIndex: 2, flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.error, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
});
