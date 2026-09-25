import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";

type FaqItem = { icon: string; question: string; answer: string };

const FAQS: FaqItem[] = [
  {
    icon: "package",
    question: "كيف أتابع طلبي؟",
    answer: "افتح قسم طلباتي من حسابك، ثم اختر الطلب لمشاهدة حالته وتفاصيل التوصيل خطوة بخطوة.",
  },
  {
    icon: "clock",
    question: "متى يصل الطلب؟",
    answer: "تظهر حالة الطلب ومرحلة التوصيل في صفحة تفاصيل الطلب. سيتواصل معك المندوب عند خروجه للتوصيل.",
  },
  {
    icon: "edit-3",
    question: "هل أستطيع تعديل أو إلغاء الطلب؟",
    answer: "يمكنك طلب المساعدة قبل بدء التجهيز. أرسل رقم الطلب للدعم وسنراجع إمكانية التعديل أو الإلغاء.",
  },
  {
    icon: "alert-circle",
    question: "ماذا أفعل إذا كان المنتج ناقصًا أو متضررًا؟",
    answer: "احتفظ بالمنتج وصوّر المشكلة بوضوح، ثم أرسل رسالة للدعم مع رقم الطلب والصورة لنساعدك بسرعة.",
  },
];

export default function Help() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="help-back" onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </Pressable>
          <T weight="displayBold" size={type.xl} color="#fff">المساعدة والدعم</T>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.introIcon}><Feather name="headphones" size={28} color={colors.gold} /></View>
        <T weight="bold" size={type.lg} color="#fff" style={styles.introTitle}>كيف نقدر نساعدك؟</T>
        <T color="rgba(255,255,255,0.78)" style={styles.introText}>ابحث عن إجابة سريعة لمشكلتك، وسنضيف المراسلة المباشرة في الخطوة التالية.</T>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.sectionHeading}>
          <T weight="displayBold" size={type.xl}>الأسئلة الشائعة</T>
          <T color={colors.muted} size={type.sm}>إجابات مختصرة لأكثر الأسئلة تكرارًا</T>
        </View>

        <View style={styles.faqCard}>
          {FAQS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <Pressable
                key={item.question}
                testID={"faq-" + index + (isOpen ? "-open" : "")}
                onPress={() => setOpenIndex(isOpen ? null : index)}
                style={[styles.faqItem, index < FAQS.length - 1 && styles.faqDivider]}
              >
                <View style={styles.questionRow}>
                  <View style={styles.questionStart}>
                    <View style={styles.faqIcon}><Feather name={item.icon as any} size={18} color={colors.brandPrimary} /></View>
                    <T weight="semi" style={styles.question}>{item.question}</T>
                  </View>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={19} color={colors.muted} />
                </View>
                {isOpen && <T color={colors.muted} size={type.sm} style={styles.answer}>{item.answer}</T>}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.nextStepCard}>
          <View style={styles.nextStepIcon}><Feather name="message-circle" size={22} color={colors.gold} /></View>
          <View style={styles.nextStepCopy}>
            <T weight="bold" size={type.lg}>لم تجد الحل؟</T>
            <T color={colors.muted} size={type.sm} style={{ marginTop: 4 }}>في المرحلة التالية ستتمكن من مراسلة الدعم وإرسال صورة للمشكلة من داخل التطبيق.</T>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 40 },
  introIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(214,166,64,0.18)", alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: spacing.lg },
  introTitle: { textAlign: "center", marginTop: spacing.md },
  introText: { textAlign: "center", lineHeight: 22, marginTop: spacing.xs },
  content: { padding: spacing.lg },
  sectionHeading: { marginBottom: spacing.md },
  faqCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  faqItem: { padding: spacing.lg },
  faqDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  questionRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  questionStart: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  faqIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  question: { flex: 1, textAlign: "right" },
  answer: { textAlign: "right", lineHeight: 22, marginTop: spacing.md, paddingRight: 54 },
  nextStepCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: "rgba(31,69,41,0.12)" },
  nextStepIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  nextStepCopy: { flex: 1 },
});
