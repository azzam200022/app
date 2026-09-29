import React from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
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
  const [imageFailed, setImageFailed] = React.useState(false);
  const unavailable = product.available === false;
  const outLabel = product.stock_status === "coming_soon" ? "يتوفر قريباً" : "نفدت الكمية";
  const stockValue = Number(product.stock);
  const lowStock = !unavailable && Number.isFinite(stockValue) && stockValue > 0 && stockValue <= 5;
  const discount = product.old_price && product.old_price > product.price
    ? Math.round((1 - product.price / product.old_price) * 100)
    : 0;

  React.useEffect(() => {
    setFav(!!product.is_favorite);
  }, [product.is_favorite]);

  const toggleFav = async () => {
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
        {(discount > 0 || lowStock) && !unavailable && (
          <View style={styles.badgeStack}>
            {discount > 0 && <Badge text={`خصم ${discount}%`} color={colors.error} textColor="#fff" />}
            {lowStock && (
              <View style={styles.lowStockBadge}>
                <Feather name="alert-circle" size={11} color={colors.gold} />
                <T weight="bold" size={10} color={colors.gold}>باقي {stockValue}</T>
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
          <Feather name="heart" size={18} color={fav ? colors.onError : colors.onSurfaceTertiary} fill={fav ? colors.onError : "transparent"} />
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
              accessibilityLabel={unavailable ? "المنتج غير متوفر" : `إضافة ${product.name} إلى السلة`}
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
        {product.category ? <T numberOfLines={1} size={type.xs} color={colors.muted} style={styles.category}>{product.category}</T> : null}
        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <View style={styles.priceHighlight}>
              <T numberOfLines={1} weight="displayBold" size={type.lg} color={colors.onBrandPrimary}>{formatPrice(product.price)}</T>
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
  card: { backgroundColor: "#FFFEFC", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.divider },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  imgWrap: { width: "100%", aspectRatio: 0.98, backgroundColor: colors.surfaceSecondary },
  img: { width: "100%", height: "100%" },
  imageFallback: { alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary },
  badgeStack: { position: "absolute", top: spacing.xs, insetInlineStart: spacing.xs, alignItems: "flex-start", gap: 3 },
  lowStockBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: "#FFF3D6", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  favBtn: { position: "absolute", top: spacing.sm, insetInlineEnd: spacing.sm, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", zIndex: 2 },
  favBtnActive: { backgroundColor: colors.error, borderColor: colors.error },
  cartAction: { position: "absolute", bottom: spacing.sm, insetInlineEnd: spacing.sm, zIndex: 2 },
  body: { padding: spacing.sm, height: 142 },
  name: { height: 40, lineHeight: 19, color: colors.onSurface, letterSpacing: -0.1 },
  category: { marginTop: 2, height: 18 },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", marginTop: spacing.xs, gap: spacing.xs, minHeight: 42 },
  priceBlock: { flex: 1, minWidth: 0 },
  priceHighlight: { alignSelf: "flex-start", maxWidth: "100%", backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  old: { textDecorationLine: "line-through" },
  addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addBtnDisabled: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  quantityControls: { width: 76, height: 36, flexShrink: 0, borderRadius: radius.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.brandTertiary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3 },
  quantityBtn: { width: 26, height: 28, borderRadius: 14, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  quantityText: { minWidth: 18, textAlign: "center", color: colors.onSurface },
  skeletonCard: { overflow: "hidden" },
  skeletonBlock: { backgroundColor: colors.surfaceSecondary },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceSecondary },
  skeletonWide: { width: "82%" },
  skeletonShort: { width: "52%", marginTop: spacing.sm },
  skeletonFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  skeletonPrice: { width: "34%" },
  skeletonAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceSecondary },
  outOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  outPill: { backgroundColor: "rgba(21,48,46,0.82)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
});
