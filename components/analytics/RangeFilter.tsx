"use client";

import type { DateRange } from "@/lib/analytics";

/**
 * Maslahat burchagi / Filial qabulxonasi paneli: ixtiyoriy sana oralig'i (davr chiplari yonida).
 * Sana tanlansa davr "custom" bo'ladi; ikkalasi bo'shatilsa — ko'rinish (AdviceView / ReceptionView) standart davrga qaytaradi.
 */
export default function RangeFilter({ range, onRange, today, active }: {
  range: DateRange;
  onRange: (r: DateRange) => void;
  /** yyyy-MM-dd — kelajak sanasini tanlab bo'lmaydi */
  today: string;
  active: boolean;
}) {
  return (
    <div className={`rc-range${active ? " active" : ""}`} role="group" aria-label="Sana oralig'i">
      <i className="fa-regular fa-calendar" aria-hidden />
      <input type="date" value={range.from} max={range.to || today} aria-label="Boshlanish sanasi"
        onChange={(e) => onRange({ ...range, from: e.target.value })} />
      <span aria-hidden>–</span>
      <input type="date" value={range.to} min={range.from || undefined} max={today} aria-label="Tugash sanasi"
        onChange={(e) => onRange({ ...range, to: e.target.value })} />
    </div>
  );
}
