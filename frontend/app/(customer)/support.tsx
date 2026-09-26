import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { api, resolveImage, uploadImage } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

type SupportTicket = { id: string; subject: string; category: string; status: string; message_count?: number; updated_at?: string; created_at?: string; };
type SupportMessage = { id: string; message: string; sender_role: "customer" | "manager"; sender_name?: string; attachment_url?: string | null; created_at?: string; };

type TicketDetails = { ticket: SupportTicket; messages: SupportMessage[] };

const CATEGORIES = [
  { value: "order", label: "طلب" },
  { value: "delivery", label: "توصيل" },
  { value: "product", label: "منتج" },
  { value: "other", label: "أخرى" },
];

const STATUS_LABEL: Record<string, string> = { open: "مفتوحة", pending: "بانتظار الرد", closed: "مغلقة" };

export default function Support() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ticketId?: string; orderId?: string }>();
  const { show } = useToast();
  const initialTicketId = typeof params.ticketId === "string" ? params.ticketId : undefined;
  const initialOrderId = typeof params.orderId === "string" ? params.orderId : undefined;
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<TicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [category, setCategory] = useState("other");
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [replyAttachmentUri, setReplyAttachmentUri] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const data = await api.supportTickets();
      const nextTickets = Array.isArray(data) ? data : [];
      setTickets(nextTickets);
      if (initialTicketId) {
        const found = nextTickets.find((item: SupportTicket) => item.id === initialTicketId);
        if (found) await openTicket(found.id);
      }
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [initialTicketId, show]);

  const openTicket = useCallback(async (ticketId: string) => {
    setLoadingTicket(true);
    try {
      setSelected(await api.supportTicket(ticketId));
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setLoadingTicket(false);
    }
  }, [show]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const pickImage = async (forReply = false) => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show("اسمح للتطبيق بالوصول إلى الصور لإرفاق صورة", "error");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        if (forReply) setReplyAttachmentUri(result.assets[0].uri);
        else setAttachmentUri(result.assets[0].uri);
      }
    } catch (error: any) {
      show(error.message || "تعذر اختيار الصورة", "error");
    }
  };

  const uploadAttachment = async (uri: string | null) => {
    if (!uri) return undefined;
    const uploaded = await uploadImage(uri, Platform.OS === "web");
    return uploaded.url || uploaded.path;
  };

  const createTicket = async () => {
    if (!subject.trim() || (!newMessage.trim() && !attachmentUri)) {
      show("اكتب عنوان المشكلة وتفاصيلها أو أرفق صورة", "error");
      return;
    }
    setSending(true);
    try {
      const attachment_url = await uploadAttachment(attachmentUri);
      const created = await api.createSupportTicket({ category, subject: subject.trim(), message: newMessage.trim(), order_id: initialOrderId, attachment_url });
      setSelected(created);
      setTickets((current) => [created.ticket, ...current.filter((item) => item.id !== created.ticket.id)]);
      setSubject("");
      setNewMessage("");
      setAttachmentUri(null);
      show("تم إرسال رسالتك إلى الدعم");
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selected?.ticket?.id || (!reply.trim() && !replyAttachmentUri)) return;
    setSending(true);
    try {
      const attachment_url = await uploadAttachment(replyAttachmentUri);
      const message = await api.sendSupportMessage(selected.ticket.id, { message: reply.trim(), attachment_url });
      setSelected((current) => current ? { ...current, messages: [...current.messages, message], ticket: { ...current.ticket, status: "open" } } : current);
      setTickets((current) => current.map((item) => item.id === selected.ticket.id ? { ...item, status: "open", updated_at: new Date().toISOString() } : item));
      setReply("");
      setReplyAttachmentUri(null);
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  const renderAttachment = (url?: string | null) => url ? <Image source={{ uri: resolveImage(url) }} style={styles.messageImage} contentFit="cover" /> : null;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="support-back" onPress={() => selected ? setSelected(null) : router.back()} style={styles.backButton}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </Pressable>
          <T weight="displayBold" size={type.xl} color="#fff">مراسلة الدعم</T>
          <View style={styles.headerSpacer} />
        </View>
        <T color="rgba(255,255,255,0.78)" style={styles.headerHint}>{selected ? selected.ticket.subject : "نحن هنا لمساعدتك في أي مشكلة"}</T>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {loading || loadingTicket ? (
          <ActivityIndicator color={colors.brandPrimary} size="large" style={{ marginTop: spacing["2xl"] }} />
        ) : selected ? (
          <View>
            <Pressable onPress={() => setSelected(null)} style={styles.backToList}>
              <Feather name="chevron-right" size={18} color={colors.brandPrimary} />
              <T color={colors.brandPrimary} weight="semi">كل طلبات الدعم</T>
            </Pressable>
            <View style={styles.ticketMeta}>
              <View style={styles.ticketMetaText}>
                <T weight="displayBold" size={type.lg}>{selected.ticket.subject}</T>
                <T color={colors.muted} size={type.sm} style={{ marginTop: 4 }}>{STATUS_LABEL[selected.ticket.status] || selected.ticket.status}</T>
              </View>
              <View style={styles.statusDot}><Feather name="message-circle" size={18} color={colors.brandPrimary} /></View>
            </View>
            <View style={styles.messagesCard}>
              {selected.messages.map((item) => {
                const own = item.sender_role === "customer";
                return (
                  <View key={item.id} style={[styles.messageRow, own ? styles.messageRowOwn : styles.messageRowManager]}>
                    <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleManager]}>
                      {!own && <T color={colors.brandPrimary} weight="bold" size={type.xs} style={{ marginBottom: 4 }}>{item.sender_name || "الدعم"}</T>}
                      {item.message ? <T color={own ? "#fff" : colors.onSurface} style={{ lineHeight: 22 }}>{item.message}</T> : null}
                      {renderAttachment(item.attachment_url)}
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={styles.composerCard}>
              {replyAttachmentUri && <View style={styles.attachmentPreview}><Image source={{ uri: replyAttachmentUri }} style={styles.previewImage} contentFit="cover" /><Pressable onPress={() => setReplyAttachmentUri(null)} style={styles.removeAttachment}><Feather name="x" size={15} color="#fff" /></Pressable></View>}
              <TextInput value={reply} onChangeText={setReply} placeholder="اكتب ردك هنا..." placeholderTextColor={colors.muted} multiline style={styles.input} textAlign="right" />
              <View style={styles.composerActions}>
                <Pressable testID="support-reply-image" onPress={() => void pickImage(true)} style={styles.attachButton}><Feather name="image" size={20} color={colors.brandPrimary} /><T color={colors.brandPrimary} size={type.sm}>صورة</T></Pressable>
                <Pressable testID="support-reply-send" onPress={() => void sendReply()} disabled={sending} style={[styles.sendButton, sending && styles.disabled]}><T color="#fff" weight="bold">{sending ? "جارٍ الإرسال" : "إرسال"}</T><Feather name="send" size={17} color="#fff" /></Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View>
            {tickets.length > 0 && <View style={styles.section}><View style={styles.sectionTitleRow}><T weight="displayBold" size={type.xl}>طلباتي السابقة</T><Pressable onPress={() => { setSubject(""); setNewMessage(""); setAttachmentUri(null); }}><T color={colors.brandPrimary} weight="semi">طلب جديد</T></Pressable></View><View style={styles.ticketList}>{tickets.map((item) => <Pressable key={item.id} testID={"support-ticket-" + item.id} onPress={() => void openTicket(item.id)} style={styles.ticketItem}><View style={styles.ticketItemText}><T weight="semi">{item.subject}</T><T color={colors.muted} size={type.sm} style={{ marginTop: 4 }}>{STATUS_LABEL[item.status] || item.status}</T></View><Feather name="chevron-left" size={20} color={colors.muted} /></Pressable>)}</View></View>}
            <View style={styles.section}><T weight="displayBold" size={type.xl}>أرسل رسالة للدعم</T><T color={colors.muted} size={type.sm} style={styles.sectionHint}>صف المشكلة بالتفصيل، ويمكنك إرفاق صورة توضحها.</T></View>
            <View style={styles.formCard}>
              {initialOrderId ? <View style={styles.orderLink}><Feather name="package" size={17} color={colors.brandPrimary} /><T color={colors.brandPrimary} size={type.sm} weight="semi">الدعم متعلق بالطلب: {initialOrderId}</T></View> : null}
              <T weight="semi" style={styles.label}>نوع المشكلة</T>
              <View style={styles.categoryRow}>{CATEGORIES.map((item) => <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.categoryChip, category === item.value && styles.categoryChipActive]}><T color={category === item.value ? "#fff" : colors.onSurface} size={type.sm} weight="semi">{item.label}</T></Pressable>)}</View>
              <T weight="semi" style={styles.label}>عنوان المشكلة</T>
              <TextInput value={subject} onChangeText={setSubject} placeholder="مثال: لم يصل طلبي" placeholderTextColor={colors.muted} style={styles.input} textAlign="right" />
              <T weight="semi" style={styles.label}>التفاصيل</T>
              <TextInput value={newMessage} onChangeText={setNewMessage} placeholder="اكتب تفاصيل المشكلة هنا..." placeholderTextColor={colors.muted} multiline numberOfLines={5} style={[styles.input, styles.multilineInput]} textAlign="right" />
              {attachmentUri && <View style={styles.attachmentPreview}><Image source={{ uri: attachmentUri }} style={styles.previewImage} contentFit="cover" /><Pressable onPress={() => setAttachmentUri(null)} style={styles.removeAttachment}><Feather name="x" size={15} color="#fff" /></Pressable></View>}
              <View style={styles.formActions}><Pressable testID="support-add-image" onPress={() => void pickImage(false)} style={styles.attachButton}><Feather name="image" size={20} color={colors.brandPrimary} /><T color={colors.brandPrimary} size={type.sm}>إرفاق صورة</T></Pressable><Pressable testID="support-send" onPress={() => void createTicket()} disabled={sending} style={[styles.sendButton, sending && styles.disabled]}><T color="#fff" weight="bold">{sending ? "جارٍ الإرسال" : "إرسال للدعم"}</T><Feather name="send" size={17} color="#fff" /></Pressable></View>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 40 },
  headerHint: { textAlign: "center", marginTop: spacing.sm },
  content: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionHint: { marginTop: spacing.xs, lineHeight: 21 },
  ticketList: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  ticketItem: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  ticketItemText: { flex: 1 },
  formCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  orderLink: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  label: { textAlign: "right", marginBottom: spacing.sm, marginTop: spacing.sm },
  categoryRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  categoryChip: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  categoryChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface, fontFamily: "System", fontSize: type.md },
  multilineInput: { minHeight: 120, textAlignVertical: "top" },
  formActions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, gap: spacing.md },
  composerCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg },
  composerActions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  attachButton: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  sendButton: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minWidth: 128 },
  disabled: { opacity: 0.6 },
  attachmentPreview: { alignSelf: "flex-end", position: "relative", marginBottom: spacing.md },
  previewImage: { width: 96, height: 96, borderRadius: radius.sm },
  removeAttachment: { position: "absolute", top: 5, left: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  backToList: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", marginBottom: spacing.md },
  ticketMeta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  ticketMetaText: { flex: 1 },
  statusDot: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  messagesCard: { gap: spacing.md },
  messageRow: { width: "100%", flexDirection: "row" },
  messageRowOwn: { justifyContent: "flex-start" },
  messageRowManager: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", borderRadius: radius.md, padding: spacing.md },
  bubbleOwn: { backgroundColor: colors.brandPrimary, borderBottomLeftRadius: 4 },
  bubbleManager: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderBottomRightRadius: 4 },
  messageImage: { width: 190, height: 150, borderRadius: radius.sm, marginTop: spacing.sm },
});
