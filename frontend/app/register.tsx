import React, { useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { Field } from "./login";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { registerEmail } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name || !email || !password) return show("يرجى تعبئة جميع الحقول", "error");
    if (password.length < 6) return show("كلمة المرور 6 أحرف على الأقل", "error");
    setLoading(true);
    try {
      await registerEmail(name.trim(), email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="reg-back" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Feather name="arrow-right" size={22} color={colors.onSurface} />
        </Pressable>
        <T weight="displayBold" size={type.xl}>إنشاء حساب</T>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <T color={colors.muted} style={{ marginBottom: spacing.lg }}>انضم إلى سوق ماركت وابدأ التسوق بسهولة</T>
          <Field icon="user" placeholder="الاسم الكامل" value={name} onChangeText={setName} testID="reg-name" />
          <Field icon="mail" placeholder="البريد الإلكتروني" value={email} onChangeText={setEmail} keyboardType="email-address" testID="reg-email" />
          <Field icon="lock" placeholder="كلمة المرور" value={password} onChangeText={setPassword} secure testID="reg-password" />
          <Button title="إنشاء الحساب" onPress={submit} loading={loading} testID="reg-submit" style={{ marginTop: spacing.md }} />
          <Pressable testID="go-login" onPress={() => router.replace("/login")} style={styles.link}>
            <T color={colors.muted}>لديك حساب بالفعل؟ <T color={colors.brandPrimary} weight="bold">سجّل الدخول</T></T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  link: { alignItems: "center", marginTop: spacing.xl },
});
