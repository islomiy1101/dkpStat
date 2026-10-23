import { useEffect, useRef } from "react";

/** Sensorli ekran (telefon/planshet): klaviatura ekranning bir qismini yopadi */
const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * autoFocus faqat sichqonchali qurilmada: telefonda sahifa ochilishi bilan klaviatura chiqib,
 * formaning pastki qismini yopib qo'ymasin. `autoFocus` atributi o'rniga ref beriladi.
 */
export function useDesktopAutoFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled && window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, [enabled]);
  return ref;
}

/** Telefonda maydon bosilganda: klaviatura ochilib bo'lgach maydonni ekran markaziga suradi */
export function revealOnFocus(e: React.FocusEvent<HTMLElement>) {
  if (!isTouch()) return;
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}
