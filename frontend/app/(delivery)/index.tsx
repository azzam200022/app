import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Linking, Modal } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { api, formatPrice, resolveImage } from "@/src/lib/api";
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
  const [tab, setTab] = useState<"active" | "done">("active");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await api.deliveryOrders()); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); setRefreshing(false); }
  }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markDelivered = async (id: string) => {
    try { await api.deliverySetStatus(id, "delivered"); show("تم تسجيل التوصيل 🎉"); load(); } catch (e: any) { show(e.message, "error"); }
  };

  const isToday = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.toDateString() === n.toDateString(); };
  const active = orders.filter((o) => o.status === "out_for_delivery").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const done = orders.filter((o) => o.status === "delivered").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const collectedToday = done.filter((o) => isToday(o.created_at)).reduce((s, o) => s + (o.total || 0), 0);
  const list = tab === "active" ? active : done;

  const doLogout = async () => { setConfirmLogout(false); await logout(); router.replace("/login"); };

  const renderCard = ({ item }: any) => (
    <View style={styles.card} testID={`del-order-${item.id}`}>
      <View style={styles.cardTop}>
        <T weight="bold">#{item.id.replace("ORD", "")}</T>
        <StatusPill status={item.status} />
      </View>
      <View style={styles.info}><Feather name="user" size={14} color={colors.muted} /><T size={type.sm}>{item.customer_name}</T></View>
      <Pressable style={styles.info} onPress={() => Linking.openURL(`tel:${item.phone}`)}><Feather name="phone" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>{item.phone}</T></Pressable>
      <View style={styles.info}><Feather name="map-pin" size={14} color={colors.muted} /><T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1 }}>{item.address}</T></View>

      {/* Items thumbnails */}
      <View style={styles.thumbs}>
        {item.items.slice(0, 4).map((it: any, i: number) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri: resolveImage(it.image_url) }} style={styles.thumb} contentFit="cover" />
            {it.quantity > 1 && <View style={styles.qtyTag}><T size={10} weight="bold" color="#fff">{it.quantity}</T></View>}
          </View>
        ))}
        {item.items.length > 4 && <View style={[styles.thumbWrap, styles.moreThumb]}><T size={type.sm} weight="bold" color={colors.brandPrimary}>+{item.items.length - 4}</T></View>}
      </View>

      <View style={styles.cardBottom}>
        <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
        <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(item.total)} • نقداً</T>
      </View>

      {item.location ? (
        <Pressable testID={`map-${item.id}`} onPress={() => openDirections(item.location.lat, item.location.lng, item.address)} style={styles.mapPreview}>
          <Image source={{ uri: staticMapUrl(item.location.lat, item.location.lng, 600, 200) }} style={styles.mapImg} contentFit="cover" />
          <View style={styles.mapPill}><Feather name="navigation" size={13} color="#fff" /><T size={type.sm} weight="bold" color="#fff">تتبّع على الخريطة</T></View>
        </Pressable>
      ) : null}

      <View style={styles.navRow}>
        <Pressable testID={`nav-${item.id}`} onPress={() => openDirections(item.location?.lat, item.location?.lng, item.address)} style={styles.navBtn}>
          <Feather name="map" size={16} color={colors.brandPrimary} />
          <T size={type.sm} weight="bold" color={colors.brandPrimary}>{item.location ? "التوصيل عبر الخرائط" : "بحث عن العنوان في الخرائط"}</T>
        </Pressable>
      </View>
      {item.status === "out_for_delivery" && (
        <Button title="تأكيد التوصيل واستلام المبلغ" icon="check-circle" onPress={() => markDelivered(item.id)} testID={`deliver-${item.id}`} style={{ marginTop: spacing.sm, minHeight: 46 }} />
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <View>
            <T color="rgba(255,255,255,0.75)" size={type.sm}>مندوب التوصيل</T>
            <T weight="displayBold" size={type["2xl"]} color="#fff">{user?.name}</T>
          </View>
          <Pressable testID="del-logout" onPress={() => setConfirmLogout(true)} style={styles.iconBtn}>
            <Feather name="log-out" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><T weight="displayBold" size={type.xl} color="#fff">{active.length}</T><T color="rgba(255,255,255,0.75)" size={type.sm}>قيد التوصيل</T></View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}><T weight="displayBold" size={type.xl} color="#fff">{done.length}</T><T color="rgba(255,255,255,0.75)" size={type.sm}>تم توصيلها</T></View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}><T weight="displayBold" size={type.lg} color={colors.gold}>{formatPrice(collectedToday)}</T><T color="rgba(255,255,255,0.75)" size={type.sm}>محصّل اليوم</T></View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable testID="tab-active" onPress={() => setTab("active")} style={[styles.tab, tab === "active" && styles.tabActive]}>
          <T weight="bold" color={tab === "active" ? "#fff" : colors.onSurfaceSecondary}>نشطة ({active.length})</T>
        </Pressable>
        <Pressable testID="tab-done" onPress={() => setTab("done")} style={[styles.tab, tab === "done" && styles.tabActive]}>
          <T weight="bold" color={tab === "done" ? "#fff" : colors.onSurfaceSecondary}>مكتملة ({done.length})</T>
        </Pressable>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : list.length === 0 ? (
        <View style={styles.center}><EmptyState icon={tab === "active" ? "package" : "check-circle"} title={tab === "active" ? "لا توجد طلبات نشطة" : "لا توجد طلبات مكتملة"} subtitle={tab === "active" ? "ستظهر الطلبات المسندة إليك هنا" : "الطلبات التي توصّلها ستظهر هنا"} /></View>
      ) : (
        <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={renderCard} />
      )}

      {/* Logout confirmation */}
      <Modal visible={confirmLogout} transparent animationType="fade" onRequestClose={() => setConfirmLogout(false)}>
        <Pressable style={styles.modalBg} onPress={() => setConfirmLogout(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIcon}><Feather name="log-out" size={24} color={colors.error} /></View>
            <T weight="displayBold" size={type.xl} style={{ textAlign: "center", marginTop: spacing.md }}>تأكيد تسجيل الخروج</T>
            <T color={colors.muted} style={{ textAlign: "center", marginTop: spacing.xs }}>هل أنت متأكد أنك تريد الخروج من حسابك؟</T>
            <View style={styles.modalBtns}>
              <Button title="خروج" variant="primary" onPress={doLogout} testID="confirm-logout" style={{ flex: 1, backgroundColor: colors.error }} />
              <Button title="إلغاء" variant="secondary" onPress={() => setConfirmLogout(false)} testID="cancel-logout" style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  tabs: { flexDirection: "row-reverse", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  tab: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  info: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  thumbs: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.sm },
  thumbWrap: { width: 48, height: 48, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  thumb: { width: "100%", height: "100%" },
  qtyTag: { position: "absolute", top: 0, insetInlineStart: 0, backgroundColor: colors.brandPrimary, borderBottomEndRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  moreThumb: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandTertiary },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  mapPreview: { marginTop: spacing.md, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mapImg: { width: "100%", height: 130, backgroundColor: colors.surfaceSecondary },
  mapPill: { position: "absolute", bottom: spacing.sm, insetInlineEnd: spacing.sm, flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  navRow: { marginTop: spacing.sm },
  navBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  modalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#F5E9E9", alignItems: "center", justifyContent: "center" },
  modalBtns: { flexDirection: "row-reverse", gap: spacing.md, marginTop: spacing.xl, width: "100%" },
});

