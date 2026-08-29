import React from "react";
import { Text, TextProps, Pressable, PressableProps, View, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";

export function T(props: TextProps & { weight?: "reg" | "semi" | "bold" | "display" | "displayBold" | "displayMed"; size?: number; color?: string }) {
  const { weight = "reg", size = type.base, color = colors.onSurface, style, ...rest } = props;
  const fam = {
    reg: font.body,
    semi: font.bodySemi,
    bold: font.bodyBold,
    display: font.display,
    displayMed: font.displayMedium,
    displayBold: font.displayBold,
  }[weight];
  return <Text {...rest} style={[{ fontFamily: fam, fontSize: size, color, textAlign: "right", writingDirection: "rtl" }, style]} />;
}

export function Button({
  title,
  onPress,
  loading,
  variant = "primary",
  icon,
  style,
  disabled,
  testID,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline" | "gold";
  icon?: string;
  style?: ViewStyle;
  disabled?: boolean;
  testID?: string;
}) {
  const bg = variant === "primary" ? colors.brandPrimary : variant === "gold" ? colors.gold : variant === "secondary" ? colors.surfaceSecondary : "transparent";
  const fg = variant === "secondary" ? colors.onSurface : variant === "outline" ? colors.brandPrimary : variant === "gold" ? "#1A1A1A" : colors.onBrandPrimary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === "outline" ? 1.5 : 0, borderColor: colors.brandPrimary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon && <Feather name={icon as any} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function EmptyState({ icon = "inbox", title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon as any} size={34} color={colors.brandSecondary} />
      </View>
      <T weight="displayBold" size={type.xl} style={{ marginTop: spacing.lg }}>{title}</T>
      {!!subtitle && <T color={colors.muted} style={{ marginTop: spacing.xs, textAlign: "center" }}>{subtitle}</T>}
    </View>
  );
}

export function Badge({ text, color = colors.gold, textColor = "#1A1A1A" }: { text: string; color?: string; textColor?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  btnRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  btnText: { fontFamily: font.bodyBold, fontSize: type.lg },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, alignSelf: "flex-start" },
  badgeText: { fontFamily: font.bodyBold, fontSize: 11 },
});
