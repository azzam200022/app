import { storage } from "@/src/utils/storage";
import { Platform } from "react-native";

const configuredBackend = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");

function getBackendUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    const isReplitPreview = hostname.endsWith(".replit.dev") || hostname.endsWith(".repl.co");
    if (isReplitPreview) return protocol + "//" + hostname;
  }
  return configuredBackend;
}

export const BACKEND = getBackendUrl();
export const TOKEN_KEY = "souq_auth_token";

let authToken: string | null = null;
const REQUEST_TIMEOUT_MS = 12000;
const CACHE_TTLS = {
  products: 60 * 1000,
  categories: 5 * 60 * 1000,
  banners: 60 * 1000,
  product: 2 * 60 * 1000,
  cart: 5 * 1000,
  orders: 15 * 1000,
};
type CacheEntry = { value: any; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<any>>();
const productCache = new Map<string, any>();

function cloneValue<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function setCachedValue(key: string, value: any, ttl: number) {
  responseCache.set(key, { value: cloneValue(value), expiresAt: Date.now() + ttl });
}

function cachedRequest<T>(key: string, loader: () => Promise<T>, ttl: number, force = false): Promise<T> {
  const inFlight = inflightRequests.get(key);
  if (inFlight) return inFlight.then(cloneValue) as Promise<T>;

  const cached = responseCache.get(key);
  if (!force && cached) {
    if (cached.expiresAt > Date.now()) return Promise.resolve(cloneValue(cached.value));
    void cachedRequest(key, loader, ttl, true).catch(() => undefined);
    return Promise.resolve(cloneValue(cached.value));
  }

  const request = loader()
    .then((value) => {
      setCachedValue(key, value, ttl);
      return cloneValue(value);
    })
    .finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, request);
  return request;
}

export function setCachedCart(cart: any) {
  setCachedValue("cart", cart, CACHE_TTLS.cart);
}

export function getCachedValue<T = any>(key: string): T | undefined {
  const cached = responseCache.get(key);
  return cached ? cloneValue(cached.value) : undefined;
}

export function getCachedCart() {
  return getCachedValue("cart");
}

export function getCachedCategories() {
  return getCachedValue<any[]>("categories");
}

export function getCachedBanners() {
  return getCachedValue<any[]>("banners");
}

export function getCachedOrders() {
  return getCachedValue<any[]>("orders");
}

function productsCacheKey(params: { category?: string; search?: string; offers?: boolean } = {}) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  if (params.offers) q.set("offers", "true");
  return "products:" + q.toString();
}

export function getCachedProducts(params: { category?: string; search?: string; offers?: boolean } = {}) {
  return getCachedValue<any[]>(productsCacheKey(params));
}

export function getCachedProduct(id: string) {
  return productCache.get(id) ? cloneValue(productCache.get(id)) : undefined;
}

export function setAuthToken(t: string | null) {
  authToken = t;
}
export function getAuthToken() {
  return authToken;
}

export function resolveImage(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return BACKEND + url;
}

export function formatPrice(n: number): string {
  const v = Math.round(n || 0);
  return v.toLocaleString("en-US") + " د.ع";
}

async function req(path: string, opts: RequestInit = {}) {
  let token = authToken;
  if (!token) token = await storage.secureGet(TOKEN_KEY, "");
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BACKEND + "/api" + path, { ...opts, headers, signal: opts.signal || controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("انتهت مهلة الطلب، حاول مرة أخرى");
    throw new Error("خدمة المتجر غير متصلة حالياً. حاول مرة أخرى بعد تشغيل الخادم");
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || (res.status === 404 || res.status === 502 || res.status === 503
      ? "خدمة المتجر غير متاحة حالياً. يرجى تشغيل الخادم الخلفي"
      : "تعذر تنفيذ الطلب، حاول مرة أخرى");
    throw new Error(typeof msg === "string" ? msg : "حدث خطأ");
  }
  return data;
}

export const api = {
  register: (body: any) => req("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => req("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  previewLogin: (role: "manager" | "delivery" | "customer") => req("/auth/preview/" + role, { method: "POST" }),
  googleSession: (session_id: string) => req("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/auth/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  products: (params: { category?: string; search?: string; offers?: boolean } = {}, force = false) => {
    const key = productsCacheKey(params);
    const suffix = key.slice("products:".length);
    return cachedRequest(key, async () => {
      const products = await req("/products" + (suffix ? "?" + suffix : ""));
      if (Array.isArray(products)) products.forEach((product) => product?.id && productCache.set(product.id, cloneValue(product)));
      return products;
    }, CACHE_TTLS.products, force);
  },
  product: (id: string, force = false) => {
    const local = !force && productCache.get(id);
    if (local) return Promise.resolve(cloneValue(local));
    return cachedRequest("product:" + id, async () => {
      const product = await req("/products/" + id);
      if (product?.id) productCache.set(product.id, cloneValue(product));
      return product;
    }, CACHE_TTLS.product, force);
  },
  bestsellers: () => req("/products/bestsellers"),
  categories: (force = false) => cachedRequest("categories", () => req("/categories"), CACHE_TTLS.categories, force),
  createProduct: (body: any) => req("/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: any) => req("/products/" + id, { method: "PUT", body: JSON.stringify(body) }),
  subscribeAvailabilityAlert: (id: string) => req("/products/" + id + "/availability-alert", { method: "POST" }),
  removeAvailabilityAlert: (id: string) => req("/products/" + id + "/availability-alert", { method: "DELETE" }),
  deleteProduct: (id: string) => req("/products/" + id, { method: "DELETE" }),
  lookup: (barcode: string) => req("/catalog/lookup/" + barcode),
  catalogSearch: (q: string) => req("/catalog/search?q=" + encodeURIComponent(q)),
  banners: (force = false) => cachedRequest("banners", () => req("/banners"), CACHE_TTLS.banners, force),
  deliveryAreas: () => req("/delivery/areas"),
  deliveryQuote: (lat: number, lng: number) => req("/delivery/quote", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  favorites: () => req("/favorites"),
  toggleFav: (id: string) => req("/favorites/" + id, { method: "POST" }),
  cart: (force = false) => cachedRequest("cart", () => req("/cart"), CACHE_TTLS.cart, force),
  addToCart: async (product_id: string, quantity = 1) => { const result = await req("/cart/items", { method: "POST", body: JSON.stringify({ product_id, quantity }) }); setCachedCart(result); return result; },
  setCartItem: async (product_id: string, quantity: number) => { const result = await req("/cart/items", { method: "PUT", body: JSON.stringify({ product_id, quantity }) }); setCachedCart(result); return result; },
  removeCartItem: async (id: string) => { const result = await req("/cart/items/" + id, { method: "DELETE" }); setCachedCart(result); return result; },
  validateCoupon: (code: string, location?: { lat: number; lng: number }) => req("/coupons/validate", { method: "POST", body: JSON.stringify({ code, ...location }) }),
  createOrder: async (body: any) => { const result = await req("/orders", { method: "POST", body: JSON.stringify(body) }); setCachedCart({ items: [], total: 0, count: 0 }); return result; },
  myOrders: (force = false) => cachedRequest("orders", () => req("/orders"), CACHE_TTLS.orders, force),
  order: (id: string, force = false) => {
    const orders = responseCache.get("orders")?.value;
    const local = !force && Array.isArray(orders) ? orders.find((item: any) => item.id === id) : undefined;
    if (local) return Promise.resolve(cloneValue(local));
    return cachedRequest("order:" + id, () => req("/orders/" + id), CACHE_TTLS.orders, force);
  },
  cancelOrder: (id: string) => req("/orders/" + id + "/cancel", { method: "POST" }),
  reorderOrder: async (id: string) => { const result = await req("/orders/" + id + "/reorder", { method: "POST" }); if (result?.cart) setCachedCart(result.cart); return result; },
  adminStats: () => req("/admin/stats"),
  adminOrders: (status?: string) => req("/admin/orders" + (status ? "?status=" + status : "")),
  adminReturns: () => req("/admin/returns"),
  adminSetStatus: (id: string, status: string) => req("/admin/orders/" + id + "/status", { method: "POST", body: JSON.stringify({ status }) }),
  adminAssign: (id: string, agent_id: string) => req("/admin/orders/" + id + "/assign", { method: "POST", body: JSON.stringify({ agent_id }) }),
  adminAgents: () => req("/admin/agents"),
  adminUpdateAgent: (id: string, body: any) => req("/admin/agents/" + id, { method: "PUT", body: JSON.stringify(body) }),
  adminUsers: () => req("/admin/users"),
  adminSetRole: (user_id: string, role: string) => req("/admin/set-role", { method: "POST", body: JSON.stringify({ user_id, role }) }),
  syncConfig: () => req("/admin/sync-config"),
  adminCoupons: () => req("/admin/coupons"),
  adminDeliveryAreas: () => req("/admin/delivery-areas"),
  createDeliveryArea: (body: any) => req("/admin/delivery-areas", { method: "POST", body: JSON.stringify(body) }),
  updateDeliveryArea: (id: string, body: any) => req("/admin/delivery-areas/" + id, { method: "PUT", body: JSON.stringify(body) }),
  deleteDeliveryArea: (id: string) => req("/admin/delivery-areas/" + id, { method: "DELETE" }),
  createCoupon: (body: any) => req("/admin/coupons", { method: "POST", body: JSON.stringify(body) }),
  updateCoupon: (code: string, body: any) => req("/admin/coupons/" + code, { method: "PUT", body: JSON.stringify(body) }),
  deleteCoupon: (code: string) => req("/admin/coupons/" + code, { method: "DELETE" }),
  adminBanners: () => req("/admin/banners"),
  createBanner: (body: any) => req("/admin/banners", { method: "POST", body: JSON.stringify(body) }),
  updateBanner: (id: string, body: any) => req("/admin/banners/" + id, { method: "PUT", body: JSON.stringify(body) }),
  deleteBanner: (id: string) => req("/admin/banners/" + id, { method: "DELETE" }),
  deliveryOrders: () => req("/delivery/orders"),
  deliveryClaim: (id: string) => req("/delivery/orders/" + id + "/claim", { method: "POST" }),
  deliverySetStatus: (id: string, status: string, reason?: string) => req("/delivery/orders/" + id + "/status", { method: "POST", body: JSON.stringify({ status, ...(reason ? { reason } : {}) }) }),
  deliverySetLocation: (id: string, lat: number, lng: number) => req("/delivery/orders/" + id + "/location", { method: "POST", body: JSON.stringify({ lat, lng }) }),
  deliveryCreateReturn: (id: string, body: any) => req("/delivery/orders/" + id + "/returns", { method: "POST", body: JSON.stringify(body) }),
};

export async function uploadImage(uri: string, platformWeb: boolean): Promise<{ path: string; url: string }> {
  let token = authToken;
  if (!token) token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  const name = "photo_" + Date.now() + ".jpg";
  if (platformWeb) { const blob = await (await fetch(uri)).blob(); form.append("file", blob, name); }
  else form.append("file", { uri, name, type: "image/jpeg" } as any);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BACKEND + "/api/upload", { method: "POST", headers: { Authorization: "Bearer " + token } as any, body: form, signal: controller.signal });
    if (!res.ok) throw new Error("فشل رفع الصورة");
    return res.json();
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("انتهت مهلة رفع الصورة");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function uploadInventoryPdf(uri: string, name: string, platformWeb: boolean) {
  let token = authToken;
  if (!token) token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  if (platformWeb) { const blob = await (await fetch(uri)).blob(); form.append("file", blob, name); }
  else form.append("file", { uri, name, type: "application/pdf" } as any);
  const res = await fetch(BACKEND + "/api/admin/inventory/pdf", { method: "POST", headers: token ? { Authorization: "Bearer " + token } as any : {}, body: form });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.detail || "تعذر معالجة ملف PDF");
  return data;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة", confirmed: "تم التأكيد", preparing: "قيد التجهيز", ready_for_delivery: "جاهز للتوصيل", out_for_delivery: "في الطريق", delivered: "تم التوصيل", delivery_failed: "تعذر التسليم", cancelled: "ملغي",
};
export const STATUS_FLOW = ["pending", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered"];