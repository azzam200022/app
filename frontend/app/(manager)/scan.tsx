import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, Platform, Linking, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, uploadImage, resolveImage, formatPrice } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export default function Scan() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"scan" | "form">("scan");
  const [cats, setCats] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [looking, setLooking] = useState(false);
  const scannedRef = useRef(false);

  // form state
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("غذائية");
  const [price, setPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [suggestedImg, setSuggestedImg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => { try { const c = await api.categories(); setCats(c.map((x: any) => x.name)); } catch {} })();
  }, []);

  const ALL_CATS = Array.from(new Set([...cats, "غذائية", "عصائر", "منظفات", "مواد منزليه", "كوزمتك", "حفاظات", "العاب", "الكترونيات", "بقوليات", "ورقيات", "قرطاسية", "أخرى"]));

  const doLookup = async (code: string) => {
    if (!code.trim()) return show("أدخل رقم الباركود", "error");
    setLooking(true);
    try {
      const res = await api.lookup(code.trim());
      setBarcode(code.trim());
      if (res.found) {
        setName(res.name);
        setCategory(res.category);
        setSuggestedImg(res.suggested_image);
        if (res.already_added) show("هذا المنتج مضاف مسبقاً، يمكنك إضافته مجدداً", "info");
        else show("تم العثور على المنتج ✓");
      } else {
        setName("");
        setCategory("أخرى");
        setSuggestedImg(null);
        show("لم يوجد في الكتالوج، أدخل البيانات يدوياً", "info");
      }
      setImageUri(null);
      setPrice(""); setOldPrice("");
      setMode("form");
    } catch (e: any) { show(e.message, "error"); }
    finally { setLooking(false); scannedRef.current = false; }
  };

  const onBarcode = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    doLookup(data);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return show("فعّل صلاحية الصور من الإعدادات", "error");
      return show("نحتاج صلاحية الوصول للصور", "error");
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets?.[0]) setImageUri(res.assets[0].uri);
  };

  const save = async () => {
    if (!name.trim()) return show("أدخل اسم المنتج", "error");
    if (!price || Number(price) <= 0) return show("أدخل سعراً صحيحاً", "error");
    setSaving(true);
    try {
      let image_url = suggestedImg;
      if (imageUri) {
        const up = await uploadImage(imageUri, Platform.OS === "web");
        image_url = up.url;
      }
      await api.createProduct({
        barcode, name: name.trim(), category, price: Number(price),
        old_price: oldPrice ? Number(oldPrice) : null, image_url, stock: 100, is_published: true,
      });
      show("تمت إضافة المنتج بنجاح 🎉");
      setMode("scan"); setManual(""); setName(""); setPrice(""); setOldPrice(""); setImageUri(null); setBarcode("");
    } catch (e: any) { show(e.message, "error"); }
    finally { setSaving(false); }
  };

  // FORM view
  if (mode === "form") {
    const previewImg = imageUri || resolveImage(suggestedImg || "");
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable testID="form-back" onPress={() => setMode("scan")} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
          <T weight="displayBold" size={type.xl}>بيانات المنتج</T>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing["3xl"] }} keyboardShouldPersistTaps="handled">
          {!!barcode && <View style={styles.bcChip}><Feather name="maximize" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>باركود: {barcode}</T></View>}

          <Pressable testID="pick-image" onPress={pickImage} style={styles.imagePicker}>
            {previewImg ? (
              <Image source={{ uri: previewImg }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
            <View style={[styles.imageOverlay, previewImg ? { backgroundColor: "rgba(0,0,0,0.35)" } : {}]}>
              <Feather name="camera" size={26} color={previewImg ? "#fff" : colors.brandPrimary} />
              <T weight="semi" color={previewImg ? "#fff" : colors.onSurface}>{previewImg ? "تغيير الصورة" : "أضف صورة من الاستديو"}</T>
            </View>
          </Pressable>

          <Label text="اسم المنتج" />
          <TextInput testID="f-name" style={styles.input} value={name} onChangeText={setName} placeholder="اسم المنتج" placeholderTextColor={colors.muted} textAlign="right" />

          <Label text="التصنيف" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
            {ALL_CATS.map((c) => (
              <Pressable key={c} testID={`cat-${c}`} onPress={() => setCategory(c)} style={[styles.catChip, category === c ? styles.catActive : styles.catIdle]}>
                <T size={type.sm} weight="semi" color={category === c ? "#fff" : colors.onSurfaceSecondary}>{c}</T>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.priceGrid}>
            <View style={{ flex: 1 }}>
              <Label text="السعر (د.ع)" />
              <TextInput testID="f-price" style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} textAlign="right" />
            </View>
            <View style={{ flex: 1 }}>
              <Label text="السعر قبل الخصم (اختياري)" />
              <TextInput testID="f-oldprice" style={styles.input} value={oldPrice} onChangeText={setOldPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} textAlign="right" />
            </View>
          </View>

          <View style={styles.noteBox}>
            <Feather name="info" size={16} color={colors.gold} />
            <T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1 }}>ملف الأسعار لم يتضمن الأسعار، لذا أدخل السعر يدوياً هنا.</T>
          </View>

          <Button title="حفظ ونشر المنتج" icon="check" onPress={save} loading={saving} testID="f-save" style={{ marginTop: spacing.lg }} />
        </ScrollView>
      </View>
    );
  }

  // SCAN view
  const canUseCamera = Platform.OS !== "web" && permission?.granted;
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <T weight="displayBold" size={type.xl}>إضافة منتج بالباركود</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={styles.cameraBox}>
          {canUseCamera ? (
            <>
              <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={onBarcode} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }} />
              <View style={styles.scanFrame} />
              <View style={styles.scanHint}><T color="#fff" weight="semi" size={type.sm}>وجّه الكاميرا نحو الباركود</T></View>
            </>
          ) : (
            <View style={styles.camPlaceholder}>
              <Feather name="camera-off" size={30} color={colors.muted} />
              <T color={colors.muted} style={{ textAlign: "center", marginTop: spacing.sm }}>
                {Platform.OS === "web" ? "المسح بالكاميرا متاح على الجوال فقط" : "الكاميرا غير مفعّلة"}
              </T>
              {Platform.OS !== "web" && permission && !permission.granted && (
                permission.canAskAgain ? (
                  <Button title="تفعيل الكاميرا" icon="camera" onPress={requestPermission} testID="enable-cam" style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl }} />
                ) : (
                  <Button title="فتح الإعدادات" icon="settings" variant="outline" onPress={() => Linking.openSettings()} style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl }} />
                )
              )}
            </View>
          )}
          {looking && <View style={styles.lookingOverlay}><ActivityIndicator color="#fff" size="large" /></View>}
        </View>
        {Platform.OS !== "web" && (
          <T size={type.sm} color={colors.muted} style={{ textAlign: "center", marginTop: spacing.sm }}>
            ملاحظة: المسح بالكاميرا يعمل على النسخة المبنية للجوال (Build) وليس داخل Expo Go.
          </T>
        )}

        <View style={styles.divider}><View style={styles.line} /><T color={colors.muted} size={type.sm}>أو أدخل الباركود يدوياً</T><View style={styles.line} /></View>

        <View style={styles.manualRow}>
          <TextInput testID="manual-barcode" style={[styles.input, { flex: 1, marginBottom: 0 }]} value={manual} onChangeText={setManual} keyboardType="numeric" placeholder="رقم الباركود" placeholderTextColor={colors.muted} textAlign="right" />
          <Button title="بحث" icon="search" onPress={() => doLookup(manual)} loading={looking} testID="manual-lookup" style={{ paddingHorizontal: spacing.xl }} />
        </View>

        <Pressable testID="manual-new" onPress={() => { setBarcode(""); setName(""); setCategory("أخرى"); setSuggestedImg(null); setImageUri(null); setPrice(""); setOldPrice(""); setMode("form"); }} style={styles.manualNew}>
          <Feather name="edit-3" size={16} color={colors.brandPrimary} />
          <T color={colors.brandPrimary} weight="semi">إضافة منتج بدون باركود</T>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <T weight="semi" size={type.sm} color={colors.onSurfaceSecondary} style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>{text}</T>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  cameraBox: { height: 300, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#1A1F1B", alignItems: "center", justifyContent: "center" },
  camPlaceholder: { alignItems: "center", padding: spacing.xl },
  scanFrame: { position: "absolute", width: 220, height: 140, borderWidth: 3, borderColor: colors.gold, borderRadius: radius.md },
  scanHint: { position: "absolute", bottom: spacing.lg, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  lookingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  manualRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  manualNew: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 54, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, marginBottom: spacing.sm },
  bcChip: { flexDirection: "row-reverse", alignSelf: "flex-start", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, marginBottom: spacing.md },
  imagePicker: { height: 180, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  imageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  catChip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1 },
  catActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  catIdle: { backgroundColor: "#fff", borderColor: colors.border },
  priceGrid: { flexDirection: "row-reverse", gap: spacing.md },
  noteBox: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#FBF6EA", borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.md },
});
