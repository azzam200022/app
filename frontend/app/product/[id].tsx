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
  const { add } = useCart();
  const { user } = useAuth();
  const { show } = useToast();
  const initialProduct = id ? getCachedProduct(id) : undefined;
  const [product, setProduct] = useState<any>(initialProduct || null);
  const [qty, setQty] = useState(1);
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(!initialProduct);
  const [adding, setAdding] = useState(false);
  const [availabilityAlerted, setAvailabilityAlerted] = useState(false);
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    let active = true;
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

  const toggleFav = async () => {
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
    setAdding(true);
    try {
      await add(id!, qty);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      show("تمت الإضافة إلى السلة");
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

  const discount = product.old_price && product.old_price > product.price ? Math.round((1 - product.price / product.old_price) * 100) : 0;

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

          <View style={styles.priceRow}>
            <T weight="displayBold" size={type["3xl"]} color={colors.brandPrimary}>{formatPrice(product.price)}</T>
            {product.old_price ? <T size={type.lg} color={colors.muted} style={{ textDecorationLine: "line-through" }}>{formatPrice(product.old_price)}</T> : null}
          </View>

          {product.available === false ? (
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
              <Feather name="check-circle" size={16} color={colors.success} />
              <T color={colors.success} weight="semi" size={type.sm}>متوفر في المخزون</T>
            </View>
          )}

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl }}>الوصف</T>
          <T color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xs, lineHeight: 24 }}>{product.description || "منتج فاخر بجودة عالية من سوق ماركت."}</T>
        </View>
      </ScrollView>

      {product.available !== false && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.stepper}>
            <Pressable testID="pd-inc" onPress={() => setQty((q) => q + 1)} style={styles.stepBtn}><Feather name="plus" size={18} color={colors.onSurface} /></Pressable>
            <T weight="bold" size={type.lg} style={{ minWidth: 28, textAlign: "center" }}>{qty}</T>
            <Pressable testID="pd-dec" onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.stepBtn}><Feather name="minus" size={18} color={colors.onSurface} /></Pressable>
          </View>
          <Button title="أضف إلى السلة" icon="shopping-cart" onPress={addToCart} loading={adding} testID="pd-add" style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  loadingHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  loadingImage: { width: "100%", height: 360, backgroundColor: colors.surfaceSecondary },
  loadingBody: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  imgWrap: { width: "100%", height: 360, backgroundColor: colors.surfaceSecondary },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row-reverse", justifyContent: "space-between" },
  circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  badgeRow: { flexDirection: "row-reverse", gap: spacing.sm },
  priceRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.md },
  stockRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  unavailableBox: { marginTop: spacing.md, backgroundColor: "#FFF8F0", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: "#F2D39A" },
  unavailableStatus: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 6 },
  stepBtn: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
