type PrintableItem = {
  name?: string;
  quantity?: number;
  priceCents?: number;
  unitPriceCents?: number;
  selectedOptions?: { groupName?: string; optionName?: string; unitPriceCents?: number }[];
};

export type PrintablePartnerOrder = {
  _id: string;
  publicCode?: string;
  createdAt: string;
  status: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  items?: PrintableItem[];
  totalCents?: number;
  paymentMethod?: string;
  paymentState?: string;
  cashDueAtDelivery?: boolean;
  restaurant?: { name?: string; address?: string; phone?: string } | null;
  customer?: { name?: string } | null;
};

const statusLabels: Record<string, string> = {
  pending: "Nuevo",
  accepted: "Aceptado",
  preparing: "En preparación",
  ready_for_pickup: "Listo para recoger",
  picked_up: "Recogido por el Rider",
  on_the_way: "En ruta al cliente",
};

function isCashOrder(order: PrintablePartnerOrder) {
  return Boolean(order.cashDueAtDelivery || order.paymentMethod === "cash");
}

export default function PrintablePartnerTicket({ order }: { order: PrintablePartnerOrder }) {
  return <div className="piki-thermal-ticket" aria-hidden="true">
    <header>
      <strong>{order.restaurant?.name || "ESTABLECIMIENTO PARTNER"}</strong>
      <span>TICKET OFICIAL DE PEDIDO · PIKI DELIVERY</span>
      {order.restaurant?.address && <span>{order.restaurant.address}</span>}
      {order.restaurant?.phone && <span>{order.restaurant.phone}</span>}
    </header>
    <div className="thermal-rule" />
    <section className="thermal-order-id">
      <b>#{order.publicCode || order._id}</b>
      <span>{new Date(order.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
    </section>
    <p className="thermal-status">{statusLabels[order.status] || order.status}</p>
    <p className="thermal-line"><span>Cliente</span><b>{order.customer?.name || "Cliente PIKI"}</b></p>
    <p className="thermal-line"><span>Dirección</span><b>{order.deliveryAddress || "—"}</b></p>
    {order.deliveryNote?.trim() && <p className="thermal-note"><strong>NOTA DEL PEDIDO</strong><br />{order.deliveryNote.trim()}</p>}
    <div className="thermal-rule" />
    <ul>
      {(order.items || []).map((item, index) => {
        const unitPriceCents = item.priceCents ?? item.unitPriceCents;
        return <li key={`${order._id}-ticket-${index}`}>
          <span>
            {item.quantity || 1} × {item.name || "Producto"}
            {(item.selectedOptions || []).map((option, optionIndex) => <small key={`${order._id}-ticket-${index}-option-${optionIndex}`}>+ {option.groupName ? `${option.groupName}: ` : ""}{option.optionName || "Opción"}</small>)}
          </span>
          {unitPriceCents != null && <b>{((unitPriceCents * (item.quantity || 1)) / 100).toFixed(2).replace(".", ",")} €</b>}
        </li>;
      })}
    </ul>
    <div className="thermal-rule" />
    <p className="thermal-line"><span>Pago</span><b>{isCashOrder(order) ? "EFECTIVO · cobra Rider" : order.paymentState === "authorized" ? "ONLINE · AUTORIZADO" : order.paymentState === "paid" ? "PAGADO ONLINE" : "PAGO ONLINE"}</b></p>
    <p className="thermal-line"><span>Total</span><b>{(Number(order.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></p>
    <footer>Gracias por colaborar con PIKI<br />partners.pikidelivery.com</footer>
  </div>;
}
