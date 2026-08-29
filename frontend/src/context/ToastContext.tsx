import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import { StyleSheet, Text, View, Animated, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, t?: ToastType) => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<ToastType>("success");
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const timer = useRef<any>(null);

  const show = useCallback((m: string, t: ToastType = "success") => {
    setMsg(m);
    setKind(t);
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 220, useNativeDriver: true }),
      ]).start();
    }, 2400);
  }, [opacity, translateY]);

  const bg = kind === "error" ? colors.error : kind === "info" ? colors.surfaceInverse : colors.brandPrimary;
  const icon = kind === "error" ? "alert-circle" : kind === "info" ? "info" : "check-circle";

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
        {!!msg && (
          <View style={[styles.toast, { backgroundColor: bg }]} testID="app-toast">
            <Feather name={icon as any} size={18} color="#fff" />
            <Text style={styles.txt}>{msg}</Text>
          </View>
        )}
      </Animated.View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: Platform.OS === "web" ? 24 : 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  txt: { color: "#fff", fontFamily: font.bodySemi, fontSize: type.base, textAlign: "right" },
});
