import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";

type CartItem = {
  product_id: string;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
  line_total: number;
};
type Cart = { items: CartItem[]; total: number; count: number };

type CartCtx = {
  cart: Cart;
  loading: boolean;
  reload: () => Promise<void>;
  add: (id: string, qty?: number) => Promise<void>;
  setQty: (id: string, qty: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const empty: Cart = { items: [], total: 0, count: 0 };
const Ctx = createContext<CartCtx>({} as CartCtx);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(empty);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user || user.role !== "customer") {
      setCart(empty);
      return;
    }
    setLoading(true);
    try {
      const c = await api.cart();
      setCart(c);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = async (id: string, qty = 1) => setCart(await api.addToCart(id, qty));
  const setQty = async (id: string, qty: number) => setCart(await api.setCartItem(id, qty));
  const remove = async (id: string) => setCart(await api.removeCartItem(id));

  return <Ctx.Provider value={{ cart, loading, reload, add, setQty, remove }}>{children}</Ctx.Provider>;
}
