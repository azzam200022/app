import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  const rows = [
    { icon: "heart", label: "المفضلة", onPress: () => router.push("/favorites") },
    { icon: "package", label: "طلباتي", onPress: () => router.push("/(customer)/orders") },
    { icon: "tag", label: "العروض والخصومات", onPress: () => router.push("/offers") },
    { icon: "map-pin", label: "الدفع عند الاستلام", onPress: () => {} },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.avatar}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <Feather name="user" size={30} color="#fff" />
          )}
        </View>
        <T weight="displayBold" size={type.xl} color="#fff" style={{ marginTop: spacing.md }}>{user?.name}</T>
        <T color="rgba(255,255,255,0.75)">{user?.email}</T>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.card}>
          {rows.map((r, i) => (
            <Pressable key={r.label} testID={`profile-${r.icon}`} onPress={r.onPress} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
              <View style={styles.rowStart}>
                <View style={styles.rowIcon}><Feather name={r.icon as any} size={18} color={colors.brandPrimary} /></View>
                <T weight="semi">{r.label}</T>
              </View>
              <Feather name="chevron-left" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <Button title="تسجيل الخروج" variant="outline" icon="log-out" onPress={async () => { await logout(); router.replace("/login"); }} testID="logout-btn" style={{ marginTop: spacing.xl }} />
        <T color={colors.muted} size={type.sm} style={{ textAlign: "center", marginTop: spacing.lg }}>سوق ماركت • الإصدار 1.0</T>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, alignItems: "center", paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 2, borderColor: colors.gold },
  card: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowStart: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
