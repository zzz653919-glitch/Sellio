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

/** Starfield: many small stars and a few bright ones. */
function stars(a: string) {
  const r = rng(31);
  let g = "";
  for (let i = 0; i < 260; i++) g += `<circle cx="${f(r() * 600)}" cy="${f(r() * 600)}" r="${f(0.3 + r() * 1.3)}" fill="${a}" fill-opacity="${f(0.35 + r() * 0.65)}"/>`;
  for (let i = 0; i < 9; i++) { const x = r() * 600, y = r() * 600, s = 4 + r() * 6; g += `<path d="M${f(x)} ${f(y - s)}L${f(x + s * 0.18)} ${f(y - s * 0.18)}L${f(x + s)} ${f(y)}L${f(x + s * 0.18)} ${f(y + s * 0.18)}L${f(x)} ${f(y + s)}L${f(x - s * 0.18)} ${f(y + s * 0.18)}L${f(x - s)} ${f(y)}L${f(x - s * 0.18)} ${f(y - s * 0.18)}Z" fill="${a}"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
/** Underwater light ripples (caustics). */
function caustics(a: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="t" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.012 0.018" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 1.3" result="m"/><feFlood flood-color="${a}"/><feComposite in2="m" operator="in"/></filter></defs><rect width="600" height="600" filter="url(#t)"/></svg>`;
}
/** Velvet: soft folds of fabric (two tones). */
function velvet(a: string, b: string) {
  let folds = "";
  for (let i = 0; i < 9; i++) {
    const x = i * 75 - 40;
    folds += `<path d="M${x} -20 C${x + 60} 150 ${x - 40} 330 ${x + 30} 620" stroke="${b}" stroke-width="${28 + (i % 3) * 14}" stroke-opacity="0.55" fill="none"/>`;
    folds += `<path d="M${x + 34} -20 C${x + 94} 150 ${x - 6} 330 ${x + 64} 620" stroke="#FFFFFF" stroke-width="6" stroke-opacity="0.07" fill="none"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="v"><feGaussianBlur stdDeviation="16"/></filter></defs><rect width="600" height="600" fill="${a}"/><g filter="url(#v)">${folds}</g></svg>`;
}
/** Crystal facets: bright and dark triangular planes. */
function facets(a: string, b: string) {
  const r = rng(13);
  let g = "";
  for (let i = 0; i < 70; i++) {
    const x = r() * 640 - 20, y = r() * 640 - 20, s = 30 + r() * 70;
    g += `<path d="M${f(x)} ${f(y)}L${f(x + s * (r() - 0.2))} ${f(y + s * (0.4 + r()))}L${f(x + s * (0.6 + r() * 0.6))} ${f(y + s * (r() - 0.1))}Z" fill="${i % 3 ? a : b}" fill-opacity="${f(0.08 + r() * 0.3)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
/** Frost: ice crystals branching from the edges. */
function frost(a: string) {
  const r = rng(17);
  let g = "";
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g += `<path d="M${f(x)} ${f(y)}L${f(x2)} ${f(y2)}" stroke="${a}" stroke-width="${f(0.6 + depth * 0.7)}" stroke-opacity="${f(0.35 + depth * 0.15)}" stroke-linecap="round"/>`;
    if (depth > 0) for (const d of [-0.7, 0.7]) branch(x + (x2 - x) * 0.55, y + (y2 - y) * 0.55, ang + d, len * 0.55, depth - 1);
    if (depth > 0) branch(x2, y2, ang + (r() - 0.5) * 0.6, len * 0.7, depth - 1);
  };
  for (let i = 0; i < 16; i++) {
    const side = i % 4, t = r() * 600;
    const [x, y, ang] = side === 0 ? [t, 0, Math.PI / 2] : side === 1 ? [600, t, Math.PI] : side === 2 ? [t, 600, -Math.PI / 2] : [0, t, 0];
    branch(x, y, ang + (r() - 0.5) * 0.8, 60 + r() * 70, 3);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}

/** Watercolour: soft bleeding blots of paint on paper. */
function watercolor(a: string, b: string) {
  const r = rng(41);
  let g = "";
  for (let i = 0; i < 14; i++) g += `<ellipse cx="${f(r() * 600)}" cy="${f(r() * 600)}" rx="${f(50 + r() * 130)}" ry="${f(40 + r() * 110)}" fill="${i % 2 ? a : b}" fill-opacity="${f(0.18 + r() * 0.3)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><defs><filter id="w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="9"/><feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="5"/></filter></defs><g filter="url(#w)">${g}</g></svg>`;
}
/** Falling cherry-blossom petals. */
function petals(a: string, b: string) {
  const r = rng(43);
  let g = "";
  for (let i = 0; i < 46; i++) {
    const x = r() * 600, y = r() * 600, s = 5 + r() * 9, rot = r() * 360;
    g += `<path d="M0 ${f(-s)} C${f(s * 0.9)} ${f(-s * 0.6)} ${f(s * 0.7)} ${f(s * 0.7)} 0 ${f(s)} C${f(-s * 0.7)} ${f(s * 0.7)} ${f(-s * 0.9)} ${f(-s * 0.6)} 0 ${f(-s)}Z" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" fill="${i % 3 ? a : b}" fill-opacity="${f(0.55 + r() * 0.4)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
/** Metro (subway) wall tiles. */
function tiles(a: string, b: string) {
  let g = "";
  for (let y = 0; y < 600; y += 40) for (let x = (y / 40) % 2 ? -40 : 0; x < 600; x += 80) g += `<rect x="${x + 2}" y="${y + 2}" width="76" height="36" rx="5" fill="${a}" stroke="${b}" stroke-width="1.5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><rect width="600" height="600" fill="${b}"/>${g}</svg>`;
}
/** Kraft paper: brown fibres and specks. */
function kraft(a: string, b: string) {
  const r = rng(47);
  let g = "";
  for (let i = 0; i < 380; i++) { const x = r() * 600, y = r() * 600, l = 3 + r() * 14, rot = r() * 180; g += `<rect x="${f(x)}" y="${f(y)}" width="${f(l)}" height="0.9" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" fill="${b}" fill-opacity="${f(0.15 + r() * 0.35)}"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><rect width="600" height="600" fill="${a}"/>${g}</svg>`;
}
/** 8-bit pixel blocks and pixel stars. */
function pixels(a: string, b: string) {
  const r = rng(53);
  let g = "";
  for (let i = 0; i < 60; i++) { const x = Math.floor(r() * 50) * 12, y = Math.floor(r() * 50) * 12; g += `<rect x="${x}" y="${y}" width="12" height="12" fill="${i % 2 ? a : b}" fill-opacity="${f(0.35 + r() * 0.6)}"/>`; }
  for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 48) * 12, y = Math.floor(r() * 48) * 12; g += `<path d="M${x + 12} ${y}h12v12h12v12h-12v12h-12v-12h-12v-12h12z" fill="${a}"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
/** Digital glitch: shifted RGB bars. */
function glitch(a: string, b: string) {
  const r = rng(59);
  let g = "";
  for (let i = 0; i < 26; i++) { const y = r() * 600, h = 2 + r() * 14, x = r() * 300 - 100, w = 120 + r() * 420; g += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${i % 2 ? a : b}" fill-opacity="${f(0.25 + r() * 0.5)}"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}
/** Brick wall. */
function brick(a: string, b: string) {
  const r = rng(61);
  let g = "";
  for (let y = 0; y < 600; y += 30) for (let x = (y / 30) % 2 ? -45 : 0; x < 600; x += 90) g += `<rect x="${x + 2}" y="${y + 2}" width="86" height="26" rx="2" fill="${a}" fill-opacity="${f(0.75 + r() * 0.25)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200"><rect width="600" height="600" fill="${b}"/>${g}</svg>`;
}
/** Retro-futuristic perspective grid floor (vaporwave). */
function vgrid(a: string) {
  let g = "";
  for (let i = -12; i <= 12; i++) g += `<path d="M300 0L${300 + i * 70} 600" stroke="${a}" stroke-width="2"/>`;
  for (let k = 1; k < 14; k++) { const y = 600 * (k / 13) ** 1.9; g += `<path d="M0 ${f(y)}H600" stroke="${a}" stroke-width="2"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">${g}</svg>`;
}

const PATTERNS: Record<string, (a: string, b: string) => string> = {
  watercolor, petals, tiles, kraft, pixels, glitch, brick, vgrid: (a) => vgrid(a),
  stars: (a) => stars(a), caustics: (a) => caustics(a), velvet, facets, frost: (a) => frost(a),
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
