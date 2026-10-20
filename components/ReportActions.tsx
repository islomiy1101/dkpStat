"use client";

/**
 * Hisobot sahifalarining umumiy tugmalari: Yangilash · Rasm (PNG) · Chop etish (A4 albom).
 * Mantiq — lib/useReportCapture.ts; stil — app/globals.css (.rpt-*). Telefonda faqat ikonkalar.
 */
export default function ReportActions({
  onRefresh, refreshing, onImage, imageBusy, onPrint, printBusy, disabled, hidden,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
  onImage: () => void;
  imageBusy?: boolean;
  onPrint: () => void;
  /** Pechat uchun sahifalar rasmga olinmoqda */
  printBusy?: boolean;
  /** Ma'lumot hali yo'q — Rasm va Chop etish o'chiq */
  disabled?: boolean;
  /** Rasmga olinayotganda tugmalar ko'rinmasin */
  hidden?: boolean;
}) {
  return (
    <div className="rpt-actions" style={hidden ? { visibility: "hidden" } : undefined} data-html2canvas-ignore>
      {onRefresh && (
        <button type="button" className="rpt-btn" onClick={onRefresh} disabled={refreshing} title="Google Sheets'dan qayta o'qish">
          <i className={`fa-solid fa-rotate${refreshing ? " fa-spin" : ""}`} /> <span>Yangilash</span>
        </button>
      )}
      <button type="button" className="rpt-btn" onClick={onImage} disabled={disabled || imageBusy} title="Hisobotni rasm (PNG) sifatida yuklab olish">
        <i className={`fa-solid ${imageBusy ? "fa-spinner fa-spin" : "fa-image"}`} /> <span>Rasm</span>
      </button>
      <button type="button" className="rpt-btn rpt-btn-primary" onClick={onPrint} disabled={disabled || printBusy || imageBusy} title="Chop etish (A4 albom)">
        <i className={`fa-solid ${printBusy ? "fa-spinner fa-spin" : "fa-print"}`} /> <span>Chop etish</span>
      </button>
    </div>
  );
}
