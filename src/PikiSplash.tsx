import { useEffect, useState, type ReactNode } from "react";

type Props = { children: ReactNode };

export default function PikiSplash({ children }: Props) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 900); return () => window.clearTimeout(timer); }, []);
  if (!visible) return <>{children}</>;
  return <main aria-label="PIKI Partner Orders" role="status" className="orders-splash"><img src="/piki-rider-bee-512.png" alt="Rider abeja PIKI" /><strong>PIKI</strong><span>PARTNER ORDERS</span></main>;
}
