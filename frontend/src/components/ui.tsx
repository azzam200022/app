import React from "react";
import { Text, TextProps, Pressable, View, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
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
  return <Text {...rest} style={[{ fontFamily: fam, fontSize: size, color, textAlign: "right", writingDirection: "rtl", includeFontPadding: false, lineHeight: Math.ceil(size * 1.38) }, style]} />;
}

export function PageHeading({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.pageHeading, style]}>
      <View style={styles.pageHeadingMain}>
        {leading}
        <View style={styles.pageHeadingCopy}>
          {eyebrow ? <T size={type.xs} weight="bold" color={colors.gold}>{eyebrow}</T> : null}
          <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary} numberOfLines={1}>{title}</T>
          {subtitle ? <T size={type.sm} color={colors.muted} numberOfLines={2} style={styles.pageHeadingSubtitle}>{subtitle}</T> : null}
        </View>
      </View>
      {trailing}
    </View>
  );
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
         { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.88 : 1, borderWidth: variant === "outline" ? 1 : variant === "secondary" ? 1 : 0, borderColor: variant === "secondary" ? colors.border : colors.brandPrimary },
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
  pageHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pageHeadingMain: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, minWidth: 0 },
  pageHeadingCopy: { flex: 1, alignItems: "flex-start", minWidth: 0 },
  pageHeadingSubtitle: { marginTop: 2 },
  btn: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  btnRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  btnText: { fontFamily: font.bodyBold, fontSize: type.lg },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl, gap: spacing.xs },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontFamily: font.bodyBold, fontSize: 11 },
});
