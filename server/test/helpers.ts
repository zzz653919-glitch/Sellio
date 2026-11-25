import "./env.js";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";

const { createApp } = await import("../src/app.js");
export const { outbox } = await import("../src/services/email.js");

const server = createApp().listen(0);
export const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
export function closeServer() {
  server.close();
}

export class Client {
  cookie = "";
  async req(method: string, url: string, body?: unknown, opts: { form?: FormData; noClientHeader?: boolean; raw?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (!opts.noClientHeader) headers["x-pricepro-client"] = "web";
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(";");
      if (pair.startsWith("pp_session=")) this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const type = res.headers.get("content-type") ?? "";
    const data = opts.raw ? await res.arrayBuffer() : type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data: data as any, headers: res.headers };
  }
  get = (u: string) => this.req("GET", u);
  post = (u: string, b?: unknown) => this.req("POST", u, b ?? {});
  patch = (u: string, b: unknown) => this.req("PATCH", u, b);
  del = (u: string, b?: unknown) => this.req("DELETE", u, b);
}

let counter = 0;
/** Sign in with the two-step flow: password, then the emailed code (returned as devCode without SMTP). */
export async function signIn(c: Client, email: string, password: string) {
  const r = await c.post("/api/auth/login", { email, password });
  if (r.status !== 200) return r;
  return c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode });
}

export async function newUser() {
  const c = new Client();
  const email = `user${++counter}-${Date.now()}@example.com`;
  const r = await c.post("/api/auth/signup", { firstName: "Test", lastName: "User", email, password: "secret123" });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.data)}`);
  const v = await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode });
  if (v.status !== 200) throw new Error(`code verification failed: ${JSON.stringify(v.data)}`);
  return { client: c, email, user: v.data.user };
}

/** Build a real PNG of the given size (solid colour). */
export function makePng(width: number, height: number, rgb = [30, 90, 220]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function fileForm(field: string, data: Buffer, name: string, type: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  f.append(field, new Blob([new Uint8Array(data)], { type }), name);
  return f;
}
