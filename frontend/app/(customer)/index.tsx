import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { ProductCard, ProductCardSkeleton } from "@/src/components/ProductCard";
import { CategoryCircles } from "@/src/components/CategoryCircles";
import {
  api,
  getCachedBanners,
  getCachedCategories,
  getCachedProducts,
  resolveImage,
} from "@/src/lib/api";
import { useCart } from "@/src/context/CartContext";
import { useToast } from "@/src/context/ToastContext";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, add, setQty, remove } = useCart();
  const { show } = useToast();
  const [cats, setCats] = useState<any[]>(() => getCachedCategories() || []);
  const [selected, setSelected] = useState("الكل");
  const [products, setProducts] = useState<any[]>(() => getCachedProducts() || []);
  const [offers, setOffers] = useState<any[]>(() => getCachedProducts({ offers: true })?.slice(0, 2) || []);
  const [bestsellers, setBestsellers] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>(() => getCachedBanners() || []);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [loading, setLoading] = useState(() => getCachedProducts() === undefined);
  const [initialSectionsLoaded, setInitialSectionsLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const categoryRequest = React.useRef(0);
  const listRef = React.useRef<FlatList<any>>(null);
  const compactHeaderRef = React.useRef(false);
  const scrollTopRef = React.useRef(false);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const fullBarHeight = insets.top + spacing.xs + 56 + spacing.sm;
  const handleScroll = useCallback((event: any) => {
    const offset = event.nativeEvent.contentOffset.y;
    const nextCompact = offset > 48;
    const nextShowScrollTop = offset > 220;
    if (nextCompact !== compactHeaderRef.current) {
      compactHeaderRef.current = nextCompact;
      setIsCompactHeader(nextCompact);
    }
    if (nextShowScrollTop !== scrollTopRef.current) {
      scrollTopRef.current = nextShowScrollTop;
      setShowScrollTop(nextShowScrollTop);
    }
  }, []);


  const loadProducts = useCallback(async (cat: string, force = false) => {
    const requestId = ++categoryRequest.current;
    setProductsLoading(true);
    try {
      const p = await api.products(cat === "الكل" ? {} : { category: cat }, force);
      if (requestId === categoryRequest.current) setProducts(p);
    } catch (e: any) {
      if (requestId === categoryRequest.current) show(e.message, "error");
    } finally {
      if (requestId === categoryRequest.current) setProductsLoading(false);
    }
  }, [show]);

  const loadAll = useCallback(async (force = false) => {
    const results = await Promise.allSettled([
      api.categories(force),
      api.products({ offers: true }, force),
      api.products(selected === "الكل" ? {} : { category: selected }, force),
      api.banners(force),
      api.bestsellers(),
    ]);
    const [c, o, p, b, best] = results;
    if (c.status === "fulfilled") setCats(c.value);
    if (o.status === "fulfilled") setOffers(Array.isArray(o.value) ? o.value.slice(0, 2) : []);
    if (p.status === "fulfilled") setProducts(p.value);
    if (b.status === "fulfilled") {
      setBanners(Array.isArray(b.value) ? b.value : []);
      setBannerIndex(0);
    }
    if (best.status === "fulfilled") setBestsellers(Array.isArray(best.value) ? best.value.slice(0, 3) : []);
    const failed = results.slice(0, 4).find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) show(failed.reason?.message || "تعذر تحميل بعض البيانات", "error");
    setLoading(false);
    setInitialSectionsLoaded(true);
  }, [selected, show]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const onSelect = useCallback((c: string) => {
    if (c !== "الكل") {
      router.push({ pathname: "/category/[category]", params: { category: c } });
      return;
    }
    setSelected(c);
    void loadProducts(c);
  }, [loadProducts, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll(true);
    setRefreshing(false);
  };

  const onAdd = useCallback(async (p: any) => {
    try {
      await add(p.id, 1);
      show("تمت الإضافة إلى السلة");
    } catch (e: any) { show(e.message, "error"); }
  }, [add, show]);

  const quantities = useMemo(() => {
    const result: Record<string, number> = {};
    cart.items.forEach((item) => { if (!item.sale_unit || item.sale_unit === "piece") result[item.product_id] = item.quantity; });
    return result;
  }, [cart.items]);

  const onIncrease = useCallback(async (p: any) => {
    try {
      await add(p.id, 1);
    } catch (e: any) {
      show(e.message, "error");
    }
  }, [add, show]);

  const onDecrease = useCallback(async (p: any) => {
    const quantity = cart.items.find((item) => item.product_id === p.id && (!item.sale_unit || item.sale_unit === "piece"))?.quantity || 0;
    try {
      if (quantity <= 1) await remove(p.id, "piece");
      else await setQty(p.id, quantity - 1, "piece");
    } catch (e: any) {
      show(e.message, "error");
    }
  }, [cart.items, remove, setQty, show]);

  const topBar = (
    <View style={[styles.topBar, { height: fullBarHeight, paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm }]}>
      <LinearGradient colors={[colors.surface, colors.surfaceSecondary]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.topRow}>
        <View style={styles.brandLockup} testID="home-brand" accessibilityRole="image" accessibilityLabel="شعار بن سليم سوبرماركت">
          <View style={styles.brandMarkFrame}>
            <Image source={require("../../assets/images/bin-saleem-mark.png")} style={styles.brandMark} contentFit="contain" />
          </View>
          <View style={styles.brandType}>
            <T weight="displayBold" size={type.sm} color={colors.brandPrimary} style={styles.brandEnglish}>BIN SALEEM</T>
            <T weight="bold" size={type.xs} color={colors.brandSecondary} style={styles.brandSubline}>SUPERMARKET</T>
          </View>
        </View>
        <Pressable
          testID="home-search-prompt"
          onPress={() => router.push("/search")}
          style={styles.topSearchPrompt}
          accessibilityRole="button"
          accessibilityLabel="ابحث عن منتج أو تصنيف"
        >
          <Feather name="search" size={16} color={colors.brandPrimary} />
          <T color={colors.muted} size={type.xs} numberOfLines={1} style={styles.searchLabel}>ابحث عن منتج أو تصنيف</T>
        </Pressable>
        <View style={styles.topActions}>
          <Pressable testID="cart-btn" onPress={() => router.push("/cart")} style={styles.iconBtn}>
            <Feather name="shopping-bag" size={19} color={colors.onSurface} />
            {cart.count > 0 && (
              <View style={styles.cartBadge}>
                <T size={type.xs} weight="bold" color={colors.onBrandPrimary}>{cart.count > 9 ? "9+" : String(cart.count)}</T>
              </View>
            )}
          </Pressable>
          <Pressable testID="fav-nav" onPress={() => router.push("/favorites")} style={styles.iconBtn}>
            <Feather name="heart" size={19} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const header = (
    <View>
      {topBar}
      {/* Offers banner carousel */}
      {banners.length > 0 ? (
        <View style={styles.hero}>
          <FlatList
            data={banners}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={(event) => setBannerIndex(Math.round(event.nativeEvent.contentOffset.x / (Dimensions.get("window").width - spacing.lg * 2)))}
            renderItem={({ item }) => (
              <Pressable style={styles.heroSlide} onPress={() => router.push("/offers")}>
                <Image source={{ uri: resolveImage(item.image_url) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={["rgba(36,83,56,0.15)", "rgba(24,35,27,0.9)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.heroContent}>
                  <View style={styles.heroBadge}><T size={type.sm} weight="bold" color="#1A1A1A">عروض حصرية</T></View>
                  <T weight="displayBold" size={type["2xl"]} color="#fff" style={{ marginTop: spacing.sm }}>{item.title || "وفّر أكثر مع خصومات اليوم"}</T>
                  <T color="rgba(255,255,255,0.85)">{item.subtitle || "تسوّق أفخر المنتجات بأفضل الأسعار"}</T>
                  <View style={styles.heroCta}><T weight="bold" color={colors.gold}>تسوّق العروض</T><Feather name="arrow-left" size={16} color={colors.gold} /></View>
                </View>
              </Pressable>
            )}
          />
          {banners.length > 1 && <View style={styles.dots}>{banners.map((item, index) => <View key={item.id} style={[styles.dot, index === bannerIndex && styles.dotActive]} />)}</View>}
        </View>
      ) : (
        <Pressable style={styles.hero} onPress={() => router.push("/offers")}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(36,83,56,0.15)", "rgba(24,35,27,0.9)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}><T size={type.sm} weight="bold" color="#1A1A1A">عروض حصرية</T></View>
            <T weight="displayBold" size={type["2xl"]} color="#fff" style={{ marginTop: spacing.sm }}>وفّر أكثر مع خصومات اليوم</T>
            <T color="rgba(255,255,255,0.85)">تسوّق أفخر المنتجات بأفضل الأسعار</T>
            <View style={styles.heroCta}><T weight="bold" color={colors.gold}>تسوّق العروض</T><Feather name="arrow-left" size={16} color={colors.gold} /></View>
          </View>
        </Pressable>
      )}

      {/* Categories */}
      <View style={styles.sectionHead}>
        <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.sectionTitle}>تسوّق حسب التصنيف</T>
        <View style={styles.sectionRule} />
      </View>
      <CategoryCircles items={[{ name: "الكل" }, ...cats.map((c: any) => ({ name: c.name, image: c.image }))]} selected={selected} onSelect={onSelect} />

      {/* Bestsellers row */}
      {(bestsellers.length > 0 || !initialSectionsLoaded) && selected === "الكل" && (
        <View>
          <View style={styles.sectionHead}>
            <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.sectionTitle}>الأكثر شراءً</T>
            <View style={styles.sectionRule} />
          </View>
          {bestsellers.length > 0 ? (
            <FlatList
              horizontal
              inverted={Platform.OS !== "web"}
              data={bestsellers}
              keyExtractor={(i) => "bestseller-" + i.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
              renderItem={({ item }) => (
                <View style={{ width: 168 }}><ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} width={168} /></View>
              )}
            />
          ) : <ProductRowSkeletons />}
        </View>
      )}

      {/* Offers row */}
      {(offers.length > 0 || !initialSectionsLoaded) && selected === "الكل" && (
        <View>
          <View style={styles.sectionHead}>
            <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.sectionTitle}>عروض مميزة</T>
            <Pressable onPress={() => router.push("/offers")}><T color={colors.brandPrimary} weight="semi">عرض الكل</T></Pressable>
          </View>
          {offers.length > 0 ? (
            <FlatList
              horizontal
              inverted={Platform.OS !== "web"}
              data={offers}
              keyExtractor={(i) => i.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
              renderItem={({ item }) => (
                <View style={{ width: 168 }}><ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} width={168} /></View>
              )}
            />
          ) : <ProductRowSkeletons />}
        </View>
      )}

      <View style={styles.sectionHead}>
        <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.sectionTitle}>{selected === "الكل" ? "كل المنتجات" : selected}</T>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {isCompactHeader && (
        <View style={styles.compactSearch}>
          <Pressable testID="compact-search-btn" onPress={() => router.push("/search")} style={styles.compactSearchBtn} accessibilityLabel="البحث">
            <Feather name="search" size={17} color={colors.onSurface} />
          </Pressable>
        </View>
      )}

          <FlatList
           ref={listRef}
           data={products}
           keyExtractor={(i) => i.id}
           numColumns={2}
           ListHeaderComponent={header}
           columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
           contentContainerStyle={{ paddingBottom: spacing["2xl"], gap: spacing.md }}
           initialNumToRender={12}
           maxToRenderPerBatch={8}
           windowSize={5}
           removeClippedSubviews={Platform.OS !== "web"}
           scrollEventThrottle={32}
           onScroll={handleScroll}
           refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
           renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} />}
           ListEmptyComponent={loading ? <ProductGridSkeleton /> : <View style={{ padding: spacing["2xl"], alignItems: "center" }}><T color={colors.muted}>لا توجد منتجات في هذا التصنيف</T></View>}
           ListFooterComponent={productsLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.md }} /> : null}
         />

      {showScrollTop && (
        <View style={styles.scrollTop}>
          <Pressable testID="scroll-top-btn" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })} style={styles.scrollTopBtn} accessibilityLabel="العودة إلى بداية الصفحة">
            <Feather name="arrow-up" size={21} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ProductRowSkeletons() {
  return (
    <FlatList
      horizontal
      inverted={Platform.OS !== "web"}
      data={["product-skeleton-1", "product-skeleton-2"]}
      keyExtractor={(item) => item}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
      renderItem={() => (
        <View style={{ width: 168 }}><ProductCardSkeleton width={168} /></View>
      )}
    />
  );
}

function ProductGridSkeleton() {
  const cardWidth = (Dimensions.get("window").width - spacing.lg * 2 - spacing.sm) / 2;
  return (
    <View style={styles.loadingGrid}>
      {[0, 1, 2, 3, 4, 5].map((item) => <ProductCardSkeleton key={item} width={cardWidth} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, overflow: "hidden", zIndex: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  topRow: { height: 56, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  brandLockup: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  brandMarkFrame: { width: 50, height: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surface },
  brandMark: { width: 48, height: 42 },
  brandType: { alignItems: "flex-start", justifyContent: "center" },
  brandEnglish: { textAlign: "left", writingDirection: "ltr", lineHeight: 16, letterSpacing: 0.25 },
  brandSubline: { textAlign: "left", writingDirection: "ltr", fontSize: 8, lineHeight: 11, letterSpacing: 1.8 },
  topActions: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  topSearchPrompt: { flex: 1, minWidth: 0, height: 40, marginHorizontal: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  searchLabel: { flex: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", position: "relative" },
  cartBadge: { position: "absolute", top: -3, end: -3, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface },
  compactSearch: { position: "absolute", right: spacing.lg, bottom: spacing.lg + 56, width: 40, height: 40, zIndex: 20 },
  compactSearchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  scrollTop: { position: "absolute", right: spacing.lg, bottom: spacing.lg, zIndex: 20 },
  scrollTopBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  hero: { height: 184, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceInverse, borderWidth: 1, borderColor: colors.border },
  heroSlide: { width: Dimensions.get("window").width - spacing.lg * 2, height: 184 },
  dots: { position: "absolute", bottom: spacing.sm, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  dotActive: { width: 18, backgroundColor: colors.gold },
  heroContent: { flex: 1, padding: spacing.lg, paddingBottom: spacing.xl, justifyContent: "flex-end", alignItems: "flex-start" },
  heroBadge: { backgroundColor: colors.gold, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  heroCta: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { lineHeight: 30 },
  sectionRule: { width: 28, height: 2, backgroundColor: colors.gold, marginStart: spacing.sm, marginTop: 0, borderRadius: 1 },
  loadingGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
