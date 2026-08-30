import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { ProductCard } from "@/src/components/ProductCard";
import { CategoryChips } from "@/src/components/CategoryChips";
import { api } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { add } = useCart();
  const { show } = useToast();
  const [cats, setCats] = useState<any[]>([]);
  const [selected, setSelected] = useState("الكل");
  const [products, setProducts] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = useCallback(async (cat: string) => {
    const p = await api.products(cat === "الكل" ? {} : { category: cat });
    setProducts(p);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([api.categories(), api.products({ offers: true })]);
      setCats(c);
      setOffers(o.slice(0, 6));
      await loadProducts(selected);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [selected, loadProducts, show]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const onSelect = async (c: string) => {
    setSelected(c);
    setLoading(true);
    try { await loadProducts(c); } finally { setLoading(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const onAdd = async (p: any) => {
    try {
      await add(p.id, 1);
      show("تمت الإضافة إلى السلة");
    } catch (e: any) { show(e.message, "error"); }
  };

  const chips = ["الكل", ...cats.map((c) => c.name)];

  const header = (
    <View>
      {/* Hero */}
      <Pressable style={styles.hero} onPress={() => router.push("/offers")}>
        <Image source={{ uri: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(31,69,41,0.15)", "rgba(26,31,27,0.9)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroContent}>
          <View style={styles.heroBadge}><T size={type.sm} weight="bold" color="#1A1A1A">عروض حصرية</T></View>
          <T weight="displayBold" size={type["2xl"]} color="#fff" style={{ marginTop: spacing.sm }}>وفّر أكثر مع خصومات اليوم</T>
          <T color="rgba(255,255,255,0.85)">تسوّق أفخر المنتجات بأفضل الأسعار</T>
          <View style={styles.heroCta}>
            <T weight="bold" color={colors.gold}>تسوّق العروض</T>
            <Feather name="arrow-left" size={16} color={colors.gold} />
          </View>
        </View>
      </Pressable>

      {/* Categories */}
      <View style={styles.sectionHead}>
        <T weight="displayBold" size={type.xl}>التصنيفات</T>
      </View>
      <CategoryChips categories={chips} selected={selected} onSelect={onSelect} />

      {/* Offers row */}
      {offers.length > 0 && selected === "الكل" && (
        <View>
          <View style={styles.sectionHead}>
            <T weight="displayBold" size={type.xl}>عروض مميزة</T>
            <Pressable onPress={() => router.push("/offers")}><T color={colors.brandPrimary} weight="semi">عرض الكل</T></Pressable>
          </View>
          <FlatList
            horizontal
            inverted={Platform.OS !== "web"}
            data={offers}
            keyExtractor={(i) => i.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <View style={{ width: 160 }}><ProductCard product={item} onAdd={onAdd} width={160} /></View>
            )}
          />
        </View>
      )}

      <View style={styles.sectionHead}>
        <T weight="displayBold" size={type.xl}>{selected === "الكل" ? "كل المنتجات" : selected}</T>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Sticky header */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.topRow}>
          <Image source={require("../../assets/images/logo-binsaleem.png")} style={styles.brandLogo} contentFit="contain" />
          <View style={styles.topActions}>
            <Pressable testID="search-btn" onPress={() => router.push("/search")} style={styles.iconBtn}>
              <Feather name="search" size={19} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="fav-nav" onPress={() => router.push("/favorites")} style={styles.iconBtn}>
              <Feather name="heart" size={19} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.id}
          numColumns={2}
          ListHeaderComponent={header}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: spacing["2xl"], gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} />}
          ListEmptyComponent={<View style={{ padding: spacing["2xl"], alignItems: "center" }}><T color={colors.muted}>لا توجد منتجات في هذا التصنيف</T></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: "#fff", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  topRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  topActions: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  brandLogo: { width: 118, height: 34 },
  hero: { height: 168, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: "hidden" },
  heroContent: { flex: 1, padding: spacing.lg, justifyContent: "flex-end" },
  heroBadge: { backgroundColor: colors.gold, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  heroCta: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
