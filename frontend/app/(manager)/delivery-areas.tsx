import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { api, formatPrice } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

type DeliveryArea = { id: string; name: string; fee: number; center_lat: number; center_lng: number; radius_km: number; is_active: boolean };

export default function DeliveryAreas() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<DeliveryArea | null>(null);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [active, setActive] = useState(true);
  const [centerLat, setCenterLat] = useState("");
  const [centerLng, setCenterLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("2");

  const load = async () => {
    try { setAreas(await api.adminDeliveryAreas()); }
    catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openForm = (area?: DeliveryArea) => {
    setEditing(area || null);
    setName(area?.name || "");
    setFee(area ? String(area.fee) : "1000");
    setActive(area?.is_active ?? true);
    setCenterLat(area ? String(area.center_lat) : "");
    setCenterLng(area ? String(area.center_lng) : "");
    setRadiusKm(area ? String(area.radius_km) : "2");
    setModal(true);
  };

  const save = async () => {
    if (!name.trim()) return show("اكتب اسم المنطقة", "error");
    const amount = Number(fee);
    if (!Number.isFinite(amount) || amount < 0) return show("اكتب سعر توصيل صحيح", "error");
    const lat = Number(centerLat), lng = Number(centerLng), radius = Number(radiusKm);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(radius) || radius <= 0) return show("أدخل إحداثيات مركز المنطقة ونطاقاً صحيحاً", "error");
    setSaving(true);
    try {
      const payload = { name: name.trim(), fee: amount, center_lat: lat, center_lng: lng, radius_km: radius, is_active: active };
      if (editing) await api.updateDeliveryArea(editing.id, payload);
      else await api.createDeliveryArea(payload);
      setModal(false);
      await load();
      show("تم حفظ منطقة التوصيل ✓");
    } catch (e: any) { show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const remove = (area: DeliveryArea) => Alert.alert("حذف المنطقة", "هل تريد حذف " + area.name + "؟", [
    { text: "إلغاء", style: "cancel" },
    { text: "حذف", style: "destructive", onPress: async () => {
      try { await api.deleteDeliveryArea(area.id); await load(); show("تم حذف المنطقة"); }
      catch (e: any) { show(e.message, "error"); }
    } },
  ]);

  return <View style={styles.root}>
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <View><T weight="displayBold" size={type.xl}>أسعار التوصيل</T><T color={colors.muted} size={type.sm}>تحكم بالسعر حسب المنطقة</T></View>
      <Pressable onPress={() => openForm()} style={styles.addBtn}><Feather name="plus" size={18} color="#fff" /><T weight="bold" color="#fff">إضافة</T></Pressable>
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View> : <FlatList data={areas} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} ListEmptyComponent={<View style={styles.empty}><Feather name="truck" size={36} color={colors.muted} /><T color={colors.muted}>لم تتم إضافة مناطق بعد</T></View>} renderItem={({ item }) => <View style={styles.card}>
      <View style={styles.cardTop}><View style={{ flex: 1 }}><T weight="bold" size={type.lg}>{item.name}</T><T color={colors.brandPrimary} weight="semi">{item.fee > 0 ? formatPrice(item.fee) : "توصيل مجاني"}</T></View><View style={[styles.pill, item.is_active ? styles.active : styles.inactive]}><T size={type.xs} color={item.is_active ? colors.success : colors.muted}>{item.is_active ? "فعالة" : "معطلة"}</T></View></View>
      <View style={styles.actions}><Pressable onPress={() => openForm(item)} style={styles.action}><Feather name="edit-2" size={16} color={colors.brandPrimary} /><T color={colors.brandPrimary}>تعديل</T></Pressable><Pressable onPress={() => remove(item)} style={[styles.action, styles.delete]}><Feather name="trash-2" size={16} color={colors.error} /><T color={colors.error}>حذف</T></Pressable></View>
    </View>} />}
    <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}><Pressable style={styles.modalBg} onPress={() => setModal(false)}><Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
      <View style={styles.modalTitle}><T weight="displayBold" size={type.xl}>{editing ? "تعديل المنطقة" : "إضافة منطقة"}</T><Pressable onPress={() => setModal(false)}><Feather name="x" size={24} color={colors.onSurface} /></Pressable></View>
      <T weight="semi" size={type.sm} style={styles.label}>اسم المنطقة</T><TextInput value={name} onChangeText={setName} placeholder="مثال: الكرادة" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <T weight="semi" size={type.sm} style={styles.label}>سعر التوصيل</T><TextInput value={fee} onChangeText={setFee} keyboardType="numeric" placeholder="1000" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <T weight="semi" size={type.sm} style={styles.label}>مركز المنطقة (خط العرض)</T><TextInput value={centerLat} onChangeText={setCenterLat} keyboardType="numeric" placeholder="33.3152" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <T weight="semi" size={type.sm} style={styles.label}>مركز المنطقة (خط الطول)</T><TextInput value={centerLng} onChangeText={setCenterLng} keyboardType="numeric" placeholder="44.3661" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <T weight="semi" size={type.sm} style={styles.label}>نطاق التوصيل بالكيلومتر</T><TextInput value={radiusKm} onChangeText={setRadiusKm} keyboardType="numeric" placeholder="2" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
      <View style={styles.switchRow}><T weight="semi">المنطقة فعالة</T><Switch value={active} onValueChange={setActive} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor="#fff" /></View>
      <Button title={saving ? "جارٍ الحفظ..." : "حفظ"} icon="check" onPress={save} disabled={saving} style={{ marginTop: spacing.lg }} />
    </Pressable></Pressable></Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"] },
  card: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  active: { backgroundColor: colors.brandTertiary },
  inactive: { backgroundColor: colors.surfaceSecondary },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  delete: { borderColor: colors.error },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  modalTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  label: { marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { height: 50, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
});