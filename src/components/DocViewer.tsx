"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * "Show officer" mode: one document, full screen, on black.
 *
 * Shared by the driver page (reg.swfl.app) and the vans database's preview,
 * so what the office checks is exactly what the driver will hold up.
 *
 * Every page is painted onto a canvas — PDFs through pdf.js, photos straight
 * from their pixels. That does two jobs. iOS Safari's own PDF view shows the
 * first page of an embedded PDF and nothing else; a stack of canvases shows
 * them all, the same on every phone. And there is no file on the screen to
 * long-press and save, open in another app, or share: no link to the
 * document exists in the page at all. (A screenshot can't be stopped by any
 * web page, and this does not pretend otherwise.)
 *
 * Pinch to zoom, double-tap to zoom in or back out, and one button: Close.
 * Zoom is handled here rather than left to the browser so that Close never
 * drifts off the screen while someone is zoomed in on the VIN.
 */

const MAX_ZOOM = 5;
/** The most pixels one page's canvas may hold — iOS refuses a canvas much past 16.7M. */
const MAX_PIXELS = 12_000_000;

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function isPdf(bytes: Uint8Array) {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** How many device pixels to paint for each CSS pixel: sharp at 2–3x zoom without running out of memory. */
function pixelDensity() {
  return Math.min(window.devicePixelRatio || 1, 3) * 2;
}

function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "block h-auto w-full bg-white select-none";
  canvas.draggable = false;
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

/** Start fetching the PDF renderer before it is needed, so opening a registration doesn't wait on it. */
export function warmPdfRenderer() {
  void import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => {});
}

async function paintPdf(bytes: Uint8Array, into: HTMLElement, cssWidth: number, live: () => boolean) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  try {
    for (let number = 1; number <= pdf.numPages && live(); number++) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      let scale = (cssWidth / base.width) * pixelDensity();
      const area = base.width * base.height * scale * scale;
      if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
      const viewport = page.getViewport({ scale });

      const canvas = newCanvas();
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // Hold its shape before it is painted, so the page doesn't jump.
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      into.appendChild(canvas);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
    }
  } finally {
    void task.destroy();
  }
}

async function paintImage(blob: Blob, into: HTMLElement) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    let { naturalWidth: width, naturalHeight: height } = image;
    const area = width * height;
    if (area > MAX_PIXELS) {
      const shrink = Math.sqrt(MAX_PIXELS / area);
      width = Math.floor(width * shrink);
      height = Math.floor(height * shrink);
    }
    const canvas = newCanvas();
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    into.appendChild(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DocViewer({
  load,
  expiredOn,
  label,
  onClose,
}: {
  /** The document's bytes. Called once when the viewer opens. */
  load: () => Promise<Blob>;
  /** When set, a red EXPIRED banner naming this date sits over the top. */
  expiredOn?: string | null;
  /** What the document is, for screen readers: "Registration for RT.56". */
  label: string;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" } | { status: "error"; message: string }>({
    status: "loading",
  });

  // Load and paint, once.
  const loadRef = useRef(load);
  useEffect(() => {
    if (!mounted) return;
    const into = pages.current;
    if (!into) return;
    let live = true;
    const cssWidth = Math.min(into.clientWidth || window.innerWidth, 1100);

    (async () => {
      const blob = await loadRef.current();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!live) return;
      if (isPdf(bytes)) await paintPdf(bytes, into, cssWidth, () => live);
      else await paintImage(blob, into);
      if (live) setState({ status: "ready" });
    })().catch((error: unknown) => {
      if (!live) return;
      setState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "The document could not be shown.",
      });
    });

    return () => {
      live = false;
      into.replaceChildren();
    };
  }, [mounted]);

  // Esc closes, the page behind holds still, focus starts on Close.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [mounted, onClose]);

  // Pinch and double-tap zoom. Touch listeners by hand: React's are passive and can't stop the browser's own zoom.
  useEffect(() => {
    if (!mounted) return;
    const box = scroller.current;
    const content = pages.current?.parentElement;
    if (!box || !content) return;

    let zoom = 1;
    /** The document's width unzoomed, measured the first time someone zooms. */
    let baseWidth = 0;
    let pinch: { distance: number; zoom: number; anchorX: number; anchorY: number } | null = null;
    let lastTap = 0;

    const apply = (next: number, clientX: number, clientY: number, anchorX: number, anchorY: number) => {
      if (zoom === 1) baseWidth = content.offsetWidth;
      zoom = Math.min(MAX_ZOOM, Math.max(1, next));
      content.style.width = zoom === 1 ? "" : `${baseWidth * zoom}px`;
      content.style.maxWidth = zoom === 1 ? "" : "none";
      const rect = box.getBoundingClientRect();
      box.scrollLeft = anchorX * zoom - (clientX - rect.left);
      box.scrollTop = anchorY * zoom - (clientY - rect.top);
    };

    /** Where a point on screen is in the document, in unzoomed pixels. */
    const anchorOf = (clientX: number, clientY: number) => {
      const rect = box.getBoundingClientRect();
      return {
        anchorX: (box.scrollLeft + clientX - rect.left) / zoom,
        anchorY: (box.scrollTop + clientY - rect.top) / zoom,
      };
    };

    const spread = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const middle = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const mid = middle(event.touches);
        pinch = { distance: spread(event.touches), zoom, ...anchorOf(mid.x, mid.y) };
      }
    };
    const onMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const mid = middle(event.touches);
      apply((pinch.zoom * spread(event.touches)) / pinch.distance, mid.x, mid.y, pinch.anchorX, pinch.anchorY);
    };
    const onEnd = (event: TouchEvent) => {
      if (pinch) {
        if (event.touches.length < 2) pinch = null;
        return;
      }
      if (event.touches.length > 0 || event.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        event.preventDefault();
        const touch = event.changedTouches[0];
        const anchor = anchorOf(touch.clientX, touch.clientY);
        apply(zoom > 1.2 ? 1 : 2.5, touch.clientX, touch.clientY, anchor.anchorX, anchor.anchorY);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    };
    // A trackpad pinch or Ctrl + wheel on a laptop.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const anchor = anchorOf(event.clientX, event.clientY);
      apply(zoom * Math.exp(-event.deltaY / 200), event.clientX, event.clientY, anchor.anchorX, anchor.anchorY);
    };

    box.addEventListener("touchstart", onStart, { passive: false });
    box.addEventListener("touchmove", onMove, { passive: false });
    box.addEventListener("touchend", onEnd, { passive: false });
    box.addEventListener("touchcancel", onEnd);
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      box.removeEventListener("touchstart", onStart);
      box.removeEventListener("touchmove", onMove);
      box.removeEventListener("touchend", onEnd);
      box.removeEventListener("touchcancel", onEnd);
      box.removeEventListener("wheel", onWheel);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none [-webkit-touch-callout:none]"
    >
      {expiredOn ? (
        <div
          role="alert"
          className="relative z-10 shrink-0 bg-reg-red px-4 pb-2.5 pr-16 pt-[max(0.625rem,env(safe-area-inset-top))] text-[17px] font-black uppercase tracking-wide"
        >
          Expired · {expiredOn}
        </div>
      ) : null}

      <div ref={scroller} className="relative min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1100px] px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]">
          <div ref={pages} className="flex flex-col gap-3" />
        </div>

        {state.status === "loading" ? (
          <div className="absolute inset-0 grid place-items-center" role="status">
            <span className="flex flex-col items-center gap-3 text-[15px] font-semibold text-white/80">
              <span
                aria-hidden="true"
                className="size-9 animate-spin rounded-full border-4 border-white/25 border-t-white motion-reduce:animate-none"
              />
              Loading…
            </span>
          </div>
        ) : state.status === "error" ? (
          <div className="absolute inset-0 grid place-items-center px-8" role="alert">
            <p className="max-w-sm text-center text-[16px] font-semibold leading-snug">{state.message}</p>
          </div>
        ) : null}
      </div>

      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid size-12 place-items-center rounded-full bg-white text-black shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="size-6" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
