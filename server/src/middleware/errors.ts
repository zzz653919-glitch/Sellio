import { MAX_UPLOAD_MB } from "../lib/image.js";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../lib/errors.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? `The file is too large. Maximum size is ${MAX_UPLOAD_MB} MB.` : `Upload error: ${err.message}`;
    res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
    return;
  }
  if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Malformed JSON body" } });
    return;
  }
  if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.too.large") {
    res.status(413).json({ error: { code: "TOO_LARGE", message: "Request body is too large" } });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
}
