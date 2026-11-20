import { partnerTicketCustomerDetails } from "./partnerTicketCustomer";

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
  pickupQrUrl?: string | null;
  pickupPin?: string | null;
  estimatedReadyAt?: string | null;
  restaurant?: { name?: string; address?: string; phone?: string } | null;
  customer?: { name?: string; phone?: string } | null;
  printCustomerContactEnabled?: boolean;
};

function isCashOrder(order: PrintablePartnerOrder) {
  return Boolean(order.cashDueAtDelivery || order.paymentMethod === "cash");
}

export default function PrintablePartnerTicket({ order }: { order: PrintablePartnerOrder }) {
  const itemCount = (order.items || []).reduce((total, item) => total + (item.quantity || 1), 0);
  const customerDetails = partnerTicketCustomerDetails(order);
  return <div className="piki-thermal-ticket" aria-hidden="true">
    <header>
      <strong>PIKI #{order.publicCode || order._id}</strong>
      <span>{order.restaurant?.name || "ESTABLECIMIENTO PARTNER"}</span>
      {order.restaurant?.address && <span>{order.restaurant.address}</span>}
      <span>{new Date(order.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
    </header>
    <p className="thermal-help">Referencia: {order._id}</p>
    <div className="thermal-rule" />
    {order.pickupQrUrl && <><p className="thermal-pickup-label">RIDER PICKUP CODE</p><img className="thermal-qr" src={order.pickupQrUrl} alt="Código QR de recogida" /></>}
    {order.pickupPin && <p className="thermal-pickup-label">PIN: {order.pickupPin}</p>}
    {(order.pickupQrUrl || order.pickupPin) && <div className="thermal-rule" />}
    {customerDetails ? <section className="thermal-customer-details">
      <strong>CLIENTE</strong>
      <p><span>Nombre y apellido</span><b>{customerDetails.name}</b></p>
      <p><span>Dirección completa</span><b>{customerDetails.address}</b></p>
      <p><span>Teléfono de contacto</span><b>{customerDetails.phone}</b></p>
    </section> : <p className="thermal-line"><span>Cliente</span><b>{order.customer?.name || "Cliente PIKI"}</b></p>}
    <p className="thermal-line"><span>Pago</span><b>{isCashOrder(order) ? "CONTRARREEMBOLSO" : order.paymentState === "authorized" ? "PREPAGO · ONLINE · AUTORIZADO" : order.paymentState === "paid" ? "PREPAGO" : "PAGO ONLINE"}</b></p>
    {order.estimatedReadyAt && <p className="thermal-line"><span>Listo estimado</span><b>{new Date(order.estimatedReadyAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b></p>}
    <p className="thermal-line"><span>Artículos</span><b>{itemCount}</b></p>
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
    <p className="thermal-line"><span>Subtotal</span><b>{(Number(order.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></p>
    <p className="thermal-line"><span>Total</span><b>{(Number(order.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></p>
    <footer>Gracias por colaborar con PIKI<br />partners.pikidelivery.com</footer>
  </div>;
}
