/** Reads text out of files in the browser. PDF and Excel libraries load only when a file is picked. */

export const SOP_ACCEPT = ".pdf,.xlsx,.xls,.csv,.txt,application/pdf";
export const DATA_ACCEPT = ".csv,.xlsx,.xls,text/csv";

const ext = (f: File) => f.name.toLowerCase().split(".").pop() ?? "";

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n").trim();
}

async function firstSheet(file: File, format: "csv" | "txt"): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("File Excel ini kosong.");
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error("File Excel ini kosong.");
  return format === "csv" ? XLSX.utils.sheet_to_csv(sheet) : XLSX.utils.sheet_to_txt(sheet);
}

/** Text for the SOP box. */
export async function sopTextFromFile(file: File): Promise<string> {
  const e = ext(file);
  let text: string;
  if (e === "pdf") text = await pdfText(file);
  else if (e === "xlsx" || e === "xls") text = await firstSheet(file, "txt");
  else if (e === "csv" || e === "txt") text = await file.text();
  else throw new Error("Format belum didukung. Pakai PDF, Excel, atau CSV.");
  text = text.trim();
  if (!text) throw new Error("Tidak ada teks yang bisa dibaca dari file ini. Kalau PDF hasil scan, ketik atau rekam saja.");
  return text;
}

/** CSV text plus the dataset name for the existing upload path. */
export async function csvFromFile(file: File): Promise<{ name: string; csv: string }> {
  const e = ext(file);
  const name = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
  if (e === "xlsx" || e === "xls") return { name, csv: await firstSheet(file, "csv") };
  if (e === "csv") return { name, csv: await file.text() };
  throw new Error("Data harus berupa CSV atau Excel.");
}
