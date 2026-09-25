import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator, Alert, Platform, ScrollView } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { api, resolveImage, uploadImage } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export default function ManagerBranches() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const result = await api.categories();
      const items = Array.isArray(result) ? result : [];
      setCategories(items);
      if (!selectedCategory && items[0]?.name) setSelectedCategory(items[0].name);
    } catch (error: any) {
      show(error.message, "error");
    }
  }, [selectedCategory, show]);

  const loadBranches = useCallback(async () => {
    if (!selectedCategory) return;
    setLoading(true);
    try {
      setBranches(await api.adminBranches(selectedCategory));
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, show]);

  useFocusEffect(useCallback(() => { void loadCategories(); }, [loadCategories]));
  useEffect(() => { void loadBranches(); }, [loadBranches]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setImageUri(null);
    setImageUrl("");
    setSortOrder("0");
  };

  const openCreate = () => {
    resetForm();
    setEditing({});
  };

  const openEdit = (branch: any) => {
    setEditing(branch);
    setName(branch.name || "");
    setImageUri(null);
    setImageUrl(branch.image_url || "");
    setSortOrder(String(branch.sort_order ?? 0));
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return show("نحتاج صلاحية الوصول للصور", "error");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!selectedCategory) return show("اختر قسماً أولاً", "error");
    if (!name.trim()) return show("أدخل اسم الفرع", "error");
    setSaving(true);
    try {
      let finalImage = imageUrl.trim();
      if (imageUri) finalImage = (await uploadImage(imageUri, Platform.OS === "web")).url;
      const body = {
        category: selectedCategory,
        name: name.trim(),
        image_url: finalImage || null,
        sort_order: Number(sortOrder) || 0,
        is_active: true,
      };
      if (editing?.id) await api.updateBranch(editing.id, body);
      else await api.createBranch(body);
      show(editing?.id ? "تم تحديث الفرع" : "تمت إضافة الفرع");
      resetForm();
      await loadBranches();
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = (branch: any) => {
    Alert.alert("حذف الفرع", `سيتم إلغاء ربط منتجات ${branch.name} بهذا الفرع. هل تريد المتابعة؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await api.deleteBranch(branch.id);
          show("تم حذف الفرع");
          await loadBranches();
        } catch (error: any) { show(error.message, "error"); }
      } },
    ]);
  };

  const preview = imageUri || resolveImage(imageUrl);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <T weight="displayBold" size={type.xl}>فروع الأقسام</T>
          <T color={colors.muted} size={type.sm}>أضف العلامات التي تظهر للزبائن داخل كل قسم</T>
        </View>
        <Pressable testID="add-branch" onPress={openCreate} style={styles.addButton}>
          <Feather name="plus" size={18} color="#fff" />
          <T color="#fff" weight="bold" size={type.sm}>إضافة</T>
        </Pressable>
      </View>

      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {categories.map((category) => (
              <Pressable key={category.name} testID={`manager-category-${category.name}`} onPress={() => setSelectedCategory(category.name)} style={[styles.categoryChip, selectedCategory === category.name && styles.categoryChipActive]}>
                <T size={type.sm} weight="semi" color={selectedCategory === category.name ? "#fff" : colors.onSurfaceSecondary}>{category.name}</T>
              </Pressable>
            ))}
          </ScrollView>
        )}
        ListHeaderComponentStyle={styles.listHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={loadBranches}
        renderItem={({ item }) => (
          <View style={styles.card} testID={`branch-card-${item.id}`}>
            <Image source={{ uri: resolveImage(item.image_url) }} style={styles.branchImage} contentFit="cover" />
            <View style={styles.cardCopy}>
              <T weight="displayBold" size={type.lg}>{item.name}</T>
              <T color={colors.muted} size={type.sm}>{item.product_count ?? 0} منتج مرتبط</T>
              <T color={colors.onSurfaceTertiary} size={11}>ترتيب الظهور: {item.sort_order ?? 0}</T>
            </View>
            <View style={styles.actions}>
              <Pressable testID={`edit-branch-${item.id}`} onPress={() => openEdit(item)} style={styles.actionButton}><Feather name="edit-2" size={17} color={colors.brandPrimary} /></Pressable>
              <Pressable testID={`delete-branch-${item.id}`} onPress={() => remove(item)} style={[styles.actionButton, styles.deleteAction]}><Feather name="trash-2" size={17} color={colors.error} /></Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <EmptyState icon="tag" title="لا توجد فروع لهذا القسم" subtitle="أضف أول علامة تجارية لتظهر للزبائن" /> : null}
      />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={resetForm}>
        <Pressable style={styles.modalBg} onPress={resetForm}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.grabber} />
            <View style={styles.modalTitle}>
              <T weight="displayBold" size={type.xl}>{editing?.id ? "تعديل الفرع" : "إضافة فرع جديد"}</T>
              <Pressable onPress={resetForm}><Feather name="x" size={22} color={colors.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <T color={colors.muted} size={type.sm}>القسم: {selectedCategory}</T>
              <Pressable testID="branch-pick-image" onPress={pickImage} style={styles.imagePicker}>
                {preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={[styles.imageOverlay, preview ? { backgroundColor: "rgba(0,0,0,0.4)" } : {}]}>
                  <Feather name="image" size={26} color={preview ? "#fff" : colors.brandPrimary} />
                  <T color={preview ? "#fff" : colors.onSurface} weight="semi">{preview ? "تغيير الصورة" : "اختيار صورة الفرع"}</T>
                </View>
              </Pressable>
              <T weight="semi" size={type.sm} style={styles.label}>اسم الفرع أو العلامة</T>
              <TextInput testID="branch-name" value={name} onChangeText={setName} style={styles.input} placeholder="مثال: المراعي" placeholderTextColor={colors.muted} textAlign="right" />
              <T weight="semi" size={type.sm} style={styles.label}>ترتيب الظهور</T>
              <TextInput testID="branch-sort" value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} textAlign="right" />
              <Button title={editing?.id ? "حفظ التعديل" : "إضافة الفرع"} icon="check" onPress={save} loading={saving} style={{ marginTop: spacing.lg }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  addButton: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  listHeader: { paddingTop: spacing.md },
  categoryList: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  categoryChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  categoryChipActive: { backgroundColor: colors.brandPrimary },
  listContent: { padding: spacing.lg, gap: spacing.md },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  branchImage: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surfaceSecondary },
  cardCopy: { flex: 1, gap: 3 },
  actions: { gap: spacing.sm },
  actionButton: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  deleteAction: { backgroundColor: "#FCEEEE" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "90%" },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  imagePicker: { height: 170, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  imageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  input: { height: 50, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
});