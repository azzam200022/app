import React from "react";
import { ScrollView, Pressable, StyleSheet } from "react-native";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";

export function CategoryChips({ categories, selected, onSelect }: { categories: string[]; selected: string; onSelect: (c: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {categories.map((c) => {
        const active = c === selected;
        return (
          <Pressable
            key={c}
            testID={`chip-${c}`}
            onPress={() => onSelect(c)}
            style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>{c}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

import { Text } from "react-native";

const styles = StyleSheet.create({
  container: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center", height: 56 },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", flexShrink: 0, borderWidth: 1 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipIdle: { backgroundColor: "#fff", borderColor: colors.border },
  chipText: { fontFamily: font.bodySemi, fontSize: type.base },
  chipTextActive: { color: colors.onBrandPrimary },
  chipTextIdle: { color: colors.onSurfaceSecondary },
});
