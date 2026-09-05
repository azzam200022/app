import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { api, BACKEND } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

export default function SyncSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setCfg(await api.syncConfig()); }
      catch (e: any) { show(e.message, "error"); }
      finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line

  const fullUrl = cfg ? `${BACKEND}${cfg.path}` : "";
  const sampleJson = cfg ? JSON.stringify(cfg.sample, null, 2) : "";

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    show(`تم نسخ ${label}`);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="sync-back" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Feather name="arrow-right" size={22} color="#fff" />
        </Pressable>
        <T weight="displayBold" size={type.xl} color="#fff">ربط نقطة البيع (الكاشير)</T>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing["3xl"] }}>
          <View style={styles.intro}>
            <Feather name="link" size={18} color={colors.brandPrimary} />
            <T color={colors.onSurfaceSecondary} style={{ flex: 1, lineHeight: 22 }}>
              اربط نظام الكاشير الخاص بك لمزامنة الكميات والأسعار تلقائياً مع التطبيق. زوّد نظامك بالمعلومات التالية.
            </T>
          </View>

          <Field label="رابط المزامنة (Endpoint)" value={fullUrl} onCopy={() => copy(fullUrl, "الرابط")} />
          <Field label="طريقة الطلب (Method)" value={cfg.method} mono />
          <Field label={`اسم الترويسة (Header)`} value={cfg.header_name} mono onCopy={() => copy(cfg.header_name, "اسم الترويسة")} />
          <Field label="مفتاح المزامنة (Sync Key)" value={cfg.sync_key} secretable onCopy={() => copy(cfg.sync_key, "المفتاح")} />

          <T weight="displayBold" size={type.lg} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>مثال على البيانات (JSON)</T>
          <View style={styles.codeBox}>
            <T style={styles.code}>{sampleJson}</T>
          </View>
          <Pressable testID="copy-sample" onPress={() => copy(sampleJson, "المثال")} style={styles.copyRow}>
            <Feather name="copy" size={16} color={colors.brandPrimary} />
            <T color={colors.brandPrimary} weight="semi">نسخ المثال</T>
          </Pressable>

          <View style={styles.noteBox}>
            <Feather name="info" size={16} color={colors.gold} />
            <T size={type.sm} color={colors.onSurfaceTertiary} style={{ flex: 1, lineHeight: 20 }}>
              يتم المطابقة عبر الباركود. أرسل الكمية (quantity) لتحديث المخزون، والسعر (price) اختياري لتحديث السعر. المنتجات غير الموجودة تُرجَع ضمن قائمة "not_found".
            </T>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Field({ label, value, onCopy, mono, secretable }: { label: string; value: string; onCopy?: () => void; mono?: boolean; secretable?: boolean }) {
  const [hidden, setHidden] = useState(!!secretable);
  const display = hidden ? "•".repeat(Math.min(value.length, 16)) : value;
  return (
    <View style={styles.field}>
      <T weight="semi" size={type.sm} color={colors.onSurfaceSecondary}>{label}</T>
      <View style={styles.valueRow}>
        <T style={[{ flex: 1 }, mono && styles.mono]} numberOfLines={2}>{display}</T>
        {secretable && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.smallBtn}>
            <Feather name={hidden ? "eye" : "eye-off"} size={16} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
        {onCopy && (
          <Pressable testID={`copy-${label}`} onPress={onCopy} hitSlop={8} style={styles.smallBtn}>
            <Feather name="copy" size={16} color={colors.brandPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.brandPrimary },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  field: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  valueRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  mono: { fontFamily: font.body, letterSpacing: 0.5 },
  smallBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  codeBox: { backgroundColor: colors.onSurface, borderRadius: radius.md, padding: spacing.md },
  code: { fontFamily: font.body, color: "#DCEBE8", fontSize: type.sm, lineHeight: 20, textAlign: "left" },
  copyRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  noteBox: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, backgroundColor: "#FBF6EA", borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.xl },
});
