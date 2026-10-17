// jspdf-autotable 3.5.x package.json "exports" maydoni o'z tiplarini ko'rsatmaydi — minimal deklaratsiya
declare module "jspdf-autotable" {
  import type { jsPDF } from "jspdf";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type HookData = { row: { section: string; raw: unknown }; column: { index: number }; cell: { styles: Record<string, any> } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function autoTable(doc: jsPDF, options: Record<string, any> & { didParseCell?: (data: HookData) => void }): void;
}
