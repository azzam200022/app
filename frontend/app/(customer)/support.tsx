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

type SupportTicket = { id: string; subject: string; category: string; status: string; message_count?: number; customer_unread?: boolean; order_id?: string; updated_at?: string; created_at?: string; };
type SupportMessage = { id: string; message: string; sender_role: "customer" | "manager"; sender_name?: string; attachment_url?: string | null; created_at?: string; };

type TicketDetails = { ticket: SupportTicket; messages: SupportMessage[] };

function normalizeTickets(value: unknown): SupportTicket[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item: any) => {
    const id = String(item?.id ?? "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }) as SupportTicket[];
}

function normalizeMessages(value: unknown): SupportMessage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item: any) => {
    if (!item || typeof item !== "object") return false;
    const id = String(item.id ?? "").trim();
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }) as SupportMessage[];
}

function appendMessage(messages: SupportMessage[], incoming: SupportMessage): SupportMessage[] {
  if (incoming?.id && messages.some((item) => item.id === incoming.id)) return messages;
  return [...messages, incoming];
}

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
  const [supportView, setSupportView] = useState<"tickets" | "new">(initialOrderId ? "new" : "tickets");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<TicketDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [category, setCategory] = useState("other");
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [replyAttachmentUri, setReplyAttachmentUri] = useState<string | null>(null);

  const openTicket = useCallback(async (ticketId: string, wasUnread = false) => {
    setLoadingTicket(true);
    try {
      const details = await api.supportTicket(ticketId);
      if (!details?.ticket) throw new Error("تعذّر العثور على تذكرة الدعم.");
      setSelected({ ...details, messages: normalizeMessages(details.messages) });
      try {
        await api.markSupportRead(ticketId);
        setTickets((current) => current.map((item) => item.id === ticketId ? { ...item, customer_unread: false } : item));
        if (wasUnread) setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        show("تم فتح المحادثة، لكن تعذّر تحديث علامة القراءة.", "error");
      }
    } catch (error: any) {
      show(error?.message || "تعذّر فتح تذكرة الدعم.", "error");
    } finally {
      setLoadingTicket(false);
    }
  }, [show]);


  const loadTickets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, unread] = await Promise.all([api.supportTickets(), api.supportUnreadCount().catch(() => null)]);
      const nextTickets = normalizeTickets(data);
      setTickets(nextTickets);
      if (unread) setUnreadCount(Number(unread.count) || 0);
      if (initialTicketId) {
        const found = nextTickets.find((item) => item.id === initialTicketId);
        if (found) await openTicket(found.id, !!found.customer_unread);
      }
    } catch (error: any) {
      setLoadError(error?.message || "تعذّر تحميل طلبات الدعم.");
    } finally {
      setLoading(false);
    }
  }, [initialTicketId, openTicket]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const unread = await api.supportUnreadCount();
        setUnreadCount(Number(unread?.count) || 0);
      } catch {}
    }, 20000);
    return () => clearInterval(interval);
  }, []);

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
    const uploaded = await uploadImage(uri, Platform.OS === "web", "/api/support/upload");
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
      setSelected({ ...created, messages: normalizeMessages(created.messages) });
      setSupportView("tickets");
      setLoadError(null);
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
      setSelected((current) => {
        if (!current) return current;
        const previousMessages = normalizeMessages(current.messages);
        const messages = appendMessage(previousMessages, message);
        const added = messages.length > previousMessages.length;
        return { ...current, messages, ticket: { ...current.ticket, status: "open", message_count: Number(current.ticket.message_count || 0) + (added ? 1 : 0) } };
      });
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
          <View style={styles.headerTitleWrap}><T weight="displayBold" size={type.xl} color="#fff">مراسلة الدعم</T>{unreadCount > 0 ? <View style={styles.unreadCount}><T size={type.xs} weight="bold" color="#fff">{unreadCount > 99 ? "99+" : unreadCount} جديد</T></View> : null}</View>
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
              {normalizeMessages(selected.messages).map((item, index) => {
                const own = item.sender_role === "customer";
                return (
                  <View key={(item.id || "message") + ":" + index} style={[styles.messageRow, own ? styles.messageRowOwn : styles.messageRowManager]}>
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
          <View style={styles.homeContent}>
            {loadError ? <View testID="support-load-error" style={styles.loadErrorCard}><Feather name="alert-circle" size={18} color={colors.error} /><T color={colors.error} size={type.sm} style={{ flex: 1, textAlign: "right" }}>{loadError}</T><Pressable testID="support-retry" onPress={() => void loadTickets()}><T color={colors.brandPrimary} size={type.sm} weight="bold">إعادة المحاولة</T></Pressable></View> : null}
            <View style={styles.modeSwitch}>
              <Pressable testID="support-mode-tickets" onPress={() => setSupportView("tickets")} style={[styles.modeButton, supportView === "tickets" && styles.modeButtonActive]}>
                <Feather name="inbox" size={17} color={supportView === "tickets" ? colors.brandPrimary : colors.muted} />
                <T color={supportView === "tickets" ? colors.brandPrimary : colors.muted} size={type.sm} weight="semi">طلباتي</T>
                <View style={[styles.modeCount, supportView === "tickets" && styles.modeCountActive]}><T color={supportView === "tickets" ? colors.brandPrimary : colors.muted} size={type.xs} weight="bold">{tickets.length}</T></View>
              </Pressable>
              <Pressable testID="support-mode-new" onPress={() => setSupportView("new")} style={[styles.modeButton, supportView === "new" && styles.modeButtonActive]}>
                <Feather name="plus-circle" size={17} color={supportView === "new" ? colors.brandPrimary : colors.muted} />
                <T color={supportView === "new" ? colors.brandPrimary : colors.muted} size={type.sm} weight="semi">طلب جديد</T>
              </Pressable>
            </View>
            {supportView === "tickets" ? (
              tickets.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionTitleRow}><View><T weight="displayBold" size={type.lg}>طلبات الدعم</T><T color={colors.muted} size={type.sm} style={{ marginTop: 3 }}>تابع آخر مستجدات محادثاتك</T></View><View style={styles.ticketSummary}><Feather name="message-square" size={15} color={colors.brandPrimary} /><T color={colors.brandPrimary} size={type.xs} weight="bold">{tickets.length}</T></View></View>
                  <View style={styles.ticketCards}>
                    {tickets.map((item, index) => (
                      <Pressable key={(item.id || "ticket") + ":" + index} testID={"support-ticket-" + item.id} onPress={() => void openTicket(item.id, !!item.customer_unread)} style={({ pressed }) => [styles.ticketCard, pressed && styles.ticketCardPressed]}>
                        <View style={styles.ticketCardTop}>
                          <View style={styles.customerTicketIcon}><Feather name="message-circle" size={18} color={colors.brandPrimary} /></View>
                          <View style={styles.customerTicketBadges}>
                            <View style={[styles.ticketStatus, item.status === "open" ? styles.openStatus : item.status === "pending" ? styles.pendingStatus : styles.closedStatus]}><T color={item.status === "open" ? colors.success : item.status === "pending" ? colors.warning : colors.muted} size={type.xs} weight="bold">{STATUS_LABEL[item.status] || item.status}</T></View>
                            {item.customer_unread ? <View style={styles.unreadPill}><View style={styles.unreadDot} /><T size={type.xs} weight="bold" color={colors.error}>رد جديد</T></View> : null}
                          </View>
                        </View>
                        <T weight="bold" size={type.lg} style={styles.ticketSubject} numberOfLines={1}>{item.subject}</T>
                        {item.order_id ? <View style={styles.ticketOrder}><Feather name="package" size={14} color={colors.muted} /><T color={colors.muted} size={type.xs}>مرتبط بالطلب #{item.order_id}</T></View> : null}
                        <View style={styles.ticketFooter}><View style={styles.ticketMessageCount}><Feather name="message-square" size={14} color={colors.muted} /><T color={colors.muted} size={type.xs}>{item.message_count || 1} رسائل</T></View><View style={styles.openTicketButton}><Feather name="chevron-left" size={17} color={colors.brandPrimary} /></View></View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}><Feather name="message-circle" size={27} color={colors.brandPrimary} /></View>
                  <T weight="displayBold" size={type.lg}>لا توجد طلبات دعم بعد</T>
                  <T color={colors.muted} size={type.sm} style={styles.emptyText}>أرسل لنا مشكلتك وسيتابع فريق الدعم معك هنا.</T>
                  <Pressable testID="support-empty-new" onPress={() => setSupportView("new")} style={styles.emptyButton}><T color="#fff" weight="bold">إنشاء طلب دعم</T><Feather name="arrow-left" size={16} color="#fff" /></Pressable>
                </View>
              )
            ) : (
              <View>
                <View style={styles.formIntro}><View style={styles.formIntroIcon}><Feather name="headphones" size={20} color={colors.brandPrimary} /></View><View style={styles.formIntroText}><T weight="displayBold" size={type.lg}>أرسل رسالة للدعم</T><T color={colors.muted} size={type.sm} style={{ marginTop: 3 }}>صف المشكلة وسنساعدك في أقرب وقت.</T></View></View>
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
  headerTitleWrap: { flex: 1, alignItems: "center", gap: spacing.xs },
  unreadCount: { backgroundColor: colors.error, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 40 },
  headerHint: { textAlign: "center", marginTop: spacing.sm },
  content: { padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionHint: { marginTop: spacing.xs, lineHeight: 21 },
  loadErrorCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.errorSoft, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  ticketList: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  ticketItem: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  ticketItemText: { flex: 1 },
  unreadPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: radius.pill, backgroundColor: colors.errorSoft, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
  homeContent: { gap: spacing.md },
  modeSwitch: { flexDirection: "row-reverse", gap: spacing.xs, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: 4, marginBottom: spacing.sm },
  modeButton: { flex: 1, minHeight: 46, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.md, paddingHorizontal: spacing.sm },
  modeButtonActive: { backgroundColor: "#fff", shadowColor: "#1C4932", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2 },
  modeCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(117,117,117,0.12)", paddingHorizontal: 4 },
  modeCountActive: { backgroundColor: colors.brandTertiary },
  ticketSummary: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  ticketCards: { gap: spacing.md },
  ticketCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: spacing.lg, shadowColor: "#1C4932", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.055, shadowRadius: 10, elevation: 1 },
  ticketCardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  ticketCardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  customerTicketIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  customerTicketBadges: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  ticketStatus: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  openStatus: { backgroundColor: "rgba(46,125,50,0.12)" },
  pendingStatus: { backgroundColor: "rgba(230,145,56,0.14)" },
  closedStatus: { backgroundColor: "rgba(117,117,117,0.12)" },
  ticketSubject: { textAlign: "right", marginTop: spacing.md },
  ticketOrder: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  ticketFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  ticketMessageCount: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: radius.pill },
  openTicketButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  emptyCard: { alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing["2xl"], marginTop: spacing.sm },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { textAlign: "center", lineHeight: 21, marginTop: spacing.xs },
  emptyButton: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  formIntro: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  formIntroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  formIntroText: { flex: 1, alignItems: "flex-end" },
  formCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  orderLink: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  label: { textAlign: "right", marginBottom: spacing.sm, marginTop: spacing.sm },
  categoryRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  categoryChip: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  categoryChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface, backgroundColor: colors.surface, fontFamily: "System", fontSize: type.base },
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
