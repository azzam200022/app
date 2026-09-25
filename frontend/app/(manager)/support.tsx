import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T } from "@/src/components/ui";
import { api, resolveImage } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";

type SupportTicket = { id: string; subject: string; category: string; status: string; user_name?: string; user_email?: string; order_id?: string | null; order_summary?: any; message_count?: number; updated_at?: string; };
type SupportMessage = { id: string; message: string; sender_role: "customer" | "manager"; sender_name?: string; attachment_url?: string | null; created_at?: string; };
type TicketDetails = { ticket: SupportTicket; messages: SupportMessage[] };

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
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    try {
      const data = await api.adminSupportTickets(nextFilter);
      setTickets(Array.isArray(data) ? data : []);
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [filter, show]);

  useFocusEffect(useCallback(() => { void load(filter); }, [filter, load]));

  const openTicket = async (ticketId: string) => {
    setLoadingTicket(true);
    try {
      setSelected(await api.adminSupportTicket(ticketId));
    } catch (error: any) {
      show(error.message, "error");
    } finally {
      setLoadingTicket(false);
    }
  };

  const sendReply = async () => {
    if (!selected?.ticket?.id || !reply.trim()) return;
    setSending(true);
    try {
      const message = await api.adminSendSupportMessage(selected.ticket.id, { message: reply.trim() });
      setSelected((current) => current ? { ...current, messages: [...current.messages, message], ticket: { ...current.ticket, status: "pending" } } : current);
      setReply("");
      show("تم إرسال الرد للزبون");
      await load(filter);
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
              {selected.messages.map((item) => {
                const fromCustomer = item.sender_role === "customer";
                return <View key={item.id} style={[styles.messageRow, fromCustomer ? styles.messageRowCustomer : styles.messageRowManager]}><View style={[styles.bubble, fromCustomer ? styles.bubbleCustomer : styles.bubbleManager]}>{<T color={fromCustomer ? colors.brandPrimary : colors.gold} weight="bold" size={type.xs} style={{ marginBottom: 4 }}>{fromCustomer ? (selected.ticket.user_name || "الزبون") : (item.sender_name || "أنت")}</T>}{item.message ? <T color={fromCustomer ? colors.onSurface : "#fff"} style={{ lineHeight: 22 }}>{item.message}</T> : null}{renderAttachment(item.attachment_url)}</View></View>;
              })}
            </View>
            <View style={styles.replyCard}><T weight="semi" style={styles.replyLabel}>الرد على الزبون</T><TextInput value={reply} onChangeText={setReply} placeholder="اكتب ردك هنا..." placeholderTextColor={colors.muted} multiline style={styles.replyInput} textAlign="right" /><Pressable testID="manager-support-send" onPress={() => void sendReply()} disabled={sending || !reply.trim()} style={[styles.sendButton, (sending || !reply.trim()) && styles.disabled]}><Feather name="send" size={17} color="#fff" /><T color="#fff" weight="bold">{sending ? "جارٍ الإرسال" : "إرسال الرد"}</T></Pressable></View>
          </View>}
        </ScrollView>
      ) : (
        <View style={styles.listRoot}>
          <ScrollView horizontal inverted showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><View style={styles.filterRow}>{FILTERS.map((item) => <Pressable key={item.value} testID={"support-filter-" + item.value} onPress={() => setFilter(item.value)} style={[styles.filterChip, filter === item.value && styles.filterChipActive]}><T color={filter === item.value ? "#fff" : colors.onSurface} size={type.sm} weight="semi">{item.label}</T></Pressable>)}</View></ScrollView>
          {loading ? <ActivityIndicator color={colors.brandPrimary} size="large" style={{ marginTop: spacing["2xl"] }} /> : tickets.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><Feather name="inbox" size={28} color={colors.brandPrimary} /></View><T weight="bold" size={type.lg}>لا توجد تذاكر</T><T color={colors.muted} style={{ textAlign: "center", marginTop: spacing.xs }}>ستظهر رسائل الزبائن هنا عند إرسالها.</T></View> : <FlatList data={tickets} keyExtractor={(item) => item.id} contentContainerStyle={[styles.ticketList, { paddingBottom: insets.bottom + spacing.xl }]} renderItem={({ item }) => <Pressable testID={"manager-ticket-" + item.id} onPress={() => void openTicket(item.id)} style={styles.ticketCard}><View style={styles.ticketCardTop}><View style={[styles.ticketStatus, item.status === "open" ? styles.openStatus : item.status === "pending" ? styles.pendingStatus : styles.closedStatus]}><T size={type.xs} weight="bold" color={item.status === "open" ? colors.success : item.status === "pending" ? colors.warning : colors.muted}>{STATUS_LABEL[item.status] || item.status}</T></View><T color={colors.muted} size={type.xs}>{CATEGORY_LABEL[item.category] || item.category}</T></View><T weight="bold" size={type.lg} style={styles.ticketSubject}>{item.subject}</T><View style={styles.ticketCustomer}><Feather name="user" size={14} color={colors.muted} /><T color={colors.muted} size={type.sm}>{item.user_name || "زبون"}</T>{item.order_id ? <><Feather name="package" size={14} color={colors.muted} /><T color={colors.muted} size={type.sm}>{item.order_id}</T></> : null}</View><View style={styles.ticketBottom}><T color={colors.muted} size={type.xs}>{item.message_count || 1} رسائل</T><Feather name="chevron-left" size={19} color={colors.muted} /></View></Pressable>} />}
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
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  filterRow: { flexDirection: "row-reverse", gap: spacing.sm },
  filterChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  ticketList: { paddingHorizontal: spacing.lg, gap: spacing.md },
  ticketCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  ticketCardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  ticketStatus: { borderRadius: 16, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  openStatus: { backgroundColor: "rgba(46,125,50,0.12)" },
  pendingStatus: { backgroundColor: "rgba(230,145,56,0.14)" },
  closedStatus: { backgroundColor: "rgba(117,117,117,0.12)" },
  ticketSubject: { textAlign: "right", marginTop: spacing.md },
  ticketCustomer: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  ticketBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
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
  replyInput: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surface, textAlignVertical: "top", fontSize: type.md },
  sendButton: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: spacing.md, marginTop: spacing.md },
  disabled: { opacity: 0.55 },
  empty: { alignItems: "center", padding: spacing["2xl"] },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
});
