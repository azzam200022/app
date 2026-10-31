import React from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/src/lib/theme";

/** A quiet leafy accent for the customer-facing surfaces. */
export function BotanicalPattern() {
  return (
    <View pointerEvents="none" style={styles.pattern}>
      <View style={[styles.sprig, styles.topStart]}>
        <View style={styles.stem} />
        <MaterialCommunityIcons name="leaf" size={30} color={colors.botanical} style={styles.leafOne} />
        <MaterialCommunityIcons name="leaf" size={24} color={colors.botanical} style={styles.leafTwo} />
        <MaterialCommunityIcons name="leaf" size={28} color={colors.botanical} style={styles.leafThree} />
        <MaterialCommunityIcons name="leaf" size={22} color={colors.botanical} style={styles.leafFour} />
      </View>
      <View style={[styles.sprig, styles.bottomEnd]}>
        <View style={styles.stem} />
        <MaterialCommunityIcons name="leaf" size={30} color={colors.botanical} style={styles.leafOne} />
        <MaterialCommunityIcons name="leaf" size={24} color={colors.botanical} style={styles.leafTwo} />
        <MaterialCommunityIcons name="leaf" size={28} color={colors.botanical} style={styles.leafThree} />
        <MaterialCommunityIcons name="leaf" size={22} color={colors.botanical} style={styles.leafFour} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pattern: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  sprig: { position: "absolute", width: 112, height: 132, opacity: 0.52 },
  topStart: { top: 92, start: -24, transform: [{ rotate: "-10deg" }] },
  bottomEnd: { bottom: 132, end: -24, transform: [{ scaleX: -1 }, { rotate: "-12deg" }] },
  stem: { position: "absolute", top: 25, start: 55, width: 2, height: 88, borderRadius: 1, backgroundColor: colors.botanical, transform: [{ rotate: "-24deg" }] },
  leafOne: { position: "absolute", top: 22, start: 23, transform: [{ rotate: "-35deg" }] },
  leafTwo: { position: "absolute", top: 38, start: 57, transform: [{ rotate: "38deg" }] },
  leafThree: { position: "absolute", top: 62, start: 16, transform: [{ rotate: "-42deg" }] },
  leafFour: { position: "absolute", top: 78, start: 52, transform: [{ rotate: "34deg" }] },
});
