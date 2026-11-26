import "./env.js";
import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { get, run } from "../src/db/index.js";
import { setImageProviderForTests } from "../src/modules/studio/provider.js";
import { usage } from "../src/services/plans.js";
import {
  consumeRequest, periodBounds, releaseRequest, requestStatus, reserveRequest, RESERVATION_TTL_MS, setClockForTests,
} from "../src/services/quota.js";
import { closeServer, fileForm, makePng, newUser } from "./helpers.js";

after(closeServer);
afterEach(() => setClockForTests(null));

const setPlan = (userId: string, plan: string) => run("UPDATE users SET plan = ? WHERE id = ?", plan, userId);
const setTz = (userId: string, tz: string) => run("UPDATE user_settings SET timezone = ? WHERE user_id = ?", tz, userId);
let seq = 0;
/** One successful operation: reserve, then count it. */
async function use(userId: string, service: "generation" | "forecast" = "forecast") {
  const ref = `op-${++seq}`;
  await reserveRequest(userId, service, ref);
  await consumeRequest(service, ref);
  return ref;
}
const limited = (p: Promise<unknown>) => assert.rejects(p, (e: { code?: string }) => e.code === "LIMIT_REACHED");

test("periods start at 00:00 in the user's time zone", () => {
  const at = Date.parse("2026-03-10T03:00:00Z");
  // Tashkent (UTC+5): it is already 10 March, 08:00.
  assert.equal(new Date(periodBounds("day", "Asia/Tashkent", at).start).toISOString(), "2026-03-09T19:00:00.000Z");
  assert.equal(new Date(periodBounds("day", "Asia/Tashkent", at).end).toISOString(), "2026-03-10T19:00:00.000Z");
  // New York (UTC-4 after the March DST change): still 9 March, 23:00.
  assert.equal(new Date(periodBounds("day", "America/New_York", at).start).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(new Date(periodBounds("month", "Asia/Tashkent", at).start).toISOString(), "2026-02-28T19:00:00.000Z");
  assert.equal(new Date(periodBounds("month", "Asia/Tashkent", at).end).toISOString(), "2026-03-31T19:00:00.000Z");
  assert.equal(new Date(periodBounds("month", "UTC", Date.parse("2026-12-15T12:00:00Z")).end).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("FREE: 5 AI ad images and, separately, 5 forecasts in any 5 hours; each use frees up 5 hours later", async () => {
  const { user } = await newUser();
  await setTz(user.id, "Asia/Tashkent");
  const t0 = Date.parse("2026-04-10T10:00:00Z");
  setClockForTests(() => t0);
  await use(user.id, "generation");
  let s = await requestStatus(user.id);
  assert.deepEqual([s.plan, s.period, s.windowHours, s.limit, s.used, s.remaining], ["free", "hours", 5, 5, 1, 4]);
  assert.equal(s.resetsAt, "2026-04-10T15:00:00.000Z", "the first image is free again 5 hours later");
  assert.deepEqual([s.forecasts.limit, s.forecasts.used], [5, 0], "forecasts are not taken from the image allowance");
  // One more image an hour later, then three more.
  setClockForTests(() => t0 + 3_600_000);
  for (let i = 0; i < 4; i++) await use(user.id, "generation");
  await limited(reserveRequest(user.id, "generation", "op-x"));
  for (let i = 0; i < 5; i++) await use(user.id, "forecast");
  await limited(reserveRequest(user.id, "forecast", "op-y"));
  // 4 h 59 min after the first image: still full. At 5 h the first one frees up (only one).
  setClockForTests(() => t0 + 5 * 3_600_000 - 60_000);
  await limited(reserveRequest(user.id, "generation", "op-z"));
  setClockForTests(() => t0 + 5 * 3_600_000 + 1000);
  s = await requestStatus(user.id);
  assert.deepEqual([s.used, s.remaining], [4, 1]);
  await use(user.id, "generation");
  await limited(reserveRequest(user.id, "generation", "op-w"));
  // 6 hours after the burst everything is free again.
  setClockForTests(() => t0 + 6 * 3_600_000 + 1000);
  s = await requestStatus(user.id);
  assert.deepEqual([s.used, s.forecasts.used], [1, 0]);
  assert.equal((await usage(user.id)).metrics.forecasts.windowHours, 5);
});

test("PRO: 10 images and 10 forecasts in any 3 hours", async () => {
  const { user } = await newUser();
  await setPlan(user.id, "pro");
  const t0 = Date.parse("2026-05-05T12:00:00Z");
  setClockForTests(() => t0);
  for (let i = 0; i < 10; i++) await use(user.id, "generation");
  await limited(reserveRequest(user.id, "generation", "pro-11"));
  for (let i = 0; i < 10; i++) await use(user.id, "forecast");
  await limited(reserveRequest(user.id, "forecast", "pro-fc-11"));
  const s = await requestStatus(user.id);
  assert.deepEqual([s.period, s.windowHours, s.limit, s.used, s.remaining, s.resetsAt, s.forecasts.used], ["hours", 3, 10, 10, 0, "2026-05-05T15:00:00.000Z", 10]);
  setClockForTests(() => t0 + 3 * 3_600_000 + 1000);
  assert.equal((await requestStatus(user.id)).used, 0);
  await use(user.id, "generation");
});

test("MAX: 20 images and 20 forecasts in any hour", async () => {
  const { user } = await newUser();
  await setPlan(user.id, "max");
  const t0 = Date.parse("2026-05-06T09:00:00Z");
  setClockForTests(() => t0);
  for (let i = 0; i < 20; i++) await use(user.id, "generation");
  await limited(reserveRequest(user.id, "generation", "max-21"));
  for (let i = 0; i < 20; i++) await use(user.id, "forecast");
  await limited(reserveRequest(user.id, "forecast", "max-fc-21"));
  const s = await requestStatus(user.id);
  assert.deepEqual([s.period, s.windowHours, s.limit, s.used, s.remaining, s.forecasts.used], ["hours", 1, 20, 20, 0, 20]);
  setClockForTests(() => t0 + 3_600_000 + 1000);
  await use(user.id, "generation");
});

test("concurrent requests never go over the limit", async () => {
  const { user } = await newUser();
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserveRequest(user.id, "forecast", `race-${i}`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(results.filter((r) => r.status === "rejected").length, 7);
  assert.equal((await requestStatus(user.id)).forecasts.used, 5);
});

test("the same operation is never counted twice; failed and abandoned operations give the request back", async () => {
  const { user } = await newUser();
  await reserveRequest(user.id, "generation", "dup-1");
  await reserveRequest(user.id, "generation", "dup-1");
  await consumeRequest("generation", "dup-1");
  await consumeRequest("generation", "dup-1");
  assert.equal((await get<{ n: number }>("SELECT COUNT(*) AS n FROM usage_events WHERE ref_id = 'dup-1'"))!.n, 1);
  assert.equal((await requestStatus(user.id)).used, 1);

  await reserveRequest(user.id, "forecast", "fail-1");
  assert.equal((await requestStatus(user.id)).forecasts.used, 1, "a running operation holds its request");
  await releaseRequest("forecast", "fail-1");
  assert.equal((await requestStatus(user.id)).forecasts.used, 0, "failure gives it back");
  // Releasing after success changes nothing.
  await releaseRequest("generation", "dup-1");
  assert.equal((await requestStatus(user.id)).used, 1);

  // A reservation that was never finished (crashed job) stops counting after the TTL.
  await reserveRequest(user.id, "forecast", "crash-1");
  assert.equal((await requestStatus(user.id)).forecasts.used, 1);
  const later = Date.now() + RESERVATION_TTL_MS + 60_000;
  setClockForTests(() => later);
  assert.equal((await requestStatus(user.id)).forecasts.used, 0);
});

test("API: failed AI generation is not counted; time zone setting; dashboard shows used / remaining / reset", async () => {
  const { client, user } = await newUser();
  const up = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", makePng(400, 400), "p.png", "image/png") });
  setImageProviderForTests({ name: "test", model: "m", edit: async () => { throw new Error("provider down"); } });
  const r = await client.post("/api/studio/generations", { uploadId: up.data.upload.id, productName: "Bottle", category: "Fashion & Apparel", style: "minimal_studio", background: "studio_white", settings: { size: "square", quality: "medium", lighting: "soft" } });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  for (let i = 0; i < 50; i++) {
    const g = (await client.get(`/api/studio/generations/${r.data.generation.id}`)).data.generation;
    if (g.status === "failed") break;
    await new Promise((res) => setTimeout(res, 20));
  }
  let dash = (await client.get("/api/dashboard")).data.usage;
  assert.equal(dash.metrics.requests.used, 0, "failed generation not counted");
  assert.equal(dash.metrics.requests.remaining, 5);
  assert.equal(dash.metrics.requests.limit, 5);
  assert.ok(dash.metrics.requests.resetsAt);

  assert.equal((await client.patch("/api/user/settings", { timezone: "Mars/Olympus" })).status, 400);
  const ok = await client.patch("/api/user/settings", { timezone: "America/New_York" });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.settings.timezone, "America/New_York");
  dash = (await client.get("/api/dashboard")).data.usage;
  assert.equal(dash.timezone, "America/New_York");
  assert.equal((await client.patch("/api/user/settings", { timezone: null })).data.settings.effectiveTimezone, "Asia/Tashkent");
  assert.ok(user.id);
});
