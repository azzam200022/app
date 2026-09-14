import React, { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Alert, Platform, Switch } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { api, resolveImage, uploadImage } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export default function ManagerBanners() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setBanners(await api.adminBanners()); }
    catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setEditing(null); setTitle(""); setSubtitle(""); setImageUri(null); setImageUrl(""); setSortOrder("0"); setIsActive(true);
  };
  const openCreate = () => { resetForm(); setEditing({}); };
  const openEdit = (item: any) => {
    setEditing(item); setTitle(item.title || ""); setSubtitle(item.subtitle || ""); setImageUri(null); setImageUrl(item.image_url || ""); setSortOrder(String(item.sort_order ?? 0)); setIsActive(item.is_active !== false);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return show("نحتاج صلاحية الوصول للصور", "error");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [16, 7] });
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!imageUri && !imageUrl.trim()) return show("حدد صورة للبانوراما", "error");
    setSaving(true);
    try {
      let finalImage = imageUrl.trim();
      if (imageUri) finalImage = (await uploadImage(imageUri, Platform.OS === "web")).url;
      const body = { title: title.trim(), subtitle: subtitle.trim(), image_url: finalImage, sort_order: Number(sortOrder) || 0, is_active: isActive };
      if (editing?.id) await api.updateBanner(editing.id, body); else await api.createBanner(body);
      show(editing?.id ? "تم تحديث البانوراما" : "تمت إضافة البانوراما");
      resetForm(); await load();
    } catch (e: any) { show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const remove = (item: any) => {
    Alert.alert("حذف البانوراما", "هل تريد حذف هذه البانوراما نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => { try { await api.deleteBanner(item.id); show("تم حذف البانوراما"); load(); } catch (e: any) { show(e.message, "error"); } } },
    ]);
  };

  const preview = imageUri || resolveImage(imageUrl);
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <T weight="displayBold" size={type.xl}>بانورامات العروض</T>
          <T color={colors.muted} size={type.sm}>{banners.length} بانوراما • يمكن عرض أكثر من بانوراما</T>
        </View>
        <Pressable testID="add-banner" onPress={openCreate} style={styles.addBtn}><Feather name="plus" size={20} color="#fff" /><T weight="bold" color="#fff">إضافة</T></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : banners.length === 0 ? (
        <View style={styles.center}><EmptyState icon="image" title="لا توجد بانورامات" subtitle="أضف أول بانوراما واختر صورتها" /></View>
      ) : (
        <FlatList data={banners} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} renderItem={({ item }) => (
          <View style={styles.card} testID={"banner-card-" + item.id}>
            <Image source={{ uri: resolveImage(item.image_url) }} style={styles.bannerImage} contentFit="cover" />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}><T weight="displayBold" size={type.lg} numberOfLines={1} style={{ flex: 1 }}>{item.title || "بانوراما بدون عنوان"}</T><View style={[styles.activePill, item.is_active ? styles.activeOn : styles.activeOff]}><T size={11} weight="bold" color={item.is_active ? colors.brandPrimary : colors.muted}>{item.is_active ? "ظاهرة" : "مخفية"}</T></View></View>
              {!!item.subtitle && <T color={colors.muted} size={type.sm} numberOfLines={2}>{item.subtitle}</T>}
              <T color={colors.muted} size={11}>ترتيب العرض: {item.sort_order ?? 0}</T>
              <View style={styles.actions}><Pressable testID={"edit-banner-" + item.id} onPress={() => openEdit(item)} style={styles.actionBtn}><Feather name="edit-2" size={17} color={colors.brandPrimary} /><T size={type.sm} weight="bold" color={colors.brandPrimary}>تعديل</T></Pressable><Pressable testID={"delete-banner-" + item.id} onPress={() => remove(item)} style={[styles.actionBtn, styles.deleteBtn]}><Feather name="trash-2" size={17} color={colors.error} /><T size={type.sm} weight="bold" color={colors.error}>حذف</T></Pressable></View>
            </View>
          </View>
        )} />
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={resetForm}>
        <Pressable style={styles.modalBg} onPress={resetForm}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.grabber} />
            <View style={styles.modalTitle}><T weight="displayBold" size={type.xl}>{editing?.id ? "تعديل البانوراما" : "إضافة بانوراما"}</T><Pressable onPress={resetForm}><Feather name="x" size={22} color={colors.muted} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Pressable testID="banner-pick-image" onPress={pickImage} style={styles.imagePicker}>{preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}<View style={[styles.imageOverlay, preview ? { backgroundColor: "rgba(0,0,0,0.38)" } : {}]}><Feather name="image" size={25} color={preview ? "#fff" : colors.brandPrimary} /><T weight="semi" color={preview ? "#fff" : colors.onSurface}>{preview ? "تغيير صورة البانوراما" : "اختيار صورة البانوراما"}</T></View></Pressable>
              <T weight="semi" size={type.sm} style={styles.label}>عنوان البانوراما</T><TextInput testID="banner-title" value={title} onChangeText={setTitle} style={styles.input} placeholder="مثال: عروض نهاية الأسبوع" placeholderTextColor={colors.muted} textAlign="right" />
              <T weight="semi" size={type.sm} style={styles.label}>الوصف المختصر</T><TextInput testID="banner-subtitle" value={subtitle} onChangeText={setSubtitle} style={styles.input} placeholder="مثال: خصومات تصل إلى 30%" placeholderTextColor={colors.muted} textAlign="right" />
              <View style={styles.row}><View style={{ flex: 1 }}><T weight="semi" size={type.sm} style={styles.label}>ترتيب العرض</T><TextInput testID="banner-sort" value={sortOrder} onChangeText={setSortOrder} style={styles.input} keyboardType="numeric" textAlign="right" /></View><View style={styles.switchBox}><T weight="semi" size={type.sm}>إظهار البانوراما</T><Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor="#fff" /></View></View>
              <Button title={saving ? "جارٍ الحفظ..." : "حفظ البانوراما"} icon="check" onPress={save} disabled={saving} style={{ marginTop: spacing.lg }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  bannerImage: { width: "100%", height: 150, backgroundColor: colors.surfaceSecondary },
  cardBody: { padding: spacing.md, gap: spacing.xs },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  activePill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  activeOn: { backgroundColor: colors.brandTertiary },
  activeOff: { backgroundColor: colors.surfaceSecondary },
  actions: { flexDirection: "row-reverse", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  deleteBtn: { borderColor: colors.error },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: "92%" },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  imagePicker: { height: 150, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  imageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  label: { marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { height: 50, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
  row: { flexDirection: "row-reverse", gap: spacing.md, alignItems: "flex-end" },
  switchBox: { flex: 1, minHeight: 50, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.sm },
});