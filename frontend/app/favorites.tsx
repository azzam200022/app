import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { ProductCard } from "@/src/components/ProductCard";
import { api } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { add } = useCart();
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { try { setItems(await api.favorites()); } catch {} finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdd = async (p: any) => { try { await add(p.id, 1); show("تمت الإضافة إلى السلة"); } catch (e: any) { show(e.message, "error"); } };
  const onToggleFav = (id: string, val: boolean) => { if (!val) setItems((prev) => prev.filter((p) => p.id !== id)); };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="fav-back" onPress={() => router.back()} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <T weight="displayBold" size={type.xl}>المفضلة</T>
        <View style={{ width: 40 }} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : items.length === 0 ? (
        <View style={styles.center}><EmptyState icon="heart" title="لا توجد مفضلات" subtitle="اضغط على القلب لحفظ منتجاتك المفضلة" /></View>
      ) : (
        <FlatList data={items} keyExtractor={(i) => i.id} numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingVertical: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} onToggleFav={onToggleFav} />} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
