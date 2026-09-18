import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, formatPrice } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

type Coupon = {
  id: string;
  code: string;
  description?: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  discount_percent?: number;
  applies_to: "subtotal" | "delivery";
  max_uses?: number | null;
  max_uses_per_user?: number;
  usage_count: number;
  usage_remaining?: number | null;
  minimum_subtotal?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active: boolean;
};

const dateOnly = (value?: string | null) => value ? String(value).slice(0, 10) : "";

export default function ManagerCoupons() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [modal, setModal] = useState(false);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [appliesTo, setAppliesTo] = useState<"subtotal" | "delivery">("subtotal");
  const [maxUses, setMaxUses] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("1");
  const [minimumSubtotal, setMinimumSubtotal] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    try { setCoupons(await api.adminCoupons()); }
    catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  }, [show]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setEditing(null); setModal(false); setCode(""); setDescription(""); setDiscountType("percent");
    setDiscountValue(""); setAppliesTo("subtotal"); setMaxUses(""); setMaxUsesPerUser("1");
    setMinimumSubtotal("0"); setStartsAt(""); setExpiresAt(""); setActive(true);
  };

  const openForm = (coupon?: Coupon) => {
    setEditing(coupon || null);
    setModal(true);
    setCode(coupon?.code || "");
    setDescription(coupon?.description || "");
    setDiscountType(coupon?.discount_type || "percent");
    setDiscountValue(coupon ? String(coupon.discount_value ?? coupon.discount_percent ?? "") : "");
    setAppliesTo(coupon?.applies_to || "subtotal");
    setMaxUses(coupon?.max_uses == null ? "" : String(coupon.max_uses));
    setMaxUsesPerUser(String(coupon?.max_uses_per_user || 1));
    setMinimumSubtotal(String(coupon?.minimum_subtotal || 0));
    setStartsAt(dateOnly(coupon?.starts_at));
    setExpiresAt(dateOnly(coupon?.expires_at));
    setActive(coupon?.is_active !== false);
  };

  const save = async () => {
    const normalizedCode = code.trim().toUpperCase();
    const value = Number(discountValue);
    const totalUses = maxUses.trim() ? Number(maxUses) : null;
    const perUser = Number(maxUsesPerUser);
    const minimum = Number(minimumSubtotal || 0);
    if (!editing && !/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) return show("اكتب كوداً من 3 إلى 32 حرفاً أو رقماً", "error");
    if (!Number.isFinite(value) || value <= 0 || (discountType === "percent" && value > 100)) return show("أدخل قيمة خصم صحيحة", "error");
    if (totalUses !== null && (!Number.isInteger(totalUses) || totalUses < 1)) return show("عدد الاستخدامات يجب أن يكون رقماً صحيحاً", "error");
    if (!Number.isInteger(perUser) || perUser < 1 || !Number.isFinite(minimum) || minimum < 0) return show("تحقق من حدود الاستخدام والحد الأدنى", "error");
    setSaving(true);
    try {
      const body = {
        ...(editing ? {} : { code: normalizedCode }),
        description: description.trim(),
        discount_type: discountType,
        discount_value: value,
        applies_to: appliesTo,
        max_uses: totalUses,
        max_uses_per_user: perUser,
        minimum_subtotal: minimum,
        starts_at: startsAt.trim(),
        expires_at: expiresAt.trim(),
        is_active: active,
      };
      if (editing) await api.updateCoupon(editing.code, body);
      else await api.createCoupon(body);
      show(editing ? "تم تحديث كود الخصم ✓" : "تم إنشاء كود الخصم ✓");
      reset();
      await load();
    } catch (e: any) { show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const remove = (coupon: Coupon) => Alert.alert("حذف كود الخصم", `هل تريد حذف ${coupon.code} نهائياً؟`, [
    { text: "إلغاء", style: "cancel" },
    { text: "حذف", style: "destructive", onPress: async () => {
      try { await api.deleteCoupon(coupon.code); show("تم حذف كود الخصم"); await load(); }
      catch (e: any) { show(e.message, "error"); }
    } },
  ]);

  const valueLabel = (coupon: Coupon) => coupon.discount_type === "fixed"
    ? formatPrice(coupon.discount_value)
    : `${coupon.discount_value}%`;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <T weight="displayBold" size={type.xl}>أكواد الخصم</T>
          <T color={colors.muted} size={type.sm}>تحكم كامل بالكود والمدة والاستخدام</T>
        </View>
        <Pressable testID="add-coupon" onPress={() => openForm()} style={styles.addBtn}>
          <Feather name="plus" size={18} color="#fff" /><T weight="bold" color="#fff">إضافة</T>
        </Pressable>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : (
        <FlatList
          data={coupons}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          ListEmptyComponent={<View style={styles.empty}><Feather name="tag" size={38} color={colors.muted} /><T color={colors.muted}>لم تتم إضافة أكواد خصم بعد</T></View>}
          renderItem={({ item }) => (
            <View style={styles.card} testID={"coupon-card-" + item.id}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.codeRow}><Feather name="tag" size={17} color={colors.brandPrimary} /><T weight="displayBold" size={type.lg}>{item.code}</T></View>
                  {!!item.description && <T color={colors.muted} size={type.sm} numberOfLines={2}>{item.description}</T>}
                </View>
                <View style={[styles.pill, item.is_active ? styles.active : styles.inactive]}><T size={type.xs} color={item.is_active ? colors.success : colors.muted}>{item.is_active ? "فعّال" : "معطّل"}</T></View>
              </View>
              <View style={styles.details}>
                <Detail label="الخصم" value={valueLabel(item)} />
                <Detail label="يطبق على" value={item.applies_to === "delivery" ? "التوصيل" : "الفاتورة"} />
                <Detail label="الاستخدام" value={item.max_uses == null ? `${item.usage_count || 0} / ∞` : `${item.usage_count || 0} / ${item.max_uses}`} />
              </View>
              <T color={colors.muted} size={type.xs}>
                {item.starts_at ? `يبدأ ${dateOnly(item.starts_at)}` : "يبدأ فوراً"}{item.expires_at ? ` • ينتهي ${dateOnly(item.expires_at)}` : " • بلا انتهاء"}
              </T>
              {(item.minimum_subtotal || 0) > 0 && <T color={colors.muted} size={type.xs}>حد أدنى للفاتورة: {formatPrice(item.minimum_subtotal)}</T>}
              <View style={styles.actions}>
                <Pressable testID={"edit-coupon-" + item.id} onPress={() => openForm(item)} style={styles.action}><Feather name="edit-2" size={16} color={colors.brandPrimary} /><T color={colors.brandPrimary}>تعديل</T></Pressable>
                <Pressable testID={"delete-coupon-" + item.id} onPress={() => remove(item)} style={[styles.action, styles.delete]}><Feather name="trash-2" size={16} color={colors.error} /><T color={colors.error}>حذف</T></Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modal} transparent animationType="slide" onRequestClose={reset}>
        <Pressable style={styles.modalBg} onPress={reset}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalTitle}><T weight="displayBold" size={type.xl}>{editing ? "تعديل كود الخصم" : "إضافة كود خصم"}</T><Pressable onPress={reset}><Feather name="x" size={24} color={colors.onSurface} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Field label="الكود" value={code} onChangeText={setCode} placeholder="مثال: WELCOME10" editable={!editing} autoCapitalize="characters" />
              <Field label="وصف اختياري" value={description} onChangeText={setDescription} placeholder="مثال: خصم العملاء الجدد" />
              <T weight="semi" size={type.sm} style={styles.label}>نوع الخصم</T>
              <View style={styles.segmentRow}>
                <Segment active={discountType === "percent"} label="نسبة مئوية" onPress={() => setDiscountType("percent")} />
                <Segment active={discountType === "fixed"} label="مبلغ ثابت" onPress={() => setDiscountType("fixed")} />
              </View>
              <Field label={discountType === "percent" ? "نسبة الخصم (٪)" : "قيمة الخصم"} value={discountValue} onChangeText={setDiscountValue} placeholder={discountType === "percent" ? "10" : "5000"} keyboardType="numeric" />
              <T weight="semi" size={type.sm} style={styles.label}>يطبق الخصم على</T>
              <View style={styles.segmentRow}>
                <Segment active={appliesTo === "subtotal"} label="الفاتورة" onPress={() => setAppliesTo("subtotal")} />
                <Segment active={appliesTo === "delivery"} label="التوصيل" onPress={() => setAppliesTo("delivery")} />
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="إجمالي الاستخدامات" value={maxUses} onChangeText={setMaxUses} placeholder="بلا حد" keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Field label="لكل مستخدم" value={maxUsesPerUser} onChangeText={setMaxUsesPerUser} placeholder="1" keyboardType="numeric" /></View>
              </View>
              <Field label="الحد الأدنى للفاتورة" value={minimumSubtotal} onChangeText={setMinimumSubtotal} placeholder="0" keyboardType="numeric" />
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="تاريخ البداية" value={startsAt} onChangeText={setStartsAt} placeholder="YYYY-MM-DD" /></View>
                <View style={{ flex: 1 }}><Field label="تاريخ الانتهاء" value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD" /></View>
              </View>
              <View style={styles.switchRow}><T weight="semi">الكود فعّال</T><Switch value={active} onValueChange={setActive} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor="#fff" /></View>
              <Button title={saving ? "جارٍ الحفظ..." : "حفظ الكود"} icon="check" onPress={save} disabled={saving} style={{ marginTop: spacing.lg }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Field({ label, ...props }: any) {
  return <View><T weight="semi" size={type.sm} style={styles.label}>{label}</T><TextInput {...props} style={styles.input} placeholderTextColor={colors.muted} textAlign="right" /></View>;
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]}><T weight="semi" size={type.sm} color={active ? "#fff" : colors.onSurface}>{label}</T></Pressable>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><T color={colors.muted} size={type.xs}>{label}</T><T weight="bold" size={type.sm}>{value}</T></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"] },
  card: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.md },
  codeRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  active: { backgroundColor: colors.brandTertiary },
  inactive: { backgroundColor: colors.surfaceSecondary },
  details: { flexDirection: "row-reverse", gap: spacing.xs, marginTop: spacing.sm },
  detail: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm, gap: 2, alignItems: "flex-end" },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  delete: { borderColor: colors.error },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "94%" },
  modalTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  label: { marginTop: spacing.sm, marginBottom: spacing.xs, textAlign: "right" },
  input: { height: 50, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
  segmentRow: { flexDirection: "row-reverse", gap: spacing.sm },
  segment: { flex: 1, minHeight: 46, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  segmentActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  row: { flexDirection: "row-reverse", gap: spacing.sm },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
});