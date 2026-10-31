import React, { useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotanicalPattern } from "@/src/components/BotanicalPattern";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, PageHeading } from "@/src/components/ui";
import { resolveImage, formatPrice } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, reload, setQty, remove, loading } = useCart();
  const { show } = useToast();

  useFocusEffect(useCallback(() => { void reload(true); }, [reload]));

  const changeQty = (id: string, qty: number, saleUnit: "piece" | "wholesale") => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    void setQty(id, qty, saleUnit).catch((error: any) => show(error.message, "error"));
  };

  const removeItem = (id: string, saleUnit: "piece" | "wholesale") => {
    void remove(id, saleUnit).catch((error: any) => show(error.message, "error"));
  };

  return (
    <View style={styles.root}>
      <BotanicalPattern />
      <PageHeading title="سلة المشتريات" subtitle={cart.count > 0 ? `${cart.count} منتج في سلتك` : undefined} style={{ paddingTop: insets.top + spacing.md }} />

      {loading && cart.items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : cart.items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="shopping-bag" size={30} color={colors.brandSecondary} />
            </View>
            <T weight="displayBold" size={type.xl} style={styles.emptyTitle}>سلتك فارغة</T>
            <T color={colors.muted} style={styles.emptyCopy}>أضف منتجاتك المفضلة، وستجدها هنا جاهزة لإتمام طلبك.</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تصفح المنتجات"
              onPress={() => router.replace("/(customer)")}
              style={({ pressed }) => [styles.browseButton, pressed && styles.browsePressed]}
            >
              <View style={styles.browseIcon}>
                <Feather name="arrow-left" size={16} color={colors.brandPrimary} />
              </View>
              <T weight="bold" color={colors.brandPrimary}>تصفّح المنتجات</T>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={cart.items}
            keyExtractor={(i) => `${i.product_id}:${i.sale_unit || "piece"}`}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.item} testID={`cart-item-${item.product_id}${item.sale_unit === "wholesale" ? "-wholesale" : ""}`}>
                <Image source={{ uri: resolveImage(item.image_url) }} style={styles.itemImg} contentFit="cover" cachePolicy="memory-disk" />
                <View style={{ flex: 1 }}>
                  <T weight="semi" numberOfLines={2}>{item.name}</T>
                  <T color={colors.muted} size={type.xs} style={{ marginTop: 2 }}>{item.unit_label || "قطعة"}{item.sale_unit === "wholesale" && item.units_per_unit ? ` • ${item.units_per_unit} قطع` : ""}</T>
                  <T weight="displayBold" color={colors.brandPrimary} style={{ marginTop: 4 }}>{formatPrice(item.price)} / {item.unit_label || "قطعة"}</T>
                  <View style={styles.qtyRow}>
                    <View style={styles.stepper}>
                      <Pressable testID={`dec-${item.product_id}${item.sale_unit === "wholesale" ? "-wholesale" : ""}`} onPress={() => changeQty(item.product_id, item.quantity - 1, item.sale_unit || "piece")} style={styles.stepBtn}>
                        <Feather name="minus" size={16} color={colors.onSurface} />
                      </Pressable>
                      <T weight="bold" style={{ minWidth: 24, textAlign: "center" }}>{item.quantity}</T>
                      <Pressable testID={`inc-${item.product_id}${item.sale_unit === "wholesale" ? "-wholesale" : ""}`} onPress={() => changeQty(item.product_id, item.quantity + 1, item.sale_unit || "piece")} style={styles.stepBtn}>
                        <Feather name="plus" size={16} color={colors.onSurface} />
                      </Pressable>
                    </View>
                    <Pressable testID={`remove-${item.product_id}${item.sale_unit === "wholesale" ? "-wholesale" : ""}`} onPress={() => removeItem(item.product_id, item.sale_unit || "piece")} hitSlop={8}>
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
            <Button title="متابعة الدفع" icon="arrow-left" onPress={() => router.push("/checkout")} testID="go-checkout" />
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
  emptyState: { width: "100%", maxWidth: 360, alignItems: "center", paddingHorizontal: spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  emptyTitle: { marginTop: spacing.md },
  emptyCopy: { marginTop: spacing.xs, maxWidth: 280, textAlign: "center", lineHeight: 22 },
  browseButton: { marginTop: spacing.lg, flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  browseIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  browsePressed: { opacity: 0.72 },
  item: { flexDirection: "row-reverse", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemImg: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  qtyRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, minWidth: 124, height: 46, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, padding: 4 },
  stepBtn: { width: 35, height: 35, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  footer: { backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  summaryRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
});
