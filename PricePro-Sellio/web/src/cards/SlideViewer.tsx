/**
 * Full-screen viewer that shows card designs one at a time: arrows, ← / → keys, swipe on touch
 * screens, a counter and a strip of small previews to jump to any of them.
 */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../components/ui";
import { useI18n } from "../lib/i18n";

export type Slide = { key: string; title: string; render: (width: number) => ReactNode; thumb?: (width: number) => ReactNode };

export function SlideViewer({ slides, start = 0, onClose, footer }: {
  slides: Slide[]; start?: number; onClose: () => void; footer?: (index: number) => ReactNode;
}) {
  const { t } = useI18n();
  const [i, setI] = useState(Math.min(Math.max(0, start), slides.length - 1));
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 768 : window.innerHeight));
  const down = useRef<{ x: number; y: number } | null>(null);
  const n = slides.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Handled here only: a dialog under the viewer must not close as well.
      if (["Escape", "ArrowRight", "ArrowLeft"].includes(e.key)) e.stopImmediatePropagation();
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize); document.body.style.overflow = prev; };
  });

  if (n === 0) return null;
  const slide = slides[i];
  // Fit the card into the screen: leave room for the header, the strip and the footer.
  const width = Math.max(220, Math.min(vw - (vw < 640 ? 32 : 180), Math.round((vh - 250) * 0.8), 760));
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label={slide.title} data-testid="slide-viewer">
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="slide-title">{slide.title}</p>
        <span className="text-sm tabular-nums text-white/70" data-testid="slide-counter">{i + 1} / {n}</span>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label={t("Close")}><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2"
        onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const d = down.current; down.current = null;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        }}
        style={{ touchAction: "pan-y" }}>
        {n > 1 && (
          <button type="button" onClick={() => go(-1)} aria-label={t("Previous")} data-testid="slide-prev"
            className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 sm:left-6"><ChevronLeft className="h-6 w-6" /></button>
        )}
        <div key={slide.key} className="max-h-full overflow-hidden rounded-xl shadow-2xl" style={{ width }}>{slide.render(width)}</div>
        {n > 1 && (
          <button type="button" onClick={() => go(1)} aria-label={t("Next")} data-testid="slide-next"
            className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 sm:right-6"><ChevronRight className="h-6 w-6" /></button>
        )}
      </div>
      {footer && <div className="flex flex-wrap justify-center gap-2 px-4 pt-3">{footer(i)}</div>}
      {n > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3">
          {slides.map((s, k) => (
            <button key={s.key} type="button" onClick={() => setI(k)} title={s.title} aria-label={s.title} aria-current={k === i}
              className={cx("w-12 shrink-0 overflow-hidden rounded-md border-2 transition", k === i ? "border-white" : "border-transparent opacity-60 hover:opacity-100")}>
              {s.thumb ? s.thumb(48) : <span className="grid aspect-[3/4] place-items-center bg-white/10 text-xs">{k + 1}</span>}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
