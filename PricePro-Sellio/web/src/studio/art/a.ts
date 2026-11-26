import type { Art } from "./types";

/* ---------- colour + gradient helpers ---------- */
const rgb = (h: string): number[] => {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Mix two colours: t=0 -> a, t=1 -> b. */
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
};
/** amount < 0 darkens toward black, > 0 lightens toward white. */
const shade = (h: string, amount: number) => mix(h, amount < 0 ? "#000000" : "#ffffff", Math.abs(amount));
/** Stops: "#hex", or "#hex|opacity" or "#hex|opacity|offset". */
const stops = (c: string[]) =>
  c
    .map((s, i) => {
      const [col, op, off] = s.split("|");
      const o = off ?? (c.length > 1 ? (i / (c.length - 1)).toFixed(3) : "0");
      return `<stop offset="${o}" stop-color="${col}"${op ? ` stop-opacity="${op}"` : ""}/>`;
    })
    .join("");
const lg = (id: string, c: string[], x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(c)}</linearGradient>`;
/** Linear gradient in user space (absolute coordinates). */
const lgu = (id: string, c: string[], x1: number, y1: number, x2: number, y2: number) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(c)}</linearGradient>`;
const rg = (id: string, c: string[], cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stops(c)}</radialGradient>`;
/** Soft contact shadow. */
const shadow = (cx: number, cy: number, rx: number, ry: number, op = 0.35, id = "shd") =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="#000" stop-opacity="${op}"/><stop offset="0.6" stop-color="#000" stop-opacity="${op * 0.45}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;
/** Metallic horizontal gradient stops from one colour. */
const metal = (c: string) => [shade(c, -0.25), shade(c, 0.45), c, shade(c, -0.35), shade(c, 0.25), shade(c, -0.15)];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const f1 = (n: number) => n.toFixed(1);

type Pt = [number, number];
/** Palm-like frond along a quadratic curve p0 -> p2 (control p1): leaflets on both sides. */
const frond = (p0: Pt, p1: Pt, p2: Pt, len: number, n = 18, droop = 0.35, w = 5) => {
  const P = (t: number): Pt => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];
  const D = (t: number): Pt => {
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (0.86 * i) / (n - 1);
    const [bx, by] = P(t), [tx, ty] = D(t);
    const L = len * Math.sin(Math.PI * (0.25 + 0.75 * t)) * (1.1 - 0.5 * t);
    for (const s of [1, -1]) {
      const nx = -ty * s, ny = tx * s;
      const ex = bx + nx * L * 0.85 + tx * L * 0.5, ey = by + ny * L * 0.85 + ty * L * 0.5 + L * droop;
      const mx = (bx + ex) / 2, my = (by + ey) / 2;
      const ul = Math.hypot(ex - bx, ey - by) || 1, vx = -(ey - by) / ul, vy = (ex - bx) / ul;
      d += `M${f1(bx)},${f1(by)} Q${f1(mx + vx * w)},${f1(my + vy * w)} ${f1(ex)},${f1(ey)} Q${f1(mx - vx * w)},${f1(my - vy * w)} ${f1(bx + tx * w * 0.8)},${f1(by + ty * w * 0.8)} Z `;
    }
  }
  return { leaflets: d, rachis: `M${p0[0]},${p0[1]} Q${p1[0]},${p1[1]} ${p2[0]},${p2[1]}` };
};
/** Monstera leaf (base at 0,0 pointing up, ~170 tall) as a <g> to place in <defs>; needs gradient id. */
const monsteraDef = (id: string, grad: string, vein: string) => {
  const outline = "M0,0 C-50,-4 -88,-50 -82,-100 C-76,-142 -40,-168 2,-180 C42,-166 84,-140 84,-98 C86,-48 48,-4 0,0 Z";
  const cuts = [
    [-66, -146, -26, -122], [-86, -104, -30, -90], [-76, -56, -28, -56], [-46, -16, -18, -30],
    [70, -142, 28, -118], [88, -98, 30, -86], [76, -50, 26, -52], [44, -14, 16, -28],
  ]
    .map(([x1, y1, x2, y2]) => `M${x1 * 1.35},${y1 - 4} Q${(x1 + x2) / 2},${(y1 + y2) / 2 - 3} ${x2},${y2}`)
    .join(" ");
  return `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-100" y="-190" width="200" height="200"><path d="${outline}" fill="#fff"/><path d="${cuts}" stroke="#000" stroke-width="5.5" stroke-linecap="round" fill="none"/><ellipse cx="-24" cy="-96" rx="5" ry="9" fill="#000"/><ellipse cx="26" cy="-64" rx="5" ry="8" fill="#000"/><ellipse cx="-22" cy="-56" rx="4" ry="7" fill="#000"/></mask>
<g id="${id}"><g mask="url(#${id}m)"><path d="${outline}" fill="url(#${grad})"/><path d="M0,0 Q-6,-80 2,-176" stroke="${vein}" stroke-width="3" fill="none"/><path d="M2,0 Q-4,-80 4,-176 C44,-162 86,-138 86,-96 C88,-46 48,-2 2,0 Z" fill="#000" opacity="0.12"/></g></g>`;
};

export const ART: Record<string, Art> = {
  /* ================= WATCH ================= */
  watch: {
    vb: [400, 400],
    defaults: { case: "#d4af37", dial: "#111111", strap: "#c8a24a", kind: "bracelet" },
    draw: (o) => {
      const c = o.case, d = o.dial, s = o.strap;
      const leather = o.kind === "leather";
      const strap = (y0: number, y1: number, top: boolean) => {
        if (leather) {
          const w0 = 50, w1 = 44;
          const yA = top ? y1 : y0, yB = top ? y0 : y1; // yA near case
          const p = `M${200 - w0},${yA} L${200 - w1},${yB + (top ? 14 : -14)} Q${200 - w1},${yB} ${200 - w1 + 14},${yB} L${200 + w1 - 14},${yB} Q${200 + w1},${yB} ${200 + w1},${yB + (top ? 14 : -14)} L${200 + w0},${yA} Z`;
          const holes = top ? "" : range(3).map((i) => `<ellipse cx="200" cy="${yB - 30 - i * 20}" rx="4" ry="3.2" fill="${shade(s, -0.6)}"/>`).join("");
          return `<path d="${p}" fill="url(#wst)"/><path d="${p}" fill="none" stroke="${shade(s, 0.35)}" stroke-width="1.6" stroke-dasharray="5 4" transform="translate(200 ${(yA + yB) / 2}) scale(0.86 0.94) translate(-200 ${-(yA + yB) / 2})"/>${holes}`;
        }
        const rows = 6, h = (y1 - y0) / rows;
        return range(rows)
          .map((i) => {
            const y = y0 + i * h;
            const t = top ? 1 - i / rows : i / rows;
            const w = 52 - t * 8;
            return `<rect x="${f1(200 - w)}" y="${f1(y + 1)}" width="${f1(w - 17)}" height="${f1(h - 2)}" rx="3" fill="url(#wlk)"/><rect x="${f1(200 + 17)}" y="${f1(y + 1)}" width="${f1(w - 17)}" height="${f1(h - 2)}" rx="3" fill="url(#wlk)"/><rect x="183" y="${f1(y + 0.5)}" width="34" height="${f1(h - 1)}" rx="4" fill="url(#wlc)"/>`;
          })
          .join("");
      };
      const idx = range(12)
        .map((i) => {
          const a = i * 30;
          const big = i % 3 === 0;
          return `<rect x="${big ? 196.5 : 197.5}" y="${big ? 132 : 134}" width="${big ? 7 : 5}" height="${big ? 20 : 14}" rx="1.5" fill="url(#wix)" transform="rotate(${a} 200 200)"/>`;
        })
        .join("");
      const ticks = range(60)
        .filter((i) => i % 5)
        .map((i) => `<line x1="200" y1="126" x2="200" y2="130" stroke="${shade(c, 0.2)}" stroke-width="1" opacity="0.7" transform="rotate(${i * 6} 200 200)"/>`)
        .join("");
      return `<defs>
${lgu("wlk", metal(s), 150, 0, 250, 0)}${lgu("wlc", [shade(s, -0.2), shade(s, 0.6), shade(s, 0.1), shade(s, -0.3)], 183, 0, 217, 0)}
${lg("wst", [shade(s, -0.35), s, shade(s, 0.15), shade(s, -0.4)], 0, 0, 1, 0)}
${lg("wcs", [shade(c, 0.55), c, shade(c, -0.45), shade(c, 0.2)], 0, 0, 1, 1)}
${lg("wbz", [shade(c, -0.4), shade(c, 0.5), c, shade(c, -0.3)], 1, 1, 0, 0)}
${rg("wdl", [shade(d, 0.28), d, shade(d, -0.45)], 0.42, 0.38, 0.65)}
${lg("wix", [shade(c, 0.6), c], 0, 0, 1, 1)}
${lg("wgl", ["#ffffff|0.35", "#ffffff|0"], 0, 0, 0.6, 0.8)}
</defs>
${shadow(212, 372, 120, 18, 0.25)}
<g transform="rotate(-12 200 200)">
${strap(14, 122, true)}${strap(278, 386, false)}
<path d="M140,128 L148,108 L184,108 L184,130 Z M260,128 L252,108 L216,108 L216,130 Z M140,272 L148,292 L184,292 L184,270 Z M260,272 L252,292 L216,292 L216,270 Z" fill="url(#wcs)"/>
<rect x="294" y="186" width="18" height="28" rx="4" fill="url(#wcs)"/>
${range(5).map((i) => `<line x1="${297 + i * 3.4}" y1="188" x2="${297 + i * 3.4}" y2="212" stroke="${shade(c, -0.45)}" stroke-width="1"/>`).join("")}
<rect x="289" y="192" width="8" height="16" fill="${shade(c, -0.3)}"/>
<circle cx="206" cy="205" r="100" fill="${shade(c, -0.55)}"/>
<circle cx="200" cy="200" r="100" fill="url(#wcs)"/>
<circle cx="200" cy="200" r="91" fill="url(#wbz)"/>
<circle cx="200" cy="200" r="80" fill="${shade(c, -0.5)}"/>
<circle cx="200" cy="200" r="78" fill="url(#wdl)"/>
${ticks}${idx}
<rect x="252" y="193" width="16" height="14" rx="2" fill="${shade(d, 0.85)}" stroke="url(#wix)" stroke-width="1.5"/>
<circle cx="200" cy="245" r="16" fill="none" stroke="${shade(d, 0.18)}" stroke-width="1.2"/>
<circle cx="200" cy="245" r="11" fill="${shade(d, 0.06)}"/>
<path d="M200,245 L200,233" stroke="url(#wix)" stroke-width="1.6" stroke-linecap="round"/>
<g transform="rotate(-58 200 200)"><path d="M195,212 L196.5,152 L200,146 L203.5,152 L205,212 Z" fill="url(#wix)"/></g>
<g transform="rotate(62 200 200)"><path d="M196,214 L197.5,134 L200,128 L202.5,134 L204,214 Z" fill="url(#wix)"/></g>
<g transform="rotate(195 200 200)"><path d="M199,225 L199.4,132 L200.6,132 L201,225 Z" fill="#e0483a"/><circle cx="200" cy="216" r="4" fill="#e0483a"/></g>
<circle cx="200" cy="200" r="7" fill="url(#wcs)"/><circle cx="200" cy="200" r="2.5" fill="${shade(c, -0.5)}"/>
<path d="M126,180 A78,78 0 0 1 238,132 A90,90 0 0 0 138,214 Z" fill="url(#wgl)"/>
<path d="M118,232 A92,92 0 0 0 268,262" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
</g>`;
    },
  },

  /* ================= SNEAKER ================= */
  sneaker: {
    vb: [400, 280],
    defaults: { body: "#ffffff", accent: "#d1d5db", sole: "#f3f4f6" },
    draw: (o) => {
      const b = o.body, a = o.accent, s = o.sole;
      const upper = "M28,200 C22,160 24,112 38,82 C46,72 60,74 72,82 C88,94 100,104 116,106 C128,104 138,92 146,76 C150,64 156,56 166,56 C174,56 177,63 175,72 C190,100 222,124 262,140 C300,152 344,158 372,170 C392,178 398,192 392,204 L28,204 Z";
      const lace = range(6)
        .map((i) => {
          const tx = 180 + i * 15.5, ty = 78 + i * 11.4;
          const ex = tx - 9, ey = ty + 13;
          return `<path d="M${f1(ex)},${f1(ey)} L${f1(tx + 7)},${f1(ty + 1)}" stroke="${shade(b, -0.3)}" stroke-width="6.5" stroke-linecap="round"/><path d="M${f1(ex)},${f1(ey)} L${f1(tx + 7)},${f1(ty + 1)}" stroke="${shade(b, -0.02)}" stroke-width="4.5" stroke-linecap="round"/><circle cx="${f1(ex)}" cy="${f1(ey)}" r="3.2" fill="${shade(a, -0.5)}"/><circle cx="${f1(ex)}" cy="${f1(ey)}" r="1.3" fill="${shade(a, 0.4)}"/>`;
        })
        .join("");
      return `<defs>
${lg("sup", [b, shade(b, -0.04), shade(b, -0.16)])}
${lg("sac", [shade(a, 0.2), a, shade(a, -0.15)])}
${lg("smd", [shade(s, 0.5), s, shade(s, -0.1)])}
${lg("sol", [shade(s, -0.4), shade(s, -0.6)])}
<pattern id="smesh" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="${shade(b, -0.22)}"/></pattern>
<clipPath id="scl"><path d="${upper}"/></clipPath>
</defs>
${shadow(208, 250, 192, 13, 0.32)}
<path d="M24,230 C70,236 200,236 300,234 C340,232 370,228 386,220 C390,234 374,244 340,247 C260,252 110,252 40,249 C26,247 18,238 24,230 Z" fill="url(#sol)"/>
<path d="M30,80 C24,70 26,60 36,60 C44,62 46,72 46,80" fill="none" stroke="${shade(a, -0.25)}" stroke-width="5" stroke-linecap="round"/>
<path d="M150,78 C152,62 158,52 168,50 C178,50 181,58 178,70 Z" fill="${shade(b, -0.08)}"/>
<path d="${upper}" fill="url(#sup)"/>
<g clip-path="url(#scl)">
<path d="M262,140 C300,152 344,158 372,170 L400,210 L250,210 Z" fill="url(#smesh)" opacity="0.7"/>
<path d="M318,204 C318,184 338,168 372,172 C390,180 398,192 392,204 Z" fill="url(#sac)"/>
<path d="M318,204 C318,184 338,168 372,172" fill="none" stroke="${shade(a, -0.3)}" stroke-width="1" stroke-dasharray="3 3" transform="translate(-5 2)"/>
<path d="M10,204 C12,160 20,124 30,106 C54,114 70,152 74,204 Z" fill="url(#sac)"/>
<path d="M26,116 C48,124 62,156 66,200" fill="none" stroke="${shade(a, -0.3)}" stroke-width="1" stroke-dasharray="3 3"/>
<path d="M163,80 C182,106 230,134 262,148" fill="none" stroke="${shade(b, -0.25)}" stroke-width="1" stroke-dasharray="3 3"/>
<path d="M178,104 C198,130 206,168 202,204 L232,204 C238,168 230,136 212,120 Z" fill="url(#sac)"/>
<path d="M96,196 C150,178 220,166 310,174" fill="none" stroke="${shade(a, -0.2)}" stroke-width="4" stroke-linecap="round"/>
<path d="M40,96 C70,104 100,116 140,104" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.5"/>
<path d="M28,198 L400,198" stroke="${shade(b, -0.35)}" stroke-width="5" opacity="0.25"/>
</g>
<path d="M38,82 C46,72 60,74 72,82 C88,94 100,104 116,106 C128,104 138,92 146,76" fill="none" stroke="${shade(a, -0.1)}" stroke-width="7" stroke-linecap="round"/>
<path d="M44,80 C56,78 70,86 86,96 C100,104 112,106 124,102" fill="none" stroke="${shade(a, -0.45)}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
${lace}
<path d="M18,186 C60,182 100,192 140,200 C210,210 300,210 352,204 C374,200 390,192 398,190 C402,206 392,222 372,228 C320,236 200,236 120,236 C70,236 36,236 24,232 C14,226 12,206 18,186 Z" fill="url(#smd)"/>
<path d="M22,190 C60,186 100,196 140,203 C210,213 300,213 352,207 C374,204 388,197 396,194" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.9"/>
<path d="M60,222 C90,212 120,214 150,222 C180,230 220,226 250,220" fill="none" stroke="${shade(a, -0.1)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
<path d="M24,228 C70,232 200,234 300,231 C340,229 366,224 384,216" fill="none" stroke="${shade(s, -0.2)}" stroke-width="1.5"/>
${range(16).map((i) => `<rect x="${44 + i * 20}" y="${245 - (i > 13 ? (i - 13) * 2 : 0)}" width="10" height="3" rx="1.5" fill="${shade(s, -0.7)}" opacity="0.6"/>`).join("")}`;
    },
  },

  /* ================= SUIT ================= */
  suit: {
    vb: [400, 440],
    defaults: { cloth: "#1f2937", shirt: "#ffffff", tie: "#111827" },
    draw: (o) => {
      const c = o.cloth, sh = o.shirt, t = o.tie;
      const body = "M160,46 L80,74 C66,86 84,138 92,162 L96,404 C140,414 176,416 192,410 L200,336 L208,410 C224,416 260,414 304,404 L308,162 C316,138 334,86 320,74 L240,46 Z";
      return `<defs>
${lg("sub", [shade(c, -0.35), shade(c, 0.12), c, shade(c, 0.15), shade(c, -0.4)], 0, 0, 1, 0)}
${lg("sus", [shade(c, -0.15), shade(c, -0.45)], 0, 0, 1, 0)}
${lg("sul", [shade(c, 0.22), shade(c, -0.1)], 0, 0, 1, 1)}
${lg("sush", [shade(sh, -0.12), sh, shade(sh, -0.08)], 0, 0, 1, 0)}
${lg("sut", [shade(t, 0.25), t, shade(t, -0.3)], 0, 0, 1, 0)}
</defs>
<path d="M80,74 C56,88 50,150 48,250 L44,392 L92,396 L96,164 C88,140 76,100 80,74 Z" fill="url(#sus)"/>
<path d="M320,74 C344,88 350,150 352,250 L356,392 L308,396 L304,164 C312,140 324,100 320,74 Z" fill="url(#sus)"/>
<path d="M44,384 L92,388 L92,396 L44,392 Z M356,384 L308,388 L308,396 L356,392 Z" fill="${shade(sh, -0.05)}"/>
<path d="M44,376 L92,380 L92,388 L44,384 Z M356,376 L308,380 L308,388 L356,384 Z" fill="${shade(c, -0.3)}"/>
<path d="M160,46 C176,36 224,36 240,46 L234,66 L166,66 Z" fill="${shade(c, -0.55)}"/>
<path d="${body}" fill="url(#sub)"/>
<path d="M162,48 L238,48 L200,252 Z" fill="url(#sush)"/>
<path d="M162,48 L196,60 L186,92 Z M238,48 L204,60 L214,92 Z" fill="${shade(sh, -0.04)}" stroke="${shade(sh, -0.2)}" stroke-width="1"/>
<path d="M190,62 L210,62 L206,84 L194,84 Z" fill="url(#sut)"/>
<path d="M194,84 L206,84 L216,214 L200,236 L184,214 Z" fill="url(#sut)"/>
<path d="M198,88 L196,210" stroke="${shade(t, 0.4)}" stroke-width="2" opacity="0.4"/>
<path d="M162,46 L200,252 L136,160 L152,126 L136,118 L150,54 Z" fill="url(#sul)" stroke="${shade(c, -0.45)}" stroke-width="1.2"/>
<path d="M238,46 L200,252 L264,160 L248,126 L264,118 L250,54 Z" fill="url(#sul)" stroke="${shade(c, -0.45)}" stroke-width="1.2"/>
<path d="M200,252 L200,336 L192,410 M200,336 L208,410" fill="none" stroke="${shade(c, -0.5)}" stroke-width="1.5"/>
<path d="M120,170 C126,240 128,300 126,400 M280,170 C274,240 272,300 274,400" fill="none" stroke="${shade(c, -0.35)}" stroke-width="1.2" opacity="0.7"/>
<rect x="230" y="178" width="46" height="7" rx="2" fill="${shade(c, -0.3)}" transform="rotate(-6 253 181)"/>
<path d="M236,180 L246,166 L256,178 L266,168 L270,178 Z" fill="${shade(sh, -0.03)}" transform="rotate(-6 253 181)"/>
<path d="M108,300 L168,302 L168,314 L108,312 Z M232,302 L292,300 L292,312 L232,314 Z" fill="${shade(c, -0.1)}" stroke="${shade(c, -0.45)}" stroke-width="1.2"/>
<circle cx="200" cy="268" r="6" fill="${shade(c, -0.6)}"/><circle cx="200" cy="320" r="6" fill="${shade(c, -0.6)}"/>
<circle cx="198.5" cy="266.5" r="2" fill="${shade(c, 0.3)}"/><circle cx="198.5" cy="318.5" r="2" fill="${shade(c, 0.3)}"/>
${range(3).map((i) => `<circle cx="${80 - i * 0.3}" cy="${366 - i * 9}" r="3" fill="${shade(c, -0.6)}"/><circle cx="${320 + i * 0.3}" cy="${366 - i * 9}" r="3" fill="${shade(c, -0.6)}"/>`).join("")}
<path d="M84,82 C96,90 104,110 106,140 M316,82 C304,90 296,110 294,140" fill="none" stroke="${shade(c, 0.3)}" stroke-width="6" opacity="0.15" stroke-linecap="round"/>`;
    },
  },

  /* ================= SUNGLASSES ================= */
  sunglasses: {
    vb: [400, 240],
    defaults: { frame: "#111111", lens: "#1f2937" },
    draw: (o) => {
      const f = o.frame, l = o.lens;
      const L = "M34,74 Q112,58 186,70 Q196,112 176,158 Q140,184 84,176 Q40,166 36,118 Z";
      const R = "M218,72 Q270,64 324,74 Q332,110 318,150 Q292,172 254,166 Q222,158 218,118 Z";
      const glare = (id: string) =>
        `<g clip-path="url(#${id})"><path d="M20,140 L120,40 L150,40 L40,170 Z M210,130 L280,50 L296,50 L214,150 Z" fill="#ffffff" opacity="0.18"/><path d="M0,100 L100,0 L112,0 L8,120 Z M200,100 L290,10 L298,10 L206,110 Z" fill="#ffffff" opacity="0.12"/></g>`;
      return `<defs>
${lg("gl", [shade(l, 0.25), l, shade(l, -0.5)], 0, 0, 0.3, 1)}
${lg("gf", [shade(f, 0.35), f, shade(f, -0.4)], 0, 0, 0, 1)}
${lg("gr", ["#ffffff|0.5", "#ffffff|0"], 0, 0, 0, 1)}
<clipPath id="gcL"><path d="${L}"/></clipPath><clipPath id="gcR"><path d="${R}"/></clipPath>
</defs>
${shadow(190, 214, 170, 12, 0.22)}
<path d="M322,78 L386,60 Q394,58 395,66 L398,128 Q398,140 390,138" fill="none" stroke="url(#gf)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M330,82 L386,66" stroke="${shade(f, 0.45)}" stroke-width="2" opacity="0.5"/>
<path d="${L}" fill="url(#gl)" stroke="url(#gf)" stroke-width="13" stroke-linejoin="round"/>
<path d="${R}" fill="url(#gl)" stroke="url(#gf)" stroke-width="11" stroke-linejoin="round"/>
${glare("gcL")}${glare("gcR")}
<path d="M48,88 Q110,76 176,84 Q176,104 170,116 Q120,90 50,112 Z" fill="url(#gr)" opacity="0.45" clip-path="url(#gcL)"/>
<path d="M28,72 Q112,52 192,66 L196,78 Q112,64 34,84 Z M212,70 Q270,60 328,70 L330,82 Q270,72 214,82 Z" fill="${shade(f, -0.2)}"/>
<path d="M36,70 Q112,54 188,64" fill="none" stroke="${shade(f, 0.6)}" stroke-width="2" opacity="0.55"/>
<path d="M188,74 Q202,60 218,74" fill="none" stroke="url(#gf)" stroke-width="10" stroke-linecap="round"/>
<path d="M190,70 Q202,60 216,70" fill="none" stroke="${shade(f, 0.6)}" stroke-width="1.5" opacity="0.6"/>
<circle cx="48" cy="80" r="3" fill="${shade(f, 0.7)}"/><circle cx="314" cy="80" r="2.5" fill="${shade(f, 0.7)}"/>`;
    },
  },

  /* ================= HANDBAG ================= */
  handbag: {
    vb: [400, 400],
    defaults: { body: "#111111", trim: "#d4af37" },
    draw: (o) => {
      const b = o.body, t = o.trim;
      const bag = "M78,186 Q80,172 96,172 L304,172 Q320,172 322,186 L346,350 Q348,372 326,372 L74,372 Q52,372 54,350 Z";
      return `<defs>
${lg("hb", [shade(b, 0.12), shade(b, 0.28), b, shade(b, -0.3)], 0, 0, 1, 0.3)}
${lg("hf", [shade(b, 0.22), shade(b, 0.05), shade(b, -0.2)], 0, 0, 0.4, 1)}
${lg("hs", [shade(b, -0.1), shade(b, -0.45)], 0, 0, 1, 0)}
${lg("hg", metal(t), 0, 0, 1, 1)}
${lgu("hh", [shade(b, 0.3), b, shade(b, -0.3)], 0, 60, 0, 190)}
</defs>
${shadow(205, 372, 175, 16, 0.35)}
<path d="M300,172 L328,164 Q342,164 344,178 L368,340 Q370,360 352,368 L326,372 Q348,372 346,350 L322,186 Q320,172 304,172 Z" fill="url(#hs)"/>
<path d="M140,176 C138,70 262,70 260,176" fill="none" stroke="${shade(b, -0.4)}" stroke-width="20" stroke-linecap="round"/>
<path d="M140,176 C138,74 262,74 260,176" fill="none" stroke="url(#hh)" stroke-width="15" stroke-linecap="round"/>
<path d="M146,160 C150,96 250,96 254,160" fill="none" stroke="${shade(b, 0.5)}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.6"/>
<path d="${bag}" fill="url(#hb)"/>
<path d="M60,336 Q200,346 340,336" fill="none" stroke="${shade(b, 0.4)}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.5"/>
<path d="M78,186 Q80,172 96,172 L304,172 Q320,172 322,186 L332,262 Q200,300 68,262 Z" fill="url(#hf)"/>
<path d="M84,190 Q86,180 98,180 L302,180 Q314,180 316,190 L324,256 Q200,290 76,256 Z" fill="none" stroke="${shade(b, 0.45)}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.55"/>
<path d="M90,178 L310,178" stroke="${shade(b, 0.55)}" stroke-width="2" opacity="0.4"/>
<rect x="128" y="160" width="24" height="24" rx="5" fill="url(#hg)"/><rect x="248" y="160" width="24" height="24" rx="5" fill="url(#hg)"/>
<circle cx="140" cy="172" r="4" fill="${shade(t, -0.4)}"/><circle cx="260" cy="172" r="4" fill="${shade(t, -0.4)}"/>
<rect x="170" y="262" width="60" height="40" rx="10" fill="url(#hg)"/>
<rect x="176" y="268" width="48" height="28" rx="7" fill="none" stroke="${shade(t, -0.35)}" stroke-width="1.5"/>
<ellipse cx="200" cy="282" rx="12" ry="8" fill="url(#hg)" stroke="${shade(t, -0.4)}" stroke-width="1.5"/>
<path d="M176,270 L200,270" stroke="#ffffff" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
<path d="M96,200 Q92,280 80,350" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.08" stroke-linecap="round"/>
<ellipse cx="84" cy="372" rx="10" ry="4" fill="url(#hg)"/><ellipse cx="316" cy="372" rx="10" ry="4" fill="url(#hg)"/>`;
    },
  },
  /* ================= MAN ================= */
  man: {
    vb: [400, 420],
    defaults: { skin: "#e0ac85", hair: "#1f1a17", jacket: "#2b2b2b", shirt: "#f5f5f5" },
    draw: (o) => {
      const k = o.skin, h = o.hair, j = o.jacket, sh = o.shirt;
      const face = "M146,128 C146,90 170,72 200,72 C230,72 254,90 254,128 C254,150 253,168 250,184 C246,206 230,228 212,236 C205,239 195,239 188,236 C170,228 154,206 150,184 C147,168 146,150 146,128 Z";
      return `<defs>
${lg("mf", [shade(k, 0.12), k, shade(k, -0.18)], 0, 0, 1, 0.2)}
${lg("mn", [shade(k, -0.35), shade(k, -0.12)])}
${lg("mh", [shade(h, 0.25), h, shade(h, -0.3)], 0, 0, 1, 1)}
${lg("mj", [shade(j, 0.18), j, shade(j, -0.35)], 0, 0, 1, 0.4)}
${lg("ml", [shade(j, 0.28), shade(j, -0.05)], 0, 0, 1, 1)}
${lg("ms", [sh, shade(sh, -0.15)])}
${lg("mg", ["#2a3442", "#0b0f14"], 0, 0, 0.4, 1)}
${rg("mglow", [shade(k, 0.4) + "|0.7", shade(k, 0.4) + "|0"], 0.35, 0.3, 0.5)}
<clipPath id="mfc"><path d="${face}"/></clipPath>
</defs>
<path d="M172,200 L172,276 Q200,292 228,276 L228,200 Z" fill="url(#mn)"/>
<path d="M14,420 C16,350 46,308 108,292 L170,266 L230,266 L292,292 C354,308 384,350 386,420 Z" fill="url(#mj)"/>
<path d="M172,262 L228,262 L218,320 L200,372 L182,320 Z" fill="url(#ms)"/>
<path d="M176,256 L224,256 L200,304 Z" fill="${shade(k, -0.2)}"/>
<path d="M178,256 L162,288 L194,318 L198,296 Z M222,256 L238,288 L206,318 L202,296 Z" fill="${sh}" stroke="${shade(sh, -0.25)}" stroke-width="1"/>
<path d="M168,268 L200,376 L182,420 L146,420 L118,336 L140,314 L124,302 Z" fill="url(#ml)" stroke="${shade(j, -0.5)}" stroke-width="1.2"/>
<path d="M232,268 L200,376 L218,420 L254,420 L282,336 L260,314 L276,302 Z" fill="url(#ml)" stroke="${shade(j, -0.5)}" stroke-width="1.2"/>
<path d="M60,330 C70,360 72,390 70,420 M340,330 C330,360 328,390 330,420" fill="none" stroke="${shade(j, -0.4)}" stroke-width="2" opacity="0.7"/>
<path d="M110,300 C140,296 150,300 160,320" fill="none" stroke="${shade(j, 0.35)}" stroke-width="5" opacity="0.25" stroke-linecap="round"/>
<ellipse cx="146" cy="152" rx="11" ry="19" fill="${shade(k, -0.08)}"/><ellipse cx="254" cy="152" rx="11" ry="19" fill="${shade(k, -0.2)}"/><path d="M144,142 Q138,152 145,164 M256,142 Q262,152 255,164" fill="none" stroke="${shade(k, -0.35)}" stroke-width="2" stroke-linecap="round"/>
<path d="${face}" fill="url(#mf)"/>
<g clip-path="url(#mfc)">
<ellipse cx="180" cy="120" rx="50" ry="50" fill="url(#mglow)"/>
<path d="M146,176 C150,212 172,232 188,238 C195,242 205,242 212,238 C230,232 250,212 254,176 C250,190 242,198 234,202 C224,194 212,190 200,192 C188,190 176,194 166,202 C158,198 150,190 146,176 Z" fill="${h}" opacity="0.82"/>
<path d="M146,160 C148,176 154,190 164,200 L170,196 C160,184 152,170 150,156 Z M254,160 C252,176 246,190 236,200 L230,196 C240,184 248,170 250,156 Z" fill="${h}" opacity="0.35"/>
<path d="M232,110 C246,130 248,170 238,196 L260,196 L260,100 Z" fill="${shade(k, -0.4)}" opacity="0.18"/>
</g>
<path d="M180,198 C188,191 212,191 220,198 C213,201 206,198 200,201 C194,198 187,201 180,198 Z" fill="${shade(h, 0.05)}"/>
<path d="M188,206 Q200,214 212,206 Q200,209 188,206 Z" fill="${shade(k, -0.3)}"/>
<path d="M198,150 C196,166 191,178 193,185 C197,190 205,190 209,185" fill="none" stroke="${shade(k, -0.3)}" stroke-width="2" stroke-linecap="round"/>
<path d="M203,150 C206,164 208,174 206,180" fill="none" stroke="${shade(k, 0.35)}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
<path d="M160,128 Q176,121 192,126 M208,126 Q224,121 240,128" fill="none" stroke="${h}" stroke-width="5" stroke-linecap="round"/>
<path d="M146,142 L156,140 M244,140 L254,142" stroke="#111" stroke-width="3"/>
<path d="M154,138 L194,137 Q198,158 186,167 L166,167 Q154,163 154,138 Z M206,137 L246,138 Q246,163 234,167 L214,167 Q202,158 206,137 Z" fill="url(#mg)" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round"/>
<path d="M194,139 Q200,135 206,139" fill="none" stroke="#0a0a0a" stroke-width="3"/>
<path d="M160,142 L176,142 L164,160 Z M212,142 L226,142 L215,158 Z" fill="#ffffff" opacity="0.18"/>
<path d="M136,146 C128,104 136,70 162,54 C182,42 214,38 238,46 C260,54 272,76 266,104 C264,118 262,130 258,146 C256,126 254,110 246,100 C226,92 200,104 176,96 C164,100 154,112 150,142 L146,152 Z" fill="url(#mh)"/>
<path d="M160,62 C186,48 220,46 250,62 M154,80 C180,62 218,60 256,80 M176,90 C200,76 228,76 252,92" fill="none" stroke="${shade(h, 0.3)}" stroke-width="2" opacity="0.5" stroke-linecap="round"/>`;
    },
  },

  /* ================= COAT ================= */
  coat: {
    vb: [400, 440],
    defaults: { cloth: "#b07a45" },
    draw: (o) => {
      const c = o.cloth;
      const btn = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="6" fill="${shade(c, -0.55)}"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="2" fill="${shade(c, 0.1)}"/>`;
      return `<defs>
${lg("cb", [shade(c, -0.3), shade(c, 0.12), c, shade(c, 0.08), shade(c, -0.35)], 0, 0, 1, 0)}
${lg("cs", [shade(c, -0.1), shade(c, -0.4)], 0, 0, 1, 0)}
${lg("cl", [shade(c, 0.2), shade(c, -0.12)], 0, 0, 1, 1)}
${lg("chg", ["#d9d9d9", "#8d8d8d"], 0, 0, 0, 1)}
${lg("cbk", ["#e8e0c8", "#a89a72"], 0, 0, 1, 1)}
</defs>
<path d="M200,58 L200,34 C200,18 216,12 224,22 C230,30 222,38 214,34" fill="none" stroke="url(#chg)" stroke-width="5" stroke-linecap="round"/>
<path d="M164,54 C176,44 224,44 236,54 L232,74 L168,74 Z" fill="${shade(c, -0.55)}"/>
<path d="M104,76 C78,82 68,110 64,160 L54,374 L100,378 L104,160 Z" fill="url(#cs)"/>
<path d="M296,76 C322,82 332,110 336,160 L346,374 L300,378 L296,160 Z" fill="url(#cs)"/>
<path d="M55,344 L102,348 L101,360 L55,356 Z M345,344 L298,348 L299,360 L345,356 Z" fill="${shade(c, -0.25)}"/>
<path d="M168,54 L104,76 C92,84 90,110 94,140 L74,420 Q200,436 326,420 L306,140 C310,110 308,84 296,76 L232,54 Z" fill="url(#cb)"/>
<path d="M210,252 L222,426 L196,428 Z" fill="${shade(c, -0.4)}" opacity="0.7"/>
<path d="M196,252 L188,428" stroke="${shade(c, -0.45)}" stroke-width="1.5"/>
<path d="M232,54 L262,82 L272,150 L240,190 L184,150 Z" fill="${shade(c, -0.08)}" stroke="${shade(c, -0.4)}" stroke-width="1"/>
<path d="M168,54 L200,150 L148,178 L120,116 L136,100 L124,76 Z" fill="url(#cl)" stroke="${shade(c, -0.4)}" stroke-width="1.2"/>
<path d="M232,54 L210,160 L252,180 L280,116 L264,100 L276,76 Z" fill="url(#cl)" stroke="${shade(c, -0.4)}" stroke-width="1.2"/>
<path d="M104,78 L150,64 L154,74 L108,90 Z M296,78 L250,64 L246,74 L292,90 Z" fill="${shade(c, -0.05)}" stroke="${shade(c, -0.4)}" stroke-width="1"/>
${btn(146, 72)}${btn(254, 72)}
${btn(172, 200)}${btn(232, 200)}${btn(172, 300)}${btn(232, 300)}${btn(172, 350)}${btn(232, 350)}
<path d="M86,232 L314,232 L315,256 L84,256 Z" fill="${shade(c, -0.12)}" stroke="${shade(c, -0.4)}" stroke-width="1"/>
<path d="M88,236 L312,236 M88,252 L312,252" stroke="${shade(c, 0.25)}" stroke-width="1" stroke-dasharray="3 3"/>
<rect x="118" y="228" width="30" height="32" rx="4" fill="none" stroke="url(#cbk)" stroke-width="5"/>
<path d="M208,244 C196,270 190,300 194,330 L208,328 C206,300 210,272 216,248 Z" fill="${shade(c, -0.15)}" stroke="${shade(c, -0.45)}" stroke-width="1"/>
<path d="M214,244 C228,266 236,292 236,318 L222,318 C222,294 216,270 208,250 Z" fill="${shade(c, -0.05)}" stroke="${shade(c, -0.45)}" stroke-width="1"/>
<ellipse cx="211" cy="245" rx="12" ry="14" fill="${shade(c, -0.1)}" stroke="${shade(c, -0.45)}" stroke-width="1"/>
<path d="M120,300 L160,296 M240,296 L280,300" stroke="${shade(c, -0.45)}" stroke-width="2" stroke-linecap="round"/>
<path d="M118,150 C112,230 100,330 96,414 M282,150 C288,230 300,330 304,414" fill="none" stroke="${shade(c, -0.3)}" stroke-width="1.2" opacity="0.6"/>
<path d="M80,412 Q200,428 320,412" fill="none" stroke="${shade(c, 0.25)}" stroke-width="1" stroke-dasharray="3 3"/>`;
    },
  },

  /* ================= HOODIE ================= */
  hoodie: {
    vb: [400, 400],
    defaults: { cloth: "#1f2937", accent: "#ffffff" },
    draw: (o) => {
      const c = o.cloth, a = o.accent;
      const rib = (x: number, y: number, w: number, hh: number, n: number) =>
        range(n).map((i) => `<line x1="${f1(x + (w / n) * (i + 0.5))}" y1="${y + 2}" x2="${f1(x + (w / n) * (i + 0.5))}" y2="${y + hh - 2}" stroke="${shade(c, -0.35)}" stroke-width="1"/>`).join("");
      return `<defs>
${lg("hd", [shade(c, -0.2), shade(c, 0.12), c, shade(c, 0.08), shade(c, -0.3)], 0, 0, 1, 0)}
${lg("hsl", [shade(c, 0.05), shade(c, -0.3)], 0, 0, 1, 0)}
${lg("hsr", [shade(c, -0.05), shade(c, -0.4)], 0, 0, 1, 0)}
${lg("hho", [shade(c, 0.15), shade(c, -0.2)])}
</defs>
${shadow(200, 388, 170, 10, 0.2)}
<path d="M120,76 C80,82 58,104 50,150 L26,330 L84,338 L98,196 Z" fill="url(#hsl)"/>
<path d="M280,76 C320,82 342,104 350,150 L374,330 L316,338 L302,196 Z" fill="url(#hsr)"/>
<path d="M26,330 L84,338 L82,362 L22,356 Z" fill="${shade(c, -0.12)}"/>${rib(22, 332, 62, 28, 12)}
<path d="M374,330 L316,338 L318,362 L378,356 Z" fill="${shade(c, -0.18)}"/>${rib(316, 332, 62, 28, 12)}
<path d="M120,74 L280,74 C298,90 304,120 304,160 L302,356 L98,356 L96,160 C96,120 102,90 120,74 Z" fill="url(#hd)"/>
<rect x="98" y="352" width="204" height="30" rx="4" fill="${shade(c, -0.1)}"/>${rib(98, 352, 204, 30, 34)}
<path d="M124,74 C126,42 160,24 200,24 C240,24 274,42 276,74 C270,104 240,122 200,124 C160,122 130,104 124,74 Z" fill="url(#hho)"/>
<path d="M152,70 C160,48 180,40 200,40 C220,40 240,48 248,70 C240,92 222,104 200,106 C178,104 160,92 152,70 Z" fill="${shade(c, -0.6)}"/>
<path d="M152,70 C170,84 230,84 248,70" fill="none" stroke="${shade(c, -0.3)}" stroke-width="3"/>
<path d="M200,106 L200,124" stroke="${shade(c, -0.4)}" stroke-width="1.5"/>
<path d="M140,96 C160,112 180,118 200,118" fill="none" stroke="${shade(c, 0.25)}" stroke-width="3" opacity="0.4"/>
<circle cx="186" cy="114" r="3.5" fill="${shade(c, -0.55)}"/><circle cx="214" cy="114" r="3.5" fill="${shade(c, -0.55)}"/>
<path d="M186,114 C184,140 188,170 182,196 M214,114 C218,140 212,170 218,204" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
<rect x="178" y="194" width="8" height="16" rx="2" fill="${shade(a, -0.25)}" transform="rotate(8 182 202)"/><rect x="214" y="202" width="8" height="16" rx="2" fill="${shade(a, -0.25)}" transform="rotate(-6 218 210)"/>
<path d="M132,262 L268,262 L284,346 L116,346 Z" fill="${shade(c, 0.04)}" stroke="${shade(c, -0.35)}" stroke-width="1.5"/>
<path d="M132,262 L116,346 M268,262 L284,346" stroke="${shade(c, -0.55)}" stroke-width="3"/>
<path d="M138,268 L262,268 M122,340 L278,340" stroke="${shade(c, 0.25)}" stroke-width="1" stroke-dasharray="3 3"/>
<g transform="translate(244 156)" fill="none" stroke="${a}" stroke-width="3" stroke-linecap="round"><circle r="13"/><path d="M-20,8 C-8,-8 8,22 22,-6"/></g>
<path d="M120,140 C130,200 128,260 124,330 M280,140 C270,200 272,260 276,330 M60,190 C70,220 76,260 74,300 M340,190 C330,220 324,260 326,300" fill="none" stroke="${shade(c, -0.4)}" stroke-width="2" opacity="0.5"/>`;
    },
  },

  /* ================= WOMAN ================= */
  woman: {
    vb: [400, 440],
    defaults: { skin: "#f1c7a8", hair: "#3b2416", lips: "#c2566b", top: "#f5e6da" },
    draw: (o) => {
      const k = o.skin, h = o.hair, l = o.lips, t = o.top;
      const face = "M154,142 C154,100 176,80 202,80 C228,80 250,100 250,142 C250,176 240,206 224,226 C216,236 208,240 202,240 C196,240 188,236 180,226 C164,206 154,176 154,142 Z";
      const eye = (x: number, flip: number) => `<g transform="translate(${x} 152) scale(${flip} 1)">
<path d="M-17,-10 Q0,-19 15,-9" fill="none" stroke="${shade(k, -0.22)}" stroke-width="1.2" opacity="0.6"/>
<path d="M-15,1 Q0,-11 15,-1 Q2,8 -15,1 Z" fill="#fbf7f4"/>
<circle cx="1" cy="-1" r="6.5" fill="${shade(h, 0.2)}"/><circle cx="1" cy="-1" r="3.2" fill="#120c08"/><circle cx="3.2" cy="-3.2" r="1.6" fill="#ffffff"/>
<path d="M-17,2 Q-16,0 -15,1 Q0,-13 15,-1" fill="none" stroke="#24150e" stroke-width="2.8" stroke-linecap="round"/>
<path d="M-12,4 Q0,8 12,2" fill="none" stroke="${shade(k, -0.3)}" stroke-width="0.8" opacity="0.6"/>
</g>`;
      return `<defs>
${lg("wf", [shade(k, 0.18), k, shade(k, -0.12)], 0, 0, 1, 0.3)}
${lg("wn", [shade(k, -0.3), shade(k, -0.08)])}
${lg("wb", [shade(k, 0.12), k, shade(k, -0.15)], 0, 0, 1, 0)}
${lg("wh", [shade(h, 0.3), h, shade(h, -0.35)], 0, 0, 0.6, 1)}
${lg("whb", [shade(h, -0.1), shade(h, -0.45)])}
${lg("wl", [shade(l, 0.15), l, shade(l, -0.3)])}
${lg("wt", [shade(t, 0.3), t, shade(t, -0.12)])}
${rg("wbl", ["#ff6f7d|0.35", "#ff6f7d|0"])}
${rg("wgl", ["#ffffff|0.35", "#ffffff|0"])}
</defs>
<path d="M202,34 C140,34 108,84 112,152 C114,214 96,262 86,322 C80,362 96,394 122,404 C136,372 150,332 156,282 C166,290 176,288 184,282 L220,282 C228,288 238,290 248,282 C254,332 268,372 282,404 C308,394 324,362 318,322 C308,262 290,214 292,152 C296,84 264,34 202,34 Z" fill="url(#whb)"/>
<path d="M180,214 L178,290 C194,302 210,302 226,290 L224,214 Z" fill="url(#wn)"/>
<path d="M36,440 C40,360 86,326 142,316 C166,310 178,298 180,276 L224,276 C226,298 238,310 262,316 C318,326 364,360 368,440 Z" fill="url(#wb)"/>
<path d="M180,262 C192,274 212,274 224,262 L224,244 C210,256 194,256 180,244 Z" fill="${shade(k, -0.35)}" opacity="0.35"/>
<path d="M160,330 Q182,342 196,336 M244,330 Q222,342 208,336" fill="none" stroke="${shade(k, -0.22)}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<path d="M46,440 C56,404 92,388 140,392 C172,396 232,396 264,392 C312,388 348,404 358,440 Z" fill="url(#wt)"/>
<path d="M70,416 C120,402 180,406 220,404" fill="none" stroke="${shade(t, -0.15)}" stroke-width="1.5" opacity="0.7"/>
<g transform="translate(202 162) scale(1.1) translate(-202 -150)">
<path d="${face}" fill="url(#wf)"/>
<ellipse cx="178" cy="184" rx="20" ry="13" fill="url(#wbl)"/><ellipse cx="228" cy="184" rx="18" ry="12" fill="url(#wbl)"/>
<ellipse cx="190" cy="118" rx="26" ry="16" fill="url(#wgl)"/><ellipse cx="174" cy="170" rx="12" ry="8" fill="url(#wgl)"/>
<path d="M164,134 Q178,124 192,132 M212,132 Q226,124 240,134" fill="none" stroke="${shade(h, 0.1)}" stroke-width="3.2" stroke-linecap="round"/>
${eye(178, 1)}${eye(226, -1)}
<path d="M205,170 C204,178 200,184 198,188 C201,192 206,193 210,190" fill="none" stroke="${shade(k, -0.28)}" stroke-width="1.6" stroke-linecap="round"/>
<path d="M208,172 C209,178 208,182 207,185" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
<path d="M186,207 C192,201 198,200 203,203 C208,200 214,201 220,207 C212,209 194,209 186,207 Z" fill="${shade(l, -0.1)}"/>
<path d="M186,207 C194,210 212,210 220,207 C216,218 208,222 203,222 C198,222 190,218 186,207 Z" fill="url(#wl)"/>
<path d="M196,214 Q203,217 210,213" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
<circle cx="157" cy="178" r="3" fill="#e9c46a"/><path d="M157,181 L157,192" stroke="#e9c46a" stroke-width="1.5"/><circle cx="157" cy="195" r="3.5" fill="#f4d98a"/>
<path d="M202,38 C150,38 120,80 124,150 C126,206 116,250 106,292 C132,256 146,210 150,168 C154,130 168,100 200,86 C228,96 238,74 236,56 C226,44 214,38 202,38 Z" fill="url(#wh)"/>
<path d="M210,40 C262,44 288,84 284,150 C282,206 296,262 312,312 C284,286 262,236 254,180 C250,140 246,110 232,92 C220,80 210,62 210,40 Z" fill="url(#wh)"/>
<path d="M200,86 C168,100 156,130 156,160" fill="none" stroke="${shade(h, -0.4)}" stroke-width="2" opacity="0.5"/>
<path d="M140,100 C132,150 136,200 120,260 M262,96 C276,150 270,210 290,280 M180,46 C160,60 146,80 140,110" fill="none" stroke="${shade(h, 0.4)}" stroke-width="2.5" opacity="0.45" stroke-linecap="round"/>
</g>`;
    },
  },

  /* ================= SKINCARE BOTTLES ================= */
  bottles: {
    vb: [400, 400],
    defaults: { main: "#f9d5dc", cap: "#ffffff", label: "#e8a0b4" },
    draw: (o) => {
      const m = o.main, c = o.cap, l = o.label;
      const gloss = (x: number, y: number, w: number, hh: number) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${w / 2}" fill="#ffffff" opacity="0.45"/>`;
      return `<defs>
${lg("bm", [shade(m, -0.12), shade(m, 0.35), m, shade(m, -0.18)], 0, 0, 1, 0)}
${lg("bc", [shade(c, -0.22), c, shade(c, -0.08), shade(c, -0.3)], 0, 0, 1, 0)}
${lg("bl", [shade(l, -0.05), shade(l, 0.2), l, shade(l, -0.2)], 0, 0, 1, 0)}
</defs>
${shadow(200, 372, 180, 16, 0.3)}
<rect x="96" y="58" width="30" height="16" rx="4" fill="url(#bc)"/>
<path d="M96,64 L62,66 Q56,66 56,72 L56,74 L96,74 Z" fill="url(#bc)"/>
<rect x="104" y="72" width="14" height="40" fill="url(#bc)"/>
<rect x="92" y="108" width="38" height="30" rx="5" fill="url(#bc)"/>
<path d="M70,148 Q70,134 86,134 L136,134 Q152,134 152,148 L152,352 Q152,368 136,368 L86,368 Q70,368 70,352 Z" fill="url(#bm)"/>
<rect x="70" y="210" width="82" height="96" fill="url(#bl)"/>
<rect x="84" y="236" width="54" height="4" rx="2" fill="#ffffff" opacity="0.7"/><rect x="92" y="248" width="38" height="3" rx="1.5" fill="#ffffff" opacity="0.5"/><rect x="96" y="276" width="30" height="8" rx="4" fill="#ffffff" opacity="0.5"/>
${gloss(80, 146, 8, 200)}
<path d="M290,348 L330,348 L334,372 L286,372 Z" fill="url(#bc)"/>
<path d="M292,350 L254,110 L366,110 L328,350 Z" fill="url(#bm)"/>
<rect x="250" y="96" width="120" height="18" rx="3" fill="url(#bm)"/>
${range(9).map((i) => `<line x1="${258 + i * 13}" y1="98" x2="${258 + i * 13}" y2="112" stroke="${shade(m, -0.2)}" stroke-width="1.2"/>`).join("")}
<path d="M270,190 L350,190 L340,270 L280,270 Z" fill="url(#bl)"/>
<rect x="290" y="214" width="40" height="4" rx="2" fill="#ffffff" opacity="0.7"/><rect x="296" y="226" width="28" height="3" rx="1.5" fill="#ffffff" opacity="0.5"/>
<path d="M266,120 L298,340" stroke="#ffffff" stroke-width="7" opacity="0.4" stroke-linecap="round"/>
<path d="M190,136 C190,112 230,112 230,136 L232,190 L188,190 Z" fill="url(#bc)"/>
<rect x="182" y="186" width="56" height="34" rx="4" fill="url(#bl)"/>
${range(6).map((i) => `<line x1="${188 + i * 9}" y1="188" x2="${188 + i * 9}" y2="218" stroke="${shade(l, -0.25)}" stroke-width="1"/>`).join("")}
<path d="M176,236 Q176,220 196,220 L224,220 Q244,220 244,236 L248,356 Q248,372 232,372 L188,372 Q172,372 172,356 Z" fill="url(#bm)"/>
<rect x="172" y="272" width="76" height="62" fill="url(#bl)"/>
<rect x="188" y="292" width="44" height="4" rx="2" fill="#ffffff" opacity="0.7"/><rect x="196" y="304" width="28" height="3" rx="1.5" fill="#ffffff" opacity="0.5"/>
${gloss(182, 230, 7, 130)}
<path d="M198,122 C198,116 206,114 208,120" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`;
    },
  },
  /* ================= PERFUME ================= */
  perfume: {
    vb: [400, 400],
    defaults: { glass: "#3b1d0f", liquid: "#7c2d12", cap: "#c9a96e", kind: "square" },
    draw: (o) => {
      const g = o.glass, q = o.liquid, c = o.cap;
      const defs = `<defs>
${lg("pg", [shade(g, 0.25), g, shade(g, -0.35), shade(g, 0.1)], 0, 0, 1, 0)}
${lg("pq", [shade(q, 0.35), q, shade(q, -0.3)], 0, 0, 0.8, 1)}
${lg("pc", metal(c), 0, 0, 1, 0)}
${lg("pcv", [shade(c, 0.45), c, shade(c, -0.3)])}
${lg("pr", ["#ffffff|0.55", "#ffffff|0"], 0, 0, 1, 0)}
${rg("pgl", [shade(q, 0.45) + "|0.45", shade(q, 0.3) + "|0"], 0.5, 0.5, 0.5)}
</defs>`;
      if (o.kind === "round") {
        return `${defs}${shadow(200, 372, 140, 16, 0.35)}
<circle cx="200" cy="260" r="112" fill="url(#pg)"/>
<clipPath id="prc"><circle cx="200" cy="260" r="96"/></clipPath>
<g clip-path="url(#prc)"><rect x="90" y="196" width="220" height="180" fill="url(#pq)"/><ellipse cx="200" cy="198" rx="96" ry="10" fill="${shade(q, 0.35)}"/></g>
<circle cx="200" cy="260" r="96" fill="none" stroke="${shade(g, 0.45)}" stroke-width="2" opacity="0.6"/>
<ellipse cx="200" cy="300" rx="60" ry="40" fill="url(#pgl)"/>
<path d="M120,210 A96,96 0 0 1 200,164" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.5"/>
<path d="M112,280 A90,90 0 0 0 150,340" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.35"/>
<rect x="176" y="136" width="48" height="24" rx="3" fill="url(#pc)"/>
<path d="M160,140 L160,50 Q160,36 174,36 L226,36 Q240,36 240,50 L240,140 Z" fill="url(#pc)"/>
<ellipse cx="200" cy="38" rx="40" ry="6" fill="${shade(c, 0.45)}"/>
<rect x="166" y="46" width="8" height="88" rx="4" fill="#ffffff" opacity="0.4"/>`;
      }
      if (o.kind === "tall") {
        return `${defs}${shadow(200, 374, 100, 14, 0.35)}
<rect x="140" y="130" width="120" height="244" rx="10" fill="url(#pg)"/>
<rect x="154" y="170" width="92" height="186" rx="4" fill="url(#pq)"/>
<rect x="154" y="170" width="92" height="8" fill="${shade(q, 0.3)}"/>
<ellipse cx="200" cy="300" rx="40" ry="50" fill="url(#pgl)"/>
<rect x="148" y="140" width="10" height="226" rx="5" fill="url(#pr)"/>
<rect x="242" y="140" width="6" height="226" rx="3" fill="#ffffff" opacity="0.2"/>
<rect x="140" y="356" width="120" height="18" rx="6" fill="${shade(g, 0.15)}" opacity="0.6"/>
<rect x="178" y="112" width="44" height="20" rx="3" fill="url(#pc)"/>
<rect x="166" y="22" width="68" height="94" rx="8" fill="url(#pc)"/>
<rect x="174" y="30" width="8" height="78" rx="4" fill="#ffffff" opacity="0.45"/>`;
      }
      return `${defs}${shadow(200, 374, 150, 16, 0.35)}
<path d="M108,170 L292,170 L304,182 L304,358 L292,372 L108,372 L96,358 L96,182 Z" fill="url(#pg)"/>
<path d="M120,196 L280,196 L280,348 L120,348 Z" fill="url(#pq)"/>
<rect x="120" y="196" width="160" height="10" fill="${shade(q, 0.35)}"/>
<ellipse cx="200" cy="300" rx="70" ry="44" fill="url(#pgl)"/>
<path d="M96,182 L120,196 L120,348 L96,358 Z" fill="${shade(g, 0.35)}" opacity="0.55"/>
<path d="M304,182 L280,196 L280,348 L304,358 Z" fill="${shade(g, -0.4)}" opacity="0.6"/>
<path d="M108,170 L292,170 L280,196 L120,196 Z" fill="${shade(g, 0.45)}" opacity="0.5"/>
<path d="M108,372 L292,372 L280,348 L120,348 Z" fill="${shade(g, -0.2)}" opacity="0.7"/>
<path d="M106,186 L106,354" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
<path d="M132,206 L150,206 L132,300 Z" fill="#ffffff" opacity="0.18"/>
<rect x="172" y="146" width="56" height="26" rx="2" fill="url(#pc)"/>
<path d="M136,146 L136,60 L150,44 L250,44 L264,60 L264,146 Z" fill="url(#pc)"/>
<path d="M150,44 L250,44 L240,58 L160,58 Z" fill="${shade(c, 0.5)}"/>
<path d="M136,60 L150,44 L160,58 L160,146 L136,146 Z" fill="${shade(c, 0.25)}" opacity="0.7"/>
<path d="M264,60 L250,44 L240,58 L240,146 L264,146 Z" fill="${shade(c, -0.35)}" opacity="0.7"/>`;
    },
  },

  /* ================= LIPSTICK ================= */
  lipstick: {
    vb: [400, 400],
    defaults: { color: "#c8102e", case: "#d4af37" },
    draw: (o) => {
      const l = o.color, c = o.case;
      return `<defs>
${lg("lc", metal(c), 0, 0, 1, 0)}
${lg("lb", [shade(l, 0.25), l, shade(l, -0.45)], 0, 0, 1, 0)}
${lg("lk", [shade(l, -0.35), shade(l, 0.2), l, shade(l, -0.55), shade(l, -0.2)], 0, 0, 1, 0)}
</defs>
${shadow(210, 374, 170, 14, 0.32)}
<path d="M226,128 Q226,112 242,112 L278,112 Q294,112 294,128 L294,282 L226,282 Z" fill="url(#lk)"/>
<rect x="234" y="120" width="8" height="156" rx="4" fill="#ffffff" opacity="0.4"/>
<rect x="222" y="282" width="76" height="6" fill="${shade(c, -0.5)}"/>
<rect x="222" y="288" width="76" height="84" rx="3" fill="url(#lc)"/>
<rect x="222" y="296" width="76" height="3" fill="${shade(c, 0.5)}" opacity="0.7"/>
<path d="M120,170 L120,104 Q120,92 132,86 L164,66 Q172,62 172,72 L172,170 Z" fill="url(#lb)"/>
<path d="M126,166 L126,104 Q126,96 134,92 L150,82" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
<path d="M120,104 Q120,92 132,86 L164,66 Q172,62 172,72 L172,84 Q150,90 120,112 Z" fill="${shade(l, 0.15)}" opacity="0.6"/>
<rect x="112" y="166" width="68" height="70" rx="3" fill="url(#lc)"/>
<rect x="112" y="166" width="68" height="5" fill="${shade(c, -0.4)}" opacity="0.6"/>
<rect x="104" y="236" width="84" height="136" rx="4" fill="url(#lc)"/>
<rect x="104" y="236" width="84" height="6" fill="${shade(c, -0.35)}"/>
<rect x="104" y="350" width="84" height="3" fill="${shade(c, -0.3)}" opacity="0.7"/>
<rect x="112" y="246" width="7" height="118" rx="3.5" fill="#ffffff" opacity="0.45"/>`;
    },
  },

  /* ================= CREAM JAR ================= */
  jar: {
    vb: [400, 340],
    defaults: { jar: "#f9a8d4", lid: "#fbcfe8", cream: "#ffffff" },
    draw: (o) => {
      const j = o.jar, l = o.lid, c = o.cream;
      return `<defs>
${lg("jb", [shade(j, -0.15), shade(j, 0.35), j, shade(j, -0.25)], 0, 0, 1, 0)}
${lg("jl", [shade(l, 0.4), l, shade(l, -0.2)], 0, 0, 1, 1)}
${lg("jls", [shade(l, -0.1), shade(l, -0.35)], 0, 0, 1, 0)}
${rg("jc", [c, shade(c, -0.08), shade(c, -0.2)], 0.4, 0.4, 0.6)}
</defs>
${shadow(205, 312, 190, 16, 0.3)}
<ellipse cx="332" cy="182" rx="56" ry="104" fill="url(#jls)"/>
<ellipse cx="320" cy="182" rx="56" ry="104" fill="url(#jl)"/>
<ellipse cx="320" cy="182" rx="42" ry="82" fill="none" stroke="${shade(l, 0.45)}" stroke-width="2" opacity="0.7"/>
<ellipse cx="312" cy="140" rx="14" ry="40" fill="#ffffff" opacity="0.35"/>
<path d="M30,150 L30,276 Q30,306 150,306 Q270,306 270,276 L270,150 Z" fill="url(#jb)"/>
<path d="M30,262 Q30,292 150,292 Q270,292 270,262" fill="none" stroke="${shade(j, -0.2)}" stroke-width="2" opacity="0.6"/>
<rect x="44" y="160" width="12" height="120" rx="6" fill="#ffffff" opacity="0.4"/>
<ellipse cx="150" cy="150" rx="120" ry="34" fill="${shade(j, 0.2)}"/>
<ellipse cx="150" cy="150" rx="108" ry="28" fill="${shade(j, -0.15)}"/>
<ellipse cx="150" cy="153" rx="104" ry="25" fill="url(#jc)"/>
<path d="M58,153 A92,23 0 0 1 242,151 A80,19 0 0 1 74,152 A66,15 0 0 1 220,150 A52,12 0 0 1 100,151 A38,9 0 0 1 188,150 A24,6 0 0 1 132,150" fill="none" stroke="${shade(c, -0.2)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
<path d="M58,153 A92,23 0 0 1 242,151 A80,19 0 0 1 74,152 A66,15 0 0 1 220,150 A52,12 0 0 1 100,151 A38,9 0 0 1 188,150 A24,6 0 0 1 132,150" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.9" transform="translate(0 -2.5)"/>
<path d="M146,152 C140,140 146,126 162,118 C158,132 166,142 158,152 Z" fill="${c}" stroke="${shade(c, -0.18)}" stroke-width="1.2"/>`;
    },
  },

  /* ================= SERUM ================= */
  serum: {
    vb: [400, 400],
    defaults: { glass: "#e0f2fe", liquid: "#93c5fd", cap: "#ffffff" },
    draw: (o) => {
      const g = o.glass, q = o.liquid, c = o.cap;
      return `<defs>
${lg("sg", [shade(g, -0.12), shade(g, 0.5), g, shade(g, -0.2)], 0, 0, 1, 0)}
${lg("sq", [shade(q, 0.25), q, shade(q, -0.25)], 0, 0, 1, 0.3)}
${lg("sc", [shade(c, -0.2), c, shade(c, -0.05), shade(c, -0.3)], 0, 0, 1, 0)}
${lg("sb", [shade(c, -0.1), shade(c, -0.25), shade(c, -0.45)], 0, 0, 1, 0)}
${lg("sd", [shade(q, 0.55), q, shade(q, -0.3)], 0, 0, 1, 1)}
</defs>
${shadow(190, 372, 170, 14, 0.28)}
<ellipse cx="310" cy="360" rx="64" ry="10" fill="${q}" opacity="0.45"/>
<path d="M262,360 C272,346 276,334 278,320 C282,336 290,348 300,354 C302,338 306,322 312,308 C318,324 322,342 330,352 C338,342 344,332 350,322 C352,338 352,350 360,360 Q310,368 262,360 Z" fill="url(#sd)" opacity="0.9"/><circle cx="278" cy="316" r="4" fill="url(#sd)"/><circle cx="312" cy="303" r="5" fill="url(#sd)"/><circle cx="350" cy="318" r="4" fill="url(#sd)"/>
<circle cx="266" cy="296" r="5" fill="url(#sd)"/><circle cx="352" cy="290" r="4" fill="url(#sd)"/><circle cx="314" cy="276" r="5.5" fill="url(#sd)"/><circle cx="372" cy="334" r="3.5" fill="url(#sd)"/>
<path d="M312,180 C312,180 288,216 288,232 C288,246 299,256 312,256 C325,256 336,246 336,232 C336,216 312,180 312,180 Z" fill="url(#sd)"/>
<path d="M300,226 C300,218 306,208 310,202" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
<path d="M112,210 Q112,186 136,184 L204,184 Q228,186 228,210 L228,352 Q228,372 208,372 L132,372 Q112,372 112,352 Z" fill="url(#sg)" stroke="${shade(g, -0.3)}" stroke-width="1.5"/>
<path d="M124,236 L216,236 L216,348 Q216,360 204,360 L136,360 Q124,360 124,348 Z" fill="url(#sq)"/>
<ellipse cx="170" cy="236" rx="46" ry="5" fill="${shade(q, 0.35)}"/>
<path d="M166,150 L174,150 L174,350 Q170,356 166,350 Z" fill="#ffffff" opacity="0.35"/>
<rect x="122" y="196" width="10" height="160" rx="5" fill="#ffffff" opacity="0.6"/>
<rect x="208" y="200" width="6" height="150" rx="3" fill="#ffffff" opacity="0.3"/>
<rect x="138" y="146" width="64" height="42" rx="5" fill="url(#sc)"/>
${range(8).map((i) => `<line x1="${144 + i * 7.5}" y1="150" x2="${144 + i * 7.5}" y2="184" stroke="${shade(c, -0.18)}" stroke-width="1"/>`).join("")}
<path d="M146,146 L146,92 C146,58 194,58 194,92 L194,146 Z" fill="url(#sb)"/>
<path d="M154,140 L154,94 C154,76 166,70 172,70" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.45"/>`;
    },
  },

  /* ================= BRUSHES ================= */
  brushes: {
    vb: [400, 400],
    defaults: { handle: "#f9a8d4", metal: "#e5c07b" },
    draw: (o) => {
      const h = o.handle, m = o.metal;
      const cup = mix(h, "#ffffff", 0.55);
      const blush = mix(h, "#e2556f", 0.45);
      const tip: Record<string, string> = {
        dome: "M-24,-34 C-30,-70 -20,-104 0,-110 C20,-104 30,-70 24,-34 Z",
        flat: "M-16,-34 C-22,-60 -22,-84 -12,-96 L12,-96 C22,-84 22,-60 16,-34 Z",
        angle: "M-14,-34 C-18,-54 -18,-70 -12,-84 L14,-70 C18,-58 18,-46 14,-34 Z",
        fan: "M-6,-34 C-30,-60 -48,-80 -44,-96 C-20,-110 20,-110 44,-96 C48,-80 30,-60 6,-34 Z",
      };
      const brush = (x: number, y: number, a: number, t: string) => `<g transform="translate(${x} ${y}) rotate(${a})">
<path d="M-7,0 L-5,104 Q0,110 5,104 L7,0 Z" fill="url(#brh)"/>
<rect x="-9" y="-36" width="18" height="40" rx="2" fill="url(#brm)"/>
<line x1="-9" y1="-28" x2="9" y2="-28" stroke="${shade(m, -0.4)}" stroke-width="1"/>
<path d="${tip[t]}" fill="url(#brb)"/>
<path d="${tip[t]}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.2"/>
</g>`;
      return `<defs>
${lgu("brh", [shade(h, -0.2), shade(h, 0.35), h, shade(h, -0.35)], -7, 0, 7, 0)}
${lgu("brm", metal(m), -9, 0, 9, 0)}
${lgu("brb", ["#1c1513", "#4a3530", "#8a6a5c"], 0, -34, 0, -110)}
${lg("brc", [shade(cup, -0.15), shade(cup, 0.5), cup, shade(cup, -0.2)], 0, 0, 1, 0)}
${lg("brk", metal(m), 0, 0, 1, 0)}
${rg("brp", [shade(blush, 0.25), blush, shade(blush, -0.2)], 0.4, 0.4, 0.6)}
${lg("brmi", ["#f4f7fb", "#c9d3df", "#eef2f7"], 0, 0, 1, 1)}
</defs>
${shadow(200, 372, 190, 14, 0.3)}
${brush(104, 240, -20, "fan")}${brush(176, 216, 12, "dome")}${brush(140, 196, -4, "angle")}${brush(198, 250, 26, "flat")}
<path d="M68,226 L212,226 L204,360 Q204,372 190,372 L90,372 Q76,372 76,360 Z" fill="url(#brc)"/>
<ellipse cx="140" cy="226" rx="72" ry="10" fill="${shade(cup, -0.25)}"/>
<path d="M68,226 Q140,240 212,226" fill="none" stroke="${shade(cup, 0.5)}" stroke-width="2"/>
<rect x="84" y="240" width="9" height="120" rx="4.5" fill="#ffffff" opacity="0.5"/>
<ellipse cx="300" cy="250" rx="72" ry="72" fill="url(#brk)"/>
<ellipse cx="300" cy="250" rx="62" ry="62" fill="url(#brmi)"/>
<path d="M260,220 L300,190 L310,198 L268,232 Z" fill="#ffffff" opacity="0.6"/>
<ellipse cx="300" cy="336" rx="80" ry="28" fill="${shade(m, -0.3)}"/>
<ellipse cx="300" cy="330" rx="80" ry="28" fill="url(#brk)"/>
<ellipse cx="300" cy="328" rx="62" ry="20" fill="url(#brp)"/>
<path d="M260,326 Q300,312 340,326" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.35"/>`;
    },
  },

  /* ================= GIFT ================= */
  gift: {
    vb: [400, 400],
    defaults: { box: "#ef4444", ribbon: "#fbbf24" },
    draw: (o) => {
      const b = o.box, r = o.ribbon;
      const L = (a: Pt, c: Pt, t: number): Pt => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
      const poly = (ps: Pt[]) => "M" + ps.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" L") + " Z";
      // body corners
      const B0: Pt = [74, 206], A0: Pt = [214, 238], C0: Pt = [334, 196];
      const B1: Pt = [74, 340], A1: Pt = [214, 374], C1: Pt = [334, 326];
      // lid top (L1 left, L2 front, L3 right, L4 back) and band bottom
      const L1: Pt = [60, 180], L2: Pt = [214, 216], L3: Pt = [348, 170], L4: Pt = [196, 136];
      const dy = 36;
      const dn = (p: Pt): Pt => [p[0], p[1] + dy];
      const t0 = 0.42, t1 = 0.58;
      return `<defs>
${lg("gfl", [shade(b, 0.12), b, shade(b, -0.12)], 0, 0, 1, 0)}
${lg("gfr", [shade(b, -0.25), shade(b, -0.45)], 0, 0, 1, 0)}
${lg("gtp", [shade(b, 0.3), shade(b, 0.08)], 0, 0, 1, 1)}
${lg("grb", [shade(r, 0.35), r, shade(r, -0.2)], 0, 0, 1, 0)}
${lg("grd", [shade(r, -0.15), shade(r, -0.4)], 0, 0, 1, 0)}
${lg("grl", [shade(r, 0.5), r, shade(r, -0.3)], 0, 0, 1, 1)}
</defs>
${shadow(206, 368, 175, 20, 0.35)}
<path d="${poly([B0, A0, A1, B1])}" fill="url(#gfl)"/>
<path d="${poly([A0, C0, C1, A1])}" fill="url(#gfr)"/>
<path d="${poly([L(B0, A0, t0), L(B0, A0, t1), L(B1, A1, t1), L(B1, A1, t0)])}" fill="url(#grb)"/>
<path d="${poly([L(A0, C0, t0), L(A0, C0, t1), L(A1, C1, t1), L(A1, C1, t0)])}" fill="url(#grd)"/>
<path d="${poly([dn(L1), dn(L2), [214, 252], [60, 218]])}" fill="#000" opacity="0.18"/>
<path d="${poly([L1, L2, dn(L2), dn(L1)])}" fill="url(#gfl)"/>
<path d="${poly([L2, L3, dn(L3), dn(L2)])}" fill="url(#gfr)"/>
<path d="${poly([L(L1, L2, t0), L(L1, L2, t1), dn(L(L1, L2, t1)), dn(L(L1, L2, t0))])}" fill="url(#grb)"/>
<path d="${poly([L(L2, L3, t0), L(L2, L3, t1), dn(L(L2, L3, t1)), dn(L(L2, L3, t0))])}" fill="url(#grd)"/>
<path d="${poly([L1, L2, L3, L4])}" fill="url(#gtp)"/>
<path d="${poly([L(L1, L2, t0), L(L1, L2, t1), L(L4, L3, t1), L(L4, L3, t0)])}" fill="url(#grb)"/>
<path d="${poly([L(L2, L3, t0), L(L2, L3, t1), L(L1, L4, t1), L(L1, L4, t0)])}" fill="url(#grb)"/>
<path d="M${L1[0]},${L1[1]} L${L2[0]},${L2[1]} L${L3[0]},${L3[1]}" fill="none" stroke="${shade(b, 0.45)}" stroke-width="2" opacity="0.7" stroke-linejoin="round"/>
<path d="M202,170 C196,192 188,212 178,236 L190,232 L196,242 C202,218 206,194 210,172 Z" fill="url(#grd)"/>
<path d="M210,170 C216,192 226,210 240,230 L228,230 L226,240 C216,218 208,194 204,172 Z" fill="url(#grb)"/>
<path d="M204,166 C170,112 102,86 92,120 C84,152 150,172 204,172 Z" fill="url(#grl)"/>
<path d="M196,164 C166,138 128,122 118,130 C130,150 166,162 196,166 Z" fill="${shade(r, -0.4)}" opacity="0.55"/>
<path d="M208,166 C244,108 316,84 324,118 C332,150 262,172 208,172 Z" fill="url(#grl)"/>
<path d="M216,164 C246,136 286,118 298,126 C286,148 248,160 216,166 Z" fill="${shade(r, -0.4)}" opacity="0.55"/>
<path d="M100,112 C112,98 140,104 168,124" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
<path d="M244,116 C270,98 300,92 314,100" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.45" stroke-linecap="round"/>
<ellipse cx="206" cy="166" rx="18" ry="14" fill="url(#grb)"/>
<path d="M194,160 Q205,153 217,159" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.55" stroke-linecap="round"/>`;
    },
  },

  /* ================= BOUQUET ================= */
  bouquet: {
    vb: [400, 440],
    defaults: { petals: "#f472b6", wrap: "#fdf2f8", leaves: "#22c55e" },
    draw: (o) => {
      const p = o.petals, w = o.wrap, g = o.leaves;
      const rose = (x: number, y: number, r: number, k: number) => {
        const pc = k ? shade(p, 0.25) : p;
        const ring = range(7)
          .map((i) => {
            const a = (i / 7) * Math.PI * 2 + k;
            return `<circle cx="${f1(x + Math.cos(a) * r * 0.48)}" cy="${f1(y + Math.sin(a) * r * 0.48)}" r="${f1(r * 0.55)}" fill="url(#bqp${k})" stroke="${shade(pc, -0.3)}" stroke-width="0.8" stroke-opacity="0.6"/>`;
          })
          .join("");
        return `<g>${ring}<circle cx="${x}" cy="${y}" r="${f1(r * 0.7)}" fill="${shade(pc, 0.05)}"/>
<circle cx="${x}" cy="${y}" r="${f1(r * 0.7)}" fill="url(#bqr)"/>
<path d="M${f1(x - r * 0.5)},${f1(y)} A${f1(r * 0.5)},${f1(r * 0.5)} 0 0 1 ${f1(x + r * 0.5)},${f1(y)} M${f1(x + r * 0.42)},${f1(y + r * 0.12)} A${f1(r * 0.4)},${f1(r * 0.36)} 0 0 1 ${f1(x - r * 0.32)},${f1(y + r * 0.2)} M${f1(x - r * 0.3)},${f1(y - r * 0.05)} A${f1(r * 0.28)},${f1(r * 0.26)} 0 0 1 ${f1(x + r * 0.24)},${f1(y - r * 0.04)} M${f1(x + r * 0.18)},${f1(y + r * 0.06)} A${f1(r * 0.16)},${f1(r * 0.14)} 0 0 1 ${f1(x - r * 0.12)},${f1(y + r * 0.04)}" fill="none" stroke="${shade(pc, -0.35)}" stroke-width="${f1(Math.max(1.4, r * 0.05))}" stroke-linecap="round"/>
<circle cx="${f1(x - r * 0.25)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.18)}" fill="#ffffff" opacity="0.25"/></g>`;
      };
      const leaf = (x: number, y: number, a: number, s: number) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})"><path d="M0,0 C-16,-20 -14,-50 0,-70 C14,-50 16,-20 0,0 Z" fill="url(#bql)"/><path d="M0,-4 L0,-62" stroke="${shade(g, -0.35)}" stroke-width="1.5"/></g>`;
      const dots = [[80, 120], [326, 120], [236, 40], [160, 40], [76, 206], [326, 208], [200, 196]]
        .map(([x, y]) => range(5).map((i) => `<circle cx="${x + Math.cos(i * 1.3) * 9}" cy="${y + Math.sin(i * 1.3) * 9}" r="3.2" fill="#ffffff" stroke="${shade(w, -0.2)}" stroke-width="0.6"/>`).join(""))
        .join("");
      return `<defs>
${lg("bqw", [shade(w, 0.4), w, shade(w, -0.14)], 0, 0, 1, 0)}
${lg("bqb", [shade(w, -0.08), shade(w, -0.25)])}
${lg("bql", [shade(g, 0.25), g, shade(g, -0.35)], 0, 0, 1, 0)}
${rg("bqr", [shade(p, -0.25) + "|0.45", shade(p, 0.2) + "|0"], 0.5, 0.5, 0.5)}
${lg("bqrb", [shade(p, 0.2), shade(p, -0.25)], 0, 0, 1, 1)}
${rg("bqp0", [shade(p, 0.3), p, shade(p, -0.22)], 0.5, 0.5, 0.55)}${rg("bqp1", [shade(p, 0.55), shade(p, 0.25), shade(p, -0.05)], 0.5, 0.5, 0.55)}
</defs>
<path d="M192,380 L186,432 M200,380 L200,436 M208,380 L216,430" stroke="${shade(g, -0.25)}" stroke-width="6" stroke-linecap="round"/>
<path d="M44,110 C70,50 116,80 136,30 C170,56 230,56 264,30 C284,80 330,50 356,110 L200,380 Z" fill="url(#bqb)"/>
${leaf(80, 200, -62, 1.4)}${leaf(320, 200, 62, 1.4)}${leaf(100, 110, -38, 1.3)}${leaf(300, 110, 40, 1.3)}${leaf(170, 80, -14, 1.3)}${leaf(236, 80, 16, 1.3)}
${dots}
${rose(140, 92, 38, 0)}${rose(262, 92, 40, 1)}${rose(200, 72, 42, 0)}${rose(110, 158, 42, 1)}${rose(292, 160, 44, 0)}${rose(200, 140, 48, 1)}${rose(152, 210, 44, 0)}${rose(250, 212, 46, 1)}
${leaf(110, 240, -110, 1.1)}${leaf(290, 240, 112, 1.1)}
<path d="M84,196 C130,250 170,256 200,254 C230,256 270,250 316,196 L214,392 L186,392 Z" fill="url(#bqw)"/>
<path d="M84,196 C130,250 170,256 200,254 C200,300 196,350 186,392 Z" fill="${shade(w, 0.3)}" opacity="0.6"/>
<path d="M200,254 L206,390 M144,240 L194,388 M260,236 L210,388" stroke="${shade(w, -0.18)}" stroke-width="1.5" opacity="0.8"/>
<path d="M188,340 C160,318 132,322 136,344 C140,362 172,354 194,346 Z M212,340 C240,318 268,322 264,344 C260,362 228,354 206,346 Z" fill="url(#bqrb)"/>
<path d="M194,348 L176,396 L188,392 L198,404 Z M206,348 L222,394 L210,392 L202,404 Z" fill="${shade(p, -0.15)}"/>
<rect x="188" y="334" width="24" height="20" rx="6" fill="url(#bqrb)"/>`;
    },
  },

  /* ================= PLANT ================= */
  plant: {
    vb: [400, 440],
    defaults: { pot: "#e7e5e4", leaves: "#16a34a", kind: "monstera" },
    draw: (o) => {
      const p = o.pot, g = o.leaves;
      const pot = `${shadow(200, 424, 120, 14, 0.32)}
<path d="M112,316 L132,412 Q134,424 150,424 L250,424 Q266,424 268,412 L288,316 Z" fill="url(#plp)"/>
<path d="M104,300 L296,300 L292,326 L108,326 Z" fill="url(#plp)"/>
<ellipse cx="200" cy="300" rx="96" ry="12" fill="${shade(p, 0.35)}"/>
<ellipse cx="200" cy="301" rx="86" ry="9" fill="#3b2a20"/>
<path d="M108,326 L292,326" stroke="${shade(p, -0.3)}" stroke-width="2"/>
<rect x="128" y="334" width="10" height="80" rx="5" fill="#ffffff" opacity="0.35" transform="rotate(-11 133 374)"/>`;
      const defs = `${lg("plp", [shade(p, -0.25), shade(p, 0.4), p, shade(p, -0.3)], 0, 0, 1, 0)}
${lg("pll", [shade(g, 0.3), g, shade(g, -0.35)], 0, 0, 1, 1)}`;
      if (o.kind === "snake") {
        const leaves: [number, number, number, number][] = [
          [-60, -6, 200, 28], [60, 8, 214, 28], [-30, -2, 270, 32], [30, 5, 250, 30], [0, 1, 290, 34], [-82, -16, 150, 24], [84, 18, 160, 24],
        ];
        const yel = mix(g, "#facc15", 0.65);
        return `<defs>${defs}
<pattern id="pls" width="40" height="22" patternUnits="userSpaceOnUse"><path d="M0,11 Q10,4 20,11 T40,11" stroke="${shade(g, -0.45)}" stroke-width="4" fill="none" opacity="0.55"/></pattern>
</defs>
${leaves
  .map(([x, a, h, w]) => {
    const d = `M${-w / 2},0 C${-w / 2 - 4},${-h * 0.45} ${-w * 0.45},${-h * 0.8} 0,${-h} C${w * 0.45},${-h * 0.8} ${w / 2 + 4},${-h * 0.45} ${w / 2},0 Z`;
    return `<g transform="translate(${200 + x} 304) rotate(${a})"><path d="${d}" fill="url(#pll)" stroke="${yel}" stroke-width="3.5"/><path d="${d}" fill="url(#pls)"/><path d="M${-w * 0.15},-6 Q${-w * 0.2},${-h * 0.5} 0,${-h * 0.95}" stroke="#ffffff" stroke-width="2.5" fill="none" opacity="0.25"/></g>`;
  })
  .join("")}
${pot}`;
      }
      const placed: [number, number, number, number, number, number][] = [
        // stem end x,y, rotation, scale, stem ctrl x,y
        [128, 222, -62, 0.72, 160, 270],
        [272, 218, 60, 0.72, 240, 270],
        [146, 150, -28, 0.78, 180, 240],
        [256, 142, 26, 0.8, 222, 230],
        [204, 136, 3, 0.7, 200, 220],
        [110, 280, -100, 0.55, 150, 296],
        [292, 282, 98, 0.55, 250, 296],
      ];
      return `<defs>${defs}${monsteraDef("plm", "pll", shade(g, 0.35))}</defs>
${placed.map(([x, y, , , cx, cy]) => `<path d="M200,300 Q${cx},${cy} ${x},${y}" stroke="${shade(g, -0.2)}" stroke-width="5" fill="none"/>`).join("")}
${placed.map(([x, y, a, s]) => `<use href="#plm" transform="translate(${x} ${y}) rotate(${a}) scale(${s})"/>`).join("")}
${pot}`;
    },
  },

  /* ================= TROPICAL LEAVES ================= */
  leaves: {
    vb: [400, 400],
    defaults: { c1: "#15803d", c2: "#4ade80" },
    draw: (o) => {
      const a = o.c1, b = o.c2;
      const pf1 = frond([0, 400], [160, 250], [370, 110], 70, 34, 0.1, 10);
      const pf2 = frond([0, 340], [20, 200], [120, 10], 58, 32, 0.08, 9);
      const pf3 = frond([80, 400], [240, 384], [396, 316], 54, 30, 0.12, 9);
      const banana = (r: number, sc: number, grad: string) =>
        `<g transform="translate(0 400) rotate(${r}) scale(${sc})"><path d="M0,0 C-44,-50 -54,-190 -4,-300 C44,-200 44,-60 0,0 Z" fill="url(#${grad})"/><g clip-path="url(#lfk)"><path d="M0,-2 Q-6,-150 -4,-296" stroke="${shade(b, 0.35)}" stroke-width="3" fill="none"/>${range(12)
          .map((i) => `<path d="M${f1(-0.5 * i * 0.1)},${-24 - i * 22} q-22,-6 -34,${-22 + i}" stroke="${shade(a, -0.25)}" stroke-width="1.2" fill="none" opacity="0.5"/><path d="M0,${-24 - i * 22} q22,-6 34,${-22 + i}" stroke="${shade(a, -0.25)}" stroke-width="1.2" fill="none" opacity="0.5"/>`)
          .join("")}</g></g>`;
      return `<defs>
${lg("lfa", [shade(b, 0.1), mix(a, b, 0.55), shade(a, -0.05)], 0, 0, 1, 1)}
${lg("lfb", [shade(a, 0.1), a, shade(a, -0.4)], 0, 0, 1, 1)}
${lg("lfc", [shade(b, 0.1), mix(a, b, 0.5), shade(a, -0.1)], 0, 0, 1, 0)}
${lg("lfd", [shade(a, 0.05), shade(a, -0.45)], 0, 0, 1, 0)}
${monsteraDef("lfm", "lfb", shade(b, 0.2))}${monsteraDef("lfn", "lfa", shade(b, 0.5))}
<clipPath id="lfk"><path d="M0,0 C-44,-50 -54,-190 -4,-300 C44,-200 44,-60 0,0 Z"/></clipPath>
</defs>
<path d="${pf2.leaflets}" fill="url(#lfd)"/><path d="${pf2.rachis}" stroke="${shade(a, -0.4)}" stroke-width="3" fill="none"/>
<path d="${pf3.leaflets}" fill="url(#lfd)"/><path d="${pf3.rachis}" stroke="${shade(a, -0.4)}" stroke-width="3" fill="none"/>
<path d="${pf1.leaflets}" fill="url(#lfb)"/><path d="${pf1.rachis}" stroke="${shade(a, -0.3)}" stroke-width="3" fill="none"/>
${banana(24, 1.12, "lfc")}${banana(66, 0.95, "lfc")}
<use href="#lfm" transform="translate(30 400) rotate(48) scale(1.3)"/>
<use href="#lfn" transform="translate(0 372) rotate(10) scale(1.0)"/>
<use href="#lfn" transform="translate(40 400) rotate(86) scale(0.95)"/>
<g transform="translate(0 400) rotate(40)"><path d="M0,0 C-26,-40 -22,-100 0,-130 C22,-100 26,-40 0,0 Z" fill="url(#lfa)"/><path d="M0,-4 L0,-124" stroke="${shade(b, 0.4)}" stroke-width="2"/></g>`;
    },
  },

  /* ================= PALM ISLAND ================= */
  palm: {
    vb: [400, 400],
    defaults: { leaves: "#16a34a", trunk: "#a16207" },
    draw: (o) => {
      const g = o.leaves, t = o.trunk;
      const top: Pt = [236, 112];
      const fr: [Pt, Pt, number][] = [
        [[160, 70], [100, 120], 46], [[200, 50], [140, 58], 40], [[270, 50], [330, 70], 42], [[310, 80], [362, 150], 46],
        [[180, 120], [130, 190], 40], [[290, 120], [320, 200], 40], [[240, 60], [236, 34], 30],
      ];
      const fronds = fr.map(([c, e, l]) => frond(top, c, e, l * 0.85, 18, 0.35, 7));
      const rings = range(9)
        .map((i) => {
          const k = i / 9;
          const x = 194 + (top[0] - 194) * k + Math.sin(k * 3) * 14, y = 330 - (330 - top[1]) * k;
          const hw = 14 - k * 5;
          return `<path d="M${f1(x - hw)},${f1(y)} Q${f1(x)},${f1(y + 5)} ${f1(x + hw)},${f1(y - 2)}" stroke="${shade(t, -0.4)}" stroke-width="2" fill="none"/>`;
        })
        .join("");
      return `<defs>
${rg("pw", [shade("#22d3ee", 0.3), "#06b6d4|0.85", "#0891b2|0"], 0.5, 0.5, 0.5)}
${lg("ps", ["#fde68a", "#f2c66d", "#d6a24c"])}
${lg("pt", [shade(t, 0.25), t, shade(t, -0.35)], 0, 0, 1, 0)}
${lg("pf", [shade(g, 0.3), g, shade(g, -0.35)], 0, 0, 1, 1)}
${rg("pco", [shade(t, -0.05), shade(t, -0.5)], 0.35, 0.35, 0.6)}
</defs>
<ellipse cx="200" cy="336" rx="196" ry="58" fill="url(#pw)"/>
<ellipse cx="200" cy="338" rx="150" ry="34" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.6"/>
<ellipse cx="200" cy="340" rx="176" ry="44" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.35" stroke-dasharray="30 18"/>
<path d="M66,336 C90,304 150,292 210,292 C270,292 316,306 336,336 C300,354 110,356 66,336 Z" fill="url(#ps)"/>
<path d="M90,330 C140,318 260,316 320,332" fill="none" stroke="#fff7d6" stroke-width="2" opacity="0.7"/>
<ellipse cx="210" cy="326" rx="50" ry="6" fill="#8a6a2a" opacity="0.25"/>
<path d="M180,330 C178,260 196,180 ${top[0] - 10},${top[1] + 6} L${top[0] + 6},${top[1] + 8} C214,182 204,260 210,330 Z" fill="url(#pt)"/>
${rings}
${fronds.map((f) => `<path d="${f.leaflets}" fill="url(#pf)"/><path d="${f.rachis}" stroke="${shade(g, -0.4)}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("")}
<circle cx="228" cy="124" r="9" fill="url(#pco)"/><circle cx="244" cy="126" r="9" fill="url(#pco)"/><circle cx="236" cy="134" r="9" fill="url(#pco)"/>`;
    },
  },

  /* ================= SCENE: MOUNTAINS ================= */
  scene_mountains: {
    vb: [400, 400],
    defaults: { sky: "#7dd3fc", water: "#0ea5e9" },
    draw: (o) => {
      const s = o.sky, w = o.water;
      const pine = (x: number, y: number, h: number, c: string) => {
        const hw = h * 0.28;
        return `<path d="M${x},${y - h} L${f1(x + hw * 0.55)},${f1(y - h * 0.62)} L${f1(x + hw * 0.3)},${f1(y - h * 0.62)} L${f1(x + hw * 0.8)},${f1(y - h * 0.3)} L${f1(x + hw * 0.4)},${f1(y - h * 0.3)} L${f1(x + hw)},${y - h * 0.06} L${f1(x - hw)},${y - h * 0.06} L${f1(x - hw * 0.4)},${f1(y - h * 0.3)} L${f1(x - hw * 0.8)},${f1(y - h * 0.3)} L${f1(x - hw * 0.3)},${f1(y - h * 0.62)} L${f1(x - hw * 0.55)},${f1(y - h * 0.62)} Z" fill="${c}"/><rect x="${f1(x - 1.5)}" y="${f1(y - h * 0.08)}" width="3" height="${f1(h * 0.08)}" fill="#3b2a20"/>`;
      };
      const forest = (pts: [number, number, number][], c: string) => pts.map(([x, y, h]) => pine(x, y, h, c)).join("");
      const mt = `<g id="smt">
<path d="M0,230 L40,190 L70,206 L110,160 L150,196 L190,168 L240,200 L290,150 L340,186 L400,160 L400,240 L0,240 Z" fill="url(#smf)"/>
<path d="M-20,250 L140,64 L230,170 L270,120 L400,246 Z" fill="url(#sml)"/>
<path d="M140,64 L176,108 L160,140 L196,212 L250,250 L400,246 L270,120 L230,170 Z" fill="url(#smd)" opacity="0.85"/>
<path d="M140,64 L112,96 L122,100 L104,120 L124,114 L132,126 L144,110 L154,122 L160,104 L176,108 Z" fill="#ffffff"/>
<path d="M140,64 L176,108 L160,104 L154,122 L148,108 Z" fill="#d6e4f0"/>
<path d="M270,120 L252,142 L262,144 L250,158 L268,150 L276,160 L284,146 L296,152 L290,138 Z" fill="#ffffff"/>
<path d="M270,120 L290,138 L284,146 L276,140 Z" fill="#cfdeea"/>
<path d="M0,262 C40,236 80,232 130,244 C180,226 240,224 290,240 C330,230 370,232 400,240 L400,272 L0,272 Z" fill="#1f5d3a"/>
${forest([[14, 262, 36], [30, 258, 46], [50, 262, 34], [70, 256, 44], [92, 260, 30], [250, 254, 34], [268, 250, 44], [288, 256, 30], [312, 250, 40], [334, 254, 34], [356, 250, 46], [380, 254, 36], [396, 256, 30]], "#14452b")}
</g>`;
      return `<defs>
${lg("sms", [shade(s, -0.3), s, shade(s, 0.65)])}
${lg("smf", [mix(s, "#94a3b8", 0.45), mix(s, "#cbd5e1", 0.6)])}
${lg("sml", ["#8fa3b8", "#5b6f86", "#3f5a4a"], 0, 0, 0.3, 1)}
${lg("smd", ["#4a5d74", "#2f3e52", "#263c30"], 0, 0, 0.2, 1)}
${lg("smw", [shade(w, -0.2), w, shade(w, -0.35)])}
${lg("smwf", [w + "|0.15", w + "|0.55|0.45", shade(w, -0.2) + "|0.9"])}
${rg("smsun", ["#ffffff|0.9", "#ffffff|0.3|0.3", "#ffffff|0"], 0.5, 0.5, 0.5)}
<clipPath id="smc"><rect x="0" y="270" width="400" height="130"/></clipPath>
</defs>
<rect width="400" height="400" fill="url(#sms)"/>
<circle cx="320" cy="70" r="70" fill="url(#smsun)"/>
<g fill="#ffffff" opacity="0.85"><ellipse cx="70" cy="70" rx="40" ry="10"/><ellipse cx="96" cy="62" rx="24" ry="12"/><ellipse cx="300" cy="110" rx="34" ry="8"/><ellipse cx="318" cy="104" rx="18" ry="9"/></g>
${mt}
<rect x="0" y="270" width="400" height="130" fill="url(#smw)"/>
<g clip-path="url(#smc)" opacity="0.35"><use href="#smt" transform="matrix(1 0 0 -1 0 540)"/></g>
<rect x="0" y="270" width="400" height="130" fill="url(#smwf)"/>
${range(9).map((i) => `<rect x="${(i * 97) % 340 + 10}" y="${282 + i * 12}" width="${30 + (i % 3) * 22}" height="1.6" rx="0.8" fill="#ffffff" opacity="0.5"/>`).join("")}
<path d="M0,340 C40,330 70,340 96,360 C110,372 120,390 124,400 L0,400 Z" fill="#2f4f3a"/>
<path d="M0,356 C30,350 54,356 70,372 L80,400 L0,400 Z" fill="#23402e"/>
<ellipse cx="96" cy="384" rx="22" ry="10" fill="#6b7280"/><ellipse cx="90" cy="380" rx="14" ry="6" fill="#9ca3af"/>
${forest([[10, 372, 110], [40, 360, 84], [64, 366, 62]], "#0f3a24")}
<path d="M400,330 C370,330 340,346 326,368 C318,382 316,394 316,400 L400,400 Z" fill="#284634"/>
${forest([[396, 360, 120], [366, 356, 80], [346, 372, 56]], "#0f3a24")}`;
    },
  },

  /* ================= SCENE: BEACH ================= */
  scene_beach: {
    vb: [400, 400],
    defaults: { sky: "#bae6fd", sea: "#06b6d4", sand: "#fde68a", kind: "palm" },
    draw: (o) => {
      const s = o.sky, w = o.sea, d = o.sand;
      let fg: string;
      if (o.kind === "umbrella") {
        const seg = range(6)
          .map((i) => {
            const x0 = 150 + i * 34, x1 = x0 + 34;
            return `<path d="M232,132 L${x0},208 Q${(x0 + x1) / 2},${i % 2 ? 196 : 198} ${x1},208 Z" fill="${i % 2 ? "#ffffff" : "#ef4444"}"/>`;
          })
          .join("");
        fg = `<ellipse cx="220" cy="350" rx="120" ry="14" fill="#000" opacity="0.12"/>
<line x1="239" y1="200" x2="252" y2="352" stroke="#e5e7eb" stroke-width="5" stroke-linecap="round"/>
<line x1="239" y1="200" x2="252" y2="352" stroke="#9ca3af" stroke-width="1.5"/>
<path d="M150,208 Q232,96 354,208 Z" fill="#ef4444"/>${seg}
<circle cx="232" cy="128" r="5" fill="#e5e7eb"/>
<path d="M150,208 Q232,96 354,208" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="2"/>
<path d="M164,190 Q230,120 300,150" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.35" stroke-linecap="round"/>
<path d="M150,208 Q167,216 184,208 Q201,216 218,208 Q235,216 252,208 Q269,216 286,208 Q303,216 320,208 Q337,216 354,208" fill="none" stroke="#b91c1c" stroke-width="3"/>
<path d="M96,336 L118,300 L250,300 L262,280 L292,268 L296,276 L270,312 L120,312 Z" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-linejoin="round"/>
<path d="M120,302 L250,302 L264,284 L286,274" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linecap="round"/>
<path d="M120,302 L250,302" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 6"/>
<path d="M110,312 L100,346 M240,312 L252,346 M126,312 L120,340 M260,306 L276,338" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>
<g transform="translate(330 360)"><path d="M0,-12 L3,-4 L12,-4 L5,2 L8,11 L0,6 L-8,11 L-5,2 L-12,-4 L-3,-4 Z" fill="#fb923c"/></g>
<ellipse cx="60" cy="372" rx="10" ry="6" fill="#fef3c7" stroke="#e7c48a" stroke-width="1.5"/>`;
      } else {
        const top: Pt = [176, 96];
        const fr: [Pt, Pt, number][] = [
          [[110, 60], [40, 110], 44], [[150, 40], [90, 40], 38], [[220, 40], [290, 60], 42], [[250, 80], [320, 150], 46],
          [[140, 110], [96, 186], 38], [[220, 110], [246, 196], 40], [[180, 50], [184, 18], 30],
        ];
        const fronds = fr.map(([c, e, l]) => frond(top, c, e, l * 0.85, 18, 0.35, 7));
        const rings = range(14)
          .map((i) => {
            const k = i / 14;
            const x = 40 + (top[0] - 40) * k + Math.sin(k * 3) * 20, y = 380 - (380 - top[1]) * k;
            return `<path d="M${f1(x - 12 + k * 4)},${f1(y)} Q${f1(x)},${f1(y + 5)} ${f1(x + 12 - k * 4)},${f1(y - 3)}" stroke="#6b4a1f" stroke-width="2" fill="none"/>`;
          })
          .join("");
        fg = `<ellipse cx="210" cy="372" rx="130" ry="12" fill="#000" opacity="0.1"/>
<path d="M26,400 C40,300 70,190 ${top[0] - 8},${top[1] + 4} L${top[0] + 8},${top[1] + 8} C100,200 72,300 64,400 Z" fill="url(#sbt)"/>
${rings}
${fronds.map((f) => `<path d="${f.leaflets}" fill="url(#sbf)"/><path d="${f.rachis}" stroke="#14532d" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("")}
<circle cx="170" cy="108" r="9" fill="#6b4a1f"/><circle cx="184" cy="110" r="9" fill="#7c5626"/><circle cx="176" cy="120" r="9" fill="#5b3d18"/>
<g transform="translate(320 352)"><path d="M0,-12 L3,-4 L12,-4 L5,2 L8,11 L0,6 L-8,11 L-5,2 L-12,-4 L-3,-4 Z" fill="#fb923c"/></g>
<ellipse cx="270" cy="378" rx="10" ry="6" fill="#fef3c7" stroke="#e7c48a" stroke-width="1.5"/>`;
      }
      return `<defs>
${lg("sbs", [shade(s, -0.15), s, shade(s, 0.6)])}
${lg("sbw", [shade(w, -0.35), w, shade(w, 0.35), shade(w, 0.6)])}
${lg("sbd", [shade(d, -0.1), d, shade(d, 0.25)])}
${lg("sbt", ["#c79a5b", "#a16207", "#6b4a1f"], 0, 0, 1, 0)}
${lg("sbf", ["#4ade80", "#16a34a", "#14532d"], 0, 0, 1, 1)}
${rg("sbsun", ["#fffbe6", "#fff7cc|0.6|0.25", "#ffffff|0"], 0.5, 0.5, 0.5)}
</defs>
<rect width="400" height="400" fill="url(#sbs)"/>
<circle cx="320" cy="70" r="70" fill="url(#sbsun)"/><circle cx="320" cy="70" r="20" fill="#fffbea"/>
<g fill="#ffffff" opacity="0.9"><ellipse cx="90" cy="60" rx="44" ry="11"/><ellipse cx="116" cy="50" rx="26" ry="14"/><ellipse cx="236" cy="120" rx="30" ry="7"/><ellipse cx="250" cy="114" rx="16" ry="8"/></g>
<path d="M250,182 C270,170 300,168 320,176 C340,170 370,172 400,180 L400,184 L250,184 Z" fill="${mix(w, s, 0.4)}" opacity="0.8"/>
<rect x="0" y="182" width="400" height="120" fill="url(#sbw)"/>
${range(8).map((i) => `<rect x="${(i * 131) % 330 + 20}" y="${196 + i * 9}" width="${24 + (i % 3) * 18}" height="1.6" rx="0.8" fill="#ffffff" opacity="0.5"/>`).join("")}
<path d="M0,268 C60,258 120,276 200,266 C280,256 340,272 400,262 L400,400 L0,400 Z" fill="${shade(d, -0.2)}" opacity="0.6"/>
<path d="M0,276 C70,266 130,284 210,274 C290,264 340,280 400,270 L400,400 L0,400 Z" fill="url(#sbd)"/>
<path d="M0,268 C60,258 120,276 200,266 C280,256 340,272 400,262" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.9"/>
<path d="M0,262 C50,254 110,268 190,260 C260,252 330,264 400,256" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5"/>
<path d="M30,320 Q60,314 90,320 M150,340 Q190,332 230,340 M290,312 Q320,306 350,312 M60,370 Q100,362 140,370" fill="none" stroke="${shade(d, -0.15)}" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
${fg}`;
    },
  },

  /* ================= SCENE: TEMPLE ================= */
  scene_temple: {
    vb: [400, 400],
    defaults: { sky: "#fdba74", sea: "#0e7490" },
    draw: (o) => {
      const s = o.sky, w = o.sea;
      const dark = "#24140f";
      const tiers = (cx: number, base: number, n: number, w0: number, h0: number) =>
        range(n)
          .map((i) => {
            const k = 1 - i / (n + 1);
            const ww = w0 * k, hh = h0 * (0.75 + 0.25 * k), y = base - i * hh * 0.82;
            return `<path d="M${f1(cx - ww * 0.32)},${f1(y)} L${f1(cx - ww * 0.32)},${f1(y - hh * 0.3)} L${f1(cx + ww * 0.32)},${f1(y - hh * 0.3)} L${f1(cx + ww * 0.32)},${f1(y)} Z" fill="${dark}"/><path d="M${f1(cx - ww / 2)},${f1(y - hh * 0.25)} Q${f1(cx - ww * 0.3)},${f1(y - hh * 0.38)} ${f1(cx - ww * 0.22)},${f1(y - hh * 0.82)} L${f1(cx + ww * 0.22)},${f1(y - hh * 0.82)} Q${f1(cx + ww * 0.3)},${f1(y - hh * 0.38)} ${f1(cx + ww / 2)},${f1(y - hh * 0.25)} Z" fill="url(#stro)"/>`;
          })
          .join("") + `<path d="M${cx - 3},${base - n * h0 * 0.68} L${cx},${base - n * h0 * 0.68 - 22} L${cx + 3},${base - n * h0 * 0.68} Z" fill="${dark}"/>`;
      const palmS = (x: number, y: number, h: number, lean: number) => {
        const tx = x + lean, ty = y - h;
        return `<path d="M${x - 2},${y} Q${x + lean * 0.2},${y - h * 0.5} ${tx},${ty} L${tx + 2},${ty} Q${x + lean * 0.2 + 3},${y - h * 0.5} ${x + 3},${y} Z" fill="${dark}"/>${range(7)
          .map((i) => {
            const a = -170 + i * 28;
            const r = (a * Math.PI) / 180, L = 26;
            return `<path d="M${tx},${ty} Q${f1(tx + Math.cos(r) * L * 0.6)},${f1(ty + Math.sin(r) * L * 0.6 - 8)} ${f1(tx + Math.cos(r) * L)},${f1(ty + Math.sin(r) * L + 6)}" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
          })
          .join("")}`;
      };
      return `<defs>
${lg("sts", [mix(s, "#6d28d9", 0.55), mix(s, "#ec4899", 0.35), s, shade(s, 0.45)])}
${lg("stw", [mix(w, s, 0.35), w, shade(w, -0.45)])}
${rg("stsun", [shade(s, 0.85), shade(s, 0.5) + "|0.7|0.2", s + "|0"], 0.5, 0.5, 0.5)}
${lg("stro", ["#3a2218", dark], 0, 0, 0, 1)}
${lg("str", ["#3d241a", "#1a0e0a"], 0, 0, 0, 1)}
</defs>
<rect width="400" height="400" fill="url(#sts)"/>
<circle cx="270" cy="250" r="140" fill="url(#stsun)"/>
<circle cx="270" cy="250" r="40" fill="${shade(s, 0.75)}"/>
<g fill="${mix(s, "#be185d", 0.4)}" opacity="0.55"><rect x="20" y="96" width="150" height="6" rx="3"/><rect x="60" y="108" width="110" height="4" rx="2"/><rect x="230" y="70" width="140" height="5" rx="2.5"/><rect x="270" y="80" width="100" height="4" rx="2"/><rect x="200" y="170" width="120" height="4" rx="2" opacity="0.6"/></g>
<rect x="0" y="262" width="400" height="138" fill="url(#stw)"/>
${range(10).map((i) => `<rect x="${270 - (24 + i * 7) / 2 + ((i * 13) % 9) - 4}" y="${268 + i * 12}" width="${24 + i * 7}" height="2.4" rx="1.2" fill="${shade(s, 0.6)}" opacity="${f1(0.8 - i * 0.06)}"/>`).join("")}
${range(7).map((i) => `<rect x="${(i * 83) % 360}" y="${290 + i * 15}" width="${30 + (i % 3) * 20}" height="1.5" fill="#ffffff" opacity="0.25"/>`).join("")}
<path d="M0,250 L0,400 L210,400 C220,360 236,330 230,300 C224,276 200,262 180,250 C160,238 130,236 110,240 C80,232 40,232 0,250 Z" fill="url(#str)"/>
<path d="M180,250 C200,262 224,276 230,300" fill="none" stroke="${shade(s, 0.2)}" stroke-width="2.5" opacity="0.6"/>
<path d="M0,330 C40,320 80,330 110,346 C150,366 180,380 200,400 L0,400 Z" fill="#120a07" opacity="0.7"/>
<path d="M60,240 L170,240 L176,248 L54,248 Z" fill="${dark}"/>
${tiers(112, 240, 9, 120, 22)}
${tiers(166, 242, 3, 50, 16)}
${palmS(30, 244, 64, -14)}${palmS(196, 252, 54, 18)}${palmS(10, 252, 40, 10)}
<path d="M0,236 C10,220 30,222 40,236 C50,226 64,228 70,242 L0,250 Z" fill="${dark}"/>
<path d="M300,140 l6,4 l6,-4 M320,124 l5,3 l5,-3 M286,120 l4,3 l4,-3" fill="none" stroke="${dark}" stroke-width="1.6" stroke-linecap="round"/>`;
    },
  },

  /* ================= SCENE: CITY ================= */
  scene_city: {
    vb: [400, 400],
    defaults: { sky: "#1e3a8a", glow: "#f59e0b" },
    draw: (o) => {
      const s = o.sky, g = o.glow;
      const back = shade(mix(s, g, 0.25), -0.35), front = shade(s, -0.7);
      const bld = (x: number, w: number, h: number, c: string, lit: boolean, top = 0) =>
        `<path d="M${x},330 L${x},${330 - h + top} L${x + w / 2},${330 - h} L${x + w},${330 - h + top} L${x + w},330 Z" fill="${c}"/>${lit ? `<path d="M${x + 3},330 L${x + 3},${330 - h + top + 6} L${x + w - 3},${330 - h + top + 6} L${x + w - 3},330 Z" fill="url(#scwin)"/>` : ""}`;
      return `<defs>
${lg("scs", [shade(s, -0.55), s, mix(s, g, 0.55), shade(g, 0.2)])}
${rg("scg", [shade(g, 0.3) + "|0.8", g + "|0.35|0.4", g + "|0"], 0.5, 0.5, 0.5)}
${lgu("sct", [shade(s, -0.6), shade(mix(s, g, 0.4), -0.1), shade(s, -0.5)], 182, 0, 218, 0)}
${lg("scw", [shade(s, -0.55), shade(s, -0.8)])}
<pattern id="scwin" width="8" height="9" patternUnits="userSpaceOnUse"><rect x="1.5" y="2" width="3.5" height="4" fill="${shade(g, 0.35)}" opacity="0.75"/></pattern>
</defs>
<rect width="400" height="400" fill="url(#scs)"/>
${range(26).map((i) => `<circle cx="${(i * 149) % 400}" cy="${(i * 67) % 140 + 6}" r="${i % 4 ? 0.9 : 1.5}" fill="#ffffff" opacity="${i % 3 ? 0.6 : 0.9}"/>`).join("")}
<ellipse cx="200" cy="330" rx="300" ry="120" fill="url(#scg)"/>
${bld(0, 36, 120, back, false, 10)}${bld(30, 30, 150, back, false)}${bld(64, 40, 110, back, false, 16)}${bld(100, 28, 170, back, false, 20)}${bld(240, 34, 160, back, false, 14)}${bld(276, 30, 130, back, false)}${bld(310, 40, 180, back, false, 24)}${bld(350, 50, 120, back, false)}
<path d="M196,330 L196,20 L198,20 L199,4 L201,4 L202,20 L204,20 L204,330 Z" fill="${shade(mix(s, g, 0.5), -0.2)}"/>
<path d="M170,330 L174,250 L178,250 L180,180 L184,180 L186,110 L190,110 L192,60 L196,60 L197,24 L203,24 L204,60 L208,60 L210,110 L214,110 L216,180 L220,180 L222,250 L226,250 L230,330 Z" fill="url(#sct)"/>
<path d="M200,40 L200,330" stroke="${shade(g, 0.4)}" stroke-width="1.2" opacity="0.7"/>
<path d="M178,256 L178,330 M222,256 L222,330 M186,116 L186,330 M214,116 L214,330" stroke="${shade(g, 0.3)}" stroke-width="1" opacity="0.4" stroke-dasharray="3 4"/>
<circle cx="200" cy="4" r="2.5" fill="#ef4444"/>
${bld(6, 34, 90, front, true)}${bld(42, 26, 130, front, true, 18)}${bld(70, 44, 100, front, true)}${bld(116, 30, 150, front, true, 30)}${bld(148, 22, 80, front, true)}
${bld(232, 26, 120, front, true, 26)}${bld(260, 40, 96, front, true)}${bld(302, 28, 146, front, true, 40)}${bld(332, 34, 110, front, true)}${bld(368, 32, 136, front, true, 16)}
<rect x="0" y="328" width="400" height="72" fill="url(#scw)"/>
<ellipse cx="200" cy="330" rx="220" ry="14" fill="${g}" opacity="0.18"/>
${range(18).map((i) => `<rect x="${(i * 71) % 390}" y="${336 + (i * 7) % 56}" width="${8 + (i % 4) * 6}" height="1.6" rx="0.8" fill="${shade(g, 0.3)}" opacity="${f1(0.55 - ((i * 7) % 56) / 140)}"/>`).join("")}
<rect x="197" y="334" width="6" height="56" fill="${shade(g, 0.3)}" opacity="0.25"/>`;
    },
  },

  /* ================= SCENE: VILLAS ================= */
  scene_villas: {
    vb: [400, 400],
    defaults: { sky: "#a5f3fc", sea: "#14b8a6" },
    draw: (o) => {
      const s = o.sky, w = o.sea;
      const villa = (x: number, y: number, k: number) => {
        const W = 70 * k, H = 26 * k, R = 34 * k;
        const stilts = range(4).map((i) => `<rect x="${f1(x - W / 2 + 4 * k + i * (W - 10 * k) / 3)}" y="${f1(y)}" width="${f1(2.5 * k)}" height="${f1(20 * k)}" fill="#5b3a1e"/>`).join("");
        return `<ellipse cx="${x}" cy="${f1(y + 22 * k)}" rx="${f1(W * 0.6)}" ry="${f1(5 * k)}" fill="#0b4f4a" opacity="0.25"/>${stilts}
<rect x="${f1(x - W / 2 - 6 * k)}" y="${f1(y - 3 * k)}" width="${f1(W + 12 * k)}" height="${f1(5 * k)}" fill="#8b5e34"/>
<rect x="${f1(x - W / 2)}" y="${f1(y - H)}" width="${f1(W)}" height="${f1(H - 3 * k)}" fill="url(#svwd)"/>
<rect x="${f1(x - W * 0.3)}" y="${f1(y - H * 0.8)}" width="${f1(W * 0.24)}" height="${f1(H * 0.6)}" fill="#3b2a20"/><rect x="${f1(x + W * 0.08)}" y="${f1(y - H * 0.8)}" width="${f1(W * 0.24)}" height="${f1(H * 0.6)}" fill="#3b2a20"/>
<path d="M${f1(x - W / 2 - 10 * k)},${f1(y - H + 2 * k)} L${f1(x - W * 0.18)},${f1(y - H - R)} L${f1(x + W * 0.18)},${f1(y - H - R)} L${f1(x + W / 2 + 10 * k)},${f1(y - H + 2 * k)} Z" fill="url(#svr)"/>
<path d="M${f1(x - W * 0.18)},${f1(y - H - R)} L${f1(x - W / 2 - 10 * k)},${f1(y - H + 2 * k)} L${f1(x - W * 0.3)},${f1(y - H + 2 * k)} Z" fill="#000" opacity="0.12"/>`;
      };
      return `<defs>
${lg("svs", [shade(s, -0.2), s, shade(s, 0.6)])}
${lg("svw", [shade(w, -0.35), w, shade(w, 0.4), shade(w, 0.65)])}
${lg("svr", ["#e8c483", "#c79a5b", "#9a6f3a"])}
${lg("svwd", ["#d6b48a", "#a47a4c"])}
${lg("svb", ["#a47a4c", "#7a5530"])}
${lg("svp", ["#4ade80", "#15803d"], 0, 0, 1, 1)}
</defs>
<rect width="400" height="400" fill="url(#svs)"/>
<g fill="#ffffff" opacity="0.9"><ellipse cx="80" cy="54" rx="46" ry="11"/><ellipse cx="104" cy="44" rx="26" ry="14"/><ellipse cx="300" cy="80" rx="40" ry="9"/><ellipse cx="320" cy="72" rx="22" ry="10"/></g>
<rect x="0" y="160" width="400" height="240" fill="url(#svw)"/>
<path d="M280,162 C300,140 340,136 370,146 C384,150 396,156 400,160 L400,164 L280,164 Z" fill="#166534"/>
<path d="M300,150 l-2,-26 M330,140 l3,-30 M360,146 l-1,-22" stroke="#4b3621" stroke-width="2"/>
${[[298, 124], [333, 110], [359, 124]].map(([x, y]) => range(5).map((i) => `<path d="M${x},${y} q${-12 + i * 6},${-6} ${-16 + i * 8},${4}" stroke="#15803d" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("")).join("")}
<path d="M0,164 C20,156 50,154 80,162 L80,164 L0,164 Z" fill="#1f6f4a" opacity="0.7"/>
${range(12).map((i) => `<path d="M${(i * 113) % 380},${200 + i * 16} q12,-3 24,0 t24,0" stroke="#ffffff" stroke-width="1.5" fill="none" opacity="${f1(0.25 + i * 0.03)}"/>`).join("")}
<path d="M70,196 L330,196 L330,200 L70,200 Z" fill="url(#svb)"/>
${range(14).map((i) => `<rect x="${74 + i * 18.5}" y="200" width="1.6" height="8" fill="#5b3a1e"/>`).join("")}
${villa(96, 196, 0.62)}${villa(164, 196, 0.62)}${villa(236, 196, 0.62)}${villa(304, 196, 0.62)}
<path d="M186,400 L214,400 L206,200 L194,200 Z" fill="url(#svb)"/>
${range(18).map((i) => { const y = 206 + i * i * 0.6; const hw = 6 + (y - 200) * 0.0705; return `<line x1="${f1(200 - hw)}" y1="${f1(y)}" x2="${f1(200 + hw)}" y2="${f1(y)}" stroke="#5b3a1e" stroke-width="${f1(0.6 + i * 0.1)}" opacity="0.6"/>`; }).join("")}
${villa(70, 296, 1.25)}${villa(330, 290, 1.2)}
<path d="M110,300 L186,320 L186,328 L110,308 Z M290,294 L214,320 L214,328 L290,302 Z" fill="url(#svb)"/>
<path d="M0,250 C40,244 90,250 120,262 C80,266 30,264 0,262 Z" fill="#ffffff" opacity="0.18"/>`;
    },
  },

};
