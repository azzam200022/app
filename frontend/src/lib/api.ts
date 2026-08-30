import { storage } from "@/src/utils/storage";

export const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const TOKEN_KEY = "souq_auth_token";

let authToken: string | null = null;

export function setAuthToken(t: string | null) {
  authToken = t;
}
export function getAuthToken() {
  return authToken;
}

export function resolveImage(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${BACKEND}${url}`;
}

export function formatPrice(n: number): string {
  const v = Math.round(n || 0);
  return v.toLocaleString("en-US") + " د.ع";
}

async function req(path: string, opts: RequestInit = {}) {
  let token = authToken;
  if (!token) token = await storage.secureGet(TOKEN_KEY, "");
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.detail) || "حدث خطأ، حاول مرة أخرى";
    throw new Error(typeof msg === "string" ? msg : "حدث خطأ");
  }
  return data;
}

export const api = {
  // auth
  register: (body: any) => req("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => req("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  googleSession: (session_id: string) => req("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  // products
  products: (params: { category?: string; search?: string; offers?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.category) q.set("category", params.category);
    if (params.search) q.set("search", params.search);
    if (params.offers) q.set("offers", "true");
    const s = q.toString();
    return req(`/products${s ? "?" + s : ""}`);
  },
  product: (id: string) => req(`/products/${id}`),
  categories: () => req("/categories"),
  createProduct: (body: any) => req("/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: any) => req(`/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id: string) => req(`/products/${id}`, { method: "DELETE" }),
  lookup: (barcode: string) => req(`/catalog/lookup/${barcode}`),
  catalogSearch: (q: string) => req(`/catalog/search?q=${encodeURIComponent(q)}`),
  // favorites
  favorites: () => req("/favorites"),
  toggleFav: (id: string) => req(`/favorites/${id}`, { method: "POST" }),
  // cart
  cart: () => req("/cart"),
  addToCart: (product_id: string, quantity = 1) => req("/cart/items", { method: "POST", body: JSON.stringify({ product_id, quantity }) }),
  setCartItem: (product_id: string, quantity: number) => req("/cart/items", { method: "PUT", body: JSON.stringify({ product_id, quantity }) }),
  removeCartItem: (id: string) => req(`/cart/items/${id}`, { method: "DELETE" }),
  // orders
  createOrder: (body: any) => req("/orders", { method: "POST", body: JSON.stringify(body) }),
  myOrders: () => req("/orders"),
  order: (id: string) => req(`/orders/${id}`),
  cancelOrder: (id: string) => req(`/orders/${id}/cancel`, { method: "POST" }),
  // admin
  adminStats: () => req("/admin/stats"),
  adminOrders: (status?: string) => req(`/admin/orders${status ? "?status=" + status : ""}`),
  adminSetStatus: (id: string, status: string) => req(`/admin/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adminAssign: (id: string, agent_id: string) => req(`/admin/orders/${id}/assign`, { method: "POST", body: JSON.stringify({ agent_id }) }),
  adminAgents: () => req("/admin/agents"),
  adminUsers: () => req("/admin/users"),
  adminSetRole: (user_id: string, role: string) => req("/admin/set-role", { method: "POST", body: JSON.stringify({ user_id, role }) }),
  // delivery
  deliveryOrders: () => req("/delivery/orders"),
  deliverySetStatus: (id: string, status: string) => req(`/delivery/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  deliverySetLocation: (id: string, lat: number, lng: number) => req(`/delivery/orders/${id}/location`, { method: "POST", body: JSON.stringify({ lat, lng }) }),
};

export async function uploadImage(uri: string, platformWeb: boolean): Promise<{ path: string; url: string }> {
  let token = authToken;
  if (!token) token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  const name = `photo_${Date.now()}.jpg`;
  if (platformWeb) {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${BACKEND}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` } as any,
    body: form,
  });
  if (!res.ok) throw new Error("فشل رفع الصورة");
  return res.json();
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  confirmed: "تم التأكيد",
  preparing: "قيد التجهيز",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};
export const STATUS_FLOW = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"];
