import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  const [error, setError] = useState("");
  const timer = useRef<any>(null);
  const barcodeResultRef = useRef(false);
  const scannedRef = useRef(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    let active = true;
    if (timer.current) clearTimeout(timer.current);
    setError("");
    const query = q.trim();
    if (!query) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    timer.current = setTimeout(async () => {
      setSearched(true);
      try {
        const nextResults = await api.products({ search: query });
        if (active) setResults(nextResults);
      } catch (e: any) {
        if (!active) return;
        setResults([]);
        const message = e?.message || "تعذر تحميل نتائج البحث";
        setError(message);
        show(message, "error");
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, show]);

  const openBarcodeScanner = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        show(next.canAskAgain ? "نحتاج إلى إذن الكاميرا لمسح الباركود" : "فعّل الكاميرا من إعدادات الجهاز", "error");
        if (!next.canAskAgain) Linking.openSettings().catch(() => undefined);
        return;
      }
    }
    scannedRef.current = false;
    setScannerOpen(true);
  };

  const closeBarcodeScanner = () => {
    scannedRef.current = false;
    setScannerOpen(false);
  };

  const onBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const barcode = data?.trim();
    if (!barcode) return;
    scannedRef.current = true;
    if (timer.current) clearTimeout(timer.current);
    setScannerOpen(false);
    setError("");
    setLoading(true);
    setSearched(true);
    setResults([]);
    if (q !== barcode) {
      barcodeResultRef.current = true;
      setQ(barcode);
    }
    try {
      const product = await api.productByBarcode(barcode);
      setResults([product]);
    } catch (e: any) {
      const message = e?.message || "لم نعثر على منتج بهذا الباركود";
      setResults([]);
      setError(message);
      show(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const onAdd = async (p: any) => { try { await add(p.id, 1); show("تمت الإضافة إلى السلة"); } catch (e: any) { show(e.message, "error"); } };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="search-back" onPress={() => router.back()} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput testID="search-input" style={styles.input} placeholder="ابحث باسم المنتج أو امسح الباركود" placeholderTextColor={colors.muted} value={q} onChangeText={(value) => { barcodeResultRef.current = false; setQ(value); }} autoFocus textAlign="right" />
          {q ? <Pressable testID="search-clear" accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => { barcodeResultRef.current = false; setQ(""); }} hitSlop={8}><Feather name="x" size={18} color={colors.muted} /></Pressable> : null}
          <Pressable testID="barcode-scan" accessibilityRole="button" accessibilityLabel="مسح باركود المنتج" onPress={openBarcodeScanner} hitSlop={8}><Feather name="camera" size={19} color={colors.brandPrimary} /></Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : error ? (
        <View style={styles.center}><EmptyState icon="alert-circle" title="تعذر تحميل النتائج" subtitle={error} /></View>
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
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={closeBarcodeScanner}>
        <View style={[styles.scannerRoot, { paddingTop: insets.top }]}>
          <View style={styles.scannerHeader}>
            <T weight="displayBold" size={type.lg}>مسح باركود المنتج</T>
            <Pressable testID="barcode-close" accessibilityRole="button" accessibilityLabel="إغلاق ماسح الباركود" onPress={closeBarcodeScanner} hitSlop={10} style={styles.closeScanner}>
              <Feather name="x" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
              onBarcodeScanned={scannedRef.current ? undefined : onBarcodeScanned}
            >
              <View style={styles.scanFrame} />
              <View style={styles.scanHint}><T color="#fff" weight="semi">وجّه الكاميرا نحو باركود المنتج</T></View>
            </CameraView>
          ) : (
            <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48 },
  input: { flex: 1, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, height: "100%", borderWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scannerRoot: { flex: 1, backgroundColor: "#000" },
  scannerHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff" },
  closeScanner: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  camera: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: "72%", aspectRatio: 1.8, borderWidth: 2, borderColor: "#fff", borderRadius: radius.md },
  scanHint: { position: "absolute", bottom: spacing["2xl"], backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
});
