import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/src/components/ui";
import { useToast } from "@/src/context/ToastContext";
import { api, formatPrice } from "@/src/lib/api";
import { colors, radius, spacing, type } from "@/src/lib/theme";

type Agent = {
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  today_delivered_count: number;
  today_invoice_total: number;
  today_earnings: number;
  all_time_delivered_count: number;
  all_time_invoice_total: number;
  all_time_earnings: number;
  today_cash_received: number;
  total_cash_received: number;
  cash_outstanding: number;
  active_orders: number;
  last_location?: { lat: number; lng: number; at?: string } | null;
  location_is_live: boolean;
};

type AgentOverview = {
  date: string;
  agents: Agent[];
  totals: {
    agents_count: number;
    active_agents: number;
    delivered_today: number;
    invoices_today: number;
    earnings_today: number;
    cash_received_today: number;
    cash_outstanding: number;
  };
};

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value?: string) {
  if (!value) return "غير متوفر";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
}

function normalizeAmount(value: string) {
  const westernDigits = value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  return Number(westernDigits.replace(/[٬,\s]/g, ""));
}

export default function AgentStatisticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [overview, setOverview] = useState<AgentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMode, setModalMode] = useState<"details" | "cash" | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [today, setToday] = useState(localDateKey);
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());

  const loadOverview = useCallback(async () => {
    const dateKey = localDateKey();
    setToday(dateKey);
    try {
      const data = await api.adminAgentOverview(dateKey, tzOffsetMinutes);
      setOverview(data);
    } catch (error: any) {
      show(error?.message || "تعذر تحميل إحصاءات المندوبين", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [show, tzOffsetMinutes]);

  const loadAgentDetail = useCallback(async (agentId: string) => {
    setDetailLoading(true);
    const dateKey = localDateKey();
    setToday(dateKey);
    try {
      const data = await api.adminAgentSummary(agentId, dateKey, tzOffsetMinutes);
      setDetail(data);
      if (data?.agent) setSelectedAgent(data.agent);
    } catch (error: any) {
      show(error?.message || "تعذر تحميل تفاصيل المندوب", "error");
    } finally {
      setDetailLoading(false);
    }
  }, [show, tzOffsetMinutes]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview]),
  );

  const openAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setDetail(null);
    setModalMode("details");
    loadAgentDetail(agent.user_id);
  };

  const refresh = () => {
    setRefreshing(true);
    loadOverview();
    if (selectedAgent && modalMode === "details") loadAgentDetail(selectedAgent.user_id);
  };

  const startCashReceipt = () => {
    if (!selectedAgent) return;
    setCashAmount(String(Math.max(0, selectedAgent.cash_outstanding || 0)));
    setModalMode("cash");
  };

  const submitCashReceipt = async () => {
    if (!selectedAgent) return;
    const amount = normalizeAmount(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      show("أدخل مبلغاً صحيحاً", "error");
      return;
    }
    if (amount > selectedAgent.cash_outstanding + 0.009) {
      show("المبلغ أكبر من الرصيد النقدي المستحق", "error");
      return;
    }
    setSubmitting(true);
    const settlementDate = localDateKey();
    setToday(settlementDate);
    try {
      await api.adminReceiveAgentCash(selectedAgent.user_id, {
        amount,
        settlement_date: settlementDate,
      });
      show("تم تسجيل استلام المبلغ", "success");
      setModalMode("details");
      await loadOverview();
      await loadAgentDetail(selectedAgent.user_id);
    } catch (error: any) {
      show(error?.message || "تعذر تسجيل الاستلام", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openLocation = async () => {
    const location = detail?.agent?.last_location || selectedAgent?.last_location;
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
      show("لا يوجد موقع صالح لعرضه", "error");
      return;
    }
    const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    try {
      await Linking.openURL(url);
    } catch {
      show("تعذر فتح تطبيق الخرائط", "error");
    }
  };

  const stats = overview?.totals;
  const displayAgent = detail?.agent || selectedAgent;
  const location = detail?.agent?.last_location || selectedAgent?.last_location;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: 112 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Feather name="bar-chart-2" size={21} color={colors.onBrandPrimary} />
          </View>
          <View style={styles.headerCopy}>
            <T weight="displayBold" size={type["2xl"]}>إحصاءات المندوبين</T>
            <T color={colors.muted} size={type.sm}>الفواتير والأجور والتحصيل ومواقع التوصيل</T>
          </View>
          <Pressable accessibilityRole="button" onPress={refresh} style={styles.refreshButton}>
            <Feather name="refresh-cw" size={17} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <View style={styles.dayLabel}>
          <Feather name="calendar" size={15} color={colors.onSurfaceSecondary} />
          <T color={colors.onSurfaceSecondary} size={type.sm}>ملخص اليوم · {today}</T>
        </View>

        {loading && !overview ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandPrimary} size="large" />
            <T color={colors.muted}>جارٍ تحميل البيانات...</T>
          </View>
        ) : (
          <>
            <View style={styles.summaryGrid}>
              <SummaryCard icon="file-text" label="فواتير اليوم" value={formatPrice(stats?.invoices_today || 0)} />
              <SummaryCard icon="dollar-sign" label="أجور اليوم" value={formatPrice(stats?.earnings_today || 0)} />
              <SummaryCard icon="check-circle" label="المستلم اليوم" value={formatPrice(stats?.cash_received_today || 0)} />
              <SummaryCard icon="alert-circle" label="نقد مستحق" value={formatPrice(stats?.cash_outstanding || 0)} emphasized />
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <T weight="displayBold" size={type.lg}>حسابات المندوبين</T>
                <T color={colors.muted} size={type.xs}>
                  {stats?.agents_count || 0} مندوب · {stats?.active_agents || 0} لديهم طلبات نشطة
                </T>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/(manager)/agents" as any)}
                style={styles.secondaryButton}
              >
                <Feather name="settings" size={14} color={colors.brandPrimary} />
                <T color={colors.brandPrimary} weight="semi" size={type.xs}>إدارة الحسابات</T>
              </Pressable>
            </View>

            {!overview?.agents?.length ? (
              <View style={styles.empty}>
                <Feather name="users" size={27} color={colors.muted} />
                <T weight="semi">لا يوجد مندوبون مسجلون</T>
                <T color={colors.muted} size={type.sm}>يمكنك إضافة مندوب من إدارة الحسابات.</T>
              </View>
            ) : overview.agents.map((agent) => (
              <Pressable
                key={agent.user_id}
                accessibilityRole="button"
                onPress={() => openAgent(agent)}
                style={styles.agentCard}
              >
                <View style={styles.agentTop}>
                  <View style={styles.chevron}>
                    <Feather name="chevron-left" size={18} color={colors.muted} />
                  </View>
                  <View style={styles.agentIdentity}>
                    <T weight="displayBold" size={type.lg} numberOfLines={1}>{agent.name}</T>
                    <T color={colors.muted} size={type.xs} numberOfLines={1}>{agent.phone || agent.email || "—"}</T>
                  </View>
                  <View style={[styles.locationBadge, agent.location_is_live ? styles.locationLive : null]}>
                    <View style={[styles.locationDot, agent.location_is_live ? styles.locationDotLive : null]} />
                    <T color={agent.location_is_live ? colors.success : colors.muted} size={type.xs}>
                      {agent.location_is_live ? "يتتبع الآن" : agent.last_location ? "آخر موقع" : "دون موقع"}
                    </T>
                  </View>
                </View>
                <View style={styles.agentMetrics}>
                  <AgentMetric label="فواتير اليوم" value={formatPrice(agent.today_invoice_total)} />
                  <AgentMetric label="أجر اليوم" value={formatPrice(agent.today_earnings)} />
                  <AgentMetric label="المستحق" value={formatPrice(agent.cash_outstanding)} highlight />
                </View>
                <View style={styles.agentFoot}>
                  <T color={colors.muted} size={type.xs}>
                    {agent.active_orders} طلب نشط · {agent.today_delivered_count} تم توصيله اليوم
                  </T>
                  <T color={colors.brandPrimary} weight="semi" size={type.xs}>التفاصيل والتحصيل</T>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={modalMode !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModalMode(modalMode === "cash" ? "details" : null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {modalMode === "details" ? (
              <>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setModalMode(null)} accessibilityRole="button" style={styles.modalClose}>
                    <Feather name="x" size={19} color={colors.onSurface} />
                  </Pressable>
                  <View style={styles.modalTitleCopy}>
                    <T weight="displayBold" size={type.xl}>{displayAgent?.name || "حساب المندوب"}</T>
                    <T color={colors.muted} size={type.xs}>{displayAgent?.phone || displayAgent?.email || ""}</T>
                  </View>
                  <View style={styles.modalAvatar}>
                    <Feather name="user" size={19} color={colors.brandPrimary} />
                  </View>
                </View>
                {detailLoading && !detail ? (
                  <View style={styles.detailLoading}><ActivityIndicator color={colors.brandPrimary} /></View>
                ) : (
                  <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                    <T weight="semi" size={type.base}>الحساب الكلي</T>
                    <View style={styles.detailGrid}>
                      <SummaryCard icon="file-text" label="إجمالي الفواتير" value={formatPrice(displayAgent?.all_time_invoice_total || 0)} />
                      <SummaryCard icon="dollar-sign" label="إجمالي الأجر" value={formatPrice(displayAgent?.all_time_earnings || 0)} />
                      <SummaryCard icon="check-circle" label="إجمالي المستلم" value={formatPrice(displayAgent?.total_cash_received || 0)} />
                      <SummaryCard icon="alert-circle" label="الرصيد المستحق" value={formatPrice(displayAgent?.cash_outstanding || 0)} emphasized />
                    </View>

                    <View style={styles.inlineSummary}>
                      <T color={colors.onSurfaceSecondary} size={type.sm}>اليوم: {displayAgent?.today_delivered_count || 0} فواتير</T>
                      <T color={colors.onSurfaceSecondary} size={type.sm}>الإجمالي: {displayAgent?.all_time_delivered_count || 0} فاتورة</T>
                      <T color={colors.onSurfaceSecondary} size={type.sm}>فواتير {formatPrice(displayAgent?.today_invoice_total || 0)}</T>
                      <T color={colors.onSurfaceSecondary} size={type.sm}>أجر {formatPrice(displayAgent?.today_earnings || 0)}</T>
                    </View>

                    <View style={styles.locationCard}>
                      <View style={styles.locationInfo}>
                        <View style={styles.locationTitle}>
                          <Feather name="map-pin" size={16} color={colors.brandPrimary} />
                          <T weight="semi">موقع المندوب</T>
                          <View style={[styles.locationDot, displayAgent?.location_is_live ? styles.locationDotLive : null]} />
                        </View>
                        {location ? (
                          <>
                            <T color={colors.onSurfaceSecondary} size={type.xs} selectable>
                              {Number(location.lat).toFixed(5)}, {Number(location.lng).toFixed(5)}
                            </T>
                            <T color={colors.muted} size={type.xs}>آخر تحديث: {formatDateTime(location.at)}</T>
                          </>
                        ) : (
                          <T color={colors.muted} size={type.xs}>سيظهر الموقع عند وجود طلب نشط ومشاركة المندوب لموقعه.</T>
                        )}
                      </View>
                      {location ? (
                        <Pressable onPress={openLocation} accessibilityRole="button" style={styles.mapButton}>
                          <Feather name="navigation" size={15} color={colors.onBrandPrimary} />
                          <T color={colors.onBrandPrimary} weight="semi" size={type.xs}>عرض الخريطة</T>
                        </Pressable>
                      ) : null}
                    </View>

                    <Pressable
                      disabled={!displayAgent || displayAgent.cash_outstanding <= 0}
                      onPress={startCashReceipt}
                      accessibilityRole="button"
                      style={[styles.receiveButton, (!displayAgent || displayAgent.cash_outstanding <= 0) && styles.disabledButton]}
                    >
                      <Feather name="download" size={17} color={colors.onBrandPrimary} />
                      <T color={colors.onBrandPrimary} weight="semi">تسجيل استلام أموال</T>
                    </Pressable>

                    <View style={styles.listHeading}>
                      <T weight="semi">سجل التحصيل</T>
                      <T color={colors.muted} size={type.xs}>آخر {detail?.receipts?.length || 0} عملية</T>
                    </View>
                    {detail?.receipts?.length ? detail.receipts.slice(0, 8).map((receipt: any) => (
                      <View key={receipt.id} style={styles.historyRow}>
                        <View style={styles.historyIcon}><Feather name="check" size={14} color={colors.success} /></View>
                        <View style={styles.historyCopy}>
                          <T weight="semi" size={type.sm}>{formatPrice(Number(receipt.amount || 0))}</T>
                          <T color={colors.muted} size={type.xs}>
                            {receipt.settlement_date || formatDateTime(receipt.received_at)} · استلمها {receipt.receiver_name || "الإدارة"}
                          </T>
                        </View>
                      </View>
                    )) : (
                      <View style={styles.emptyHistory}>
                        <T color={colors.muted} size={type.sm}>لا توجد عمليات تحصيل مسجلة بعد.</T>
                      </View>
                    )}
                  </ScrollView>
                )}
              </>
            ) : modalMode === "cash" ? (
              <View style={styles.cashContent}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setModalMode("details")} accessibilityRole="button" style={styles.modalClose}>
                    <Feather name="arrow-right" size={18} color={colors.onSurface} />
                  </Pressable>
                  <View style={styles.modalTitleCopy}>
                    <T weight="displayBold" size={type.xl}>تسجيل استلام نقدي</T>
                    <T color={colors.muted} size={type.xs}>{displayAgent?.name || ""}</T>
                  </View>
                  <View style={styles.modalAvatar}>
                    <Feather name="download" size={18} color={colors.brandPrimary} />
                  </View>
                </View>
                <View style={styles.cashBalance}>
                  <T color={colors.onSurfaceSecondary} size={type.sm}>الرصيد النقدي المستحق</T>
                  <T weight="displayBold" size={type["2xl"]} color={colors.brandPrimary}>
                    {formatPrice(displayAgent?.cash_outstanding || 0)}
                  </T>
                </View>
                <T weight="semi" size={type.sm}>المبلغ المستلم</T>
                <View style={styles.amountInputWrap}>
                  <TextInput
                    value={cashAmount}
                    onChangeText={setCashAmount}
                    keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={styles.amountInput}
                    textAlign="right"
                    accessibilityLabel="المبلغ المستلم من المندوب"
                  />
                  <T color={colors.muted} weight="semi" size={type.sm}>د.ع</T>
                </View>
                <T color={colors.muted} size={type.xs}>
                  ستُحفظ العملية مع اسم المدير ووقت الاستلام وتاريخ التسوية.
                </T>
                <Pressable
                  disabled={submitting || !displayAgent?.cash_outstanding}
                  onPress={submitCashReceipt}
                  accessibilityRole="button"
                  style={[styles.receiveButton, (submitting || !displayAgent?.cash_outstanding) && styles.disabledButton]}
                >
                  {submitting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Feather name="check" size={17} color={colors.onBrandPrimary} />}
                  <T color={colors.onBrandPrimary} weight="semi">{submitting ? "جارٍ الحفظ..." : "تأكيد استلام المبلغ"}</T>
                </Pressable>
                <Pressable onPress={() => setModalMode("details")} style={styles.cancelButton}>
                  <T color={colors.onSurfaceSecondary} weight="semi">إلغاء</T>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryCard({ icon, label, value, emphasized = false }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; emphasized?: boolean }) {
  return (
    <View style={[styles.summaryCard, emphasized && styles.summaryCardEmphasized]}>
      <Feather name={icon} size={15} color={emphasized ? colors.warning : colors.brandSecondary} />
      <T color={colors.muted} size={type.xs} numberOfLines={1}>{label}</T>
      <T weight="displayBold" size={type.sm} color={colors.onSurface} numberOfLines={1}>{value}</T>
    </View>
  );
}

function AgentMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.agentMetric}>
      <T color={colors.muted} size={type.xs}>{label}</T>
      <T weight="semi" size={type.xs} color={highlight ? colors.warning : colors.onSurface} numberOfLines={1}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  headerIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  refreshButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  dayLabel: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  loading: { minHeight: 210, alignItems: "center", justifyContent: "center", gap: spacing.md },
  summaryGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  summaryCard: { flexGrow: 1, flexBasis: "46%", minHeight: 88, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, alignItems: "flex-end", justifyContent: "center", gap: 4 },
  summaryCardEmphasized: { backgroundColor: "#FFF8EA", borderColor: "#E9D3A9" },
  sectionHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  secondaryButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 7, backgroundColor: "#fff" },
  empty: { minHeight: 150, backgroundColor: "#fff", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  agentCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  agentTop: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  chevron: { width: 28, alignItems: "center" },
  agentIdentity: { flex: 1, alignItems: "flex-end", gap: 2 },
  locationBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  locationLive: { backgroundColor: colors.brandTertiary },
  locationDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  locationDotLive: { backgroundColor: colors.success },
  agentMetrics: { flexDirection: "row-reverse", gap: spacing.xs },
  agentMetric: { flex: 1, minWidth: 0, alignItems: "flex-end", gap: 3, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: spacing.sm },
  agentFoot: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(14,26,22,0.42)" },
  modalSheet: { maxHeight: "92%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.md },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  modalTitleCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  modalAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  modalContent: { padding: spacing.lg, gap: spacing.md },
  detailLoading: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  detailGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  inlineSummary: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  locationCard: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  locationInfo: { flex: 1, alignItems: "flex-end", gap: 5 },
  locationTitle: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  mapButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  receiveButton: { minHeight: 48, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  disabledButton: { opacity: 0.48 },
  listHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  historyRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: spacing.sm },
  historyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  historyCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  emptyHistory: { alignItems: "center", backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg },
  cashContent: { padding: spacing.lg, gap: spacing.md },
  cashBalance: { alignItems: "center", gap: 5, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg },
  amountInputWrap: { minHeight: 54, flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md },
  amountInput: { flex: 1, color: colors.onSurface, fontSize: type.lg, paddingVertical: spacing.sm },
  cancelButton: { alignItems: "center", padding: spacing.sm },
});