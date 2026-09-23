import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Linking, Modal, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import * as Location from "expo-location";
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
import { useEffect } from "react";

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}


const DELIVERY_NAV = [
  { key: "summary" as const, label: "الملخص", icon: "grid" },
  { key: "orders" as const, label: "الطلبات", icon: "package" },
  { key: "returns" as const, label: "المرتجعات", icon: "rotate-ccw" },
  { key: "account" as const, label: "الحساب", icon: "credit-card" },
];

const DELIVERY_FAILURE_REASONS = [
  { value: "customer_unavailable", label: "العميل غير موجود" },
  { value: "phone_unreachable", label: "الهاتف مغلق أو لا يجيب" },
  { value: "invalid_address", label: "العنوان غير صحيح" },
  { value: "customer_refused", label: "رفض العميل الاستلام" },
];

export default function DeliveryHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [dailySummary, setDailySummary] = useState<any>({ orders_count: 0, invoices_total: 0, earnings: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<"summary" | "orders" | "returns" | "account">("summary");
  const [orderTab, setOrderTab] = useState<"available" | "active" | "done">("available");
  const [returnRecords, setReturnRecords] = useState<any[]>([]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<any>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [failureFor, setFailureFor] = useState<any>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [failureSubmitting, setFailureSubmitting] = useState(false);
  const [proofFor, setProofFor] = useState<any>(null);
  const [proofOtp, setProofOtp] = useState("");
  const [proofSubmitting, setProofSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextOrders, nextSummary, nextReturns] = await Promise.all([
        api.deliveryOrders(),
        api.deliverySummary(getLocalDateKey(), new Date().getTimezoneOffset()),
        api.deliveryReturns(),
      ]);
      setOrders(nextOrders);
      setDailySummary(nextSummary);
      setReturnRecords(nextReturns || []);
    } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); setRefreshing(false); }
  }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openProof = (order: any) => { setProofFor(order); setProofOtp(""); };

  const submitProof = async () => {
    if (!proofFor) return;
    const otp = proofOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      show("أدخل رمز التسليم المكوّن من 6 أرقام", "error");
      return;
    }
    setProofSubmitting(true);
    try {
      await api.deliverySetStatus(proofFor.id, "delivered", undefined, otp);
      show("تم التحقق وتسجيل التوصيل 🎉");
      setProofFor(null);
      setProofOtp("");
      await load();
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setProofSubmitting(false);
    }
  };

  const submitFailure = async () => {
    if (!failureFor || !failureReason) {
      show("اختر سبب تعذر التسليم", "error");
      return;
    }
    setFailureSubmitting(true);
    try {
      await api.deliverySetStatus(failureFor.id, "delivery_failed", failureReason);
      show("تم تسجيل تعذر التسليم");
      setFailureFor(null);
      setFailureReason(null);
      await load();
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setFailureSubmitting(false);
    }
  };

  const claimOrder = async (id: string) => {
    if (claiming) return;
    setClaiming(id);
    try {
      await api.deliveryClaim(id);
      show("تم استلام الطلب بنجاح");
      setOrderTab("active");
      await load();
    } catch (e: any) {
      show(e.message, "error");
      await load();
    } finally {
      setClaiming(null);
    }
  };

  const openReturn = (order: any) => {
    if (order.status !== "out_for_delivery") {
      show("يجب تسجيل المرتجع قبل تأكيد التسليم", "error");
      return;
    }
    setReturnFor(order);
    setReturnQuantities(Object.fromEntries(order.items.map((item: any) => [item.product_id, 0])));
  };

  const adjustReturnQuantity = (productId: string, delta: number) => {
    const source = returnFor?.items.find((item: any) => item.product_id === productId);
    if (!source) return;
    setReturnQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(source.quantity, (current[productId] || 0) + delta)),
    }));
  };

  const selectAllReturnQuantities = () => {
    if (!returnFor) return;
    setReturnQuantities(Object.fromEntries(returnFor.items.map((item: any) => [item.product_id, item.quantity])));
  };

  const submitReturn = async () => {
    if (!returnFor) return;
    const items = returnFor.items
      .filter((item: any) => (returnQuantities[item.product_id] || 0) > 0)
      .map((item: any) => ({ product_id: item.product_id, quantity: returnQuantities[item.product_id] }));
    if (!items.length) {
      show("حدد كمية منتج واحد على الأقل", "error");
      return;
    }
    setReturnSubmitting(true);
    try {
      await api.deliveryCreateReturn(returnFor.id, { items });
      show("تم تسجيل المرتجع بنجاح");
      setReturnFor(null);
      await load();
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setReturnSubmitting(false);
    }
  };

  const isToday = (iso: string) => { const d = new Date(iso); const n = new Date(); return d.toDateString() === n.toDateString(); };
  const available = orders.filter((o) => o.delivery_state === "available").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const active = orders.filter((o) => o.delivery_state !== "available" && o.status === "out_for_delivery").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const done = orders.filter((o) => o.status === "delivered" || o.status === "returned" || o.status === "delivery_failed").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const failed = orders.filter((o) => o.status === "delivery_failed").sort((a, b) => (a.updated_at || a.created_at) < (b.updated_at || b.created_at) ? 1 : -1);
  const completedToday = done.filter((o) => isToday(o.delivered_at || o.updated_at || o.created_at));
  const failedToday = failed.filter((o) => isToday(o.updated_at || o.created_at));
  const collectedToday = completedToday.reduce((s, o) => s + Number(o.amount_due ?? o.total ?? 0), 0);
  const dailyCompletedCount = Number(dailySummary?.orders_count ?? completedToday.length);
  const dailyInvoiceTotal = Number(dailySummary?.invoices_total ?? collectedToday);
  const dailyEarnings = Number(dailySummary?.earnings ?? 0);
  const list = orderTab === "available" ? available : orderTab === "active" ? active : done;
  const returnsToday = returnRecords.filter((item) => isToday(item.created_at));

  // Broadcast live location for active deliveries
  const activeIds = active.map((o) => o.id).join(",");
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false;
    const send = async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) { perm = await Location.requestForegroundPermissionsAsync(); if (!perm.granted) return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        for (const id of activeIds.split(",")) {
          if (cancelled) break;
          try { await api.deliverySetLocation(id, pos.coords.latitude, pos.coords.longitude); } catch {}
        }
      } catch {}
    };
    send();
    const iv = setInterval(send, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeIds]);

  const doLogout = async () => { setConfirmLogout(false); await logout(); router.replace("/login"); };

  const renderCard = ({ item }: any) => {
    const amountDue = Number(item.amount_due ?? item.total ?? 0);
    return (
    <View style={styles.card} testID={`del-order-${item.id}`}>
      <View style={styles.cardTop}>
        <T weight="bold">#{item.id.replace("ORD", "")}</T>
        <StatusPill status={item.status} />
      </View>
      <View style={styles.info}><Feather name="user" size={14} color={colors.muted} /><T size={type.sm}>{item.customer_name}</T></View>
      <Pressable style={styles.info} onPress={() => Linking.openURL(`tel:${item.phone}`)}><Feather name="phone" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>{item.phone}</T></Pressable>
      {item.delivery_state === "available" && <View style={styles.info}><Feather name="map" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>المنطقة: {item.area}</T></View>}
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
        <T color={colors.muted} size={type.sm}>{item.item_count ?? item.items.length} منتج</T>
        <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(amountDue)} • نقداً</T>
      </View>

      {item.delivery_state === "available" && (
        <>
          <View style={styles.availableMeta}>
            <View style={styles.info}><Feather name="navigation" size={14} color={colors.muted} /><T size={type.sm} color={colors.onSurfaceTertiary}>{item.distance_km != null ? String(item.distance_km) + " كم تقريباً" : "المسافة غير متاحة"}</T></View>
            <T size={type.sm} weight="semi" color={colors.brandPrimary}>طلب جاهز للاستلام</T>
          </View>
          <Button title={claiming === item.id ? "جارٍ استلام الطلب..." : "استلام الطلب"} icon="check" onPress={() => claimOrder(item.id)} disabled={claiming === item.id} testID={"claim-" + item.id} style={{ marginTop: spacing.sm, minHeight: 46 }} />
        </>
      )}

      {item.location ? (
        <Pressable testID={`map-${item.id}`} onPress={() => openDirections(item.location.lat, item.location.lng, item.address)} style={styles.mapPreview}>
          <Image source={{ uri: staticMapUrl(item.location.lat, item.location.lng, 600, 200) }} style={styles.mapImg} contentFit="cover" />
          <View style={styles.mapPill}><Feather name="navigation" size={13} color="#fff" /><T size={type.sm} weight="bold" color="#fff">تتبّع على الخريطة</T></View>
        </Pressable>
      ) : null}

      <View style={styles.navRow}>
        <Pressable testID={`details-${item.id}`} onPress={() => router.push("/order/" + item.id)} style={styles.detailBtn}>
          <Feather name="file-text" size={16} color={colors.brandPrimary} />
          <T size={type.sm} weight="bold" color={colors.brandPrimary}>عرض تفاصيل الطلب</T>
        </Pressable>
        <Pressable testID={`nav-${item.id}`} onPress={() => openDirections(item.location?.lat, item.location?.lng, item.address)} style={styles.navBtn}>
          <Feather name="map" size={16} color={colors.brandPrimary} />
          <T size={type.sm} weight="bold" color={colors.brandPrimary}>{item.location ? "التوصيل عبر الخرائط" : "بحث عن العنوان في الخرائط"}</T>
        </Pressable>
      </View>
      {item.status === "out_for_delivery" && (
        <>
          <Button title="تأكيد التوصيل واستلام المبلغ" icon="check-circle" onPress={() => openProof(item)} testID={"deliver-" + item.id} style={{ marginTop: spacing.sm, minHeight: 46 }} />
          <Pressable testID={"failed-" + item.id} onPress={() => { setFailureFor(item); setFailureReason(null); }} style={styles.failBtn}>
            <Feather name="alert-triangle" size={16} color={colors.error} />
            <T size={type.sm} weight="bold" color={colors.error}>تعذر التسليم</T>
          </Pressable>
        </>
      )}
      {item.status === "out_for_delivery" && item.return_status !== "full" && (
        <Pressable testID={"return-" + item.id} onPress={() => openReturn(item)} style={styles.returnBtn}>
          <Feather name="rotate-ccw" size={16} color={colors.error} />
          <T size={type.sm} weight="bold" color={colors.error}>تسجيل مرتجع</T>
        </Pressable>
      )}
    </View>
    );
  };

  const renderReturnCard = ({ item }: any) => (
    <View style={styles.returnCard} testID={`del-return-${item.id}`}>
      <View style={styles.returnCardTop}>
        <View>
          <T weight="bold">مرتجع #{item.id.replace("RET", "")}</T>
          <T color={colors.muted} size={type.sm}>الطلب #{item.order_id?.replace("ORD", "")}</T>
        </View>
        <View style={styles.returnBadge}><T size={type.sm} weight="bold" color={colors.error}>{item.return_type === "full" ? "مرتجع كامل" : "مرتجع جزئي"}</T></View>
      </View>
      <View style={styles.returnMeta}><Feather name="user" size={14} color={colors.muted} /><T size={type.sm}>{item.customer_name || "عميل"}</T></View>
      <View style={styles.returnMeta}><Feather name="clock" size={14} color={colors.muted} /><T size={type.sm} color={colors.onSurfaceTertiary}>{item.created_at ? new Date(item.created_at).toLocaleDateString("ar-IQ") : ""}</T></View>
      {item.reason ? <View style={styles.returnReason}><T size={type.sm} color={colors.onSurfaceSecondary}>السبب: {item.reason}</T></View> : null}
      <View style={styles.returnCardBottom}>
        <T color={colors.muted} size={type.sm}>{(item.items || []).length} منتجات</T>
        <T weight="displayBold" color={colors.error}>{formatPrice(item.total)}</T>
      </View>
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
        <T color="rgba(255,255,255,0.78)" size={type.sm} style={{ marginTop: spacing.md }}>{section === "summary" ? "ملخص اليوم" : section === "orders" ? "إدارة الطلبات" : section === "returns" ? "سجل المرتجعات" : "حساب المندوب"}</T>
      </View>

      {section === "summary" && (
        <ScrollView style={styles.sectionScroll} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryIntro}>
            <View style={styles.introIcon}><Feather name="activity" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <T weight="displayBold" size={type.lg}>نظرة سريعة على يومك</T>
              <T color={colors.muted} size={type.sm} style={{ marginTop: spacing.xs }}>تابع طلبك النشط وأجرتك من مكان واحد</T>
            </View>
          </View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}><T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{available.length}</T><T color={colors.muted} size={type.sm}>طلبات متاحة</T></View>
            <View style={styles.summaryBox}><T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{active.length}</T><T color={colors.muted} size={type.sm}>قيد التوصيل</T></View>
            <View style={styles.summaryBox}><T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{dailyCompletedCount}</T><T color={colors.muted} size={type.sm}>تمت اليوم</T></View>
            <View style={styles.summaryBox}><T weight="displayBold" size={type.xl} color={colors.error}>{failedToday.length}</T><T color={colors.muted} size={type.sm}>متعذرة اليوم</T></View>
            <View style={styles.summaryWideRow}>
              <View style={styles.summaryWideBox}><T weight="displayBold" size={type.lg} color={colors.gold}>{formatPrice(dailyInvoiceTotal)}</T><T color={colors.muted} size={type.sm}>إجمالي الفواتير</T></View>
              <View style={[styles.summaryWideBox, styles.earningsBox]}><T weight="displayBold" size={type.lg} color={colors.success}>{formatPrice(dailyEarnings)}</T><T color={colors.muted} size={type.sm}>أجرتك اليوم</T></View>
            </View>
          </View>

          <View style={styles.sectionTitleRow}><T weight="displayBold" size={type.xl}>مهمتك الآن</T><T color={colors.brandPrimary} size={type.sm} weight="bold">{active.length ? "قيد التوصيل" : "لا توجد مهمة"}</T></View>
          {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View> : active.length ? renderCard({ item: active[0] }) : (
            <View style={styles.emptyPanel}>
              <Feather name="check-circle" size={28} color={colors.brandPrimary} />
              <T weight="bold" style={{ marginTop: spacing.sm }}>لا توجد مهمة نشطة</T>
              <T color={colors.muted} size={type.sm} style={{ textAlign: "center", marginTop: spacing.xs }}>انتقل إلى الطلبات لاستلام طلب جديد</T>
              <Pressable onPress={() => setSection("orders")} style={styles.inlineAction}><T color={colors.brandPrimary} weight="bold" size={type.sm}>عرض الطلبات</T></Pressable>
            </View>
          )}

          <View style={styles.quickGrid}>
            <Pressable onPress={() => setSection("orders")} style={styles.quickAction}><Feather name="package" size={20} color={colors.brandPrimary} /><T weight="bold" style={styles.quickActionTitle}>الطلبات</T><T color={colors.muted} size={type.sm}>متاحة ونشطة</T></Pressable>
            <Pressable onPress={() => setSection("returns")} style={styles.quickAction}><Feather name="rotate-ccw" size={20} color={colors.error} /><T weight="bold" style={styles.quickActionTitle}>المرتجعات</T><T color={colors.muted} size={type.sm}>{returnsToday.length} اليوم</T></Pressable>
            <Pressable onPress={() => setSection("account")} style={styles.quickAction}><Feather name="credit-card" size={20} color={colors.brandPrimary} /><T weight="bold" style={styles.quickActionTitle}>الحساب</T><T color={colors.muted} size={type.sm}>الأجرة والتسوية</T></Pressable>
          </View>
        </ScrollView>
      )}

      {section === "orders" && (
        <View style={styles.content}>
          <View style={styles.tabs}>
            <Pressable testID="tab-available" onPress={() => setOrderTab("available")} style={[styles.tab, orderTab === "available" && styles.tabActive]}><T weight="bold" color={orderTab === "available" ? "#fff" : colors.onSurfaceSecondary}>متاحة ({available.length})</T></Pressable>
            <Pressable testID="tab-active" onPress={() => setOrderTab("active")} style={[styles.tab, orderTab === "active" && styles.tabActive]}><T weight="bold" color={orderTab === "active" ? "#fff" : colors.onSurfaceSecondary}>نشطة ({active.length})</T></Pressable>
            <Pressable testID="tab-done" onPress={() => setOrderTab("done")} style={[styles.tab, orderTab === "done" && styles.tabActive]}><T weight="bold" color={orderTab === "done" ? "#fff" : colors.onSurfaceSecondary}>مكتملة ({done.length})</T></Pressable>
          </View>
          {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : list.length === 0 ? (
            <View style={styles.center}><EmptyState icon={orderTab === "active" ? "package" : "check-circle"} title={orderTab === "available" ? "لا توجد طلبات متاحة" : orderTab === "active" ? "لا توجد طلبات نشطة" : "لا توجد طلبات مكتملة"} subtitle={orderTab === "available" ? "ستظهر هنا الطلبات الجاهزة للاستلام" : orderTab === "active" ? "ستظهر الطلبات المسندة إليك هنا" : "الطلبات التي توصّلها ستظهر هنا"} /></View>
          ) : (
            <FlatList data={list} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />} renderItem={renderCard} />
          )}
        </View>
      )}

      {section === "returns" && (
        <View style={styles.content}>
          {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : returnRecords.length === 0 ? (
            <View style={styles.center}><EmptyState icon="rotate-ccw" title="لا توجد مرتجعات" subtitle="ستظهر المرتجعات التي تسجلها هنا" /></View>
          ) : (
            <FlatList data={returnRecords} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />} renderItem={renderReturnCard} />
          )}
        </View>
      )}

      {section === "account" && (
        <ScrollView style={styles.sectionScroll} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}><View style={styles.accountAvatar}><Feather name="user" size={26} color={colors.brandPrimary} /></View><View style={{ flex: 1 }}><T weight="displayBold" size={type.xl}>{user?.name}</T><T color={colors.muted} size={type.sm}>حساب مندوب التوصيل</T></View></View>
            <View style={styles.accountMetricRow}><View><T color={colors.muted} size={type.sm}>فواتير اليوم</T><T weight="displayBold" size={type.xl}>{formatPrice(dailyInvoiceTotal)}</T></View><Feather name="file-text" size={22} color={colors.brandPrimary} /></View>
            <View style={styles.accountMetricRow}><View><T color={colors.muted} size={type.sm}>أجرتك اليوم</T><T weight="displayBold" size={type.xl} color={colors.success}>{formatPrice(dailyEarnings)}</T></View><Feather name="dollar-sign" size={22} color={colors.success} /></View>
            <View style={styles.accountMetricRow}><View><T color={colors.muted} size={type.sm}>الطلبات المسلّمة</T><T weight="displayBold" size={type.xl}>{dailyCompletedCount}</T></View><Feather name="check-circle" size={22} color={colors.brandPrimary} /></View>
          </View>
          <View style={styles.accountNote}><Feather name="info" size={17} color={colors.brandPrimary} /><T color={colors.onSurfaceSecondary} size={type.sm} style={{ flex: 1 }}>الأجرة محسوبة من رسوم توصيل الطلبات التي تم تسليمها اليوم.</T></View>
          <Pressable onPress={() => setConfirmLogout(true)} style={styles.accountLogout}><Feather name="log-out" size={18} color={colors.error} /><T weight="bold" color={colors.error}>تسجيل الخروج</T></Pressable>
        </ScrollView>
      )}

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + spacing.xs }]}>
        {DELIVERY_NAV.map((item) => (
          <Pressable key={item.key} testID={`nav-${item.key}`} onPress={() => setSection(item.key)} style={[styles.bottomNavItem, section === item.key && styles.bottomNavItemActive]}>
            <Feather name={item.icon as any} size={19} color={section === item.key ? colors.brandPrimary : colors.muted} />
            <T size={11} weight={section === item.key ? "bold" : "semi"} color={section === item.key ? colors.brandPrimary : colors.muted}>{item.label}</T>
          </Pressable>
        ))}
      </View>

      <Modal visible={!!proofFor} transparent animationType="slide" onRequestClose={() => {}}>
        <Pressable style={styles.modalBg} onPress={() => {}}>
          <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalIcon, styles.proofIcon]}><Feather name="shield" size={26} color={colors.brandPrimary} /></View>
            <T weight="displayBold" size={type.xl} style={{ marginTop: spacing.md }}>إثبات تسليم الطلب</T>
            <T color={colors.muted} size={type.sm} style={{ marginTop: spacing.xs, textAlign: "center" }}>اطلب رمز التسليم من العميل وأدخله قبل تسليم الطلب</T>
            <T color={colors.brandPrimary} weight="bold" size={type.sm} style={{ marginTop: spacing.lg }}>الطلب #{proofFor?.id?.replace("ORD", "")}</T>
            <TextInput value={proofOtp} onChangeText={(value) => setProofOtp(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} autoFocus placeholder="000000" placeholderTextColor={colors.muted} style={styles.otpInput} accessibilityLabel="رمز التسليم" />
            <Button title={proofSubmitting ? "جارٍ التحقق..." : "تحقق وتسجيل التسليم"} icon="shield" onPress={submitProof} disabled={proofSubmitting} style={{ marginTop: spacing.lg, minHeight: 46 }} />
            <Button title="إلغاء" variant="secondary" onPress={() => { setProofFor(null); setProofOtp(""); }} disabled={proofSubmitting} style={{ marginTop: spacing.sm, minHeight: 44 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!failureFor} transparent animationType="slide" onRequestClose={() => { setFailureFor(null); setFailureReason(null); }}>
        <Pressable style={styles.modalBg} onPress={() => { setFailureFor(null); setFailureReason(null); }}>
          <Pressable style={[styles.modalCard, { alignItems: "stretch" }]} onPress={(e) => e.stopPropagation()}>
            <T weight="displayBold" size={type.xl}>تعذر التسليم</T>
            <T color={colors.muted} size={type.sm} style={{ marginTop: spacing.xs }}>الطلب #{failureFor?.id?.replace("ORD", "")}</T>
            <T weight="semi" style={{ marginTop: spacing.lg }}>اختر سبب التعذر</T>
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              {DELIVERY_FAILURE_REASONS.map((reason) => (
                <Pressable key={reason.value} onPress={() => setFailureReason(reason.value)} style={[styles.failureOption, failureReason === reason.value && styles.failureOptionActive]}>
                  <T size={type.sm} weight="semi" color={failureReason === reason.value ? colors.brandPrimary : colors.onSurfaceSecondary}>{reason.label}</T>
                </Pressable>
              ))}
            </View>
            <Button title={failureSubmitting ? "جارٍ التسجيل..." : "تأكيد تعذر التسليم"} icon="alert-triangle" onPress={submitFailure} disabled={failureSubmitting} style={{ marginTop: spacing.lg, minHeight: 46 }} />
            <Button title="إلغاء" variant="secondary" onPress={() => { setFailureFor(null); setFailureReason(null); }} disabled={failureSubmitting} style={{ marginTop: spacing.sm, minHeight: 44 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!returnFor} transparent animationType="slide" onRequestClose={() => setReturnFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setReturnFor(null)}>
          <Pressable style={[styles.returnSheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <View style={styles.returnHeader}>
              <View>
                <T weight="displayBold" size={type.xl}>تسجيل مرتجع</T>
                <T color={colors.muted} size={type.sm}>الطلب #{returnFor?.id?.replace("ORD", "")}</T>
              </View>
              <Pressable onPress={selectAllReturnQuantities} style={styles.selectAllBtn}><T size={type.sm} weight="bold" color={colors.brandPrimary}>إرجاع الكل</T></Pressable>
            </View>
            <ScrollView style={styles.returnList} showsVerticalScrollIndicator={false}>
              {(returnFor?.items || []).map((item: any) => {
                const quantity = returnQuantities[item.product_id] || 0;
                return (
                  <View key={item.product_id} style={styles.returnItem}>
                    <View style={{ flex: 1 }}>
                      <T weight="semi" numberOfLines={2}>{item.name}</T>
                      <T color={colors.muted} size={type.sm}>المطلوب: {item.quantity} • {formatPrice(item.price)}</T>
                    </View>
                    <View style={styles.quantityControls}>
                      <Pressable onPress={() => adjustReturnQuantity(item.product_id, -1)} style={styles.qtyBtn}><Feather name="minus" size={16} color={colors.brandPrimary} /></Pressable>
                      <T weight="bold" style={styles.qtyValue}>{quantity}</T>
                      <Pressable onPress={() => adjustReturnQuantity(item.product_id, 1)} style={styles.qtyBtn}><Feather name="plus" size={16} color={colors.brandPrimary} /></Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.returnFooter}>
              <T color={colors.muted} size={type.sm}>سيتم تسجيل الكميات المحددة فقط</T>
              <Button title={returnSubmitting ? "جارٍ التسجيل..." : "تأكيد المرتجع"} icon="rotate-ccw" onPress={submitReturn} disabled={returnSubmitting} style={{ minHeight: 46 }} />
              <Button title="إلغاء" variant="secondary" onPress={() => setReturnFor(null)} disabled={returnSubmitting} style={{ minHeight: 44 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  summaryGrid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.lg },
  summaryBox: { width: "48%", minHeight: 58, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  summaryWideRow: { width: "100%", flexDirection: "row-reverse", justifyContent: "space-between", gap: spacing.sm },
  summaryWideBox: { width: "48%", minHeight: 62, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(198,160,121,0.18)", borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(198,160,121,0.55)", paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  earningsBox: { backgroundColor: "rgba(79,166,119,0.18)", borderColor: "rgba(191,232,208,0.55)" },
  content: { flex: 1 },
  sectionScroll: { flex: 1 },
  summaryIntro: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  introIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyPanel: { alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  inlineAction: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  quickGrid: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.lg },
  quickAction: { flex: 1, minHeight: 92, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  quickActionTitle: { marginTop: spacing.xs },
  bottomNav: { flexDirection: "row-reverse", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, paddingHorizontal: spacing.sm },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 56, borderRadius: radius.md, gap: 2 },
  bottomNavItemActive: { backgroundColor: colors.brandTertiary },
  returnCard: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  returnCardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  returnBadge: { backgroundColor: "#FFF0F0", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  returnMeta: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  returnReason: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  returnCardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  accountCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  accountHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  accountAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  accountMetricRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  accountNote: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  accountLogout: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error, backgroundColor: "#FFF8F8", marginTop: spacing.lg },
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
  availableMeta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  mapPreview: { marginTop: spacing.md, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mapImg: { width: "100%", height: 130, backgroundColor: colors.surfaceSecondary },
  mapPill: { position: "absolute", bottom: spacing.sm, insetInlineEnd: spacing.sm, flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  navRow: { marginTop: spacing.sm },
  detailBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  navBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  returnBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error, backgroundColor: "#FFF8F8", marginTop: spacing.sm },
  failBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error, backgroundColor: "#FFF8F8", marginTop: spacing.sm },
  failureOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  failureOptionActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  returnSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "86%" },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  returnHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  selectAllBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  returnList: { maxHeight: 300 },
  returnItem: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  quantityControls: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  qtyValue: { minWidth: 22, textAlign: "center" },
  returnFooter: { gap: spacing.sm, marginTop: spacing.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  modalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#F5E9E9", alignItems: "center", justifyContent: "center" },
  proofIcon: { backgroundColor: "#E7F0EC" },
  otpInput: { width: "100%", height: 64, marginTop: spacing.md, borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, color: colors.brandPrimary, fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: 8 },
  modalBtns: { flexDirection: "row-reverse", gap: spacing.md, marginTop: spacing.xl, width: "100%" },
});

