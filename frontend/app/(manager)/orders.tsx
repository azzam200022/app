import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, ActivityIndicator, Switch, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { CategoryChips } from "@/src/components/CategoryChips";
import { api, formatPrice, STATUS_LABEL } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { printOrder, selectPrinter } from "@/src/lib/receipt";
import { storage } from "@/src/utils/storage";

const FILTERS = ["all", "pending", "confirmed", "preparing", "out_for_delivery", "delivered"];
const FILTER_LABEL: Record<string, string> = { all: "الكل", ...STATUS_LABEL };

export default function ManagerOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [autoPrint, setAutoPrint] = useState(false);
  const [printPrefsReady, setPrintPrefsReady] = useState(false);
  const [printerUrl, setPrinterUrl] = useState<string | null>(null);
  const printedRef = useRef<Set<string>>(new Set());
  const autoRef = useRef(false);

  // load persisted print prefs
  useEffect(() => {
    (async () => {
      const on = await storage.getItem("autoprint_on", false);
      const purl = await storage.getItem("printer_url", "");
      const printed = await storage.getItem("printed_orders", [] as string[]);
      setAutoPrint(!!on);
      autoRef.current = !!on;
      if (purl) setPrinterUrl(purl as string);
      printedRef.current = new Set((printed as string[]) || []);
      setPrintPrefsReady(true);
    })();
  }, []);

  const persistPrinted = useCallback(async () => {
    await storage.setItem("printed_orders", Array.from(printedRef.current).slice(-200));
  }, []);

  const autoPrintNew = useCallback(async (list: any[]) => {
    if (!autoRef.current) return;
    const fresh = list.filter((o) => (o.status === "pending" || o.status === "confirmed") && !printedRef.current.has(o.id));
    for (const o of fresh) {
      try {
        await printOrder(o, printerUrl);
        printedRef.current.add(o.id);
      } catch { /* user cancelled or no printer */ }
    }
    if (fresh.length) persistPrinted();
  }, [printerUrl, persistPrinted]);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const data = await api.adminOrders(f);
      setOrders(data);
      const printData = autoRef.current && f !== "all" ? await api.adminOrders("all") : data;
      autoPrintNew(printData);
    } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); }
  }, [show, autoPrintNew]);

  useFocusEffect(useCallback(() => { if (printPrefsReady) load(filter); }, [load, filter, printPrefsReady]));

  // poll for new orders while auto-print is enabled
  useEffect(() => {
    if (!autoPrint) return;
    const iv = setInterval(async () => {
      try {
        const data = await api.adminOrders(filter);
        setOrders(data);
        const printData = filter !== "all" ? await api.adminOrders("all") : data;
        autoPrintNew(printData);
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [autoPrint, filter, autoPrintNew]);

  const toggleAuto = async (v: boolean) => {
    setAutoPrint(v);
    autoRef.current = v;
    await storage.setItem("autoprint_on", v);
    if (v) {
      // baseline current orders as already handled so we don't dump-print the backlog
      orders.forEach((o) => printedRef.current.add(o.id));
      persistPrinted();
      show("تم تفعيل الطباعة التلقائية للطلبات الجديدة", "info");
    } else {
      show("تم إيقاف الطباعة التلقائية", "info");
    }
  };

  const choosePrinter = async () => {
    const p = await selectPrinter();
    if (p?.url) {
      setPrinterUrl(p.url);
      await storage.setItem("printer_url", p.url);
      show("تم اختيار الطابعة الافتراضية");
    }
  };

  const doPrint = async (order: any) => {
    try {
      await printOrder(order, printerUrl);
      printedRef.current.add(order.id);
      persistPrinted();
    } catch { show("تعذّرت الطباعة", "error"); }
  };

  const setStatus = async (id: string, status: string) => {
    try { await api.adminSetStatus(id, status); show("تم تحديث الحالة"); load(filter); } catch (e: any) { show(e.message, "error"); }
  };

  const openAssign = async (order: any) => {
    setAssignFor(order);
    try { setAgents(await api.adminAgents()); } catch {}
  };

  const assign = async (agentId: string) => {
    try { await api.adminAssign(assignFor.id, agentId); show("تم تعيين المندوب"); setAssignFor(null); load(filter); } catch (e: any) { show(e.message, "error"); }
  };

  const nextAction = (o: any) => {
    if (o.status === "pending") return { label: "تأكيد الطلب", icon: "check", onPress: () => setStatus(o.id, "confirmed") };
    if (o.status === "confirmed") return { label: "بدء التجهيز", icon: "package", onPress: () => setStatus(o.id, "preparing") };
    if (o.status === "preparing") return { label: "تعيين مندوب توصيل", icon: "truck", onPress: () => openAssign(o) };
    if (o.status === "out_for_delivery") return { label: "تم التوصيل", icon: "check-circle", onPress: () => setStatus(o.id, "delivered") };
    return null;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <T weight="displayBold" size={type.xl} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>إدارة الطلبات</T>
        <View style={styles.autoRow}>
          <View style={styles.autoLeft}>
            <View style={styles.printIcon}><Feather name="printer" size={18} color={colors.brandPrimary} /></View>
            <View>
              <T weight="semi" size={type.sm}>طباعة تلقائية للطلبات الجديدة</T>
              <T color={colors.muted} size={11}>تُطبع فواتير الطلبات الواردة فور استلامها</T>
            </View>
          </View>
          <Switch
            testID="autoprint-toggle"
            value={autoPrint}
            onValueChange={toggleAuto}
            trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
            thumbColor="#fff"
          />
        </View>
        {Platform.OS === "ios" ? (
          <Pressable testID="choose-printer" onPress={choosePrinter} style={styles.printerBtn}>
            <Feather name="settings" size={14} color={colors.brandPrimary} />
            <T size={type.sm} weight="semi" color={colors.brandPrimary}>{printerUrl ? "تغيير الطابعة الافتراضية" : "اختيار طابعة افتراضية (طباعة صامتة)"}</T>
          </Pressable>
        ) : (
          <View style={styles.printerNote}>
            <Feather name="info" size={14} color={colors.muted} />
            <T size={type.sm} color={colors.muted}>على Android والويب ستظهر نافذة النظام لاختيار الطابعة عند الطباعة.</T>
          </View>
        )}
        <CategoryChips categories={FILTERS.map((f) => FILTER_LABEL[f])} selected={FILTER_LABEL[filter]} onSelect={(label) => { const f = FILTERS.find((x) => FILTER_LABEL[x] === label) || "all"; setFilter(f); }} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="clipboard" title="لا توجد طلبات" /></View>
      ) : (
        <FlatList data={orders} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const action = nextAction(item);
            return (
              <View style={styles.card} testID={`mo-${item.id}`}>
                <View style={styles.cardTop}>
                  <T weight="bold">#{item.id.replace("ORD", "")}</T>
                  <StatusPill status={item.status} />
                </View>
                <View style={styles.info}><Feather name="user" size={14} color={colors.muted} /><T size={type.sm}>{item.customer_name} • {item.phone}</T></View>
                <View style={styles.info}><Feather name="map-pin" size={14} color={colors.muted} /><T size={type.sm} color={colors.onSurfaceTertiary} numberOfLines={1} style={{ flex: 1 }}>{item.address}</T></View>
                {item.agent_name ? <View style={styles.info}><Feather name="truck" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>المندوب: {item.agent_name}</T></View> : ["pending", "confirmed", "preparing"].includes(item.status) ? <View style={styles.info}><Feather name="users" size={14} color={colors.muted} /><T size={type.sm} color={colors.muted}>متاح للمندوبين للاستلام</T></View> : null}
                <View style={styles.cardBottom}>
                  <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
                  <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(item.total)}</T>
                </View>
                <View style={styles.btnRow}>
                  <Pressable testID={`details-${item.id}`} onPress={() => router.push("/order/" + item.id)} style={styles.detailBtn}>
                    <Feather name="file-text" size={16} color={colors.brandPrimary} />
                    <T size={type.sm} weight="bold" color={colors.brandPrimary}>التفاصيل</T>
                  </Pressable>
                  <Pressable testID={`print-${item.id}`} onPress={() => doPrint(item)} style={styles.printBtn}>
                    <Feather name="printer" size={16} color={colors.brandPrimary} />
                    <T size={type.sm} weight="bold" color={colors.brandPrimary}>طباعة</T>
                  </Pressable>
                  {action && <Button title={action.label} icon={action.icon} onPress={action.onPress} testID={`action-${item.id}`} style={{ flex: 1, minHeight: 46 }} />}
                </View>
              </View>
            );
          }} />
      )}

      <Modal visible={!!assignFor} transparent animationType="slide" onRequestClose={() => setAssignFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setAssignFor(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <T weight="displayBold" size={type.lg} style={{ marginBottom: spacing.md }}>اختر مندوب التوصيل</T>
            {agents.length === 0 ? (
              <T color={colors.muted} style={{ textAlign: "center", padding: spacing.lg }}>لا يوجد مندوبون. عيّن مندوباً من صفحة المندوبين.</T>
            ) : agents.map((a) => (
              <Pressable key={a.user_id} testID={`agent-${a.user_id}`} onPress={() => assign(a.user_id)} style={styles.agentRow}>
                <View style={styles.agentAvatar}><Feather name="user" size={18} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}><T weight="semi">{a.name}</T><T color={colors.muted} size={type.sm}>{a.email}</T></View>
                <Feather name="chevron-left" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: "#fff", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  autoRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  autoLeft: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, flex: 1 },
  printIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  printerBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, alignSelf: "flex-end", marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  printerNote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: spacing.xs, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  btnRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  detailBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  printBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  info: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm },
  cardBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  agentRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  agentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
