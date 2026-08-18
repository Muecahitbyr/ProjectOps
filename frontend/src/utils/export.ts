// Generischer Export fuer beliebige tabellarische Analytics-Daten (Summary-
// Karten, Verlaufs-Buckets, Drill-Down-Zeilen, ...) - arbeitet ausschliesslich
// mit bereits von der API geladenen echten Daten, erzeugt selbst keine
// Werte. "columns" bestimmt Reihenfolge/Beschriftung, unabhaengig von der
// Objekt-Key-Reihenfolge im Quelldatensatz.
//
// Auftragspunkt 13 "Performance Optimierung" (Phase 10): xlsx und jspdf/
// jspdf-autotable sind zusammen mehrere hundert KB und wurden zuvor auf
// Modulebene importiert - dadurch landeten sie im selben Chunk wie
// ExportMenu.tsx und damit in jeder Seite, die einen Export-Button rendert,
// auch wenn nie exportiert wird. Dynamische import()s laden sie nur beim
// tatsaechlichen Excel-/PDF-Export nach.
export interface ExportColumn<T> {
  key: keyof T;
  label: string;
}

function toRows<T>(data: T[], columns: ExportColumn<T>[]): Array<Record<string, string | number>> {
  return data.map((item) =>
    Object.fromEntries(
      columns.map((column) => {
        const value = item[column.key];
        return [column.label, value === null || value === undefined ? "" : (value as string | number)];
      }),
    ),
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportToCsv<T>(data: T[], columns: ExportColumn<T>[], filename: string): void {
  const rows = toRows(data, columns);
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column.label] ?? "")).join(","));
  // UTF-8 BOM, damit Excel Umlaute beim direkten Oeffnen einer .csv korrekt
  // erkennt (ohne BOM interpretiert Excel die Datei faelschlich als ANSI).
  const blob = new Blob(["﻿", [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function exportToJson<T>(data: T[], filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

export async function exportToExcel<T>(data: T[], columns: ExportColumn<T>[], filename: string, sheetName = "Analytics"): Promise<void> {
  const { utils, writeFile } = await import("xlsx");
  const rows = toRows(data, columns);
  const worksheet = utils.json_to_sheet(rows, { header: columns.map((column) => column.label) });
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, sheetName);
  writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export async function exportToPdf<T>(data: T[], columns: ExportColumn<T>[], filename: string, title: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [columns.map((column) => column.label)],
    body: data.map((item) => columns.map((column) => String(item[column.key] ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export type ExportFormat = "csv" | "excel" | "pdf" | "json";

export async function exportData<T>(
  format: ExportFormat,
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  title: string,
): Promise<void> {
  switch (format) {
    case "csv":
      exportToCsv(data, columns, filename);
      break;
    case "excel":
      await exportToExcel(data, columns, filename);
      break;
    case "pdf":
      await exportToPdf(data, columns, filename, title);
      break;
    case "json":
      exportToJson(data, filename);
      break;
  }
}
