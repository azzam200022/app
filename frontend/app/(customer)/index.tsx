import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform, Animated, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { ProductCard } from "@/src/components/ProductCard";
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
  const [offers, setOffers] = useState<any[]>(() => getCachedProducts({ offers: true })?.slice(0, 6) || []);
  const [banners, setBanners] = useState<any[]>(() => getCachedBanners() || []);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [loading, setLoading] = useState(() => getCachedProducts() === undefined);
  const [productsLoading, setProductsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const categoryRequest = React.useRef(0);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const listRef = React.useRef<FlatList<any>>(null);
  const compactHeaderRef = React.useRef(false);
  const scrollTopRef = React.useRef(false);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const collapseDistance = 96;
  const fullBarHeight = insets.top + spacing.xs + 40 + spacing.sm;
  const barHeight = scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [fullBarHeight, insets.top + 36], extrapolate: "clamp" });
  const fullRowHeight = scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [40, 0], extrapolate: "clamp" });
  const fullRowOpacity = scrollY.interpolate({ inputRange: [0, 56, collapseDistance], outputRange: [1, 0.35, 0], extrapolate: "clamp" });
  const compactSearchOpacity = scrollY.interpolate({ inputRange: [0, 56, collapseDistance], outputRange: [0, 0.7, 1], extrapolate: "clamp" });
  const compactSearchScale = scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [0.8, 1], extrapolate: "clamp" });
  const logoH = scrollY.interpolate({ inputRange: [0, 70], outputRange: [34, 24], extrapolate: "clamp" });
  const logoW = scrollY.interpolate({ inputRange: [0, 70], outputRange: [118, 84], extrapolate: "clamp" });
  const barPadBottom = scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [spacing.sm, 0], extrapolate: "clamp" });
  const barPadTopExtra = scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [spacing.xs, 0], extrapolate: "clamp" });
  const handleScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
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
      },
    },
  ), [scrollY]);

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
    ]);
    const [c, o, p, b] = results;
    if (c.status === "fulfilled") setCats(c.value);
    if (o.status === "fulfilled") setOffers(Array.isArray(o.value) ? o.value.slice(0, 6) : []);
    if (p.status === "fulfilled") setProducts(p.value);
    if (b.status === "fulfilled") {
      setBanners(Array.isArray(b.value) ? b.value : []);
      setBannerIndex(0);
    }
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) show(failed.reason?.message || "تعذر تحميل بعض البيانات", "error");
    setLoading(false);
  }, [selected, show]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const onSelect = useCallback((c: string) => {
    setSelected(c);
    void loadProducts(c);
  }, [loadProducts]);

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
    cart.items.forEach((item) => { result[item.product_id] = item.quantity; });
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
    const quantity = cart.items.find((item) => item.product_id === p.id)?.quantity || 0;
    try {
      if (quantity <= 1) await remove(p.id);
      else await setQty(p.id, quantity - 1);
    } catch (e: any) {
      show(e.message, "error");
    }
  }, [cart.items, remove, setQty, show]);

  const header = (
    <View>
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
                <LinearGradient colors={["rgba(31,69,41,0.15)", "rgba(26,31,27,0.9)"]} style={StyleSheet.absoluteFill} />
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
          <LinearGradient colors={["rgba(31,69,41,0.15)", "rgba(26,31,27,0.9)"]} style={StyleSheet.absoluteFill} />
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
        <T weight="displayBold" size={type.xl}>التصنيفات</T>
      </View>
      <CategoryCircles items={[{ name: "الكل" }, ...cats.map((c: any) => ({ name: c.name, image: c.image }))]} selected={selected} onSelect={onSelect} />

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
              <View style={{ width: 160 }}><ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} width={160} /></View>
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
      {/* Collapses to a small search control while scrolling */}
      <Animated.View style={[styles.topBar, { height: barHeight, paddingTop: Animated.add(new Animated.Value(insets.top), barPadTopExtra), paddingBottom: barPadBottom }]}>
        <Animated.View style={[styles.fullHeader, { height: fullRowHeight, opacity: fullRowOpacity }]}>
          <View style={styles.topRow}>
            <Animated.View style={{ width: logoW, height: logoH }}>
              <Image source={require("../../assets/images/logo-binsaleem.png")} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Animated.View>
            <View style={styles.topActions}>
              <Pressable testID="search-btn" onPress={() => router.push("/search")} style={styles.iconBtn}>
                <Feather name="search" size={19} color={colors.onSurface} />
              </Pressable>
              <Pressable testID="fav-nav" onPress={() => router.push("/favorites")} style={styles.iconBtn}>
                <Feather name="heart" size={19} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>
        </Animated.View>

        <Animated.View pointerEvents={isCompactHeader ? "auto" : "none"} style={[styles.compactSearch, { top: insets.top + 2, opacity: compactSearchOpacity, transform: [{ scale: compactSearchScale }] }]}>
          <Pressable testID="compact-search-btn" onPress={() => router.push("/search")} style={styles.compactSearchBtn} accessibilityLabel="البحث">
            <Feather name="search" size={17} color={colors.onSurface} />
          </Pressable>
        </Animated.View>
      </Animated.View>

      <Animated.FlatList
           ref={listRef}
           data={products}
           keyExtractor={(i) => i.id}
           numColumns={2}
           ListHeaderComponent={header}
           columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
           contentContainerStyle={{ paddingBottom: spacing["2xl"], gap: spacing.md }}
           initialNumToRender={12}
           maxToRenderPerBatch={8}
           windowSize={5}
           removeClippedSubviews={Platform.OS !== "web"}
           scrollEventThrottle={16}
           onScroll={handleScroll}
           refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
           renderItem={({ item }) => <ProductCard product={item} onAdd={onAdd} onIncrease={onIncrease} onDecrease={onDecrease} quantity={quantities[item.id] || 0} />}
           ListEmptyComponent={loading ? <View style={{ padding: spacing["2xl"], alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View> : <View style={{ padding: spacing["2xl"], alignItems: "center" }}><T color={colors.muted}>لا توجد منتجات في هذا التصنيف</T></View>}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: "#fff", paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, overflow: "hidden", zIndex: 10 },
  fullHeader: { overflow: "hidden" },
  topRow: { height: 40, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  topActions: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  compactSearch: { position: "absolute", left: spacing.lg, width: 32, height: 32, zIndex: 2 },
  compactSearchBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  scrollTop: { position: "absolute", right: spacing.lg, bottom: spacing.lg, zIndex: 20 },
  scrollTopBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  brandLogo: { width: 118, height: 34 },
  hero: { height: 168, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: "hidden" },
  heroSlide: { width: Dimensions.get("window").width - spacing.lg * 2, height: 168 },
  dots: { position: "absolute", bottom: spacing.sm, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  dotActive: { width: 18, backgroundColor: colors.gold },
  heroContent: { flex: 1, padding: spacing.lg, justifyContent: "flex-end" },
  heroBadge: { backgroundColor: colors.gold, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  heroCta: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
