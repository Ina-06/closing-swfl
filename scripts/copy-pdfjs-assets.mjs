// Copies pdf.js's helper files into public/pdfjs so the registration viewer
// can load them: the image decoders for scanned documents (JBIG2 and JPEG
// 2000, as WebAssembly), colour profiles, and the fonts and character maps
// some PDFs lean on. Without them a scanned registration paints as a blank
// white or yellow page — the background, with the scan itself missing.
//
// Run before `next dev` and `next build` (predev / prebuild), so the files
// always match the installed pdfjs-dist. public/pdfjs is not committed.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "pdfjs");

if (!existsSync(from)) {
  console.error("copy-pdfjs-assets: pdfjs-dist is not installed. Run npm install first.");
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
for (const folder of ["wasm", "iccs", "cmaps", "standard_fonts"]) {
  cpSync(join(from, folder), join(to, folder), { recursive: true });
}
console.log("copy-pdfjs-assets: public/pdfjs is ready.");
