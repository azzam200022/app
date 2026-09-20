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
  const discount = product.old_price && product.old_price > product.price
    ? Math.round((1 - product.price / product.old_price) * 100)
    : 0;

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
      style={[styles.card, width ? { width } : { flex: 1 }]}
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
        {discount > 0 && !unavailable && (
          <View style={styles.badgePos}>
            <Badge text={`خصم ${discount}%`} color={colors.error} textColor="#fff" />
          </View>
        )}
        <Pressable testID={`fav-${product.id}`} accessibilityLabel={fav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onPress={toggleFav} style={styles.favBtn} hitSlop={8}>
          <Feather name="heart" size={16} color={fav ? colors.error : colors.onSurfaceTertiary} style={fav ? { opacity: 1 } : {}} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <T weight="semi" numberOfLines={2} style={styles.name}>{product.name}</T>
        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <T weight="displayBold" size={type.lg} color={colors.brandPrimary}>{formatPrice(product.price)}</T>
            {product.old_price ? (
              <T size={type.sm} color={colors.muted} style={styles.old}>{formatPrice(product.old_price)}</T>
            ) : null}
          </View>
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
  card: { backgroundColor: "#fff", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, shadowColor: "#15302E", shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  imgWrap: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceSecondary },
  img: { width: "100%", height: "100%" },
  imageFallback: { alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary },
  badgePos: { position: "absolute", top: spacing.sm, insetInlineStart: spacing.sm },
  favBtn: { position: "absolute", top: spacing.sm, insetInlineEnd: spacing.sm, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.md, minHeight: 138 },
  name: { minHeight: 40, lineHeight: 20 },
  priceRow: { flexDirection: "row-reverse", alignItems: "flex-end", marginTop: spacing.sm, gap: spacing.sm },
  priceBlock: { flex: 1, minWidth: 0 },
  old: { textDecorationLine: "line-through" },
  addBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  addBtnDisabled: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  quantityControls: { height: 44, minWidth: 120, borderRadius: radius.pill, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, shadowColor: "#15302E", shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  quantityBtn: { width: 35, height: 35, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  quantityText: { minWidth: 24, textAlign: "center", color: colors.onSurface },
  skeletonCard: { overflow: "hidden" },
  skeletonBlock: { backgroundColor: colors.surfaceSecondary },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceSecondary },
  skeletonWide: { width: "82%" },
  skeletonShort: { width: "52%", marginTop: spacing.sm },
  skeletonFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  skeletonPrice: { width: "34%" },
  skeletonAction: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  outOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  outPill: { backgroundColor: "rgba(21,48,46,0.82)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
});
