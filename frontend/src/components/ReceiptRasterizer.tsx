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
    function addTextAt(value, x, startY, align, maxWidth, size, bold, direction) {
      const lines = wrap(value, maxWidth, size, bold);
      let lineY = startY;
      for (const line of lines) {
        operations.push({
          kind: "text",
          value: line,
          x: x,
          y: lineY,
          align: align,
          maxWidth: maxWidth,
          size: size,
          bold: bold,
          direction: direction || "rtl",
        });
        lineY += Math.round(size * 1.48);
      }
      return lineY;
    }
    function text(value, x, align, maxWidth, size, bold) {
      y = addTextAt(value, x, y, align, maxWidth, size, bold);
    }
    function rule(solid) {
      y += 3;
      operations.push({ kind: "rule", y: y, solid: !!solid });
      y += 10;
    }
    function pair(label, value, bold) {
      operations.push({ kind: "text", value: label, x: width - padding, y: y, align: "right", maxWidth: width * 0.58, size: regularSize, bold: !!bold, direction: "rtl" });
      operations.push({ kind: "text", value: String(value == null ? "—" : value), x: padding, y: y, align: "left", maxWidth: width * 0.36, size: regularSize, bold: !!bold, direction: "ltr" });
      y += lineHeight;
    }
    function detailColumn(title, rows, x, startY, align, maxWidth) {
      let columnY = addTextAt(title, x, startY, align, maxWidth, boldSize, true);
      for (const row of rows) {
        columnY = addTextAt(row.value, x, columnY, align, maxWidth, regularSize, false, row.direction);
      }
      return columnY;
    }

    if (logo && logo.width && logo.height) {
      const logoWidth = Math.min(width * 0.32, request.width === 58 ? 125 : 185);
      const logoHeight = logoWidth * (logo.height / logo.width);
      operations.push({ kind: "image", image: logo, x: center - logoWidth / 2, y: y, width: logoWidth, height: logoHeight });
      y += logoHeight + 3;
    }
    text("بن سليم سوبرماركت", center, "center", width - padding * 2, boldSize + 2, true);
    text("كل ما تحتاجه .. في مكان واحد", center, "center", width - padding * 2, regularSize, false);
    const detailTop = y + 3;
    const contentWidth = width - padding * 2;
    if (request.width === 80) {
      const columnGap = 14;
      const columnWidth = (contentWidth - columnGap) / 2;
      const customerBottom = detailColumn(
        "بيانات الزبون",
        [
          { value: "الاسم: " + request.receipt.customerName },
          { value: "الجوال: " + request.receipt.phone },
          { value: "العنوان: " + request.receipt.address },
        ],
        width - padding,
        detailTop,
        "right",
        columnWidth,
      );
      const orderBottom = detailColumn(
        "بيانات الطلب",
        [
          { value: "رقم الطلب: #" + request.receipt.orderNumber },
          { value: "التاريخ: " + request.receipt.date },
          { value: "الوقت: " + request.receipt.time },
        ],
        padding,
        detailTop,
        "left",
        columnWidth,
      );
      operations.push({ kind: "vline", x: center, y: detailTop - 2, height: Math.max(customerBottom, orderBottom) - detailTop + 3 });
      y = Math.max(customerBottom, orderBottom) + 2;
    } else {
      y = detailColumn(
        "بيانات الزبون",
        [
          { value: "الاسم: " + request.receipt.customerName },
          { value: "الجوال: " + request.receipt.phone },
          { value: "العنوان: " + request.receipt.address },
        ],
        width - padding,
        detailTop,
        "right",
        contentWidth,
      );
      y = detailColumn(
        "بيانات الطلب",
        [
          { value: "رقم الطلب: #" + request.receipt.orderNumber },
          { value: "التاريخ: " + request.receipt.date },
          { value: "الوقت: " + request.receipt.time },
        ],
        width - padding,
        y + 2,
        "right",
        contentWidth,
      );
    }
    rule(true);

    const numberWidth = contentWidth * 0.08;
    const nameWidth = contentWidth * 0.38;
    const quantityWidth = contentWidth * 0.14;
    const priceWidth = contentWidth * 0.18;
    const totalWidth = contentWidth - numberWidth - nameWidth - quantityWidth - priceWidth;
    const rightEdge = width - padding;
    const numberX = rightEdge - numberWidth / 2;
    const nameX = rightEdge - numberWidth;
    const quantityX = nameX - nameWidth - quantityWidth / 2;
    const priceX = nameX - nameWidth - quantityWidth - priceWidth / 2;
    const totalX = padding + totalWidth / 2;
    const headerHeight = lineHeight + 5;
    operations.push({ kind: "rect", x: padding, y: y - 2, width: contentWidth, height: headerHeight, color: "#e9e9e9" });
    const columns = [
      { value: "م", x: numberX, align: "center", max: numberWidth },
      { value: "المنتج", x: nameX, align: "right", max: nameWidth },
      { value: "الكمية", x: quantityX, align: "center", max: quantityWidth },
      { value: "السعر", x: priceX, align: "center", max: priceWidth },
      { value: "الإجمالي", x: totalX, align: "center", max: totalWidth },
    ];
    for (const column of columns) {
      operations.push({ kind: "text", value: column.value, x: column.x, y: y, align: column.align, maxWidth: column.max, size: regularSize, bold: true, direction: "rtl" });
    }
    y += headerHeight + 3;
    operations.push({ kind: "rule", y: y, solid: true });
    y += 7;
    for (let itemIndex = 0; itemIndex < request.receipt.items.length; itemIndex++) {
      const item = request.receipt.items[itemIndex];
      const nameLines = wrap(item.name, nameWidth, regularSize, false).slice(0, 2);
      const rowY = y;
      operations.push({ kind: "text", value: String(itemIndex + 1), x: numberX, y: rowY, align: "center", maxWidth: numberWidth, size: regularSize, bold: false, direction: "ltr" });
      operations.push({ kind: "text", value: formatQuantity(item), x: quantityX, y: rowY, align: "center", maxWidth: quantityWidth, size: regularSize, bold: false, direction: "ltr" });
      operations.push({ kind: "text", value: formatNumber(item.price), x: priceX, y: rowY, align: "center", maxWidth: priceWidth, size: regularSize, bold: false, direction: "ltr" });
      operations.push({ kind: "text", value: formatNumber(item.lineTotal), x: totalX, y: rowY, align: "center", maxWidth: totalWidth, size: regularSize, bold: true, direction: "ltr" });
      for (const line of nameLines) {
        operations.push({ kind: "text", value: line, x: nameX, y: y, align: "right", maxWidth: nameWidth, size: regularSize, bold: false, direction: "rtl" });
        y += lineHeight;
      }
      y = Math.max(y, rowY + lineHeight) + 3;
      operations.push({ kind: "rule", y: y, solid: false });
      y += 7;
    }
    pair("المجموع الفرعي", formatNumber(request.receipt.subtotal));
    pair("الخصم", formatNumber(request.receipt.discount));
    if (request.receipt.delivery > 0) pair("التوصيل", formatNumber(request.receipt.delivery));
    y += 3;
    operations.push({ kind: "rule", y: y, solid: true });
    y += 7;
    const totalRowY = y;
    const totalRowHeight = lineHeight + 12;
    operations.push({ kind: "rect", x: padding, y: totalRowY - 3, width: contentWidth, height: totalRowHeight, color: "#e6e6e6" });
    operations.push({ kind: "text", value: "المجموع النهائي", x: rightEdge - 8, y: totalRowY + 2, align: "right", maxWidth: contentWidth * 0.58, size: boldSize, bold: true, direction: "rtl" });
    operations.push({ kind: "text", value: formatMoney(request.receipt.total), x: padding + 8, y: totalRowY + 2, align: "left", maxWidth: contentWidth * 0.38, size: boldSize, bold: true, direction: "ltr" });
    y += totalRowHeight + 8;

    const footerY = y + 4;
    const footerColumnWidth = contentWidth / 3;
    const barcodeWidth = footerColumnWidth - 10;
    const barcodeHeight = request.width === 58 ? 42 : 54;
    const qrSize = request.width === 58 ? 78 : 104;
    const barcodeX = width - padding - footerColumnWidth + 5;
    const barcodeCenter = barcodeX + barcodeWidth / 2;
    operations.push({ kind: "image", image: barcode, x: barcodeX, y: footerY + 4, width: barcodeWidth, height: barcodeHeight });
    let barcodeBottom = addTextAt(request.receipt.orderNumber, barcodeCenter, footerY + barcodeHeight + 7, "center", barcodeWidth, regularSize - 2, false, "ltr");
    const qrCenter = center;
    operations.push({ kind: "image", image: qr, x: qrCenter - qrSize / 2, y: footerY, width: qrSize, height: qrSize });
    const qrBottom = addTextAt("امسح الكود لمتابعة طلبك", qrCenter, footerY + qrSize + 3, "center", footerColumnWidth, regularSize - 4, false);
    const thanksCenter = padding + footerColumnWidth / 2;
    let thanksBottom = addTextAt("شكراً لتسوقكم من", thanksCenter, footerY + 2, "center", footerColumnWidth - 4, regularSize - 2, true);
    thanksBottom = addTextAt("بن سليم", thanksCenter, thanksBottom, "center", footerColumnWidth - 4, regularSize - 2, true);
    thanksBottom = addTextAt("♥", thanksCenter, thanksBottom - 2, "center", footerColumnWidth - 4, regularSize, true);
    thanksBottom = addTextAt("نتمنى لكم يوماً سعيداً", thanksCenter, thanksBottom, "center", footerColumnWidth - 4, regularSize - 3, false);
    y = Math.max(barcodeBottom, qrBottom, thanksBottom) + 10;

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
        ctx.setLineDash(operation.solid ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding, operation.y);
        ctx.lineTo(width - padding, operation.y);
        ctx.stroke();
        ctx.restore();
      } else if (operation.kind === "vline") {
        ctx.save();
        ctx.strokeStyle = "#777";
        ctx.beginPath();
        ctx.moveTo(operation.x, operation.y);
        ctx.lineTo(operation.x, operation.y + operation.height);
        ctx.stroke();
        ctx.restore();
      } else if (operation.kind === "rect") {
        ctx.fillStyle = operation.color;
        ctx.fillRect(operation.x, operation.y, operation.width, operation.height);
      } else if (operation.kind === "image") {
        ctx.drawImage(operation.image, operation.x, operation.y, operation.width, operation.height);
      } else {
        ctx.font = (operation.bold ? "700 " : "400 ") + operation.size + "px Cairo, sans-serif";
        ctx.textAlign = operation.align;
        ctx.direction = operation.direction || "rtl";
        ctx.fillText(operation.value, operation.x, operation.y, operation.maxWidth || width - padding * 2);
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
function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}
function formatQuantity(item) {
  const unit = String(item.unitLabel || "").trim();
  return unit && !["قطعة", "piece", "pieces", "pc"].includes(unit.toLowerCase())
    ? String(item.quantity) + " " + unit
    : String(item.quantity);
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