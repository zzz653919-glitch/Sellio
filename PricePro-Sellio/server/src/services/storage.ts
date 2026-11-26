import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Response as ExpressResponse } from "express";
import { config, features } from "../config.js";
import { all, get, run } from "../db/index.js";
import { notFound } from "../lib/errors.js";
import { newId, nowIso } from "../lib/util.js";
import type { ImageInfo } from "../lib/image.js";

/**
 * File storage with two drivers:
 *  - Vercel Blob (`BLOB_READ_WRITE_TOKEN`): for Vercel, where the filesystem is not persistent.
 *    Blobs are private by default and are only read by the server.
 *  - Local disk (`STORAGE_DIR`): local development and single servers.
 * Files are only ever served through authenticated, ownership-checked routes.
 */
const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

interface FileDriver {
  /** Store and return the key to keep in the database. */
  write(key: string, data: Buffer, mime: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  /** Send the file as the HTTP response body. */
  send(res: ExpressResponse, key: string, mime: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function localPath(key: string) {
  if (!/^[a-z]+\/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(key)) throw new Error("Invalid storage key");
  return path.join(config.STORAGE_DIR, key);
}

const localDriver: FileDriver = {
  async write(key, data) {
    if (process.env.VERCEL) {
      throw new Error("No Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID). On Vercel files must be stored in Vercel Blob (see README → Deploy to Vercel).");
    }
    const file = localPath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { mode: 0o600 });
    return key;
  },
  async read(key) {
    return fs.readFileSync(localPath(key));
  },
  async send(res, key, mime) {
    res.type(mime).sendFile(localPath(key));
  },
  async remove(key) {
    fs.rmSync(localPath(key), { force: true });
  },
};

type BlobModule = Pick<typeof import("@vercel/blob"), "put" | "get" | "del">;
let blobOverride: BlobModule | null = null;
/** Tests replace the Vercel Blob SDK with an in-memory fake and switch the driver on. */
export function setBlobForTests(fake: BlobModule | null, token: string | null = "test-token") {
  blobOverride = fake;
  driver = fake ? blobDriver(token ?? undefined, "private") : null;
}

/** `token` is omitted for stores connected through Vercel OIDC (BLOB_STORE_ID); the SDK authenticates itself. */
function blobDriver(token: string | undefined, access: "private" | "public"): FileDriver {
  const auth = token ? { token } : {};
  const blob = async (): Promise<BlobModule> => blobOverride ?? import("@vercel/blob");
  const open = async (key: string) => {
    const r = await (await blob()).get(key, { access, ...auth });
    if (!r) throw notFound("File not found");
    return r;
  };
  return {
    async write(key, data, mime) {
      const r = await (await blob()).put(key, data, { access, ...auth, contentType: mime, addRandomSuffix: true });
      return access === "public" ? r.url : r.pathname;
    },
    async read(key) {
      const { stream } = await open(key);
      return Buffer.from(await new Response(stream).arrayBuffer());
    },
    async send(res, key, mime) {
      const { stream } = await open(key);
      res.type(mime);
      await new Promise<void>((resolve, reject) => {
        Readable.fromWeb(stream as import("node:stream/web").ReadableStream).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
      });
    },
    async remove(key) {
      await (await blob()).del(key, auth);
    },
  };
}

let driver: FileDriver | null = null;
function files(): FileDriver {
  driver ??= features.blobStorage ? blobDriver(config.BLOB_READ_WRITE_TOKEN, config.BLOB_ACCESS) : localDriver;
  return driver;
}

export type UploadRow = {
  id: string;
  user_id: string;
  storage_key: string;
  kind: "product" | "generated" | "avatar";
  original_name: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

export async function saveImage(
  userId: string,
  kind: UploadRow["kind"],
  data: Buffer,
  info: ImageInfo,
  originalName?: string,
): Promise<UploadRow> {
  const id = newId();
  const key = await files().write(`${kind}/${id}${EXT[info.mime]}`, data, info.mime);
  const row: UploadRow = {
    id,
    user_id: userId,
    storage_key: key,
    kind,
    original_name: originalName ? originalName.slice(0, 200) : null,
    mime: info.mime,
    size: data.length,
    width: info.width,
    height: info.height,
    created_at: nowIso(),
  };
  await run(
    `INSERT INTO uploads (id,user_id,storage_key,kind,original_name,mime,size,width,height,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    row.id, row.user_id, row.storage_key, row.kind, row.original_name, row.mime, row.size,
    row.width, row.height, row.created_at,
  );
  return row;
}

/** Ownership-checked lookup. Throws 404 for missing *or foreign* files (no existence leak). */
export async function getOwnedUpload(userId: string, uploadId: string): Promise<UploadRow> {
  const row = await get<UploadRow>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", uploadId, userId);
  if (!row) throw notFound("File not found");
  return row;
}

export async function readUpload(row: UploadRow): Promise<Buffer> {
  return files().read(row.storage_key);
}

/** Send an (already ownership-checked) file as the response. */
export async function sendUpload(res: ExpressResponse, row: UploadRow) {
  await files().send(res, row.storage_key, row.mime);
}

/**
 * Delete a file. Generations made from a deleted product image go with it, and references
 * to a deleted result image are cleared (done explicitly, not through foreign-key cascades).
 */
export async function deleteUpload(userId: string, uploadId: string) {
  const row = await getOwnedUpload(userId, uploadId);
  const dependent = await all<{ id: string; result_upload_id: string | null }>(
    "SELECT id, result_upload_id FROM generations WHERE user_id = ? AND upload_id = ?", userId, uploadId,
  );
  for (const g of dependent) {
    await run("DELETE FROM projects WHERE user_id = ? AND type = 'advertisement' AND ref_id = ?", userId, g.id);
    await run("DELETE FROM favorites WHERE user_id = ? AND item_type = 'advertisement' AND ref_id = ?", userId, g.id);
    await run("UPDATE generations SET retry_of = NULL WHERE retry_of = ?", g.id);
    await run("DELETE FROM generations WHERE id = ?", g.id);
    if (g.result_upload_id) await deleteUpload(userId, g.result_upload_id).catch(() => {});
  }
  await run("UPDATE generations SET result_upload_id = NULL WHERE user_id = ? AND result_upload_id = ?", userId, uploadId);
  await run("DELETE FROM uploads WHERE id = ? AND user_id = ?", uploadId, userId);
  await files().remove(row.storage_key).catch(() => {});
}

export async function deleteAllFilesOf(userId: string) {
  const rows = await all<UploadRow>("SELECT * FROM uploads WHERE user_id = ?", userId);
  for (const r of rows) await files().remove(r.storage_key).catch(() => {});
}

/** Private file outside the uploads table (payment receipts). Returns the storage key. */
export async function storePrivateFile(key: string, data: Buffer, mime: string): Promise<string> {
  return files().write(key, data, mime);
}

/** Streams a private file (the caller has already checked who may see it). */
export async function sendPrivateFile(res: ExpressResponse, key: string, mime: string) {
  await files().send(res, key, mime);
}

export async function removePrivateFile(key: string) {
  await files().remove(key).catch(() => {});
}
