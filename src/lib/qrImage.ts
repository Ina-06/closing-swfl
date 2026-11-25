"use client";

import jsQR from "jsqr";
import QRCode from "qrcode";
import { QR_UPLOAD_BYTES } from "@/lib/vanQr";

/**
 * QR images in the browser: reading one, shrinking one, drawing one.
 *
 * All of it is canvas work, so none of it can run on the server.
 */

async function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error("That image could not be opened.");
  }
}

/** The image drawn onto a canvas no bigger than `max` on its long edge. */
function drawn(bitmap: ImageBitmap, max: number) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read images.");
  // White under a transparent PNG, or a black-on-transparent code reads as black-on-black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context, width, height };
}

/**
 * What the QR in an image says, or null if none could be read.
 *
 * Tried at a few sizes, because jsQR finds a code in a busy photo more easily
 * small and a dense code more easily large. Never throws for "no code": that
 * is an answer, and the caller asks the person whether to save anyway.
 */
export async function decodeQr(blob: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await bitmapOf(blob);
  } catch {
    return null;
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const sizes = [...new Set([1600, 900, 500].map((size) => Math.min(size, longEdge)))];
    for (const size of sizes) {
      const { context, width, height } = drawn(bitmap, size);
      const pixels = context.getImageData(0, 0, width, height);
      const found = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
      if (found?.data) return found.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The file as it should be sent: itself if it is small enough, else redrawn
 * smaller. See QR_UPLOAD_BYTES for why there is a ceiling below the 5 MB a
 * person may pick.
 */
export async function shrinkForUpload(file: Blob): Promise<Blob> {
  if (file.size <= QR_UPLOAD_BYTES) return file;

  const bitmap = await bitmapOf(file);
  try {
    for (const [max, type, quality] of [
      [2048, "image/png", undefined],
      [2048, "image/webp", 0.92],
      [1600, "image/jpeg", 0.9],
      [1200, "image/jpeg", 0.85],
    ] as const) {
      const { canvas } = drawn(bitmap, max);
      const blob = await canvasBlob(canvas, type, quality);
      if (blob && blob.size <= QR_UPLOAD_BYTES && blob.type === type) return blob;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("That image could not be made small enough to upload.");
}

const RENDER = {
  errorCorrectionLevel: "M",
  // Four modules of white all round — the quiet zone scanners expect.
  margin: 4,
  width: 1024,
  color: { dark: "#000000", light: "#ffffff" },
} as const;

/** A crisp QR drawn from its text, as a data URL; null if the text is too long to encode. */
export async function qrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, RENDER);
  } catch {
    return null;
  }
}

/** Any image as a PNG, for Download and Copy. */
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await bitmapOf(blob);
  try {
    const { canvas } = drawn(bitmap, Math.max(bitmap.width, bitmap.height));
    const png = await canvasBlob(canvas, "image/png");
    if (!png) throw new Error("That image could not be turned into a PNG.");
    return png;
  } finally {
    bitmap.close();
  }
}

/** A data URL back into a Blob, without a network round trip. */
export function dataUrlBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",", 2);
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

/** Whether this browser can put an image on the clipboard. */
export function canCopyImage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}
