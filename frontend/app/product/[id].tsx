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
import { api, resolveImage, formatPrice } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { add } = useCart();
  const { show } = useToast();
  const [product, setProduct] = useState<any>(null);
  const [qty, setQty] = useState(1);
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.product(id!);
        setProduct(p);
        setFav(!!p.is_favorite);
      } catch (e: any) { show(e.message, "error"); }
      finally { setLoading(false); }
    })();
  }, [id]); // eslint-disable-line

  const toggleFav = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setFav((f) => !f);
    try { const r = await api.toggleFav(id!); setFav(r.is_favorite); } catch { setFav((f) => !f); }
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

  if (loading || !product) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>;
  }

  const discount = product.old_price && product.old_price > product.price ? Math.round((1 - product.price / product.old_price) * 100) : 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.imgWrap}>
          <Image source={{ uri: resolveImage(product.image_url) }} style={StyleSheet.absoluteFill} contentFit="cover" />
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

          <View style={styles.stockRow}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <T color={colors.success} weight="semi" size={type.sm}>متوفر في المخزون</T>
          </View>

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl }}>الوصف</T>
          <T color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xs, lineHeight: 24 }}>{product.description || "منتج فاخر بجودة عالية من سوق ماركت."}</T>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.stepper}>
          <Pressable testID="pd-inc" onPress={() => setQty((q) => q + 1)} style={styles.stepBtn}><Feather name="plus" size={18} color={colors.onSurface} /></Pressable>
          <T weight="bold" size={type.lg} style={{ minWidth: 28, textAlign: "center" }}>{qty}</T>
          <Pressable testID="pd-dec" onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.stepBtn}><Feather name="minus" size={18} color={colors.onSurface} /></Pressable>
        </View>
        <Button title="أضف إلى السلة" icon="shopping-cart" onPress={addToCart} loading={adding} testID="pd-add" style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  imgWrap: { width: "100%", height: 360, backgroundColor: colors.surfaceSecondary },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row-reverse", justifyContent: "space-between" },
  circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  badgeRow: { flexDirection: "row-reverse", gap: spacing.sm },
  priceRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.md },
  stockRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 6 },
  stepBtn: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
