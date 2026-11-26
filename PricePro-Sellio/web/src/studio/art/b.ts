import type { Art } from "./types";

/* ---------- colour + markup helpers ---------- */
type RGB = [number, number, number];
const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (h: string): RGB => {
  const s = (h || "#000000").replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: RGB) => "#" + c.map((v) => cl(v).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
/** amount < 0 darkens toward black, > 0 lightens toward white. */
const shade = (h: string, a: number) => (a < 0 ? mix(h, "#000000", -a) : mix(h, "#ffffff", a));
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
type Stop = [number, string, number?];
const st = (s: Stop[]) =>
  s.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op === undefined ? "" : ` stop-opacity="${op}"`}/>`).join("");
const lg = (id: string, x1: number, y1: number, x2: number, y2: number, s: Stop[]) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${st(s)}</linearGradient>`;
const rg = (id: string, cx: number, cy: number, r: number, s: Stop[]) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${st(s)}</radialGradient>`;
const shadow = (cx: number, cy: number, rx: number, ry: number, op = 0.32, id = "gsh") =>
  `${rg(id, 0.5, 0.5, 0.5, [[0, "#000000", op], [0.55, "#000000", op * 0.45], [1, "#000000", 0]])}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;
type P = [number, number];
/** bilinear point inside quad a(0,0) b(1,0) c(1,1) d(0,1) */
const bl = (q: P[], u: number, v: number): P => [
  q[0][0] * (1 - u) * (1 - v) + q[1][0] * u * (1 - v) + q[2][0] * u * v + q[3][0] * (1 - u) * v,
  q[0][1] * (1 - u) * (1 - v) + q[1][1] * u * (1 - v) + q[2][1] * u * v + q[3][1] * (1 - u) * v,
];
const f1 = (n: number) => Math.round(n * 10) / 10;
const pts = (a: P[]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
const sub = (q: P[], u0: number, v0: number, u1: number, v1: number): P[] => [bl(q, u0, v0), bl(q, u1, v0), bl(q, u1, v1), bl(q, u0, v1)];
const poly = (a: P[], fill: string, extra = "") => `<polygon points="${pts(a)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
const rad = (d: number) => (d * Math.PI) / 180;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const ART: Record<string, Art> = {
  /* ------------------------------------------------------------ phone (back) */
  phone: {
    vb: [400, 400],
    defaults: { body: "#93c5fd", frame: "#cbd5e1" },
    draw: (o) => {
      const b = o.body, f = o.frame;
      const lens = (x: number, y: number) =>
        `<circle cx="${x}" cy="${y + 2}" r="19" fill="#000000" opacity=".18"/><circle cx="${x}" cy="${y}" r="18" fill="url(#ring)"/><circle cx="${x}" cy="${y}" r="14.5" fill="#05070c"/><circle cx="${x}" cy="${y}" r="11" fill="url(#glass)"/><circle cx="${x}" cy="${y}" r="5" fill="#0a0f1e"/><circle cx="${x - 4}" cy="${y - 4}" r="3" fill="#ffffff" opacity=".7"/><path d="M${x + 2} ${y + 8} a8 8 0 0 0 6-6" stroke="#8b9cff" stroke-width="1.6" fill="none" opacity=".6"/>`;
      return `<defs>
${lg("fr", 0, 0, 1, 0, [[0, shade(f, 0.5)], [0.25, f], [0.55, shade(f, -0.35)], [0.85, shade(f, 0.15)], [1, shade(f, -0.2)]])}
${lg("bd", 0, 0, 1, 1, [[0, shade(b, 0.42)], [0.45, b], [1, shade(b, -0.28)]])}
${lg("bump", 0, 0, 1, 1, [[0, shade(b, 0.55)], [1, shade(b, -0.05)]])}
${lg("ring", 0, 0, 1, 1, [[0, shade(f, 0.7)], [0.5, shade(f, -0.45)], [1, shade(f, 0.5)]])}
${rg("glass", 0.38, 0.32, 0.75, [[0, "#4a5a86"], [0.45, "#141a33"], [1, "#020308"]])}
${lg("hl", 0, 0, 1, 0, [[0, "#ffffff", 0], [0.5, "#ffffff", 0.45], [1, "#ffffff", 0]])}
<clipPath id="cp"><rect x="115" y="29" width="162" height="342" rx="31"/></clipPath>
</defs>
${shadow(214, 376, 118, 13)}
<g transform="rotate(-9 200 200)">
<rect x="125" y="31" width="168" height="346" rx="36" fill="url(#fr)"/>
<rect x="290" y="104" width="7" height="44" rx="3" fill="${shade(f, -0.3)}"/>
<rect x="290" y="160" width="7" height="30" rx="3" fill="${shade(f, -0.3)}"/>
<rect x="112" y="26" width="168" height="348" rx="34" fill="${shade(f, 0.35)}"/>
<rect x="115" y="29" width="162" height="342" rx="31" fill="url(#bd)"/>
<g clip-path="url(#cp)">
<path d="M60 330 L330 20 L330 95 L60 405Z" fill="url(#hl)" opacity=".55"/>
<path d="M60 395 L330 85 L330 105 L60 415Z" fill="url(#hl)" opacity=".35"/>
</g>
<rect x="129" y="46" width="92" height="96" rx="26" fill="#000000" opacity=".12" transform="translate(2 4)"/>
<rect x="127" y="42" width="92" height="96" rx="26" fill="url(#bump)" stroke="${shade(b, 0.6)}" stroke-width="1.5"/>
${lens(152, 68)}${lens(152, 113)}${lens(193, 90)}
<circle cx="194" cy="58" r="6" fill="#fff4cc" stroke="${shade(f, -0.2)}" stroke-width="1.5"/>
<circle cx="194" cy="123" r="3" fill="${shade(b, -0.45)}"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ phone (front) */
  phonefront: {
    vb: [400, 400],
    defaults: { frame: "#1f2937", s1: "#6366f1", s2: "#22d3ee" },
    draw: (o) => {
      const f = o.frame, a = o.s1, b = o.s2;
      return `<defs>
${lg("fr", 0, 0, 1, 0, [[0, shade(f, 0.35)], [0.5, shade(f, -0.2)], [1, shade(f, 0.25)]])}
${lg("scr", 0, 0, 0.6, 1, [[0, shade(a, -0.25)], [0.55, a], [1, b]])}
${lg("w1", 0, 0, 1, 1, [[0, shade(b, 0.3)], [1, b, 0.2]])}
${lg("w2", 0, 0, 1, 0, [[0, shade(a, 0.3), 0.9], [1, shade(b, -0.2), 0.9]])}
${rg("orb", 0.35, 0.35, 0.65, [[0, shade(b, 0.65)], [0.6, b], [1, shade(a, -0.2)]])}
${lg("hl", 0, 0, 1, 0, [[0, "#ffffff", 0], [0.5, "#ffffff", 0.22], [1, "#ffffff", 0]])}
<clipPath id="cp"><rect x="118" y="26" width="160" height="342" rx="30"/></clipPath>
</defs>
${shadow(206, 378, 110, 12)}
<g transform="rotate(-6 200 200)">
<rect x="120" y="22" width="172" height="354" rx="38" fill="${shade(f, -0.45)}"/>
<rect x="112" y="20" width="172" height="354" rx="37" fill="url(#fr)"/>
<rect x="117" y="25" width="162" height="344" rx="32" fill="#05060a"/>
<g clip-path="url(#cp)">
<rect x="110" y="20" width="180" height="360" fill="url(#scr)"/>
<circle cx="250" cy="110" r="78" fill="url(#orb)" opacity=".9"/>
<path d="M100 250 C150 190 205 300 290 210 L290 380 L100 380Z" fill="url(#w2)"/>
<path d="M100 300 C170 250 220 340 290 280 L290 380 L100 380Z" fill="${shade(a, -0.35)}" opacity=".75"/>
<path d="M100 200 C160 150 210 250 290 170" stroke="url(#w1)" stroke-width="10" fill="none" opacity=".7"/>
<path d="M100 180 C160 130 210 230 290 150" stroke="#ffffff" stroke-width="2" fill="none" opacity=".35"/>
<path d="M60 320 L320 10 L320 70 L60 380Z" fill="url(#hl)"/>
</g>
<circle cx="198" cy="44" r="7" fill="#000000"/><circle cx="196" cy="42" r="2.2" fill="#4b5d9a"/>
<rect x="168" y="355" width="60" height="4" rx="2" fill="#ffffff" opacity=".75"/>
<rect x="110" y="96" width="4" height="34" rx="2" fill="${shade(f, -0.3)}"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ smartwatch */
  smartwatch: {
    vb: [400, 400],
    defaults: { band: "#111827", case: "#374151", screen: "#22d3ee" },
    draw: (o) => {
      const bd = o.band, c = o.case, s = o.screen;
      const ring = (r: number, col: string, frac: number) => {
        const C = 2 * Math.PI * r;
        return `<circle cx="200" cy="182" r="${r}" fill="none" stroke="${col}" stroke-opacity=".22" stroke-width="10"/><circle cx="200" cy="182" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${f1(C * frac)} ${f1(C)}" transform="rotate(-90 200 182)"/>`;
      };
      const bars = [0.4, 0.7, 0.5, 0.9, 0.6, 1, 0.75]
        .map((h, i) => `<rect x="${160 + i * 12}" y="${f1(268 - h * 22)}" width="7" height="${f1(h * 22)}" rx="3" fill="${s}" opacity="${0.55 + h * 0.45}"/>`)
        .join("");
      const holes = range(4).map((i) => `<rect x="194" y="${318 + i * 16}" width="12" height="6" rx="3" fill="${shade(bd, -0.5)}"/>`).join("");
      return `<defs>
${lg("band", 0, 0, 1, 0, [[0, shade(bd, -0.25)], [0.3, shade(bd, 0.18)], [0.7, bd], [1, shade(bd, -0.35)]])}
${lg("case", 0, 0, 1, 1, [[0, shade(c, 0.55)], [0.4, c], [0.75, shade(c, -0.35)], [1, shade(c, 0.2)]])}
${lg("gl", 0, 0, 1, 1, [[0, "#ffffff", 0.18], [0.4, "#ffffff", 0], [1, "#ffffff", 0]])}
${rg("glow", 0.5, 0.45, 0.6, [[0, s, 0.25], [1, s, 0]])}
</defs>
${shadow(205, 384, 90, 10)}
<path d="M142 18 Q200 8 258 18 L262 108 L138 108Z" fill="url(#band)"/>
<path d="M138 286 L262 286 L258 384 Q200 394 142 384Z" fill="url(#band)"/>
<path d="M150 30 Q200 22 250 30" stroke="${shade(bd, 0.3)}" stroke-width="2" fill="none" opacity=".6"/>
${holes}
<rect x="284" y="150" width="20" height="42" rx="7" fill="url(#case)"/>
${range(6).map((i) => `<rect x="296" y="${154 + i * 6.5}" width="8" height="2" fill="${shade(c, -0.45)}"/>`).join("")}
<rect x="286" y="210" width="12" height="38" rx="5" fill="${shade(c, -0.15)}"/>
<rect x="104" y="80" width="192" height="226" rx="58" fill="url(#case)"/>
<rect x="108" y="84" width="184" height="218" rx="54" fill="none" stroke="${shade(c, 0.6)}" stroke-width="1.5" opacity=".7"/>
<rect x="116" y="92" width="168" height="202" rx="46" fill="#030408"/>
<rect x="124" y="100" width="152" height="186" rx="40" fill="url(#glow)"/>
${ring(56, s, 0.78)}${ring(42, shade(s, 0.45), 0.6)}${ring(28, mix(s, "#ffffff", 0.75), 0.88)}
<circle cx="200" cy="182" r="9" fill="${s}" opacity=".9"/>
${bars}
<circle cx="166" cy="118" r="3" fill="${s}"/><rect x="176" y="116" width="48" height="4" rx="2" fill="#ffffff" opacity=".5"/><circle cx="234" cy="118" r="3" fill="#ffffff" opacity=".5"/>
<path d="M116 150 Q116 92 174 92 L240 92 Q180 120 150 294 L136 294 Q116 280 116 250Z" fill="url(#gl)"/>`;
    },
  },

  /* ------------------------------------------------------------ camera */
  camera: {
    vb: [400, 320],
    defaults: { body: "#111111", accent: "#9ca3af" },
    draw: (o) => {
      const b = o.body, a = o.accent;
      const lx = 220, ly = 178;
      const barrel = range(14).map((i) => `<circle cx="${lx - i * 1.6}" cy="${ly + i * 0.7}" r="${86 - i * 0.2}" fill="${i % 13 === 0 ? shade(b, 0.12) : "url(#brl)"}"/>`).join("");
      const fx = lx - 22, fy = ly + 9.5;
      return `<defs>
${lg("bd", 0, 0, 0, 1, [[0, shade(b, 0.28)], [0.12, shade(b, 0.12)], [0.6, b], [1, shade(b, -0.4)]])}
${lg("side", 0, 0, 1, 0, [[0, shade(b, 0.08)], [1, shade(b, -0.5)]])}
${lg("grip", 0, 0, 1, 0, [[0, shade(b, 0.18)], [0.5, shade(b, 0.03)], [1, shade(b, -0.3)]])}
${lg("brl", 0, 0, 1, 1, [[0, shade(b, 0.3)], [0.5, b], [1, shade(b, -0.4)]])}
${lg("met", 0, 0, 1, 1, [[0, shade(a, 0.6)], [0.45, a], [0.7, shade(a, -0.45)], [1, shade(a, 0.3)]])}
${rg("gls", 0.42, 0.38, 0.7, [[0, "#3a4f8a"], [0.35, "#121a3a"], [0.8, "#03040a"], [1, "#000000"]])}
<pattern id="tx" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${shade(b, -0.15)}"/><circle cx="2.5" cy="2.5" r="1.1" fill="${shade(b, 0.12)}"/></pattern>
</defs>
${shadow(205, 296, 175, 14)}
<path d="M330 78 L360 70 Q370 70 370 82 L370 246 Q370 258 358 260 L330 268Z" fill="url(#side)"/>
<path d="M128 70 L142 30 Q146 22 156 22 L232 22 Q242 22 246 30 L258 70Z" fill="url(#bd)"/>
<path d="M150 34 L236 34" stroke="${shade(b, 0.35)}" stroke-width="2" opacity=".6"/>
<rect x="168" y="40" width="52" height="22" rx="5" fill="${shade(b, -0.35)}"/>
<ellipse cx="300" cy="58" rx="22" ry="7" fill="${shade(a, -0.3)}"/><rect x="278" y="48" width="44" height="10" fill="url(#met)"/><ellipse cx="300" cy="48" rx="22" ry="7" fill="${shade(a, 0.35)}"/>
<ellipse cx="74" cy="64" rx="18" ry="6" fill="${shade(a, -0.3)}"/><rect x="56" y="56" width="36" height="8" fill="url(#met)"/><ellipse cx="74" cy="56" rx="18" ry="6" fill="${shade(a, 0.4)}"/>
<rect x="30" y="66" width="306" height="204" rx="26" fill="url(#bd)"/>
<path d="M30 92 Q30 66 56 66 L306 66" stroke="${shade(b, 0.4)}" stroke-width="2" fill="none" opacity=".7"/>
<path d="M30 100 Q30 70 62 70 L104 70 Q118 72 118 92 L118 246 Q118 268 96 270 L56 270 Q30 270 30 244Z" fill="url(#grip)"/>
<path d="M36 104 Q38 78 64 78 L100 78 Q110 80 110 96 L110 240 Q110 260 92 262 L60 262 Q38 262 36 240Z" fill="url(#tx)" opacity=".85"/>
<circle cx="300" cy="96" r="5" fill="${shade(a, -0.1)}"/>
${barrel}
<circle cx="${fx}" cy="${fy}" r="88" fill="url(#met)"/>
<circle cx="${fx}" cy="${fy}" r="80" fill="${shade(b, 0.06)}"/>
<circle cx="${fx}" cy="${fy}" r="74" fill="none" stroke="${shade(b, 0.25)}" stroke-width="9" stroke-dasharray="2 3"/>
<circle cx="${fx}" cy="${fy}" r="66" fill="${shade(b, -0.3)}" stroke="${shade(a, 0.2)}" stroke-width="2"/>
<circle cx="${fx}" cy="${fy}" r="56" fill="url(#gls)"/>
<circle cx="${fx}" cy="${fy}" r="38" fill="none" stroke="#5a6aa8" stroke-width="1.5" opacity=".5"/>
<circle cx="${fx}" cy="${fy}" r="20" fill="#05060c"/>
<path d="M${fx - 40} ${fy - 20} A44 44 0 0 1 ${fx - 8} ${fy - 44}" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".5"/>
<path d="M${fx + 26} ${fy + 34} A44 44 0 0 0 ${fx + 44} ${fy + 8}" stroke="#a78bfa" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>
<path d="M${fx + 14} ${fy + 44} A48 48 0 0 0 ${fx + 30} ${fy + 36}" stroke="#34d399" stroke-width="4" stroke-linecap="round" fill="none" opacity=".5"/>
<circle cx="${fx - 10}" cy="${fy - 12}" r="5" fill="#ffffff" opacity=".6"/>`;
    },
  },

  /* ------------------------------------------------------------ headphones */
  headphones: {
    vb: [400, 400],
    defaults: { body: "#f5f5f5", cushion: "#d4d4d4" },
    draw: (o) => {
      const b = o.body, c = o.cushion;
      const ln = shade(b, -0.22);
      return `<defs>
${lg("band", 0, 0, 0, 1, [[0, shade(b, 0.3)], [0.6, b], [1, shade(b, -0.25)]])}
${lg("cup", 0, 0, 1, 1, [[0, shade(b, 0.4)], [0.5, b], [1, shade(b, -0.3)]])}
${rg("plate", 0.4, 0.35, 0.7, [[0, shade(b, 0.5)], [0.7, shade(b, -0.04)], [1, shade(b, -0.18)]])}
${lg("cush", 0, 0, 1, 0, [[0, shade(c, -0.25)], [0.5, c], [1, shade(c, -0.3)]])}
${rg("hole", 0.5, 0.5, 0.5, [[0, shade(c, -0.55)], [0.8, shade(c, -0.35)], [1, shade(c, -0.2)]])}
${lg("yoke", 0, 0, 1, 0, [[0, shade(b, -0.25)], [0.5, shade(b, 0.4)], [1, shade(b, -0.3)]])}
</defs>
${shadow(205, 378, 150, 14)}
<path d="M74 222 C62 90 140 26 210 26 C285 26 336 80 330 206 L306 206 C312 100 268 50 210 50 C150 50 92 110 98 222Z" fill="url(#band)" stroke="${ln}" stroke-width="1"/>
<path d="M98 212 C94 128 140 66 206 64 C266 62 306 108 306 196" stroke="${shade(c, -0.3)}" stroke-width="16" stroke-linecap="round" fill="none"/>
<path d="M98 212 C94 128 140 66 206 64 C266 62 306 108 306 196" stroke="${c}" stroke-width="10" stroke-linecap="round" fill="none"/>
<path d="M120 100 C150 66 190 58 222 60" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".55"/>
<path d="M80 200 L92 200 L96 236 L76 236Z" fill="url(#yoke)"/>
<ellipse cx="96" cy="276" rx="44" ry="80" fill="${shade(b, -0.2)}"/>
<ellipse cx="108" cy="276" rx="40" ry="76" fill="url(#cush)"/>
<ellipse cx="112" cy="278" rx="22" ry="50" fill="url(#hole)"/>
<path d="M300 186 L318 186 L322 220 L296 220Z" fill="url(#yoke)"/>
<path d="M270 196 Q312 188 330 212" stroke="${shade(b, -0.15)}" stroke-width="8" stroke-linecap="round" fill="none"/>
<ellipse cx="250" cy="282" rx="66" ry="92" fill="url(#cush)"/>
<ellipse cx="274" cy="280" rx="72" ry="96" fill="url(#cup)" stroke="${ln}" stroke-width="1"/>
<ellipse cx="280" cy="280" rx="56" ry="78" fill="url(#plate)"/>
<ellipse cx="280" cy="280" rx="56" ry="78" fill="none" stroke="${shade(b, -0.12)}" stroke-width="2"/>
<path d="M240 230 Q252 200 276 200" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".7"/>
<circle cx="334" cy="330" r="3" fill="${shade(b, -0.45)}"/>`;
    },
  },

  /* ------------------------------------------------------------ laptop */
  laptop: {
    vb: [400, 360],
    defaults: { body: "#cbd5e1", s1: "#2563eb", s2: "#a855f7" },
    draw: (o) => {
      const b = o.body, a = o.s1, c = o.s2;
      const BL: P = [64, 228], BR: P = [304, 212], FR: P = [384, 282], FL: P = [116, 318];
      const TL: P = [50, 34], TR: P = [298, 22];
      const lid: P[] = [TL, TR, BR, BL];
      const deck: P[] = [BL, BR, FR, FL];
      const scr = sub(lid, 0.035, 0.045, 0.965, 0.95);
      const kb = sub(deck, 0.1, 0.1, 0.9, 0.52);
      const keys: string[] = [];
      const cols = 13, rows = 5;
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < cols; k++) {
          if (r === 4 && k > 3 && k < 9 && k !== 4) continue;
          const u0 = k / cols + 0.008, u1 = (r === 4 && k === 4 ? 9 : k + 1) / cols - 0.008;
          keys.push(poly(sub(kb, u0, r / rows + 0.02, u1, (r + 1) / rows - 0.02), shade(b, -0.55)));
        }
      const wave = (v0: number, amp: number, ph: number) => {
        const top = range(21).map((i) => bl(scr, i / 20, v0 + amp * Math.sin(i / 20 * Math.PI * 2 + ph)));
        return [...top, bl(scr, 1, 1), bl(scr, 0, 1)];
      };
      const fe = (p: P, dy: number): P => [p[0], p[1] + dy];
      return `<defs>
${lg("lid", 0, 0, 1, 1, [[0, shade(b, 0.2)], [1, shade(b, -0.35)]])}
${lg("deck", 0, 0, 1, 1, [[0, shade(b, 0.35)], [0.6, b], [1, shade(b, -0.1)]])}
${lg("scr", 0, 0, 1, 1, [[0, shade(a, -0.35)], [0.5, a], [1, c]])}
${rg("orb", 0.5, 0.5, 0.5, [[0, shade(c, 0.6)], [0.5, c, 0.8], [1, c, 0]])}
${lg("hl", 0, 0, 1, 0, [[0, "#ffffff", 0], [0.5, "#ffffff", 0.18], [1, "#ffffff", 0]])}
</defs>
${shadow(232, 318, 180, 22)}
${poly([TL, fe(TL, -4), [TR[0] + 3, TR[1] - 4], TR], shade(b, -0.3))}
${poly(lid, "#0b0d12")}
${poly(scr, "url(#scr)")}
${poly(wave(0.55, 0.08, 0.5), shade(c, 0.1), 'opacity=".75"')}
${poly(wave(0.7, 0.07, 2.2), shade(a, -0.3), 'opacity=".8"')}
${poly(wave(0.84, 0.05, 4), shade(c, -0.35), 'opacity=".7"')}
<ellipse cx="${f1(bl(scr, 0.68, 0.32)[0])}" cy="${f1(bl(scr, 0.68, 0.32)[1])}" rx="62" ry="58" fill="url(#orb)"/>
${poly([bl(scr, 0.35, 0), bl(scr, 0.6, 0), bl(scr, 0.25, 1), bl(scr, 0, 1), bl(scr, 0, 0.75)], "url(#hl)")}
<circle cx="${f1(bl(lid, 0.5, 0.022)[0])}" cy="${f1(bl(lid, 0.5, 0.022)[1])}" r="2" fill="#2b3040"/>
${poly([FL, FR, fe(FR, 9), fe(FL, 11)], shade(b, -0.35))}
${poly([BR, FR, fe(FR, 9), fe(BR, 6)], shade(b, -0.5))}
${poly(deck, "url(#deck)")}
${poly(sub(deck, 0.02, 0, 0.98, 0.05), shade(b, -0.25))}
${poly(sub(kb, -0.01, -0.03, 1.01, 1.03), shade(b, -0.22))}
${keys.join("")}
${poly(sub(deck, 0.36, 0.6, 0.64, 0.9), shade(b, 0.12), `stroke="${shade(b, -0.15)}" stroke-width="1"`)}
<path d="M${f1(FL[0])} ${f1(FL[1])} L${f1(FR[0])} ${f1(FR[1])}" stroke="${shade(b, 0.5)}" stroke-width="1.5"/>`;
    },
  },

  /* ------------------------------------------------------------ earbuds */
  earbuds: {
    vb: [400, 400],
    defaults: { c: "#ffffff" },
    draw: (o) => {
      const c = o.c, ln = shade(c, -0.2);
      const bud = (x: number, y: number, r: number, flip = 1) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${flip} 1)">
<rect x="-11" y="10" width="22" height="92" rx="11" fill="url(#stem)" stroke="${ln}" stroke-width="1"/>
<ellipse cx="0" cy="98" rx="9" ry="4" fill="${shade(c, -0.35)}" opacity=".6"/>
<path d="M-28 6 C-30 -26 -2 -34 16 -24 C32 -16 32 8 18 20 C8 28 -24 30 -28 6Z" fill="url(#head)" stroke="${ln}" stroke-width="1"/>
<ellipse cx="-12" cy="-4" rx="12" ry="9" fill="#2a2f3a"/><ellipse cx="-12" cy="-4" rx="9" ry="6" fill="#4b5263"/>
<rect x="6" y="-14" width="10" height="4" rx="2" fill="#2a2f3a" opacity=".8"/>
<path d="M-20 -14 C-14 -24 0 -26 10 -22" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".9"/>
</g>`;
      return `<defs>
${lg("case", 0, 0, 1, 0, [[0, shade(c, -0.14)], [0.35, c], [0.7, shade(c, -0.04)], [1, shade(c, -0.22)]])}
${lg("lid", 0, 0, 0, 1, [[0, shade(c, -0.02)], [1, shade(c, -0.18)]])}
${lg("stem", 0, 0, 1, 0, [[0, shade(c, -0.15)], [0.4, c], [1, shade(c, -0.2)]])}
${rg("head", 0.4, 0.35, 0.7, [[0, c], [0.7, shade(c, -0.06)], [1, shade(c, -0.22)]])}
${rg("cav", 0.5, 0.3, 0.7, [[0, shade(c, -0.55)], [1, shade(c, -0.25)]])}
</defs>
${shadow(200, 352, 165, 16)}
<path d="M76 210 L76 132 Q76 70 140 70 L240 70 Q304 70 304 132 L304 210Z" fill="url(#lid)" stroke="${ln}" stroke-width="1"/>
<path d="M90 210 L90 136 Q90 86 140 86 L240 86 Q290 86 290 136 L290 210Z" fill="${shade(c, -0.08)}"/>
<path d="M92 130 Q96 92 140 90" stroke="#ffffff" stroke-width="3" fill="none" opacity=".8"/>
<ellipse cx="190" cy="205" rx="116" ry="16" fill="${shade(c, -0.06)}" stroke="${ln}" stroke-width="1"/>
<ellipse cx="190" cy="206" rx="100" ry="11" fill="${shade(c, -0.14)}"/>
<ellipse cx="148" cy="207" rx="28" ry="7" fill="url(#cav)"/>
<ellipse cx="232" cy="207" rx="28" ry="7" fill="url(#cav)"/>
${bud(148, 182, -6)}
<path d="M74 205 A116 16 0 0 0 306 205 L306 280 Q306 340 246 340 L134 340 Q74 340 74 280Z" fill="url(#case)" stroke="${ln}" stroke-width="1"/>
<path d="M78 214 A112 15 0 0 0 302 214" stroke="${shade(c, -0.12)}" stroke-width="1.2" fill="none"/>
<ellipse cx="190" cy="285" rx="5" ry="5" fill="#34d399" opacity=".9"/>
<path d="M84 230 Q86 290 128 326" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".6"/>
${bud(322, 236, 22, -1)}`;
    },
  },

  /* ------------------------------------------------------------ tablet */
  tablet: {
    vb: [400, 360],
    defaults: { frame: "#1f2937", s1: "#8b5cf6", s2: "#ec4899" },
    draw: (o) => {
      const f = o.frame, a = o.s1, b = o.s2;
      const pen = shade(f, 0.88);
      return `<defs>
${lg("fr", 0, 0, 1, 1, [[0, shade(f, 0.35)], [0.5, f], [1, shade(f, -0.3)]])}
${lg("scr", 0, 0, 1, 1, [[0, shade(a, 0.15)], [0.5, a], [1, b]])}
${rg("orb", 0.4, 0.35, 0.6, [[0, shade(b, 0.55)], [0.6, b], [1, shade(b, -0.25)]])}
${rg("orb2", 0.4, 0.35, 0.6, [[0, shade(a, 0.6)], [0.6, a], [1, shade(a, -0.3)]])}
${lg("hl", 0, 0, 1, 0, [[0, "#ffffff", 0], [0.5, "#ffffff", 0.2], [1, "#ffffff", 0]])}
${lg("pen", 0, 0, 0, 1, [[0, shade(pen, 0.6)], [0.5, pen], [1, shade(pen, -0.25)]])}
<clipPath id="cp"><rect x="46" y="62" width="292" height="200" rx="12"/></clipPath>
</defs>
${shadow(200, 318, 170, 18)}
<g transform="rotate(-8 200 170)">
<rect x="40" y="58" width="316" height="222" rx="24" fill="${shade(f, -0.45)}"/>
<rect x="32" y="50" width="318" height="222" rx="24" fill="url(#fr)"/>
<rect x="46" y="62" width="292" height="198" rx="12" fill="url(#scr)"/>
<g clip-path="url(#cp)">
<circle cx="270" cy="110" r="70" fill="url(#orb)"/>
<circle cx="120" cy="230" r="80" fill="url(#orb2)" opacity=".85"/>
<path d="M40 190 C120 130 200 250 340 160 L340 270 L40 270Z" fill="${shade(b, -0.25)}" opacity=".55"/>
<path d="M40 160 C120 100 200 220 340 130" stroke="#ffffff" stroke-width="2" fill="none" opacity=".45"/>
<path d="M90 40 L190 40 L90 290 L-10 290Z" fill="url(#hl)"/>
</g>
<circle cx="341" cy="161" r="2.5" fill="#3b4256"/>
</g>
<g transform="rotate(-13 200 300)">
<rect x="70" y="302" width="250" height="13" rx="6.5" fill="#000000" opacity=".15" transform="translate(4 8)"/>
<path d="M90 300 L310 300 Q318 300 318 306.5 Q318 313 310 313 L90 313 L62 307Z" fill="url(#pen)"/>
<path d="M62 307 L74 303 L74 311Z" fill="${shade(f, -0.2)}"/>
<rect x="250" y="300" width="4" height="13" fill="${shade(pen, -0.15)}"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ speaker + bulb */
  speaker: {
    vb: [400, 400],
    defaults: { body: "#e5e7eb", ring: "#38bdf8" },
    draw: (o) => {
      const b = o.body, r = o.ring;
      return `<defs>
${lg("cyl", 0, 0, 1, 0, [[0, shade(b, -0.35)], [0.3, shade(b, 0.1)], [0.55, b], [1, shade(b, -0.45)]])}
${lg("top", 0, 0, 1, 1, [[0, shade(b, 0.35)], [1, shade(b, -0.1)]])}
<pattern id="fab" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".9" fill="#000000" opacity=".22"/><circle cx="3" cy="3" r=".9" fill="#000000" opacity=".14"/></pattern>
<filter id="bl" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>
${rg("bulb", 0.42, 0.38, 0.62, [[0, "#ffffff"], [0.55, mix(r, "#ffffff", 0.8)], [1, mix(r, "#ffffff", 0.35)]])}
${rg("halo", 0.5, 0.5, 0.5, [[0, r, 0.45], [1, r, 0]])}
${lg("base", 0, 0, 1, 0, [[0, "#6b7280"], [0.4, "#e5e7eb"], [1, "#4b5563"]])}
</defs>
${shadow(170, 352, 112, 16)}
${shadow(318, 356, 52, 9, 0.3, "gsh2")}
<path d="M86 92 L86 330 Q86 356 168 356 Q250 356 250 330 L250 92Z" fill="url(#cyl)"/>
<path d="M86 104 L86 330 Q86 356 168 356 Q250 356 250 330 L250 104Z" fill="url(#fab)"/>
<path d="M86 330 Q86 356 168 356 Q250 356 250 330" stroke="${shade(b, -0.4)}" stroke-width="3" fill="none"/>
<ellipse cx="168" cy="92" rx="82" ry="24" fill="${shade(b, -0.2)}"/>
<ellipse cx="168" cy="90" rx="82" ry="23" fill="url(#top)"/>
<ellipse cx="168" cy="90" rx="66" ry="17" fill="none" stroke="${r}" stroke-width="7" filter="url(#bl)"/>
<ellipse cx="168" cy="90" rx="66" ry="17" fill="none" stroke="${shade(r, 0.35)}" stroke-width="3.5"/>
<circle cx="146" cy="88" r="3" fill="${shade(b, -0.35)}"/><circle cx="168" cy="86" r="3" fill="${shade(b, -0.35)}"/><circle cx="190" cy="88" r="3" fill="${shade(b, -0.35)}"/>
<path d="M110 120 L110 320" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity=".2"/>
<circle cx="318" cy="250" r="80" fill="url(#halo)"/>
<path d="M298 318 L338 318 L336 300 Q336 290 346 278 Q366 258 366 236 A48 48 0 1 0 270 236 Q270 258 290 278 Q300 290 300 300Z" fill="url(#bulb)" stroke="${mix(r, "#ffffff", 0.4)}" stroke-width="1"/>
<path d="M290 214 Q298 196 316 192" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none"/>
<rect x="298" y="314" width="40" height="30" rx="4" fill="url(#base)"/>
${range(3).map((i) => `<rect x="298" y="${320 + i * 7}" width="40" height="2.5" fill="#374151" opacity=".5"/>`).join("")}
<path d="M306 344 L330 344 L324 354 L312 354Z" fill="#374151"/>`;
    },
  },

  /* ------------------------------------------------------------ VR headset */
  vr: {
    vb: [400, 320],
    defaults: { body: "#f8fafc", visor: "#1e293b" },
    draw: (o) => {
      const b = o.body, v = o.visor;
      return `<defs>
${lg("sh", 0, 0, 1, 1, [[0, shade(b, 0.3)], [0.5, b], [1, shade(b, -0.28)]])}
${lg("side", 0, 0, 1, 0, [[0, shade(b, -0.05)], [1, shade(b, -0.35)]])}
${lg("vis", 0, 0, 1, 1, [[0, shade(v, 0.25)], [0.45, v], [1, shade(v, -0.5)]])}
${lg("strap", 0, 0, 0, 1, [[0, "#4b5563"], [1, "#1f2937"]])}
${lg("hl", 0, 0, 1, 1, [[0, "#ffffff", 0.55], [1, "#ffffff", 0]])}
</defs>
${shadow(205, 290, 170, 16)}
<path d="M300 92 C350 60 392 90 388 150 C384 210 350 236 310 218" stroke="url(#strap)" stroke-width="22" fill="none" stroke-linecap="round"/>
<path d="M300 92 C350 60 392 90 388 150" stroke="#6b7280" stroke-width="3" fill="none" opacity=".6"/>
<path d="M190 72 C230 22 330 20 368 80" stroke="url(#strap)" stroke-width="16" fill="none" stroke-linecap="round"/>
<path d="M270 74 L330 84 Q350 90 350 116 L348 208 Q346 232 322 236 L262 238Z" fill="url(#side)"/>
<path d="M46 108 Q46 72 84 68 L272 60 Q312 60 314 98 L318 204 Q318 244 280 246 L234 248 Q214 250 204 230 Q190 208 168 212 Q150 216 140 238 Q132 256 108 254 L80 252 Q44 248 42 210Z" fill="url(#sh)"/>
<path d="M60 112 Q60 84 90 82 L268 76 Q298 76 300 104 L302 198 Q302 228 274 230 L238 232 Q222 232 214 216 Q198 192 168 196 Q144 200 130 224 Q124 238 108 238 L86 236 Q58 234 58 204Z" fill="url(#vis)"/>
<path d="M68 112 Q70 92 92 90 L190 86 Q120 110 76 196 Q68 180 68 160Z" fill="url(#hl)" opacity=".7"/>
<path d="M200 86 L270 84 Q290 86 292 104" stroke="#ffffff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>
<circle cx="100" cy="214" r="6" fill="${shade(v, -0.4)}" stroke="${shade(v, 0.3)}" stroke-width="1.5"/>
<circle cx="262" cy="210" r="6" fill="${shade(v, -0.4)}" stroke="${shade(v, 0.3)}" stroke-width="1.5"/>
<rect x="330" y="140" width="6" height="30" rx="3" fill="${shade(b, -0.45)}"/>`;
    },
  },

  /* ------------------------------------------------------------ gamepad */
  gamepad: {
    vb: [400, 320],
    defaults: { body: "#1f2937", accent: "#8b5cf6" },
    draw: (o) => {
      const b = o.body, a = o.accent;
      const shape = "M120 80 C150 68 250 68 280 80 C332 86 356 110 370 160 C388 226 394 266 360 280 C330 292 304 262 286 238 C266 216 134 216 114 238 C96 262 70 292 40 280 C6 266 12 226 30 160 C44 110 68 86 120 80Z";
      const btn = (x: number, y: number) =>
        `<circle cx="${x}" cy="${y + 2}" r="12" fill="#000000" opacity=".35"/><circle cx="${x}" cy="${y}" r="12" fill="url(#btn)"/><circle cx="${x}" cy="${y}" r="16" fill="${a}" opacity=".18" filter="url(#gl)"/><circle cx="${x - 3}" cy="${y - 4}" r="3.5" fill="#ffffff" opacity=".45"/>`;
      const stick = (x: number, y: number) =>
        `<circle cx="${x}" cy="${y}" r="27" fill="${shade(b, -0.5)}"/><circle cx="${x}" cy="${y}" r="27" fill="none" stroke="${a}" stroke-width="2" opacity=".7"/><circle cx="${x}" cy="${y + 4}" r="21" fill="#000000" opacity=".4"/><circle cx="${x}" cy="${y}" r="21" fill="url(#stk)"/><circle cx="${x}" cy="${y}" r="15" fill="${shade(b, -0.2)}" stroke="${shade(b, 0.15)}" stroke-width="1.5"/>`;
      return `<defs>
${lg("top", 0, 0, 0.3, 1, [[0, shade(b, 0.28)], [0.5, b], [1, shade(b, -0.3)]])}
${rg("btn", 0.4, 0.35, 0.7, [[0, shade(a, 0.55)], [0.7, a], [1, shade(a, -0.35)]])}
${lg("stk", 0, 0, 1, 1, [[0, shade(b, 0.3)], [1, shade(b, -0.45)]])}
${lg("bar", 0, 0, 1, 0, [[0, a, 0], [0.5, shade(a, 0.3)], [1, a, 0]])}
<filter id="gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
${shadow(200, 296, 175, 15)}
<g transform="rotate(-5 200 180)">
<path d="M110 84 Q118 56 150 58 L176 62 Q170 76 150 82Z" fill="${shade(b, -0.2)}"/>
<path d="M290 84 Q282 56 250 58 L224 62 Q230 76 250 82Z" fill="${shade(b, -0.2)}"/>
<path d="${shape}" fill="${shade(b, -0.5)}" transform="translate(0 14)"/>
<path d="${shape}" fill="url(#top)"/>
<path d="M122 90 C160 80 240 80 278 90" stroke="#ffffff" stroke-width="3" fill="none" opacity=".25" stroke-linecap="round"/>
<path d="M44 170 C54 116 76 98 118 92" stroke="#ffffff" stroke-width="4" fill="none" opacity=".18" stroke-linecap="round"/>
<rect x="160" y="104" width="80" height="6" rx="3" fill="url(#bar)"/>
<rect x="160" y="104" width="80" height="6" rx="3" fill="url(#bar)" filter="url(#gl)"/>
<circle cx="200" cy="140" r="13" fill="${shade(b, -0.45)}"/><circle cx="200" cy="140" r="8" fill="${a}" opacity=".85"/><circle cx="200" cy="140" r="12" fill="${a}" opacity=".35" filter="url(#gl)"/>
<rect x="168" y="134" width="12" height="6" rx="3" fill="${shade(b, -0.4)}"/><rect x="220" y="134" width="12" height="6" rx="3" fill="${shade(b, -0.4)}"/>
${stick(110, 138)}${stick(244, 196)}
<g transform="translate(152 196)"><circle r="26" fill="${shade(b, -0.35)}"/><path d="M-7 -20 h14 v13 h13 v14 h-13 v13 h-14 v-13 h-13 v-14 h13z" fill="${shade(b, -0.6)}"/><path d="M-6 -19 h12 v13 h13 v12 h-13 v13 h-12 v-13 h-13 v-12 h13z" fill="${shade(b, 0.12)}"/></g>
${btn(292, 112)}${btn(316, 136)}${btn(268, 136)}${btn(292, 160)}
</g>`;
    },
  },
  /* ------------------------------------------------------------ dumbbells */
  dumbbells: {
    vb: [400, 400],
    defaults: { metal: "#9ca3af", grip: "#4b5563" },
    draw: (o) => {
      const m = o.metal, g = o.grip;
      const R = 50, kx = -0.3, ct = Math.cos(rad(22)), stt = Math.sin(rad(22));
      const hexv = range(6).map((i) => { const a = rad(60 * i + 30); return [Math.cos(a) * R, Math.sin(a) * R] as P; }); // [z, y]
      const pr = (x: number, z: number, y: number): P => [x + z * kx, y * ct + z * stt];
      const head = (x0: number, x1: number, endX: number) => {
        let out = "";
        for (let i = 0; i < 6; i++) {
          const a = hexv[i], b = hexv[(i + 1) % 6];
          const zm = (a[0] + b[0]) / 2, ym = (a[1] + b[1]) / 2;
          const d = (zm * ct - ym * stt) / R;
          if (d <= 0.02) continue;
          const lightTop = -ym / R;
          out += poly([pr(x0, a[0], a[1]), pr(x1, a[0], a[1]), pr(x1, b[0], b[1]), pr(x0, b[0], b[1])], shade(m, -0.45 + lightTop * 0.5 + d * 0.2));
        }
        const face = hexv.map((v) => pr(endX, v[0], v[1]));
        out += poly(face, "url(#end)");
        out += poly(hexv.map((v) => pr(endX, v[0] * 0.78, v[1] * 0.78)), "none", `stroke="${shade(m, 0.45)}" stroke-width="1.5" opacity=".6"`);
        return out;
      };
      const db = (t: string) => `<g transform="${t}">
${head(-150, -100, -100)}
<rect x="-104" y="-12" width="208" height="24" rx="6" fill="url(#hdl)"/>
<rect x="-70" y="-12" width="140" height="24" fill="url(#knurl)" opacity=".7"/>
<rect x="-104" y="-17" width="12" height="34" rx="3" fill="url(#col)"/>
<rect x="92" y="-17" width="12" height="34" rx="3" fill="url(#col)"/>
${head(100, 150, 150)}
</g>`;
      return `<defs>
${lg("hdl", 0, 0, 0, 1, [[0, shade(g, 0.45)], [0.35, shade(g, 0.15)], [1, shade(g, -0.45)]])}
${lg("col", 0, 0, 0, 1, [[0, shade(m, 0.7)], [0.4, shade(m, 0.2)], [1, shade(m, -0.4)]])}
${lg("end", 0, 0, 1, 1, [[0, shade(m, 0.35)], [1, shade(m, -0.15)]])}
<pattern id="knurl" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#000000" opacity=".25"/></pattern>
</defs>
${shadow(200, 352, 185, 22)}
${db("translate(196 236) rotate(-24) scale(.92)")}
${db("translate(190 316) scale(.95)")}`;
    },
  },

  /* ------------------------------------------------------------ balls */
  ball: {
    vb: [400, 400],
    defaults: { c: "#ffffff", kind: "soccer" },
    draw: (o) => {
      const kind = o.kind || "soccer";
      if (kind === "golf") {
        const c = o.c, cx = 200, cy = 150, R = 118;
        const dimples: string[] = [];
        for (let row = -7; row <= 7; row++)
          for (let col = -7; col <= 7; col++) {
            const x = cx + (col + (row % 2 ? 0.5 : 0)) * 17, y = cy + row * 15;
            const d = Math.hypot(x - cx, y - cy) / R;
            if (d > 0.96) continue;
            const k = Math.sqrt(1 - d * d);
            const ang = Math.atan2(y - cy, x - cx);
            dimples.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(6.2 * (0.35 + 0.65 * k))}" ry="6.2" transform="rotate(${f1((ang * 180) / Math.PI + 90)} ${f1(x)} ${f1(y)})" fill="url(#dm)" opacity="${f1(0.5 + k * 0.5)}"/>`);
          }
        return `<defs>
${rg("bb", 0.38, 0.32, 0.75, [[0, shade(c, 0.6)], [0.55, c], [0.85, shade(c, -0.18)], [1, shade(c, -0.32)]])}
${rg("dm", 0.62, 0.65, 0.6, [[0, shade(c, 0.4)], [0.6, shade(c, -0.08)], [1, shade(c, -0.25)]])}
${lg("tee", 0, 0, 1, 0, [[0, "#b8834f"], [0.45, "#f1cf9c"], [1, "#9a6a3c"]])}
<clipPath id="cp"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
</defs>
${shadow(200, 372, 70, 10)}
${shadow(200, 300, 46, 7, 0.25, "gsh2")}
<path d="M150 272 Q200 296 250 272 L212 300 L206 356 Q200 372 194 356 L188 300Z" fill="url(#tee)"/>
<ellipse cx="200" cy="272" rx="50" ry="10" fill="#c9965f"/><ellipse cx="200" cy="270" rx="42" ry="7" fill="#e3b77f"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#bb)"/>
<g clip-path="url(#cp)">${dimples.join("")}</g>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#shd)"/>
${rg("shd", 0.4, 0.35, 0.72, [[0, "#ffffff", 0.35], [0.5, "#ffffff", 0], [0.9, "#000000", 0.12], [1, "#000000", 0.25]])}
<ellipse cx="160" cy="94" rx="34" ry="20" fill="#ffffff" opacity=".55" transform="rotate(-35 160 94)"/>`;
      }
      if (kind === "basket") {
        const c = lum(o.c) > 0.82 ? "#e8742a" : o.c, ln = shade(c, -0.75);
        return `<defs>
${rg("bb", 0.36, 0.32, 0.78, [[0, shade(c, 0.35)], [0.55, c], [0.9, shade(c, -0.35)], [1, shade(c, -0.5)]])}
<pattern id="peb" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" fill="#000000" opacity=".16"/></pattern>
<clipPath id="cp"><circle cx="200" cy="190" r="160"/></clipPath>
</defs>
${shadow(200, 372, 140, 16)}
<circle cx="200" cy="190" r="160" fill="url(#bb)"/>
<circle cx="200" cy="190" r="160" fill="url(#peb)"/>
<g clip-path="url(#cp)" fill="none" stroke="${ln}" stroke-width="6" stroke-linecap="round">
<path d="M40 175 Q200 215 360 175"/>
<path d="M205 30 Q170 190 205 350"/>
<path d="M95 66 Q175 150 120 330"/>
<path d="M300 58 Q232 160 300 330"/>
</g>
<ellipse cx="140" cy="110" rx="50" ry="28" fill="#ffffff" opacity=".22" transform="rotate(-35 140 110)"/>`;
      }
      // soccer
      const c = o.c, pc = lum(c) > 0.5 ? shade(c, -0.88) : shade(c, 0.85);
      const cx = 200, cy = 188, R = 160;
      const pent = (x: number, y: number, r: number, rot: number) => range(5).map((i) => { const a = rad(rot + i * 72); return [x + Math.cos(a) * r, y + Math.sin(a) * r] as P; });
      const center = pent(cx, cy, 44, -90);
      const outers: P[][] = [];
      let lines = "";
      for (let i = 0; i < 5; i++) {
        const a = -90 + 36 + i * 72;
        const d = 128, px = cx + Math.cos(rad(a)) * d, py = cy + Math.sin(rad(a)) * d;
        const p = pent(px, py, 40, a + 180).map(([x, y]) => {
          // squash radially to fake sphere curvature
          const dx = x - cx, dy = y - cy, r0 = Math.hypot(dx, dy), r1 = R * Math.sin((r0 / R) * 1.2 > 1.57 ? 1.57 : (r0 / R) * 1.2);
          return [cx + (dx / r0) * r1, cy + (dy / r0) * r1] as P;
        });
        outers.push(p);
      }
      for (let i = 0; i < 5; i++) {
        const v = center[i], w: P = [cx + (v[0] - cx) * 1.95, cy + (v[1] - cy) * 1.95];
        lines += `<path d="M${f1(v[0])} ${f1(v[1])} L${f1(w[0])} ${f1(w[1])}"/>`;
        for (const p of [outers[i], outers[(i + 4) % 5]]) {
          let best = p[0], bd = 1e9;
          for (const q of p) { const dd = Math.hypot(q[0] - w[0], q[1] - w[1]); if (dd < bd) { bd = dd; best = q; } }
          lines += `<path d="M${f1(w[0])} ${f1(w[1])} L${f1(best[0])} ${f1(best[1])}"/>`;
        }
        const p = outers[i];
        for (const q of p) {
          const dq = Math.hypot(q[0] - cx, q[1] - cy);
          if (dq > 118) lines += `<path d="M${f1(q[0])} ${f1(q[1])} L${f1(cx + ((q[0] - cx) / dq) * 175)} ${f1(cy + ((q[1] - cy) / dq) * 175)}"/>`;
        }
      }
      return `<defs>
${rg("shd", 0.38, 0.32, 0.75, [[0, "#ffffff", 0.45], [0.45, "#ffffff", 0], [0.85, "#000000", 0.18], [1, "#000000", 0.38]])}
${lg("pan", 0, 0, 1, 1, [[0, shade(pc, 0.25)], [1, pc]])}
<clipPath id="cp"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
</defs>
${shadow(200, 366, 140, 16)}
<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c}"/>
<g clip-path="url(#cp)">
<g stroke="${shade(c, -0.3)}" stroke-width="2.5" fill="none">${lines}</g>
${poly(center, "url(#pan)", 'stroke-linejoin="round"')}
${outers.map((p) => poly(p, "url(#pan)")).join("")}
</g>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#shd)"/>
<ellipse cx="140" cy="108" rx="46" ry="26" fill="#ffffff" opacity=".35" transform="rotate(-35 140 108)"/>`;
    },
  },

  /* ------------------------------------------------------------ runner */
  runner: {
    vb: [400, 400],
    defaults: { skin: "#8d5524", top: "#2563eb", bottom: "#111111" },
    draw: (o) => {
      const s = o.skin, t = o.top, b = o.bottom;
      const sd = shade(s, -0.3), td = shade(t, -0.3), bd = shade(b, lum(b) < 0.2 ? 0.12 : -0.3);
      const L = (pts2: P[], w: number, col: string) => `<path d="M${pts2.map((p) => p.join(" ")).join(" L")}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      const shoe = (a: P, toe: P, dark: boolean) => {
        const sole = dark ? "#cbd5e1" : "#f8fafc";
        return `${L([a, toe], 18, dark ? shade(t, -0.15) : t)}${L([[a[0], a[1] + 6], [toe[0], toe[1] + 6]], 6, sole)}`;
      };
      const S: P = [240, 128], H: P = [198, 222];
      return `<defs>
${lg("torso", 0, 0, 1, 0, [[0, shade(t, -0.15)], [0.6, t], [1, shade(t, 0.2)]])}
${rg("head", 0.6, 0.35, 0.7, [[0, shade(s, 0.15)], [1, shade(s, -0.12)]])}
${lg("ml", 0, 0, 1, 0, [[0, t, 0], [1, t, 0.55]])}
</defs>
${shadow(200, 380, 150, 12, 0.28)}
<g transform="translate(203 210) scale(1.1) translate(-203 -210)">
<g stroke="url(#ml)" stroke-width="6" stroke-linecap="round">
<path d="M28 150 L120 150"/><path d="M14 192 L112 192"/><path d="M40 234 L128 234"/><path d="M22 280 L96 280"/>
</g>
${L([S, [276, 170], [306, 134]], 17, sd)}
${L([S, [262, 156]], 21, td)}
${L([H, [160, 290], [112, 340]], 27, sd)}
${shoe([108, 342], [136, 360], true)}
${L([H, [176, 262]], 34, bd)}
<path d="M232 120 Q262 132 252 160 L226 222 Q206 236 182 226 Q174 210 186 182 L206 134 Q214 116 232 120Z" fill="url(#torso)"/>
<path d="M218 128 L196 192" stroke="#ffffff" stroke-width="3" opacity=".35" stroke-linecap="round"/>
${L([H, [264, 246], [244, 318]], 28, s)}
${shoe([240, 322], [272, 330], false)}
${L([H, [238, 238]], 38, b)}
<path d="M182 222 Q200 240 226 226" stroke="${bd}" stroke-width="3" fill="none"/>
${L([S, [204, 170], [180, 200]], 18, s)}
${L([S, [212, 158]], 23, t)}
<circle cx="178" cy="202" r="9" fill="${s}"/>
<path d="M240 108 L246 124" stroke="${s}" stroke-width="18" stroke-linecap="round"/>
<ellipse cx="262" cy="86" rx="23" ry="26" fill="url(#head)"/>
<path d="M286 92 L276 99 L284 103Z" fill="${s}"/>
<path d="M240 90 Q236 60 262 58 Q288 58 286 80 Q270 70 258 80 Q252 96 240 90Z" fill="#141414"/>
<path d="M238 80 Q262 70 288 80" stroke="${t}" stroke-width="6" fill="none" stroke-linecap="round"/>
<circle cx="256" cy="92" r="5" fill="${sd}"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ bodybuilder */
  athlete: {
    vb: [400, 400],
    defaults: { skin: "#c68642", shorts: "#111111" },
    draw: (o) => {
      const s = o.skin, sh = o.shorts;
      const d1 = shade(s, -0.22), d2 = shade(s, -0.38), hi = shade(s, 0.25);
      const arm = (k: number) => {
        const X = (x: number) => (k > 0 ? x : 400 - x);
        return `<path d="M${X(132)} 150 C${X(110)} 132 ${X(84)} 122 ${X(62)} 134 C${X(42)} 142 ${X(36)} 160 ${X(44)} 178 C${X(60)} 196 ${X(100)} 198 ${X(134)} 196Z" fill="url(#lim)"/>
<path d="M${X(126)} 150 C${X(110)} 116 ${X(78)} 108 ${X(62)} 130 C${X(76)} 136 ${X(104)} 140 ${X(126)} 158Z" fill="${hi}" opacity=".35"/>
<path d="M${X(62)} 186 C${X(84)} 196 ${X(110)} 196 ${X(132)} 190" stroke="${d2}" stroke-width="4" fill="none" opacity=".6"/>
<path d="M${X(44)} 172 C${X(30)} 140 ${X(34)} 110 ${X(48)} 86 L${X(80)} 82 C${X(82)} 110 ${X(78)} 140 ${X(70)} 168Z" fill="url(#lim)"/>
<path d="M${X(44)} 150 C${X(38)} 126 ${X(42)} 104 ${X(52)} 88" stroke="${d1}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>
<rect x="${X(64) - 22}" y="44" width="44" height="44" rx="16" fill="url(#lim)"/>
<path d="M${X(46)} 58 L${X(82)} 58 M${X(46)} 68 L${X(82)} 68 M${X(47)} 78 L${X(81)} 78" stroke="${d1}" stroke-width="2.2" opacity=".75" stroke-linecap="round"/>
<path d="M${X(44)} 74 Q${X(58)} 92 ${X(78)} 86" stroke="${d2}" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
<path d="M${X(50)} 48 Q${X(64)} 42 ${X(78)} 48" stroke="${hi}" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>
<circle cx="${X(122)}" cy="172" r="34" fill="url(#delt${k > 0 ? "l" : "r"})"/>`;
      };
      const ab = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="url(#ab)"/>`;
      return `<defs>
${lg("lim", 0, 0, 0, 1, [[0, shade(s, 0.18)], [0.6, s], [1, d1]])}
${lg("tor", 0, 0, 1, 0, [[0, d2], [0.25, s], [0.5, shade(s, 0.12)], [0.75, s], [1, d2]])}
${rg("deltl", 0.4, 0.35, 0.7, [[0, hi], [0.7, s], [1, d1]])}
${rg("deltr", 0.6, 0.35, 0.7, [[0, hi], [0.7, s], [1, d1]])}
${lg("pec", 0, 0, 0, 1, [[0, shade(s, 0.2)], [0.75, s], [1, d2]])}
${lg("ab", 0, 0, 0, 1, [[0, shade(s, 0.22)], [1, shade(s, -0.12)]])}
${lg("sh", 0, 0, 1, 0, [[0, shade(sh, lum(sh) < 0.2 ? 0.1 : -0.3)], [0.5, shade(sh, lum(sh) < 0.2 ? 0.22 : 0.15)], [1, shade(sh, lum(sh) < 0.2 ? 0.05 : -0.35)]])}
${rg("head", 0.45, 0.35, 0.7, [[0, shade(s, 0.15)], [1, d1]])}
</defs>
${arm(1)}${arm(-1)}
<path d="M120 168 Q200 136 280 168 L270 236 Q258 290 250 338 L150 338 Q142 290 130 236Z" fill="url(#tor)"/>
<path d="M168 136 Q200 128 232 136 L272 164 Q200 150 128 164Z" fill="${d1}"/>
<path d="M176 108 L224 108 L230 150 Q200 160 170 150Z" fill="${d1}"/>
<path d="M200 180 Q166 170 142 186 Q130 214 150 232 Q178 246 200 232Z" fill="url(#pec)"/>
<path d="M200 180 Q234 170 258 186 Q270 214 250 232 Q222 246 200 232Z" fill="url(#pec)"/>
<path d="M150 234 Q178 248 200 236 Q222 248 250 234" stroke="${d2}" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M200 182 L200 334" stroke="${d2}" stroke-width="2.5" opacity=".7"/>
${ab(170, 246, 27, 26)}${ab(203, 246, 27, 26)}${ab(171, 277, 26, 25)}${ab(203, 277, 26, 25)}${ab(173, 307, 24, 26)}${ab(203, 307, 24, 26)}
<path d="M136 240 Q150 280 156 330" stroke="${d2}" stroke-width="3" fill="none" opacity=".6"/>
<path d="M264 240 Q250 280 244 330" stroke="${d2}" stroke-width="3" fill="none" opacity=".6"/>
<path d="M142 250 L162 258 M144 270 L164 278 M148 290 L166 298" stroke="${d1}" stroke-width="3" opacity=".6" stroke-linecap="round"/>
<path d="M258 250 L238 258 M256 270 L236 278 M252 290 L234 298" stroke="${d1}" stroke-width="3" opacity=".6" stroke-linecap="round"/>
<path d="M146 330 L254 330 L268 400 L132 400Z" fill="url(#sh)"/>
<rect x="144" y="326" width="112" height="14" rx="4" fill="${shade(sh, lum(sh) < 0.2 ? 0.3 : -0.2)}"/>
<ellipse cx="200" cy="80" rx="30" ry="36" fill="url(#head)"/>
<ellipse cx="170" cy="84" rx="6" ry="10" fill="${d1}"/><ellipse cx="230" cy="84" rx="6" ry="10" fill="${d1}"/>
<path d="M170 72 Q168 42 200 40 Q232 42 230 72 Q222 56 200 56 Q178 56 170 72Z" fill="#1a1a1a"/>
<path d="M186 104 Q200 112 214 104" stroke="${d2}" stroke-width="2" fill="none" opacity=".5"/>`;
    },
  },

  /* ------------------------------------------------------------ yoga */
  yoga: {
    vb: [400, 400],
    defaults: { skin: "#f1c7a8", outfit: "#a78bfa", mat: "#f9a8d4" },
    draw: (o) => {
      const s = o.skin, f = o.outfit, m = o.mat;
      const sd = shade(s, -0.2);
      const L = (p: P[], w: number, col: string) => `<path d="M${p.map((q) => q.join(" ")).join(" L")}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
      return `<defs>
${lg("mat", 0, 0, 0, 1, [[0, shade(m, 0.2)], [1, shade(m, -0.1)]])}
${lg("leg", 0, 0, 1, 0, [[0, shade(f, -0.25)], [0.5, f], [1, shade(f, -0.15)]])}
${lg("top", 0, 0, 1, 0, [[0, shade(f, 0.05)], [0.5, shade(f, 0.3)], [1, shade(f, 0.05)]])}
${lg("skin", 0, 0, 1, 0, [[0, sd], [0.5, s], [1, sd]])}
</defs>
${shadow(200, 372, 165, 14, 0.25)}
<path d="M60 352 L340 352 Q352 352 358 362 L372 382 Q376 390 364 390 L36 390 Q24 390 28 382 L42 362 Q48 352 60 352Z" fill="${shade(m, -0.25)}" transform="translate(0 6)"/>
<path d="M60 352 L340 352 Q352 352 358 362 L372 382 Q376 390 364 390 L36 390 Q24 390 28 382 L42 362 Q48 352 60 352Z" fill="url(#mat)"/>
<path d="M66 358 L334 358" stroke="#ffffff" stroke-width="2" opacity=".4"/>
${L([[132, 272], [194, 262]], 20, shade(f, -0.32))}
${L([[190, 238], [132, 272]], 27, "url(#leg)")}
<path d="M200 232 L226 232 Q229 270 222 302 Q219 332 217 358 L206 358 Q204 332 203 302 Q198 270 200 232Z" fill="url(#leg)"/>
<path d="M222 246 Q224 280 219 310" stroke="#ffffff" stroke-width="2.5" fill="none" opacity=".25" stroke-linecap="round"/>
<ellipse cx="200" cy="262" rx="13" ry="6" fill="${sd}" transform="rotate(-70 200 262)"/>
<path d="M203 356 Q200 368 214 368 L226 368 Q232 366 226 360 L218 354Z" fill="${s}"/>
<path d="M178 222 Q200 214 224 222 L227 246 Q214 254 200 250 Q186 254 174 244Z" fill="url(#leg)"/>
${L([[184, 146], [158, 98], [195, 50]], 12, s)}
${L([[216, 146], [242, 98], [205, 50]], 12, s)}
<path d="M200 24 Q208 34 206 56 L194 56 Q192 34 200 24Z" fill="${s}"/>
<path d="M193 128 L193 118 L207 118 L207 128Z" fill="${sd}"/>
<path d="M184 170 L216 170 Q212 196 222 224 L178 224 Q188 196 184 170Z" fill="url(#skin)"/>
<path d="M186 196 Q200 200 214 196" stroke="${sd}" stroke-width="1.2" fill="none" opacity=".6"/>
<path d="M178 138 Q200 130 222 138 Q226 156 219 174 Q200 180 181 174 Q174 156 178 138Z" fill="url(#top)"/>
<path d="M190 134 Q200 146 210 134" stroke="${shade(f, -0.2)}" stroke-width="2" fill="none"/>
<circle cx="180" cy="144" r="8" fill="${sd}"/><circle cx="220" cy="144" r="8" fill="${s}"/>
<ellipse cx="200" cy="104" rx="16" ry="19" fill="${s}"/>
<path d="M184 106 Q180 82 200 82 Q220 82 216 106 Q212 92 200 92 Q188 92 184 106Z" fill="#3b2a24"/>
<circle cx="200" cy="76" r="9" fill="#3b2a24"/>
<path d="M194 116 Q200 120 206 116" stroke="${shade(s, -0.35)}" stroke-width="1.5" fill="none"/>`;
    },
  },

  /* ------------------------------------------------------------ jacket */
  jacket: {
    vb: [400, 400],
    defaults: { c1: "#111111", c2: "#e5e7eb" },
    draw: (o) => {
      const a = o.c1, b = o.c2;
      const dk = lum(a) < 0.2;
      const fold = dk ? "#ffffff" : "#000000";
      return `<defs>
${lg("body", 0, 0, 1, 0, [[0, shade(a, dk ? 0.05 : -0.2)], [0.35, shade(a, dk ? 0.16 : 0.05)], [0.65, shade(a, dk ? 0.12 : 0)], [1, shade(a, dk ? 0 : -0.25)]])}
${lg("pan", 0, 0, 1, 1, [[0, shade(b, 0.3)], [1, shade(b, -0.15)]])}
${lg("slv", 0, 0, 1, 0, [[0, shade(a, dk ? 0 : -0.3)], [1, shade(a, dk ? 0.14 : 0)]])}
${lg("slv2", 0, 0, 1, 0, [[0, shade(a, dk ? 0.14 : 0)], [1, shade(a, dk ? 0 : -0.3)]])}
</defs>
${shadow(200, 378, 120, 10, 0.22)}
<path d="M136 66 Q98 76 88 118 L60 322 Q78 340 108 336 L128 190Z" fill="url(#slv)"/>
<path d="M264 66 Q302 76 312 118 L340 322 Q322 340 292 336 L272 190Z" fill="url(#slv2)"/>
<path d="M120 76 Q104 86 98 112 L76 300 L90 302 L112 120 Q116 96 128 84Z" fill="url(#pan)"/>
<path d="M280 76 Q296 86 302 112 L324 300 L310 302 L288 120 Q284 96 272 84Z" fill="url(#pan)"/>
<path d="M60 318 Q80 336 108 332 L106 350 Q80 354 58 338Z" fill="${shade(a, dk ? 0.1 : -0.3)}"/>
<path d="M340 318 Q320 336 292 332 L294 350 Q320 354 342 338Z" fill="${shade(a, dk ? 0.1 : -0.3)}"/>
<path d="M136 64 L166 52 Q200 66 234 52 L264 64 Q282 70 284 96 L284 340 Q240 350 200 350 Q160 350 116 340 L116 96 Q118 70 136 64Z" fill="url(#body)"/>
<path d="M136 64 L166 52 Q200 66 234 52 L264 64 Q282 70 284 96 L284 150 Q240 136 200 160 Q160 136 116 150 L116 96 Q118 70 136 64Z" fill="url(#pan)"/>
<path d="M116 150 Q160 136 200 160 Q240 136 284 150" stroke="${shade(a, dk ? 0.3 : -0.35)}" stroke-width="5" fill="none"/>
<path d="M116 322 Q200 336 284 322 L284 340 Q200 352 116 340Z" fill="${shade(a, dk ? 0.1 : -0.3)}"/>
<path d="M166 52 Q200 66 234 52 L232 30 Q200 40 168 30Z" fill="${shade(a, dk ? 0.12 : -0.15)}"/>
<path d="M168 30 Q200 40 232 30 L232 36 Q200 46 168 36Z" fill="${shade(b, -0.05)}"/>
<path d="M200 46 L200 348" stroke="${shade(a, dk ? 0.35 : -0.45)}" stroke-width="7"/>
<path d="M200 46 L200 348" stroke="${shade(b, -0.2)}" stroke-width="3" stroke-dasharray="2 2"/>
<rect x="194" y="58" width="12" height="22" rx="3" fill="${shade(b, -0.1)}"/><rect x="196" y="78" width="8" height="14" rx="3" fill="${shade(b, -0.3)}"/>
<path d="M140 234 L166 280" stroke="${shade(a, dk ? 0.3 : -0.4)}" stroke-width="3" stroke-linecap="round"/>
<path d="M260 234 L234 280" stroke="${shade(a, dk ? 0.3 : -0.4)}" stroke-width="3" stroke-linecap="round"/>
<path d="M150 180 Q160 240 150 320" stroke="${fold}" stroke-width="6" fill="none" opacity=".06"/>
<path d="M252 180 Q244 240 254 320" stroke="${fold}" stroke-width="6" fill="none" opacity=".06"/>
<path d="M100 150 L82 300" stroke="#ffffff" stroke-width="5" opacity=".15" stroke-linecap="round"/>`;
    },
  },

  /* ------------------------------------------------------------ coins + arrow */
  coins: {
    vb: [400, 400],
    defaults: { coin: "#fbbf24", arrow: "#f59e0b" },
    draw: (o) => {
      const c = o.coin, a = o.arrow;
      const stack = (x: number, base: number, n: number) => {
        let s = "";
        for (let i = 0; i < n; i++) {
          const y = base - i * 13;
          s += `<ellipse cx="${x}" cy="${y}" rx="52" ry="17" fill="${shade(c, -0.3)}"/><rect x="${x - 52}" y="${y - 11}" width="104" height="11" fill="url(#edge)"/><path d="M${x - 52} ${y - 11} A52 17 0 0 0 ${x + 52} ${y - 11}" stroke="${shade(c, -0.35)}" stroke-width="1.2" fill="none" opacity=".6"/><rect x="${x - 52}" y="${y - 11}" width="104" height="11" fill="url(#rid)" opacity=".22"/>`;
        }
        const y = base - n * 13 + 2;
        s += `<ellipse cx="${x}" cy="${y}" rx="52" ry="17" fill="url(#face)"/><ellipse cx="${x}" cy="${y}" rx="40" ry="12.5" fill="none" stroke="${shade(c, -0.25)}" stroke-width="2.5"/><ellipse cx="${x}" cy="${y + 1}" rx="40" ry="12.5" fill="none" stroke="${shade(c, 0.5)}" stroke-width="1"/><path d="M${x} ${y - 7} L${x + 9} ${y} L${x} ${y + 7} L${x - 9} ${y}Z" fill="${shade(c, -0.2)}"/>`;
        return s;
      };
      const arr: P[] = [[40, 262], [128, 196], [184, 226], [300, 108]];
      const path = arr.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
      return `<defs>
${lg("edge", 0, 0, 1, 0, [[0, shade(c, -0.25)], [0.25, shade(c, 0.3)], [0.6, c], [1, shade(c, -0.3)]])}
${lg("face", 0, 0, 1, 1, [[0, shade(c, 0.5)], [0.5, c], [1, shade(c, -0.12)]])}
<pattern id="rid" width="4" height="11" patternUnits="userSpaceOnUse"><rect width="1.5" height="11" fill="${shade(c, -0.5)}"/></pattern>
${lg("arw", 0, 1, 1, 0, [[0, shade(a, -0.1)], [1, shade(a, 0.3)]])}
</defs>
${shadow(205, 362, 180, 20)}
<g transform="translate(7 12)"><path d="${path}" stroke="${shade(a, -0.45)}" stroke-width="30" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M276 72 L352 50 L332 128Z" fill="${shade(a, -0.45)}" stroke="${shade(a, -0.45)}" stroke-width="6" stroke-linejoin="round"/></g>
<path d="${path}" stroke="url(#arw)" stroke-width="30" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M276 72 L352 50 L332 128Z" fill="${shade(a, 0.25)}" stroke="${shade(a, 0.25)}" stroke-width="6" stroke-linejoin="round"/>
<path d="M46 252 L128 190 L184 218 L292 106" stroke="#ffffff" stroke-width="5" fill="none" opacity=".4" stroke-linejoin="round" stroke-linecap="round"/>
${stack(300, 336, 9)}${stack(106, 336, 5)}${stack(206, 352, 7)}
<g transform="rotate(-20 330 340)"><ellipse cx="338" cy="350" rx="40" ry="14" fill="${shade(c, -0.45)}"/><rect x="298" y="340" width="80" height="10" fill="url(#edge)"/><ellipse cx="338" cy="340" rx="40" ry="14" fill="url(#face)"/><ellipse cx="338" cy="340" rx="30" ry="10" fill="none" stroke="${shade(c, -0.25)}" stroke-width="2"/></g>`;
    },
  },

  /* ------------------------------------------------------------ bar chart */
  chart: {
    vb: [400, 400],
    defaults: { bars: "#2563eb", arrow: "#22c55e" },
    draw: (o) => {
      const c = o.bars, a = o.arrow;
      const dx = 22, dy = -13;
      const box = (x: number, base: number, w: number, h: number, col: string, gid: string) =>
        `${poly([[x + w, base - h], [x + w + dx, base - h + dy], [x + w + dx, base + dy], [x + w, base]], shade(col, -0.22))}
${poly([[x, base - h], [x + dx, base - h + dy], [x + w + dx, base - h + dy], [x + w, base - h]], shade(col, 0.35))}
<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="url(#${gid})"/>`;
      const heights = [70, 116, 168, 228];
      const bars = heights.map((h, i) => box(70 + i * 64, 318, 46, h, c, "bar")).join("");
      const tip: P = [360, 56];
      return `<defs>
${lg("bar", 0, 0, 1, 0, [[0, shade(c, 0.15)], [0.6, c], [1, shade(c, -0.1)]])}
${lg("base", 0, 0, 1, 0, [[0, "#e5e7eb"], [1, "#cbd5e1"]])}
${lg("arw", 0, 1, 1, 0, [[0, shade(a, -0.15)], [1, shade(a, 0.25)]])}
</defs>
${shadow(215, 360, 180, 18)}
${poly([[40, 318], [62, 305], [372, 305], [350, 318]], "#f1f5f9")}
${poly([[350, 318], [372, 305], [372, 325], [350, 338]], "#94a3b8")}
<rect x="40" y="318" width="310" height="20" fill="url(#base)"/>
${bars}
<g transform="translate(6 10)"><path d="M40 222 Q120 206 172 156 Q224 104 312 74" stroke="${shade(a, -0.45)}" stroke-width="24" fill="none" stroke-linecap="round"/><path d="M298 42 L${tip[0]} ${tip[1]} L318 100Z" fill="${shade(a, -0.45)}" stroke="${shade(a, -0.45)}" stroke-width="8" stroke-linejoin="round"/></g>
<path d="M40 222 Q120 206 172 156 Q224 104 312 74" stroke="url(#arw)" stroke-width="24" fill="none" stroke-linecap="round"/>
<path d="M298 42 L${tip[0]} ${tip[1]} L318 100Z" fill="${shade(a, 0.2)}" stroke="${shade(a, 0.2)}" stroke-width="8" stroke-linejoin="round"/>
<path d="M48 216 Q120 200 168 154 Q220 106 300 76" stroke="#ffffff" stroke-width="4" fill="none" opacity=".45" stroke-linecap="round"/>`;
    },
  },

  /* ------------------------------------------------------------ trophy */
  trophy: {
    vb: [400, 400],
    defaults: { gold: "#fbbf24" },
    draw: (o) => {
      const g = o.gold;
      const star = range(10).map((i) => { const r = i % 2 ? 12 : 28, a = rad(-90 + i * 36); return [200 + Math.cos(a) * r, 128 + Math.sin(a) * r] as P; });
      return `<defs>
${lg("gold", 0, 0, 1, 0, [[0, shade(g, -0.4)], [0.18, shade(g, 0.1)], [0.32, shade(g, 0.6)], [0.5, g], [0.8, shade(g, -0.3)], [1, shade(g, -0.05)]])}
${lg("goldv", 0, 0, 0, 1, [[0, shade(g, 0.4)], [1, shade(g, -0.35)]])}
${lg("in", 0, 0, 1, 0, [[0, shade(g, -0.55)], [0.6, shade(g, -0.2)], [1, shade(g, -0.5)]])}
${lg("base", 0, 0, 1, 0, [[0, "#111827"], [0.35, "#3f4757"], [0.6, "#1f2937"], [1, "#0b0f17"]])}
</defs>
${shadow(200, 374, 120, 12)}
<path d="M132 70 C78 64 60 92 66 124 C72 160 110 178 150 186" stroke="${shade(g, -0.35)}" stroke-width="17" fill="none" stroke-linecap="round"/>
<path d="M132 70 C78 64 60 92 66 124 C72 160 110 178 150 186" stroke="url(#goldv)" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M268 70 C322 64 340 92 334 124 C328 160 290 178 250 186" stroke="${shade(g, -0.35)}" stroke-width="17" fill="none" stroke-linecap="round"/>
<path d="M268 70 C322 64 340 92 334 124 C328 160 290 178 250 186" stroke="url(#goldv)" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M114 50 L286 50 Q290 160 236 206 Q216 222 214 244 L186 244 Q184 222 164 206 Q110 160 114 50Z" fill="url(#gold)"/>
<ellipse cx="200" cy="50" rx="86" ry="16" fill="${shade(g, 0.3)}"/>
<ellipse cx="200" cy="51" rx="78" ry="12" fill="url(#in)"/>
${poly(star, shade(g, -0.2))}
${poly(star.map(([x, y]) => [x - 1.5, y - 1.5] as P), shade(g, 0.35))}
<path d="M150 70 Q148 150 190 200" stroke="#ffffff" stroke-width="7" fill="none" opacity=".45" stroke-linecap="round"/>
<path d="M186 244 L214 244 L216 262 L184 262Z" fill="url(#gold)"/>
<ellipse cx="200" cy="264" rx="34" ry="9" fill="url(#gold)"/>
<path d="M168 266 L232 266 L240 292 L160 292Z" fill="url(#gold)"/>
<ellipse cx="200" cy="292" rx="48" ry="8" fill="${shade(g, -0.3)}"/>
<path d="M126 300 L274 300 L280 364 L120 364Z" fill="url(#base)"/>
<rect x="116" y="292" width="168" height="12" rx="3" fill="#2b3342"/>
<rect x="112" y="360" width="176" height="12" rx="3" fill="#0f141d"/>
<rect x="160" y="318" width="80" height="28" rx="3" fill="url(#gold)"/>
<rect x="166" y="324" width="68" height="16" rx="2" fill="none" stroke="${shade(g, -0.3)}" stroke-width="1.5"/>`;
    },
  },

  /* ------------------------------------------------------------ graduation */
  gradcap: {
    vb: [400, 400],
    defaults: { cap: "#111827", tassel: "#fbbf24", books: "#2563eb" },
    draw: (o) => {
      const c = o.cap, t = o.tassel, b = o.books;
      const book = (x: number, y: number, w: number, h: number, col: string) => `
<path d="M${x + w} ${y} L${x + w + 26} ${y - 16} L${x + w + 26} ${y + h - 16} L${x + w} ${y + h}Z" fill="#f3ead8"/>
${range(3).map((i) => `<path d="M${x + w + 2} ${y + 4 + i * ((h - 8) / 2.2)} L${x + w + 24} ${y - 12 + i * ((h - 8) / 2.2)}" stroke="#d6c7a8" stroke-width="1"/>`).join("")}
<path d="M${x + w} ${y} L${x + w + 26} ${y - 16} L${x + w + 26} ${y + h - 16} L${x + w} ${y + h}" stroke="${shade(col, -0.2)}" stroke-width="3" fill="none" stroke-linejoin="round"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${col}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h * 0.35}" rx="5" fill="#ffffff" opacity=".14"/>
<rect x="${x + 18}" y="${y + 6}" width="6" height="${h - 12}" fill="${shade(col, 0.35)}" opacity=".8"/>
<rect x="${x + w - 24}" y="${y + 6}" width="6" height="${h - 12}" fill="${shade(col, 0.35)}" opacity=".8"/>`;
      const top = (x: number, y: number, w: number, col: string) => poly([[x, y], [x + 26, y - 16], [x + w + 26, y - 16], [x + w, y]], shade(col, 0.15));
      return `<defs>
${lg("board", 0, 0, 1, 1, [[0, shade(c, 0.3)], [1, shade(c, -0.2)]])}
${lg("sk", 0, 0, 1, 0, [[0, shade(c, -0.2)], [0.5, shade(c, 0.18)], [1, shade(c, -0.3)]])}
${lg("tas", 0, 0, 1, 0, [[0, shade(t, -0.25)], [0.5, shade(t, 0.3)], [1, shade(t, -0.25)]])}
${lg("scroll", 0, 0, 0, 1, [[0, "#ffffff"], [0.5, "#f5efe1"], [1, "#d9cdb2"]])}
</defs>
${shadow(200, 366, 172, 16)}
${book(60, 300, 230, 50, shade(b, -0.3))}
${book(78, 254, 210, 46, b)}
${book(66, 212, 220, 42, shade(b, 0.3))}
${top(66, 212, 220, shade(b, 0.3))}
<path d="M140 196 L140 150 Q200 166 260 150 L260 196 Q200 214 140 196Z" fill="url(#sk)"/>
<path d="M200 60 L338 116 L200 172 L62 116Z" fill="${shade(c, -0.35)}" transform="translate(0 7)"/>
<path d="M200 60 L338 116 L200 172 L62 116Z" fill="url(#board)"/>
<path d="M200 60 L338 116" stroke="${shade(c, 0.45)}" stroke-width="2" opacity=".7"/>
<path d="M200 116 Q260 120 300 136 L304 214" stroke="${t}" stroke-width="4" fill="none"/>
<ellipse cx="200" cy="116" rx="11" ry="5" fill="${shade(t, -0.2)}"/><ellipse cx="200" cy="114" rx="9" ry="4" fill="${t}"/>
<rect x="297" y="206" width="14" height="10" rx="3" fill="${shade(t, -0.2)}"/>
<path d="M297 214 L293 262 Q304 270 315 262 L311 214Z" fill="url(#tas)"/>
<path d="M300 222 L298 258 M304 222 L304 260 M308 222 L310 258" stroke="${shade(t, -0.35)}" stroke-width="1" opacity=".6"/>
<g transform="rotate(-14 250 330)">
<rect x="150" y="322" width="200" height="34" rx="17" fill="url(#scroll)"/>
<ellipse cx="350" cy="339" rx="9" ry="17" fill="#e8dcc0"/><ellipse cx="350" cy="339" rx="4" ry="9" fill="#c9b78f"/>
<rect x="236" y="320" width="18" height="38" fill="${t}"/>
<path d="M245 356 L232 384 L240 382 L245 390 L250 382 L258 384Z" fill="${shade(t, -0.15)}"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ books + apple */
  books: {
    vb: [400, 400],
    defaults: { c1: "#ef4444", c2: "#3b82f6", c3: "#f59e0b" },
    draw: (o) => {
      const book = (x: number, y: number, w: number, h: number, col: string) => `
<path d="M${x + w} ${y} L${x + w + 30} ${y - 18} L${x + w + 30} ${y + h - 18} L${x + w} ${y + h}Z" fill="#f6efdf"/>
${range(4).map((i) => `<path d="M${x + w + 2} ${y + 5 + i * ((h - 10) / 3)} L${x + w + 28} ${y - 13 + i * ((h - 10) / 3)}" stroke="#ddd0b4" stroke-width="1"/>`).join("")}
<path d="M${x + w} ${y} L${x + w + 30} ${y - 18} L${x + w + 30} ${y + h - 18} L${x + w} ${y + h}" stroke="${shade(col, -0.2)}" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${col}"/>
<rect x="${x}" y="${y + h * 0.6}" width="${w}" height="${h * 0.4}" rx="6" fill="#000000" opacity=".12"/>
<rect x="${x}" y="${y}" width="${w}" height="${h * 0.3}" rx="6" fill="#ffffff" opacity=".18"/>
<rect x="${x + 20}" y="${y + 8}" width="${w * 0.35}" height="${h - 16}" rx="3" fill="${shade(col, -0.25)}"/>
<rect x="${x + 26}" y="${y + 13}" width="${w * 0.35 - 12}" height="4" rx="2" fill="${shade(col, 0.45)}"/>`;
      const top = (x: number, y: number, w: number, col: string) => poly([[x, y], [x + 30, y - 18], [x + w + 30, y - 18], [x + w, y]], shade(col, 0.2));
      return `<defs>
${rg("apple", 0.38, 0.35, 0.7, [[0, "#ff7a6b"], [0.55, "#e11d2e"], [1, "#8f0f1a"]])}
${lg("leaf", 0, 0, 1, 1, [[0, "#86efac"], [1, "#15803d"]])}
${lg("pen", 0, 0, 0, 1, [[0, "#fde68a"], [0.5, "#facc15"], [1, "#ca8a04"]])}
</defs>
${shadow(200, 370, 175, 16)}
${book(50, 300, 240, 58, o.c1)}
${book(74, 248, 216, 52, o.c2)}
${book(58, 204, 228, 44, o.c3)}
${top(58, 204, 228, o.c3)}
<path d="M196 112 C172 92 128 104 128 150 C128 194 162 212 186 200 Q198 196 210 200 C236 212 268 190 266 148 C264 104 222 94 196 112Z" fill="url(#apple)"/>
<path d="M150 128 Q148 150 160 168" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".45"/>
<path d="M197 114 Q196 92 206 78" stroke="#5b3a1e" stroke-width="5" stroke-linecap="round" fill="none"/>
<path d="M204 92 Q226 66 252 76 Q234 104 204 92Z" fill="url(#leaf)"/>
<path d="M206 91 Q226 80 246 78" stroke="#166534" stroke-width="1.2" fill="none"/>
<g transform="translate(14 -10) rotate(-7 200 372)">
<path d="M80 366 L300 366 L300 382 L80 382Z" fill="url(#pen)"/>
<path d="M80 371 L300 371" stroke="#eab308" stroke-width="1"/><path d="M80 377 L300 377" stroke="#a16207" stroke-width="1" opacity=".5"/>
<path d="M300 366 L332 374 L300 382Z" fill="#f2c99b"/><path d="M322 371.5 L332 374 L322 376.5Z" fill="#333333"/>
<rect x="66" y="365" width="16" height="18" fill="#c0c4cc"/><rect x="70" y="365" width="2" height="18" fill="#8b9099"/><rect x="76" y="365" width="2" height="18" fill="#8b9099"/>
<path d="M66 365 L56 365 Q48 365 48 374 Q48 383 56 383 L66 383Z" fill="#f9a8b8"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ guitar */
  guitar: {
    vb: [400, 400],
    defaults: { body: "#d97706" },
    draw: (o) => {
      const b = o.body;
      const outline = "M0 -110 C45 -110 76 -92 76 -46 C76 -14 58 0 58 16 C58 36 102 52 102 102 C102 162 58 192 0 192 C-58 192 -102 162 -102 102 C-102 52 -58 36 -58 16 C-58 0 -76 -14 -76 -46 C-76 -92 -45 -110 0 -110Z";
      const frets = range(14).map((i) => { const y = -300 + (1 - Math.pow(0.94, i)) * 330; return `<rect x="-15" y="${f1(y)}" width="30" height="2.2" fill="#d1d5db"/>`; }).join("");
      const dots = [3, 5, 7, 9].map((i) => { const y = -300 + (1 - Math.pow(0.94, i - 0.5)) * 330; return `<circle cx="0" cy="${f1(y)}" r="3.2" fill="#f5f0e6"/>`; }).join("");
      const strings = range(6).map((i) => `<path d="M${f1(-10 + i * 4)} 106 L${f1(-8 + i * 3.2)} -300" stroke="#f3f4f6" stroke-width="${f1(1.6 - i * 0.15)}" opacity=".9"/>`).join("");
      const pegs = range(3).map((i) => `<rect x="-36" y="${-356 + i * 18}" width="14" height="8" rx="3" fill="#d1d5db"/><rect x="22" y="${-356 + i * 18}" width="14" height="8" rx="3" fill="#d1d5db"/><circle cx="-9" cy="${-352 + i * 18}" r="3" fill="#9ca3af"/><circle cx="9" cy="${-352 + i * 18}" r="3" fill="#9ca3af"/>`).join("");
      return `<defs>
${rg("top", 0.42, 0.4, 0.75, [[0, shade(b, 0.55)], [0.5, shade(b, 0.15)], [0.85, b], [1, shade(b, -0.4)]])}
${lg("neck", 0, 0, 1, 0, [[0, "#4a2c18"], [0.5, "#6b3f22"], [1, "#3a2213"]])}
${lg("fb", 0, 0, 1, 0, [[0, "#1c120c"], [0.5, "#33211a"], [1, "#160e09"]])}
</defs>
${shadow(150, 370, 110, 12)}
<g transform="translate(204 190) rotate(24) scale(.68) translate(0 92)">
<path d="${outline}" fill="${shade(b, -0.55)}" transform="translate(9 6)"/>
<path d="${outline}" fill="url(#top)"/>
<path d="${outline}" fill="none" stroke="#f5ead6" stroke-width="5"/>
<path d="${outline}" fill="none" stroke="${shade(b, -0.5)}" stroke-width="1.5" transform="scale(.97)"/>
<path d="M26 -56 Q70 -40 62 6 Q50 30 26 22 Q38 -10 26 -56Z" fill="${shade(b, -0.6)}" opacity=".85"/>
<circle cx="0" cy="-20" r="40" fill="none" stroke="${shade(b, -0.45)}" stroke-width="5"/>
<circle cx="0" cy="-20" r="34" fill="none" stroke="#f5ead6" stroke-width="2"/>
<circle cx="0" cy="-20" r="31" fill="#120a05"/>
<rect x="-46" y="96" width="92" height="20" rx="8" fill="#2b1a10"/>
<rect x="-30" y="100" width="60" height="4" rx="2" fill="#f5f0e6"/>
${range(6).map((i) => `<circle cx="${-15 + i * 6}" cy="110" r="1.8" fill="#f5f0e6"/>`).join("")}
<path d="M-15 -60 L15 -60 L15 -300 L-15 -300Z" fill="url(#fb)"/>
<path d="M-17 -300 L17 -300 L14 -110 L-14 -110Z" fill="url(#neck)" opacity="0"/>
${frets}${dots}
<rect x="-16" y="-304" width="32" height="5" fill="#f5f0e6"/>
<path d="M-16 -304 L-30 -372 Q0 -384 30 -372 L16 -304Z" fill="url(#neck)"/>
<path d="M-12 -312 L-22 -366 Q0 -374 22 -366 L12 -312Z" fill="#1c120c"/>
${pegs}
${strings}
<path d="M-60 40 Q-80 90 -60 150" stroke="#ffffff" stroke-width="10" fill="none" opacity=".25" stroke-linecap="round"/>
</g>`;
    },
  },

  /* ------------------------------------------------------------ buildings */
  buildings: {
    vb: [400, 400],
    defaults: { glass: "#93c5fd", frame: "#e2e8f0" },
    draw: (o) => {
      const gl = o.glass, fr = o.frame;
      const tower = (x0: number, x1: number, top: number, base: number, d: number, id: string) => {
        const floors = Math.floor((base - top - 10) / 22);
        let s = `${poly([[x1, top], [x1 + d, top - d * 0.45], [x1 + d, base - d * 0.45], [x1, base]], `url(#${id}s)`)}`;
        s += poly([[x0, top], [x0 + d, top - d * 0.45], [x1 + d, top - d * 0.45], [x1, top]], shade(fr, -0.05));
        s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${base - top}" fill="url(#${id}f)"/>`;
        const cols = Math.round((x1 - x0) / 22);
        for (let k = 1; k < cols; k++) s += `<rect x="${f1(x0 + (k * (x1 - x0)) / cols - 1)}" y="${top}" width="2" height="${base - top}" fill="${shade(fr, -0.1)}" opacity=".8"/>`;
        for (let i = 0; i <= floors; i++) {
          const y = top + 8 + i * 22;
          s += `<rect x="${x0 - 4}" y="${y}" width="${x1 - x0 + 8}" height="5" fill="${fr}"/><rect x="${x0 - 4}" y="${y + 5}" width="${x1 - x0 + 8}" height="2" fill="${shade(fr, -0.35)}"/>`;
          s += `<rect x="${x0 - 4}" y="${y - 8}" width="${x1 - x0 + 8}" height="8" fill="${shade(gl, 0.6)}" opacity=".35"/>`;
          s += `<path d="M${x1} ${y + 2} L${x1 + d} ${y + 2 - d * 0.45}" stroke="${shade(fr, -0.25)}" stroke-width="3"/>`;
        }
        s += `<rect x="${x0 - 4}" y="${top - 6}" width="${x1 - x0 + 8}" height="7" fill="${shade(fr, 0.2)}"/>`;
        s += poly([[x0, top], [x0 + (x1 - x0) * 0.5, top], [x0, top + (x1 - x0) * 1.1]], "#ffffff", 'opacity=".18"');
        return s;
      };
      const tree = (x: number, y: number, r: number) => `<rect x="${x - 3}" y="${y}" width="6" height="${r * 0.9}" fill="#6b4423"/><circle cx="${x}" cy="${y - r * 0.2}" r="${r}" fill="url(#tr)"/><circle cx="${x - r * 0.6}" cy="${y + r * 0.2}" r="${r * 0.7}" fill="url(#tr)"/><circle cx="${x + r * 0.6}" cy="${y + r * 0.25}" r="${r * 0.65}" fill="url(#tr)"/>`;
      const grads = (id: string, k: number) => `${lg(id + "f", 0, 0, 1, 1, [[0, shade(gl, 0.35 + k)], [0.55, gl], [1, shade(gl, -0.25)]])}${lg(id + "s", 0, 0, 1, 0, [[0, shade(gl, -0.35)], [1, shade(gl, -0.5)]])}`;
      return `<defs>
${grads("a", 0)}${grads("b", 0.1)}${grads("c", -0.05)}
${rg("tr", 0.4, 0.35, 0.7, [[0, "#86efac"], [0.6, "#22a355"], [1, "#166534"]])}
</defs>
${shadow(200, 366, 190, 18, 0.25)}
${tower(150, 250, 30, 356, 26, "b")}
${tower(46, 136, 118, 360, 22, "a")}
${tower(268, 344, 160, 362, 22, "c")}
<ellipse cx="200" cy="362" rx="186" ry="16" fill="#4ade80" opacity=".35"/>
${tree(60, 344, 22)}${tree(118, 352, 18)}${tree(196, 350, 26)}${tree(258, 354, 18)}${tree(330, 346, 24)}`;
    },
  },

  /* ------------------------------------------------------------ dog */
  dog: {
    vb: [400, 400],
    defaults: { fur: "#e0a458" },
    draw: (o) => {
      const f = o.fur, d = shade(f, -0.25), dd = shade(f, -0.42), l = shade(f, 0.35), ll = shade(f, 0.55);
      return `<defs>
${lg("body", 0, 0, 1, 0, [[0, shade(f, 0.15)], [0.6, f], [1, d]])}
${rg("head", 0.45, 0.4, 0.7, [[0, l], [0.6, f], [1, d]])}
${lg("ear", 0, 0, 0, 1, [[0, d], [1, dd]])}
${lg("chest", 0, 0, 0, 1, [[0, ll], [1, l]])}
${lg("leg", 0, 0, 1, 0, [[0, d], [0.5, l], [1, f]])}
</defs>
${shadow(205, 368, 150, 16)}
<path d="M290 330 C340 330 372 300 366 250 C362 230 352 238 350 254 C346 290 320 308 286 312Z" fill="${d}"/>
<path d="M352 246 C364 262 366 284 356 300" stroke="${l}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>
<path d="M146 150 C122 214 116 292 126 362 L298 364 C334 350 338 290 300 246 C280 214 256 180 244 150Z" fill="url(#body)"/>
<ellipse cx="272" cy="308" rx="62" ry="56" fill="${f}"/>
<path d="M230 272 Q264 248 308 268" stroke="${l}" stroke-width="6" fill="none" opacity=".5" stroke-linecap="round"/>
<ellipse cx="298" cy="358" rx="36" ry="12" fill="${d}"/>
<path d="M150 172 C132 222 138 272 164 298 C186 312 214 308 234 290 C250 256 248 212 236 170Z" fill="url(#chest)"/>
<path d="M164 296 q8 10 16 0 q8 10 16 0 q8 10 16 0 q8 10 18 -4" stroke="${ll}" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M168 226 q6 8 12 0 M200 236 q6 8 12 0 M184 260 q6 8 12 0" stroke="${f}" stroke-width="2.5" fill="none" opacity=".5" stroke-linecap="round"/>
<path d="M150 270 Q148 330 150 352 L186 352 Q188 320 186 270Z" fill="url(#leg)"/>
<path d="M202 270 Q200 320 202 352 L238 352 Q240 330 238 270Z" fill="url(#leg)"/>
<ellipse cx="168" cy="356" rx="24" ry="12" fill="${l}"/><ellipse cx="220" cy="356" rx="24" ry="12" fill="${l}"/>
<path d="M160 352 L160 364 M168 350 L168 366 M176 352 L176 364 M212 352 L212 364 M220 350 L220 366 M228 352 L228 364" stroke="${d}" stroke-width="1.8" stroke-linecap="round"/>
<path d="M142 84 C114 90 104 128 110 162 C114 186 134 194 148 182 C154 150 156 114 150 90Z" fill="url(#ear)"/>
<path d="M248 84 C276 90 286 128 280 162 C276 186 256 194 242 182 C236 150 234 114 240 90Z" fill="url(#ear)"/>
<path d="M116 128 Q114 150 124 170 M274 128 Q276 150 266 170" stroke="${dd}" stroke-width="2" fill="none" opacity=".5"/>
<ellipse cx="195" cy="108" rx="58" ry="54" fill="url(#head)"/>
<path d="M156 70 Q195 52 234 70" stroke="${l}" stroke-width="8" fill="none" opacity=".4" stroke-linecap="round"/>
<path d="M195 74 L195 104" stroke="${d}" stroke-width="3" opacity=".25" stroke-linecap="round"/>
<path d="M160 148 Q158 118 195 116 Q232 118 230 148 Q228 176 195 178 Q162 176 160 148Z" fill="${l}"/>
<path d="M174 162 Q195 184 216 162 Q214 186 195 188 Q176 186 174 162Z" fill="#3b1d1a"/>
<path d="M183 172 Q181 210 195 214 Q209 210 207 172Z" fill="#f472b6"/>
<path d="M195 178 L195 206" stroke="#db2777" stroke-width="2" stroke-linecap="round"/>
<path d="M176 158 Q186 166 195 158 Q204 166 214 158" stroke="#3b1d1a" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M195 146 L195 158" stroke="#3b1d1a" stroke-width="3"/>
<path d="M180 132 Q195 124 210 132 Q210 146 195 150 Q180 146 180 132Z" fill="#1f1414"/>
<ellipse cx="189" cy="132" rx="5" ry="2.5" fill="#ffffff" opacity=".5"/>
<ellipse cx="170" cy="102" rx="8.5" ry="9" fill="#1f1414"/><ellipse cx="220" cy="102" rx="8.5" ry="9" fill="#1f1414"/>
<circle cx="173" cy="99" r="2.8" fill="#ffffff"/><circle cx="223" cy="99" r="2.8" fill="#ffffff"/>
<path d="M158 88 Q170 82 180 88" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M210 88 Q220 82 232 88" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    },
  },
};
