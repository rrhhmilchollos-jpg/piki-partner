export type OrderStatus = "pending" | "accepted" | "preparing" | "ready_for_pickup" | "picked_up" | "on_the_way" | "cancelled";

export type PartnerOrderItem = {
  name: string;
  quantity: number;
  priceCents: number;
};

export type PartnerOrder = {
  id: string;
  publicCode: string;
  status: OrderStatus;
  createdAt: string;
  customer: string;
  deliveryType: "Entrega PIKI" | "Recogida";
  payment: "Pago online" | "Contrarreembolso";
  totalCents: number;
  prepMinutes: number;
  items: PartnerOrderItem[];
};

export type MenuSummaryItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  image?: string;
  modifiers?: number;
};

export const demoOrders: PartnerOrder[] = [
  {
    id: "demo-1048",
    publicCode: "PK-1048",
    status: "pending",
    createdAt: "2026-10-02T10:21:00+02:00",
    customer: "Cliente de PIKI",
    deliveryType: "Entrega PIKI",
    payment: "Pago online",
    totalCents: 2840,
    prepMinutes: 18,
    items: [
      { name: "Bowl Mediterráneo", quantity: 1, priceCents: 1490 },
      { name: "Limonada de la casa", quantity: 2, priceCents: 675 },
    ],
  },
  {
    id: "demo-1047",
    publicCode: "PK-1047",
    status: "preparing",
    createdAt: "2026-10-02T10:13:00+02:00",
    customer: "María G.",
    deliveryType: "Entrega PIKI",
    payment: "Contrarreembolso",
    totalCents: 3260,
    prepMinutes: 12,
    items: [
      { name: "Hamburguesa PIKI", quantity: 2, priceCents: 1350 },
      { name: "Patatas crujientes", quantity: 1, priceCents: 560 },
    ],
  },
  {
    id: "demo-1046",
    publicCode: "PK-1046",
    status: "ready_for_pickup",
    createdAt: "2026-10-02T09:56:00+02:00",
    customer: "Álvaro R.",
    deliveryType: "Recogida",
    payment: "Pago online",
    totalCents: 1840,
    prepMinutes: 9,
    items: [{ name: "Ensalada de temporada", quantity: 1, priceCents: 1840 }],
  },
  {
    id: "demo-1045",
    publicCode: "PK-1045",
    status: "picked_up",
    createdAt: "2026-10-02T09:38:00+02:00",
    customer: "Jorge M.",
    deliveryType: "Entrega PIKI",
    payment: "Pago online",
    totalCents: 4120,
    prepMinutes: 15,
    items: [
      { name: "Bowl Mediterráneo", quantity: 2, priceCents: 1490 },
      { name: "Tarta de queso", quantity: 1, priceCents: 1140 },
    ],
  },
  {
    id: "demo-1044",
    publicCode: "PK-1044",
    status: "cancelled",
    createdAt: "2026-10-02T09:14:00+02:00",
    customer: "Cliente de PIKI",
    deliveryType: "Entrega PIKI",
    payment: "Pago online",
    totalCents: 1980,
    prepMinutes: 14,
    items: [{ name: "Wrap vegetal", quantity: 1, priceCents: 1980 }],
  },
];

export const demoMenu: MenuSummaryItem[] = [
  { id: "bowl", name: "Bowl Mediterráneo", category: "Bowls", price: 14.9, available: true, modifiers: 3 },
  { id: "burger", name: "Hamburguesa PIKI", category: "Principales", price: 13.5, available: true, modifiers: 4 },
  { id: "salad", name: "Ensalada de temporada", category: "Ensaladas", price: 18.4, available: true, modifiers: 2 },
  { id: "wrap", name: "Wrap vegetal", category: "Principales", price: 12.9, available: false, modifiers: 1 },
  { id: "lemonade", name: "Limonada de la casa", category: "Bebidas", price: 6.75, available: true, modifiers: 0 },
  { id: "cheesecake", name: "Tarta de queso", category: "Postres", price: 11.4, available: true, modifiers: 0 },
];

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function orderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending: "Nuevo",
    accepted: "Aceptado",
    preparing: "En preparación",
    ready_for_pickup: "Listo",
    picked_up: "Recogido",
    on_the_way: "En ruta",
    cancelled: "Cancelado",
  };
  return labels[status];
}
