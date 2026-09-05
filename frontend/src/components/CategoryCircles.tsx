import React from "react";
import { ScrollView, Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { colors, font, radius, spacing, type } from "@/src/lib/theme";
import { resolveImage } from "@/src/lib/api";
import { T } from "@/src/components/ui";

export function CategoryCircles({ items, selected, onSelect }: { items: { name: string; image?: string | null }[]; selected: string; onSelect: (c: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((c) => {
        const active = c.name === selected;
        const isAll = !c.image;
        return (
          <Pressable key={c.name} testID={`cat-circle-${c.name}`} onPress={() => onSelect(c.name)} style={styles.item}>
            <View style={[styles.circle, active && styles.circleActive]}>
              {isAll ? (
                <Feather name="grid" size={24} color={active ? "#fff" : colors.brandPrimary} />
              ) : (
                <Image source={{ uri: resolveImage(c.image!) }} style={styles.img} contentFit="cover" />
              )}
            </View>
            <T size={type.sm} weight={active ? "bold" : "semi"} color={active ? colors.brandPrimary : colors.onSurfaceSecondary} numberOfLines={1} style={styles.label}>{c.name}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  item: { alignItems: "center", width: 74, flexShrink: 0 },
  circle: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  circleActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  img: { width: "100%", height: "100%" },
  label: { marginTop: spacing.xs, textAlign: "center", maxWidth: 74 },
});
