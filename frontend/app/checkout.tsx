import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput, Linking, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, formatPrice } from "@/src/lib/api";
import { staticMapUrl } from "@/src/lib/maps";
import { useCart } from "@/src/context/CartContext";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cart, reload } = useCart();
  const { user } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const detectLocation = async () => {
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          setLocating(false);
          show("فعّل صلاحية الموقع من الإعدادات", "error");
          Linking.openSettings();
          return;
        }
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (!perm.granted) { setLocating(false); return show("نحتاج صلاحية الموقع لتحديده على الخريطة", "error"); }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      show("تم تحديد موقعك على الخريطة ✓");
    } catch {
      show("تعذّر تحديد الموقع، حاول مجدداً", "error");
    } finally { setLocating(false); }
  };

  const submit = async () => {
    if (!name || !phone || !address) return show("يرجى تعبئة الاسم والهاتف والعنوان", "error");
    setLoading(true);
    try {
      const order = await api.createOrder({ name, phone, address, notes, lat: coords?.lat, lng: coords?.lng });
      await reload();
      router.replace(`/order/${order.id}?new=1`);
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="co-back" onPress={() => router.back()} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <T weight="displayBold" size={type.xl}>إتمام الطلب</T>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing["3xl"] }} keyboardShouldPersistTaps="handled">
          <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>معلومات التوصيل</T>
          <Input icon="user" placeholder="الاسم الكامل" value={name} onChangeText={setName} testID="co-name" />
          <Input icon="phone" placeholder="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="co-phone" />
          <Input icon="map-pin" placeholder="العنوان بالتفصيل" value={address} onChangeText={setAddress} multiline testID="co-address" />
          <Input icon="edit-3" placeholder="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline testID="co-notes" />

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>موقع التوصيل على الخريطة</T>
          {coords ? (
            <View style={styles.mapCard}>
              <Image source={{ uri: staticMapUrl(coords.lat, coords.lng) }} style={styles.mapImg} contentFit="cover" />
              <View style={styles.mapFoot}>
                <View style={styles.mapFootRow}>
                  <Feather name="map-pin" size={16} color={colors.success} />
                  <T weight="semi" color={colors.success} size={type.sm}>تم تحديد موقعك بدقة</T>
                </View>
                <Pressable testID="relocate" onPress={detectLocation} hitSlop={8}>
                  <T weight="bold" color={colors.brandPrimary} size={type.sm}>تحديث الموقع</T>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable testID="co-locate" onPress={detectLocation} disabled={locating} style={styles.locateBtn}>
              {locating ? <ActivityIndicator color={colors.brandPrimary} /> : (
                <>
                  <View style={styles.locateIcon}><Feather name="navigation" size={20} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <T weight="bold">تحديد موقعي عبر GPS</T>
                    <T color={colors.muted} size={type.sm}>يساعد المندوب على الوصول إليك بدون اتصال</T>
                  </View>
                  <Feather name="chevron-left" size={20} color={colors.muted} />
                </>
              )}
            </Pressable>
          )}

          <View style={styles.codBox}>
            <View style={styles.codIcon}><Feather name="dollar-sign" size={20} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <T weight="bold">الدفع عند الاستلام</T>
              <T color={colors.muted} size={type.sm}>ادفع نقداً عند وصول طلبك</T>
            </View>
            <Feather name="check-circle" size={22} color={colors.brandPrimary} />
          </View>

          <View style={styles.summary}>
            <View style={styles.sumRow}><T color={colors.muted}>عدد المنتجات</T><T weight="semi">{cart.count}</T></View>
            <View style={styles.sumRow}><T color={colors.muted}>التوصيل</T><T weight="semi" color={colors.success}>مجاني</T></View>
            <View style={[styles.sumRow, styles.sumTotal]}><T weight="bold">الإجمالي</T><T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{formatPrice(cart.total)}</T></View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button title="تأكيد الطلب" icon="check" onPress={submit} loading={loading} testID="co-submit" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Input({ icon, testID, multiline, ...rest }: any) {
  return (
    <View style={[styles.field, multiline && { alignItems: "flex-start", minHeight: 64, paddingVertical: spacing.md }]}>
      <Feather name={icon} size={18} color={colors.muted} style={multiline ? { marginTop: 2 } : {}} />
      <TextInput testID={testID} style={[styles.input, multiline && { height: undefined, textAlignVertical: "top" }]} placeholderTextColor={colors.muted} textAlign="right" multiline={multiline} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 54, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, height: 54 },
  codBox: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.sm },
  locateBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.brandPrimary, borderStyle: "dashed", borderRadius: radius.md, padding: spacing.lg, minHeight: 64 },
  locateIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  mapCard: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  mapImg: { width: "100%", height: 160, backgroundColor: colors.surfaceSecondary },
  mapFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  mapFootRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  codIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  summary: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  sumRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sumTotal: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs },
  footer: { backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
