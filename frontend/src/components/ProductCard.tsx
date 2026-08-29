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

export function ProductCard({ product, onAdd, onToggleFav, width }: { product: any; onAdd?: (p: any) => void; onToggleFav?: (id: string, val: boolean) => void; width?: number }) {
  const router = useRouter();
  const [fav, setFav] = React.useState(!!product.is_favorite);
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
      onPress={() => router.push(`/product/${product.id}`)}
      style={[styles.card, width ? { width } : { flex: 1 }]}
    >
      <View style={styles.imgWrap}>
        <Image source={{ uri: resolveImage(product.image_url) }} style={styles.img} contentFit="cover" transition={200} />
        {discount > 0 && (
          <View style={styles.badgePos}>
            <Badge text={`خصم ${discount}%`} color={colors.error} textColor="#fff" />
          </View>
        )}
        <Pressable testID={`fav-${product.id}`} onPress={toggleFav} style={styles.favBtn} hitSlop={8}>
          <Feather name="heart" size={16} color={fav ? colors.error : colors.onSurfaceTertiary} style={fav ? { opacity: 1 } : {}} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <T weight="semi" numberOfLines={2} style={styles.name}>{product.name}</T>
        <View style={styles.priceRow}>
          <View style={{ flex: 1 }}>
            <T weight="displayBold" size={type.lg} color={colors.brandPrimary}>{formatPrice(product.price)}</T>
            {product.old_price ? (
              <T size={type.sm} color={colors.muted} style={styles.old}>{formatPrice(product.old_price)}</T>
            ) : null}
          </View>
          <Pressable
            testID={`add-cart-${product.id}`}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAdd?.(product);
            }}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
          >
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  imgWrap: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceSecondary },
  img: { width: "100%", height: "100%" },
  badgePos: { position: "absolute", top: spacing.sm, insetInlineStart: spacing.sm },
  favBtn: { position: "absolute", top: spacing.sm, insetInlineEnd: spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.md },
  name: { minHeight: 40, lineHeight: 20 },
  priceRow: { flexDirection: "row-reverse", alignItems: "flex-end", marginTop: spacing.sm, gap: spacing.sm },
  old: { textDecorationLine: "line-through" },
  addBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
