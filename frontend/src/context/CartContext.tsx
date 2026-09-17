import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, getCachedProduct, setCachedCart } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";

type CartItem = { product_id: string; name: string; price: number; image_url: string; quantity: number; line_total: number };
type Cart = { items: CartItem[]; total: number; count: number };
type CartCtx = { cart: Cart; loading: boolean; reload: (force?: boolean) => Promise<void>; add: (id: string, qty?: number) => Promise<Cart>; setQty: (id: string, qty: number) => Promise<Cart>; remove: (id: string) => Promise<Cart> };

const empty: Cart = { items: [], total: 0, count: 0 };
const Ctx = createContext<CartCtx>({} as CartCtx);
export const useCart = () => useContext(Ctx);

function recalculate(items: CartItem[]): Cart {
  const normalized = items.filter((item) => item.quantity > 0).map((item) => ({ ...item, line_total: item.price * item.quantity }));
  return { items: normalized, total: normalized.reduce((sum, item) => sum + item.line_total, 0), count: normalized.reduce((sum, item) => sum + item.quantity, 0) };
}

function optimisticCart(current: Cart, id: string, quantity: number, product?: any): Cart {
  const items = current.items.map((item) => item.product_id === id ? { ...item, quantity } : item);
  if (!current.items.some((item) => item.product_id === id) && quantity > 0 && product) {
    items.push({ product_id: id, name: product.name, price: product.price, image_url: product.image_url || "", quantity, line_total: product.price * quantity });
  }
  return recalculate(items);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(empty);
  const [loading, setLoading] = useState(false);
  const cartRef = useRef<Cart>(empty);
  const mutationVersion = useRef(0);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  cartRef.current = cart;

  const reload = useCallback(async (force = false) => {
    if (!user || user.role !== "customer") {
      cartRef.current = empty;
      setCart(empty);
      return;
    }
    if (cartRef.current.items.length === 0) setLoading(true);
    try {
      const next = await api.cart(force);
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

  const add = useCallback((id: string, qty = 1) => {
    const product = getCachedProduct(id);
    const next = optimisticCart(cartRef.current, id, (cartRef.current.items.find((item) => item.product_id === id)?.quantity || 0) + qty, product);
    return commit(next, () => api.addToCart(id, qty));
  }, [commit]);

  const setQty = useCallback((id: string, qty: number) => {
    const next = optimisticCart(cartRef.current, id, qty);
    return commit(next, () => api.setCartItem(id, qty));
  }, [commit]);

  const remove = useCallback((id: string) => {
    const next = optimisticCart(cartRef.current, id, 0);
    return commit(next, () => api.removeCartItem(id));
  }, [commit]);

  return <Ctx.Provider value={{ cart, loading, reload, add, setQty, remove }}>{children}</Ctx.Provider>;
}