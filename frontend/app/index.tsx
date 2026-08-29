import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/lib/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center} testID="boot-loader">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.role === "manager") return <Redirect href="/(manager)" />;
  if (user.role === "delivery") return <Redirect href="/(delivery)" />;
  return <Redirect href="/(customer)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
