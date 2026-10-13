import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, getCachedCart, getCachedProduct, setCachedCart } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";

type SaleUnit = "piece" | "wholesale";
type CartItem = { product_id: string; name: string; price: number; old_price?: number | null; image_url: string; sale_unit?: SaleUnit; unit_label?: string; units_per_unit?: number; stock_quantity?: number; quantity: number; line_total: number };
type Cart = { items: CartItem[]; total: number; count: number };
type CartCtx = { cart: Cart; loading: boolean; reload: (force?: boolean) => Promise<void>; add: (id: string, qty?: number, saleUnit?: SaleUnit) => Promise<Cart>; setQty: (id: string, qty: number, saleUnit?: SaleUnit) => Promise<Cart>; remove: (id: string, saleUnit?: SaleUnit) => Promise<Cart> };

const empty: Cart = { items: [], total: 0, count: 0 };
const Ctx = createContext<CartCtx>({} as CartCtx);
export const useCart = () => useContext(Ctx);

function recalculate(items: CartItem[]): Cart {
  const normalized = items.filter((item) => item.quantity > 0).map((item) => ({ ...item, stock_quantity: item.quantity * Math.max(Number(item.units_per_unit) || 1, 1), line_total: item.price * item.quantity }));
  return { items: normalized, total: normalized.reduce((sum, item) => sum + item.line_total, 0), count: normalized.reduce((sum, item) => sum + item.quantity, 0) };
}

function optimisticCart(current: Cart, id: string, saleUnit: SaleUnit, quantity: number, product?: any): Cart {
  const matches = (item: CartItem) => item.product_id === id && (item.sale_unit || "piece") === saleUnit;
  const exists = current.items.some(matches);
  const items = current.items.map((item) => matches(item) ? { ...item, quantity } : item);
  if (!exists && quantity > 0 && product) {
    const isWholesale = saleUnit === "wholesale";
    const price = Number(isWholesale ? product.wholesale_price : product.price) || 0;
    const unitsPerUnit = isWholesale ? Number(product.wholesale_quantity) || 1 : 1;
    items.push({ product_id: id, name: product.name, price, old_price: isWholesale ? product.wholesale_old_price : product.old_price, image_url: product.image_url || "", sale_unit: saleUnit, unit_label: isWholesale ? product.wholesale_unit_name : "قطعة", units_per_unit: unitsPerUnit, stock_quantity: quantity * unitsPerUnit, quantity, line_total: price * quantity });
  }
  return recalculate(items);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initialCart = (getCachedCart() as Cart | undefined) || empty;
  const [cart, setCart] = useState<Cart>(initialCart);
  const [loading, setLoading] = useState(false);
  const cartRef = useRef<Cart>(initialCart);
  const mutationVersion = useRef(0);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  cartRef.current = cart;

  const reload = useCallback(async (force = false) => {
    if (!user || user.role !== "customer") {
      cartRef.current = empty;
      setCart(empty);
      return;
    }
    // A navigation to the cart can happen while an add/quantity request is
    // still queued. Read only after those writes have settled.
    await mutationQueue.current.catch(() => undefined);
    const versionAtStart = mutationVersion.current;
    if (cartRef.current.items.length === 0) setLoading(true);
    try {
      const next = await api.cart(force);
      // If a mutation started while the read was in flight, retry against the
      // server instead of showing the older response.
      if (versionAtStart !== mutationVersion.current) {
        const latest = await api.cart(true);
        cartRef.current = latest;
        setCart(latest);
        return;
      }
      cartRef.current = next;
      setCart(next);
    } catch {
      // Keep the last visible cart when a background refresh fails.
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  const commit = useCallback((optimistic: Cart, request: () => Promise<Cart>) => {
    const version = ++mutationVersion.current;
    const previous = cartRef.current;
    cartRef.current = optimistic;
    setCart(optimistic);
    setCachedCart(optimistic);
    const run = mutationQueue.current.catch(() => undefined).then(request);
    mutationQueue.current = run.then(() => undefined, () => undefined);
    return run.then((serverCart) => {
      if (version === mutationVersion.current) { cartRef.current = serverCart; setCart(serverCart); setCachedCart(serverCart); }
      return serverCart;
    }, (error) => {
      if (version === mutationVersion.current) { cartRef.current = previous; setCart(previous); setCachedCart(previous); }
      throw error;
    });
  }, []);

  const add = useCallback((id: string, qty = 1, saleUnit: SaleUnit = "piece") => {
    const product = getCachedProduct(id);
    const currentQuantity = cartRef.current.items.find((item) => item.product_id === id && (item.sale_unit || "piece") === saleUnit)?.quantity || 0;
    const next = optimisticCart(cartRef.current, id, saleUnit, currentQuantity + qty, product);
    return commit(next, () => api.addToCart(id, qty, saleUnit));
  }, [commit]);

  const setQty = useCallback((id: string, qty: number, saleUnit: SaleUnit = "piece") => {
    const next = optimisticCart(cartRef.current, id, saleUnit, qty, getCachedProduct(id));
    return commit(next, () => api.setCartItem(id, qty, saleUnit));
  }, [commit]);

  const remove = useCallback((id: string, saleUnit: SaleUnit = "piece") => {
    const next = optimisticCart(cartRef.current, id, saleUnit, 0, getCachedProduct(id));
    return commit(next, () => api.removeCartItem(id, saleUnit));
  }, [commit]);

  return <Ctx.Provider value={{ cart, loading, reload, add, setQty, remove }}>{children}</Ctx.Provider>;
}