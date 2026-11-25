import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { aggregate, detectGranularity, runForecast, type Point } from "../src/modules/forecast/engine.js";
import { closeServer } from "./helpers.js";

after(closeServer);

function series(days: number, f: (i: number) => number): Point[] {
  const start = Date.UTC(2024, 0, 1);
  return Array.from({ length: days }, (_, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), units: f(i) }));
}

test("granularity detection: daily, weekly and monthly series", () => {
  assert.equal(detectGranularity(series(10, () => 1)), "day");
  assert.equal(detectGranularity([{ date: "2026-01-05", units: 1 }, { date: "2026-01-12", units: 2 }, { date: "2026-01-26", units: 3 }]), "week");
  assert.equal(detectGranularity([{ date: "2026-01-01", units: 1 }, { date: "2026-02-01", units: 2 }]), "month");
});

test("aggregation drops partial buckets", () => {
  const weekly = aggregate(series(30, () => 1), "week"); // 2024-01-01 is a Monday
  assert.equal(weekly.length, 4);
  assert.ok(weekly.every((w) => w.units === 7));
});

test("monthly data: the last month counts, forecasts are monthly, and a 7-day forecast is refused", () => {
  const months: Point[] = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10),
    units: 100 + i * 5 + (i % 12 === 11 ? 60 : 0),
  }));
  assert.equal(aggregate(months, "month", "month").length, 30);
  const r = runForecast(months, 90, "month");
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.granularity, "month");
  assert.equal(r.forecast.length, 3);
  assert.equal(r.forecast[0].date, "2025-07-01");
  assert.equal(r.trend, "growing");
  assert.equal(runForecast(months, 7, "month").status, "insufficient");
  assert.equal(runForecast(months.slice(0, 4), 90, "month").status, "insufficient");
});

test("engine refuses to forecast without enough history", () => {
  const r = runForecast(series(20, () => 5), 30);
  assert.equal(r.status, "insufficient");
});

test("engine follows a clear linear trend and reports its accuracy", () => {
  const data = series(120, (i) => 50 + i);
  const r = runForecast(data, 7);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.forecast.length, 7);
  const expectedFirst = 50 + 120;
  assert.ok(Math.abs(r.forecast[0].units - expectedFirst) < expectedFirst * 0.05, `first forecast ${r.forecast[0].units}`);
  assert.equal(r.trend, "growing");
  assert.ok(r.model.backtest.smapePct < 5);
  assert.ok(r.forecast.every((f) => f.lower <= f.units && f.units <= f.upper));
});

test("weekly seasonality is detected and modelled", () => {
  const data = series(140, (i) => (i % 7 >= 5 ? 100 : 40));
  const r = runForecast(data, 7);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.seasonality.detected, true);
  const weekendIdx = r.forecast.findIndex((f) => [0, 6].includes(new Date(f.date).getUTCDay()));
  const weekdayIdx = r.forecast.findIndex((f) => ![0, 6].includes(new Date(f.date).getUTCDay()));
  assert.ok(r.forecast[weekendIdx].units > r.forecast[weekdayIdx].units * 1.5);
});
