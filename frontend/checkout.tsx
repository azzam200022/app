import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator } from "react-native";
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

function mapTapToCoordinates(center: { lat: number; lng: number }, x: number, y: number, width: number, height: number) {
  const worldSize = 256 * 2 ** 16;
  const sinLat = Math.sin((center.lat * Math.PI) / 180);
  const centerX = ((center.lng + 180) / 360) * worldSize;
  const centerY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  const pixelX = centerX + (x / width - 0.5) * 600;
  const pixelY = centerY + (y / height - 0.5) * 260;
  const wrappedX = ((pixelX % worldSize) + worldSize) % worldSize;
  const clampedY = Math.max(0, Math.min(worldSize, pixelY));
  const lng = (wrappedX / worldSize) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * clampedY) / worldSize)) * 180) / Math.PI;
  return { lat, lng };
}

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
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressLabel, setAddressLabel] = useState("عنوان جديد");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const orderRequestId = useRef("order-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<"gps" | "address" | "manual" | "saved" | null>(null);
  const [locating, setLocating] = useState(false);
  const [addressLocating, setAddressLocating] = useState(false);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const deliveryFee = Number(deliveryQuote?.fee || 0);
  const subtotal = Number(appliedCoupon?.subtotal ?? cart.total);
  const displayedTotal = appliedCoupon?.total ?? (subtotal + deliveryFee);
  const deliveryLabel = quoteLoading
    ? "جارٍ الحساب..."
    : deliveryQuote?.area_id === "default_delivery"
      ? "خارج نطاق التوصيل"
      : deliveryQuote
        ? deliveryFee > 0 ? formatPrice(deliveryFee) : "مجاني"
        : "يُحسب بعد تحديد الموقع";

  const setLocationAndQuote = async (nextCoords: { lat: number; lng: number }, source: "gps" | "address" | "manual" | "saved") => {
    setCoords(nextCoords);
    setLocationSource(source);
    setDeliveryQuote(null);
    if (appliedCoupon) setAppliedCoupon(null);
    setQuoteLoading(true);
    try {
      const quote = await api.deliveryQuote(nextCoords.lat, nextCoords.lng);
      setDeliveryQuote(quote);
      if (quote.area_id === "default_delivery") {
        show("موقعك خارج نطاق التوصيل الحالي. جرّب عنواناً آخر.", "error");
      } else {
        show(source === "address" ? "تم تحديد الموقع من العنوان؛ راجع الخريطة واضغط لتعديل الدبوس" : source === "manual" ? "تم تحديث موقع التسليم وحساب الرسوم ✓" : source === "saved" ? "تم اختيار العنوان وحساب رسوم التوصيل ✓" : "تم تحديد الموقع وحساب رسوم التوصيل ✓");
      }
    } catch (e: any) {
      setDeliveryQuote(null);
      show(e.message, "error");
    } finally { setQuoteLoading(false); }
  };


  const selectSavedAddress = async (saved: any) => {
    setSelectedAddressId(saved.id);
    setAddressLabel(saved.label || "عنوان جديد");
    setName(saved.recipient_name || "");
    setPhone(saved.phone || "");
    setAddress(saved.address || "");
    if (saved.lat == null || saved.lng == null) {
      setCoords(null);
      setLocationSource(null);
      setDeliveryQuote(null);
      return;
    }
    await setLocationAndQuote({ lat: Number(saved.lat), lng: Number(saved.lng) }, "saved");
  };

  const startNewAddress = () => {
    setSelectedAddressId(null);
    setAddressLabel("عنوان جديد");
    setName(user?.name || "");
    setPhone("");
    setAddress("");
    setCoords(null);
    setLocationSource(null);
    setDeliveryQuote(null);
    setAppliedCoupon(null);
  };

  const saveCurrentAddress = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) return show("يرجى تعبئة اسم المستلم والهاتف والعنوان أولاً", "error");
    if (!coords) return show("حدد موقع العنوان عبر GPS أو من الخريطة أولاً", "error");
    setSavingAddress(true);
    try {
      const saved = await api.createAddress({ label: addressLabel.trim() || "عنوان جديد", recipient_name: name.trim(), phone: phone.trim(), address: address.trim(), lat: coords.lat, lng: coords.lng, is_default: savedAddresses.length === 0 });
      setSavedAddresses((items) => [saved, ...items]);
      setSelectedAddressId(saved.id);
      show("تم حفظ العنوان ضمن عناوينك ✓");
    } catch (e: any) { show(e.message, "error"); }
    finally { setSavingAddress(false); }
  };

  useEffect(() => {
    let active = true;
    setAddressesLoading(true);
    api.addresses().then((items) => {
      if (!active) return;
      const list = Array.isArray(items) ? items : [];
      setSavedAddresses(list);
      const preferred = list.find((item) => item.is_default) || list[0];
      if (preferred) void selectSavedAddress(preferred);
    }).catch((e: any) => { if (active) show(e.message, "error"); }).finally(() => { if (active) setAddressesLoading(false); });
    return () => { active = false; };
  }, []);

  const detectLocation = async () => {
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          show("تعذر طلب صلاحية GPS مجدداً. يمكنك تحديد الموقع من العنوان المكتوب أدناه.", "error");
          return;
        }
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (!perm.granted) return show("يمكنك استخدام العنوان المكتوب لتحديد الموقع دون تفعيل GPS.", "error");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await setLocationAndQuote({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps");
    } catch {
      show("تعذّر تحديد الموقع، حاول مجدداً", "error");
    } finally { setLocating(false); }
  };

  const adjustMapPin = async (event: any) => {
    if (!coords || !mapSize.width || !mapSize.height || quoteLoading) return;
    const { locationX, locationY } = event.nativeEvent;
    const nextCoords = mapTapToCoordinates(coords, locationX, locationY, mapSize.width, mapSize.height);
    await setLocationAndQuote(nextCoords, "manual");
  };

  const locateFromAddress = async () => {
    const query = address.trim();
    if (!query) return show("اكتب العنوان بالتفصيل أولاً، ثم حدده من العنوان.", "error");
    setAddressLocating(true);
    try {
      const matches = await Location.geocodeAsync(query);
      const match = matches?.[0];
      if (!match) return show("لم نعثر على موقع لهذا العنوان. أضف اسم الحي والمدينة أو استخدم GPS.", "error");
      await setLocationAndQuote({ lat: match.latitude, lng: match.longitude }, "address");
    } catch {
      show("تعذر تحديد العنوان على الخريطة. أضف تفاصيل أكثر أو استخدم GPS.", "error");
    } finally { setAddressLocating(false); }
  };

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return show("اكتب كود الخصم أولاً", "error");
    setCouponLoading(true);
    try {
      const result = await api.validateCoupon(code, coords || undefined);
      setAppliedCoupon(result);
      setCouponCode(result.coupon_code);
      show("تم تطبيق كود الخصم ✓");
    } catch (e: any) {
      setAppliedCoupon(null);
      show(e.message, "error");
    } finally { setCouponLoading(false); }
  };

  const submit = async () => {
    if (!name || !phone || !address) return show("يرجى تعبئة الاسم والهاتف والعنوان", "error");
    if (!coords) return show("حدد موقع التوصيل عبر GPS أو من العنوان أولاً", "error");
    if (quoteLoading) return show("انتظر حتى يتم حساب رسوم التوصيل", "error");
    if (!deliveryQuote) return show("تعذر التحقق من منطقة التوصيل. أعد تحديد الموقع وحاول مجدداً.", "error");
    if (deliveryQuote.area_id === "default_delivery") return show("عنوانك خارج نطاق التوصيل الحالي. غيّر موقع التسليم.", "error");
    setLoading(true);
    try {
      const order = await api.createOrder({ name, phone, address, notes, saved_address_id: selectedAddressId || undefined, coupon_code: appliedCoupon?.coupon_code, lat: coords.lat, lng: coords.lng, client_request_id: orderRequestId.current });
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
          <View style={styles.savedSection}>
            <View style={styles.sectionTitleRow}>
              <T weight="displayBold" size={type.lg}>العناوين المحفوظة</T>
              <Pressable onPress={startNewAddress} testID="co-new-address"><T weight="bold" color={colors.brandPrimary} size={type.sm}>+ عنوان جديد</T></Pressable>
            </View>
            {addressesLoading ? <ActivityIndicator color={colors.brandPrimary} /> : savedAddresses.length === 0 ? <T color={colors.muted} size={type.sm}>لا توجد عناوين محفوظة؛ املأ البيانات واحفظ العنوان أدناه.</T> : savedAddresses.map((saved) => (
              <Pressable key={saved.id} testID={"co-address-" + saved.id} onPress={() => void selectSavedAddress(saved)} style={[styles.savedCard, selectedAddressId === saved.id && styles.savedCardActive]}>
                <View style={styles.savedCardIcon}><Feather name={saved.is_default ? "star" : "map-pin"} size={18} color={saved.is_default ? colors.gold : colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.savedCardTitle}><T weight="bold">{saved.label}</T>{saved.is_default ? <T color={colors.gold} size={type.xs}>افتراضي</T> : null}</View>
                  <T size={type.sm}>{saved.recipient_name} • {saved.phone}</T>
                  <T color={colors.muted} size={type.sm} numberOfLines={1}>{saved.address}</T>
                </View>
                {selectedAddressId === saved.id ? <Feather name="check-circle" size={21} color={colors.brandPrimary} /> : <Feather name="circle" size={21} color={colors.borderStrong} />}
              </Pressable>
            ))}
          </View>

          <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>معلومات التوصيل</T>
          <Input icon="user" placeholder="اسم المستلم" value={name} onChangeText={(value: string) => { setName(value); setSelectedAddressId(null); }} testID="co-name" />
          <Input icon="phone" placeholder="رقم هاتف المستلم" value={phone} onChangeText={(value: string) => { setPhone(value); setSelectedAddressId(null); }} keyboardType="phone-pad" testID="co-phone" />
          <Input icon="map-pin" placeholder="العنوان بالتفصيل" value={address} onChangeText={(value: string) => { setAddress(value); setSelectedAddressId(null); if (locationSource !== "gps") { setCoords(null); setLocationSource(null); setDeliveryQuote(null); setAppliedCoupon(null); } }} multiline testID="co-address" />
          {!selectedAddressId ? <Input icon="bookmark" placeholder="اسم العنوان (البيت، العمل...)" value={addressLabel} onChangeText={(value: string) => { setAddressLabel(value); setSelectedAddressId(null); }} testID="co-address-label" /> : null}
          <Input icon="edit-3" placeholder="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline testID="co-notes" />
          {!selectedAddressId && coords ? <Pressable testID="co-save-address" onPress={saveCurrentAddress} disabled={savingAddress} style={styles.saveAddressBtn}>{savingAddress ? <ActivityIndicator color={colors.brandPrimary} /> : <Feather name="bookmark" size={18} color={colors.brandPrimary} />}<T weight="bold" color={colors.brandPrimary}>{savingAddress ? "جارٍ حفظ العنوان..." : "حفظ هذا العنوان ضمن عناويني"}</T></Pressable> : null}

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>موقع التوصيل على الخريطة</T>
          {coords ? (
            <View style={styles.mapCard}>
              <Pressable testID="co-map-pin" accessibilityRole="button" accessibilityLabel="اضغط على الخريطة لتعديل موقع التسليم" onPress={adjustMapPin} onLayout={(event) => setMapSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} disabled={quoteLoading} style={styles.mapTapArea}>
                <Image source={{ uri: staticMapUrl(coords.lat, coords.lng, 600, 260, 16) }} style={styles.mapImg} contentFit="fill" />
              </Pressable>
              <T color={colors.muted} size={type.xs} style={styles.mapHint}>اضغط على المكان المطلوب في الخريطة لنقل دبوس التوصيل الأحمر</T>
              <View style={styles.mapFoot}>
                <View style={styles.mapFootRow}>
                  <Feather name="map-pin" size={16} color={colors.success} />
                  <T weight="semi" color={colors.success} size={type.sm}>{locationSource === "address" ? "موقع تقريبي من العنوان — راجعه" : locationSource === "manual" ? "تم تعديل الموقع يدوياً" : "الموقع المحدد عبر GPS"}</T>
                </View>
                <Pressable testID="relocate" onPress={detectLocation} hitSlop={8}>
                  <T weight="bold" color={colors.brandPrimary} size={type.sm}>استخدام GPS</T>
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
          <Pressable testID="co-address-location" onPress={locateFromAddress} disabled={addressLocating || quoteLoading} style={styles.addressLocateBtn}>
            {addressLocating ? <ActivityIndicator color={colors.brandPrimary} /> : <Feather name="map-pin" size={18} color={colors.brandPrimary} />}
            <View style={{ flex: 1 }}>
              <T weight="bold" color={colors.brandPrimary}>تحديد الموقع من العنوان</T>
              <T color={colors.muted} size={type.sm}>بديل لـGPS؛ اكتب الحي والمدينة وراجع الخريطة</T>
            </View>
          </Pressable>
          {deliveryQuote?.area_id === "default_delivery" ? <T color={colors.error} size={type.sm} style={{ marginTop: spacing.xs }}>هذه المنطقة خارج نطاق التوصيل؛ لن يُرسل الطلب قبل اختيار موقع مدعوم.</T> : null}

          <View style={styles.codBox}>
            <View style={styles.codIcon}><Feather name="dollar-sign" size={20} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <T weight="bold">الدفع عند الاستلام</T>
              <T color={colors.muted} size={type.sm}>ادفع نقداً عند وصول طلبك</T>
            </View>
            <Feather name="check-circle" size={22} color={colors.brandPrimary} />
          </View>

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>كود الخصم</T>
          <View style={styles.couponRow}>
            <View style={{ flex: 1 }}>
              <Input icon="tag" placeholder="أدخل الكود" value={couponCode} onChangeText={(value: string) => { setCouponCode(value); setAppliedCoupon(null); }} autoCapitalize="characters" testID="co-coupon" />
            </View>
            <Pressable testID="co-apply-coupon" onPress={applyCoupon} disabled={couponLoading} style={styles.couponBtn}>
              {couponLoading ? <ActivityIndicator color="#fff" /> : <T weight="bold" color="#fff">تطبيق</T>}
            </Pressable>
          </View>
          {appliedCoupon ? <T color={colors.success} size={type.sm} style={{ marginTop: -spacing.sm }}>
            {appliedCoupon.applies_to === "delivery" ? "خصم على التوصيل" : "خصم على الفاتورة"} — وفرت {formatPrice(appliedCoupon.discount_amount)}
          </T> : null}

          <View style={styles.summary}>
            <View style={styles.sumRow}><T color={colors.muted}>المجموع الفرعي</T><T weight="semi">{formatPrice(subtotal)}</T></View>
            <View style={styles.sumRow}><T color={colors.muted}>عدد المنتجات</T><T weight="semi">{cart.count}</T></View>
            <View style={styles.sumRow}><T color={colors.muted}>التوصيل</T><T weight="semi" color={deliveryQuote ? (deliveryFee > 0 ? colors.onSurface : colors.success) : colors.muted}>{deliveryLabel}</T></View>
            {!deliveryQuote && !quoteLoading ? <T color={colors.muted} size={type.xs} style={styles.summaryHint}>حدد موقعك لمعرفة رسوم التوصيل بدقة</T> : null}
            {deliveryQuote?.area_name && deliveryQuote.area_id !== "default_delivery" ? <View style={styles.sumRow}><T color={colors.muted}>المنطقة</T><T weight="semi">{deliveryQuote.area_name}</T></View> : null}
            {appliedCoupon ? <View style={styles.sumRow}><T color={colors.muted}>قبل الخصم</T><T weight="semi">{formatPrice(appliedCoupon.subtotal)}</T></View> : null}
            {appliedCoupon ? <View style={styles.sumRow}><T color={colors.success}>{appliedCoupon.applies_to === "delivery" ? "خصم التوصيل" : "الخصم"}</T><T weight="semi" color={colors.success}>-{formatPrice(appliedCoupon.discount_amount)}</T></View> : null}
            <View style={[styles.sumRow, styles.sumTotal]}><T weight="bold">الإجمالي</T><T weight="displayBold" size={type.xl} color={colors.brandPrimary}>{formatPrice(displayedTotal)}</T></View>
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
  addressLocateBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary, borderRadius: radius.md, padding: spacing.lg, minHeight: 64, marginTop: spacing.sm },
  mapCard: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  mapTapArea: { position: "relative" },
  mapImg: { width: "100%", aspectRatio: 600 / 260, backgroundColor: colors.surfaceSecondary },
  mapHint: { textAlign: "right", paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  mapFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  mapFootRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  codIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  summary: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  summaryHint: { marginTop: spacing.xs, textAlign: "right" },
  sumRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sumTotal: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs },
  couponRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm },
  couponBtn: { height: 54, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  savedSection: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.xl, gap: spacing.sm },
  sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  savedCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  savedCardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  savedCardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  savedCardTitle: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  saveAddressBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md, minHeight: 48, marginBottom: spacing.md },
  footer: { backgroundColor: "#fff", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
