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

test("FREE: 2 requests per day shared by AI ads and forecasts; renews every day at 00:00; no carry-over", async () => {
  const { user } = await newUser();
  await setTz(user.id, "Asia/Tashkent");
  setClockForTests(() => Date.parse("2026-04-10T10:00:00Z"));
  await use(user.id, "generation");
  let s = await requestStatus(user.id);
  assert.deepEqual([s.plan, s.period, s.limit, s.used, s.remaining], ["free", "day", 2, 1, 1]);
  assert.equal(s.resetsAt, "2026-04-10T19:00:00.000Z", "00:00 on 11 April in Tashkent");
  await use(user.id, "forecast");
  await limited(reserveRequest(user.id, "generation", "op-x"));
  await limited(reserveRequest(user.id, "forecast", "op-y"));
  // The next day starts at 00:00 local time with a fresh allowance of 2 (nothing carried over).
  setClockForTests(() => Date.parse("2026-04-10T18:59:00Z"));
  await limited(reserveRequest(user.id, "forecast", "op-z"));
  setClockForTests(() => Date.parse("2026-04-10T19:00:00Z"));
  s = await requestStatus(user.id);
  assert.deepEqual([s.used, s.remaining, s.limit], [0, 2, 2]);
  await use(user.id, "generation");
  await use(user.id, "generation");
  await limited(reserveRequest(user.id, "generation", "op-3rd-image"));
  assert.equal((await usage(user.id)).metrics.requests.used, 2);
});

test("PRO: 10 requests per day, reset at 00:00", async () => {
  const { user } = await newUser();
  await setPlan(user.id, "pro");
  await setTz(user.id, "Asia/Tashkent");
  setClockForTests(() => Date.parse("2026-05-05T12:00:00Z"));
  for (let i = 0; i < 10; i++) await use(user.id, i % 2 ? "generation" : "forecast");
  await limited(reserveRequest(user.id, "forecast", "pro-11"));
  const s = await requestStatus(user.id);
  assert.deepEqual([s.period, s.limit, s.used, s.remaining, s.resetsAt], ["day", 10, 10, 0, "2026-05-05T19:00:00.000Z"]);
  setClockForTests(() => Date.parse("2026-05-05T19:00:01Z"));
  assert.equal((await requestStatus(user.id)).used, 0);
  await use(user.id);
});

test("MAX: 20 requests per day", async () => {
  const { user } = await newUser();
  await setPlan(user.id, "max");
  setClockForTests(() => Date.parse("2026-05-06T09:00:00Z"));
  for (let i = 0; i < 20; i++) await use(user.id);
  await limited(reserveRequest(user.id, "generation", "max-21"));
  assert.deepEqual(Object.values(await requestStatus(user.id)).slice(2, 6), ["day", 20, 20, 0]);
  setClockForTests(() => Date.parse("2026-05-07T09:00:00Z"));
  await use(user.id);
});

test("concurrent requests never go over the limit", async () => {
  const { user } = await newUser();
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserveRequest(user.id, "forecast", `race-${i}`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(results.filter((r) => r.status === "rejected").length, 10);
  assert.equal((await requestStatus(user.id)).used, 2);
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
  assert.equal((await requestStatus(user.id)).used, 2, "a running operation holds its request");
  await releaseRequest("forecast", "fail-1");
  assert.equal((await requestStatus(user.id)).used, 1, "failure gives it back");
  // Releasing after success changes nothing.
  await releaseRequest("generation", "dup-1");
  assert.equal((await requestStatus(user.id)).used, 1);

  // A reservation that was never finished (crashed job) stops counting after the TTL.
  await reserveRequest(user.id, "forecast", "crash-1");
  assert.equal((await requestStatus(user.id)).used, 2);
  const later = Date.now() + RESERVATION_TTL_MS + 60_000;
  setClockForTests(() => later);
  assert.equal((await requestStatus(user.id)).used, 1);
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
  assert.equal(dash.metrics.requests.remaining, 2);
  assert.equal(dash.metrics.requests.limit, 2);
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
