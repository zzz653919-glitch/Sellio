import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { all, get, run } from "../db/index.js";
import { notFound } from "../lib/errors.js";
import { newId, nowIso } from "../lib/util.js";
import type { ImageInfo } from "../lib/image.js";

/**
 * File storage. The local-disk driver keeps files outside the web root; files are
 * only served through authenticated, ownership-checked routes. Swap this module
 * for an object-storage driver (S3, GCS, Firebase Storage) without touching callers.
 */
const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

function resolveKey(key: string) {
  if (!/^[a-z]+\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key)) throw new Error("Invalid storage key");
  return path.join(config.STORAGE_DIR, key);
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

export function saveImage(
  userId: string,
  kind: UploadRow["kind"],
  data: Buffer,
  info: ImageInfo,
  originalName?: string,
): UploadRow {
  const id = newId();
  const key = `${kind}/${id}${EXT[info.mime]}`;
  const file = resolveKey(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o600 });
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
  run(
    `INSERT INTO uploads (id,user_id,storage_key,kind,original_name,mime,size,width,height,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    row.id, row.user_id, row.storage_key, row.kind, row.original_name, row.mime, row.size,
    row.width, row.height, row.created_at,
  );
  return row;
}

/** Ownership-checked lookup. Throws 404 for missing *or foreign* files (no existence leak). */
export function getOwnedUpload(userId: string, uploadId: string): UploadRow {
  const row = get<UploadRow>("SELECT * FROM uploads WHERE id = ? AND user_id = ?", uploadId, userId);
  if (!row) throw notFound("File not found");
  return row;
}

export function readUpload(row: UploadRow): Buffer {
  return fs.readFileSync(resolveKey(row.storage_key));
}

export function filePath(row: UploadRow) {
  return resolveKey(row.storage_key);
}

export function deleteUpload(userId: string, uploadId: string) {
  const row = getOwnedUpload(userId, uploadId);
  run("DELETE FROM uploads WHERE id = ? AND user_id = ?", uploadId, userId);
  fs.rmSync(resolveKey(row.storage_key), { force: true });
}

export function deleteAllFilesOf(userId: string) {
  const rows = all<UploadRow>("SELECT * FROM uploads WHERE user_id = ?", userId);
  for (const r of rows) fs.rmSync(resolveKey(r.storage_key), { force: true });
}
