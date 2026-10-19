import { ROWS, SECTIONS, SUB_COLS, getCell, fmtNum, roleDisplayName, slugify, type RowCells } from "./model";

/** Original downloadSectionPDF() — DOM o'rniga hisoblangan jadval qiymatlaridan foydalanadi */
export async function downloadSectionPDF(secId: string, table: Record<string, RowCells>) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;

  const section = SECTIONS.find((s) => s.id === secId);
  if (!section) return;

  const cleanText = (txt: unknown) => (txt ? String(txt).replace(/[ʻʼ’`]/g, "'").trim() : "");

  const now = new Date();
  const formattedDate = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}-yil`;

  const doc = new jsPDF("l", "mm", "a4");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  /** Bo'limdagi barcha col-sec-<id> kataklar (DOM tartibida) */
  const sectionCells = (cells: RowCells) => {
    const out: string[] = [];
    for (const role of section.roles) {
      const slug = slugify(role);
      if (section.isSingleCol) out.push(fmtNum(getCell(cells, `cell-${slug}-0`).value));
      else SUB_COLS.forEach((_, i) => out.push(fmtNum(getCell(cells, `cell-${slug}-${i}`).value)));
    }
    return out;
  };

  if (secId === "manba") {
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.text(cleanText("Davlat kadastrlari palatasi Namangan viloyati filiallariga Uzkad dasturiga kelib tushgan arizalar"), 14, 8);
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("times", "bold");
    doc.text("Bo'lim: ", 14, 13);
    const wManba = doc.getTextWidth("Bo'lim: ");
    doc.setFont("times", "normal");
    doc.text(cleanText(`${section.title} (Sahifa: 1)`), 14 + wManba, 13);
    const dateTextWidth = doc.getTextWidth(formattedDate);
    doc.text(formattedDate, 283, 13, { align: "right" });
    doc.setFont("times", "bold");
    doc.text("Sana: ", 283 - dateTextWidth, 13, { align: "right" });

    const headRow = ["T/r", "Hudud nomi", cleanText(section.title), ...section.roles.map(cleanText)];
    const rows = ROWS.map((r) => {
      const cells = table[r.name] || {};
      return [r.no, cleanText(r.name), cleanText(fmtNum(getCell(cells, `cell-sec-total-${secId}`).value)), ...sectionCells(cells).map(cleanText)];
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colStyles: Record<number, any> = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 40, halign: "left" },
      2: { cellWidth: 20, halign: "center", fontStyle: "bold" },
    };
    const dynamicColWidth = (255 - 70) / section.roles.length;
    section.roles.forEach((_, idx) => (colStyles[idx + 3] = { cellWidth: dynamicColWidth, halign: "center" }));

    autoTable(doc, {
      head: [headRow], body: rows, startY: 18, theme: "grid", tableWidth: 255,
      styles: { font: "times", fontSize: 7, cellPadding: 1.3, halign: "center", valign: "middle", lineColor: [100, 116, 139], lineWidth: 0.15, textColor: [0, 0, 0] },
      headStyles: { fillColor: [217, 234, 211], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
      columnStyles: colStyles, margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.row.section === "body") {
          if (data.column.index === 2) data.cell.styles.fontStyle = "bold";
          if ((data.row.raw as string[])[1] === "Viloyat jami") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [201, 218, 248];
          }
        }
      },
    });
    doc.save(cleanText(`${section.title}_Hisobot.pdf`));
    return;
  }

  const roles = section.roles;
  let pageIndex = 0;
  for (let i = 0; i < roles.length; i += 2) {
    const role1 = roles[i];
    const role2 = roles[i + 1];
    if (pageIndex > 0) doc.addPage();
    pageIndex++;

    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text(cleanText("Davlat kadastrlari palatasi Namangan viloyati"), 14, 10);
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("times", "bold");
    doc.text("Bo'lim: ", 14, 15);
    const wSec = doc.getTextWidth("Bo'lim: ");
    doc.setFont("times", "normal");
    doc.text(cleanText(`${section.title} (Sahifa: ${pageIndex})`), 14 + wSec, 15);
    const dateTextWidth = doc.getTextWidth(formattedDate);
    doc.text(formattedDate, 283, 15, { align: "right" });
    doc.setFont("times", "bold");
    doc.text("Sana: ", 283 - dateTextWidth, 15, { align: "right" });

    const renderTableForRole = (role: string, rIndex: number, startYPos: number) => {
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(2, 132, 199);
      doc.text(cleanText(roleDisplayName(role, secId)), 14, startYPos - 2);

      const headRows = section.isSingleCol
        ? [["T/r", "Hudud nomi", cleanText(role)]]
        : [["T/r", "Hudud nomi", ...SUB_COLS]];
      const rows = ROWS.map((r) => {
        const all = sectionCells(table[r.name] || {});
        const rowData = [r.no, cleanText(r.name)];
        if (section.isSingleCol) rowData.push(cleanText(all[rIndex] ?? "0"));
        else for (let j = 0; j < SUB_COLS.length; j++) rowData.push(cleanText(all[rIndex * SUB_COLS.length + j] ?? "0"));
        return rowData;
      });

      autoTable(doc, {
        head: headRows, body: rows, startY: startYPos, theme: "grid",
        styles: { font: "times", fontSize: 7.5, cellPadding: 1.4, halign: "center", valign: "middle", lineColor: [100, 116, 139], lineWidth: 0.15, textColor: [0, 0, 0] },
        headStyles: { fillColor: [2, 132, 199], textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 38, halign: "left" } },
        margin: { left: 14, right: 14 },
        didParseCell(data) {
          if (data.row.section === "body" && (data.row.raw as string[])[1] === "Viloyat jami") data.cell.styles.fontStyle = "bold";
        },
      });
    };

    if (role1) renderTableForRole(role1, i, 22);
    if (role2) renderTableForRole(role2, i + 1, lastY() + 8);
  }
  doc.save(cleanText(`${section.title}_Hisobot.pdf`));
}
