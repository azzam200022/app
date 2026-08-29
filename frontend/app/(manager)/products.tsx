import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator } from "react-native";
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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { try { setItems(await api.products()); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); } }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (p: any) => { setEditing(p); setPrice(String(p.price)); setOldPrice(p.old_price ? String(p.old_price) : ""); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateProduct(editing.id, { price: Number(price), old_price: oldPrice ? Number(oldPrice) : null });
      show("تم تحديث السعر");
      setEditing(null); load();
    } catch (e: any) { show(e.message, "error"); } finally { setSaving(false); }
  };

  const del = async (id: string) => { try { await api.deleteProduct(id); show("تم حذف المنتج"); setItems((p) => p.filter((x) => x.id !== id)); } catch (e: any) { show(e.message, "error"); } };

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
              <View style={{ flex: 1 }}>
                <T weight="semi" numberOfLines={2}>{item.name}</T>
                <T weight="displayBold" color={colors.brandPrimary} style={{ marginTop: 2 }}>{formatPrice(item.price)}</T>
                <T color={colors.muted} size={type.sm}>{item.category}</T>
              </View>
              <View style={styles.actions}>
                <Pressable testID={`edit-${item.id}`} onPress={() => openEdit(item)} style={styles.actionBtn}><Feather name="edit-2" size={18} color={colors.brandPrimary} /></Pressable>
                <Pressable testID={`del-${item.id}`} onPress={() => del(item.id)} style={styles.actionBtn}><Feather name="trash-2" size={18} color={colors.error} /></Pressable>
              </View>
            </View>
          )} />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>تعديل السعر</T>
            <T numberOfLines={1} color={colors.muted} style={{ marginBottom: spacing.md }}>{editing?.name}</T>
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
  img: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  actions: { gap: spacing.sm },
  actionBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 52, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
});
