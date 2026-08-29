import React, { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { resolveImage, formatPrice } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, reload, setQty, remove, loading } = useCart();
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const changeQty = async (id: string, qty: number) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setBusy(true);
    try { await setQty(id, qty); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <T weight="displayBold" size={type.xl}>سلة المشتريات</T>
        {cart.count > 0 && <T color={colors.muted}>{cart.count} منتج</T>}
      </View>

      {loading && cart.items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : cart.items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="shopping-cart" title="سلتك فارغة" subtitle="أضف بعض المنتجات الفاخرة لتبدأ التسوق" />
          <Button title="تصفّح المتجر" onPress={() => router.replace("/(customer)")} style={{ marginTop: spacing.lg, paddingHorizontal: spacing["2xl"] }} />
        </View>
      ) : (
        <>
          <FlatList
            data={cart.items}
            keyExtractor={(i) => i.product_id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.item} testID={`cart-item-${item.product_id}`}>
                <Image source={{ uri: resolveImage(item.image_url) }} style={styles.itemImg} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <T weight="semi" numberOfLines={2}>{item.name}</T>
                  <T weight="displayBold" color={colors.brandPrimary} style={{ marginTop: 4 }}>{formatPrice(item.price)}</T>
                  <View style={styles.qtyRow}>
                    <View style={styles.stepper}>
                      <Pressable testID={`dec-${item.product_id}`} onPress={() => changeQty(item.product_id, item.quantity - 1)} style={styles.stepBtn}>
                        <Feather name="minus" size={16} color={colors.onSurface} />
                      </Pressable>
                      <T weight="bold" style={{ minWidth: 24, textAlign: "center" }}>{item.quantity}</T>
                      <Pressable testID={`inc-${item.product_id}`} onPress={() => changeQty(item.product_id, item.quantity + 1)} style={styles.stepBtn}>
                        <Feather name="plus" size={16} color={colors.onSurface} />
                      </Pressable>
                    </View>
                    <Pressable testID={`remove-${item.product_id}`} onPress={() => remove(item.product_id)} hitSlop={8}>
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.summaryRow}>
              <T color={colors.muted}>الإجمالي</T>
              <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary}>{formatPrice(cart.total)}</T>
            </View>
            <Button title="متابعة الدفع" icon="arrow-left" onPress={() => router.push("/checkout")} testID="go-checkout" loading={busy} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  item: { flexDirection: "row-reverse", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemImg: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  qtyRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  footer: { backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  summaryRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
});
