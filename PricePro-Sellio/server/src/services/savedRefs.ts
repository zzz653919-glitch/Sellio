import { all } from "../db/index.js";

export type SavedRefs = { project: Map<string, string>; favorite: Map<string, string> };

/** Which items of one type are saved to My Projects / Favorites — two queries for a whole list. */
export async function savedRefs(userId: string, type: "advertisement" | "forecast"): Promise<SavedRefs> {
  const [projects, favorites] = await Promise.all([
    all<{ id: string; ref_id: string }>("SELECT id, ref_id FROM projects WHERE user_id = ? AND type = ?", userId, type),
    all<{ id: string; ref_id: string }>("SELECT id, ref_id FROM favorites WHERE user_id = ? AND item_type = ?", userId, type),
  ]);
  return { project: new Map(projects.map((p) => [p.ref_id, p.id])), favorite: new Map(favorites.map((f) => [f.ref_id, f.id])) };
}
