import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, T } from "@/src/components/ui";
import { useToast } from "@/src/context/ToastContext";
import { api } from "@/src/lib/api";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";

export default function ManagerNotifications() {
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pushKeyConfigured, setPushKeyConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const status = await api.adminPushStatus();
      setPushKeyConfigured(status?.push_key_configured === true);
    } catch (error: any) {
      setPushKeyConfigured(null);
      show(error?.message || "تعذر التحقق من إعدادات الإشعارات", "error");
    } finally {
      setChecking(false);
    }
  }, [show]);

  useFocusEffect(useCallback(() => { void loadStatus(); }, [loadStatus]));

  const send = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (!cleanTitle || !cleanMessage) {
      show("اكتب عنوان الإشعار ونصه أولاً", "error");
      return;
    }
    setSending(true);
    try {
      const result = await api.sendCustomerNotification({ title: cleanTitle, message: cleanMessage });
      setConfirming(false);
      if (result?.requested_count) {
        show("تم تسليم طلب الإرسال إلى خدمة الإشعارات لـ " + result.requested_count + " حساب عميل");
        setTitle("");
        setMessage("");
      } else {
        show("لا توجد حسابات عملاء لإرسال الإشعار إليها", "error");
      }
    } catch (error: any) {
      show(error?.message || "تعذر إرسال الإشعار", "error");
    } finally {
      setSending(false);
    }
  };

  const canReview = Boolean(title.trim() && message.trim() && pushKeyConfigured === true && !checking);
  const statusLabel = checking
    ? "جارٍ التحقق من إعداد الخادم"
    : pushKeyConfigured === true
      ? "مفتاح الإشعارات موجود على الخادم"
      : pushKeyConfigured === false
        ? "مفتاح الإشعارات غير مهيأ"
        : "تعذر التحقق من إعداد الخادم";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headingRow}>
          <View style={styles.iconBox}><Feather name="bell" size={21} color={colors.brandPrimary} /></View>
          <View style={styles.headingText}>
            <T weight="displayBold" size={type.xl}>إشعارات العملاء</T>
            <T color={colors.muted} size={type.sm}>إرسال رسالة إلى عملاء المتجر</T>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.statusCard}>
          <Feather name={pushKeyConfigured === true ? "check-circle" : "alert-circle"} size={20} color={pushKeyConfigured === true ? colors.success : colors.gold} />
          <View style={styles.statusCopy}>
            <T weight="bold">{statusLabel}</T>
            <T color={colors.muted} size={type.xs}>هذا يتحقق من وجود مفتاح الخادم فقط، ولا يؤكد إعداد FCM/APNs أو وصول الإشعار إلى جهاز بعينه.</T>
          </View>
        </View>

        {pushKeyConfigured === false && (
          <View style={styles.warningCard}>
            <T weight="bold" color={colors.error}>يلزم إعداد EMERGENT_PUSH_KEY في أسرار الخادم، وإعداد بيانات Apple وAndroid لدى مزود الإشعارات.</T>
          </View>
        )}

        <View style={styles.infoCard}>
          <Feather name="info" size={18} color={colors.brandPrimary} />
          <T style={styles.infoText} size={type.sm}>سيُرسل الإشعار إلى حسابات العملاء، ويظهر على الأجهزة التي فعّلت الإشعارات وسجّلت جهازًا. لا يُرسل أي شيء قبل التأكيد.</T>
        </View>

        <View style={styles.formCard}>
          <T weight="bold" style={styles.label}>عنوان الإشعار</T>
          <TextInput
            testID="customer-notification-title"
            value={title}
            onChangeText={(value) => { setTitle(value); setConfirming(false); }}
            placeholder="مثال: عروض جديدة هذا الأسبوع"
            placeholderTextColor={colors.muted}
            maxLength={80}
            style={styles.input}
            textAlign="right"
            writingDirection="rtl"
          />
          <T color={colors.muted} size={type.xs} style={styles.counter}>{title.length}/80</T>

          <T weight="bold" style={styles.label}>نص الإشعار</T>
          <TextInput
            testID="customer-notification-message"
            value={message}
            onChangeText={(value) => { setMessage(value); setConfirming(false); }}
            placeholder="اكتب الرسالة التي ستظهر للعملاء"
            placeholderTextColor={colors.muted}
            maxLength={300}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.messageInput]}
            textAlign="right"
            writingDirection="rtl"
          />
          <T color={colors.muted} size={type.xs} style={styles.counter}>{message.length}/300</T>
        </View>

        {confirming ? (
          <View style={styles.confirmCard}>
            <T weight="displayBold" size={type.lg}>تأكيد الإرسال إلى العملاء</T>
            <View style={styles.preview}>
              <T weight="bold">{title.trim()}</T>
              <T style={styles.previewMessage}>{message.trim()}</T>
            </View>
            <T color={colors.muted} size={type.xs}>سيُطلب الإرسال لكل حساب عميل؛ قد لا تصل الرسالة إلى الأجهزة التي لا تملك إذنًا أو رمزًا صالحًا.</T>
            <Button title="تأكيد الإرسال للجميع" icon="send" loading={sending} disabled={sending} onPress={send} testID="confirm-customer-notification" />
            <Button title="العودة للتعديل" variant="outline" disabled={sending} onPress={() => setConfirming(false)} />
          </View>
        ) : (
          <Button
            title="مراجعة الإشعار قبل الإرسال"
            icon="send"
            disabled={!canReview}
            onPress={() => setConfirming(true)}
            testID="review-customer-notification"
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headingRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  headingText: { flex: 1, alignItems: "flex-start", gap: 2 },
  content: { padding: spacing.lg, gap: spacing.md },
  statusCard: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  statusCopy: { flex: 1, gap: 4, alignItems: "flex-start" },
  warningCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surface },
  infoCard: { flexDirection: "row-reverse", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  infoText: { flex: 1 },
  formCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, gap: spacing.xs },
  label: { marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: font.body, fontSize: type.base, color: colors.onSurface },
  messageInput: { minHeight: 132 },
  counter: { alignSelf: "flex-start", marginBottom: spacing.xs },
  confirmCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.surface, gap: spacing.md },
  preview: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, gap: spacing.xs },
  previewMessage: { textAlign: "right" },
});
