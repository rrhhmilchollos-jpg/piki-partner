export type PartnerTicketCustomerOrder = {
  printCustomerContactEnabled?: boolean;
  deliveryAddress?: string;
  customer?: { name?: string; phone?: string } | null;
};

export function partnerTicketCustomerDetails(order: PartnerTicketCustomerOrder) {
  if (order.printCustomerContactEnabled !== true) return null;
  const notProvided = "No facilitado/a";
  return {
    name: order.customer?.name?.trim() || notProvided,
    address: order.deliveryAddress?.trim() || notProvided,
    phone: order.customer?.phone?.trim() || notProvided,
  };
}
