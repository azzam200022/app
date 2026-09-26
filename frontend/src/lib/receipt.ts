import * as Print from "expo-print";
import { Platform } from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

let _logoSrc: string | null = null;
async function getLogoSrc(): Promise<string> {
  if (_logoSrc) return _logoSrc;
  try {
    const asset = Asset.fromModule(require("../../assets/images/logo-binsaleem.png"));
    await asset.downloadAsync();
    if (Platform.OS === "web") {
      _logoSrc = asset.uri;
    } else {
      const b64 = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, { encoding: "base64" });
      _logoSrc = `data:image/png;base64,${b64}`;
    }
  } catch {
    _logoSrc = "";
  }
  return _logoSrc;
}

function money(n: number) {
  return Math.round(n || 0).toLocaleString("en-US") + " د.ع";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\'/g, "&#039;");
}

export function buildReceiptHTML(order: any, logoSrc = ""): string {
  const total = Number(order.total || 0);
  const rows = (Array.isArray(order.items) ? order.items : [])
    .map(
      (it: any, i: number) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="r">${escapeHtml(it.name || "منتج")}</td>
        <td class="c">${Number(it.quantity || 0)}</td>
        <td class="c">${money(it.price)}</td>
        <td class="c b">${money(it.line_total ?? (Number(it.price || 0) * Number(it.quantity || 0)))}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { font-family: -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: #1A1F1B; direction: rtl; }
    .head { text-align: center; border-bottom: 2px dashed #C2C0B6; padding-bottom: 14px; margin-bottom: 14px; }
    .brand { font-size: 26px; font-weight: 800; color: #1F4529; margin: 0; }
    .meta { display: flex; justify-content: space-between; font-size: 13px; color: #2C332D; margin-bottom: 6px; }
    .meta b { color: #1A1F1B; }
    .box { border: 1px solid #E0DFD8; border-radius: 10px; padding: 12px 14px; margin: 10px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { background: #1F4529; color: #fff; padding: 8px 6px; font-weight: 700; }
    td { padding: 8px 6px; border-bottom: 1px solid #E8E7E0; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; color: #1F4529; }
    .total { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 12px 14px; background: #E8EDE7; border-radius: 10px; }
    .total .t { font-size: 20px; font-weight: 800; color: #1F4529; }
  </style></head>
  <body>
    <div class="head">
      ${logoSrc ? `<img src="${logoSrc}" style="width:150px;height:auto;margin:0 auto 6px;display:block;" />` : ""}
      <h1 class="brand">بن سليم سوبرماركت</h1>
    </div>
    <div class="meta"><span>رقم الطلب: <b>#${String(order.id ?? "").replace("ORD", "")}</b></span></div>
    <div class="box"><div><b>الزبون:</b> ${escapeHtml(order.customer_name)}</div></div>
    <table>
      <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total"><span>مجموع المبلغ</span><span class="t">${money(total)}</span></div>
  </body></html>`;
}

export async function printOrder(order: any, printerUrl?: string | null) {
  const logoSrc = await getLogoSrc();
  const html = buildReceiptHTML(order, logoSrc);
  if (Platform.OS === "ios" && printerUrl) {
    await Print.printAsync({ html, printerUrl });
  } else {
    await Print.printAsync({ html });
  }
}

export async function selectPrinter() {
  if (Platform.OS !== "ios") return null;
  try {
    const p = await Print.selectPrinterAsync();
    return p;
  } catch {
    return null;
  }
}
