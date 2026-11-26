import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Bold, Copy, Download, Eye, Heart, ImagePlus, Italic, Layers, Plus,
  Redo2, RotateCcw, Square, Strikethrough, Trash2, Type, Undo2, Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Modal, Select, cx, useToast } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { ensureFonts, fontWeight, FONTS } from "./fonts";
import { exportDoc, loadSource, renderTo } from "./render";
import { CATEGORIES, docFromTemplate, getTemplateDef } from "./templates";
import { cutOut, galleryPhoto, placePhoto, productOf, readPhoto, withPhoto } from "./photo";
import { docFonts } from "./thumbs";
import { FORMATS, type Doc, type El, type Fill, type FormatKey, type ImageEl, type ShapeEl, type ShapeKind, type TextEl, type TextRole } from "./types";

// ------------------------------------------------------------------ history (undo / redo)
type Hist = { past: Doc[]; now: Doc; future: Doc[]; key?: string; at: number };
function useHistory(initial: Doc) {
  const [h, setH] = useState<Hist>({ past: [], now: initial, future: [], at: 0 });
  /** Change the document. `merge` groups quick edits of one field (typing) into one undo step; `transient` skips history (dragging). */
  const set = useCallback((f: (d: Doc) => Doc, o: { merge?: string; transient?: boolean } = {}) => setH((x) => {
    const next = f(x.now);
    if (next === x.now) return x;
    if (o.transient) return { ...x, now: next };
    const merge = o.merge && x.key === o.merge && Date.now() - x.at < 1200;
    return { past: merge ? x.past : [...x.past.slice(-100), x.now], now: next, future: [], key: o.merge, at: Date.now() };
  }), []);
  /** Finish a drag: one undo step back to where it started. */
  const commit = useCallback((base: Doc) => setH((x) => (x.now === base ? x : { past: [...x.past.slice(-100), base], now: x.now, future: [], at: Date.now() })), []);
  const undo = useCallback(() => setH((x) => (x.past.length ? { past: x.past.slice(0, -1), now: x.past[x.past.length - 1], future: [x.now, ...x.future], at: 0 } : x)), []);
  const redo = useCallback(() => setH((x) => (x.future.length ? { past: [...x.past, x.now], now: x.future[0], future: x.future.slice(1), at: 0 } : x)), []);
  const reset = useCallback((d: Doc) => setH((x) => ({ past: [...x.past, x.now], now: d, future: [], at: 0 })), []);
  return { doc: h.now, set, commit, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

// ------------------------------------------------------------------ helpers
let idSeq = 0;
const newId = () => `el-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const solidOf = (f: Fill): string => (typeof f === "string" ? f : f.stops[0]?.[1] ?? "#000000");
const toHex = (c: string) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split("").map((x) => x + x).join("")}`;
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000";
};
const ROLE_LABEL: Record<TextRole, string> = { headline: "Headline", subline: "Description", desc: "Description", price: "Price", oldPrice: "Old price", discount: "Discount", cta: "Button text", brand: "Brand", label: "Text" };
const draftKey = (id: string) => `vendora-ad-draft:${id}`;

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ------------------------------------------------------------------ small inputs
function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const hex = toHex(value);
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded-lg border border-[var(--v-line)] bg-transparent p-0.5" aria-label={label} />
      <span className="min-w-0"><span className="block font-semibold">{label}</span><span className="muted">{hex.toUpperCase()}</span></span>
    </label>
  );
}
function Slider({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex justify-between font-semibold"><span>{label}</span><span className="muted">{Math.round(value * 100) / 100}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--v-sky)]" />
    </label>
  );
}
function IconBtn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cx("grid h-9 w-9 place-items-center rounded-xl border text-sm transition disabled:opacity-40", on ? "border-transparent bg-[var(--v-btn)] text-[var(--v-btn-text)]" : "border-[var(--v-line)] hover:bg-[var(--v-th)]")}>
      {children}
    </button>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-3 border-b border-[var(--v-line)] pb-4 last:border-0"><p className="text-xs font-bold uppercase tracking-wide muted">{title}</p>{children}</div>;
}

function FillInput({ value, onChange, label }: { value: Fill; onChange: (f: Fill) => void; label: string }) {
  const { t } = useI18n();
  const grad = typeof value !== "string";
  const a = solidOf(value);
  const b = typeof value === "string" ? value : value.stops[value.stops.length - 1]?.[1] ?? a;
  const angle = typeof value !== "string" && value.type === "linear" ? value.angle : 160;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{label}</span>
        <div className="seg text-xs">
          <button type="button" className={cx("seg-btn", !grad && "is-on")} aria-pressed={!grad} onClick={() => onChange(toHex(a))}>{t("Solid")}</button>
          <button type="button" className={cx("seg-btn", grad && "is-on")} aria-pressed={grad} onClick={() => onChange({ type: "linear", angle, stops: [[0, toHex(a)], [1, toHex(b === a ? "#ffffff" : b)]] })}>{t("Gradient")}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorInput label={grad ? t("Color 1") : t("Color")} value={a} onChange={(v) => onChange(grad ? { type: "linear", angle, stops: [[0, v], [1, toHex(b)]] } : v)} />
        {grad && <ColorInput label={t("Color 2")} value={b} onChange={(v) => onChange({ type: "linear", angle, stops: [[0, toHex(a)], [1, v]] })} />}
      </div>
      {grad && <Slider label={t("Angle")} value={angle} min={0} max={360} onChange={(v) => onChange({ type: "linear", angle: v, stops: [[0, toHex(a)], [1, toHex(b)]] })} suffix="°" />}
    </div>
  );
}

// ------------------------------------------------------------------ stage (canvas + selection)
type Drag = { mode: "move" | "resize"; dir?: string; id: string; sx: number; sy: number; box: { x: number; y: number; w: number; h: number }; base: Doc; moved: boolean; keep: boolean };
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

function Stage({ doc, selected, onSelect, set, commit, tick, onEditText, onReplaceImage, onDropFile }: {
  doc: Doc; selected: string | null; onSelect: (id: string | null) => void;
  set: (f: (d: Doc) => Doc, o?: { merge?: string; transient?: boolean }) => void; commit: (base: Doc) => void; tick: number; onEditText: (id: string) => void;
  onReplaceImage: (id: string) => void; onDropFile: (file: File, imageId: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = useState(600);
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    const onR = () => setVh(window.innerHeight);
    window.addEventListener("resize", onR);
    return () => { ro.disconnect(); window.removeEventListener("resize", onR); };
  }, []);
  const maxH = Math.max(320, Math.min(vh - (cw < 640 ? 260 : 230), 880));
  const dispW = Math.max(160, Math.min(cw, (maxH * doc.w) / doc.h));
  const dispH = (dispW * doc.h) / doc.w;
  // redraw on the next frame (cheap even while dragging)
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const raf = requestAnimationFrame(() => renderTo(c, doc, dispW * Math.min(2, window.devicePixelRatio || 1)));
    return () => cancelAnimationFrame(raf);
  }, [doc, dispW, tick]);

  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const hit = (p: { x: number; y: number }) => {
    for (let i = doc.els.length - 1; i >= 0; i--) {
      const e = doc.els[i];
      if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) return e;
    }
    return null;
  };
  const start = (ev: React.PointerEvent, el: El, mode: Drag["mode"], dir?: string) => {
    ev.preventDefault(); ev.stopPropagation();
    const p = point(ev);
    onSelect(el.id);
    drag.current = { mode, dir, id: el.id, sx: p.x, sy: p.y, box: { x: el.x, y: el.y, w: el.w, h: el.h }, base: doc, moved: false, keep: el.type === "image" || (el.type === "shape" && Boolean(el.keep)) };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const onDown = (ev: React.PointerEvent) => {
    const el = hit(point(ev));
    if (!el) { onSelect(null); return; }
    start(ev, el, "move");
  };
  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = point(ev);
    let dx = p.x - d.sx, dy = p.y - d.sy;
    if (!d.moved && Math.abs(dx) < 0.003 && Math.abs(dy) < 0.003) return;
    d.moved = true;
    let { x, y, w, h } = d.box;
    let v = false, hz = false;
    if (d.mode === "move") {
      x += dx; y += dy;
      if (Math.abs(x + w / 2 - 0.5) < 0.012) { x = 0.5 - w / 2; v = true; }
      if (Math.abs(y + h / 2 - 0.5) < 0.012) { y = 0.5 - h / 2; hz = true; }
    } else {
      const dir = d.dir ?? "se";
      const corner = dir.length === 2;
      if (corner && d.keep) {
        // keep the proportions of pictures and round shapes when dragging a corner
        const sx = (dir.includes("e") ? dx : -dx) / d.box.w, sy = (dir.includes("s") ? dy : -dy) / d.box.h;
        const s = Math.max(sx, sy); dx = (dir.includes("e") ? 1 : -1) * s * d.box.w; dy = (dir.includes("s") ? 1 : -1) * s * d.box.h;
      }
      if (dir.includes("e")) w = d.box.w + dx;
      if (dir.includes("s")) h = d.box.h + dy;
      if (dir.includes("w")) { w = d.box.w - dx; x = d.box.x + dx; }
      if (dir.includes("n")) { h = d.box.h - dy; y = d.box.y + dy; }
      if (w < 0.02) { if (dir.includes("w")) x -= 0.02 - w; w = 0.02; }
      if (h < 0.02) { if (dir.includes("n")) y -= 0.02 - h; h = 0.02; }
    }
    setGuides({ v, h: hz });
    set((doc0) => ({ ...doc0, els: doc0.els.map((e) => (e.id === d.id ? { ...e, x: clamp(x, -0.9, 0.98), y: clamp(y, -0.9, 0.98), w, h } : e)) }), { transient: true });
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    setGuides({ v: false, h: false });
    if (d?.moved) commit(d.base);
  };
  const sel = doc.els.find((e) => e.id === selected) ?? null;
  const replaceLabel = useI18n().t("Replace photo");
  return (
    <div ref={wrap} className="w-full">
      <div className="relative mx-auto select-none overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5" style={{ width: dispW, height: dispH, touchAction: "none" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={(e) => { const el = hit(point(e)); if (el?.type === "text") onEditText(el.id); if (el?.type === "image") onReplaceImage(el.id); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0]; if (!f) return;
          // Dropped on a picture: that picture is replaced; anywhere else: the template's product picture.
          const p = point(e); const under = [...doc.els].reverse().find((x) => x.type === "image" && p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h);
          onDropFile(f, under?.id ?? null);
        }} data-testid="stage">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-500" />}
        {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-fuchsia-500" />}
        {sel && (
          <div className="absolute border-2 border-[var(--v-sky)]" data-testid="selection"
            style={{ left: sel.x * dispW, top: sel.y * dispH, width: sel.w * dispW, height: sel.h * dispH, transform: sel.rot ? `rotate(${sel.rot}deg)` : undefined }}
            onPointerDown={(e) => start(e, sel, "move")}>
            {HANDLES.map((dir) => (
              <span key={dir} data-handle={dir} onPointerDown={(e) => start(e, sel, "resize", dir)}
                className="absolute h-3.5 w-3.5 rounded-full border-2 border-[var(--v-sky)] bg-white shadow sm:h-3 sm:w-3"
                style={{
                  left: dir.includes("w") ? -7 : dir.includes("e") ? "calc(100% - 7px)" : "calc(50% - 7px)",
                  top: dir.includes("n") ? -7 : dir.includes("s") ? "calc(100% - 7px)" : "calc(50% - 7px)",
                  cursor: `${dir}-resize`,
                }} />
            ))}
            {sel.type === "image" && (
              <button type="button" data-testid="replace-image" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onReplaceImage(sel.id); }}
                className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-lg ring-1 ring-black/10 hover:bg-white">
                <Upload className="h-3.5 w-3.5" />{replaceLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ element factories
function newText(role: TextRole, doc: Doc): TextEl {
  const head = doc.els.find((e): e is TextEl => e.type === "text" && e.role === "headline");
  const color = head?.color ?? "#111111";
  const base: TextEl = { id: newId(), type: "text", role, text: "", x: 0.08, y: 0.4, w: 0.5, h: 0.08, font: head?.font ?? "Plus Jakarta Sans", size: 40, weight: 600, color, align: "left", name: ROLE_LABEL[role] };
  switch (role) {
    case "headline": return { ...base, text: "New heading", size: 80, weight: fontWeight(base.font, 800), h: 0.11 };
    case "price": return { ...base, text: "199 000 so'm", font: "Montserrat", size: 54, weight: 800, y: 0.7, h: 0.07 };
    case "oldPrice": return { ...base, text: "249 000 so'm", font: "Montserrat", size: 32, weight: 600, y: 0.78, h: 0.05, strike: true, opacity: 0.6 };
    case "discount": return { ...base, text: "-20%", font: "Montserrat", size: 48, weight: 800, color: "#ffffff", x: 0.76, y: 0.06, w: 0.18, h: 0.18, align: "center", valign: "middle", lineHeight: 1, bg: { fill: "#ef4444", shape: "burst", padX: 18, padY: 18 } };
    case "cta": return { ...base, text: "Order now →", font: "Plus Jakarta Sans", size: 28, weight: 700, color: "#ffffff", y: 0.84, h: 0.075, valign: "middle", bg: { fill: color, shape: "pill", padX: 30, padY: 14 } };
    default: return { ...base, text: "Your text", font: "Plus Jakarta Sans", size: 36, weight: 500, h: 0.06 };
  }
}
const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" }, { kind: "circle", label: "Circle" }, { kind: "ring", label: "Ring" }, { kind: "triangle", label: "Triangle" },
  { kind: "star", label: "Star" }, { kind: "burst", label: "Badge" }, { kind: "heart", label: "Heart" }, { kind: "sparkle", label: "Sparkle" },
  { kind: "diamond", label: "Diamond" }, { kind: "arch", label: "Arch" }, { kind: "blob", label: "Blob" }, { kind: "line", label: "Line" },
  { kind: "arrow", label: "Arrow" }, { kind: "plus", label: "Plus" }, { kind: "dots", label: "Dots" }, { kind: "stripes", label: "Stripes" }, { kind: "wave", label: "Wave" },
];
function newShape(kind: ShapeKind, color: string): ShapeEl {
  const keep = ["circle", "ring", "star", "burst", "heart", "sparkle", "plus"].includes(kind);
  const size = kind === "line" ? { w: 0.3, h: 0.008 } : kind === "arrow" ? { w: 0.22, h: 0.08 } : kind === "dots" || kind === "stripes" ? { w: 0.3, h: 0.3 } : kind === "wave" ? { w: 1, h: 0.2 } : { w: 0.2, h: 0.2 };
  return { id: newId(), type: "shape", shape: kind, fill: color, x: kind === "wave" ? 0 : 0.4, y: kind === "wave" ? 0.8 : 0.4, ...size, keep, strokeW: kind === "ring" ? 6 : undefined, radius: kind === "rect" ? 16 : undefined, opacity: kind === "dots" || kind === "stripes" ? 0.4 : 1, name: kind };
}

// ------------------------------------------------------------------ panel: element properties
function TextProps({ e, upd, focusRef }: { e: TextEl; upd: (p: Partial<TextEl>, merge?: string) => void; focusRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const { t } = useI18n();
  const fam = FONTS.find((f) => f.family === e.font);
  return (
    <>
      <Section title={t("Text")}>
        <textarea ref={focusRef} value={e.text} onChange={(x) => upd({ text: x.target.value }, `text:${e.id}`)} rows={3} className="input min-h-[80px] w-full resize-y" aria-label={t("Text")} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={e.font} onChange={(x) => upd({ font: x.target.value, weight: fontWeight(x.target.value, e.weight) })} options={FONTS.map((f) => ({ value: f.family, label: f.family }))} aria-label={t("Font")} />
          <Select value={String(e.weight)} onChange={(x) => upd({ weight: Number(x.target.value) })} options={(fam?.weights ?? [400, 700]).map((w) => ({ value: String(w), label: String(w) }))} aria-label={t("Weight")} />
        </div>
        <Slider label={t("Font size")} value={e.size} min={10} max={260} onChange={(v) => upd({ size: v }, `size:${e.id}`)} />
        <div className="flex flex-wrap gap-1.5">
          <IconBtn title={t("Align left")} on={e.align === "left"} onClick={() => upd({ align: "left" })}><AlignLeft className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Align center")} on={e.align === "center"} onClick={() => upd({ align: "center" })}><AlignCenter className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Align right")} on={e.align === "right"} onClick={() => upd({ align: "right" })}><AlignRight className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Bold")} on={e.weight >= 700} onClick={() => upd({ weight: fontWeight(e.font, e.weight >= 700 ? 400 : 800) })}><Bold className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Italic")} on={e.italic} onClick={() => upd({ italic: !e.italic })}><Italic className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Strikethrough")} on={e.strike} onClick={() => upd({ strike: !e.strike })}><Strikethrough className="h-4 w-4" /></IconBtn>
          <IconBtn title={t("Uppercase")} on={e.upper} onClick={() => upd({ upper: !e.upper })}><span className="text-[11px] font-bold">AA</span></IconBtn>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label={t("Text color")} value={e.color} onChange={(v) => upd({ color: v, ...(e.color2 ? { color2: v } : {}) }, `color:${e.id}`)} />
          {e.color2 && <ColorInput label={t("Second line")} value={e.color2} onChange={(v) => upd({ color2: v }, `color2:${e.id}`)} />}
        </div>
        <Slider label={t("Line height")} value={e.lineHeight ?? 1.1} min={0.8} max={2} step={0.02} onChange={(v) => upd({ lineHeight: v }, `lh:${e.id}`)} />
        <Slider label={t("Letter spacing")} value={e.spacing ?? 0} min={-0.1} max={0.5} step={0.01} onChange={(v) => upd({ spacing: v }, `ls:${e.id}`)} />
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={Boolean(e.shadow)} onChange={(x) => upd({ shadow: x.target.checked })} />{t("Text shadow")}</label>
      </Section>
      <Section title={t("Background")}>
        <Select value={e.bg?.shape ?? "none"} aria-label={t("Background shape")} onChange={(x) => {
          const v = x.target.value;
          upd({ bg: v === "none" ? undefined : { fill: e.bg?.fill ?? "#111111", shape: v as NonNullable<TextEl["bg"]>["shape"], padX: e.bg?.padX ?? 26, padY: e.bg?.padY ?? 12, radius: e.bg?.radius ?? 10 } });
        }} options={[{ value: "none", label: t("No background") }, { value: "pill", label: t("Pill button") }, { value: "box", label: t("Box") }, { value: "circle", label: t("Circle") }, { value: "burst", label: t("Star badge") }]} />
        {e.bg && <FillInput label={t("Background color")} value={e.bg.fill} onChange={(f) => upd({ bg: { ...e.bg!, fill: f } }, `bg:${e.id}`)} />}
        {e.bg && <Slider label={t("Padding")} value={e.bg.padX} min={0} max={80} onChange={(v) => upd({ bg: { ...e.bg!, padX: v, padY: Math.round(v * 0.45) } }, `pad:${e.id}`)} />}
      </Section>
    </>
  );
}

function ImageProps({ e, upd, onUpload, onCutOut, cutting }: { e: ImageEl; upd: (p: Partial<ImageEl>, merge?: string) => void; onUpload: () => void; onCutOut: () => void; cutting: boolean }) {
  const { t } = useI18n();
  return (
    <Section title={t("Picture")}>
      <Button className="w-full" icon={<Upload className="h-4 w-4" />} onClick={onUpload}>{t("Replace with my photo")}</Button>
      {!e.src.startsWith("art:") && <Button className="w-full" variant="secondary" loading={cutting} onClick={onCutOut} data-testid="cut-out">{t("Remove background")}</Button>}
      <div className="grid grid-cols-2 gap-2">
        <Select value={e.fit} aria-label={t("Fit")} onChange={(x) => upd({ fit: x.target.value as ImageEl["fit"] })} options={[{ value: "contain", label: t("Show whole picture") }, { value: "cover", label: t("Fill the frame") }]} />
        <Select value={e.mask ?? "none"} aria-label={t("Shape")} onChange={(x) => upd({ mask: x.target.value as ImageEl["mask"] })} options={[{ value: "none", label: t("No frame") }, { value: "rounded", label: t("Rounded") }, { value: "circle", label: t("Circle") }, { value: "arch", label: t("Arch") }]} />
      </div>
      <Slider label={t("Zoom")} value={e.zoom ?? 1} min={0.3} max={3} step={0.01} onChange={(v) => upd({ zoom: v }, `zoom:${e.id}`)} suffix="×" />
      <Slider label={t("Move picture left / right")} value={e.dx ?? 0} min={-0.6} max={0.6} step={0.005} onChange={(v) => upd({ dx: v }, `dx:${e.id}`)} />
      <Slider label={t("Move picture up / down")} value={e.dy ?? 0} min={-0.6} max={0.6} step={0.005} onChange={(v) => upd({ dy: v }, `dy:${e.id}`)} />
      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(e.shadow)} onChange={(x) => upd({ shadow: x.target.checked })} />{t("Shadow")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(e.flip)} onChange={(x) => upd({ flip: x.target.checked })} />{t("Mirror")}</label>
        <button type="button" className="text-[var(--v-sky)] hover:underline" onClick={() => upd({ zoom: 1, dx: 0, dy: 0 })}>{t("Reset position")}</button>
      </div>
    </Section>
  );
}

function ShapeProps({ e, upd }: { e: ShapeEl; upd: (p: Partial<ShapeEl>, merge?: string) => void }) {
  const { t } = useI18n();
  return (
    <Section title={t("Shape")}>
      <FillInput label={t("Fill")} value={e.fill} onChange={(f) => upd({ fill: f }, `fill:${e.id}`)} />
      {e.shape === "rect" && <Slider label={t("Corner radius")} value={e.radius ?? 0} min={0} max={300} onChange={(v) => upd({ radius: v }, `r:${e.id}`)} />}
      {e.shape === "ring" && <Slider label={t("Thickness")} value={e.strokeW ?? 6} min={1} max={60} onChange={(v) => upd({ strokeW: v }, `sw:${e.id}`)} />}
      <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={Boolean(e.keep)} onChange={(x) => upd({ keep: x.target.checked })} />{t("Keep proportions")}</label>
    </Section>
  );
}

// ------------------------------------------------------------------ editor
type Tab = "content" | "element" | "add" | "layers";
const FORMAT_KEYS = Object.keys(FORMATS) as Exclude<FormatKey, "custom">[];

export default function Editor({ templateId, photo, onBack, favorite, onToggleFavorite }: { templateId: string; photo?: string; onBack: () => void; favorite: boolean; onToggleFavorite: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const def = getTemplateDef(templateId);
  // An AI Product Studio picture opened here gets its own draft.
  const draftId = def ? (photo ? `${def.id}:${photo}` : def.id) : "";
  // Earlier edits of this template are kept in the browser; the user is told and can start over.
  const { initial, restored } = useMemo<{ initial: Doc; restored: boolean }>(() => {
    if (!def) return { initial: docFromTemplate(getTemplateDef("fashion-new-sneakers")!), restored: false };
    let fresh = docFromTemplate(def);
    if (photo) { const p = productOf(fresh); if (p) fresh = { ...fresh, els: fresh.els.map((e) => (e.id === p.id ? ({ ...e, src: photo } as ImageEl) : e)) }; }
    try {
      const saved = localStorage.getItem(draftKey(draftId));
      if (saved) {
        const d = JSON.parse(saved) as Doc;
        if (d?.v === 1 && Array.isArray(d.els) && JSON.stringify({ bg: d.bg, els: d.els }) !== JSON.stringify({ bg: fresh.bg, els: fresh.els })) return { initial: d, restored: true };
      }
    } catch { /* storage blocked */ }
    // A photo chosen in the gallery goes straight into the sample picture's place.
    return { initial: photo ? fresh : withPhoto(fresh, galleryPhoto()), restored: false };
  }, [def, photo, draftId]);
  const [showRestored, setShowRestored] = useState(restored);
  const { doc, set, commit, undo, redo, reset, canUndo, canRedo } = useHistory(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [custom, setCustom] = useState({ w: String(doc.w), h: String(doc.h) });
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | "new" | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sel = doc.els.find((e) => e.id === selected) ?? null;

  // fonts and pictures: redraw when they arrive
  const fontKey = JSON.stringify(docFonts(doc));
  useEffect(() => { let alive = true; void ensureFonts(JSON.parse(fontKey)).then(() => alive && setTick((n) => n + 1)); return () => { alive = false; }; }, [fontKey]);
  const srcKey = doc.els.filter((e): e is ImageEl => e.type === "image").map((e) => e.src).join("\n");
  useEffect(() => { let alive = true; void Promise.all(srcKey.split("\n").filter(Boolean).map(loadSource)).then(() => alive && setTick((n) => n + 1)); return () => { alive = false; }; }, [srcKey]);
  // keep a draft so work is not lost on reload
  useEffect(() => {
    if (!def) return;
    const h = setTimeout(() => { try { localStorage.setItem(draftKey(draftId), JSON.stringify(doc)); } catch { /* too large or blocked */ } }, 700);
    return () => clearTimeout(h);
  }, [doc, def, draftId]);

  const upd = useCallback((id: string, p: Partial<El>, merge?: string) => set((d) => ({ ...d, els: d.els.map((e) => (e.id === id ? ({ ...e, ...p } as El) : e)) }), { merge }), [set]);
  const add = (el: El) => { set((d) => ({ ...d, els: [...d.els, el] })); setSelected(el.id); setTab("element"); };
  const remove = (id: string) => { set((d) => ({ ...d, els: d.els.filter((e) => e.id !== id) })); setSelected(null); };
  const duplicate = (id: string) => {
    const e = doc.els.find((x) => x.id === id); if (!e) return;
    const copy = { ...structuredClone(e), id: newId(), x: e.x + 0.03, y: e.y + 0.03 } as El;
    set((d) => { const i = d.els.findIndex((x) => x.id === id); const els = [...d.els]; els.splice(i + 1, 0, copy); return { ...d, els }; });
    setSelected(copy.id);
  };
  const move = (id: string, dir: 1 | -1) => set((d) => {
    const i = d.els.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.els.length) return d;
    const els = [...d.els]; [els[i], els[j]] = [els[j], els[i]]; return { ...d, els };
  });
  const setFormat = (f: FormatKey, w?: number, h?: number) => {
    const size = f === "custom" ? { w: clamp(Math.round(w ?? doc.w), 200, 4000), h: clamp(Math.round(h ?? doc.h), 200, 4000) } : FORMATS[f];
    set((d) => ({ ...d, format: f, w: size.w, h: size.h }));
    setCustom({ w: String(size.w), h: String(size.h) });
  };
  const startOver = () => {
    if (!def) return;
    reset(docFromTemplate(def, doc.format, { w: doc.w, h: doc.h }));
    setSelected(null); setShowRestored(false);
  };
  const productImage = productOf(doc);
  const pickFile = (target: string | "new") => { uploadTarget.current = target; fileRef.current?.click(); };
  const onFile = async (file: File | undefined, targetId?: string | "new") => {
    if (!file) return;
    try {
      setBusy("upload");
      const { src, cutout } = await readPhoto(file);
      await loadSource(src);
      const target = targetId ?? uploadTarget.current;
      const old = target && target !== "new" ? doc.els.find((e): e is ImageEl => e.id === target && e.type === "image") : undefined;
      if (old) upd(old.id, { src, ...placePhoto(doc, old, cutout) });
      else add({ id: newId(), type: "image", src, x: 0.3, y: 0.3, w: 0.4, h: 0.4, fit: cutout ? "contain" : "cover", mask: cutout ? "none" : "rounded", radius: 36, shadow: true, name: "Picture" });
      toast("success", cutout ? t("Photo placed. The plain background was removed.") : t("Photo placed in the template's frame."));
    } catch (err) {
      toast("error", t(err instanceof Error ? err.message : "This image could not be opened."));
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeBg = async (el: ImageEl) => {
    setBusy("cut");
    try {
      const src = await cutOut(el.src);
      if (!src) { toast("error", t("The background could not be found. Use a photo on a plain background.")); return; }
      await loadSource(src);
      upd(el.id, { src, ...placePhoto(doc, el, true) });
      toast("success", t("Background removed."));
    } catch { toast("error", t("The background could not be found. Use a photo on a plain background.")); } finally { setBusy(null); }
  };
  const doExport = async (type: "image/png" | "image/jpeg") => {
    try {
      setBusy(type);
      await ensureFonts(docFonts(doc));
      const blob = await exportDoc(doc, type);
      download(blob, `vendora-${doc.templateId}-${doc.w}x${doc.h}.${type === "image/png" ? "png" : "jpg"}`);
      toast("success", t("Downloaded {w}×{h} {type}.", { w: doc.w, h: doc.h, type: type === "image/png" ? "PNG" : "JPG" }));
    } catch {
      toast("error", t("The file could not be created. Try again."));
    } finally { setBusy(null); }
  };
  const openPreview = async () => {
    setBusy("preview");
    try { await ensureFonts(docFonts(doc)); const blob = await exportDoc(doc, "image/png"); setPreview(URL.createObjectURL(blob)); } finally { setBusy(null); }
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (!selected) return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(selected); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected); return; }
      if (e.key === "Escape") { setSelected(null); return; }
      const step = e.shiftKey ? 0.02 : 0.004;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); const el = doc.els.find((x) => x.id === selected); if (el) upd(selected, { x: el.x + d[0], y: el.y + d[1] }, `nudge:${selected}`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!def) return <div className="card p-6 text-sm">{t("Template not found.")} <button type="button" className="text-[var(--v-sky)] underline" onClick={onBack}>{t("Back to templates")}</button></div>;
  const texts = doc.els.filter((e): e is TextEl => e.type === "text");
  const has = (r: TextRole) => texts.some((x) => x.role === r);
  const tabs: { v: Tab; label: string }[] = [{ v: "content", label: t("Content") }, { v: "element", label: sel ? t("Selected") : t("Background") }, { v: "add", label: t("Add") }, { v: "layers", label: t("Layers") }];
  const catLabel = CATEGORIES.find((c) => c.key === def.category)?.label ?? "";

  return (
    <div className="space-y-4" data-testid="editor">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="file-input" />
      {/* top bar */}
      <div className="card flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>{t("Templates")}</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{def.name}</p>
          <p className="truncate text-[11px] muted">{t(catLabel)} · {doc.w}×{doc.h}</p>
        </div>
        <IconBtn title={t(favorite ? "Remove from favorites" : "Add to favorites")} on={favorite} onClick={onToggleFavorite}><Heart className={cx("h-4 w-4", favorite && "fill-current")} /></IconBtn>
        <IconBtn title={t("Undo")} onClick={undo} disabled={!canUndo}><Undo2 className="h-4 w-4" /></IconBtn>
        <IconBtn title={t("Redo")} onClick={redo} disabled={!canRedo}><Redo2 className="h-4 w-4" /></IconBtn>
        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={startOver} title={t("Reset to the original template")} data-testid="reset">
          <span className="hidden sm:inline">{t("Original")}</span>
        </Button>
      </div>
      {showRestored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--v-line)] bg-[var(--v-sky-soft)] px-4 py-3 text-sm" data-testid="restored">
          <span>{t("Your earlier edits of this template were restored.")}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowRestored(false)}>{t("Keep editing")}</Button>
            <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={startOver}>{t("Start from the original")}</Button>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* canvas */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={doc.format} onChange={(e) => setFormat(e.target.value as FormatKey)} aria-label={t("Format")} className="w-full sm:w-auto"
              options={[...FORMAT_KEYS.map((k) => ({ value: k, label: `${t(FORMATS[k].label)} · ${FORMATS[k].w}×${FORMATS[k].h}` })), { value: "custom", label: t("Custom size") }]} />
            {doc.format === "custom" && (
              <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); setFormat("custom", Number(custom.w), Number(custom.h)); }}>
                <input className="input w-20" inputMode="numeric" value={custom.w} onChange={(e) => setCustom((c) => ({ ...c, w: e.target.value.replace(/\D/g, "") }))} aria-label={t("Width")} />
                <span className="muted">×</span>
                <input className="input w-20" inputMode="numeric" value={custom.h} onChange={(e) => setCustom((c) => ({ ...c, h: e.target.value.replace(/\D/g, "") }))} aria-label={t("Height")} />
                <Button size="sm" type="submit" variant="secondary">{t("Apply")}</Button>
              </form>
            )}
          </div>
          <div className="card p-3 sm:p-5" style={{ background: "repeating-conic-gradient(rgba(148,163,184,.12) 0% 25%, transparent 0% 50%) 50% / 20px 20px" }}>
            <Stage doc={doc} selected={selected} onSelect={(id) => { setSelected(id); if (id) setTab("element"); }} set={set} commit={commit} tick={tick}
              onEditText={(id) => { setSelected(id); setTab("element"); setTimeout(() => textRef.current?.focus(), 50); }}
              onReplaceImage={(id) => { setSelected(id); pickFile(id); }}
              onDropFile={(f, id) => void onFile(f, id ?? productImage?.id ?? "new")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="h-4 w-4" />} loading={busy === "image/png"} onClick={() => void doExport("image/png")} data-testid="export-png">{t("Download PNG")}</Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === "image/jpeg"} onClick={() => void doExport("image/jpeg")} data-testid="export-jpg">{t("Download JPG")}</Button>
            <Button variant="ghost" icon={<Eye className="h-4 w-4" />} loading={busy === "preview"} onClick={() => void openPreview()}>{t("Preview")}</Button>
          </div>
          <p className="text-xs muted">{t("Tip: drag to move, pull the round handles to resize, double-click a text to edit it. Ctrl+Z undo, Ctrl+Y redo, Delete removes, arrows nudge.")}</p>
        </div>

        {/* side panel */}
        <div className="card min-w-0 p-3 sm:p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="seg mb-4 w-full text-xs" role="tablist">
            {tabs.map((x) => <button key={x.v} type="button" role="tab" aria-selected={tab === x.v} className={cx("seg-btn flex-1 justify-center", tab === x.v && "is-on")} onClick={() => setTab(x.v)}>{x.label}</button>)}
          </div>

          {tab === "content" && (
            <div className="space-y-4">
              <Section title={t("Product photo")}>
                <Button className="w-full" icon={<ImagePlus className="h-4 w-4" />} loading={busy === "upload"} onClick={() => pickFile(productImage?.id ?? "new")} data-testid="upload-product">
                  {productImage ? t("Upload my product photo") : t("Add a photo")}
                </Button>
                {productImage && !productImage.src.startsWith("art:") && (
                  <Button className="w-full" variant="secondary" loading={busy === "cut"} onClick={() => void removeBg(productImage)}>{t("Remove background")}</Button>
                )}
                <p className="text-[11px] muted">{t("Your photo goes exactly where the sample picture was. A plain background is removed automatically; a photo with a real background takes the template's frame (a circle stays a circle).")}</p>
                <p className="text-[11px] muted">{t("Tip: drag a photo onto the design, or double-click the picture to replace it.")}</p>
                <p className="text-[11px] muted">{t("Don't need something? Click it on the design and press Delete, or remove it in Layers.")}</p>
              </Section>
              <Section title={t("Texts")}>
                {texts.length === 0 && <p className="text-xs muted">{t("No texts yet.")}</p>}
                {texts.map((x) => (
                  <label key={x.id} className="block text-xs">
                    <span className="mb-1 flex items-center justify-between font-semibold"><span>{t(ROLE_LABEL[x.role ?? "label"])}</span>
                      <button type="button" className="text-[var(--v-sky)] hover:underline" onClick={() => { setSelected(x.id); setTab("element"); }}>{t("Style")}</button></span>
                    {x.text.includes("\n") || x.text.length > 40
                      ? <textarea className="input min-h-[64px] w-full" value={x.text} onChange={(e) => upd(x.id, { text: e.target.value }, `text:${x.id}`)} data-role={x.role} />
                      : <input className="input w-full" value={x.text} onChange={(e) => upd(x.id, { text: e.target.value }, `text:${x.id}`)} data-role={x.role} />}
                  </label>
                ))}
              </Section>
              <Section title={t("Quick add")}>
                <div className="grid grid-cols-2 gap-2">
                  {!has("price") && <Button size="sm" variant="secondary" onClick={() => add(newText("price", doc))}>{t("Price")}</Button>}
                  {!has("oldPrice") && <Button size="sm" variant="secondary" onClick={() => add(newText("oldPrice", doc))}>{t("Old price")}</Button>}
                  {!has("discount") && <Button size="sm" variant="secondary" onClick={() => add(newText("discount", doc))}>{t("Discount badge")}</Button>}
                  {!has("cta") && <Button size="sm" variant="secondary" onClick={() => add(newText("cta", doc))}>{t("Button")}</Button>}
                  <Button size="sm" variant="secondary" onClick={() => add(newText("label", doc))}>{t("Text")}</Button>
                </div>
              </Section>
            </div>
          )}

          {tab === "element" && (
            <div className="space-y-4">
              {!sel && (
                <Section title={t("Background")}>
                  <FillInput label={t("Background color")} value={doc.bg} onChange={(f) => set((d) => ({ ...d, bg: f }), { merge: "bg" })} />
                  <p className="text-[11px] muted">{t("Click any element on the design to edit it.")}</p>
                </Section>
              )}
              {sel?.type === "text" && <TextProps e={sel} upd={(p, m) => upd(sel.id, p, m)} focusRef={textRef} />}
              {sel?.type === "image" && <ImageProps e={sel} upd={(p, m) => upd(sel.id, p, m)} onUpload={() => pickFile(sel.id)} onCutOut={() => void removeBg(sel)} cutting={busy === "cut"} />}
              {sel?.type === "shape" && <ShapeProps e={sel} upd={(p, m) => upd(sel.id, p, m)} />}
              {sel && (
                <Section title={t("Arrange")}>
                  <Slider label={t("Opacity")} value={sel.opacity ?? 1} min={0} max={1} step={0.01} onChange={(v) => upd(sel.id, { opacity: v }, `op:${sel.id}`)} />
                  <Slider label={t("Rotation")} value={sel.rot ?? 0} min={-180} max={180} onChange={(v) => upd(sel.id, { rot: v }, `rot:${sel.id}`)} suffix="°" />
                  <div className="flex flex-wrap gap-1.5">
                    <IconBtn title={t("Bring forward")} onClick={() => move(sel.id, 1)}><ArrowUp className="h-4 w-4" /></IconBtn>
                    <IconBtn title={t("Send backward")} onClick={() => move(sel.id, -1)}><ArrowDown className="h-4 w-4" /></IconBtn>
                    <IconBtn title={t("Center horizontally")} onClick={() => upd(sel.id, { x: 0.5 - sel.w / 2 })}><AlignCenter className="h-4 w-4" /></IconBtn>
                    <IconBtn title={t("Duplicate")} onClick={() => duplicate(sel.id)}><Copy className="h-4 w-4" /></IconBtn>
                    <IconBtn title={t("Delete")} onClick={() => remove(sel.id)}><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </Section>
              )}
            </div>
          )}

          {tab === "add" && (
            <div className="space-y-4">
              <Section title={t("Text")}>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" icon={<Type className="h-4 w-4" />} onClick={() => add(newText("headline", doc))}>{t("Heading")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => add(newText("label", doc))}>{t("Text")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => add(newText("price", doc))}>{t("Price")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => add(newText("oldPrice", doc))}>{t("Old price")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => add(newText("discount", doc))}>{t("Discount badge")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => add(newText("cta", doc))}>{t("Button")}</Button>
                </div>
              </Section>
              <Section title={t("Picture")}>
                <Button size="sm" className="w-full" variant="secondary" icon={<ImagePlus className="h-4 w-4" />} onClick={() => pickFile("new")}>{t("Upload a picture")}</Button>
              </Section>
              <Section title={t("Shapes and decorations")}>
                <div className="grid grid-cols-3 gap-2">
                  {SHAPES.map((s) => (
                    <button key={s.kind} type="button" onClick={() => add(newShape(s.kind, texts.find((x) => x.role === "headline")?.color ?? "#2563eb"))}
                      className="flex flex-col items-center gap-1 rounded-xl border border-[var(--v-line)] p-2 text-[11px] font-semibold hover:bg-[var(--v-th)]">
                      <Square className="h-4 w-4" />{t(s.label)}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {tab === "layers" && (
            <ul className="space-y-1.5" aria-label={t("Layers")}>
              {[...doc.els].reverse().map((e) => (
                <li key={e.id} className={cx("flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs", e.id === selected ? "border-[var(--v-sky)] bg-[var(--v-sky-soft)]" : "border-[var(--v-line)]")}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setSelected(e.id); setTab("element"); }}>
                    {e.type === "text" ? <Type className="h-3.5 w-3.5 shrink-0" /> : e.type === "image" ? <ImagePlus className="h-3.5 w-3.5 shrink-0" /> : <Layers className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{e.type === "text" ? e.text.replace(/\n/g, " ") || t("Text") : t(e.name ?? (e.type === "image" ? "Picture" : "Shape"))}</span>
                  </button>
                  <button type="button" title={t("Bring forward")} onClick={() => move(e.id, 1)} className="p-1 muted hover:text-current"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" title={t("Send backward")} onClick={() => move(e.id, -1)} className="p-1 muted hover:text-current"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" title={t("Delete")} onClick={() => remove(e.id)} className="p-1 muted hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
              <li><Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setTab("add")}>{t("Add element")}</Button></li>
            </ul>
          )}
        </div>
      </div>

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={`${t("Preview")} · ${doc.w}×${doc.h}`} wide>
          <img src={preview} alt={t("Preview")} className="mx-auto max-h-[75vh] w-auto rounded-xl shadow" />
        </Modal>
      )}
    </div>
  );
}
