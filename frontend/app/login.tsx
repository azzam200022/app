import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { api } from "@/src/lib/api";

WebBrowser.maybeCompleteAuthSession();

const processed = new Set<string>();

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginEmail, loginWithToken } = useAuth();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);

  const exchange = useCallback(async (sessionId: string) => {
    if (processed.has(sessionId)) return;
    processed.add(sessionId);
    setGLoading(true);
    try {
      const res = await api.googleSession(sessionId);
      await loginWithToken(res.session_token);
      router.replace("/");
    } catch (e: any) {
      show(e.message || "فشل تسجيل الدخول عبر جوجل", "error");
    } finally {
      setGLoading(false);
    }
  }, [loginWithToken, router, show]);

  // Web: detect session_id on mount
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const raw = window.location.hash + " " + window.location.search;
    const m = raw.match(/session_id=([^&#\s]+)/);
    if (m) {
      exchange(decodeURIComponent(m[1])).then(() => {
        try { window.history.replaceState(window.history.state, "", window.location.pathname); } catch {}
      });
    }
  }, [exchange]);

  // Mobile: cold start + hot links
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = (url: string | null) => {
      if (!url) return;
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      if (m) exchange(decodeURIComponent(m[1]));
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [exchange]);

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
      const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        const m = result.url.match(/[?#&]session_id=([^&#]+)/);
        if (m) await exchange(decodeURIComponent(m[1]));
      }
    } catch (e: any) {
      show("تعذر فتح نافذة جوجل", "error");
    } finally {
      setGLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source={{ uri: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&q=80" }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["rgba(26,31,27,0.55)", "rgba(26,31,27,0.97)"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.logoCard}>
            <Image source={require("../assets/images/logo-binsaleem.png")} style={styles.logoImg} contentFit="contain" />
          </View>
          <T color="rgba(255,255,255,0.85)" size={type.lg} style={{ marginTop: spacing.lg }}>تسوّق الفخامة يصلك إلى باب بيتك</T>
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
  hero: { height: 320 },
  heroContent: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "center", alignItems: "center" },
  logoCard: { backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 24, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderWidth: 1, borderColor: "rgba(197,160,89,0.5)" },
  logoImg: { width: 200, height: 120 },
  sheet: { flex: 1, marginTop: -24, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 54, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: font.body, fontSize: type.base, color: colors.onSurface, height: "100%" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  googleBtn: { height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  googleRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  registerLink: { alignItems: "center", marginTop: spacing.xl },
});
