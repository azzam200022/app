import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { ProductCard } from "@/src/components/ProductCard";
import { api } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function Search() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { add } = useCart();
  const { show } = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true); setSearched(true);
      try { setResults(await api.products({ search: q.trim() })); } catch {} finally { setLoading(false); }
    }, 350);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const onAdd = async (p: any) => { try { await add(p.id, 1); show("تمت الإضافة إلى السلة"); } catch (e: any) { show(e.message, "error"); } };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="search-back" onPress={() => router.back()} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput testID="search-input" style={styles.input} placeholder="ابحث عن منتج..." placeholderTextColor={colors.muted} value={q} onChangeText={setQ} autoFocus textAlign="right" />
          {q ? <Pressable onPress={() => setQ("")} hitSlop={8}><Feather name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : !searched ? (
        <View style={styles.center}><EmptyState icon="search" title="ابحث في المتجر" subtitle="اكتب اسم المنتج الذي تريده" /></View>
      ) : results.length === 0 ? (
        <View style={styles.center}><EmptyState icon="frown" title="لا نتائج" subtitle={`لم نجد منتجات لـ "${q}"`} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingVertical: spacing.lg, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48 },
  input: { flex: 1, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, height: "100%" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
