import React from "react";
import { Animated, Pressable, View, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { resolveImage, formatPrice, api } from "@/src/lib/api";
import { T, Badge } from "@/src/components/ui";

export const ProductCard = React.memo(function ProductCard({
  product,
  onAdd,
  onIncrease,
  onDecrease,
  onToggleFav,
  quantity = 0,
  width,
}: {
  product: any;
  onAdd?: (p: any) => void;
  onIncrease?: (p: any) => void;
  onDecrease?: (p: any) => void;
  onToggleFav?: (id: string, val: boolean) => void;
  quantity?: number;
  width?: number;
}) {
  const router = useRouter();
  const [fav, setFav] = React.useState(!!product.is_favorite);
  const heartScale = React.useRef(new Animated.Value(1)).current;
  const [imageFailed, setImageFailed] = React.useState(false);
  const comingSoon = product.stock_status === "coming_soon" || product.coming_soon === true;
  const canPurchase = !comingSoon && (product.purchasable === true || (product.purchasable == null && product.available !== false));
  const unavailable = !canPurchase;
  const outLabel = comingSoon ? "يتوفر قريباً — غير متاح للشراء" : "نفدت الكمية";
  const stockValue = Number(product.stock);
  const lowStock = !unavailable && !comingSoon && Number.isFinite(stockValue) && stockValue > 0 && stockValue <= 5;
  const discount = product.old_price && product.old_price > product.price
    ? Math.round((1 - product.price / product.old_price) * 100)
    : 0;

  React.useEffect(() => {
    setFav(!!product.is_favorite);
  }, [product.is_favorite]);

  const toggleFav = async () => {
    if (Platform.OS !== "web") {
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.2, speed: 24, bounciness: 7, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1, speed: 20, bounciness: 5, useNativeDriver: true }),
      ]).start();
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const next = !fav;
    setFav(next);
    try {
      const r = await api.toggleFav(product.id);
      setFav(r.is_favorite);
      onToggleFav?.(product.id, r.is_favorite);
    } catch {
      setFav(!next);
    }
  };

  return (
    <Pressable
      testID={`product-card-${product.id}`}
      accessibilityRole="button"
      accessibilityLabel={`فتح ${product.name}`}
      onPress={() => router.push(`/product/${product.id}`)}
      style={({ pressed }) => [styles.card, width ? { width } : { flex: 1 }, pressed && styles.cardPressed]}
    >
      <View style={styles.imgWrap}>
        {imageFailed ? (
          <View style={[styles.img, styles.imageFallback]}>
            <Feather name="image" size={28} color={colors.muted} />
            <T size={type.xs} color={colors.muted}>الصورة غير متاحة</T>
          </View>
        ) : (
          <Image source={{ uri: resolveImage(product.image_url) }} style={[styles.img, unavailable && { opacity: 0.4 }]} contentFit="cover" cachePolicy="memory-disk" transition={200} onError={() => setImageFailed(true)} />
        )}
        {unavailable && (
          <View style={styles.outOverlay}>
            <View style={styles.outPill}><T weight="bold" size={type.sm} color="#fff">{outLabel}</T></View>
          </View>
        )}
        {(discount > 0 || lowStock || comingSoon || product.wholesale_enabled) && !unavailable && (
          <View style={styles.badgeStack}>
            {comingSoon && <Badge text="يتوفر قريباً" color={colors.warningSoft} textColor={colors.warning} />}
            {product.wholesale_enabled && <Badge text="جملة" color={colors.brandTertiary} textColor={colors.brandPrimary} />}
            {discount > 0 && <Badge text={`خصم ${discount}%`} color={colors.error} textColor="#fff" />}
            {lowStock && (
              <View style={styles.lowStockBadge}>
                <Feather name="alert-circle" size={11} color={colors.warning} />
                <T weight="bold" size={10} color={colors.warning}>باقي {stockValue}</T>
              </View>
            )}
          </View>
        )}
        <Pressable
          testID={`fav-${product.id}`}
          accessibilityRole="button"
          accessibilityLabel={fav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
          accessibilityState={{ selected: fav }}
          onPress={(event) => { event.stopPropagation(); toggleFav(); }}
          style={[styles.favBtn, fav && styles.favBtnActive]}
          hitSlop={8}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Feather name="heart" size={18} color={fav ? colors.onError : colors.onSurfaceTertiary} fill={fav ? colors.onError : "transparent"} />
          </Animated.View>
        </Pressable>
        <View style={styles.cartAction}>
          {quantity > 0 && !unavailable ? (
            <View style={styles.quantityControls}>
              <Pressable
                testID={`decrease-cart-${product.id}`}
                onPress={(event) => {
                  event.stopPropagation();
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  onDecrease?.(product);
                }}
                style={styles.quantityBtn}
                accessibilityLabel="تقليل الكمية"
                hitSlop={4}
              >
                <Feather name="minus" size={16} color={colors.onSurface} />
              </Pressable>
              <T weight="bold" style={styles.quantityText}>{quantity}</T>
              <Pressable
                testID={`increase-cart-${product.id}`}
                onPress={(event) => {
                  event.stopPropagation();
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  onIncrease?.(product);
                }}
                style={styles.quantityBtn}
                accessibilityLabel="زيادة الكمية"
                hitSlop={4}
              >
                <Feather name="plus" size={16} color={colors.onSurface} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID={`add-cart-${product.id}`}
              accessibilityLabel={unavailable ? outLabel : `إضافة ${product.name} إلى السلة`}
              disabled={unavailable}
              onPress={(event) => {
                event.stopPropagation();
                if (unavailable) return;
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onAdd?.(product);
              }}
              style={({ pressed }) => [unavailable ? styles.addBtnDisabled : styles.addBtn, pressed && !unavailable && { opacity: 0.8 }]}
            >
              <Feather name={unavailable ? "slash" : "shopping-cart"} size={18} color={unavailable ? colors.muted : "#fff"} />
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.body}>
        <T weight="semi" size={type.sm} numberOfLines={2} style={styles.name}>{product.name}</T>
        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
             <View style={styles.priceHighlight}>
               <T numberOfLines={1} weight="displayBold" size={type.lg} color={colors.brandPrimary}>{formatPrice(product.price)}</T>
            </View>
            {product.old_price ? (
              <T numberOfLines={1} size={type.sm} color={colors.muted} style={styles.old}>{formatPrice(product.old_price)}</T>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export function ProductCardSkeleton({ width }: { width?: number }) {
  return (
    <View style={[styles.card, styles.skeletonCard, width ? { width } : { flex: 1 }]}>
      <View style={[styles.imgWrap, styles.skeletonBlock]} />
      <View style={styles.body}>
        <View style={[styles.skeletonLine, styles.skeletonWide]} />
        <View style={[styles.skeletonLine, styles.skeletonShort]} />
        <View style={styles.skeletonFooter}>
          <View style={[styles.skeletonLine, styles.skeletonPrice]} />
          <View style={styles.skeletonAction} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  cardPressed: { opacity: 0.96, transform: [{ scale: 0.99 }] },
  imgWrap: { width: "100%", aspectRatio: 0.92, backgroundColor: colors.surfaceSecondary },
  img: { width: "100%", height: "100%" },
  imageFallback: { alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary },
  badgeStack: { position: "absolute", top: spacing.xs, insetInlineStart: spacing.xs, alignItems: "flex-start", gap: 3 },
  lowStockBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: "#FFF3D6", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  favBtn: { position: "absolute", top: spacing.sm, insetInlineEnd: spacing.sm, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", zIndex: 2 },
  favBtnActive: { backgroundColor: colors.error, borderColor: colors.error },
  cartAction: { position: "absolute", bottom: spacing.sm, insetInlineEnd: spacing.sm, zIndex: 2 },
  body: { padding: spacing.md, minHeight: 108 },
  name: { minHeight: 40, lineHeight: 20, color: colors.onSurface },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", marginTop: spacing.xs, gap: spacing.xs, minHeight: 38 },
  priceBlock: { flex: 1, minWidth: 0 },
  priceHighlight: { alignSelf: "flex-start", maxWidth: "100%", backgroundColor: "transparent", paddingVertical: 2 },
  old: { textDecorationLine: "line-through", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addBtnDisabled: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  quantityControls: { width: 88, height: 40, flexShrink: 0, borderRadius: radius.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  quantityBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  quantityText: { minWidth: 18, textAlign: "center", color: colors.onSurface },
  skeletonCard: { overflow: "hidden" },
  skeletonBlock: { backgroundColor: colors.surfaceSecondary },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceSecondary },
  skeletonWide: { width: "82%" },
  skeletonShort: { width: "52%", marginTop: spacing.sm },
  skeletonFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  skeletonPrice: { width: "34%" },
  skeletonAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceSecondary },
  outOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  outPill: { backgroundColor: "rgba(21,48,46,0.82)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
});
