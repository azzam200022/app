import React, { useState } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";
import { ONBOARDING_SEEN_KEY } from "@/src/lib/onboarding";

const slides = [
  {
    id: "offers",
    title: "عروض ومنتجات متنوعة",
    description: "أجود المنتجات من أفضل الماركات وبأسعار مميزة",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1000&q=85",
  },
  {
    id: "delivery",
    title: "طلبك يوصل لبابك",
    description: "نوصل طلبك بسرعة وأمان إلى باب منزلك",
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?w=1000&q=85",
  },
  {
    id: "everything",
    title: "كل ما تحتاجه.. في مكان واحد",
    description: "تسوق منتجاتك المفضلة بسهولة، واستلم طلبك حتى باب المنزل.",
    image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1000&q=85",
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const finish = async () => {
    await storage.setItem(ONBOARDING_SEEN_KEY, true);
    router.replace("/login");
  };

  const next = () => {
    if (isLast) {
      void finish();
      return;
    }
    setIndex((current) => current + 1);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <View style={styles.stepLabel}>
          <T size={type.sm} color={colors.muted}>{index + 1} / {slides.length}</T>
        </View>
        <Pressable testID="onboarding-skip" onPress={() => void finish()} hitSlop={10} style={styles.skip}>
          <T size={type.sm} color={colors.brandPrimary} weight="semi">تخطي</T>
        </Pressable>
      </View>

      <View style={styles.brand}>
        <Image source={require("../assets/images/logo-binsaleem.png")} style={styles.logo} contentFit="contain" />
        <T size={type.sm} color={colors.onSurfaceSecondary} style={styles.tagline}>كل ما تحتاجه.. في مكان واحد</T>
      </View>

      <View style={styles.imageFrame}>
        <Image source={{ uri: slide.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
        <View style={styles.imageShade} />
        <View style={styles.imageBadge}>
          <Feather name={isLast ? "shopping-cart" : index === 1 ? "truck" : "percent"} size={18} color={colors.brandPrimary} />
        </View>
      </View>

      <View style={styles.copy}>
        <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} style={styles.title}>{slide.title}</T>
        <T size={type.base} color={colors.onSurfaceSecondary} style={styles.description}>{slide.description}</T>
      </View>

      <View style={styles.dots}>
        {slides.map((item, dotIndex) => (
          <View key={item.id} style={[styles.dot, dotIndex === index && styles.dotActive]} />
        ))}
      </View>

      <Pressable testID={isLast ? "onboarding-start" : "onboarding-next"} onPress={next} style={styles.nextButton}>
        <T weight="bold" color="#fff" size={type.base}>{isLast ? "ابدأ التسوق" : "التالي"}</T>
        <Feather name="arrow-left" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  topBar: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topSpacer: { width: 44 },
  stepLabel: { alignItems: "center" },
  skip: { width: 44, alignItems: "flex-end" },
  brand: { alignItems: "center", marginTop: spacing.xs, marginBottom: spacing.md },
  logo: { width: 170, height: 86 },
  tagline: { marginTop: -spacing.sm },
  imageFrame: { width: "100%", height: Math.min(Dimensions.get("window").height * 0.39, 320), borderRadius: 30, overflow: "hidden", backgroundColor: "#DDEBDD" },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(21,61,36,0.08)" },
  imageBadge: { position: "absolute", top: spacing.md, right: spacing.md, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  copy: { alignItems: "center", paddingHorizontal: spacing.sm, marginTop: spacing.xl, minHeight: 102 },
  title: { textAlign: "center", lineHeight: 34 },
  description: { textAlign: "center", lineHeight: 25, marginTop: spacing.sm, maxWidth: width - spacing.xl * 2 },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: spacing.lg, marginBottom: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D8DCD7" },
  dotActive: { width: 22, backgroundColor: colors.brandPrimary },
  nextButton: { height: 54, borderRadius: radius.lg, backgroundColor: colors.brandPrimary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: "auto", shadowColor: colors.brandPrimary, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
});
