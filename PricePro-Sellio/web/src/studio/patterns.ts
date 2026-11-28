/**
 * Decorative backgrounds drawn as SVG (no image files): marble, flowers, leaves, a tech grid, snow and
 * bokeh lights. An image element uses them as "pattern:<name>|a=#hex|b=#hex"; the same seed always gives
 * the same picture, so a saved design looks the same every time.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const f = (n: number) => Math.round(n * 10) / 10;

function marble(a: string, b: string) {
  const r = rng(7);
  let veins = "";
  for (let i = 0; i < 16; i++) {
    let x = r() * 700 - 50, y = r() * 700 - 50;
    let d = `M${f(x)} ${f(y)}`;
    for (let k = 0; k < 5; k++) {
      const nx = x + 60 + r() * 140, ny = y + (r() - 0.35) * 160;
      d += ` Q${f(x + (nx - x) * 0.5 + (r() - 0.5) * 80)} ${f(y + (ny - y) * 0.5 + (r() - 0.5) * 80)} ${f(nx)} ${f(ny)}`;
      x = nx; y = ny;
    }
    veins += `<path d="${d}" fill="none" stroke="${b}" stroke-width="${f(0.4 + r() * (i % 4 === 0 ? 3 : 1.2))}" stroke-opacity="${f(0.15 + r() * 0.35)}"/>`;
  }
  let clouds = "";
  for (let i = 0; i < 7; i++) clouds += `<ellipse cx="${f(r() * 600)}" cy="${f(r() * 600)}" rx="${f(80 + r() * 160)}" ry="${f(40 + r() * 90)}" fill="${b}" fill-opacity="${f(0.03 + r() * 0.05)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="s"><feGaussianBlur stdDeviation="22"/></filter><filter id="v"><feGaussianBlur stdDeviation="0.7"/></filter></defs><rect width="600" height="600" fill="${a}"/><g filter="url(#s)">${clouds}</g><g filter="url(#v)">${veins}</g></svg>`;
}

function flower(cx: number, cy: number, s: number, petal: string, center: string, rot: number) {
  let p = "";
  for (let i = 0; i < 5; i++) p += `<ellipse cx="0" cy="${f(-s * 0.55)}" rx="${f(s * 0.36)}" ry="${f(s * 0.55)}" fill="${petal}" transform="rotate(${i * 72})"/>`;
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})">${p}<circle r="${f(s * 0.24)}" fill="${center}"/></g>`;
}
function leaf(cx: number, cy: number, s: number, color: string, rot: number) {
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})"><path d="M0 0 C ${f(s * 0.5)} ${f(-s * 0.35)} ${f(s * 0.85)} ${f(-s * 0.1)} ${f(s)} 0 C ${f(s * 0.85)} ${f(s * 0.1)} ${f(s * 0.5)} ${f(s * 0.35)} 0 0Z" fill="${color}"/><path d="M0 0 L${f(s * 0.95)} 0" stroke="rgba(255,255,255,0.35)" stroke-width="${f(s * 0.03)}"/></g>`;
}
function flowers(a: string, b: string) {
  const r = rng(11);
  let g = "";
  for (let i = 0; i < 10; i++) g += leaf(r() * 600, r() * 600, 50 + r() * 50, i % 2 ? "#6FA36B" : "#4E8A4F", r() * 360);
  for (let i = 0; i < 12; i++) g += flower(r() * 600, r() * 600, 26 + r() * 30, i % 3 ? a : b, i % 2 ? "#F7D774" : "#FFFFFF", r() * 72);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
function leaves(a: string, b: string) {
  const r = rng(23);
  let g = "";
  for (let i = 0; i < 22; i++) g += leaf(r() * 600, r() * 600, 60 + r() * 70, i % 3 ? a : b, r() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
function grid(a: string) {
  let g = "";
  for (let i = 0; i <= 600; i += 30) g += `<path d="M${i} 0V600M0 ${i}H600" stroke="${a}" stroke-width="${i % 150 === 0 ? 1.2 : 0.5}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
function snow(a: string) {
  const r = rng(5);
  let g = "";
  for (let i = 0; i < 70; i++) g += `<circle cx="${f(r() * 600)}" cy="${f(r() * 600)}" r="${f(1 + r() * 3.5)}" fill="${a}" fill-opacity="${f(0.4 + r() * 0.6)}"/>`;
  for (let i = 0; i < 10; i++) {
    const x = r() * 600, y = r() * 600, s = 8 + r() * 12;
    let arms = "";
    for (let k = 0; k < 6; k++) arms += `<path d="M0 0V${f(-s)}M0 ${f(-s * 0.6)}L${f(s * 0.25)} ${f(-s * 0.8)}M0 ${f(-s * 0.6)}L${f(-s * 0.25)} ${f(-s * 0.8)}" transform="rotate(${k * 60})"/>`;
    g += `<g transform="translate(${f(x)} ${f(y)})" stroke="${a}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.8">${arms}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
function bokeh(a: string, b: string) {
  const r = rng(3);
  let g = "";
  for (let i = 0; i < 24; i++) g += `<circle cx="${f(r() * 600)}" cy="${f(r() * 600)}" r="${f(10 + r() * 50)}" fill="${i % 2 ? a : b}" fill-opacity="${f(0.08 + r() * 0.22)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs><g filter="url(#b)">${g}</g></svg>`;
}

/** Poured concrete: grain, pores and soft stains. */
function concrete(a: string, b: string) {
  const r = rng(11);
  let g = "";
  for (let i = 0; i < 9; i++) g += `<ellipse cx="${f(r() * 600)}" cy="${f(r() * 600)}" rx="${f(60 + r() * 140)}" ry="${f(40 + r() * 100)}" fill="${b}" fill-opacity="${f(0.05 + r() * 0.08)}"/>`;
  let pores = "";
  for (let i = 0; i < 420; i++) pores += `<circle cx="${f(r() * 600)}" cy="${f(r() * 600)}" r="${f(0.4 + r() * 1.6)}" fill="${b}" fill-opacity="${f(0.15 + r() * 0.4)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="s"><feGaussianBlur stdDeviation="30"/></filter><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/></filter></defs><rect width="600" height="600" fill="${a}"/><g filter="url(#s)">${g}</g><rect width="600" height="600" filter="url(#n)"/>${pores}</svg>`;
}
/** Retro sun rays from the centre. */
function sunburst(a: string, b: string) {
  let rays = "";
  for (let i = 0; i < 24; i++) {
    const a1 = (i / 24) * Math.PI * 2, a2 = ((i + 0.5) / 24) * Math.PI * 2;
    rays += `<path d="M300 300L${f(300 + Math.cos(a1) * 900)} ${f(300 + Math.sin(a1) * 900)}L${f(300 + Math.cos(a2) * 900)} ${f(300 + Math.sin(a2) * 900)}Z" fill="${b}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><rect width="600" height="600" fill="${a}"/>${rays}</svg>`;
}
/** Halftone dots growing towards one corner (print look). */
function halftone(a: string) {
  let d = "";
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const t = (x + y) / 58;
    if (t < 0.25) continue;
    d += `<circle cx="${x * 20 + (y % 2 ? 10 : 0)}" cy="${y * 20}" r="${f(1 + t * 7)}" fill="${a}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${d}</svg>`;
}
/** Iridescent holographic foil: soft rainbow bands and light streaks. */
function holo(a: string, b: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C7F9FF"/><stop offset="0.2" stop-color="${a}"/><stop offset="0.4" stop-color="#FDE2FF"/><stop offset="0.6" stop-color="${b}"/><stop offset="0.8" stop-color="#E0FFE9"/><stop offset="1" stop-color="#D9D2FF"/></linearGradient><filter id="w"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="2" seed="8"/><feDisplacementMap in="SourceGraphic" scale="140"/></filter><filter id="bl"><feGaussianBlur stdDeviation="14"/></filter></defs><rect x="-80" y="-80" width="760" height="760" fill="url(#h)" filter="url(#w)"/><g filter="url(#bl)" fill="#FFFFFF" fill-opacity="0.55"><rect x="120" y="-100" width="40" height="800" transform="rotate(28 300 300)"/><rect x="330" y="-100" width="18" height="800" transform="rotate(28 300 300)"/></g></svg>`;
}
/** Thin horizontal scan lines (screens, cyberpunk). */
function scanlines(a: string) {
  let l = "";
  for (let y = 0; y < 600; y += 6) l += `<rect y="${y}" width="600" height="1.4" fill="${a}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${l}</svg>`;
}
/** Terrazzo / speckled stone chips. */
function terrazzo(a: string, b: string) {
  const r = rng(21);
  let g = "";
  for (let i = 0; i < 90; i++) {
    const x = r() * 600, y = r() * 600, s = 3 + r() * 11, rot = r() * 180;
    g += `<path d="M${f(-s)} 0L0 ${f(-s * 0.7)}L${f(s * 0.9)} ${f(-s * 0.2)}L${f(s * 0.4)} ${f(s * 0.8)}L${f(-s * 0.6)} ${f(s * 0.5)}Z" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" fill="${i % 3 ? a : b}" fill-opacity="${f(0.35 + r() * 0.5)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}

const PATTERNS: Record<string, (a: string, b: string) => string> = {
  marble, flowers, leaves, grid: (a) => grid(a), snow: (a) => snow(a), bokeh,
  concrete, sunburst, halftone: (a) => halftone(a), holo, scanlines: (a) => scanlines(a), terrazzo,
};
export const PATTERN_NAMES = Object.keys(PATTERNS);

export const patternSrc = (name: string, a: string, b = a) => `pattern:${name}|a=${a}|b=${b}`;
export function patternSvg(src: string): string | null {
  if (!src.startsWith("pattern:")) return null;
  const [name, ...opts] = src.slice(8).split("|");
  const o: Record<string, string> = {};
  for (const p of opts) { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }
  const make = PATTERNS[name];
  const ok = (c?: string) => (c && /^(#[0-9a-fA-F]{3,8}|rgba?\([\d., ]+\))$/.test(c) ? c : "#999999");
  return make ? make(ok(o.a), ok(o.b ?? o.a)) : null;
}
