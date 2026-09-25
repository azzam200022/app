import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { ProductCard } from "@/src/components/ProductCard";
import { api, resolveImage } from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function CategoryDetail() {
  const { category: rawCategory } = useLocalSearchParams<{ category: string }>();
  const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory || "أخرى";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, add, setQty, remove } = useCart();
  const { show } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categoryImage, setCategoryImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);

  const loadProducts = useCallback(async (branchId: string | null) => {
    setProductsLoading(true);
    try {
      const result = await api.products({ category, ...(branchId ? { branch_id: branchId } : {}) });
      setProducts(Array.isArray(result) ? result : []);
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setProductsLoading(false);
    }
  }, [category, show]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [branchResult, categories] = await Promise.all([api.categoryBranches(category), api.categories()]);
        if (!active) return;
        setBranches(Array.isArray(branchResult) ? branchResult : []);
        const match = Array.isArray(categories) ? categories.find((item: any) => item.name === category) : null;
        setCategoryImage(match?.image || "");
        await loadProducts(null);
      } catch (error: any) {
        if (active) show(error.message, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [category, loadProducts, show]);

  const quantities = useMemo(() => {
    const result: Record<string, number> = {};
    cart.items.forEach((item) => { result[item.product_id] = item.quantity; });
    return result;
  }, [cart.items]);

  const onAdd = useCallback(async (product: any) => {
    try {
      await add(product.id, 1);
      show("تمت الإضافة إلى السلة");
    } catch (error: any) {
      show(error.message, "error");
    }
  }, [add, show]);

  const onIncrease = useCallback(async (product: any) => {
    try { await add(product.id, 1); } catch (error: any) { show(error.message, "error"); }
  }, [add, show]);

  const onDecrease = useCallback(async (product: any) => {
    const quantity = cart.items.find((item) => item.product_id === product.id)?.quantity || 0;
    try {
      if (quantity <= 1) await remove(product.id);
      else await setQty(product.id, quantity - 1);
    } catch (error: any) {
      show(error.message, "error");
    }
  }, [cart.items, remove, setQty, show]);

  const selectBranch = (branchId: string | null) => {
    setSelectedBranch(branchId);
    void loadProducts(branchId);
  };

  const header = (
    <View>
      <View style={styles.hero}>
        {!!categoryImage && <Image source={{ uri: resolveImage(categoryImage) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <View style={styles.heroScrim} />
        <View style={styles.heroContent}>
          <T color={colors.gold} size={type.sm} weight="bold">استكشف القسم</T>
          <T color="#fff" weight="displayBold" size={type["2xl"]} style={styles.heroTitle}>{category}</T>
          <T color="rgba(255,255,255,0.82)" size={type.sm}>اختر العلامة التي تفضلها للوصول إلى منتجاتها</T>
        </View>
      </View>

      {branches.length > 0 && (
        <View style={styles.branchSection}>
          <View style={styles.sectionHeading}>
            <View>
              <T weight="displayBold" size={type.xl}>العلامات التجارية</T>
              <T color={colors.muted} size={type.sm}>تصفح منتجات كل علامة</T>
            </View>
            <View style={styles.countPill}><T size={type.sm} weight="bold" color={colors.brandPrimary}>{branches.length}</T></View>
          </View>
          <FlatList
            horizontal
            inverted={Platform.OS !== "web"}
            data={[{ id: "all", name: "الكل", image_url: categoryImage, product_count: products.length }, ...branches]}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.branchList}
            renderItem={({ item }) => {
              const active = item.id === "all" ? !selectedBranch : selectedBranch === item.id;
              return (
                <Pressable testID={`branch-${item.id}`} onPress={() => selectBranch(item.id === "all" ? null : item.id)} style={styles.branchItem}>
                  <View style={[styles.branchImageWrap, active && styles.branchImageActive]}>
                    {item.image_url ? <Image source={{ uri: resolveImage(item.image_url) }} style={styles.branchImage} contentFit="cover" /> : <Feather name="tag" size={24} color={colors.brandPrimary} />}
                    {active && <View style={styles.branchCheck}><Feather name="check" size={12} color="#fff" /></View>}
                  </View>
                  <T weight={active ? "bold" : "semi"} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} size={type.sm} numberOfLines={1} style={styles.branchName}>{item.name}</T>
                  <T color={colors.muted} size={10}>{item.product_count || 0} منتج</T>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      <View style={styles.productsHeading}>
        <View>
          <T weight="displayBold" size={type.xl}>{selectedBranch ? branches.find((item) => item.id === selectedBranch)?.name : category}</T>
          <T color={colors.muted} size={type.sm}>{products.length} منتج متاح</T>
        </View>
        {productsLoading && <ActivityIndicator color={colors.brandPrimary} />}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="category-back" onPress={() => router.back()} style={styles.circleButton}>
          <Feather name="arrow-right" size={21} color={colors.onSurface} />
        </Pressable>
        <T weight="displayBold" size={type.lg}>تصفح القسم</T>
        <Pressable testID="category-cart" onPress={() => router.push("/(customer)/cart")} style={styles.circleButton}>
          <Feather name="shopping-bag" size={19} color={colors.onSurface} />
          {cart.count > 0 && <View style={styles.cartDot}><T color="#fff" size={9} weight="bold">{cart.count > 9 ? "9+" : cart.count}</T></View>}
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          ListHeaderComponent={header}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing["2xl"] }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} />}
          ListEmptyComponent={<View style={styles.empty}><EmptyState icon="package" title="لا توجد منتجات هنا" subtitle="جرّب اختيار علامة تجارية أخرى" /></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  circleButton: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", position: "relative" },
  cartDot: { position: "absolute", top: -3, end: -3, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.surface },
  content: { paddingTop: spacing.md, gap: spacing.md },
  hero: { height: 178, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.brandPrimary },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(14,35,23,0.64)" },
  heroContent: { flex: 1, justifyContent: "flex-end", alignItems: "flex-start", padding: spacing.xl },
  heroTitle: { marginTop: spacing.xs },
  branchSection: { marginTop: spacing.xl },
  sectionHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  countPill: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  branchList: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  branchItem: { width: 86, alignItems: "center" },
  branchImageWrap: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  branchImageActive: { borderColor: colors.brandPrimary },
  branchImage: { width: "100%", height: "100%" },
  branchCheck: { position: "absolute", end: 0, bottom: 0, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  branchName: { marginTop: spacing.xs, maxWidth: 86, textAlign: "center" },
  productsHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.xs },
  column: { gap: spacing.md, paddingHorizontal: spacing.lg },
  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});