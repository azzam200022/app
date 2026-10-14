import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { api, resolveImage } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

type SupportTicket = { id: string; subject: string; category: string; status: string; user_name?: string; user_email?: string; order_id?: string | null; order_summary?: any; message_count?: number; last_message_preview?: string; manager_unread?: boolean; updated_at?: string; };
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

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "open", label: "مفتوحة" },
  { value: "pending", label: "بانتظار الرد" },
  { value: "closed", label: "مغلقة" },
];
const STATUS_LABEL: Record<string, string> = { open: "مفتوحة", pending: "بانتظار الرد", closed: "مغلقة" };
const CATEGORY_LABEL: Record<string, string> = { order: "طلب", delivery: "توصيل", product: "منتج", other: "أخرى" };

export default function ManagerSupport() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [filter, setFilter] = useState("all");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<TicketDetails | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (nextFilter = filter, background = false) => {
    const requestId = ++requestSequence.current;
    if (!background) setLoading(true);
    setLoadError(null);
    try {
      const data = await api.adminSupportTickets(nextFilter);
      if (requestId === requestSequence.current) setTickets(normalizeTickets(data));
    } catch (error: any) {
      if (requestId === requestSequence.current) setLoadError(error?.message || "تعذّر تحميل تذاكر الدعم.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { void load(filter); }, [filter, load]));

  const openTicket = async (ticketId: string) => {
    setLoadingTicket(true);
    try {
      const details = await api.adminSupportTicket(ticketId);
      if (!details?.ticket) throw new Error("تعذّر العثور على تذكرة الدعم.");
      setSelected({ ...details, messages: normalizeMessages(details.messages) });
      try {
        await api.adminMarkSupportRead(ticketId);
        setTickets((current) => current.map((item) => item.id === ticketId ? { ...item, manager_unread: false } : item));
      } catch {
        show("تم فتح التذكرة، لكن تعذّر تحديث علامة القراءة.", "error");
      }
    } catch (error: any) {
      show(error?.message || "تعذّر فتح تذكرة الدعم.", "error");
    } finally {
      setLoadingTicket(false);
    }
  };

  const sendReply = async () => {
    if (!selected?.ticket?.id || !reply.trim()) return;
    setSending(true);
    try {
      const message = await api.adminSendSupportMessage(selected.ticket.id, { message: reply.trim() });
      setSelected((current) => {
        if (!current) return current;
        const previousMessages = normalizeMessages(current.messages);
        const messages = appendMessage(previousMessages, message);
        const added = messages.length > previousMessages.length;
        return { ...current, messages, ticket: { ...current.ticket, status: "pending", message_count: Number(current.ticket.message_count || 0) + (added ? 1 : 0) } };
      });
      setReply("");
      show("تم إرسال الرد للزبون");
      // Refreshing the list is best-effort; it must not make a sent reply look failed.
      void load(filter, true);
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selected?.ticket?.id || selected.ticket.status === status) return;
    try {
      const ticket = await api.adminSetSupportStatus(selected.ticket.id, status);
      setSelected((current) => current ? { ...current, ticket } : current);
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status: ticket.status } : item));
      show("تم تحديث حالة التذكرة");
    } catch (error: any) {
      show(error.message, "error");
    }
  };

  const renderAttachment = (url?: string | null) => url ? <Image source={{ uri: resolveImage(url) }} style={styles.messageImage} contentFit="cover" /> : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable testID="manager-support-back" onPress={() => selected ? setSelected(null) : router.back()} style={styles.backButton}>
            <Feather name="arrow-right" size={22} color="#fff" />
          </Pressable>
          <View style={styles.titleBlock}><T weight="displayBold" size={type.xl} color="#fff">دعم الزبائن</T><T color="rgba(255,255,255,0.75)" size={type.sm}>تابع الرسائل ورد على الاستفسارات</T></View>
          <View style={styles.headerIcon}><Feather name="headphones" size={22} color={colors.gold} /></View>
        </View>
      </View>

      {selected ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          {loadingTicket ? <ActivityIndicator color={colors.brandPrimary} size="large" style={{ marginTop: spacing["2xl"] }} /> : <View>
            <Pressable onPress={() => setSelected(null)} style={styles.backToList}><Feather name="chevron-right" size={18} color={colors.brandPrimary} /><T color={colors.brandPrimary} weight="semi">كل التذاكر</T></Pressable>
            <View style={styles.customerCard}>
              <View style={styles.customerAvatar}><Feather name="user" size={22} color={colors.brandPrimary} /></View>
              <View style={styles.customerInfo}><T weight="bold" size={type.lg}>{selected.ticket.user_name || "زبون"}</T><T color={colors.muted} size={type.sm}>{selected.ticket.user_email || "بدون بريد"}</T>{selected.ticket.order_id ? <T color={colors.brandPrimary} size={type.sm} weight="semi">الطلب: {selected.ticket.order_id}</T> : null}</View>
              <View style={styles.categoryPill}><T color={colors.brandPrimary} size={type.xs} weight="bold">{CATEGORY_LABEL[selected.ticket.category] || selected.ticket.category}</T></View>
            </View>
            <View style={styles.subjectCard}><T weight="displayBold" size={type.lg}>{selected.ticket.subject}</T><T color={colors.muted} size={type.sm} style={{ marginTop: 4 }}>{selected.ticket.message_count || selected.messages.length} رسائل</T></View>
            <View style={styles.statusRow}>{FILTERS.slice(1).map((item) => <Pressable key={item.value} testID={"support-status-" + item.value} onPress={() => void updateStatus(item.value)} style={[styles.statusButton, selected.ticket.status === item.value && styles.statusButtonActive]}><T color={selected.ticket.status === item.value ? "#fff" : colors.onSurface} size={type.sm} weight="semi">{item.label}</T></Pressable>)}</View>
            <View style={styles.messagesCard}>
              {normalizeMessages(selected.messages).map((item, index) => {
                const fromCustomer = item.sender_role === "customer";
                return <View key={(item.id || "message") + ":" + index} style={[styles.messageRow, fromCustomer ? styles.messageRowCustomer : styles.messageRowManager]}><View style={[styles.bubble, fromCustomer ? styles.bubbleCustomer : styles.bubbleManager]}>{<T color={fromCustomer ? colors.brandPrimary : colors.gold} weight="bold" size={type.xs} style={{ marginBottom: 4 }}>{fromCustomer ? (selected.ticket.user_name || "الزبون") : (item.sender_name || "أنت")}</T>}{item.message ? <T color={fromCustomer ? colors.onSurface : "#fff"} style={{ lineHeight: 22 }}>{item.message}</T> : null}{renderAttachment(item.attachment_url)}</View></View>;
              })}
            </View>
            <View style={styles.replyCard}><T weight="semi" style={styles.replyLabel}>الرد على الزبون</T><TextInput value={reply} onChangeText={setReply} placeholder="اكتب ردك هنا..." placeholderTextColor={colors.muted} multiline style={styles.replyInput} textAlign="right" /><Pressable testID="manager-support-send" onPress={() => void sendReply()} disabled={sending || !reply.trim()} style={[styles.sendButton, (sending || !reply.trim()) && styles.disabled]}><Feather name="send" size={17} color="#fff" /><T color="#fff" weight="bold">{sending ? "جارٍ الإرسال" : "إرسال الرد"}</T></Pressable></View>
          </View>}
        </ScrollView>
      ) : (
        <View style={styles.listRoot}>
          <View style={styles.listHeading}>
            <View style={styles.listHeadingText}>
              <T weight="displayBold" size={type.lg}>صندوق الدعم</T>
              <T color={colors.muted} size={type.sm}>تابع استفسارات الزبائن ورد عليها</T>
            </View>
            <View style={styles.ticketCountBadge}>
              <Feather name="inbox" size={17} color={colors.brandPrimary} />
              <T color={colors.brandPrimary} size={type.sm} weight="bold">{tickets.length}</T>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
            <View style={styles.filterRow}>
              {FILTERS.map((item) => (
                <Pressable key={item.value} testID={"support-filter-" + item.value} onPress={() => setFilter(item.value)} style={[styles.filterChip, filter === item.value && styles.filterChipActive]}>
                  <T color={filter === item.value ? colors.brandPrimary : colors.muted} size={type.sm} weight={filter === item.value ? "bold" : "semi"}>{item.label}</T>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {loadError ? <Pressable testID="manager-support-load-error" onPress={() => void load(filter)} style={styles.loadError}><Feather name="alert-circle" size={18} color={colors.error} /><T color={colors.error} size={type.sm} style={{ flex: 1, textAlign: "right" }}>{loadError}</T><T color={colors.brandPrimary} size={type.sm} weight="bold">إعادة المحاولة</T></Pressable> : null}
          {loading ? <View style={styles.loadingPanel}><ActivityIndicator color={colors.brandPrimary} size="large" /><T color={colors.muted} size={type.sm}>جارٍ تحميل التذاكر...</T></View> : tickets.length === 0 && !loadError ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Feather name="inbox" size={26} color={colors.brandPrimary} /></View>
              <T weight="bold" size={type.lg}>لا توجد تذاكر هنا</T>
              <T color={colors.muted} size={type.sm} style={styles.emptyText}>ستظهر طلبات الزبائن هنا عند إرسالها.</T>
            </View>
          ) : (
            <FlatList data={tickets} keyExtractor={(item, index) => (item.id || "ticket") + ":" + index} contentContainerStyle={[styles.ticketList, { paddingBottom: insets.bottom + spacing.xl }]} renderItem={({ item }) => (
              <Pressable testID={"manager-ticket-" + item.id} onPress={() => void openTicket(item.id)} style={({ pressed }) => [styles.ticketCard, pressed && styles.ticketCardPressed]}>
                <View style={styles.ticketCardTop}>
                  <View style={styles.categoryTag}><View style={styles.categoryIcon}><Feather name={item.category === "delivery" ? "truck" : item.category === "order" ? "package" : item.category === "product" ? "box" : "help-circle"} size={14} color={colors.brandPrimary} /></View><T color={colors.muted} size={type.xs} weight="semi">{CATEGORY_LABEL[item.category] || item.category}</T></View>
                  <View style={styles.ticketBadges}>
                    <View style={[styles.ticketStatus, item.status === "open" ? styles.openStatus : item.status === "pending" ? styles.pendingStatus : styles.closedStatus]}><T size={type.xs} weight="bold" color={item.status === "open" ? colors.success : item.status === "pending" ? colors.warning : colors.muted}>{STATUS_LABEL[item.status] || item.status}</T></View>
                    {item.manager_unread ? <View style={styles.unreadPill}><View style={styles.unreadDot} /><T size={type.xs} weight="bold" color={colors.error}>جديد</T></View> : null}
                  </View>
                </View>
                <T weight="bold" size={type.lg} style={styles.ticketSubject} numberOfLines={1}>{item.subject || "طلب دعم"}</T>
                <T color={colors.muted} size={type.sm} style={styles.ticketPreview} numberOfLines={2}>{item.last_message_preview || "لا توجد معاينة للرسالة"}</T>
                <View style={styles.ticketCustomer}>
                  <View style={styles.customerAvatarSmall}><Feather name="user" size={14} color={colors.brandPrimary} /></View>
                  <View style={styles.customerNameBlock}><T color={colors.onSurface} size={type.sm} weight="semi" numberOfLines={1}>{item.user_name || "زبون"}</T>{item.order_id ? <T color={colors.muted} size={type.xs} numberOfLines={1}>طلب #{item.order_id}</T> : null}</View>
                  <View style={styles.ticketMessages}><Feather name="message-circle" size={14} color={colors.muted} /><T color={colors.muted} size={type.xs}>{item.message_count || 1}</T></View>
                  <View style={styles.openTicketButton}><Feather name="chevron-left" size={17} color={colors.brandPrimary} /></View>
                </View>
              </Pressable>
            )} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md },
  titleBlock: { flex: 1, alignItems: "flex-end" },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(214,166,64,0.18)", alignItems: "center", justifyContent: "center" },
  listRoot: { flex: 1 },
  listHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  listHeadingText: { alignItems: "flex-end", gap: 3 },
  ticketCountBadge: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  filterScroll: { flexGrow: 0, flexShrink: 0, height: 58 },
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: "center", flexGrow: 0 },
  filterRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, padding: 4 },
  filterChip: { flexShrink: 0, alignSelf: "center", minHeight: 42, justifyContent: "center", borderWidth: 1, borderColor: "transparent", backgroundColor: "transparent", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  loadError: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.errorSoft },
  filterChipActive: { backgroundColor: "#fff", borderColor: colors.border, shadowColor: "#1C4932", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2 },
  ticketList: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  ticketCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: spacing.lg, shadowColor: "#1C4932", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.055, shadowRadius: 10, elevation: 1 },
  ticketCardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  ticketCardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  categoryTag: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  categoryIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  ticketBadges: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  ticketStatus: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  unreadPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: radius.pill, backgroundColor: colors.errorSoft, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error },
  openStatus: { backgroundColor: "rgba(46,125,50,0.12)" },
  pendingStatus: { backgroundColor: "rgba(230,145,56,0.14)" },
  closedStatus: { backgroundColor: "rgba(117,117,117,0.12)" },
  ticketSubject: { textAlign: "right", marginTop: spacing.md },
  ticketPreview: { textAlign: "right", lineHeight: 20, marginTop: spacing.xs },
  ticketCustomer: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  customerAvatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  customerNameBlock: { flex: 1, alignItems: "flex-end" },
  ticketMessages: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface },
  openTicketButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  loadingPanel: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["2xl"] },
  emptyCard: { alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: 24, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing["2xl"] },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyText: { textAlign: "center", marginTop: spacing.xs, lineHeight: 20 },
  content: { padding: spacing.lg },
  backToList: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", marginBottom: spacing.md },
  customerCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  customerAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  customerInfo: { flex: 1, alignItems: "flex-end", gap: 3 },
  categoryPill: { backgroundColor: colors.brandTertiary, borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  subjectCard: { marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, alignItems: "flex-end" },
  statusRow: { flexDirection: "row-reverse", gap: spacing.sm, marginVertical: spacing.md },
  statusButton: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", borderRadius: radius.sm, paddingVertical: spacing.sm },
  statusButtonActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  messagesCard: { gap: spacing.md },
  messageRow: { width: "100%", flexDirection: "row" },
  messageRowCustomer: { justifyContent: "flex-start" },
  messageRowManager: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", borderRadius: radius.md, padding: spacing.md },
  bubbleCustomer: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleManager: { backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  messageImage: { width: 210, height: 165, borderRadius: radius.sm, marginTop: spacing.sm },
  replyCard: { backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg },
  replyLabel: { textAlign: "right", marginBottom: spacing.sm },
  replyInput: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surface, textAlignVertical: "top", fontSize: type.base },
  sendButton: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: spacing.md, marginTop: spacing.md },
  disabled: { opacity: 0.55 },
  empty: { alignItems: "center", padding: spacing["2xl"] },
});
