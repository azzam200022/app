import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { api, resolveImage, formatPrice } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export default function ManagerProducts() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [category, setCategory] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { try { setItems(await api.products()); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); } }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = async (p: any) => {
    setEditing(p);
    setPrice(String(p.price));
    setOldPrice(p.old_price ? String(p.old_price) : "");
    setCategory(p.category || "");
    setBranchId(p.branch_id || "");
    try { setBranches(await api.categoryBranches(p.category || "")); } catch { setBranches([]); }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateProduct(editing.id, { price: Number(price), old_price: oldPrice ? Number(oldPrice) : null, category, branch_id: branchId || null });
      show("تم تحديث بيانات المنتج");
      setEditing(null); load();
    } catch (e: any) { show(e.message, "error"); } finally { setSaving(false); }
  };

  const del = async (id: string) => { try { await api.deleteProduct(id); show("تم حذف المنتج"); setItems((p) => p.filter((x) => x.id !== id)); } catch (e: any) { show(e.message, "error"); } };

  const toggleComing = async (item: any) => {
    const next = !item.coming_soon;
    try {
      await api.updateProduct(item.id, { coming_soon: next });
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, coming_soon: next } : x));
      show(next ? "المنتج الآن: يتوفر قريباً" : "المنتج متاح للشراء");
    } catch (e: any) { show(e.message, "error"); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <T weight="displayBold" size={type.xl}>إدارة المنتجات</T>
        <T color={colors.muted}>{items.length} منتج</T>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : items.length === 0 ? (
        <View style={styles.center}><EmptyState icon="box" title="لا توجد منتجات" subtitle="أضف منتجاً جديداً بمسح الباركود" /></View>
      ) : (
        <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`mp-${item.id}`}>
              <Image source={{ uri: resolveImage(item.image_url) }} style={styles.img} contentFit="cover" />
              <View style={styles.productInfo}>
                <View style={styles.productTopLine}>
                  <T weight="semi" numberOfLines={2} style={styles.productName}>{item.name}</T>
                  <View style={[styles.stockPill, Number(item.stock ?? 0) <= 0 ? styles.stockOut : Number(item.stock ?? 0) <= 5 ? styles.stockLow : styles.stockOk]}>
                    <T size={10} weight="bold" color={Number(item.stock ?? 0) <= 0 ? colors.error : Number(item.stock ?? 0) <= 5 ? colors.gold : colors.success}>{Number(item.stock ?? 0) <= 0 ? "نفد" : Number(item.stock ?? 0) <= 5 ? `باقي ${item.stock}` : `${item.stock} متوفر`}</T>
                  </View>
                </View>
                <View style={styles.priceRow}>
                  <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(item.price)}</T>
                  {item.old_price && item.old_price > item.price ? <T size={type.sm} color={colors.muted} style={styles.oldPrice}>{formatPrice(item.old_price)}</T> : null}
                </View>
                <View style={styles.metaRow}>
                  <T color={colors.muted} size={type.xs} numberOfLines={1}>{item.category || "بدون تصنيف"}</T>
                  {item.old_price && item.old_price > item.price ? <T color={colors.error} size={type.xs} weight="bold">خصم {Math.round((1 - item.price / item.old_price) * 100)}%</T> : null}
                </View>
                <Pressable testID={`coming-${item.id}`} onPress={() => toggleComing(item)} style={[styles.comingBtn, item.coming_soon && styles.comingActive]}>
                  <Feather name={item.coming_soon ? "clock" : "check"} size={12} color={item.coming_soon ? colors.gold : colors.brandPrimary} />
                  <T size={11} weight="bold" color={item.coming_soon ? colors.gold : colors.brandPrimary}>{item.coming_soon ? "إتاحة المنتج للبيع" : "وضعه كيتوفر قريباً"}</T>
                </Pressable>
              </View>
              <View style={styles.actions}>
                <Pressable testID={`edit-${item.id}`} accessibilityLabel={`تعديل ${item.name}`} onPress={() => openEdit(item)} style={[styles.actionBtn, styles.editBtn]} hitSlop={6}><Feather name="edit-2" size={18} color={colors.brandPrimary} /></Pressable>
                <Pressable testID={`del-${item.id}`} accessibilityLabel={`حذف ${item.name}`} onPress={() => del(item.id)} style={[styles.actionBtn, styles.deleteBtn]} hitSlop={6}><Feather name="trash-2" size={18} color={colors.error} /></Pressable>
              </View>
            </View>
          )} />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>تعديل السعر</T>
            <T numberOfLines={1} color={colors.muted} style={{ marginBottom: spacing.md }}>{editing?.name}</T>
            <T weight="semi" size={type.sm} style={{ marginBottom: spacing.xs }}>القسم</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {Array.from(new Set(items.map((item) => item.category).filter(Boolean))).map((itemCategory) => (
                <Pressable key={itemCategory} onPress={async () => {
                  setCategory(itemCategory);
                  setBranchId("");
                  try { setBranches(await api.categoryBranches(itemCategory)); } catch { setBranches([]); }
                }} style={[styles.categoryChip, category === itemCategory ? styles.categoryChipActive : styles.categoryChipIdle]}>
                  <T size={type.sm} weight="semi" color={category === itemCategory ? "#fff" : colors.onSurfaceSecondary}>{itemCategory}</T>
                </Pressable>
              ))}
            </ScrollView>
            {branches.length > 0 && (
              <>
                <T weight="semi" size={type.sm} style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>الفرع أو العلامة التجارية</T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable onPress={() => setBranchId("")} style={[styles.categoryChip, !branchId ? styles.categoryChipActive : styles.categoryChipIdle]}>
                    <T size={type.sm} weight="semi" color={!branchId ? "#fff" : colors.onSurfaceSecondary}>بدون فرع</T>
                  </Pressable>
                  {branches.map((branch) => (
                    <Pressable key={branch.id} onPress={() => setBranchId(branch.id)} style={[styles.categoryChip, branchId === branch.id ? styles.categoryChipActive : styles.categoryChipIdle]}>
                      <T size={type.sm} weight="semi" color={branchId === branch.id ? "#fff" : colors.onSurfaceSecondary}>{branch.name}</T>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <T weight="semi" size={type.sm} style={{ marginBottom: spacing.xs }}>السعر (د.ع)</T>
            <TextInput testID="edit-price" style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" textAlign="right" />
            <T weight="semi" size={type.sm} style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>السعر قبل الخصم (اختياري)</T>
            <TextInput testID="edit-oldprice" style={styles.input} value={oldPrice} onChangeText={setOldPrice} keyboardType="numeric" textAlign="right" />
            <Button title="حفظ" onPress={saveEdit} loading={saving} testID="edit-save" style={{ marginTop: spacing.lg }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  img: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  productInfo: { flex: 1, minWidth: 0 },
  productTopLine: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.xs },
  productName: { flex: 1, minHeight: 38 },
  stockPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  stockOk: { backgroundColor: "#E6F5EF" },
  stockLow: { backgroundColor: "#FFF3D6" },
  stockOut: { backgroundColor: "#FDE8E7" },
  priceRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.xs },
  oldPrice: { textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, marginTop: 2 },
  actions: { gap: spacing.sm },
  comingBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.sm },
  comingActive: { backgroundColor: "#FBF1DE" },
  actionBtn: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  editBtn: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  deleteBtn: { backgroundColor: "#FDE8E7", borderColor: "#F4C4C2" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 52, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
  chipRow: { gap: spacing.sm, paddingVertical: 4 },
  categoryChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  categoryChipActive: { backgroundColor: colors.brandPrimary },
  categoryChipIdle: { backgroundColor: colors.surfaceSecondary },
});
