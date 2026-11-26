import type { Art } from "./types";

/* ---------- colour + markup helpers ---------- */
const rgb = (h: string): number[] => {
  const m = /^#([0-9a-f]{6})$/i.exec((h || "").trim());
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Mix a colour toward white (amt > 0) or black (amt < 0); amt in -1..1. */
const shade = (h: string, amt: number) => {
  const t = amt < 0 ? 0 : 255, k = Math.min(1, Math.abs(amt));
  return hex(rgb(h).map((v) => v + (t - v) * k));
};
const mix = (a: string, b: string, t: number) => {
  const B = rgb(b);
  return hex(rgb(a).map((v, i) => v + (B[i] - v) * t));
};
type Stop = [number, string, number?];
const stops = (s: Stop[]) => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`).join("");
const lg = (id: string, s: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rg = (id: string, s: Stop[], cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
const rnd = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Soft contact shadow (radial falloff). */
const shadow = (cx: number, cy: number, rx: number, ry: number, op = 0.35, id = "shd") =>
  `${rg(id, [[0, "#000", op], [0.55, "#000", op * 0.55], [1, "#000", 0]])}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;
const pt = (p: number[]) => `${r1(p[0])} ${r1(p[1])}`;
/** Leaf shape pointing along +x from origin, length L, width w. */
const leaf = (L: number, w: number) => `M0 0C${L * 0.25} ${-w} ${L * 0.7} ${-w} ${L} 0C${L * 0.7} ${w} ${L * 0.25} ${w} 0 0Z`;
const leafAt = (x: number, y: number, rot: number, L: number, w: number, fill: string, vein: string) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="${leaf(L, w)}" fill="${fill}"/><path d="M2 0Q${L * 0.5} ${-w * 0.12} ${L * 0.92} 0" stroke="${vein}" stroke-width="1.4" fill="none" opacity=".8"/></g>`;

/* ---------- cars ---------- */
type CarP = {
  fT: number[]; nT: number[]; nB: number[]; fB: number[];
  wF: number[]; wN: number[]; rF: number[]; rN: number[]; rR: number[]; rRF: number[];
  cB: number[]; tE: number[]; tB: number[]; rB: number[];
  fw: number[]; rw: number[]; ffw: number[]; bp: number; suv?: boolean; sport?: boolean;
};
const CARS: Record<string, CarP> = {
  sedan: {
    fT: [36, 164], nT: [134, 172], nB: [140, 240], fB: [44, 226],
    wF: [124, 126], wN: [226, 134], rF: [184, 86], rN: [272, 90], rR: [360, 94], rRF: [300, 86],
    cB: [414, 124], tE: [458, 134], tB: [462, 194], rB: [448, 220],
    fw: [196, 232, 34], rw: [392, 217, 31], ffw: [74, 236, 22], bp: 320,
  },
  sport: {
    fT: [34, 182], nT: [138, 190], nB: [142, 240], fB: [42, 230],
    wF: [150, 148], wN: [252, 154], rF: [214, 110], rN: [300, 114], rR: [348, 118], rRF: [306, 110],
    cB: [428, 140], tE: [464, 146], tB: [466, 198], rB: [452, 218],
    fw: [204, 232, 37], rw: [398, 220, 35], ffw: [74, 238, 22], bp: 330, sport: true,
  },
  suv: {
    fT: [38, 140], nT: [136, 150], nB: [142, 238], fB: [44, 222],
    wF: [118, 114], wN: [220, 124], rF: [166, 68], rN: [256, 74], rR: [418, 82], rRF: [356, 70],
    cB: [434, 120], tE: [450, 122], tB: [458, 196], rB: [450, 214],
    fw: [196, 228, 38], rw: [394, 212, 35], ffw: [76, 232, 25], bp: 318, suv: true,
  },
};
const carDraw = (o: Record<string, string>) => {
  const P = CARS[o.kind] || CARS.sedan, b = o.body;
  const { fT, nT, nB, fB, wF, wN, rF, rN, rR, rRF, cB, tE, tB, rB, fw, rw, ffw } = P;
  const sillY = (x: number) => nB[1] + ((x - nB[0]) * (rB[1] - nB[1])) / (rB[0] - nB[0]);
  const arch = (w: number[]) => {
    const ra = w[2] * 1.22, x1 = r1(w[0] + ra), x2 = r1(w[0] - ra), y1 = r1(sillY(x1)), y2 = r1(sillY(x2)), R = r1(ra);
    return {
      a: `L${x1} ${y1}A${R} ${R} 0 0 0 ${x2} ${y2}`,
      well: `M${x1} ${y1}A${R} ${R} 0 0 0 ${x2} ${y2}Z`,
      flare: `M${x1 + 5} ${y1 - 1}A${R + 5} ${R + 5} 0 0 0 ${x2 - 5} ${y2 - 1}`,
    };
  };
  const ar = arch(rw), af = arch(fw);
  const pc = [rR[0] + (cB[0] - rR[0]) * 0.7, rR[1] + 2];
  const side = `M${pt(nT)}L${pt(wN)}L${pt(rN)}L${pt(rR)}Q${pt(pc)} ${pt(cB)}Q${tE[0] - 10} ${cB[1] + 1} ${pt(tE)}Q${tB[0] + 3} ${(tE[1] + tB[1]) / 2} ${pt(tB)}Q${tB[0] - 1} ${rB[1]} ${pt(rB)}${ar.a}${af.a}L${pt(nB)}Q${nT[0] + 12} ${(nT[1] + nB[1]) / 2} ${pt(nT)}Z`;
  const mF = [(fT[0] + nT[0]) / 2, (fT[1] + nT[1]) / 2 - 3], mB = [(fB[0] + nB[0]) / 2, (fB[1] + nB[1]) / 2 + 4];
  const front = `M${pt(fT)}Q${pt(mF)} ${pt(nT)}Q${nT[0] + 12} ${(nT[1] + nB[1]) / 2} ${pt(nB)}Q${pt(mB)} ${pt(fB)}Q${fB[0] - 6} ${(fB[1] + fT[1]) / 2} ${pt(fT)}Z`;
  const hood = `M${pt(fT)}Q${pt(mF)} ${pt(nT)}L${pt(wN)}L${pt(wF)}Z`;
  const wind = `M${pt(wF)}L${pt(wN)}L${pt(rN)}L${pt(rF)}Z`;
  const roof = `M${pt(rF)}L${pt(rN)}L${pt(rR)}L${pt(rRF)}Z`;
  const wb = [wN[0] + 10, wN[1] - 2], back = P.suv ? 14 : 46;
  const wr = [rR[0] - (P.suv ? 6 : 16), rR[1] + 4], wrb = [cB[0] - back, cB[1] - 2 + (P.suv ? 0 : 1)];
  const win = `M${pt(wb)}L${rN[0] + 6} ${rN[1] + 5}L${pt(wr)}Q${P.suv ? `${wrb[0] + 2} ${wr[1] + 10}` : `${wr[0] + 30} ${wr[1] + 4}`} ${pt(wrb)}Z`;
  const bx = wb[0] + (wrb[0] - wb[0]) * 0.52, by1 = rN[1] + 5 + (wr[1] - rN[1]) * 0.52, by2 = wb[1] + (wrb[1] - wb[1]) * 0.52;
  const H = nB[1] - nT[1], W = nT[0] - fT[0];
  const F = (u: number, v: number) => [fT[0] + (nT[0] - fT[0]) * u + (fB[0] - fT[0]) * v * (1 - u) + (nB[0] - nT[0]) * v * u, fT[1] + (nT[1] - fT[1]) * u + ((fB[1] - fT[1]) * (1 - u) + (nB[1] - nT[1]) * u) * v];
  const hy = P.suv ? 0.14 : 0.1;
  const hlN = `M${pt(F(0.64, hy))}L${pt(F(1, hy - 0.04))}L${nT[0] + 24} ${r1(nT[1] + H * hy - 3)}L${nT[0] + 20} ${r1(nT[1] + H * (hy + 0.09))}L${pt(F(1, hy + 0.13))}L${pt(F(0.68, hy + 0.12))}Z`;
  const hlF = `M${pt(F(0.02, hy))}L${pt(F(0.28, hy + 0.01))}L${pt(F(0.27, hy + 0.12))}L${pt(F(0.04, hy + 0.11))}Z`;
  const g0 = P.sport ? 0.56 : hy + 0.05, g1 = P.sport ? 0.84 : P.suv ? 0.55 : 0.44, gu0 = P.sport ? 0.16 : 0.3, gu1 = P.sport ? 0.84 : 0.64;
  const gr = `M${pt(F(gu0, g0))}L${pt(F(gu1, g0))}L${pt(F(gu1 - 0.03, g1))}L${pt(F(gu0 + 0.03, g1))}Z`;
  let slats = "";
  for (let v = g0 + 0.06; v < g1 - 0.02; v += 0.06) slats += `M${pt(F(gu0 + 0.02, v))}L${pt(F(gu1 - 0.02, v))}`;
  const intake = P.sport ? `M${pt(F(0.36, 0.3))}L${pt(F(0.62, 0.3))}L${pt(F(0.6, 0.4))}L${pt(F(0.38, 0.4))}Z` : `M${pt(F(0.12, 0.72))}L${pt(F(0.9, 0.73))}L${pt(F(0.88, 0.87))}L${pt(F(0.14, 0.85))}Z`;
  const wheel = (w: number[], id: string, k: number) => {
    const [cx, cy, ry] = w, rx = ry * k;
    let sp = "";
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * (Math.PI / 180), a1 = a - 0.17, a2 = a + 0.17, R = ry * 0.62, r = ry * 0.17;
      sp += `M${r1(Math.cos(a - 0.4) * r)} ${r1(Math.sin(a - 0.4) * r)}L${r1(Math.cos(a1) * R)} ${r1(Math.sin(a1) * R)}L${r1(Math.cos(a2) * R)} ${r1(Math.sin(a2) * R)}L${r1(Math.cos(a + 0.4) * r)} ${r1(Math.sin(a + 0.4) * r)}Z`;
    }
    return `<ellipse cx="${r1(cx - rx * 0.22)}" cy="${cy}" rx="${r1(rx)}" ry="${ry}" fill="#0b0d12"/><ellipse cx="${cx}" cy="${cy}" rx="${r1(rx)}" ry="${ry}" fill="url(#tr)"/>
<g transform="translate(${r1(cx + rx * 0.04)} ${cy}) scale(${k} 1)"><circle r="${r1(ry * 0.7)}" fill="url(#rim${id})"/><circle r="${r1(ry * 0.63)}" fill="#1a1d24"/>${P.sport ? `<path d="M${r1(-ry * 0.3)} ${r1(-ry * 0.42)}A${r1(ry * 0.5)} ${r1(ry * 0.5)} 0 0 1 ${r1(ry * 0.3)} ${r1(-ry * 0.42)}" stroke="#dc2626" stroke-width="${r1(ry * 0.14)}" fill="none"/>` : ""}<path d="${sp}" fill="url(#rim${id})"/><circle r="${r1(ry * 0.17)}" fill="url(#rim${id})"/><circle r="${r1(ry * 0.07)}" fill="#374151"/></g>`;
  };
  const rails = P.suv ? `<path d="M${rN[0] + 8} ${rN[1] - 3}L${rR[0] - 6} ${rR[1] - 4}" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/><path d="M${rN[0] + 8} ${rN[1] - 4}L${rR[0] - 6} ${rR[1] - 5}" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/>` : "";
  const clad = P.suv ? `<path d="M${nB[0] + 2} ${nB[1] - 12}L${rB[0] - 4} ${rB[1] - 13}L${rB[0]} ${rB[1]}L${nB[0]} ${nB[1]}Z" fill="#1f2328"/>` : `<path d="M${nB[0] + 4} ${nB[1] - 4}L${rB[0] - 4} ${rB[1] - 4}" stroke="#0b0f17" stroke-width="6" opacity=".55"/>`;
  const spoiler = P.sport ? `<path d="M${tE[0] - 34} ${tE[1] - 3}L${tE[0] + 4} ${tE[1] - 9}L${tE[0] + 4} ${tE[1] - 2}L${tE[0] - 30} ${tE[1] + 2}Z" fill="#111827"/>` : "";
  const mirror = `<path d="M${wN[0] + 12} ${wN[1] - 2}L${wN[0] - 6} ${wN[1] - 14}Q${wN[0] - 16} ${wN[1] - 12} ${wN[0] - 12} ${wN[1] - 2}Q${wN[0] - 4} ${wN[1] + 4} ${wN[0] + 12} ${wN[1] + 4}Z" fill="${shade(b, -0.1)}" stroke="${shade(b, -0.45)}" stroke-width="1"/>`;
  const dy1 = sillY(bx);
  return `<defs>
${lg("bs", [[0, shade(b, 0.4)], [0.3, shade(b, 0.1)], [0.52, b], [0.66, shade(b, -0.28)], [1, shade(b, -0.55)]], 0, 0, 0, 1)}
${lg("bf", [[0, shade(b, 0.05)], [0.5, shade(b, -0.18)], [1, shade(b, -0.5)]])}
${lg("bh", [[0, shade(b, 0.15)], [0.6, shade(b, 0.45)], [1, shade(b, 0.2)]], 0, 1, 1, 0)}
${lg("gl", [[0, "#475569"], [0.5, "#0f172a"], [1, "#020617"]], 0, 0, 0.6, 1)}
${lg("hl", [[0, "#ffffff"], [1, "#bae6fd"]])}
${lg("rf", [[0, "#ffffff", 0], [0.5, "#ffffff", 0.55], [1, "#ffffff", 0]], 0, 0, 1, 0)}
${rg("tr", [[0, "#2b2f36"], [0.82, "#16181d"], [1, "#050608"]])}
${lg("rima", [[0, "#f8fafc"], [0.5, "#9ca3af"], [1, "#e5e7eb"]], 0, 0, 1, 1)}
${lg("rimb", [[0, "#e5e7eb"], [0.5, "#6b7280"], [1, "#d1d5db"]], 0, 0, 1, 1)}
</defs>
${shadow(255, 254, 236, 22, 0.55)}
<ellipse cx="${ffw[0]}" cy="${ffw[1]}" rx="${r1(ffw[2] * 0.8)}" ry="${ffw[2]}" fill="#0b0d12"/><ellipse cx="${ffw[0] + 3}" cy="${ffw[1]}" rx="${r1(ffw[2] * 0.5)}" ry="${r1(ffw[2] * 0.7)}" fill="#1f2329"/>
<path d="${af.well}" fill="#07080b"/><path d="${ar.well}" fill="#07080b"/>
<path d="${side}" fill="url(#bs)"/>
${clad}
<path d="${af.flare}${ar.flare}" stroke="${shade(b, 0.35)}" stroke-width="2" fill="none" opacity=".6"/>
<path d="M${nT[0] + 10} ${nT[1] + 8}L${cB[0]} ${cB[1] + 10}L${tE[0] - 2} ${tE[1] + 8}" stroke="${shade(b, 0.6)}" stroke-width="2.5" fill="none" opacity=".7" stroke-linecap="round"/>
<path d="M${nT[0] + 14} ${nT[1] + 24}L${tE[0]} ${tE[1] + 22}L${tE[0]} ${tE[1] + 30}L${nT[0] + 16} ${nT[1] + 40}Z" fill="url(#rf)" opacity=".5"/>
<path d="${front}" fill="url(#bf)"/>
<path d="${hood}" fill="url(#bh)" stroke="url(#bh)" stroke-width="2" stroke-linejoin="round"/>
<path d="M${fT[0] + W * 0.3} ${fT[1] - 4}L${wF[0] + 40} ${wF[1] + 2}L${wF[0] + 60} ${wF[1] + 4}L${fT[0] + W * 0.55} ${fT[1] - 1}Z" fill="#fff" opacity=".28"/>
<path d="${wind}" fill="url(#gl)" stroke="${shade(b, -0.45)}" stroke-width="3" stroke-linejoin="round"/>
<path d="M${wF[0] + 18} ${wF[1] - 4}L${rF[0] + 22} ${rF[1] + 4}L${rF[0] + 44} ${rF[1] + 5}L${wF[0] + 46} ${wF[1]}Z" fill="#fff" opacity=".18"/>
<path d="${roof}" fill="${shade(b, 0.3)}" stroke="${shade(b, 0.3)}" stroke-width="3" stroke-linejoin="round"/>
${rails}${spoiler}
<path d="${win}" fill="url(#gl)" stroke="#0b1220" stroke-width="3" stroke-linejoin="round"/>
<path d="M${r1(bx + 3)} ${r1(by1)}L${r1(bx)} ${r1(by2)}" stroke="#0b1220" stroke-width="7"/>
<path d="M${wb[0] + 30} ${wb[1] - 4}L${rN[0] + 30} ${rN[1] + 7}L${rN[0] + 48} ${rN[1] + 7}L${wb[0] + 50} ${wb[1] - 6}Z" fill="#fff" opacity=".14"/>
<path d="M${pt(wb)}L${pt(wrb)}" stroke="#cbd5e1" stroke-width="2" opacity=".8"/>
<path d="M${wN[0] + 14} ${wN[1] + 4}L${wN[0] + 12} ${r1(sillY(wN[0]) - 8)}M${r1(bx)} ${r1(by2 + 3)}L${r1(bx - 1)} ${r1(dy1 - 6)}M${wrb[0] + 4} ${wrb[1] + 3}L${wrb[0] + 8} ${r1(sillY(wrb[0]) - 12)}" stroke="${shade(b, -0.55)}" stroke-width="1.6" fill="none" opacity=".75"/>
<path d="M${r1(bx - 34)} ${r1(by2 + 14)}h16M${r1(wrb[0] - 34)} ${wrb[1] + 14}h16" stroke="${shade(b, -0.5)}" stroke-width="3.5" stroke-linecap="round"/>
${mirror}
<path d="M${tE[0] - 6} ${tE[1] + 4}L${tE[0] + 3} ${tE[1] + 6}L${tB[0] - 1} ${tE[1] + 24}L${tE[0] - 8} ${tE[1] + 20}Z" fill="#dc2626"/>
<path d="${gr}" fill="#0b0f17" stroke="${shade(b, -0.5)}" stroke-width="2" stroke-linejoin="round"/>
<path d="${slats}" stroke="#64748b" stroke-width="1.4"/>
<path d="${intake}" fill="#0b0f17"/>
<path d="M${pt(F(0.04, 0.92))}Q${pt(F(0.5, 1.02))} ${pt(F(0.98, 0.94))}" stroke="#0b0f17" stroke-width="4" fill="none" opacity=".7"/>
<path d="${hlN}" fill="url(#hl)" stroke="#1e293b" stroke-width="1.5" stroke-linejoin="round"/>
<path d="${hlF}" fill="url(#hl)" stroke="#1e293b" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M${pt(F(0.7, hy + 0.1))}L${pt(F(1, hy + 0.09))}" stroke="#e0f2fe" stroke-width="2" opacity=".9"/>
${wheel(fw, "a", P.suv ? 0.74 : 0.7)}
${wheel(rw, "b", 0.62)}`;
};

/* ---------- armchairs ---------- */
const chairModern = (c: string, l: string) => `
<path d="M128 300L118 356M272 300L282 356" stroke="${shade(l, -0.2)}" stroke-width="9" stroke-linecap="round"/>
<path d="M92 300L74 366M308 300L326 366" stroke="url(#lg)" stroke-width="13" stroke-linecap="round"/>
<path d="M124 86Q200 66 276 86Q302 92 302 120L296 254L104 254L98 120Q98 92 124 86Z" fill="url(#cb)"/>
<path d="M150 88V246M200 80V246M250 88V246" stroke="${shade(c, -0.25)}" stroke-width="2.5" opacity=".7"/>
<path d="M175 86V246M225 84V246" stroke="${shade(c, 0.25)}" stroke-width="2" opacity=".4"/>
<path d="M108 226L292 226L310 262L90 262Z" fill="${shade(c, 0.2)}" stroke="${shade(c, 0.2)}" stroke-width="10" stroke-linejoin="round"/>
<rect x="88" y="256" width="224" height="46" rx="16" fill="url(#cs)"/>
<path d="M104 266H296" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>
<rect x="56" y="168" width="52" height="138" rx="24" fill="url(#ca)"/>
<rect x="292" y="168" width="52" height="138" rx="24" fill="url(#ca)"/>
<rect x="52" y="160" width="60" height="18" rx="9" fill="url(#lg)"/>
<rect x="288" y="160" width="60" height="18" rx="9" fill="url(#lg)"/>
<rect x="60" y="298" width="280" height="12" rx="6" fill="url(#lg)"/>`;

const chairVelvet = (c: string) => {
  let tufts = "";
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 5 - (r % 2); i++) {
      const x = 128 + i * 36 + (r % 2) * 18, y = 120 + r * 38;
      tufts += `<path d="M${x - 18} ${y - 19}L${x} ${y}L${x + 18} ${y - 19}M${x - 18} ${y + 19}L${x} ${y}L${x + 18} ${y + 19}" stroke="${shade(c, -0.35)}" stroke-width="1.6" fill="none" opacity=".6"/><circle cx="${x}" cy="${y}" r="3.6" fill="${shade(c, -0.45)}"/><circle cx="${x - 1}" cy="${y - 1}" r="1.3" fill="${shade(c, 0.4)}"/>`;
    }
  return `
<path d="M100 318L96 346M300 318L304 346M150 318V338M250 318V338" stroke="url(#lg)" stroke-width="10" stroke-linecap="round"/>
<path d="M100 120C100 72 300 72 300 120L304 250L96 250Z" fill="url(#cb)"/>
<clipPath id="bk"><path d="M100 120C100 72 300 72 300 120L304 250L96 250Z"/></clipPath>
<g clip-path="url(#bk)">${tufts}</g>
<path d="M104 236L296 236L314 262L86 262Z" fill="${shade(c, 0.18)}" stroke="${shade(c, 0.18)}" stroke-width="12" stroke-linejoin="round"/>
<rect x="84" y="256" width="232" height="66" rx="22" fill="url(#cs)"/>
<path d="M100 268H300" stroke="#fff" stroke-opacity=".3" stroke-width="4" stroke-linecap="round"/>
<path d="M46 176C46 146 112 146 114 176L116 312Q116 324 104 324L58 324Q46 324 46 312Z" fill="url(#ca)"/>
<path d="M354 176C354 146 288 146 286 176L284 312Q284 324 296 324L342 324Q354 324 354 312Z" fill="url(#ca)"/>
<ellipse cx="80" cy="176" rx="30" ry="24" fill="${shade(c, 0.1)}"/><path d="M80 176m-3 0a4 4 0 1 1 7 1a9 8 0 1 1 -17 -2a15 13 0 1 1 30 2a21 18 0 0 1 -27 15" stroke="${shade(c, -0.35)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<ellipse cx="320" cy="176" rx="30" ry="24" fill="${shade(c, 0.1)}"/><path d="M320 176m-3 0a4 4 0 1 1 7 1a9 8 0 1 1 -17 -2a15 13 0 1 1 30 2a21 18 0 0 1 -27 15" stroke="${shade(c, -0.35)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<path d="M58 210Q62 270 60 310M342 210Q338 270 340 310" stroke="#fff" stroke-opacity=".22" stroke-width="6" stroke-linecap="round" fill="none"/>`;
};

const chairRattan = (c: string) => `
<path d="M112 300L100 360M288 300L300 360M146 300L140 346M254 300L260 346" stroke="url(#lg)" stroke-width="9" stroke-linecap="round"/>
<path d="M200 46C306 46 340 128 328 262L72 262C60 128 94 46 200 46Z" fill="url(#wv)" stroke="${shade(c, -0.12)}" stroke-width="12"/>
<path d="M200 46C306 46 340 128 328 262L72 262C60 128 94 46 200 46Z" fill="url(#cb)" opacity=".35"/>
<path d="M60 200Q60 170 90 172L96 300L60 300Z" fill="url(#wv)" stroke="${shade(c, -0.12)}" stroke-width="10" stroke-linejoin="round"/>
<path d="M340 200Q340 170 310 172L304 300L340 300Z" fill="url(#wv)" stroke="${shade(c, -0.12)}" stroke-width="10" stroke-linejoin="round"/>
<rect x="124" y="120" width="152" height="118" rx="34" fill="url(#pl)"/>
<path d="M136 180Q200 196 264 180" stroke="${shade(c, 0.45)}" stroke-width="2.5" fill="none" opacity=".7"/>
<path d="M98 238L302 238L318 262L82 262Z" fill="${shade(c, 0.88)}" stroke="${shade(c, 0.88)}" stroke-width="12" stroke-linejoin="round"/>
<rect x="76" y="256" width="248" height="42" rx="16" fill="url(#pl)"/>
<path d="M90 263H310" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
<rect x="58" y="292" width="284" height="14" rx="7" fill="${shade(c, -0.15)}"/>`;

const chairLounge = (c: string) => `
<path d="M178 300L170 336M178 336L104 350M178 336L246 352M178 336L200 364M178 336L140 362" stroke="#2b2f36" stroke-width="7" stroke-linecap="round"/>
<path d="M330 312L326 336M326 336L290 352M326 336L370 350M326 336L338 362" stroke="#2b2f36" stroke-width="6" stroke-linecap="round"/>
<g transform="rotate(-16 120 200)"><rect x="70" y="56" width="92" height="94" rx="22" fill="url(#lg)"/><rect x="78" y="62" width="76" height="80" rx="18" fill="url(#cb)"/>
<rect x="70" y="146" width="92" height="140" rx="22" fill="url(#lg)"/><rect x="78" y="150" width="76" height="128" rx="18" fill="url(#cb)"/>
<path d="M96 110h40M96 200h40M96 240h40" stroke="${shade(c, -0.3)}" stroke-width="2" opacity=".6"/></g>
<path d="M128 268L270 260Q290 260 290 280L288 296Q286 312 266 312L130 316Q112 316 112 298Z" fill="url(#lg)"/>
<path d="M136 258L262 250Q280 250 280 268L278 282Q276 292 262 292L136 296Q120 296 120 282L122 270Q124 258 136 258Z" fill="url(#cs)"/>
<path d="M136 262L262 255" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>
<path d="M150 210L270 214Q286 216 284 228L282 236L150 230Z" fill="url(#lg)"/>
<path d="M156 202L262 206Q276 208 274 218L150 216Z" fill="url(#ca)"/>
<path d="M240 236L236 262" stroke="#2b2f36" stroke-width="6" stroke-linecap="round"/>
<path d="M290 296L366 296Q382 296 382 312L380 318Q378 326 364 326L292 326Q278 326 278 314L280 306Q282 296 290 296Z" fill="url(#lg)"/>
<path d="M294 280L360 280Q378 280 378 296L376 302Q374 310 360 310L296 310Q280 310 280 300L282 292Q284 280 294 280Z" fill="url(#cs)"/>
<path d="M298 286H362" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>`;

/* ---------- art ---------- */
export const ART: Record<string, Art> = {
  /* ================= FOOD ================= */
  latte: {
    vb: [400, 400],
    defaults: { cup: "#ffffff", coffee: "#a16207" },
    draw: (o) => {
      const cup = o.cup, cf = o.coffee, foam = mix(cf, "#fffaf0", 0.9), bean = shade(cf, -0.58);
      const heart = (s: number, dy: number) =>
        `M0 ${40 * s + dy}C${-58 * s} ${8 * s + dy} ${-62 * s} ${-36 * s + dy} ${-30 * s} ${-40 * s + dy}C${-14 * s} ${-42 * s + dy} ${-4 * s} ${-32 * s + dy} 0 ${-20 * s + dy}C${4 * s} ${-32 * s + dy} ${14 * s} ${-42 * s + dy} ${30 * s} ${-40 * s + dy}C${62 * s} ${-36 * s + dy} ${58 * s} ${8 * s + dy} 0 ${40 * s + dy}Z`;
      const beanAt = (x: number, y: number, r: number) =>
        `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="16" ry="11" fill="url(#bn)"/><path d="M-13 1C-5 -5 5 6 13 -1" stroke="${shade(bean, -0.6)}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>`;
      return `<defs>
${lg("cg", [[0, shade(cup, -0.3)], [0.28, cup], [0.55, shade(cup, -0.03)], [1, shade(cup, -0.36)]], 0, 0, 1, 0)}
${lg("sc", [[0, cup], [1, shade(cup, -0.2)]])}
${rg("cf", [[0, shade(cf, 0.25)], [0.65, cf], [1, shade(cf, -0.45)]])}
${rg("bn", [[0, shade(bean, 0.4)], [1, bean]], 0.35, 0.3, 0.75)}
${lg("st", [[0, shade(cup, -0.35), 0], [0.6, shade(cup, -0.3), 0.55], [1, shade(cup, -0.3), 0]])}
</defs>
${shadow(200, 330, 190, 32, 0.35)}
<g fill="none" stroke="url(#st)" stroke-linecap="round"><path d="M165 140C145 112 185 94 165 64S180 32 170 20" stroke-width="9"/><path d="M215 134C198 106 238 88 218 58S232 28 224 16" stroke-width="7"/><path d="M252 142C242 122 264 108 254 86" stroke-width="6"/></g>
<ellipse cx="200" cy="306" rx="172" ry="46" fill="${shade(cup, -0.32)}"/>
<ellipse cx="200" cy="299" rx="172" ry="44" fill="url(#sc)"/>
<ellipse cx="200" cy="297" rx="116" ry="27" fill="${shade(cup, -0.1)}"/>
<ellipse cx="206" cy="300" rx="106" ry="20" fill="#000" opacity=".14"/>
<path d="M296 190C362 180 366 262 280 268" fill="none" stroke="${shade(cup, -0.25)}" stroke-width="22" stroke-linecap="round"/>
<path d="M296 189C354 181 357 257 282 264" fill="none" stroke="${cup}" stroke-width="12" stroke-linecap="round"/>
<path d="M92 172C92 256 132 302 200 302C268 302 308 256 308 172Z" fill="url(#cg)"/>
<path d="M114 198C118 248 138 278 168 292" stroke="#fff" stroke-opacity=".6" stroke-width="8" fill="none" stroke-linecap="round"/>
<ellipse cx="200" cy="172" rx="108" ry="32" fill="${shade(cup, -0.06)}"/>
<ellipse cx="200" cy="173.5" rx="99" ry="27.5" fill="url(#cf)"/>
<g transform="translate(200 177) scale(1 .5)">
<path d="${heart(0.95, 0)}" fill="${foam}"/>
<path d="${heart(0.62, -7)}" fill="${shade(cf, 0.3)}"/>
<path d="${heart(0.38, -11)}" fill="${foam}"/>
<path d="M0 -46V36" stroke="${shade(cf, 0.2)}" stroke-width="3" stroke-linecap="round"/>
</g>
<ellipse cx="200" cy="172" rx="107" ry="31.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
${beanAt(54, 350, -25)}${beanAt(90, 370, 18)}${beanAt(330, 364, 30)}${beanAt(360, 342, -15)}`;
    },
  },

  burger: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const R = rnd(7);
      const seeds = [[150, 112, -25], [192, 100, 5], [236, 106, 28], [272, 126, 45], [124, 140, -40], [170, 130, -12], [214, 128, 16], [254, 148, 35], [296, 160, 55], [104, 176, -55], [146, 162, -18], [192, 154, 2], [236, 162, 22], [276, 186, 42], [172, 186, -6], [218, 190, 12], [126, 196, -30], [310, 196, 60]];
      let tex = "";
      for (let i = 0; i < 46; i++) {
        const x = 72 + R() * 256, y = 264 + R() * 38;
        tex += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(2 + R() * 5)}" ry="${r1(1.5 + R() * 3)}" fill="${R() > 0.5 ? "#2a1208" : "#8d522c"}" opacity=".75"/>`;
      }
      let let_ = "M50 204L350 204L356 222";
      for (let x = 356, i = 0; x > 48; x -= 22, i++) let_ += `Q${x - 11} ${i % 2 ? 238 : 244} ${Math.max(44, x - 22)} ${i % 2 ? 224 : 219}`;
      let_ += "Z";
      return `<defs>
${rg("tb", [[0, "#fad58c"], [0.45, "#e5973a"], [1, "#a4521a"]], 0.4, 0.22, 0.85)}
${lg("bb", [[0, "#e7a246"], [1, "#9c5218"]])}
${rg("pt", [[0, "#7b4425"], [0.7, "#4a2410"], [1, "#2c1407"]], 0.5, 0.3, 0.8)}
${lg("ch", [[0, "#fde047"], [1, "#f59e0b"]])}
${lg("tm", [[0, "#f87171"], [1, "#b91c1c"]])}
${lg("lt", [[0, "#d9f99d"], [0.4, "#84cc16"], [1, "#3f6212"]])}
</defs>
${shadow(200, 350, 176, 22, 0.45)}
<path d="M64 302C64 296 336 296 336 302L332 322C328 344 292 354 200 354C108 354 72 344 68 322Z" fill="url(#bb)"/>
<path d="M64 302C64 296 336 296 336 302L335 309C300 303 100 303 65 309Z" fill="#f6d9a6"/>
<path d="M90 336C140 346 260 346 310 336" stroke="#fff" stroke-opacity=".18" stroke-width="4" fill="none"/>
<rect x="56" y="252" width="288" height="58" rx="28" fill="url(#pt)"/>
${tex}
<path d="M84 264C150 256 250 256 316 264" stroke="#a5653c" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
<path d="M56 250L344 250L352 286Q353 294 346 291L326 270L300 272L294 294Q290 302 285 294L280 272L214 274L206 306Q201 316 195 306L188 274L130 272L122 290Q118 298 113 290L108 270L74 270L54 294Q47 298 48 290Z" fill="url(#ch)"/>
<path d="M70 256H330" stroke="#fef9c3" stroke-width="3" opacity=".7" stroke-linecap="round"/>
<rect x="64" y="228" width="272" height="26" rx="13" fill="url(#tm)"/>
<path d="M88 241h40M156 239h52M236 241h64" stroke="#fecaca" stroke-width="5" stroke-linecap="round" opacity=".55"/>
<path d="M96 231c22-9 52-9 74 0M224 231c22-9 52-9 74 0" stroke="#faf5ff" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M96 231c22-9 52-9 74 0M224 231c22-9 52-9 74 0" stroke="#c4b5fd" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="${let_}" fill="url(#lt)"/>
<path d="M76 222l-5 14M118 224l-3 16M162 222l-1 18M206 224l2 16M252 222l4 16M296 222l6 15M336 220l8 12" stroke="#ecfccb" stroke-width="2.2" opacity=".75"/>
<path d="M60 216C56 142 118 86 200 86C282 86 344 142 340 216C300 230 100 230 60 216Z" fill="url(#tb)"/>
<path d="M60 216C100 230 300 230 340 216L341 207C300 222 100 222 59 207Z" fill="#8e4513" opacity=".45"/>
${seeds.map(([x, y, r]) => `<ellipse rx="6.5" ry="3.3" fill="#fff6e0" stroke="#e2bd80" stroke-width=".8" transform="translate(${x} ${y}) rotate(${r})"/>`).join("")}
<ellipse cx="150" cy="128" rx="58" ry="22" transform="rotate(-24 150 128)" fill="#fff" opacity=".2"/>`;
    },
  },

  fruits: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const grapes = [[118, 120], [148, 112], [176, 124], [102, 148], [132, 144], [162, 150], [190, 150], [116, 174], [146, 176], [176, 178], [130, 202], [160, 204], [146, 228]];
      const straw = (x: number, y: number, r: number, s: number) => {
        const sd = [[-12, -14], [0, -18], [12, -14], [-16, 0], [-4, -4], [8, -2], [18, 2], [-10, 14], [2, 12], [12, 16], [-4, 28], [6, 30]];
        return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 -30C30 -34 42 -8 32 16C24 36 8 48 0 50C-8 48 -24 36 -32 16C-42 -8 -30 -34 0 -30Z" fill="url(#sb)"/>
${sd.map(([a, c]) => `<ellipse cx="${a}" cy="${c}" rx="1.6" ry="2.6" fill="#fde68a"/>`).join("")}
<ellipse cx="-14" cy="-12" rx="7" ry="12" fill="#fff" opacity=".28" transform="rotate(20 -14 -12)"/>
<path d="M0 -30L-20 -40L-8 -30L-14 -48L0 -34L8 -50L8 -32L24 -40L10 -28Z" fill="#22a34a" stroke="#15803d" stroke-width="2" stroke-linejoin="round"/></g>`;
      };
      const blue = (x: number, y: number, r: number) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#bl)"/><path d="M${x - 3} ${y - r * 0.55}l3 2 3-2-1 3.5 3 1.5h-4l-1 3-1-3h-4l3-1.5z" fill="#1e1b4b" opacity=".8"/>`;
      let seg = "";
      for (let i = 0; i < 10; i++) {
        const a = (i * 36 * Math.PI) / 180;
        seg += `M160 272L${r1(160 + Math.cos(a) * 62)} ${r1(272 + Math.sin(a) * 56)}`;
      }
      const R = rnd(3);
      let ves = "";
      for (let i = 0; i < 26; i++) {
        const a = R() * 6.28, d = 14 + R() * 42;
        ves += `<ellipse cx="${r1(160 + Math.cos(a) * d)}" cy="${r1(272 + Math.sin(a) * d * 0.9)}" rx="2.5" ry="4" transform="rotate(${r1((a * 180) / Math.PI + 90)} ${r1(160 + Math.cos(a) * d)} ${r1(272 + Math.sin(a) * d * 0.9)})" fill="#fed7aa" opacity=".7"/>`;
      }
      return `<defs>
${rg("gp", [[0, "#c084fc"], [0.45, "#7e22ce"], [1, "#3b0764"]], 0.35, 0.3, 0.7)}
${rg("ap", [[0, "#fca5a5"], [0.35, "#ef4444"], [0.8, "#b91c1c"], [1, "#7f1d1d"]], 0.36, 0.3, 0.75)}
${rg("of", [[0, "#fff7ed"], [0.15, "#fdba74"], [0.85, "#f97316"], [1, "#ea580c"]])}
${lg("op", [[0, "#fb923c"], [1, "#c2410c"]])}
${rg("sb", [[0, "#f87171"], [0.6, "#dc2626"], [1, "#991b1b"]], 0.4, 0.35, 0.7)}
${rg("bl", [[0, "#818cf8"], [0.5, "#3730a3"], [1, "#1e1b4b"]], 0.35, 0.3, 0.75)}
${lg("lf", [[0, "#4ade80"], [1, "#15803d"]])}
</defs>
${shadow(200, 342, 186, 26, 0.4)}
<path d="M150 108C146 92 154 80 168 72" stroke="#6b4423" stroke-width="5" fill="none" stroke-linecap="round"/>
${grapes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="url(#gp)"/><circle cx="${x - 6}" cy="${y - 7}" r="4" fill="#fff" opacity=".45"/>`).join("")}
${leafAt(206, 132, -60, 70, 22, "url(#lf)", "#bbf7d0")}${leafAt(212, 136, -120, 58, 18, "url(#lf)", "#bbf7d0")}
<path d="M284 126C320 104 370 132 366 194C362 254 322 278 302 270C294 266 278 266 270 270C250 278 206 254 204 194C202 132 250 104 284 126Z" fill="url(#ap)"/>
<ellipse cx="250" cy="162" rx="16" ry="30" transform="rotate(25 250 162)" fill="#fff" opacity=".3"/>
<path d="M284 128C284 112 288 100 296 92" stroke="#6b4423" stroke-width="5" fill="none" stroke-linecap="round"/>
${leafAt(292, 104, -20, 44, 14, "url(#lf)", "#bbf7d0")}
<ellipse cx="164" cy="284" rx="82" ry="72" fill="url(#op)"/>
<ellipse cx="160" cy="272" rx="80" ry="72" fill="#fb923c"/>
<ellipse cx="160" cy="272" rx="72" ry="65" fill="#fff4e0"/>
<ellipse cx="160" cy="272" rx="66" ry="59" fill="url(#of)"/>
${ves}
<path d="${seg}" stroke="#fff7ed" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
<ellipse cx="160" cy="272" rx="9" ry="8" fill="#fff7ed"/>
${straw(282, 300, 18, 1)}${straw(348, 268, 38, 0.82)}${straw(232, 336, -16, 0.72)}
${blue(70, 318, 15)}${blue(98, 336, 14)}${blue(60, 290, 13)}${blue(330, 340, 14)}${blue(364, 324, 13)}
${leafAt(70, 270, -150, 46, 14, "url(#lf)", "#bbf7d0")}`;
    },
  },

  icedrink: {
    vb: [400, 400],
    defaults: { drink: "#b45309" },
    draw: (o) => {
      const d = o.drink;
      const cubes = [[152, 104, -14], [212, 94, 12], [252, 122, -8], [168, 154, 22], [230, 172, -16], [190, 222, 8]];
      const cube = (x: number, y: number, r: number) =>
        `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-26" y="-26" width="52" height="52" rx="9" fill="#fff" fill-opacity=".38" stroke="#fff" stroke-opacity=".8" stroke-width="2"/><path d="M-18 -16Q-18 -20 -12 -20H8" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".9" fill="none"/><path d="M-26 -10L-14 -26M10 26L26 10" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></g>`;
      const R = rnd(11);
      let drops = "";
      for (let i = 0; i < 18; i++) {
        const y = 130 + R() * 200, half = 79 - ((y - 64) / 296) * 18, x = 200 + (R() * 2 - 1) * (half - 10), s = 2 + R() * 3.5;
        drops += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(s)}" ry="${r1(s * 1.3)}" fill="#fff" fill-opacity=".55" stroke="${shade(d, -0.4)}" stroke-opacity=".35" stroke-width="1"/><circle cx="${r1(x - s * 0.3)}" cy="${r1(y - s * 0.4)}" r="${r1(s * 0.35)}" fill="#fff"/>`;
      }
      return `<defs>
<clipPath id="gc"><path d="M118 108L282 108L266 338Q264 347 254 347L146 347Q136 347 134 338Z"/></clipPath>
<clipPath id="go"><path d="M112 64L288 64L270 346Q268 360 252 360L148 360Q132 360 130 346Z"/></clipPath>
${lg("dk", [[0, shade(d, 0.25)], [0.5, d], [1, shade(d, -0.45)]])}
${lg("dh", [[0, "#000", 0.25], [0.25, "#fff", 0.15], [0.45, "#fff", 0], [0.85, "#000", 0.25]], 0, 0, 1, 0)}
${lg("gw", [[0, "#fff", 0.5], [0.2, "#fff", 0.1], [0.75, "#fff", 0.05], [1, "#fff", 0.4]], 0, 0, 1, 0)}
${rg("lm", [[0, "#fef9c3"], [0.75, "#fde047"], [1, "#facc15"]])}
</defs>
${shadow(200, 362, 118, 16, 0.4)}
<ellipse cx="200" cy="360" rx="80" ry="8" fill="${d}" opacity=".25"/>
<path d="M130 346Q132 360 148 360L252 360Q268 360 270 346Z" fill="#fff" opacity=".4"/>
<g clip-path="url(#gc)">
<rect x="100" y="100" width="200" height="260" fill="url(#dk)"/>
<path d="M232 340L250 100" stroke="#111827" stroke-width="12" opacity=".55"/>
${cubes.slice(2).map(([x, y, r]) => cube(x, y, r)).join("")}
<rect x="100" y="100" width="200" height="260" fill="url(#dh)"/>
</g>
<ellipse cx="200" cy="108" rx="82" ry="9" fill="${shade(d, 0.35)}" opacity=".85"/>
<g clip-path="url(#go)">${cubes.slice(0, 2).map(([x, y, r]) => cube(x, y, r)).join("")}${cube(252, 122, -8)}</g>
<path d="M248 112L268 6" stroke="#111827" stroke-width="12" stroke-linecap="round"/>
<path d="M245 108L264 8" stroke="#4b5563" stroke-width="3" stroke-linecap="round"/>
<path d="M112 64L288 64L270 346Q268 360 252 360L148 360Q132 360 130 346Z" fill="url(#gw)" stroke="#fff" stroke-opacity=".9" stroke-width="3"/>
<path d="M112 64L288 64L270 346Q268 360 252 360L148 360Q132 360 130 346Z" fill="none" stroke="#64748b" stroke-opacity=".45" stroke-width="1.2"/>
<ellipse cx="200" cy="64" rx="88" ry="9" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<ellipse cx="200" cy="64" rx="88" ry="9" fill="none" stroke="#64748b" stroke-width="1" opacity=".45"/>
<path d="M128 90L142 330" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".55"/>
<path d="M144 96L150 180" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
${drops}
<g transform="translate(286 70) rotate(-18)"><circle r="40" fill="#eab308"/><circle r="36" fill="#fef3c7"/><circle r="32" fill="url(#lm)"/>
${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M0 0L${r1(Math.cos(i * 0.785) * 30)} ${r1(Math.sin(i * 0.785) * 30)}" stroke="#fefce8" stroke-width="2.5"/>`).join("")}<circle r="5" fill="#fefce8"/></g>`;
    },
  },

  juice: {
    vb: [400, 400],
    defaults: { drink: "#84cc16" },
    draw: (o) => {
      const d = o.drink;
      const R = rnd(5);
      let fl = "";
      for (let i = 0; i < 70; i++) {
        const y = 125 + R() * 215, x = 200 + (R() * 2 - 1) * 66;
        fl += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.8 + R() * 1.6)}" fill="${R() > 0.4 ? shade(d, -0.5) : shade(d, 0.5)}" opacity=".6"/>`;
      }
      let foam = "M124 120";
      for (let x = 124, i = 0; x < 276; x += 19, i++) foam += `Q${x + 9.5} ${i % 2 ? 104 : 108} ${x + 19} 118`;
      const kiwiSeeds = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * 6.283, rr = 15 + (i % 2) * 4;
        return `<ellipse cx="${r1(Math.cos(a) * rr)}" cy="${r1(Math.sin(a) * rr)}" rx="1.4" ry="3" transform="rotate(${r1((a * 180) / Math.PI + 90)} ${r1(Math.cos(a) * rr)} ${r1(Math.sin(a) * rr)})" fill="#1c1917"/>`;
      }).join("");
      const lime = Array.from({ length: 8 }, (_, i) => `<path d="M0 0L${r1(Math.cos(i * 0.785) * 28)} ${r1(Math.sin(i * 0.785) * 28)}" stroke="#f7fee7" stroke-width="2.4"/>`).join("");
      return `<defs>
<clipPath id="jc"><path d="M126 106C124 200 130 288 147 334Q152 344 166 344L234 344Q248 344 253 334C270 288 276 200 274 106Z"/></clipPath>
${rg("sm", [[0, shade(d, 0.35)], [0.6, d], [1, shade(d, -0.3)]], 0.4, 0.4, 0.7)}
${lg("gw", [[0, "#fff", 0.55], [0.18, "#fff", 0.12], [0.8, "#fff", 0.05], [1, "#fff", 0.45]], 0, 0, 1, 0)}
${rg("kw", [[0, "#fefce8"], [0.25, "#d9f99d"], [0.8, "#65a30d"], [1, "#4d7c0f"]])}
${rg("lm", [[0, "#f7fee7"], [0.7, "#bef264"], [1, "#84cc16"]])}
${lg("lf", [[0, "#4ade80"], [1, "#166534"]])}
<pattern id="sp" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="14" height="14" fill="#fff"/><rect width="14" height="6" fill="${shade(d, -0.2)}"/></pattern>
</defs>
${shadow(200, 358, 150, 18, 0.4)}
<g transform="rotate(14 230 110)"><rect x="222" y="0" width="16" height="200" rx="3" fill="url(#sp)"/><rect x="222" y="0" width="5" height="200" fill="#000" opacity=".12"/></g>
<g clip-path="url(#jc)"><rect x="100" y="100" width="200" height="260" fill="url(#sm)"/>${fl}
<path d="${foam}L276 140L124 140Z" fill="${shade(d, 0.4)}"/><path d="M124 132H276" stroke="${shade(d, 0.4)}" stroke-width="16"/></g>
<path d="M118 92C116 190 122 290 140 340Q146 356 164 356L236 356Q254 356 260 340C278 290 284 190 282 92Z" fill="url(#gw)" stroke="#fff" stroke-opacity=".9" stroke-width="3"/>
<path d="M118 92C116 190 122 290 140 340Q146 356 164 356L236 356Q254 356 260 340C278 290 284 190 282 92Z" fill="none" stroke="#64748b" stroke-opacity=".4" stroke-width="1.2"/>
<ellipse cx="200" cy="92" rx="82" ry="9" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<ellipse cx="200" cy="92" rx="82" ry="9" fill="none" stroke="#64748b" stroke-width="1" opacity=".4"/>
<path d="M132 120C130 200 136 280 150 326" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".5" fill="none"/>
<g transform="translate(124 96) rotate(-20)"><circle r="44" fill="#78573a"/><circle r="40" fill="url(#kw)"/>${kiwiSeeds}<ellipse cx="0" cy="0" rx="7" ry="9" fill="#fefce8"/></g>
${leafAt(250, 98, -70, 48, 15, "url(#lf)", "#bbf7d0")}${leafAt(256, 100, -30, 40, 13, "url(#lf)", "#bbf7d0")}
${leafAt(96, 340, -170, 60, 18, "url(#lf)", "#bbf7d0")}${leafAt(104, 346, 160, 50, 15, "url(#lf)", "#bbf7d0")}
<g transform="translate(316 324) rotate(12)"><ellipse rx="36" ry="34" fill="#4d7c0f"/><ellipse rx="32" ry="30" fill="#ecfccb"/><ellipse rx="29" ry="27" fill="url(#lm)"/>${lime}<circle r="4" fill="#f7fee7"/></g>
<g transform="translate(70 318)"><ellipse rx="30" ry="28" fill="#78573a"/><ellipse rx="27" ry="25" fill="url(#kw)"/>${kiwiSeeds.replace(/rx="1.4" ry="3"/g, 'rx="1.1" ry="2.2"')}</g>`;
    },
  },

  pizza: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const cx = 194, cy = 200, rx = 164, ry = 122;
      const R = rnd(17);
      let blob = "";
      const N = 28;
      const pts = Array.from({ length: N }, (_, i) => {
        const a = (i / N) * 6.283, k = 0.86 + R() * 0.06;
        return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
      });
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % N], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        blob += i === 0 ? `M${pt([(pts[N - 1][0] + p[0]) / 2, (pts[N - 1][1] + p[1]) / 2])}Q${pt(p)} ${pt(m)}` : `Q${pt(p)} ${pt(m)}`;
      });
      blob += "Z";
      let spots = "";
      for (let i = 0; i < 26; i++) {
        const a = R() * 6.283, k = Math.sqrt(R()) * 0.8;
        spots += `<ellipse cx="${r1(cx + Math.cos(a) * rx * k)}" cy="${r1(cy + Math.sin(a) * ry * k)}" rx="${r1(4 + R() * 8)}" ry="${r1(3 + R() * 5)}" fill="${R() > 0.5 ? "#d97706" : "#fef3c7"}" opacity="${R() > 0.5 ? 0.45 : 0.7}"/>`;
      }
      const pep = [[-0.55, -0.35], [-0.05, -0.55], [0.45, -0.4], [-0.3, 0.05], [0.18, -0.05], [-0.65, 0.35], [-0.15, 0.55], [0.55, 0.15], [0.35, 0.55], [0.7, -0.05]];
      const pepS = pep.map(([u, v]) => {
        const x = cx + u * rx * 0.78, y = cy + v * ry * 0.78;
        return `<ellipse cx="${r1(x)}" cy="${r1(y + 3)}" rx="22" ry="16" fill="#7f1d1d" opacity=".5"/><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="22" ry="16" fill="url(#pp)"/><ellipse cx="${r1(x - 5)}" cy="${r1(y - 4)}" rx="3" ry="2" fill="#7f1d1d" opacity=".6"/><ellipse cx="${r1(x + 7)}" cy="${r1(y + 3)}" rx="2.5" ry="2" fill="#7f1d1d" opacity=".6"/><path d="M${r1(x - 16)} ${r1(y - 6)}Q${r1(x)} ${r1(y - 17)} ${r1(x + 14)} ${r1(y - 8)}" stroke="#fca5a5" stroke-width="2" fill="none" opacity=".6"/>`;
      }).join("");
      const basil = [[-0.2, -0.25, 30], [0.3, 0.3, -40], [-0.45, 0.18, 120], [0.1, 0.28, 200], [0.55, -0.2, 70], [-0.02, -0.82, 10]]
        .map(([u, v, r]) => leafAt(r1(cx + u * rx * 0.8), r1(cy + v * ry * 0.8), r, 30, 10, "url(#bs)", "#86efac"))
        .join("");
      const pz = `<ellipse cx="${cx}" cy="${cy + 10}" rx="${rx}" ry="${ry}" fill="#9a4f1c"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#cr)"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.9}" ry="${ry * 0.9}" fill="#c2410c"/>
<path d="${blob}" fill="url(#chz)"/>${spots}${pepS}${basil}`;
      const ang = [14, 28, 44, 60];
      const wedge = `M${cx} ${cy}` + ang.map((a) => `L${r1(cx + Math.cos((a * Math.PI) / 180) * 220)} ${r1(cy + Math.sin((a * Math.PI) / 180) * 170)}`).join("") + "Z";
      const dx = 38, dy = 32;
      let strings = "";
      [0.42, 0.7].forEach((k, i) => {
        [14, 60].forEach((a) => {
          const x = cx + Math.cos((a * Math.PI) / 180) * rx * k, y = cy + Math.sin((a * Math.PI) / 180) * ry * k;
          strings += `<path d="M${r1(x)} ${r1(y)}Q${r1(x + dx / 2 + (a > 30 ? -4 : 4))} ${r1(y + dy / 2 + 10 + i * 2)} ${r1(x + dx)} ${r1(y + dy)}" stroke="#fcd34d" stroke-width="${3.4 - i * 0.8}" fill="none" stroke-linecap="round"/>`;
        });
      });
      return `<defs>
${rg("bd", [[0, "#d6a16a"], [0.7, "#b47a45"], [1, "#8a5a30"]])}
${rg("cr", [[0, "#f6c27a"], [0.82, "#e09a4c"], [0.95, "#b86b2a"], [1, "#9a531f"]])}
${rg("chz", [[0, "#fef3c7"], [0.5, "#fde68a"], [1, "#fbbf24"]], 0.45, 0.4, 0.65)}
${rg("pp", [[0, "#ef4444"], [0.75, "#b91c1c"], [1, "#7f1d1d"]], 0.4, 0.35, 0.7)}
${lg("bs", [[0, "#22c55e"], [1, "#14532d"]])}
<clipPath id="rest"><path clip-rule="evenodd" d="M0 0H400V400H0Z${wedge}"/></clipPath>
<clipPath id="wd"><path d="${wedge}"/></clipPath>
</defs>
${shadow(204, 348, 190, 30, 0.4)}
<ellipse cx="200" cy="232" rx="194" ry="144" fill="#7c4a24"/>
<ellipse cx="200" cy="222" rx="194" ry="144" fill="url(#bd)"/>
<path d="M60 230Q200 300 340 230M90 180Q200 130 320 190M70 270Q200 340 330 280" stroke="#7c4a24" stroke-width="2" fill="none" opacity=".25"/>
<g clip-path="url(#rest)">${pz}</g>
<g clip-path="url(#wd)"><ellipse cx="${cx}" cy="${cy + 6}" rx="${rx + 4}" ry="${ry + 8}" fill="#3b2010" opacity=".45"/></g>
<g transform="translate(${dx} ${dy})"><g clip-path="url(#wd)">${pz}</g></g>
${strings}`;
    },
  },

  cake: {
    vb: [400, 400],
    defaults: { cream: "#fef3c7", sponge: "#78350f", fruit: "#dc2626" },
    draw: (o) => {
      const cr = o.cream, sp = o.sponge, fr = o.fruit, choc = shade(sp, -0.55);
      const top = 142, bot = 300, rxx = 120, ryy = 30, X0 = 200 - rxx, X1 = 200 + rxx;
      const band = (a: number, b: number) => `M${X0} ${a}A${rxx} ${ryy} 0 0 0 ${X1} ${a}L${X1} ${b}A${rxx} ${ryy} 0 0 1 ${X0} ${b}Z`;
      const fy = (x: number) => top + ryy * Math.sqrt(Math.max(0, 1 - ((x - 200) / rxx) ** 2));
      const drips = [[90, 30], [112, 52], [134, 24], [154, 62], [178, 36], [200, 70], [222, 30], [246, 56], [268, 26], [290, 44], [308, 22]];
      const lower: number[][] = [];
      for (let x = X0; x <= X1; x += 2) {
        let y = fy(x) + 12;
        drips.forEach(([c, L]) => {
          const t = Math.abs(x - c) / 8;
          if (t < 1) y = Math.max(y, fy(x) + 12 + L * Math.sqrt(1 - t ** 4));
        });
        lower.push([x, y]);
      }
      const dripPath = `M${X0} ${top}` + lower.map((p) => `L${pt(p)}`).join("") + `L${X1} ${top}Z`;
      const dol = [] as number[][];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 6.283 + 0.3;
        dol.push([200 + Math.cos(a) * rxx * 0.8, top + Math.sin(a) * ryy * 0.72]);
      }
      dol.sort((p, q) => p[1] - q[1]);
      const dollop = (x: number, y: number) =>
        `<g transform="translate(${r1(x)} ${r1(y)})"><ellipse cy="4" rx="17" ry="7" fill="${shade(cr, -0.25)}"/><path d="M-17 2C-19 -10 -8 -14 -4 -16C-2 -26 8 -26 6 -16C16 -14 20 -4 17 2C10 8 -10 8 -17 2Z" fill="url(#cm)"/><path d="M-9 -4C-4 -10 6 -10 10 -4" stroke="${shade(cr, -0.2)}" stroke-width="1.5" fill="none"/></g>`;
      const cherry = (x: number, y: number, s = 1) =>
        `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})"><path d="M2 -10C4 -24 12 -32 20 -36" stroke="#3f6212" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle r="12" fill="url(#fr)"/><circle cx="-4" cy="-4" r="3.5" fill="#fff" opacity=".6"/></g>`;
      let shav = "";
      const R = rnd(9);
      for (let i = 0; i < 18; i++) {
        const a = R() * 6.283, k = Math.sqrt(R()) * 0.55;
        shav += `<rect x="${r1(200 + Math.cos(a) * rxx * k)}" y="${r1(top + Math.sin(a) * ryy * k)}" width="5" height="2.4" rx="1" fill="${shade(sp, -0.3)}" transform="rotate(${r1(R() * 180)} ${r1(200 + Math.cos(a) * rxx * k)} ${r1(top + Math.sin(a) * ryy * k)})"/>`;
      }
      return `<defs>
${lg("sg", [[0, shade(sp, 0.1)], [1, shade(sp, -0.2)]])}
${lg("cyl", [[0, "#000", 0.35], [0.2, "#000", 0], [0.35, "#fff", 0.12], [0.5, "#fff", 0], [0.8, "#000", 0.15], [1, "#000", 0.45]], 0, 0, 1, 0)}
${rg("cm", [[0, "#ffffff"], [0.5, cr], [1, shade(cr, -0.2)]], 0.35, 0.3, 0.8)}
${lg("ch", [[0, shade(choc, 0.25)], [1, choc]])}
${rg("fr", [[0, shade(fr, 0.35)], [0.6, fr], [1, shade(fr, -0.45)]], 0.35, 0.3, 0.75)}
${lg("pl", [[0, "#ffffff"], [1, "#cbd5e1"]])}
</defs>
${shadow(200, 340, 186, 28, 0.35)}
<ellipse cx="200" cy="318" rx="168" ry="40" fill="#94a3b8"/>
<ellipse cx="200" cy="312" rx="168" ry="38" fill="url(#pl)"/>
<ellipse cx="200" cy="310" rx="140" ry="28" fill="#e2e8f0"/>
<path d="${band(top, bot)}" fill="url(#sg)"/>
<path d="${band(196, 210)}" fill="${cr}"/><path d="${band(250, 264)}" fill="${cr}"/>
<path d="${band(208, 211)}" fill="${shade(cr, -0.25)}" opacity=".6"/><path d="${band(262, 265)}" fill="${shade(cr, -0.25)}" opacity=".6"/>
<path d="${band(top, bot)}" fill="url(#cyl)"/>
<path d="${dripPath}" fill="url(#ch)"/>
${drips.map(([c, L]) => `<path d="M${c - 3} ${r1(fy(c) + 14)}V${r1(fy(c) + 6 + L)}" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/>`).join("")}
<ellipse cx="200" cy="${top}" rx="${rxx}" ry="${ryy}" fill="url(#ch)"/>
<ellipse cx="190" cy="${top - 6}" rx="70" ry="12" fill="#fff" opacity=".08"/>
${shav}
${dol.map(([x, y], i) => dollop(x, y) + (i % 2 === 0 ? cherry(x + 2, y - 18, 0.85) : "")).join("")}
${leafAt(196, top - 4, -150, 26, 9, "#22c55e", "#bbf7d0")}${leafAt(204, top - 4, -30, 26, 9, "#16a34a", "#bbf7d0")}
${cherry(190, top + 2)}${cherry(214, top + 8, 0.9)}`;
    },
  },

  bowl: {
    vb: [400, 400],
    defaults: { kind: "noodles" },
    draw: (o) => {
      const salad = o.kind === "salad";
      const rim = 186, rx = 164, ry = 50;
      const body = `M${200 - rx} ${rim}C${200 - rx + 6} ${rim + 100} ${130} ${rim + 152} 200 ${rim + 152}C270 ${rim + 152} ${200 + rx - 6} ${rim + 100} ${200 + rx} ${rim}A${rx} ${ry} 0 0 1 ${200 - rx} ${rim}Z`;
      const clip = `<clipPath id="fd"><path d="M${200 - rx + 6} ${rim}A${rx - 6} ${ry - 4} 0 0 0 ${200 + rx - 6} ${rim}L${200 + rx} 0H${200 - rx}Z"/></clipPath>`;
      let food = "";
      if (!salad) {
        let nd = "";
        for (let i = 0; i < 12; i++) {
          const y = 166 + i * 5.5, x0 = 70 + (i % 3) * 8;
          let d = `M${x0} ${y}`;
          for (let k = 0; k < 7; k++) d += `q12 ${k % 2 ? 9 : -9} 24 0`;
          nd += d;
        }
        const ring = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="5" fill="#dcfce7" stroke="#16a34a" stroke-width="2.6"/>`;
        food = `<ellipse cx="200" cy="${rim + 4}" rx="${rx - 14}" ry="${ry - 10}" fill="url(#br)"/>
<path d="M276 118L322 128L314 196L266 186Z" fill="url(#nr)"/><path d="M252 122L290 112L292 180L256 186Z" fill="#1f3a2a"/>
<path d="${nd}" stroke="#d29a3c" stroke-width="7.5" fill="none" stroke-linecap="round"/>
<path d="${nd}" stroke="#fde68a" stroke-width="4.5" fill="none" stroke-linecap="round"/>
<g transform="translate(150 152) rotate(-12)"><ellipse rx="40" ry="20" fill="#8b4a2b"/><ellipse rx="36" ry="17" fill="#d9a07a"/><path d="M-26 -2C-10 -10 10 6 28 -4M-20 8C-4 2 10 12 24 6" stroke="#fff4e6" stroke-width="2.4" fill="none" opacity=".8"/></g>
<g transform="translate(112 172) rotate(-30)"><ellipse rx="36" ry="18" fill="#8b4a2b"/><ellipse rx="32" ry="15" fill="#dba985"/><path d="M-22 0C-8 -8 8 6 24 -2" stroke="#fff4e6" stroke-width="2.2" fill="none" opacity=".8"/></g>
<g transform="translate(238 196)"><ellipse rx="34" ry="21" fill="#fafaf9"/><ellipse cx="-2" cy="1" rx="17" ry="12" fill="url(#yk)"/><ellipse cx="-12" cy="-8" rx="10" ry="4" fill="#fff" opacity=".8"/></g>
<g transform="translate(296 200) rotate(14)"><ellipse rx="32" ry="20" fill="#f5f5f4"/><ellipse cx="2" cy="1" rx="16" ry="11" fill="url(#yk)"/></g>
<g transform="translate(196 210)"><ellipse rx="22" ry="14" fill="#fff"/><path d="M0 0C4 -2 4 -6 0 -6C-6 -6 -8 0 -4 4C2 8 12 4 12 -2C12 -10 2 -12 -6 -10" stroke="#f472b6" stroke-width="2.6" fill="none"/></g>
${ring(176, 182)}${ring(186, 190)}${ring(214, 178)}${ring(268, 222)}${ring(130, 202)}${ring(146, 210)}${ring(318, 214)}${ring(226, 226)}${ring(96, 194)}
<path d="M140 52C126 72 160 88 146 112M210 46C196 66 230 82 216 106" stroke="#94a3b8" stroke-opacity=".45" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      } else {
        const lv = [[60, 180, -150, "#4d7c0f"], [90, 150, -120, "#65a30d"], [140, 130, -95, "#3f6212"], [200, 122, -80, "#65a30d"], [258, 128, -60, "#4d7c0f"], [318, 150, -40, "#84cc16"], [340, 180, -20, "#4d7c0f"], [110, 170, -140, "#7e22ce"], [290, 160, -30, "#3f6212"]] as [number, number, number, string][];
        const tom = (x: number, y: number) => `<g transform="translate(${x} ${y})"><circle r="17" fill="#b91c1c"/><circle r="14" fill="#ef4444"/><circle r="8" fill="#fca5a5"/><circle cx="-4" cy="-2" r="2" fill="#fef3c7"/><circle cx="3" cy="3" r="2" fill="#fef3c7"/><circle cx="-6" cy="-6" r="3" fill="#fff" opacity=".5"/></g>`;
        const cuc = (x: number, y: number) => `<g transform="translate(${x} ${y})"><ellipse rx="18" ry="13" fill="#166534"/><ellipse rx="15" ry="10.5" fill="#d9f99d"/><ellipse rx="8" ry="5.5" fill="#bef264"/></g>`;
        let avo = "";
        for (let i = 0; i < 6; i++) avo += `<g transform="translate(${150 + i * 12} ${178 - i * 2}) rotate(${-30 + i * 10})"><path d="M0 0C10 -30 40 -36 56 -20C40 -24 18 -18 0 0Z" fill="#365314"/><path d="M2 -2C12 -26 38 -32 52 -20C38 -20 18 -14 2 -2Z" fill="url(#av)"/></g>`;
        const chick = [[244, 168], [256, 176], [268, 166], [252, 158], [264, 180]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="url(#ck)"/>`).join("");
        food = `<ellipse cx="200" cy="${rim + 4}" rx="${rx - 14}" ry="${ry - 10}" fill="#3f6212"/>
${lv.map(([x, y, r, c]) => leafAt(x, y + 30, r, 70, 26, c, "#d9f99d")).join("")}
${leafAt(120, 196, -20, 80, 28, "#84cc16", "#ecfccb")}${leafAt(300, 200, -170, 80, 28, "#65a30d", "#ecfccb")}
${avo}${chick}
${tom(110, 200)}${tom(132, 218)}${tom(300, 196)}${cuc(222, 214)}${cuc(186, 222)}${cuc(330, 210)}
<g transform="translate(270 208)"><ellipse rx="30" ry="19" fill="#fafaf9"/><ellipse cx="-2" cy="1" rx="14" ry="10" fill="#facc15"/></g>
<g transform="translate(90 186) rotate(-20)"><ellipse rx="26" ry="16" fill="#f5f5f4"/><ellipse cx="2" cy="1" rx="12" ry="8" fill="#fbbf24"/></g>
${[[150, 200], [170, 206], [206, 196], [240, 196], [290, 216], [120, 226]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.3" fill="#fef3c7"/>`).join("")}`;
      }
      const bo = salad ? "#b7793f" : "#1c1917", bi = salad ? "#8a5428" : "#991b1b";
      return `<defs>${clip}
${lg("bw", [[0, shade(bo, 0.25)], [0.35, shade(bo, 0.1)], [0.6, bo], [1, shade(bo, -0.4)]], 0, 0, 1, 0.3)}
${lg("bi", [[0, shade(bi, -0.35)], [1, bi]])}
${rg("br", [[0, "#f59e0b"], [0.7, "#c2610c"], [1, "#7c2d12"]], 0.5, 0.4, 0.6)}
${lg("nr", [[0, "#1f3a2a"], [1, "#0b1a12"]], 0, 0, 1, 1)}
${rg("yk", [[0, "#f97316"], [0.6, "#fb923c"], [1, "#fbbf24"]])}
${lg("av", [[0, "#fef9c3"], [0.6, "#bef264"], [1, "#65a30d"]], 0, 1, 1, 0)}
${rg("ck", [[0, "#fef3c7"], [1, "#d6a35c"]], 0.35, 0.35, 0.7)}
${lg("cs", [[0, "#d6a35c"], [1, "#7c4a1e"]])}
</defs>
${shadow(200, rim + 156, 150, 20, 0.45)}
<path d="M150 ${rim + 146}L156 ${rim + 164}H244L250 ${rim + 146}Z" fill="${shade(bo, -0.3)}"/>
<ellipse cx="200" cy="${rim}" rx="${rx}" ry="${ry}" fill="url(#bi)"/>
<g clip-path="url(#fd)">${food}</g>
<path d="${body}" fill="url(#bw)"/>
${salad ? `<path d="M${200 - rx + 20} ${rim + 30}C120 ${rim + 70} 280 ${rim + 70} ${200 + rx - 20} ${rim + 30}M${200 - rx + 40} ${rim + 70}C140 ${rim + 100} 260 ${rim + 100} ${200 + rx - 40} ${rim + 70}" stroke="#7c4a1e" stroke-width="2" fill="none" opacity=".35"/>` : `<path d="M${200 - rx + 12} ${rim + 34}C130 ${rim + 72} 270 ${rim + 72} ${200 + rx - 12} ${rim + 34}" stroke="#b91c1c" stroke-width="5" fill="none"/><path d="M${200 - rx + 14} ${rim + 46}C130 ${rim + 84} 270 ${rim + 84} ${200 + rx - 14} ${rim + 46}" stroke="#b91c1c" stroke-width="2" fill="none" opacity=".8"/>`}
<path d="M${200 - rx} ${rim}A${rx} ${ry} 0 0 0 ${200 + rx} ${rim}" stroke="${shade(bo, 0.35)}" stroke-width="4" fill="none"/>
<path d="M${200 - rx + 30} ${rim + 40}C${200 - rx + 40} ${rim + 80} ${200 - rx + 70} ${rim + 110} ${200 - rx + 100} ${rim + 124}" stroke="#fff" stroke-opacity=".25" stroke-width="8" fill="none" stroke-linecap="round"/>
${salad
  ? `<g transform="rotate(-28 300 120)"><rect x="292" y="30" width="12" height="170" rx="6" fill="url(#cs)"/><ellipse cx="298" cy="190" rx="17" ry="27" fill="url(#cs)"/><ellipse cx="298" cy="192" rx="11" ry="19" fill="#7c4a1e" opacity=".35"/></g>`
  : `<path d="M96 94L384 168" stroke="#7c4a1e" stroke-width="9" stroke-linecap="round"/><path d="M86 108L382 180" stroke="#92582a" stroke-width="9" stroke-linecap="round"/><path d="M96 91L384 165M86 105L382 177" stroke="#d6a35c" stroke-width="2.5" stroke-linecap="round"/>`}`;
    },
  },

  /* ================= SALE / EVENTS ================= */
  bags: {
    vb: [400, 400],
    defaults: { c1: "#ef4444", c2: "#b91c1c", c3: "#ffffff" },
    draw: (o) => {
      const bag = (x: number, y: number, w: number, h: number, d: number, c: string, id: string) => {
        const dy = d * 0.42, rope = shade(c, -0.3);
        return `${lg(id, [[0, shade(c, 0.12)], [0.55, c], [1, shade(c, -0.2)]], 0, 0, 1, 1)}
<path d="M${x + d + w * 0.25} ${y - dy + 2}C${x + d + w * 0.25} ${y - dy - h * 0.38} ${x + d + w * 0.75} ${y - dy - h * 0.38} ${x + d + w * 0.75} ${y - dy + 2}" stroke="${shade(rope, -0.2)}" stroke-width="5" fill="none"/>
<path d="M${x + w} ${y}L${x + w + d} ${y - dy}L${x + w + d} ${y + h - dy}L${x + w} ${y + h}Z" fill="${shade(c, -0.28)}"/>
<path d="M${x + w} ${y}L${x + w + d * 0.5} ${y - dy * 0.5 + 14}L${x + w + d} ${y - dy}" fill="${shade(c, -0.4)}"/>
<path d="M${x} ${y}L${x + w} ${y}L${x + w + d} ${y - dy}L${x + d} ${y - dy}Z" fill="${shade(c, -0.55)}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>
<path d="M${x} ${y}h${w}v8h-${w}z" fill="${shade(c, -0.12)}"/>
<path d="M${x + w * 0.08} ${y + 14}L${x + w * 0.4} ${y + 14}L${x + w * 0.08} ${y + h * 0.75}Z" fill="#fff" opacity=".18"/>
<circle cx="${x + w * 0.28}" cy="${y + 16}" r="3.6" fill="${shade(c, -0.6)}"/><circle cx="${x + w * 0.72}" cy="${y + 16}" r="3.6" fill="${shade(c, -0.6)}"/>
<path d="M${x + w * 0.28} ${y + 16}C${x + w * 0.26} ${y - h * 0.42} ${x + w * 0.74} ${y - h * 0.42} ${x + w * 0.72} ${y + 16}" stroke="${rope}" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M${x + w * 0.3} ${y + 6}C${x + w * 0.3} ${y - h * 0.36} ${x + w * 0.5} ${y - h * 0.38} ${x + w * 0.6} ${y - h * 0.3}" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      };
      return `${shadow(205, 346, 182, 24, 0.4)}
${bag(132, 120, 150, 206, 48, o.c1, "ga")}
${bag(40, 194, 120, 150, 40, o.c2, "gb")}
${bag(232, 222, 108, 124, 36, o.c3, "gc")}`;
    },
  },

  clock: {
    vb: [400, 400],
    defaults: { body: "#ef4444" },
    draw: (o) => {
      const b = o.body, cx = 196, cy = 222;
      let ticks = "";
      for (let i = 0; i < 60; i++) {
        const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0, r0 = big ? 72 : 78;
        ticks += `<path d="M${r1(cx + Math.sin(a) * r0)} ${r1(cy - Math.cos(a) * r0)}L${r1(cx + Math.sin(a) * 84)} ${r1(cy - Math.cos(a) * 84)}" stroke="${big ? "#111827" : "#6b7280"}" stroke-width="${big ? 4.5 : 1.6}" stroke-linecap="round"/>`;
      }
      const hand = (deg: number, L: number, w: number, c: string) => {
        const a = (deg * Math.PI) / 180, s = Math.sin(a), co = -Math.cos(a), nx = -co, ny = s;
        return `<path d="M${r1(cx - s * 12 + nx * w)} ${r1(cy - co * 12 + ny * w)}L${r1(cx + s * L)} ${r1(cy + co * L)}L${r1(cx - s * 12 - nx * w)} ${r1(cy - co * 12 - ny * w)}Z" fill="${c}"/>`;
      };
      const bell = (x: number, y: number, r: number) =>
        `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 18V40" stroke="url(#cr)" stroke-width="9"/><path d="M-50 14C-50 -42 50 -42 50 14Z" fill="url(#bl)"/><ellipse cy="14" rx="52" ry="10" fill="${shade(b, -0.45)}"/><ellipse cy="12" rx="52" ry="8" fill="${shade(b, -0.1)}"/><path d="M-30 -8C-24 -26 -8 -30 4 -30" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/><circle cy="-32" r="7" fill="url(#cr)"/></g>`;
      return `<defs>
${rg("bd", [[0, shade(b, 0.4)], [0.5, b], [1, shade(b, -0.45)]], 0.35, 0.3, 0.8)}
${rg("bl", [[0, shade(b, 0.5)], [0.5, b], [1, shade(b, -0.4)]], 0.35, 0.25, 0.85)}
${lg("cr", [[0, "#f9fafb"], [0.5, "#9ca3af"], [1, "#e5e7eb"]], 0, 0, 1, 1)}
${rg("fc", [[0, "#ffffff"], [0.85, "#f8fafc"], [1, "#cbd5e1"]])}
</defs>
${shadow(204, 352, 150, 18, 0.45)}
<path d="M128 302L98 352M268 302L302 352" stroke="url(#cr)" stroke-width="14" stroke-linecap="round"/>
<path d="M150 98C156 50 244 50 250 98" stroke="url(#cr)" stroke-width="10" fill="none" stroke-linecap="round"/>
${bell(120, 108, -38)}${bell(276, 108, 38)}
<path d="M198 104V78" stroke="url(#cr)" stroke-width="6"/><path d="M174 78H222" stroke="url(#cr)" stroke-width="8" stroke-linecap="round"/>
<circle cx="${cx + 16}" cy="${cy + 2}" r="124" fill="${shade(b, -0.5)}"/>
<circle cx="${cx}" cy="${cy}" r="124" fill="url(#bd)"/>
<circle cx="${cx}" cy="${cy}" r="106" fill="url(#cr)"/>
<circle cx="${cx}" cy="${cy}" r="98" fill="url(#fc)"/>
${ticks}
${hand(-60, 46, 6, "#111827")}${hand(60, 70, 4.5, "#111827")}
<path d="M${cx + 30} ${cy + 52}L${cx - 40} ${cy - 69}" stroke="${shade(b, -0.1)}" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="8" fill="#111827"/><circle cx="${cx}" cy="${cy}" r="3.5" fill="${b}"/>
<path d="M${cx - 80} ${cy - 30}A86 86 0 0 1 ${cx - 20} ${cy - 84}" stroke="#fff" stroke-width="10" opacity=".7" fill="none" stroke-linecap="round"/>
<path d="M${cx - 112} ${cy - 40}A120 120 0 0 1 ${cx - 50} ${cy - 110}" stroke="#fff" stroke-opacity=".45" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    },
  },

  snowflake: {
    vb: [400, 400],
    defaults: { c: "#bae6fd" },
    draw: (o) => {
      const c = o.c, edge = shade(c, -0.5);
      const blade = (ax: number, ay: number, bx: number, by: number, w: number) => {
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), nx = (-dy / L) * w, ny = (dx / L) * w, mx = ax + dx * 0.4, my = ay + dy * 0.4;
        return `<path d="M${r1(ax)} ${r1(ay)}L${r1(mx + nx)} ${r1(my + ny)}L${r1(bx)} ${r1(by)}Z" fill="url(#il)"/><path d="M${r1(ax)} ${r1(ay)}L${r1(mx - nx)} ${r1(my - ny)}L${r1(bx)} ${r1(by)}Z" fill="url(#id)"/>`;
      };
      const br = (d: number, L: number, ang: number, w: number) => {
        const a = (ang * Math.PI) / 180;
        return blade(0, -d, -Math.sin(a) * L, -d - Math.cos(a) * L, w) + blade(0, -d, Math.sin(a) * L, -d - Math.cos(a) * L, w);
      };
      const arm = `${blade(0, -20, 0, -182, 12)}${br(46, 30, 55, 5)}${br(84, 58, 52, 7)}${br(128, 40, 50, 6)}${br(158, 18, 50, 4)}
<path d="M0 -100L9 -108L0 -116L-9 -108Z" fill="url(#il)"/><path d="M0 -100L9 -108L0 -116Z" fill="url(#id)"/>`;
      let hex6 = "";
      for (let i = 0; i < 6; i++) {
        const a1 = (i * 60 * Math.PI) / 180, a2 = ((i + 1) * 60 * Math.PI) / 180;
        hex6 += `<path d="M200 200L${r1(200 + Math.sin(a1) * 36)} ${r1(200 - Math.cos(a1) * 36)}L${r1(200 + Math.sin(a2) * 36)} ${r1(200 - Math.cos(a2) * 36)}Z" fill="url(#${i % 2 ? "id" : "il"})"/>`;
      }
      const spark = (x: number, y: number, s: number) =>
        `<g transform="translate(${x} ${y}) scale(${s})"><circle r="14" fill="url(#gl)"/><path d="M0 -18Q2 -2 18 0Q2 2 0 18Q-2 2 -18 0Q-2 -2 0 -18Z" fill="#fff"/></g>`;
      return `<defs>
${lg("il", [[0, "#ffffff"], [1, shade(c, 0.25)]], 0, 0, 1, 1)}
${lg("id", [[0, c], [1, shade(c, -0.32)]], 0, 0, 1, 1)}
${rg("gw", [[0, c, 0.55], [0.6, c, 0.18], [1, c, 0]])}
${rg("gl", [[0, "#ffffff", 0.9], [0.4, c, 0.6], [1, c, 0]])}
</defs>
<circle cx="200" cy="200" r="196" fill="url(#gw)"/>
<g stroke="${edge}" stroke-width="2.2" stroke-opacity=".55" stroke-linejoin="round">
${[0, 60, 120, 180, 240, 300].map((r) => `<g transform="translate(200 200) rotate(${r})">${arm}</g>`).join("")}
${hex6}
</g>
<path d="M200 178L219 189L219 211L200 222L181 211L181 189Z" fill="#fff" opacity=".7"/>
<circle cx="200" cy="200" r="8" fill="${shade(c, -0.15)}"/>
${spark(200, 20, 0.9)}${spark(342, 124, 0.6)}${spark(76, 296, 0.75)}${spark(300, 310, 0.5)}${spark(200, 200, 0.7)}`;
    },
  },

  xmastree: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const tiers = [[214, 300, 156], [156, 244, 124], [104, 188, 94], [56, 132, 62]];
      const tier = (top: number, bot: number, hw: number) => {
        let d = `M200 ${top}Q${200 - hw * 0.4} ${top + (bot - top) * 0.55} ${200 - hw} ${bot}`;
        const n = Math.round(hw / 28);
        for (let i = 0; i < n; i++) {
          const x1 = 200 - hw + (2 * hw * (i + 1)) / n, xm = 200 - hw + (2 * hw * (i + 0.5)) / n;
          d += `Q${r1(xm)} ${bot + 18} ${r1(x1)} ${bot}`;
        }
        return d + `Q${200 + hw * 0.4} ${top + (bot - top) * 0.55} 200 ${top}Z`;
      };
      const lights = (ti: number, yl: number, yr: number, sag: number) => {
        const [t, bt, hw] = tiers[ti], ex = (y: number) => ((hw * (y - t)) / (bt - t)) * 0.9;
        const x0 = 200 - ex(yl), x1 = 200 + ex(yr), cy = (yl + yr) / 2 + sag;
        let s = `<path d="M${r1(x0)} ${yl}Q200 ${cy} ${r1(x1)} ${yr}" stroke="#78350f" stroke-width="1.4" fill="none" opacity=".7"/>`;
        for (let i = 0; i <= 7; i++) {
          const q = 0.06 + (i / 7) * 0.88, x = (1 - q) ** 2 * x0 + 2 * q * (1 - q) * 200 + q * q * x1, y = (1 - q) ** 2 * yl + 2 * q * (1 - q) * cy + q * q * yr;
          s += `<circle cx="${r1(x)}" cy="${r1(y)}" r="9" fill="url(#lt)"/><circle cx="${r1(x)}" cy="${r1(y)}" r="3" fill="#fffbeb"/>`;
        }
        return s;
      };
      const baubles = [[150, 150, "#dc2626"], [246, 168, "#fbbf24"], [196, 210, "#2563eb"], [128, 228, "#fbbf24"], [276, 232, "#dc2626"], [168, 270, "#dc2626"], [236, 282, "#2563eb"], [92, 286, "#2563eb"], [312, 290, "#fbbf24"], [210, 110, "#dc2626"]] as [number, number, string][];
      const gift = (x: number, y: number, w: number, h: number, c: string, rb: string, id: string) =>
        `${lg(id, [[0, shade(c, 0.15)], [1, shade(c, -0.3)]], 0, 0, 1, 1)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#${id})"/><rect x="${x - 4}" y="${y}" width="${w + 8}" height="${h * 0.22}" rx="3" fill="${shade(c, 0.12)}"/><rect x="${x - 4}" y="${y + h * 0.2}" width="${w + 8}" height="3" fill="#000" opacity=".15"/>
<rect x="${x + w / 2 - 6}" y="${y}" width="12" height="${h}" fill="${rb}"/><path d="M${x + w / 2} ${y}C${x + w / 2 - 26} ${y - 26} ${x + w / 2 - 30} ${y - 2} ${x + w / 2} ${y}C${x + w / 2 + 30} ${y - 2} ${x + w / 2 + 26} ${y - 26} ${x + w / 2} ${y}Z" fill="${rb}" stroke="${shade(rb, -0.3)}" stroke-width="1.5"/><circle cx="${x + w / 2}" cy="${y}" r="5" fill="${shade(rb, -0.15)}"/>`;
      return `<defs>
${lg("tg", [[0, "#22a352"], [0.55, "#15803d"], [1, "#0b4d26"]], 0, 0, 1, 0.3)}
${lg("ts", [[0, "#000", 0], [0.7, "#000", 0], [1, "#000", 0.3]])}
${rg("lt", [[0, "#fef9c3", 1], [0.35, "#fde047", 0.9], [1, "#f59e0b", 0]])}
${rg("st", [[0, "#fff7cc"], [0.6, "#fcd34d"], [1, "#d97706"]], 0.4, 0.35, 0.7)}
${rg("sg", [[0, "#fde68a", 0.8], [1, "#fde68a", 0]])}
${lg("tk", [[0, "#92400e"], [1, "#451a03"]], 0, 0, 1, 0)}
</defs>
${shadow(200, 352, 180, 22, 0.4)}
<rect x="184" y="290" width="32" height="44" fill="url(#tk)"/>
${tiers.map(([t, b, w]) => `<path d="${tier(t, b, w)}" fill="url(#tg)"/><path d="${tier(t, b, w)}" fill="url(#ts)"/><path d="M${200 - w * 0.5} ${b - 8}Q${200 - w * 0.2} ${b - 16} ${200 - w * 0.05} ${b - 6}" stroke="#4ade80" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>`).join("")}
${lights(3, 112, 100, 14)}${lights(2, 168, 152, 18)}${lights(1, 226, 206, 22)}${lights(0, 284, 264, 22)}
${baubles.map(([x, y, c]) => `<path d="M${x} ${y - 13}V${y - 20}" stroke="#a16207" stroke-width="2"/><circle cx="${x}" cy="${y}" r="12" fill="${c}"/><circle cx="${x}" cy="${y}" r="12" fill="url(#bb)"/><circle cx="${x - 4}" cy="${y - 4}" r="3.5" fill="#fff" opacity=".75"/>`).join("")}
${rg("bb", [[0, "#fff", 0.35], [0.5, "#fff", 0], [1, "#000", 0.35]], 0.35, 0.3, 0.75)}
<circle cx="200" cy="44" r="40" fill="url(#sg)"/>
<path d="M200 12L209 34L233 35L214 50L221 73L200 60L179 73L186 50L167 35L191 34Z" fill="url(#st)" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
${gift(84, 300, 78, 56, "#dc2626", "#fbbf24", "g1")}${gift(232, 312, 70, 46, "#2563eb", "#f8fafc", "g2")}${gift(160, 326, 62, 34, "#fbbf24", "#dc2626", "g3")}`;
    },
  },

  pumpkin: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const face = "M110 198L172 198L148 146ZM228 198L290 198L254 146ZM182 242L218 242L200 212ZM96 254L148 268L150 286L174 286L176 272L224 272L226 286L250 286L252 268L304 254C296 304 260 328 216 334L214 314L186 314L184 334C140 328 104 304 96 254Z";
      const ribs = [[86, 60, 116], [314, 60, 116], [136, 82, 126], [264, 82, 126], [200, 82, 130]];
      return `<defs>
${rg("pk", [[0, "#fed7aa"], [0.3, "#fb923c"], [0.75, "#ea580c"], [1, "#9a3412"]], 0.4, 0.35, 0.75)}
${rg("gw", [[0, "#ffffff"], [0.3, "#fef9c3"], [0.6, "#fde047"], [0.85, "#fbbf24"], [1, "#f59e0b"]], 0.5, 0.55, 0.6)}
${lg("sm", [[0, "#65a30d"], [1, "#365314"]], 0, 0, 1, 0)}
<clipPath id="fc"><path d="${face}"/></clipPath>
<filter id="bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
${shadow(200, 352, 176, 24, 0.45)}
<ellipse cx="200" cy="356" rx="150" ry="18" fill="#f59e0b" opacity=".25"/>
${ribs.map(([x, rx, ry]) => `<ellipse cx="${x}" cy="228" rx="${rx}" ry="${ry}" fill="url(#pk)" stroke="#9a3412" stroke-opacity=".35" stroke-width="2"/>`).join("")}
<path d="M150 130Q200 120 250 130" stroke="#fff" stroke-opacity=".25" stroke-width="6" fill="none" stroke-linecap="round"/>
<ellipse cx="200" cy="106" rx="26" ry="9" fill="#7c2d12" opacity=".6"/>
<path d="M188 108C186 82 192 62 210 48L226 56C212 70 212 88 214 110Z" fill="url(#sm)"/>
<path d="M214 70C236 56 262 64 258 82C255 94 240 92 242 82" stroke="#4d7c0f" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="${face}" fill="#fcd34d" filter="url(#bl)" opacity=".75"/>
<g clip-path="url(#fc)"><rect x="80" y="130" width="240" height="220" fill="#fdba74"/><g transform="translate(2 6)"><path d="${face}" fill="url(#gw)"/></g></g>`;
    },
  },

  tulips: {
    vb: [400, 400],
    defaults: { petals: "#f43f5e" },
    draw: (o) => {
      const p = o.petals;
      const fl = [[200, 150, 0, 1, "a"], [126, 118, -22, 0.95, "b"], [174, 74, -8, 0.95, "a"], [236, 92, 10, 1, "b"], [292, 132, 24, 0.95, "a"], [150, 176, -14, 0.9, "b"], [256, 176, 16, 0.9, "a"]] as [number, number, number, number, string][];
      const head = (x: number, y: number, r: number, s: number, g: string) =>
        `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
<path d="M0 34C-24 32 -30 0 -24 -30C-12 -24 -4 -12 0 0C4 -12 12 -24 24 -30C30 0 24 32 0 34Z" fill="${shade(p, -0.35)}"/>
<path d="M0 36C-26 34 -34 6 -26 -32C-14 -26 -6 -10 -2 8Z" fill="url(#p${g})"/>
<path d="M0 36C26 34 34 6 26 -32C14 -26 6 -10 2 8Z" fill="url(#p${g})"/>
<path d="M0 38C-22 36 -24 6 -12 -22C-8 -32 -3 -38 0 -42C3 -38 8 -32 12 -22C24 6 22 36 0 38Z" fill="url(#q${g})"/>
<path d="M-6 -20C-10 0 -8 20 -2 30" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
      const stems = fl.map(([x, y, r, s]) => {
        const a = (r * Math.PI) / 180, bx = x - Math.sin(a) * 34 * s, by = y + Math.cos(a) * 34 * s, vx = 200 + (x - 200) * 0.12;
        return `<path d="M${r1(bx)} ${r1(by)}Q${r1(bx * 0.4 + vx * 0.6)} ${r1((by + 250) / 2 + 20)} ${r1(vx)} 262" stroke="url(#sg)" stroke-width="6" fill="none" stroke-linecap="round"/>`;
      }).join("");
      const lf = (d: string) => `<path d="${d}" fill="url(#lf)"/>`;
      return `<defs>
${lg("pa", [[0, shade(p, 0.35)], [0.5, p], [1, shade(p, -0.3)]])}
${lg("qa", [[0, shade(p, 0.45)], [0.45, shade(p, 0.1)], [1, shade(p, -0.25)]], 0.3, 0, 0.7, 1)}
${lg("pb", [[0, shade(p, 0.5)], [0.5, shade(p, 0.15)], [1, shade(p, -0.25)]])}
${lg("qb", [[0, shade(p, 0.6)], [0.45, shade(p, 0.25)], [1, shade(p, -0.15)]], 0.3, 0, 0.7, 1)}
${lg("sg", [[0, "#4d7c0f"], [1, "#65a30d"]], 0, 0, 1, 0)}
${lg("lf", [[0, "#84cc16"], [0.5, "#4d7c0f"], [1, "#365314"]], 0, 0, 1, 1)}
${lg("vs", [[0, "#d6d3d1"], [0.3, "#fafaf9"], [0.6, "#f5f5f4"], [1, "#a8a29e"]], 0, 0, 1, 0)}
</defs>
${shadow(200, 366, 120, 16, 0.45)}
${stems}
${lf("M196 262C150 240 100 210 74 160C110 190 160 224 204 252Z")}
${lf("M204 262C250 238 300 214 330 168C292 196 246 226 196 252Z")}
${lf("M200 262C176 220 170 190 180 150C188 196 196 222 210 254Z")}
${fl.map(([x, y, r, s, g]) => head(x, y, r, s, g)).join("")}
<path d="M150 254L250 254C256 290 276 302 274 330C272 354 254 366 200 366C146 366 128 354 126 330C124 302 144 290 150 254Z" fill="url(#vs)"/>
<ellipse cx="200" cy="254" rx="50" ry="8" fill="#e7e5e4"/>
<ellipse cx="200" cy="255" rx="44" ry="5" fill="#57534e"/>
<path d="M136 312C160 322 240 322 264 312" stroke="${p}" stroke-width="6" fill="none" opacity=".85"/>
<path d="M152 280C144 300 140 330 150 350" stroke="#fff" stroke-width="6" fill="none" opacity=".7" stroke-linecap="round"/>`;
    },
  },

  megaphone: {
    vb: [400, 400],
    defaults: { body: "#f43f5e" },
    draw: (o) => {
      const b = o.body;
      const conf = [[60, 80, "#fbbf24", 20], [340, 60, "#22d3ee", -30], [360, 300, "#fbbf24", 45], [70, 330, "#22d3ee", 10], [120, 50, b, 60], [300, 360, b, -20], [30, 200, "#a78bfa", 30], [380, 180, "#a78bfa", 70]] as [number, number, string, number][];
      return `<defs>
${lg("cn", [[0, shade(b, 0.45)], [0.35, b], [0.75, shade(b, -0.25)], [1, shade(b, -0.5)]])}
${rg("in", [[0, shade(b, -0.75)], [0.7, shade(b, -0.55)], [1, shade(b, -0.25)]], 0.6, 0.5, 0.6)}
${lg("wh", [[0, "#ffffff"], [1, "#cbd5e1"]])}
${lg("dk", [[0, "#4b5563"], [1, "#111827"]])}
</defs>
${conf.map(([x, y, c, r], i) => (i % 2 ? `<rect x="${x - 7}" y="${y - 4}" width="14" height="8" rx="2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>` : `<path d="M${x} ${y - 8}L${x + 8} ${y + 6}L${x - 8} ${y + 6}Z" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`)).join("")}
<circle cx="40" cy="130" r="5" fill="#fbbf24"/><circle cx="330" cy="330" r="6" fill="#22d3ee"/><circle cx="260" cy="40" r="5" fill="${b}"/>
<g transform="translate(176 214) rotate(-16)">
<path d="M150 -70L196 -96M160 0H214M150 70L196 96" stroke="#fbbf24" stroke-width="11" stroke-linecap="round"/>
<path d="M-60 34L-30 34L-26 98Q-26 108 -36 108L-52 108Q-62 108 -62 98Z" fill="url(#dk)"/>
<path d="M-40 40Q-24 60 -40 78" stroke="#374151" stroke-width="7" fill="none" stroke-linecap="round"/>
<rect x="-140" y="-32" width="54" height="64" rx="12" fill="url(#dk)"/>
<ellipse cx="-140" cy="0" rx="10" ry="32" fill="#374151"/>
<path d="M-94 -36L96 -104L96 104L-94 36Z" fill="url(#cn)"/>
<path d="M30 -80L48 -87L48 87L30 80Z" fill="url(#wh)"/>
<path d="M-80 -24L80 -84" stroke="#fff" stroke-opacity=".45" stroke-width="6" stroke-linecap="round"/>
<ellipse cx="96" cy="0" rx="34" ry="106" fill="url(#wh)"/>
<ellipse cx="98" cy="0" rx="27" ry="94" fill="url(#in)"/>
<ellipse cx="94" cy="0" rx="9" ry="28" fill="#111827" opacity=".7"/>
</g>`;
    },
  },

  /* ================= HOME ================= */
  armchair: {
    vb: [400, 400],
    defaults: { c: "#c08457", legs: "#78350f", kind: "modern" },
    draw: (o) => {
      const c = o.c, l = o.legs, k = o.kind;
      const body = k === "rattan" ? chairRattan(c) : k === "velvet" ? chairVelvet(c) : k === "lounge" ? chairLounge(c) : chairModern(c, l);
      const sheen = k === "velvet" ? 0.5 : 0.25;
      return `<defs>
${lg("cb", [[0, shade(c, sheen)], [0.45, c], [1, shade(c, -0.3)]], 0, 0, 0.4, 1)}
${lg("cs", [[0, shade(c, 0.15)], [0.5, c], [1, shade(c, -0.3)]])}
${lg("ca", [[0, shade(c, sheen * 0.8)], [0.5, shade(c, -0.05)], [1, shade(c, -0.35)]], 0, 0, 1, 0)}
${lg("lg", [[0, shade(l, 0.25)], [0.5, l], [1, shade(l, -0.3)]], 0, 0, 1, 0)}
${lg("pl", [[0, shade(c, 0.92)], [1, shade(c, 0.7)]])}
<pattern id="wv" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${shade(c, -0.1)}"/><path d="M0 8L8 0L16 8L8 16Z" fill="${shade(c, 0.12)}"/><circle cx="8" cy="8" r="2.6" fill="${shade(c, -0.55)}"/><circle cx="0" cy="0" r="2.6" fill="${shade(c, -0.55)}"/><circle cx="16" cy="0" r="2.6" fill="${shade(c, -0.55)}"/><circle cx="0" cy="16" r="2.6" fill="${shade(c, -0.55)}"/><circle cx="16" cy="16" r="2.6" fill="${shade(c, -0.55)}"/></pattern>
</defs>
${shadow(200, 360, 172, 22, 0.4)}
${body}`;
    },
  },

  sofa: {
    vb: [480, 320],
    defaults: { c: "#d6b88d" },
    draw: (o) => {
      const c = o.c, DX = 56, DY = 36;
      const P = (x: number, y: number, z: number) => `${r1(x + z * DX)} ${r1(y - z * DY)}`;
      const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rx = 12, fr = "url(#fr)") =>
        `<path d="M${P(x1, y0, z0)}L${P(x1, y0, z1)}L${P(x1, y1, z1)}L${P(x1, y1, z0)}Z" fill="url(#sd)" stroke="${shade(c, -0.2)}" stroke-width="${rx}" stroke-linejoin="round"/>
<path d="M${P(x0, y0, z0)}L${P(x1, y0, z0)}L${P(x1, y0, z1)}L${P(x0, y0, z1)}Z" fill="url(#tp)" stroke="${shade(c, 0.12)}" stroke-width="${rx}" stroke-linejoin="round"/>
<rect x="${r1(x0 + z0 * DX - rx / 2)}" y="${r1(y0 - z0 * DY - rx / 2)}" width="${x1 - x0 + rx}" height="${y1 - y0 + rx}" rx="${rx}" fill="${fr}" stroke="${shade(c, -0.18)}" stroke-width="1.2"/>`;
      const pillow = (x: number, y: number, r: number, col: string, id: string) =>
        `${rg(id, [[0, shade(col, 0.3)], [0.6, col], [1, shade(col, -0.3)]], 0.4, 0.35, 0.75)}<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-36 -34Q0 -26 36 -34Q28 0 36 34Q0 26 -36 34Q-28 0 -36 -34Z" fill="url(#${id})" stroke="${shade(col, -0.2)}" stroke-width="2" stroke-linejoin="round"/><path d="M-20 -14Q0 -6 18 -16" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
      const leg = (x: number, y: number) => `<path d="M${x - 6} ${y}L${x + 6} ${y}L${x + 3} ${y + 26}L${x - 3} ${y + 26}Z" fill="#3f2a1c"/>`;
      return `<defs>
${lg("fr", [[0, shade(c, 0.05)], [0.6, c], [1, shade(c, -0.25)]])}
${lg("fc", [[0, shade(c, 0.12)], [1, shade(c, -0.15)]])}
${lg("tp", [[0, shade(c, 0.28)], [1, shade(c, 0.12)]])}
${lg("sd", [[0, shade(c, -0.22)], [1, shade(c, -0.32)]], 0, 0, 1, 0)}
</defs>
${shadow(250, 292, 228, 20, 0.45)}
${leg(60, 262)}${leg(398, 262)}
<path d="M${P(398, 262, 1)}l5 0-2 22h-4z" fill="#3f2a1c"/>
${box(44, 402, 96, 230, 0.72, 1, 16)}
${box(44, 88, 150, 262, 0, 1, 14)}
${box(88, 360, 228, 262, 0, 0.72, 6, "url(#fr)")}
${box(92, 180, 198, 232, 0, 0.72, 12, "url(#fc)")}${box(180, 268, 198, 232, 0, 0.72, 12, "url(#fc)")}${box(268, 356, 198, 232, 0, 0.72, 12, "url(#fc)")}
${box(94, 180, 106, 186, 0.55, 0.72, 16)}${box(182, 268, 104, 186, 0.55, 0.72, 16)}${box(270, 356, 106, 186, 0.55, 0.72, 16)}
${pillow(130, 160, -10, shade(c, -0.35), "pa")}${pillow(326, 162, 10, shade(c, 0.5), "pb")}
${box(358, 402, 150, 262, 0, 1, 14)}
<path d="M96 206H174M186 206H262M274 206H350" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>`;
    },
  },

  vase: {
    vb: [400, 400],
    defaults: { vase: "#d6d3d1", stems: "#a8a29e" },
    draw: (o) => {
      const v = o.vase, s = o.stems, R = rnd(21);
      const plume = (tx: number, ty: number, cxp: number, cyp: number, len: number) => {
        let out = "";
        const B = [200, 214], C = [cxp, cyp], T = [tx, ty];
        const at = (t: number) => [(1 - t) ** 2 * B[0] + 2 * t * (1 - t) * C[0] + t * t * T[0], (1 - t) ** 2 * B[1] + 2 * t * (1 - t) * C[1] + t * t * T[1]];
        out += `<path d="M${pt(B)}Q${pt(C)} ${pt(T)}" stroke="${shade(s, -0.25)}" stroke-width="2.4" fill="none"/>`;
        const st = 1 - len;
        let soft = `M${pt(at(st))}`;
        for (let t = st; t <= 1.001; t += 0.05) soft += `L${pt(at(t))}`;
        out += `<path d="${soft}" stroke="${shade(s, 0.3)}" stroke-width="26" stroke-linecap="round" fill="none" opacity=".45"/>`;
        for (let t = st; t <= 1; t += 0.012) {
          const p0 = at(t), p1 = at(Math.min(1, t + 0.01)), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
          const fl = 18 * Math.sin(((t - st) / len) * Math.PI * 0.9 + 0.25) + 4;
          for (const sg of [-1, 1]) {
            const ang = 0.55 + R() * 0.3, cs = Math.cos(ang), sn = Math.sin(ang) * sg, ex = ux * cs - uy * sn, ey = ux * sn + uy * cs, ll = fl * (0.7 + R() * 0.5);
            out += `<path d="M${pt(p0)}l${r1(ex * ll)} ${r1(ey * ll)}" stroke="${mix(s, "#fffaf0", 0.3 + R() * 0.5)}" stroke-width="${r1(1.6 + R() * 1.4)}" opacity=".85"/>`;
          }
        }
        return out;
      };
      const branch = `<path d="M196 214Q170 150 112 120M150 150Q130 140 128 118M180 168Q160 154 150 158M204 214Q236 140 300 112M262 130Q274 110 270 92M240 160Q260 158 272 150" stroke="${shade(s, -0.55)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
${[[112, 120], [128, 118], [150, 158], [300, 112], [270, 92], [272, 150], [126, 128], [286, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${shade(s, -0.35)}"/>`).join("")}`;
      let spk = "";
      for (let i = 0; i < 60; i++) {
        const a = R() * 6.283, d = Math.sqrt(R());
        spk += `<circle cx="${r1(200 + Math.cos(a) * d * 80)}" cy="${r1(300 + Math.sin(a) * d * 62)}" r="${r1(0.6 + R())}" fill="${shade(v, -0.45)}" opacity=".5"/>`;
      }
      return `<defs>
${rg("vg", [[0, shade(v, 0.45)], [0.45, v], [1, shade(v, -0.4)]], 0.35, 0.35, 0.75)}
${lg("nk", [[0, shade(v, -0.2)], [0.35, shade(v, 0.3)], [1, shade(v, -0.35)]], 0, 0, 1, 0)}
</defs>
${shadow(200, 372, 120, 16, 0.45)}
${branch}
${plume(96, 36, 150, 120, 0.5)}${plume(198, 20, 196, 110, 0.5)}${plume(318, 54, 250, 120, 0.48)}${plume(60, 128, 120, 170, 0.42)}${plume(350, 150, 290, 170, 0.42)}
<path d="M172 200L228 200L226 222C226 236 290 250 292 304C294 354 254 374 200 374C146 374 106 354 108 304C110 250 174 236 174 222Z" fill="url(#vg)"/>
${spk}
<path d="M172 200L228 200L226 222C214 228 186 228 174 222Z" fill="url(#nk)"/>
<ellipse cx="200" cy="200" rx="30" ry="7" fill="${shade(v, 0.2)}"/><ellipse cx="200" cy="200" rx="22" ry="4.5" fill="${shade(v, -0.6)}"/>
<path d="M136 280C128 300 130 330 146 348" stroke="#fff" stroke-opacity=".35" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M112 318C150 330 250 330 288 318" stroke="${shade(v, -0.25)}" stroke-width="2" fill="none" opacity=".5"/>`;
    },
  },

  airfryer: {
    vb: [400, 400],
    defaults: { body: "#1f2937" },
    draw: (o) => {
      const b = o.body;
      let leds = "";
      for (let i = 0; i < 9; i++) {
        const a = ((-140 + i * 35) * Math.PI) / 180;
        leds += `<circle cx="${r1(200 + Math.sin(a) * 44)}" cy="${r1(136 - Math.cos(a) * 44)}" r="2.6" fill="${i < 5 ? "#fb923c" : "#4b5563"}"/>`;
      }
      const fries = [[160, 300, -20], [178, 296, 10], [196, 302, -5], [214, 294, 25], [232, 300, -15], [170, 310, 40], [222, 312, -35], [246, 306, 12], [152, 314, 5]]
        .map(([x, y, r]) => `<rect x="${x - 4}" y="${y - 18}" width="8" height="36" rx="3" fill="#f59e0b" transform="rotate(${r} ${x} ${y})"/>`).join("");
      return `<defs>
${lg("bd", [[0, shade(b, 0.28)], [0.3, shade(b, 0.08)], [0.75, b], [1, shade(b, -0.4)]], 0, 0, 1, 0)}
${lg("tp", [[0, shade(b, 0.35)], [1, shade(b, 0.12)]])}
${lg("pn", [[0, "#1f2937"], [1, "#030712"]])}
${rg("dl", [[0, "#f9fafb"], [0.6, "#d1d5db"], [1, "#6b7280"]], 0.4, 0.35, 0.7)}
${rg("wn", [[0, "#fdba74"], [0.6, "#c2410c"], [1, "#431407"]], 0.5, 0.6, 0.7)}
${lg("hd", [[0, shade(b, 0.4)], [0.5, shade(b, 0.05)], [1, shade(b, -0.5)]])}
</defs>
${shadow(204, 356, 150, 18, 0.45)}
<rect x="104" y="342" width="30" height="12" rx="4" fill="#111"/><rect x="266" y="342" width="30" height="12" rx="4" fill="#111"/>
<path d="M132 66L268 66Q306 66 308 104L314 326Q314 350 290 350L110 350Q86 350 86 326L92 104Q94 66 132 66Z" fill="url(#bd)"/>
<path d="M132 66L268 66Q300 66 304 90Q200 76 96 90Q100 66 132 66Z" fill="url(#tp)"/>
<path d="M240 76h36M240 82h36" stroke="${shade(b, -0.4)}" stroke-width="2.5" stroke-linecap="round"/>
<rect x="126" y="94" width="148" height="86" rx="20" fill="url(#pn)"/>
<path d="M136 100Q200 94 264 100" stroke="#fff" stroke-opacity=".2" stroke-width="3" fill="none" stroke-linecap="round"/>
${leds}
<circle cx="200" cy="136" r="31" fill="#111827"/><circle cx="200" cy="136" r="28" fill="url(#dl)"/>
<circle cx="200" cy="136" r="20" fill="none" stroke="#9ca3af" stroke-width="1.5"/>
<path d="M200 112V124" stroke="#ea580c" stroke-width="4" stroke-linecap="round"/>
<circle cx="146" cy="166" r="3" fill="#22c55e"/><circle cx="254" cy="166" r="3" fill="#4b5563"/>
<path d="M90 198Q200 192 310 198" stroke="${shade(b, -0.6)}" stroke-width="4" fill="none"/>
<path d="M90 202Q200 196 310 202" stroke="${shade(b, 0.3)}" stroke-width="1.5" fill="none" opacity=".6"/>
<rect x="140" y="214" width="120" height="30" rx="15" fill="${shade(b, -0.6)}"/>
<rect x="140" y="210" width="120" height="28" rx="14" fill="url(#hd)"/>
<path d="M152 216H248" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" stroke-linecap="round"/>
<rect x="136" y="262" width="128" height="66" rx="16" fill="#0b0f17"/>
<rect x="140" y="266" width="120" height="58" rx="13" fill="url(#wn)"/>
<clipPath id="wc"><rect x="140" y="266" width="120" height="58" rx="13"/></clipPath>
<g clip-path="url(#wc)">${fries}<rect x="140" y="266" width="120" height="58" fill="#000" opacity=".25"/><path d="M150 266L180 266L144 324L140 310Z" fill="#fff" opacity=".22"/></g>
<path d="M98 120Q96 220 100 320" stroke="#fff" stroke-opacity=".15" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    },
  },

  pot: {
    vb: [400, 400],
    defaults: { body: "#111827" },
    draw: (o) => {
      const b = o.body, cx = 172, top = 206, rx = 124, ry = 30, bot = 322;
      return `<defs>
${lg("pb", [[0, shade(b, 0.12)], [0.15, shade(b, 0.4)], [0.3, b], [0.7, shade(b, -0.1)], [0.88, shade(b, 0.2)], [1, shade(b, -0.3)]], 0, 0, 1, 0)}
${lg("st", [[0, "#9ca3af"], [0.2, "#f9fafb"], [0.45, "#9ca3af"], [0.8, "#e5e7eb"], [1, "#6b7280"]], 0, 0, 1, 0)}
${lg("gl", [[0, "#fff", 0.6], [0.25, "#e2e8f0", 0.25], [0.6, "#cbd5e1", 0.15], [1, "#fff", 0.5]], 0, 0, 1, 0)}
${rg("kn", [[0, shade(b, 0.5)], [1, b]], 0.35, 0.3, 0.8)}
</defs>
${shadow(196, 350, 190, 22, 0.45)}
<path d="M${cx - 118} ${top + 26}C${cx - 150} ${top + 22} ${cx - 152} ${top + 54} ${cx - 118} ${top + 52}" stroke="url(#st)" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M${cx + 118} ${top + 26}C${cx + 150} ${top + 22} ${cx + 152} ${top + 54} ${cx + 118} ${top + 52}" stroke="url(#st)" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M${cx - rx} ${top}L${cx - rx} ${bot}A${rx} ${ry} 0 0 0 ${cx + rx} ${bot}L${cx + rx} ${top}Z" fill="url(#pb)"/>
<path d="M${cx - rx} ${top}L${cx - rx} ${top + 14}A${rx} ${ry} 0 0 0 ${cx + rx} ${top + 14}L${cx + rx} ${top}Z" fill="url(#st)"/>
<path d="M${cx - rx + 2} ${bot - 4}A${rx} ${ry} 0 0 0 ${cx + rx - 2} ${bot - 4}" stroke="${shade(b, 0.35)}" stroke-width="2" fill="none" opacity=".6"/>
<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${shade(b, -0.5)}"/>
<path d="M${cx - rx + 4} ${top}C${cx - rx + 10} ${top - 70} ${cx + rx - 10} ${top - 70} ${cx + rx - 4} ${top}A${rx - 4} ${ry - 2} 0 0 1 ${cx - rx + 4} ${top}Z" fill="url(#gl)" stroke="#fff" stroke-opacity=".9" stroke-width="2.5"/>
<path d="M${cx - rx + 4} ${top}C${cx - rx + 10} ${top - 70} ${cx + rx - 10} ${top - 70} ${cx + rx - 4} ${top}" stroke="#64748b" stroke-opacity=".55" stroke-width="1.2" fill="none"/>
<path d="M${cx + 40} ${top - 50}C${cx + 70} ${top - 46} ${cx + 96} ${top - 30} ${cx + 106} ${top - 14}" stroke="#fff" stroke-width="3" opacity=".6" fill="none" stroke-linecap="round"/>
<path d="M${cx - 60} ${top - 20}C${cx - 40} ${top - 34} ${cx - 10} ${top - 38} ${cx + 10} ${top - 38}" stroke="#fff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>
<path d="M${cx - 90} ${top - 26}C${cx - 70} ${top - 48} ${cx - 30} ${top - 54} ${cx} ${top - 54}" stroke="#fff" stroke-width="5" opacity=".7" fill="none" stroke-linecap="round"/>
<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="none" stroke="url(#st)" stroke-width="7"/>
<ellipse cx="${cx}" cy="${top - 52}" rx="22" ry="7" fill="url(#st)"/>
<path d="M${cx - 16} ${top - 56}C${cx - 18} ${top - 76} ${cx + 18} ${top - 76} ${cx + 16} ${top - 56}Z" fill="url(#kn)"/>
<ellipse cx="${cx}" cy="${top - 70}" rx="14" ry="5" fill="${shade(b, 0.3)}"/>
<path d="M${cx - 100} ${top + 30}C${cx - 98} ${top + 70} ${cx - 92} ${bot - 10} ${cx - 86} ${bot + 14}" stroke="#fff" stroke-opacity=".25" stroke-width="9" fill="none" stroke-linecap="round"/>
<g transform="rotate(8 340 200)"><path d="M338 40Q352 34 352 50L348 300" stroke="url(#st)" stroke-width="10" fill="none" stroke-linecap="round"/>
<path d="M314 300A34 14 0 0 0 382 300C382 336 362 348 348 348C334 348 314 336 314 300Z" fill="url(#st)"/>
<ellipse cx="348" cy="300" rx="34" ry="12" fill="#6b7280"/><ellipse cx="348" cy="301" rx="30" ry="9" fill="#d1d5db"/></g>`;
    },
  },

  /* ================= AUTO & TRAVEL ================= */
  car: {
    vb: [480, 300],
    defaults: { body: "#2563eb", kind: "sedan" },
    draw: (o) => carDraw(o),
  },

  tire: {
    vb: [400, 400],
    defaults: {},
    draw: () => {
      const fx = 180, bx = 226, cy = 200, rx = 136, ry = 164;
      let tread = "";
      for (let d = -88; d <= 88; d += 8) {
        const a = (d * Math.PI) / 180, a2 = ((d + 4) * Math.PI) / 180;
        const p = (x: number, t: number) => `${r1(x + Math.cos(t) * rx)} ${r1(cy + Math.sin(t) * ry)}`;
        tread += `M${p(fx + 2, a)}L${p(fx + 15, a2)}L${p(fx + 23, a)}M${p(fx + 23, a2)}L${p(fx + 34, a)}L${p(bx - 2, a2)}`;
      }
      let spokes = "";
      for (let i = 0; i < 5; i++) {
        const a = (i * 72 * Math.PI) / 180;
        for (const off of [-0.16, 0.16]) {
          const b1 = a + off - 0.06, b2 = a + off + 0.06;
          spokes += `M${r1(Math.sin(a + off * 0.4) * 26)} ${r1(-Math.cos(a + off * 0.4) * 26)}L${r1(Math.sin(b1) * 94)} ${r1(-Math.cos(b1) * 94)}L${r1(Math.sin(b2) * 94)} ${r1(-Math.cos(b2) * 94)}Z`;
        }
      }
      const nuts = [0, 1, 2, 3, 4].map((i) => `<circle cx="${r1(Math.sin(i * 1.2566 + 0.63) * 17)}" cy="${r1(-Math.cos(i * 1.2566 + 0.63) * 17)}" r="3.6" fill="url(#rm)" stroke="#374151" stroke-width="1"/>`).join("");
      return `<defs>
${lg("tw", [[0, "#3a3d44"], [1, "#0d0e11"]], 0, 0, 1, 0)}
${rg("sw", [[0, "#2a2d33"], [0.75, "#1b1d22"], [0.92, "#2f3239"], [1, "#0b0c0f"]])}
${lg("rm", [[0, "#ffffff"], [0.35, "#cbd5e1"], [0.6, "#64748b"], [1, "#e2e8f0"]], 0, 0, 1, 1)}
${rg("br", [[0, "#0f1115"], [0.8, "#1f2937"], [1, "#4b5563"]])}
<clipPath id="tc"><path d="M${fx} ${cy - ry}H${bx}A${rx} ${ry} 0 0 1 ${bx} ${cy + ry}H${fx}Z"/></clipPath>
</defs>
${shadow(214, 366, 170, 18, 0.5)}
<path d="M${fx} ${cy - ry}H${bx}A${rx} ${ry} 0 0 1 ${bx} ${cy + ry}H${fx}Z" fill="url(#tw)"/>
<g clip-path="url(#tc)"><path d="${tread}" stroke="#08090b" stroke-width="3.4" fill="none" stroke-linejoin="round"/>
<ellipse cx="${fx + 23}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#08090b" stroke-width="2.5"/></g>
<ellipse cx="${fx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#sw)"/>
<ellipse cx="${fx}" cy="${cy}" rx="${rx - 14}" ry="${ry - 16}" fill="none" stroke="#3b3f47" stroke-width="1.5"/>
<path d="M${fx - 90} ${cy - 110}A${rx - 8} ${ry - 8} 0 0 1 ${fx + 40} ${cy - ry + 10}" stroke="#fff" stroke-opacity=".12" stroke-width="8" fill="none" stroke-linecap="round"/>
<g transform="translate(${fx + 4} ${cy}) scale(${rx / ry} 1)">
<circle r="108" fill="url(#rm)"/><circle r="100" fill="url(#br)"/>
<path d="${spokes}" fill="url(#rm)" stroke="#475569" stroke-width="1"/>
<circle r="30" fill="url(#rm)"/><circle r="26" fill="#cbd5e1"/>${nuts}<circle r="9" fill="#334155"/><circle r="5" fill="#94a3b8"/>
<circle r="104" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
</g>`;
    },
  },

  carcare: {
    vb: [400, 400],
    defaults: { c: "#2563eb" },
    draw: (o) => {
      const c = o.c, R = rnd(4);
      let pores = "";
      for (let i = 0; i < 30; i++) pores += `<ellipse cx="${r1(270 + R() * 104)}" cy="${r1(314 + R() * 36)}" rx="${r1(1.5 + R() * 2)}" ry="${r1(1 + R() * 1.5)}" fill="#b45309" opacity=".45"/>`;
      const bub = [[290, 304, 10], [310, 298, 8], [330, 306, 11], [350, 300, 7], [304, 312, 6], [362, 310, 8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#cbd5e1" stroke-width="1"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.25}" fill="#e0f2fe"/>`).join("");
      return `<defs>
${lg("bt", [[0, shade(c, 0.3)], [0.35, c], [0.8, shade(c, -0.25)], [1, shade(c, -0.45)]], 0, 0, 1, 0)}
${lg("wt", [[0, "#ffffff"], [0.7, "#f1f5f9"], [1, "#94a3b8"]], 0, 0, 1, 0)}
${lg("dk", [[0, "#374151"], [1, "#0b0f17"]], 0, 0, 1, 0)}
${lg("cl", [[0, shade(c, 0.55)], [1, shade(c, 0.2)]])}
${lg("sp", [[0, "#fde047"], [1, "#f59e0b"]])}
</defs>
${shadow(220, 362, 180, 22, 0.45)}
<path d="M216 300L366 286Q380 286 380 300L376 330Q374 344 360 344L216 350Q204 350 204 338L206 312Q206 300 216 300Z" fill="url(#cl)"/>
<path d="M212 312L374 300M212 324L374 314" stroke="${shade(c, 0.1)}" stroke-width="2" opacity=".5"/>
<path d="M120 112L160 112L164 150Q200 166 200 210L200 330Q200 352 178 352L104 352Q82 352 82 330L82 210Q82 166 118 150Z" fill="url(#bt)"/>
<path d="M90 214Q90 186 106 176" stroke="#fff" stroke-opacity=".5" stroke-width="6" fill="none" stroke-linecap="round"/>
<rect x="92" y="222" width="98" height="96" rx="10" fill="#fff"/>
<path d="M141 238C132 252 126 260 126 268A15 15 0 0 0 156 268C156 260 150 252 141 238Z" fill="${c}"/>
<path d="M108 294H174M116 304H166" stroke="${shade(c, -0.2)}" stroke-width="4" stroke-linecap="round"/>
<rect x="116" y="96" width="48" height="20" rx="4" fill="url(#dk)"/>
<path d="M112 58L168 58Q178 58 176 70L170 98L110 98Q100 98 100 88L100 72L66 72Q58 72 58 64Q58 56 66 56Z" fill="url(#dk)"/>
<rect x="50" y="58" width="14" height="12" rx="3" fill="${c}"/>
<path d="M108 98Q100 126 114 146Q120 152 124 146Q114 124 122 98Z" fill="#1f2937"/>
<path d="M118 62H164" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>
<path d="M232 148L278 148L280 166Q306 176 306 206L306 330Q306 350 286 350L224 350Q204 350 204 330L204 206Q204 176 230 166Z" fill="url(#wt)"/>
<rect x="226" y="120" width="58" height="32" rx="8" fill="url(#bt)"/>
<path d="M234 120L246 106L268 106L278 120Z" fill="${shade(c, -0.2)}"/>
<rect x="212" y="228" width="86" height="80" rx="8" fill="url(#bt)"/>
<circle cx="255" cy="258" r="16" fill="#fff" opacity=".9"/><path d="M247 258l6 6 10-12" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M228 290H282" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
<path d="M214 196Q214 176 228 170" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M274 312L374 302Q386 302 386 314L384 346Q384 358 372 358L278 364Q266 364 266 352L266 324Q266 312 274 312Z" fill="url(#sp)"/>
<path d="M274 312L374 302Q386 302 386 314L386 318L266 328L266 324Q266 312 274 312Z" fill="#15803d"/>
${pores}${bub}`;
    },
  },

  airplane: {
    vb: [480, 320],
    defaults: { body: "#ffffff", accent: "#2563eb" },
    draw: (o) => {
      const b = o.body, a = o.accent;
      let win = "";
      for (let x = 88; x < 330; x += 13) win += `<rect x="${x}" y="-9" width="6.5" height="9" rx="3" fill="#1e293b"/>`;
      return `<defs>
${lg("fs", [[0, shade(b, -0.02)], [0.45, b], [0.75, shade(b, -0.18)], [1, shade(b, -0.42)]])}
${lg("wg", [[0, shade(b, -0.1)], [1, shade(b, -0.35)]], 0, 0, 1, 1)}
${lg("wn", [[0, shade(b, -0.28)], [1, shade(b, -0.48)]], 0, 0, 1, 1)}
${lg("ac", [[0, shade(a, 0.2)], [1, shade(a, -0.3)]], 0, 0, 1, 1)}
${lg("en", [[0, shade(b, -0.05)], [0.5, shade(b, -0.2)], [1, shade(b, -0.5)]])}
${rg("fan", [[0, "#94a3b8"], [0.4, "#334155"], [1, "#0f172a"]])}
${lg("ck", [[0, "#334155"], [1, "#0f172a"]])}
</defs>
<g transform="translate(46 150) rotate(-12)">
<path d="M178 -14L250 -16L330 -118L312 -122Z" fill="url(#wn)" stroke="${shade(b, -0.5)}" stroke-width="1" stroke-linejoin="round"/>
<path d="M312 -122L330 -118L336 -134Z" fill="${a}"/>
<g transform="translate(224 -34)"><rect x="-26" y="-11" width="48" height="22" rx="11" fill="url(#en)"/><ellipse cx="-26" cy="0" rx="5" ry="11" fill="#0f172a"/></g>
<path d="M352 -18L376 -20L420 -56L404 -58Z" fill="url(#wn)"/>
<path d="M330 -20L380 -22L402 -100L380 -102Z" fill="url(#ac)"/>
<path d="M380 -102L402 -100L396 -80L384 -80Z" fill="${shade(a, -0.3)}"/>
<path d="M0 6C0 -18 24 -28 60 -28L344 -24L404 -14L404 -4C390 6 370 16 340 22L60 28C24 28 0 22 0 6Z" fill="url(#fs)"/>
<path d="M30 16C80 20 250 18 400 -4L402 2C330 16 200 26 60 28C40 28 30 24 30 16Z" fill="${a}"/>
<path d="M12 -10C16 -20 26 -24 36 -24L40 -12C30 -12 20 -10 12 -10Z" fill="url(#ck)"/>
${win}
<path d="M70 -22L340 -18" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>
<path d="M140 12L250 14L380 160L350 164Z" fill="url(#wg)" stroke="${shade(b, -0.45)}" stroke-width="1" stroke-linejoin="round"/>
<path d="M150 16L240 18L360 150" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none"/>
<path d="M350 164L380 160L392 184Z" fill="${a}"/>
<path d="M330 14L370 12L420 50L404 54Z" fill="url(#wg)"/>
<g transform="translate(216 66) rotate(4)"><path d="M-46 -20L34 -18Q46 -16 46 0Q46 16 34 18L-46 20Z" fill="url(#en)"/><rect x="-26" y="-21" width="10" height="42" fill="${a}"/>
<ellipse cx="-46" cy="0" rx="9" ry="21" fill="${shade(b, -0.15)}"/><ellipse cx="-46" cy="0" rx="6" ry="16" fill="url(#fan)"/><circle cx="-47" cy="0" r="3" fill="#cbd5e1"/></g>
<path d="M196 40L228 38L232 48L200 50Z" fill="${shade(b, -0.35)}"/>
</g>`;
    },
  },
};
