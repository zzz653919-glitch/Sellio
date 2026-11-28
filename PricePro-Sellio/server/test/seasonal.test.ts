import "./env.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseSeasonality, seasonOrder, stl, toMonthly } from "../src/modules/forecast/seasonal.js";
import type { Point } from "../src/modules/forecast/engine.js";

/** Five years of weekly search interest ending before `end`, from a per-month shape. */
function weekly(end: Date, shape: (month: number, yearIndex: number) => number, noise = 0): Point[] {
  const out: Point[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * noise;
  const start = new Date(Date.UTC(end.getUTCFullYear() - 5, end.getUTCMonth(), 1));
  for (let t = start.getTime(); t < end.getTime(); t += 7 * 86_400_000) {
    const d = new Date(t);
    const yi = d.getUTCFullYear() - start.getUTCFullYear();
    out.push({ date: d.toISOString().slice(0, 10), units: Math.max(0, shape(d.getUTCMonth() + 1, yi) + rnd()) });
  }
  return out;
}

const today = new Date(Date.UTC(2026, 10, 25)); // 25 Nov 2026

test("STL separates a clean seasonal pattern from the trend", () => {
  const y = Array.from({ length: 60 }, (_, i) => 50 + i * 0.5 + (i % 12 === 7 ? 30 : 0));
  const { seasonal, trend } = stl(y);
  const aug = seasonal[7], jan = seasonal[0];
  assert.ok(aug > 20 && Math.abs(jan) < 6, `aug ${aug}, jan ${jan}`);
  assert.ok(trend[59] > trend[0] + 20);
});

test("back-to-school products: peak in Aug-Sep, rise and fall dates, school event", () => {
  const school = (m: number, yi: number) => 30 + yi * 2 + (m === 8 ? 45 : m === 9 ? 35 : m === 7 ? 12 : 0);
  const a = analyseSeasonality(weekly(today, school, 4), today)!;
  assert.ok(a, "analysis exists");
  assert.equal(a.level, "strong");
  assert.deepEqual(a.peakMonths, [8, 9]);
  assert.ok(a.events.includes("school"));
  assert.equal(a.nextPeak!.date, "2027-08-01");
  assert.equal(a.nextRise!.date, "2027-07-01", "demand starts climbing in July");
  assert.equal(a.nextFall!.date, "2027-09-01");
  assert.ok(a.months.find((m) => m.month === 8)!.consistency >= 0.8);
  assert.equal(a.outlook.length, 12);
  assert.equal(a.outlook[0].date, "2026-11-01");
  const aug = a.outlook.find((o) => o.date === "2027-08-01")!.value;
  const jan = a.outlook.find((o) => o.date === "2027-01-01")!.value;
  assert.ok(aug > jan * 1.5, `forecast keeps the season (aug ${aug}, jan ${jan})`);
});

test("New Year products peak in December; growth and decline are detected", () => {
  const growing = analyseSeasonality(weekly(today, (m, yi) => 20 + yi * 8 + (m === 12 ? 40 : 0), 3), today)!;
  assert.ok(growing.peakMonths.includes(12));
  assert.ok(growing.events.includes("new_year"));
  assert.equal(growing.direction, "growing");
  assert.equal(growing.phase, "rising", "November is right before the December peak");
  const fading = analyseSeasonality(weekly(today, (m, yi) => 90 - (yi * 12 + m), 2), today)!;
  assert.equal(fading.direction, "declining");
  assert.equal(fading.level, "none");
  assert.equal(fading.nextPeak, null, "no season is claimed for a flat-seasonal series");
});

test("not enough history → no seasonal claims", () => {
  const short = weekly(today, () => 50).slice(-60); // ~14 months
  assert.equal(analyseSeasonality(short, today), null);
  assert.equal(toMonthly([{ date: "2026-01-05", units: 4 }, { date: "2026-01-12", units: 6 }, { date: "2026-01-19", units: 8 }]).length, 1);
});

test("season months are listed in season order across the new year", () => {
  assert.deepEqual(seasonOrder([1, 11, 12]), [11, 12, 1]);
  assert.deepEqual(seasonOrder([8, 9]), [8, 9]);
  assert.deepEqual(seasonOrder([12, 1, 2, 3]), [12, 1, 2, 3]);
});

test("an old model in long decline: bumps are not sold as growth (iPhone 11 case)", () => {
  // −35% a year, with launch (September) and holiday (December) bumps that scale with the level.
  const old = (m: number, yi: number) => {
    const level = 100 * Math.exp(-0.43 * (yi + (m - 1) / 12));
    return level * (m === 9 ? 1.3 : m === 12 ? 1.18 : 1);
  };
  const a = analyseSeasonality(weekly(today, old, 1), today)!;
  assert.equal(a.direction, "declining");
  assert.ok(a.yoyPct! < -25, `yoy ${a.yoyPct}`);
  assert.equal(a.ahead.realRise, false, "no real rise for a product that falls every year");
  assert.ok(a.ahead.high.vsLastYearPct! < -15, `the best month ahead is below last year (${a.ahead.high.vsLastYearPct})`);
  const lastDec = a.monthly.find((m) => m.month === "2025-12")!.value;
  const nextDec = a.outlook.find((o) => o.date === "2026-12-01")!.value;
  assert.ok(nextDec < lastDec * 0.85, `December forecast follows the decline (${nextDec} vs ${lastDec})`);
  assert.ok(a.ahead.yearPct! < -15);
  // Two seasons (September, December): in November the nearest one is December, and the climb is now.
  assert.ok(a.peakMonths.includes(12) && a.peakMonths.includes(9));
  assert.equal(a.nextPeak!.date, "2026-12-01");
  assert.ok(a.nextRise!.months <= a.nextPeak!.months, "the rise never comes after the peak it leads to");
});

test("a seasonal product with a stable level: the coming season is a real rise", () => {
  const coat = (m: number) => 25 + (m === 12 ? 60 : m === 1 ? 45 : m === 11 ? 30 : 0);
  const a = analyseSeasonality(weekly(new Date(Date.UTC(2026, 8, 25)), coat, 2), new Date(Date.UTC(2026, 8, 25)))!;
  assert.equal(a.direction, "stable");
  assert.equal(a.ahead.realRise, true);
  assert.ok(a.ahead.high.date === "2026-12-01", a.ahead.high.date);
  assert.ok(a.ahead.high.vsNowPct! > 100);
});
