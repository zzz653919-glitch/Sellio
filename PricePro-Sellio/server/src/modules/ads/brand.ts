import { get } from "../../db/index.js";
import { safeJson } from "../../lib/util.js";

type BrandRow = { business_name: string | null; slogan: string | null; logo_upload_id: string | null; primary_color: string | null; secondary_color: string | null; accent_color: string | null; heading_font: string | null; body_font: string | null; tone: string | null; styles_json: string; updated_at: string };

export async function getBrand(userId: string) {
  const r = await get<BrandRow>("SELECT * FROM brand_profiles WHERE user_id = ?", userId);
  if (!r) return null;
  return {
    businessName: r.business_name, slogan: r.slogan,
    logoUploadId: r.logo_upload_id, logoUrl: r.logo_upload_id ? `/api/files/${r.logo_upload_id}` : null,
    primaryColor: r.primary_color, secondaryColor: r.secondary_color, accentColor: r.accent_color,
    headingFont: r.heading_font, bodyFont: r.body_font, tone: r.tone, styles: safeJson<string[]>(r.styles_json, []), updatedAt: r.updated_at,
  };
}

