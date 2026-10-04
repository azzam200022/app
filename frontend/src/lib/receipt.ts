import * as Print from "expo-print";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode-generator";
import { Linking, Platform } from "react-native";

export type ReceiptWidth = 58 | 80;

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitLabel: string;
  price: number;
  lineTotal: number;
}

export interface ReceiptData {
  id: string;
  orderNumber: string;
  date: string;
  time: string;
  customerName: string;
  phone: string;
  address: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  delivery: number;
  tax: number;
  taxRatePercent: number | null;
  total: number;
}

export interface ReceiptRasterRequest {
  id: string;
  width: ReceiptWidth;
  receipt: ReceiptData;
  logoSrc: string;
  regularFont: string;
  boldFont: string;
  qrSvg: string;
  barcodeSvg: string;
}

export interface ReceiptPrintOptions {
  width?: ReceiptWidth;
  rasterize?: (request: ReceiptRasterRequest) => Promise<string>;
}

export interface ReceiptAssets {
  logoSrc: string;
  regularFont: string;
  boldFont: string;
}

let assetsPromise: Promise<ReceiptAssets> | null = null;

async function readAssetBase64(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error("تعذّر تحميل أحد أصول الفاتورة.");
  return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
}

export function getReceiptAssets(): Promise<ReceiptAssets> {
  if (!assetsPromise) {
    if (Platform.OS === "web") {
      const logoAsset = Asset.fromModule(require("../../assets/images/logo-binsaleem.png"));
      assetsPromise = logoAsset
        .downloadAsync()
        .then(() => {
          const logoSrc = logoAsset.localUri || logoAsset.uri;
          if (!logoSrc) throw new Error("تعذّر تحميل شعار الفاتورة.");
          return { logoSrc, regularFont: "", boldFont: "" };
        })
        .catch((error) => {
          assetsPromise = null;
          throw error;
        });
    } else {
      assetsPromise = Promise.all([
        readAssetBase64(require("../../assets/images/logo-binsaleem.png")),
        readAssetBase64(require("../../assets/fonts/Cairo-Regular.ttf")),
        readAssetBase64(require("../../assets/fonts/Cairo-Bold.ttf")),
      ])
        .then(([logo, regularFont, boldFont]) => ({
          logoSrc: `data:image/png;base64,${logo}`,
          regularFont,
          boldFont,
        }))
        .catch((error) => {
          assetsPromise = null;
          throw error;
        });
    }
  }
  return assetsPromise;
}

function numberOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function formatReceiptMoney(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} د.ع`;
}

export function formatReceiptNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatReceiptQuantity(item: ReceiptItem): string {
  const unit = item.unitLabel.trim();
  return unit && !["قطعة", "piece", "pieces", "pc"].includes(unit.toLowerCase())
    ? `${item.quantity} ${unit}`
    : String(item.quantity);
}

export function formatReceiptTaxLabel(receipt: Pick<ReceiptData, "taxRatePercent">): string {
  return receipt.taxRatePercent && receipt.taxRatePercent > 0
    ? `قيمة الضريبة (${formatReceiptNumber(receipt.taxRatePercent)}%)`
    : "قيمة الضريبة";
}

function formatDateParts(value: unknown): { date: string; time: string } {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  const dateLabel = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const hour = date.getHours();
  const timeLabel = `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`;
  return { date: dateLabel, time: timeLabel };
}

export function normalizeReceiptOrder(order: any): ReceiptData {
  const items: ReceiptItem[] = (Array.isArray(order?.items) ? order.items : []).map((item: any) => {
    const quantity = numberOr(item?.quantity, 0);
    const price = numberOr(item?.price, 0);
    return {
      name: String(item?.name || item?.product_name || "منتج"),
      quantity,
      unitLabel: String(item?.unit_label || item?.unit || "قطعة"),
      price,
      lineTotal: numberOr(item?.line_total, price * quantity),
    };
  });
  const calculatedSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const subtotal = numberOr(order?.subtotal, calculatedSubtotal);
  const discount = numberOr(order?.discount_amount ?? order?.discount ?? order?.coupon_discount, 0);
  const delivery = numberOr(order?.delivery_fee ?? order?.delivery_charge, 0);
  const tax = numberOr(order?.tax_amount ?? order?.tax, 0);
  const taxRatePercent = order?.tax_rate_percent == null
    ? null
    : numberOr(order.tax_rate_percent, 0);
  const id = String(order?.id ?? order?.order_id ?? "—");
  const dateParts = formatDateParts(order?.created_at ?? order?.createdAt ?? order?.date);

  return {
    id,
    orderNumber: id.replace(/^ORD/i, ""),
    date: dateParts.date,
    time: dateParts.time,
    customerName: String(order?.customer_name ?? order?.name ?? "—"),
    phone: String(order?.phone ?? order?.phone_number ?? "—"),
    address: String(order?.address ?? "—"),
    items,
    subtotal,
    discount,
    delivery,
    tax,
    taxRatePercent,
    total: numberOr(order?.total, subtotal - discount + delivery + tax),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function makeReceiptQrSvg(value: string): string {
  const qr = QRCode(0, "M");
  qr.addData(value || "order");
  qr.make();
  return qr.createSvgTag(4, 2);
}

export function makeReceiptBarcodeSvg(value: string): string {
  const safeValue = value.replace(/[^\x20-\x7E]/g, "").slice(0, 64) || "ORDER";
  const barcodeLibrary = JsBarcode as unknown as { getModule: (name: string) => unknown };
  const Code128 = barcodeLibrary.getModule("CODE128") as new (
    data: string,
    options: Record<string, unknown>,
  ) => { encode: () => { data: string } };
  const bits = new Code128(safeValue, {}).encode().data;
  const quiet = 12;
  const viewWidth = bits.length + quiet * 2;
  const bars = Array.from(bits)
    .map((bit, index) =>
      bit === "1" ? `<rect x="${quiet + index}" y="0" width="1" height="48"/>` : "",
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} 68" role="img">
    <rect width="${viewWidth}" height="68" fill="#fff"/>
    <g fill="#000">${bars}</g>
    <text x="${viewWidth / 2}" y="64" text-anchor="middle" font-family="Arial,sans-serif" font-size="10">${escapeHtml(safeValue)}</text>
  </svg>`;
}

export function buildReceiptHTML(
  order: any,
  options: { width?: ReceiptWidth; logoSrc?: string; regularFont?: string; boldFont?: string } = {},
): string {
  const receipt = normalizeReceiptOrder(order);
  const width = options.width ?? 80;
  const qr = svgDataUri(makeReceiptQrSvg(receipt.id));
  const barcode = svgDataUri(makeReceiptBarcodeSvg(receipt.orderNumber));
  const rows = receipt.items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td class="r">${escapeHtml(item.name)}</td>
        <td class="c">${escapeHtml(formatReceiptQuantity(item))}</td>
        <td class="c">${formatReceiptNumber(item.price)}</td>
        <td class="c b">${formatReceiptNumber(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");
  const summaryRow = (label: string, value: number) =>
    `<div class="summary"><span>${label}</span><span>${formatReceiptNumber(value)}</span></div>`;
  const fontFace = options.regularFont && options.boldFont
    ? `@font-face{font-family:Cairo;src:url(data:font/ttf;base64,${options.regularFont}) format('truetype');font-weight:400}
       @font-face{font-family:Cairo;src:url(data:font/ttf;base64,${options.boldFont}) format('truetype');font-weight:700}`
    : "";
  const deliveryRow = receipt.delivery > 0 ? summaryRow("التوصيل", receipt.delivery) : "";

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${fontFace}
    * { font-family: Cairo, Tahoma, Arial, sans-serif; box-sizing: border-box; }
    @page { size: ${width}mm auto; margin: 0; }
    body { width: ${width}mm; margin: 0 auto; padding: 4mm 3mm; color: #171b18; direction: rtl; font-size: ${width === 58 ? "9px" : "11px"}; }
    .head { text-align: center; border-bottom: 1px solid #777; padding-bottom: 7px; margin-bottom: 7px; }
    .logo { width: ${width === 58 ? "34mm" : "42mm"}; max-height: 22mm; object-fit: contain; display: block; margin: 0 auto 4px; }
    .brand { font-size: ${width === 58 ? "15px" : "18px"}; font-weight: 700; color: #111; margin: 0; }
    .tagline { margin: 3px 0 0; font-size: ${width === 58 ? "8px" : "10px"}; font-weight: 400; }
    .meta, .summary { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
    .details { display: grid; grid-template-columns: ${width === 58 ? "1fr" : "1fr 1fr"}; gap: 8px; border-bottom: 1px solid #777; padding: 2px 0 7px; margin-bottom: 7px; }
    .detail-column { min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
    .detail-column + .detail-column { border-right: ${width === 58 ? "0" : "1px solid #bbb"}; padding-right: ${width === 58 ? "0" : "7px"}; }
    .detail-title { font-weight: 700; margin-bottom: 3px; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 7px; font-size: ${width === 58 ? "8px" : "10px"}; }
    th { background: #ededed; color: #111; padding: 5px 2px; font-weight: 700; }
    td { padding: 5px 2px; border-bottom: 1px solid #e5e7e5; overflow-wrap: anywhere; }
    th:nth-child(1), td:nth-child(1) { width: 7%; }
    th:nth-child(2), td:nth-child(2) { width: 39%; }
    th:nth-child(3), td:nth-child(3) { width: 14%; }
    th:nth-child(4), td:nth-child(4) { width: 18%; }
    th:nth-child(5), td:nth-child(5) { width: 22%; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
    .totals { border-top: 1px dashed #777; margin-top: 8px; padding-top: 5px; }
    .total { background: #e6e6e6; padding: 8px; margin-top: 5px; font-size: 13px; font-weight: 700; }
    .codes { display: grid; grid-template-columns: ${width === 58 ? "1fr" : "1fr 1fr 1.2fr"}; align-items: center; gap: 5px; margin: 9px auto 4px; text-align: center; }
    .qr { width: ${width === 58 ? "24mm" : "22mm"}; height: auto; display: block; margin: 0 auto 3px; }
    .barcode { width: 100%; height: ${width === 58 ? "12mm" : "14mm"}; display: block; margin: 0 auto; }
    .code-label { font-size: ${width === 58 ? "7px" : "8px"}; }
    .thanks { font-weight: 700; font-size: ${width === 58 ? "8px" : "9px"}; line-height: 1.45; }
    .heart { font-size: 12px; }
  </style></head>
  <body>
    <div class="head">
      ${options.logoSrc ? `<img class="logo" src="${escapeHtml(options.logoSrc)}" />` : ""}
      <h1 class="brand">بن سليم سوبرماركت</h1>
      <p class="tagline">كل ما تحتاجه .. في مكان واحد</p>
    </div>
    <div class="details">
      <div class="detail-column">
        <div class="detail-title">بيانات الزبون</div>
        <div><b>الاسم:</b> ${escapeHtml(receipt.customerName)}</div>
        <div><b>الجوال:</b> <span dir="ltr">${escapeHtml(receipt.phone)}</span></div>
        <div><b>العنوان:</b> ${escapeHtml(receipt.address)}</div>
      </div>
      <div class="detail-column">
        <div class="meta"><span>رقم الطلب</span><b>#${escapeHtml(receipt.orderNumber)}</b></div>
        <div class="meta"><span>التاريخ</span><b dir="ltr">${escapeHtml(receipt.date)}</b></div>
        <div class="meta"><span>الوقت</span><b>${escapeHtml(receipt.time)}</b></div>
      </div>
    </div>
    <table>
      <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      ${summaryRow("المجموع الفرعي", receipt.subtotal)}
      ${summaryRow("الخصم", receipt.discount)}
      ${deliveryRow}
      ${summaryRow(formatReceiptTaxLabel(receipt), receipt.tax)}
      <div class="summary total"><span>المجموع النهائي</span><span>${formatReceiptMoney(receipt.total)}</span></div>
    </div>
    <div class="codes">
      <div class="code-label">الباركود<img class="barcode" src="${barcode}" alt="Barcode ${escapeHtml(receipt.orderNumber)}" /><span dir="ltr">${escapeHtml(receipt.orderNumber)}</span></div>
      <div class="code-label"><img class="qr" src="${qr}" alt="QR ${escapeHtml(receipt.id)}" />امسح الكود لمتابعة طلبك</div>
      <div class="thanks">شكراً لتسوقكم من<br />بن سليم<br /><span class="heart">♥</span><br />نتمنى لكم يوماً سعيداً</div>
    </div>
  </body></html>`;
}

export async function printOrder(
  order: any,
  printerUrl?: string | null,
  options: ReceiptPrintOptions = {},
): Promise<"sent-to-rawbt" | "sent-to-system"> {
  const width = options.width ?? 80;
  const receipt = normalizeReceiptOrder(order);
  const assets = await getReceiptAssets();
  const qrSvg = makeReceiptQrSvg(receipt.id);
  const barcodeSvg = makeReceiptBarcodeSvg(receipt.orderNumber);
  const html = buildReceiptHTML(order, { width, ...assets });

  if (Platform.OS === "android" && options.rasterize) {
    const payload = await options.rasterize({
      id: `${Date.now()}`,
      width,
      receipt,
      ...assets,
      qrSvg,
      barcodeSvg,
    });
    if (!payload || !/^[A-Za-z0-9+/]+=*$/.test(payload)) {
      throw new Error("تعذّر تجهيز صورة الفاتورة للطباعة.");
    }
    await Linking.openURL(`rawbt:base64,${payload}`);
    return "sent-to-rawbt";
  }

  if (Platform.OS === "ios" && printerUrl) {
    await Print.printAsync({ html, printerUrl });
  } else {
    await Print.printAsync({ html });
  }
  return "sent-to-system";
}

export async function selectPrinter() {
  if (Platform.OS !== "ios") return null;
  try {
    return await Print.selectPrinterAsync();
  } catch {
    return null;
  }
}
