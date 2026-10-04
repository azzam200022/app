import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import type { ReceiptRasterRequest } from "@/src/lib/receipt";

const WebViewComponent = WebView as unknown as React.ComponentType<any>;

export interface ReceiptRasterizerRef {
  rasterize(request: ReceiptRasterRequest): Promise<string>;
}

const RENDERER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;background:#fff}</style></head><body>
<script>
window.renderReceipt = async function(request) {
  try {
    const fontStyle = document.createElement("style");
    fontStyle.textContent =
      "@font-face{font-family:Cairo;src:url(data:font/ttf;base64," + request.regularFont + ") format('truetype');font-weight:400}" +
      "@font-face{font-family:Cairo;src:url(data:font/ttf;base64," + request.boldFont + ") format('truetype');font-weight:700}";
    document.head.appendChild(fontStyle);
    await document.fonts.ready;

    const width = request.width === 58 ? 384 : 576;
    const regularSize = request.width === 58 ? 14 : 17;
    const boldSize = request.width === 58 ? 15 : 19;
    const lineHeight = Math.round(regularSize * 1.55);
    const padding = request.width === 58 ? 12 : 16;
    const measureCanvas = document.createElement("canvas");
    const measure = measureCanvas.getContext("2d");
    if (!measure) throw new Error("Canvas غير متاح");

    function setMeasureFont(size, bold) {
      measure.font = (bold ? "700 " : "400 ") + size + "px Cairo, sans-serif";
      measure.direction = "rtl";
    }
    function wrap(text, maxWidth, size, bold) {
      setMeasureFont(size, bold);
      const words = String(text || "—").trim().split(/\\s+/);
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? line + " " + word : word;
        if (line && measure.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : ["—"];
    }

    const logo = await loadImage(request.logoSrc);
    const qr = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(request.qrSvg));
    const barcode = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(request.barcodeSvg));
    const operations = [];
    let y = 14;
    const center = width / 2;
    function text(value, x, align, maxWidth, size, bold) {
      const lines = wrap(value, maxWidth, size, bold);
      for (const line of lines) {
        operations.push({ kind: "text", value: line, x: x, y: y, align: align, size: size, bold: bold });
        y += Math.round(size * 1.48);
      }
    }
    function rule() {
      y += 3;
      operations.push({ kind: "rule", y: y });
      y += 10;
    }
    function pair(label, value) {
      setMeasureFont(regularSize, false);
      const lines = wrap(label + ":", width * 0.42, regularSize, false);
      operations.push({ kind: "text", value: lines[0], x: width - padding, y: y, align: "right", size: regularSize, bold: false });
      operations.push({ kind: "text", value: String(value || "—"), x: padding, y: y, align: "left", size: regularSize, bold: false });
      y += lineHeight;
    }

    if (logo && logo.width && logo.height) {
      const logoWidth = Math.min(width * 0.58, request.width === 58 ? 180 : 270);
      const logoHeight = logoWidth * (logo.height / logo.width);
      operations.push({ kind: "image", image: logo, x: center - logoWidth / 2, y: y, width: logoWidth, height: logoHeight });
      y += logoHeight + 3;
    }
    text("بن سليم سوبرماركت", center, "center", width - padding * 2, boldSize + 2, true);
    text("فاتورة شراء", center, "center", width - padding * 2, regularSize, false);
    rule();
    pair("رقم الطلب", "#" + request.receipt.id);
    pair("التاريخ والوقت", request.receipt.date);
    rule();
    text("بيانات الزبون", width - padding, "right", width - padding * 2, boldSize, true);
    text("الاسم: " + request.receipt.customerName, width - padding, "right", width - padding * 2, regularSize, false);
    text("الهاتف: " + request.receipt.phone, width - padding, "right", width - padding * 2, regularSize, false);
    text("العنوان: " + request.receipt.address, width - padding, "right", width - padding * 2, regularSize, false);
    rule();

    const nameWidth = width * 0.36;
    const columns = [
      { value: "المنتج", x: width - padding, align: "right", max: nameWidth },
      { value: "الكمية", x: width * 0.61, align: "center", max: width * 0.15 },
      { value: "السعر", x: width * 0.39, align: "center", max: width * 0.20 },
      { value: "الإجمالي", x: padding, align: "left", max: width * 0.20 },
    ];
    for (const column of columns) {
      operations.push({ kind: "text", value: column.value, x: column.x, y: y, align: column.align, size: regularSize, bold: true });
    }
    y += lineHeight + 3;
    rule();
    for (const item of request.receipt.items) {
      const nameLines = wrap(item.name, nameWidth, regularSize, false).slice(0, 2);
      operations.push({ kind: "text", value: String(item.quantity) + " " + item.unitLabel, x: width * 0.61, y: y, align: "center", size: regularSize, bold: false });
      operations.push({ kind: "text", value: formatMoney(item.price), x: width * 0.39, y: y, align: "center", size: regularSize, bold: false });
      operations.push({ kind: "text", value: formatMoney(item.lineTotal), x: padding, y: y, align: "left", size: regularSize, bold: true });
      for (const line of nameLines) {
        operations.push({ kind: "text", value: line, x: width - padding, y: y, align: "right", size: regularSize, bold: false });
        y += lineHeight;
      }
      y += 2;
      operations.push({ kind: "rule", y: y });
      y += 7;
    }
    pair("المجموع الفرعي", formatMoney(request.receipt.subtotal));
    pair("الخصم", formatMoney(request.receipt.discount));
    pair("التوصيل", formatMoney(request.receipt.delivery));
    pair("الضريبة", formatMoney(request.receipt.tax));
    y += 3;
    operations.push({ kind: "rule", y: y });
    y += 7;
    text("المجموع النهائي: " + formatMoney(request.receipt.total), center, "center", width - padding * 2, boldSize + 2, true);
    y += 3;

    const qrSize = request.width === 58 ? 112 : 148;
    operations.push({ kind: "image", image: qr, x: center - qrSize / 2, y: y, width: qrSize, height: qrSize });
    y += qrSize + 5;
    const barcodeWidth = width - padding * 2;
    const barcodeHeight = request.width === 58 ? 58 : 70;
    operations.push({ kind: "image", image: barcode, x: padding, y: y, width: barcodeWidth, height: barcodeHeight });
    y += barcodeHeight + 10;
    text("شكراً لتسوقكم من بن سليم", center, "center", width - padding * 2, boldSize, true);
    y += 12;

    const height = Math.max(1, Math.ceil(y));
    if (height > 40000) throw new Error("الفاتورة أطول من الحد المدعوم للطباعة.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("تعذّر تجهيز صورة الفاتورة.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";
    ctx.direction = "rtl";
    for (const operation of operations) {
      if (operation.kind === "rule") {
        ctx.save();
        ctx.strokeStyle = "#000";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding, operation.y);
        ctx.lineTo(width - padding, operation.y);
        ctx.stroke();
        ctx.restore();
      } else if (operation.kind === "image") {
        ctx.drawImage(operation.image, operation.x, operation.y, operation.width, operation.height);
      } else {
        ctx.font = (operation.bold ? "700 " : "400 ") + operation.size + "px Cairo, sans-serif";
        ctx.textAlign = operation.align;
        ctx.direction = "rtl";
        ctx.fillText(operation.value, operation.x, operation.y, width - padding * 2);
      }
    }

    const bytes = [27, 64];
    const rowBytes = width / 8;
    const bandHeight = 128;
    for (let top = 0; top < height; top += bandHeight) {
      const rows = Math.min(bandHeight, height - top);
      const pixels = ctx.getImageData(0, top, width, rows).data;
      bytes.push(29, 118, 48, 0, rowBytes & 255, rowBytes >> 8, rows & 255, rows >> 8);
      for (let row = 0; row < rows; row++) {
        for (let byte = 0; byte < rowBytes; byte++) {
          let packed = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pixel = (row * width + byte * 8 + bit) * 4;
            const luminance = pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114;
            if (pixels[pixel + 3] > 0 && luminance < 190) packed |= 1 << (7 - bit);
          }
          bytes.push(packed);
        }
      }
    }
    bytes.push(27, 100, 3);
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.slice(start, start + 0x8000));
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ id: request.id, base64: btoa(binary) }));
  } catch (error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      id: request.id,
      error: error && error.message ? error.message : String(error)
    }));
  }
};

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    const image = new Image();
    image.onload = function() { resolve(image); };
    image.onerror = function() { reject(new Error("تعذّر تحميل صورة من الفاتورة")); };
    image.src = src;
  });
}
function formatMoney(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US") + " د.ع";
}
</script></body></html>`;

type PendingRequest = {
  resolve: (base64: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export const ReceiptRasterizer = forwardRef<ReceiptRasterizerRef>(function ReceiptRasterizer(
  _props,
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const loadErrorRef = useRef<string | null>(null);
  const readyWaitersRef = useRef<Array<() => void>>([]);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const requestCounterRef = useRef(0);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let response: { id?: string; base64?: string; error?: string };
    try {
      response = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    const pending = response.id ? pendingRef.current.get(response.id) : undefined;
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRef.current.delete(response.id!);
    if (response.error) pending.reject(new Error(response.error));
    else if (response.base64) pending.resolve(response.base64);
    else pending.reject(new Error("لم يُنتج محرك الفاتورة بيانات للطباعة."));
  }, []);

  const onLoadEnd = useCallback(() => {
    readyRef.current = true;
    readyWaitersRef.current.splice(0).forEach((resolve) => resolve());
  }, []);

  const onError = useCallback((event: any) => {
    loadErrorRef.current = event?.nativeEvent?.description || "تعذّر تشغيل محرك الفاتورة.";
    readyWaitersRef.current.splice(0).forEach((resolve) => resolve());
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(loadErrorRef.current ?? "تعذّر تشغيل محرك الفاتورة."));
    }
    pendingRef.current.clear();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async rasterize(request) {
        if (!readyRef.current) {
          await new Promise<void>((resolve) => readyWaitersRef.current.push(resolve));
        }
        if (loadErrorRef.current) throw new Error(loadErrorRef.current);
        const webView = webViewRef.current;
        if (!webView) throw new Error("محرك الفاتورة غير جاهز.");
        const id = `receipt-${Date.now()}-${++requestCounterRef.current}`;
        const payload = JSON.stringify({ ...request, id }).replace(/</g, "\\u003c");
        return new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingRef.current.delete(id);
            reject(new Error("انتهت مهلة تجهيز الفاتورة."));
          }, 30000);
          pendingRef.current.set(id, { resolve, reject, timeout });
          webView.injectJavaScript(`window.renderReceipt(${payload}); true;`);
        });
      },
    }),
    [],
  );

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <WebViewComponent
        ref={webViewRef}
        source={{ html: RENDERER_HTML }}
        originWhitelist={["*"]}
        javaScriptEnabled
        onLoadEnd={onLoadEnd}
        onError={onError}
        onMessage={onMessage}
        style={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    left: -1000,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  webView: {
    width: 1,
    height: 1,
  },
});