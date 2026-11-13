import { useMemo, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { accountPhotoUrl, ACCOUNT_PHOTO_ACCEPT, acknowledgedAccountPhoto, prepareAccountPhoto } from "./accountPhoto";
import { apiOrigin, displayRole, type PartnerProfile } from "./partnerApi";
import { usePartnerMenuRequests } from "./usePartnerMenuRequests";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import "./PartnerAccountIdentity.css";

type Props = {
  profile: PartnerProfile;
  token: string;
  identityKey: string;
  isCurrentSession: () => boolean;
  onUnauthorized: () => void;
  onPhotoSaved: (photoUrl: string | null) => void;
};

export function AccountPhoto({ photoUrl, fullName }: { photoUrl: string | null; fullName: string }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const source = accountPhotoUrl(photoUrl);
  return <div className="account-photo">
    {source && source !== brokenUrl ? <img src={source} alt={`Foto propia de ${fullName}`} onError={() => setBrokenUrl(source)} />
      : <><UserRound size={24} aria-hidden="true" /><span>Sin foto</span></>}
  </div>;
}

export default function PartnerAccountIdentity({ profile, token, identityKey, isCurrentSession, onUnauthorized, onPhotoSaved }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const identity = useMemo(() => ({ token, identityKey }), [token, identityKey]);
  const locked = useRef<typeof identity | null>(null);
  const [status, setStatus] = useState({ identity, busy: false, message: "" });
  const busy = status.identity === identity && status.busy;
  const message = status.identity === identity ? status.message : "";
  const beginRequest = usePartnerMenuRequests(token, undefined, apiOrigin, onUnauthorized, identityKey);
  usePwaUpdateBlocker("partner-own-profile-photo", busy);

  const savePhoto = async (file: File | null) => {
    if (locked.current === identity || !isCurrentSession()) return;
    const request = beginRequest();
    const current = () => request.current() && isCurrentSession();
    if (!current()) { request.finish(); return; }
    locked.current = identity;
    setStatus({ identity, busy: true, message: "" });
    try {
      const photoUrl = file ? await prepareAccountPhoto(file) : null;
      if (!current()) return;
      const response = await fetch(`${apiOrigin}/api/v1/auth/employee/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl }),
        signal: request.signal,
      });
      if (!current()) return;
      if ([401, 403, 428].includes(response.status)) { onUnauthorized(); return; }
      if (!response.ok) throw new Error("No se pudo guardar la foto propia. Se conserva la foto anterior.");
      const payload: unknown = response.status === 204 ? {} : await response.json();
      if (!current()) return;
      const confirmed = acknowledgedAccountPhoto(payload, photoUrl);
      onPhotoSaved(confirmed);
      setStatus({ identity, busy: true, message: confirmed ? "Foto propia guardada." : "Foto propia eliminada." });
    } catch (error) {
      if (current()) setStatus({ identity, busy: true, message: error instanceof Error ? error.message : "No se pudo guardar la foto propia." });
    } finally {
      if (current()) {
        locked.current = null;
        setStatus((latest) => latest.identity === identity ? { ...latest, busy: false } : latest);
      }
      request.finish();
    }
  };

  const fullName = profile.fullName || "Nombre no disponible";
  const hasPhoto = Boolean(accountPhotoUrl(profile.photoUrl));
  const action = hasPhoto ? "Cambiar foto propia" : "Añadir foto propia";
  return <section className="account-identity" aria-label={`Mi cuenta: ${fullName}`}>
    <AccountPhoto key={identityKey} photoUrl={profile.photoUrl} fullName={fullName} />
    <div className="account-identity-copy">
      <strong className="account-identity-name">{fullName}</strong>
      <span>Puesto: {profile.jobRole ? displayRole(profile.jobRole) : "No informado"}</span>
      <span>Rol activo: {profile.role ? displayRole(profile.role) : "No informado"}</span>
      <div className="account-photo-actions">
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Guardando foto…" : action}</button>
        {hasPhoto && <button type="button" disabled={busy} onClick={() => void savePhoto(null)}>Quitar foto propia</button>}
      </div>
      <input ref={input} type="file" accept={ACCOUNT_PHOTO_ACCEPT} hidden aria-label={action} disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void savePhoto(file);
      }} />
      {message && <p className="account-photo-message" role="status">{message}</p>}
    </div>
  </section>;
}
