import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { Button, T } from "@/src/components/ui";

type ConfirmLogoutModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  testIDPrefix: string;
};

export function ConfirmLogoutModal({
  visible,
  onCancel,
  onConfirm,
  testIDPrefix,
}: ConfirmLogoutModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        testID={`${testIDPrefix}-logout-backdrop`}
        style={styles.backdrop}
        onPress={onCancel}
      >
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.icon}>
            <Feather name="log-out" size={24} color={colors.error} />
          </View>
          <T weight="displayBold" size={type.xl} style={styles.title}>
            تأكيد تسجيل الخروج
          </T>
          <T color={colors.muted} style={styles.message}>
            هل أنت متأكد أنك تريد الخروج من حسابك؟
          </T>
          <View style={styles.actions}>
            <Button
              title="تأكيد الخروج"
              icon="log-out"
              onPress={onConfirm}
              testID={`${testIDPrefix}-confirm-logout`}
              style={styles.confirmButton}
            />
            <Button
              title="إلغاء"
              variant="secondary"
              onPress={onCancel}
              testID={`${testIDPrefix}-cancel-logout`}
              style={styles.actionButton}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.errorSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { textAlign: "center", marginTop: spacing.md },
  message: { textAlign: "center", marginTop: spacing.xs },
  actions: {
    width: "100%",
    flexDirection: "row-reverse",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionButton: { flex: 1 },
  confirmButton: { flex: 1, backgroundColor: colors.error },
});
