export type EditablePartnerProfile = {
  name: string;
  email: string;
  phone: string;
  address: string;
  locality: string;
  cuisine: string;
  category: string;
};

export function editablePartnerProfilePayload(draft: EditablePartnerProfile): EditablePartnerProfile {
  return {
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
    address: draft.address,
    locality: draft.locality,
    cuisine: draft.cuisine,
    category: draft.category,
  };
}
