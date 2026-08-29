import * as Print from "expo-print";
import { Platform } from "react-native";
import { STATUS_LABEL } from "@/src/lib/api";

function money(n: number) {
  return Math.round(n || 0).toLocaleString("en-US") + " د.ع";
}

export function buildReceiptHTML(order: any): string {
  const date = new Date(order.created_at).toLocaleString("ar-EG");
  const rows = order.items
    .map(
      (it: any, i: number) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="r">${it.name}</td>
        <td class="c">${it.quantity}</td>
        <td class="c">${money(it.price)}</td>
        <td class="c b">${money(it.line_total)}</td>
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
    .sub { color: #4A524C; font-size: 13px; margin: 4px 0 0; }
    .meta { display: flex; justify-content: space-between; font-size: 13px; color: #2C332D; margin-bottom: 6px; }
    .meta b { color: #1A1F1B; }
    .box { border: 1px solid #E0DFD8; border-radius: 10px; padding: 12px 14px; margin: 10px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { background: #1F4529; color: #fff; padding: 8px 6px; font-weight: 700; }
    td { padding: 8px 6px; border-bottom: 1px solid #E8E7E0; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; color: #1F4529; }
    .total { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 12px 14px; background: #E8EDE7; border-radius: 10px; }
    .total .t { font-size: 20px; font-weight: 800; color: #1F4529; }
    .cod { text-align: center; margin-top: 12px; font-weight: 700; color: #8B3A3A; font-size: 15px; }
    .foot { text-align: center; color: #8A8F88; font-size: 12px; margin-top: 18px; border-top: 2px dashed #C2C0B6; padding-top: 12px; }
    .status { display:inline-block; background:#C5A059; color:#1A1A1A; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700; }
  </style></head>
  <body>
    <div class="head">
      <h1 class="brand">بن سليم سوبرماركت</h1>
      <p class="sub">إيصال طلب — الدفع عند الاستلام</p>
    </div>
    <div class="meta"><span>رقم الطلب: <b>#${order.id.replace("ORD", "")}</b></span><span class="status">${STATUS_LABEL[order.status] || order.status}</span></div>
    <div class="meta"><span>التاريخ: <b>${date}</b></span></div>
    <div class="box">
      <div><b>الزبون:</b> ${order.customer_name}</div>
      <div><b>الهاتف:</b> ${order.phone}</div>
      <div><b>العنوان:</b> ${order.address}</div>
      ${order.notes ? `<div><b>ملاحظات:</b> ${order.notes}</div>` : ""}
      ${order.agent_name ? `<div><b>المندوب:</b> ${order.agent_name}</div>` : ""}
    </div>
    <table>
      <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total"><span>الإجمالي الكلي</span><span class="t">${money(order.total)}</span></div>
    <div class="cod">💵 المبلغ المطلوب تحصيله: ${money(order.total)}</div>
    <div class="foot">شكراً لتسوقك من بن سليم سوبرماركت 🌿<br/>${order.id}</div>
  </body></html>`;
}

export async function printOrder(order: any, printerUrl?: string | null) {
  const html = buildReceiptHTML(order);
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
