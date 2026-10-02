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
 image: require("../assets/images/onboarding-products.png"),
 },
 {
 id: "delivery",
 title: "طلبك يوصل لبابك",
 description: "نوصل طلبك بسرعة وأمان إلى باب منزلك",
 image: require("../assets/images/onboarding-delivery.png"),
 },
 {
 id: "everything",
 title: "كل ما تحتاجه.. في مكان واحد",
 description: "تسوق منتجاتك المفضلة بسهولة، واستلم طلبك حتى باب المنزل.",
 image: require("../assets/images/onboarding-shopping.png"),
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
 
 
 
 
 {index + 1} / {slides.length} 
 
 void finish()} hitSlop={10} style={styles.skip}>
 تخطي 
 
 

 
 
 كل ما تحتاجه.. في مكان واحد 
 

 
 
 
 
 
 
 

 
 {slide.title} 
 {slide.description} 
 

 
 {slides.map((item, dotIndex) => (
 
 ))}
 

 
 {isLast ? "ابدأ التسوق" : "التالي"} 
 
 
 
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
