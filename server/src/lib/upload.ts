import multer from "multer";
import { MAX_UPLOAD_BYTES } from "./image.js";

/** Memory upload limited to a single image; contents are validated by bytes afterwards. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20 },
});

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 20 },
});
