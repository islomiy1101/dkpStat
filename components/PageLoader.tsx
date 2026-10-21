/**
 * Umumiy yuklanish ko'rinishi: DKP logotipi atrofida gradient halqa, "Yuklanmoqda •••" va shimmer skelet.
 * overlay — joriy konteyner ustida (position: absolute), xira fon bilan, skeletsiz;
 * fixed — overlay butun kontent maydoni ustida (sidebar ochiq qoladi). Stillar: app/globals.css → .pl-*
 */
export default function PageLoader({ text = "Yuklanmoqda", skeleton = true, overlay = false, fixed = false }: {
  text?: string;
  skeleton?: boolean;
  overlay?: boolean;
  fixed?: boolean;
}) {
  const cls = `pl-root${overlay ? " pl-overlay no-print" : ""}${fixed ? " pl-fixed" : ""}`;
  return (
    <div className={cls} role="status" aria-live="polite">
      <div className="pl-hero">
        <div className="pl-ring-wrap">
          <span className="pl-glow" aria-hidden />
          <span className="pl-ring" aria-hidden />
          <span className="pl-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="" width={44} height={44} />
          </span>
        </div>
        <div className="pl-text">
          {text}
          <span className="pl-dots" aria-hidden><i /><i /><i /></span>
        </div>
      </div>

      {skeleton && !overlay && (
        <div className="pl-skeleton" aria-hidden>
          <div className="pl-kpis">
            {[0, 1, 2, 3].map((i) => <div key={i} className="pl-sk pl-sk-kpi" />)}
          </div>
          <div className="pl-sk pl-sk-wide" />
          <div className="pl-row">
            <div className="pl-sk pl-sk-half" />
            <div className="pl-sk pl-sk-half" />
          </div>
        </div>
      )}
    </div>
  );
}
