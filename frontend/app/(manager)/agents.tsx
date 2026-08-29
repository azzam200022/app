import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, EmptyState } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

const ROLE_LABEL: Record<string, string> = { customer: "زبون", delivery: "مندوب توصيل", manager: "مدير" };

export default function Agents() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { try { setUsers(await api.adminUsers()); } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); } }, [show]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setRole = async (u: any, role: string) => {
    try { await api.adminSetRole(u.user_id, role); show(role === "delivery" ? "تم تعيينه مندوباً" : "تم التحويل إلى زبون"); setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? { ...x, role } : x)); }
    catch (e: any) { show(e.message, "error"); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="agents-back" onPress={() => router.back()} hitSlop={10} style={styles.back}><Feather name="arrow-right" size={22} color={colors.onSurface} /></Pressable>
        <T weight="displayBold" size={type.xl}>المستخدمون والمندوبون</T>
        <View style={{ width: 40 }} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : (
        <FlatList data={users} keyExtractor={(i) => i.user_id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={<EmptyState icon="users" title="لا يوجد مستخدمون" />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`user-${item.user_id}`}>
              <View style={styles.avatar}><Feather name={item.role === "manager" ? "shield" : item.role === "delivery" ? "truck" : "user"} size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <T weight="semi">{item.name}</T>
                <T color={colors.muted} size={type.sm}>{item.email}</T>
                <View style={styles.roleBadge}><T size={11} weight="bold" color={colors.brandPrimary}>{ROLE_LABEL[item.role]}</T></View>
              </View>
              {item.role !== "manager" && (
                item.role === "delivery" ? (
                  <Pressable testID={`demote-${item.user_id}`} onPress={() => setRole(item, "customer")} style={[styles.roleBtn, { borderColor: colors.error }]}>
                    <T size={type.sm} weight="bold" color={colors.error}>إلغاء</T>
                  </Pressable>
                ) : (
                  <Pressable testID={`promote-${item.user_id}`} onPress={() => setRole(item, "delivery")} style={[styles.roleBtn, { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary }]}>
                    <T size={type.sm} weight="bold" color="#fff">تعيين مندوب</T>
                  </Pressable>
                )
              )}
            </View>
          )} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  roleBadge: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, marginTop: 4 },
  roleBtn: { paddingHorizontal: spacing.md, height: 40, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
