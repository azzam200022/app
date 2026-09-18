import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/lib/theme";
import { storage } from "@/src/utils/storage";
import { ONBOARDING_SEEN_KEY } from "@/src/lib/onboarding";

export default function Index() {
  const { user, loading } = useAuth();
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    storage.getItem(ONBOARDING_SEEN_KEY, false).then((seen) => {
      setHasSeenOnboarding(Boolean(seen));
      setOnboardingReady(true);
    });
  }, []);

  if (loading || !onboardingReady) {
    return (
      <View style={styles.center} testID="boot-loader">
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!user && !hasSeenOnboarding) return <Redirect href="/onboarding" />;
  if (!user) return <Redirect href="/login" />;
  if (user.role === "manager") return <Redirect href="/(manager)" />;
  if (user.role === "delivery") return <Redirect href="/(delivery)" />;
  return <Redirect href="/(customer)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
