import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Modal, ActivityIndicator, Switch, Platform, TextInput, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, type } from "@/src/lib/theme";
import { T, Button, EmptyState } from "@/src/components/ui";
import { StatusPill } from "../(customer)/orders";
import { CategoryChips } from "@/src/components/CategoryChips";
import { api, formatPrice, STATUS_LABEL } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { printOrder, selectPrinter, type ReceiptWidth } from "@/src/lib/receipt";
import { ReceiptRasterizer, type ReceiptRasterizerRef } from "@/src/components/ReceiptRasterizer";
import { storage } from "@/src/utils/storage";

const FILTERS = ["all", "pending", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered", "delivery_failed"];
const FILTER_LABEL: Record<string, string> = { all: "الكل", ...STATUS_LABEL };
const PAGE_SIZE = 30;
const MAX_PRINT_ATTEMPTS = 5;

type ReceiptPrintJob = {
  orderId: string;
  order: any;
  status: "queued" | "sending" | "failed";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

function normalizeOrdersResponse(result: any) {
  return {
    items: Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : []),
    pagination: result?.pagination || { page: 1, page_size: PAGE_SIZE, total: 0, has_more: false },
  };
}

export default function ManagerOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const [filter, setFilter] = useState("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: PAGE_SIZE, total: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [autoPrint, setAutoPrint] = useState(false);
  const [printPrefsReady, setPrintPrefsReady] = useState(false);
  const [printerUrl, setPrinterUrl] = useState<string | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<ReceiptWidth>(80);
  const [printQueue, setPrintQueue] = useState<ReceiptPrintJob[]>([]);
  const printedRef = useRef<Set<string>>(new Set());
  const autoRef = useRef(false);
  const queueRef = useRef<ReceiptPrintJob[]>([]);
  const printingRef = useRef(false);
  const rasterizerRef = useRef<ReceiptRasterizerRef>(null);

  useEffect(() => {
    (async () => {
      try {
        const [on, purl, printed, storedQueueRaw, storedWidth] = await Promise.all([
          storage.getItem("autoprint_on", false),
          storage.getItem("printer_url", ""),
          storage.getItem("printed_orders", [] as string[]),
          storage.getItem("receipt_print_queue", "[]"),
          storage.getItem("receipt_width", 80),
        ]);
        let storedQueue: any[] = [];
        if (typeof storedQueueRaw === "string") {
          const parsed = JSON.parse(storedQueueRaw);
          if (Array.isArray(parsed)) storedQueue = parsed;
        }
        const validQueue = storedQueue
          .filter((job: any) => job?.order && job?.orderId)
          .map((job: any) => ({
            ...job,
            orderId: String(job.orderId),
            status: job.status === "failed" || job.status === "sending"
              ? "failed" as const
              : "queued" as const,
            attempts: Number.isFinite(Number(job.attempts)) ? Number(job.attempts) : 0,
            nextAttemptAt: Number.isFinite(Number(job.nextAttemptAt)) ? Number(job.nextAttemptAt) : 0,
            lastError: job.status === "sending"
              ? "قد تكون أُرسلت قبل إغلاق التطبيق؛ تحقّق من الطابعة قبل إعادة الإرسال."
              : job.lastError,
          }));
        const enabled = !!on;
        setAutoPrint(enabled);
        autoRef.current = enabled;
        if (purl) setPrinterUrl(purl as string);
        printedRef.current = new Set(
          (Array.isArray(printed) ? printed : []).map((id: unknown) => String(id)),
        );
        queueRef.current = validQueue;
        setPrintQueue(validQueue);
        setReceiptWidth(Number(storedWidth) === 58 ? 58 : 80);
      } catch (error: any) {
        show(error?.message || "تعذّر تحميل إعدادات الطباعة", "error");
      } finally {
        setPrintPrefsReady(true);
      }
    })();
  }, [show]);

  const persistPrinted = useCallback(async () => {
    const ok = await storage.setItem("printed_orders", Array.from(printedRef.current).slice(-200));
    if (!ok) throw new Error("تعذّر حفظ سجل الطباعة.");
  }, []);

  const persistQueue = useCallback(async (next: ReceiptPrintJob[]) => {
    const ok = await storage.setItem("receipt_print_queue", JSON.stringify(next));
    if (!ok) throw new Error("تعذّر حفظ قائمة الطباعة.");
    queueRef.current = next;
    setPrintQueue(next);
  }, []);

  const sendReceipt = useCallback((order: any) => {
    return printOrder(order, printerUrl, {
      width: receiptWidth,
      rasterize: async (request) => {
        const rasterizer = rasterizerRef.current;
        if (!rasterizer) throw new Error("محرك صورة الفاتورة غير جاهز.");
        return rasterizer.rasterize(request);
      },
    });
  }, [printerUrl, receiptWidth]);

  const processPrintQueue = useCallback(async (force = false) => {
    if (printingRef.current || !printPrefsReady) return;
    if (!force && (!autoRef.current || Platform.OS === "web" || (Platform.OS === "ios" && !printerUrl))) return;
    printingRef.current = true;
    try {
      while (true) {
        const job = queueRef.current.find(
          (candidate) => candidate.status === "queued" && candidate.nextAttemptAt <= Date.now(),
        );
        if (!job) break;
        const sending: ReceiptPrintJob = {
          ...job,
          status: "sending",
          attempts: job.attempts + 1,
        };
        await persistQueue(queueRef.current.map((candidate) =>
          candidate.orderId === job.orderId ? sending : candidate,
        ));
        let submitted = false;
        try {
          printedRef.current.add(sending.orderId);
          await persistPrinted();
          const result = await sendReceipt(sending.order);
          submitted = true;
          await persistQueue(queueRef.current.filter((candidate) => candidate.orderId !== sending.orderId));
          if (result === "sent-to-rawbt") {
            show("أُرسلت الفاتورة إلى RawBT؛ تحقّق من خروج الورقة.", "info");
          }
        } catch (error: any) {
          if (submitted) {
            const needsReview: ReceiptPrintJob = {
              ...sending,
              status: "failed",
              nextAttemptAt: 0,
              lastError: "ربما أُرسلت الفاتورة، لكن تعذّر حفظ اكتمالها. تحقّق من الطابعة قبل الإعادة.",
            };
            const reviewQueue = queueRef.current.map((candidate) =>
              candidate.orderId === sending.orderId ? needsReview : candidate,
            );
            queueRef.current = reviewQueue;
            setPrintQueue(reviewQueue);
            show(needsReview.lastError!, "error");
            break;
          }
          const canRetry = sending.attempts < MAX_PRINT_ATTEMPTS;
          const retryDelay = Math.min(60000, 3000 * (2 ** (sending.attempts - 1)));
          const updated: ReceiptPrintJob = {
            ...sending,
            status: canRetry ? "queued" : "failed",
            nextAttemptAt: Date.now() + retryDelay,
            lastError: String(error?.message || "تعذّر إرسال الفاتورة").slice(0, 240),
          };
          await persistQueue(queueRef.current.map((candidate) =>
            candidate.orderId === sending.orderId ? updated : candidate,
          ));
          show(
            canRetry
              ? "تعذّرت الطباعة الآن؛ أُضيفت الفاتورة لقائمة إعادة المحاولة."
              : "تعذّرت الطباعة بعد عدة محاولات؛ أعد المحاولة من قائمة الطباعة.",
            "error",
          );
          break;
        }
      }
    } catch (error: any) {
      show(error?.message || "تعذّر تحديث قائمة الطباعة", "error");
    } finally {
      printingRef.current = false;
    }
  }, [persistPrinted, persistQueue, printPrefsReady, printerUrl, sendReceipt, show]);

  const autoPrintNew = useCallback(async (list: any[]) => {
    if (!autoRef.current || !printPrefsReady) return;
    const queuedIds = new Set(queueRef.current.map((job) => job.orderId));
    const fresh = list.filter((order) => {
      const id = String(order?.id ?? "");
      return order?.status === "confirmed" && id &&
        !printedRef.current.has(id) && !queuedIds.has(id);
    });
    if (fresh.length) {
      const next = [
        ...queueRef.current,
        ...fresh.map((order): ReceiptPrintJob => ({
          orderId: String(order.id),
          order,
          status: "queued",
          attempts: 0,
          nextAttemptAt: 0,
        })),
      ];
      try {
        await persistQueue(next);
      } catch (error: any) {
        show(error?.message || "تعذّر حفظ قائمة الطباعة", "error");
        return;
      }
    }
    await processPrintQueue();
  }, [persistQueue, printPrefsReady, processPrintQueue, show]);

  const load = useCallback(async (f: string, page = 1, append = false, searchTerm = search) => {
      setLoading(!append);
      try {
        const result = normalizeOrdersResponse(await api.adminOrders({ status: f, page, page_size: PAGE_SIZE, search: searchTerm }));
        setOrders((current) => append ? [...current, ...result.items] : result.items);
        setPagination(result.pagination);
        if (autoRef.current) {
          const confirmed = normalizeOrdersResponse(
            await api.adminOrders({ status: "confirmed", page: 1, page_size: 100 }),
          ).items;
          await autoPrintNew(confirmed);
        }
      } catch (e: any) { show(e.message, "error"); } finally { setLoading(false); }
    }, [show, autoPrintNew, search]);

    useFocusEffect(useCallback(() => { if (printPrefsReady) load(filter, 1, false, search); }, [load, filter, search, printPrefsReady]));

  // poll for new orders while auto-print is enabled
  useEffect(() => {
      if (!autoPrint || !printPrefsReady) return;
      const iv = setInterval(async () => {
        try {
          const result = normalizeOrdersResponse(await api.adminOrders({ status: filter, page: 1, page_size: PAGE_SIZE, search }));
          setOrders(result.items);
          setPagination(result.pagination);
          const printData = normalizeOrdersResponse(
            await api.adminOrders({ status: "confirmed", page: 1, page_size: 100 }),
          ).items;
          await autoPrintNew(printData);
        } catch {}
      }, 5000);
      return () => clearInterval(iv);
    }, [autoPrint, filter, search, autoPrintNew, printPrefsReady]);

  const toggleAuto = async (v: boolean) => {
    if (v) {
      if (Platform.OS === "web") {
        show("الطباعة التلقائية متاحة من تطبيق الهاتف فقط.", "error");
        return;
      }
      if (Platform.OS === "ios" && !printerUrl) {
        show("اختر طابعة AirPrint قبل تفعيل الطباعة التلقائية.", "error");
        return;
      }
      try {
        const currentConfirmed = normalizeOrdersResponse(
          await api.adminOrders({ status: "confirmed", page: 1, page_size: 100 }),
        ).items;
        currentConfirmed.forEach((order: any) => printedRef.current.add(String(order.id)));
        await persistPrinted();
      } catch (error: any) {
        show(error?.message || "تعذّر تجهيز الطباعة التلقائية", "error");
        return;
      }
      const saved = await storage.setItem("autoprint_on", true);
      if (!saved) {
        show("تعذّر حفظ إعداد الطباعة التلقائية.", "error");
        return;
      }
      autoRef.current = true;
      setAutoPrint(true);
      show("تم تفعيل الطباعة التلقائية للطلبات الجديدة", "info");
    } else {
      const saved = await storage.setItem("autoprint_on", false);
      if (!saved) {
        show("تعذّر حفظ إعداد الطباعة التلقائية.", "error");
        return;
      }
      autoRef.current = false;
      setAutoPrint(false);
      show("تم إيقاف الطباعة التلقائية", "info");
    }
  };

  const choosePrinter = async () => {
    if (Platform.OS === "android") {
      try {
        await Linking.openURL("rawbt:");
        show("اختر الطابعة واتصالها من إعدادات RawBT.", "info");
      } catch {
        show("ثبّت RawBT واختر الطابعة داخله، ثم أعد المحاولة.", "error");
      }
      return;
    }
    const printer = await selectPrinter();
    if (!printer?.url) {
      show("لم يتم اختيار طابعة AirPrint.", "info");
      return;
    }
    const saved = await storage.setItem("printer_url", printer.url);
    if (!saved) {
      show("تعذّر حفظ إعداد الطابعة.", "error");
      return;
    }
    setPrinterUrl(printer.url);
    show("تم اختيار طابعة AirPrint.", "info");
    await processPrintQueue();
  };

  const doPrint = async (order: any) => {
    if (printingRef.current) {
      show("هناك عملية طباعة جارية؛ انتظر حتى تنتهي.", "info");
      return;
    }
    const orderId = String(order?.id ?? "");
    if (!orderId) {
      show("لا يمكن طباعة طلب بلا رقم.", "error");
      return;
    }
    printingRef.current = true;
    let submitted = false;
    try {
      printedRef.current.add(orderId);
      await persistPrinted();
      const result = await sendReceipt(order);
      submitted = true;
      await persistQueue(queueRef.current.filter((job) => job.orderId !== orderId));
      show(
        result === "sent-to-rawbt"
          ? "أُرسلت نسخة الطباعة إلى RawBT؛ تحقّق من خروج الورقة."
          : "تم إرسال الفاتورة إلى نظام الطباعة.",
        "info",
      );
    } catch (error: any) {
      const existing = queueRef.current.find((job) => job.orderId === orderId);
      const retryJob: ReceiptPrintJob = {
        orderId,
        order,
        status: "failed",
        attempts: existing?.attempts ?? 0,
        nextAttemptAt: 0,
        lastError: submitted
          ? "ربما أُرسلت الفاتورة، لكن تعذّر حفظ اكتمالها. تحقّق من الطابعة قبل الإعادة."
          : String(error?.message || "تعذّرت الطباعة").slice(0, 240),
      };
      const next = existing
        ? queueRef.current.map((job) => job.orderId === orderId ? retryJob : job)
        : [...queueRef.current, retryJob];
      try {
        await persistQueue(next);
      } catch {
        queueRef.current = next;
        setPrintQueue(next);
      }
      show(
        submitted
          ? retryJob.lastError!
          : "تعذّرت الطباعة؛ أُضيف الطلب إلى قائمة إعادة المحاولة.",
        "error",
      );
    } finally {
      printingRef.current = false;
    }
  };

  const retryPrintQueue = async () => {
    const reset = queueRef.current.map((job) => ({
      ...job,
      status: "queued" as const,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: undefined,
    }));
    try {
      await persistQueue(reset);
      await processPrintQueue(true);
    } catch (error: any) {
      show(error?.message || "تعذّرت إعادة المحاولة", "error");
    }
  };

  const setWidth = async (width: ReceiptWidth) => {
    const saved = await storage.setItem("receipt_width", width);
    if (!saved) {
      show("تعذّر حفظ عرض الورق.", "error");
      return;
    }
    setReceiptWidth(width);
  };

  const testPrint = async () => {
    if (printingRef.current) {
      show("هناك عملية طباعة جارية؛ انتظر حتى تنتهي.", "info");
      return;
    }
    const testOrder = {
      id: `TEST-${Date.now()}`,
      status: "confirmed",
      created_at: new Date().toISOString(),
      customer_name: "اختبار الطابعة",
      phone: "0000000000",
      address: "اختبار فقط",
      items: [{ name: "إيصال تجريبي", quantity: 1, unit_label: "قطعة", price: 1000, line_total: 1000 }],
      subtotal: 1000,
      discount_amount: 0,
      delivery_fee: 0,
      tax_amount: 0,
      total: 1000,
    };
    printingRef.current = true;
    try {
      const result = await sendReceipt(testOrder);
      show(
        result === "sent-to-rawbt"
          ? "أُرسلت فاتورة الاختبار إلى RawBT؛ تحقّق من الطابعة."
          : "أُرسلت فاتورة الاختبار إلى نظام الطباعة.",
        "info",
      );
    } catch (error: any) {
      show(error?.message || "تعذّر إرسال فاتورة الاختبار", "error");
    } finally {
      printingRef.current = false;
    }
  };

  const setStatus = async (id: string, status: string) => {
    try { await api.adminSetStatus(id, status); show("تم تحديث الحالة"); load(filter, 1, false, search); } catch (e: any) { show(e.message, "error"); }
  };

  const openAssign = async (order: any) => {
    setAssignFor(order);
    try { setAgents(await api.adminAgents()); } catch {}
  };

  const assign = async (agentId: string) => {
    try { await api.adminAssign(assignFor.id, agentId); show("تم تعيين المندوب"); setAssignFor(null); load(filter, 1, false, search); } catch (e: any) { show(e.message, "error"); }
  };

  const submitSearch = () => {
      const nextSearch = searchDraft.trim();
      setSearch(nextSearch);
      load(filter, 1, false, nextSearch);
    };

    const clearSearch = () => {
      setSearchDraft("");
      setSearch("");
      load(filter, 1, false, "");
    };

    const loadMore = () => {
      if (!loading && pagination.has_more) load(filter, pagination.page + 1, true, search);
    };

    const nextAction = (o: any) => {
    if (o.status === "pending") return { label: "تأكيد الطلب", icon: "check", onPress: () => setStatus(o.id, "confirmed") };
    if (o.status === "confirmed") return { label: "بدء التجهيز", icon: "package", onPress: () => setStatus(o.id, "preparing") };
    if (o.status === "preparing") return { label: "تم تجهيز الطلب", icon: "check-circle", onPress: () => setStatus(o.id, "ready_for_delivery") };
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
              <T color={colors.muted} size={11}>تُرسل الفاتورة بعد تأكيد الطلب، وليس عند استلامه</T>
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
            <T size={type.sm} weight="semi" color={colors.brandPrimary}>{printerUrl ? "تغيير طابعة AirPrint" : "اختيار طابعة AirPrint"}</T>
          </Pressable>
        ) : Platform.OS === "android" ? (
          <Pressable testID="choose-printer" onPress={choosePrinter} style={styles.printerBtn}>
            <Feather name="settings" size={14} color={colors.brandPrimary} />
            <T size={type.sm} weight="semi" color={colors.brandPrimary}>إعداد الطابعة في RawBT</T>
          </Pressable>
        ) : (
          <View style={styles.printerNote}>
            <Feather name="info" size={14} color={colors.muted} />
            <T size={type.sm} color={colors.muted}>الطباعة اليدوية متاحة من نافذة الطباعة في الجهاز.</T>
          </View>
        )}
        <View style={styles.printTools}>
          <View style={styles.widthRow}>
            <T size={type.sm} weight="semi">عرض الورق</T>
            {[58, 80].map((width) => (
              <Pressable
                key={width}
                testID={`receipt-width-${width}`}
                onPress={() => setWidth(width as ReceiptWidth)}
                style={[styles.widthButton, receiptWidth === width && styles.widthButtonSelected]}
              >
                <T
                  size={type.sm}
                  weight="bold"
                  color={receiptWidth === width ? colors.surface : colors.brandPrimary}
                >
                  {width} مم
                </T>
              </Pressable>
            ))}
          </View>
          <Pressable testID="test-receipt-print" onPress={testPrint} style={styles.testPrintButton}>
            <Feather name="printer" size={14} color={colors.brandPrimary} />
            <T size={type.sm} weight="semi" color={colors.brandPrimary}>اختبار الطباعة</T>
          </Pressable>
        </View>
        {printQueue.length > 0 ? (
          <View style={styles.queueRow}>
            <T size={type.sm} color={colors.muted}>
              قائمة الطباعة: {printQueue.length} {printQueue.some((job) => job.status === "failed") ? "، منها فواتير تحتاج إعادة المحاولة" : ""}
            </T>
            {printQueue.some((job) => job.status === "failed") ? (
              <Pressable testID="retry-receipt-queue" onPress={retryPrintQueue} style={styles.retryButton}>
                <Feather name="rotate-cw" size={14} color={colors.brandPrimary} />
                <T size={type.sm} weight="semi" color={colors.brandPrimary}>إعادة المحاولة</T>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.searchRow}>
            <Feather name="search" size={18} color={colors.muted} />
            <TextInput
              testID="orders-search"
              value={searchDraft}
              onChangeText={setSearchDraft}
              onSubmitEditing={submitSearch}
              placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              textAlign="right"
            />
            {searchDraft ? <Pressable testID="clear-orders-search" onPress={clearSearch}><Feather name="x-circle" size={18} color={colors.muted} /></Pressable> : null}
          </View>
                  <CategoryChips categories={FILTERS.map((f) => FILTER_LABEL[f])} selected={FILTER_LABEL[filter]} onSelect={(label) => { const f = FILTERS.find((x) => FILTER_LABEL[x] === label) || "all"; setFilter(f); }} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View> : orders.length === 0 ? (
        <View style={styles.center}><EmptyState icon="clipboard" title="لا توجد طلبات" /></View>
      ) : (
        <FlatList data={orders} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} onEndReached={loadMore} onEndReachedThreshold={0.5} ListHeaderComponent={<T color={colors.muted} size={type.sm} style={styles.resultsSummary}>عرض {orders.length} من {pagination.total} طلب</T>} ListFooterComponent={pagination.has_more ? <View style={styles.loadMoreFooter}><ActivityIndicator color={colors.brandPrimary} /></View> : null}
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
                {item.agent_name ? <View style={styles.info}><Feather name="truck" size={14} color={colors.brandPrimary} /><T size={type.sm} weight="semi" color={colors.brandPrimary}>المندوب: {item.agent_name}</T></View> : item.status === "ready_for_delivery" ? <View style={styles.info}><Feather name="users" size={14} color={colors.brandPrimary} /><T size={type.sm} color={colors.brandPrimary}>بانتظار استلام مندوب</T></View> : null}
                {item.status === "delivery_failed" && item.delivery_failed_reason ? <View style={styles.info}><Feather name="alert-triangle" size={14} color={colors.error} /><T size={type.sm} weight="semi" color={colors.error}>سبب التعذر: {item.delivery_failed_reason}</T></View> : null}
                <View style={styles.cardBottom}>
                  <T color={colors.muted} size={type.sm}>{item.items.length} منتج</T>
                  <T weight="displayBold" color={colors.brandPrimary}>{formatPrice(item.total)}</T>
                </View>
                <View style={styles.btnRow}>
                  <Pressable testID={`details-${item.id}`} onPress={() => router.push(("/order/" + item.id) as any)} style={styles.detailBtn}>
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
      {Platform.OS === "android" ? <ReceiptRasterizer ref={rasterizerRef} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: "#fff", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
    searchInput: { flex: 1, minHeight: 44, color: colors.onSurface, fontFamily: "Tajawal-Regular" },
    resultsSummary: { textAlign: "right", marginBottom: spacing.xs },
    loadMoreFooter: { paddingVertical: spacing.lg },
      autoRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  autoLeft: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.md, flex: 1 },
  printIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  printerBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, alignSelf: "flex-end", marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  printerNote: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: spacing.xs, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  printTools: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  widthRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs },
  widthButton: { minWidth: 48, alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  widthButtonSelected: { backgroundColor: colors.brandPrimary },
  testPrintButton: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: 7, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
  queueRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  retryButton: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.xs, paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "#fff" },
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
