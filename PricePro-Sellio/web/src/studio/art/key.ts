import type { ArtOpts } from "./types";

/** "art:key|opt=value" source string for templates (kept apart so templates do not pull in the drawings). */
export const art = (key: string, opts: ArtOpts = {}) => ["art:" + key, ...Object.entries(opts).map(([k, v]) => `${k}=${v}`)].join("|");
