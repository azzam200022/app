import React, { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
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
    id: "products",
    title: "منتجات متنوعة",
    description:
      "أغذية ومشروبات، مواد منزلية، مستلزمات العناية،\nاحتياجات الأطفال والألعاب وأكثر من ذلك",
    image: require("../assets/images/onboarding-products.png"),
  },
  {
    id: "shopping",
    title: "تسوق بكل سهولة",
    description:
      "استخدم تطبيقنا لتصفح المنتجات، وإضافة ما تحتاجه\nإلى سلتك بكل سرعة وأمان",
    image: require("../assets/images/onboarding-shopping.png"),
  },
  {
    id: "delivery",
    title: "توصيل إلى باب منزلك",
    description: "نخدمك بسرعة واهتمام لنوصل طلبك\nإلى أينما كنت",
    image: require("../assets/images/onboarding-delivery.png"),
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const availableHeight = height - insets.top - insets.bottom;
  const imageHeight = Math.min(availableHeight * 0.45, 390);

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
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.md,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.decorations}>
        <View style={[styles.cornerRing, styles.topLeftRing]} />
        <View style={[styles.cornerOrb, styles.topLeftOrb]} />
        <View style={[styles.cornerWash, styles.topRightWash]} />
        <View style={[styles.cornerWash, styles.bottomLeftWash]} />
        <View style={[styles.cornerRing, styles.bottomRightRing]} />
        <View style={[styles.cornerOrb, styles.bottomRightOrb]} />
      </View>

      <View style={styles.brand}>
        <Image
          source={require("../assets/images/logo-binsaleem.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <T
          size={type.sm}
          color={colors.onSurfaceSecondary}
          style={styles.tagline}
        >
          كل ما تحتاجه.. في مكان واحد
        </T>
      </View>

      <View style={[styles.imageFrame, { height: imageHeight }]}>
        <Image
          source={slide.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
        />
      </View>

      <View style={styles.copy}>
        <T
          weight="displayBold"
          size={type["2xl"]}
          color={colors.brandPrimary}
          style={styles.title}
        >
          {slide.title}
        </T>
        <T
          size={type.base}
          color={colors.onSurfaceSecondary}
          style={[styles.description, { maxWidth: width - spacing.xl * 2 }]}
        >
          {slide.description}
        </T>
      </View>

      <View
        style={styles.dots}
        accessibilityRole="progressbar"
        accessibilityLabel={`الشريحة ${index + 1} من ${slides.length}`}
        accessibilityValue={{ min: 1, max: slides.length, now: index + 1 }}
      >
        {slides.map((item, dotIndex) => (
          <View
            key={item.id}
            style={[styles.dot, dotIndex === index && styles.dotActive]}
          />
        ))}
      </View>

      <Pressable
        testID={isLast ? "onboarding-start" : "onboarding-next"}
        onPress={next}
        style={styles.nextButton}
        accessibilityRole="button"
        accessibilityLabel={isLast ? "ابدأ التسوق" : "التالي"}
      >
        <T weight="bold" color={colors.onBrandPrimary} size={type.base}>
          {isLast ? "ابدأ التسوق" : "التالي"}
        </T>
        <Feather name="arrow-left" size={18} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  decorations: { ...StyleSheet.absoluteFillObject },
  cornerRing: {
    position: "absolute",
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 4,
    borderColor: colors.gold,
  },
  cornerOrb: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.brandPrimary,
  },
  topLeftRing: { top: -82, left: -79 },
  topLeftOrb: { top: -69, left: -69 },
  cornerWash: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.surfaceSecondary,
    opacity: 0.9,
  },
  topRightWash: { top: -53, right: -52 },
  bottomLeftWash: { bottom: -52, left: -53 },
  bottomRightRing: { right: -81, bottom: -82 },
  bottomRightOrb: { right: -68, bottom: -69 },
  brand: { alignItems: "center", marginBottom: spacing.md },
  logo: { width: 170, height: 84 },
  tagline: { marginTop: -spacing.xs },
  imageFrame: {
    width: "100%",
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  copy: {
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    marginTop: spacing.lg,
    minHeight: 100,
  },
  title: { textAlign: "center", lineHeight: 36 },
  description: {
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.xs,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.brandPrimary },
  nextButton: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: "auto",
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
});
