import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import ManagerOrders from "../(manager)/orders";

export default function OrderReceiver() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "order_receiver") return <Redirect href="/" />;
  return <ManagerOrders receiver />;
}
