import React, { useEffect, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { ResponseType } from "expo-auth-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginEmail, loginGoogle, loginGoogleWithIdToken } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    responseType: ResponseType.IdToken,
    scopes: ["profile", "email"],
  });

  useEffect(() => {
    if (Platform.OS === "web" || response?.type !== "success") return;
    const idToken = response.params?.id_token;
    if (!idToken) {
      setGLoading(false);
      show("لم يتم استلام رمز Google", "error");
      return;
    }
    setGLoading(true);
    loginGoogleWithIdToken(idToken)
      .then(() => router.replace("/"))
      .catch((error: any) => show(error.message, "error"))
      .finally(() => setGLoading(false));
  }, [response, loginGoogleWithIdToken, router, show]);

  const doLogin = async () => {
    if (!email || !password) return show("أدخل البريد وكلمة المرور", "error");
    setLoading(true);
    try {
      await loginEmail(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const doGoogle = async () => {
    setGLoading(true);
    try {
      if (Platform.OS === "web") {
        await loginGoogle();
        router.replace("/");
        return;
      }
      if (!request) throw new Error("إعداد Google غير مكتمل، أضف معرفات OAuth الخاصة بالتطبيق");
      await promptAsync();
    } catch (e: any) {
      setGLoading(false);
      show(e.message || "تعذر تسجيل الدخول عبر Google", "error");
    } finally {
      if (Platform.OS === "web") setGLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <LinearGradient colors={["#F6EFDD", "#EAF0E5", "#DCEADE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* faint decorative grocery motifs */}
        <Feather name="shopping-cart" size={56} color="#1F4529" style={styles.decoCart} />
        <View style={styles.decoAppleA} />
        <View style={styles.decoAppleB} />
        <View style={styles.decoAppleC} />
        <Feather name="droplet" size={44} color="#C5A059" style={styles.decoDrop} />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <Image source={require("../assets/images/logo-binsaleem.png")} style={styles.logoImg} contentFit="contain" />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <T weight="displayBold" size={type["2xl"]}>مرحباً بعودتك</T>
          <T color={colors.muted} style={{ marginBottom: spacing.lg }}>سجّل الدخول لمتابعة التسوق</T>

          <Field icon="mail" placeholder="البريد الإلكتروني" value={email} onChangeText={setEmail} keyboardType="email-address" testID="login-email" />
          <Field icon="lock" placeholder="كلمة المرور" value={password} onChangeText={setPassword} secure testID="login-password" />

          <Button title="تسجيل الدخول" onPress={doLogin} loading={loading} testID="login-submit" style={{ marginTop: spacing.md }} />

          <View style={styles.divider}>
            <View style={styles.line} />
            <T color={colors.muted} size={type.sm}>أو</T>
            <View style={styles.line} />
          </View>

          <Pressable testID="google-login" onPress={doGoogle} disabled={gLoading} style={styles.googleBtn}>
            {gLoading ? <ActivityIndicator color={colors.onSurface} /> : (
              <View style={styles.googleRow}>
                <Image source={{ uri: "https://developers.google.com/identity/images/g-logo.png" }} style={{ width: 20, height: 20 }} />
                <T weight="semi">المتابعة عبر جوجل</T>
              </View>
            )}
          </Pressable>

          <Pressable testID="go-register" onPress={() => router.push("/register")} style={styles.registerLink}>
            <T color={colors.muted}>ليس لديك حساب؟ <T color={colors.brandPrimary} weight="bold">أنشئ حساباً</T></T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Field({ icon, secure, testID, ...rest }: any) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Feather name={icon} size={18} color={colors.muted} />
      <TextInput
        testID={testID}
        style={styles.input}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure && !show}
        autoCapitalize="none"
        textAlign="right"
        {...rest}
      />
      {secure && (
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
          <Feather name={show ? "eye-off" : "eye"} size={18} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 400, overflow: "hidden" },
  heroContent: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "center", alignItems: "center" },
  logoImg: { width: 260, height: 170 },
  decoCart: { position: "absolute", top: 96, left: 44, opacity: 0.12 },
  decoDrop: { position: "absolute", bottom: 70, right: 48, opacity: 0.16, transform: [{ rotate: "12deg" }] },
  decoAppleA: { position: "absolute", top: 110, right: 60, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#3A5A40", opacity: 0.2 },
  decoAppleB: { position: "absolute", bottom: 90, left: 78, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#3A5A40", opacity: 0.18 },
  decoAppleC: { position: "absolute", top: 210, left: 30, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#C5A059", opacity: 0.22 },
  sheet: { flex: 1, marginTop: -28, backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 54, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, height: "100%" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  googleBtn: { height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  googleRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  registerLink: { alignItems: "center", marginTop: spacing.xl },
});
