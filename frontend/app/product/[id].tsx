import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, Badge } from "@/src/components/ui";
import { api, getCachedProduct, resolveImage, formatPrice } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";
import { useAuth } from "@/src/context/AuthContext";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, add, setQty: setCartQty } = useCart();
  const { user } = useAuth();
  const { show } = useToast();
  const initialProduct = id ? getCachedProduct(id) : undefined;
  const [product, setProduct] = useState<any>(initialProduct || null);
  const [qty, setQty] = useState(1);
  const [saleUnit, setSaleUnit] = useState<"piece" | "wholesale">("piece");
  const cartQuantity = cart.items.find((item) => item.product_id === id && (item.sale_unit || "piece") === saleUnit)?.quantity || 0;
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(!initialProduct);
  const [adding, setAdding] = useState(false);
  const [availabilityAlerted, setAvailabilityAlerted] = useState(false);
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    let active = true;
    setSaleUnit("piece");
    setQty(1);
    const cached = id ? getCachedProduct(id) : undefined;
    if (cached) {
      setProduct(cached);
      setFav(!!cached.is_favorite);
      setAvailabilityAlerted(!!cached.availability_alerted);
      setLoading(false);
    }
    (async () => {
      try {
        const p = await api.product(id!, true);
        if (!active) return;
        setProduct(p);
        setFav(!!p.is_favorite);
        setAvailabilityAlerted(!!p.availability_alerted);
      } catch (e: any) { if (active) show(e.message, "error"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id]); // eslint-disable-line

  useEffect(() => {
    setQty(cartQuantity || 1);
  }, [id, saleUnit, cartQuantity]);

  const toggleFav = async () => {
    if (user?.role !== "customer") {
      show("سجّل الدخول لحفظ المنتجات في المفضلة");
      router.push("/login");
      return;
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setFav((f) => !f);
    try { const r = await api.toggleFav(id!); setFav(r.is_favorite); } catch { setFav((f) => !f); }
  };

  const toggleAvailabilityAlert = async () => {
    if (!user) {
      show("سجّل الدخول لتفعيل التنبيه");
      router.push("/login");
      return;
    }
    setAlerting(true);
    try {
      if (availabilityAlerted) {
        await api.removeAvailabilityAlert(id!);
        setAvailabilityAlerted(false);
        show("تم إلغاء تنبيه التوفر");
      } else {
        const result = await api.subscribeAvailabilityAlert(id!);
        if (result.available) {
          show("المنتج متوفر الآن");
          return;
        }
        setAvailabilityAlerted(!!result.subscribed);
        show("سنبلغك عند توفر المنتج");
      }
    } catch (e: any) { show(e.message, "error"); }
    finally { setAlerting(false); }
  };

  const addToCart = async () => {
    if (user?.role !== "customer") {
      show("سجّل الدخول أو أنشئ حساباً لإضافة المنتجات إلى السلة", "error");
      router.push("/login");
      return;
    }
    setAdding(true);
    try {
      if (cartQuantity > 0) {
        await setCartQty(id!, qty, saleUnit);
        show("تم تحديث الكمية في السلة");
      } else {
        await add(id!, qty, saleUnit);
        show("تمت الإضافة إلى السلة");
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { show(e.message, "error"); }
    finally { setAdding(false); }
  };

  if (loading && !product) {
    return (
      <View style={styles.root}>
        <View style={[styles.loadingHeader, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} style={styles.circleBtn}>
            <Feather name="arrow-right" size={22} color={colors.onSurface} />
          </Pressable>
          <ActivityIndicator color={colors.brandPrimary} />
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.loadingImage} />
        <View style={styles.loadingBody}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </View>
    );
  }

  if (!product) {
    return <View style={styles.center}><T color={colors.muted}>تعذر تحميل المنتج</T></View>;
  }

  const hasWholesale = !!(product.wholesale_enabled && product.wholesale_unit_name && Number(product.wholesale_quantity) >= 2 && Number(product.wholesale_price) > 0);
  const activePrice = saleUnit === "wholesale" && hasWholesale ? Number(product.wholesale_price) : Number(product.price);
  const activeOldPrice = saleUnit === "wholesale" && hasWholesale ? Number(product.wholesale_old_price || 0) : Number(product.old_price || 0);
  const canPurchase = product.purchasable === true || (product.purchasable == null && product.available !== false);
  const maxSaleQuantity = 1000;
  const discount = activeOldPrice > activePrice ? Math.round((1 - activePrice / activeOldPrice) * 100) : 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imgWrap}>
          <Image source={{ uri: resolveImage(product.image_url) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          <LinearGradient colors={["rgba(0,0,0,0.25)", "transparent"]} style={styles.topScrim} />
          <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
            <Pressable testID="pd-back" onPress={() => router.back()} style={styles.circleBtn}>
              <Feather name="arrow-right" size={22} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="pd-fav" onPress={toggleFav} style={styles.circleBtn}>
              <Feather name="heart" size={20} color={fav ? colors.error : colors.onSurface} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <Badge text={product.category} color={colors.brandTertiary} textColor={colors.brandPrimary} />
            {discount > 0 && <Badge text={`خصم ${discount}%`} color={colors.error} textColor="#fff" />}
          </View>
          <T weight="displayBold" size={type["2xl"]} style={{ marginTop: spacing.sm }}>{product.name}</T>

          {hasWholesale && (
            <View style={styles.saleUnitRow}>
              <Pressable testID="pd-unit-piece" onPress={() => setSaleUnit("piece")} style={[styles.saleUnitButton, saleUnit === "piece" && styles.saleUnitButtonActive]}>
                <T size={type.sm} weight="semi" color={saleUnit === "piece" ? colors.brandPrimary : colors.onSurfaceSecondary}>قطعة</T>
              </Pressable>
              <Pressable testID="pd-unit-wholesale" onPress={() => setSaleUnit("wholesale")} style={[styles.saleUnitButton, saleUnit === "wholesale" && styles.saleUnitButtonActive]}>
                <T size={type.sm} weight="semi" color={saleUnit === "wholesale" ? colors.brandPrimary : colors.onSurfaceSecondary}>{product.wholesale_unit_name} • {product.wholesale_quantity} قطع</T>
              </Pressable>
            </View>
          )}
          <View style={styles.priceRow}>
            <View style={styles.priceHighlight}>
              <T weight="displayBold" size={type["3xl"]} color={colors.brandPrimary}>{formatPrice(activePrice)}</T>
            </View>
            {activeOldPrice > activePrice ? <T size={type.lg} color={colors.muted} style={{ textDecorationLine: "line-through" }}>{formatPrice(activeOldPrice)}</T> : null}
          </View>

          {!canPurchase ? (
            <View style={styles.unavailableBox}>
              <View style={styles.unavailableStatus}>
                <Feather name={product.stock_status === "coming_soon" ? "clock" : "x-circle"} size={17} color={colors.error} />
                <T color={colors.error} weight="semi" size={type.sm}>{product.stock_status === "coming_soon" ? "يتوفر قريباً" : "نفدت الكمية"}</T>
              </View>
              <Button
                title={availabilityAlerted ? "تم تفعيل التنبيه — إلغاء" : "أبلغني عند التوفر"}
                icon={availabilityAlerted ? "bell-off" : "bell"}
                variant={availabilityAlerted ? "secondary" : "gold"}
                onPress={toggleAvailabilityAlert}
                loading={alerting}
                testID="pd-availability-alert"
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : (
            <View style={styles.stockRow}>
              <Feather name={product.stock_status === "coming_soon" ? "clock" : "check-circle"} size={16} color={product.stock_status === "coming_soon" ? colors.warning : colors.success} />
              <T color={product.stock_status === "coming_soon" ? colors.warning : colors.success} weight="semi" size={type.sm}>
                {product.stock_status === "coming_soon" ? "يتوفر قريباً — الطلب متاح" : product.stock_status === "out" ? "لا توجد كمية مسجلة — الطلب متاح" : "متاح للطلب"}
              </T>
            </View>
          )}

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl }}>الوصف</T>
          <T color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xs, lineHeight: 24 }}>{product.description || "منتج فاخر بجودة عالية من سوق ماركت."}</T>
        </View>
      </ScrollView>

      {canPurchase && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.stepper}>
            <Pressable testID="pd-inc" onPress={() => setQty((q) => Math.min(maxSaleQuantity, q + 1))} style={styles.stepBtn}><Feather name="plus" size={18} color={colors.onSurface} /></Pressable>
            <T weight="bold" size={type.lg} style={{ minWidth: 28, textAlign: "center" }}>{qty}</T>
            <Pressable testID="pd-dec" onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.stepBtn}><Feather name="minus" size={18} color={colors.onSurface} /></Pressable>
          </View>
          <Button title={cartQuantity > 0 ? "تحديث الكمية" : "أضف إلى السلة"} icon="shopping-cart" onPress={addToCart} loading={adding} testID="pd-add" style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  loadingHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  loadingImage: { width: "100%", height: 388, backgroundColor: colors.surfaceSecondary },
  loadingBody: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  imgWrap: { width: "100%", height: 388, backgroundColor: colors.surfaceSecondary },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row-reverse", justifyContent: "space-between" },
  circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.xl, backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28 },
  badgeRow: { flexDirection: "row-reverse", gap: spacing.sm },
  saleUnitRow: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  saleUnitButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: "#fff" },
  saleUnitButtonActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  saleUnitButtonDisabled: { opacity: 0.4 },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  priceHighlight: { alignSelf: "flex-start", maxWidth: "100%", backgroundColor: "transparent", paddingVertical: 2 },
  stockRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  unavailableBox: { marginTop: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.warning },
  unavailableStatus: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
