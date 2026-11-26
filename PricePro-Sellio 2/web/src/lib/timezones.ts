/** Time zones offered for limit resets (the browser's own zone is added when it is not listed). */
export const TIMEZONES = [
  "Asia/Tashkent", "Asia/Samarkand", "Asia/Almaty", "Asia/Bishkek", "Asia/Dushanbe", "Asia/Ashgabat", "Asia/Baku", "Asia/Tbilisi", "Asia/Yerevan",
  "Europe/Moscow", "Europe/Istanbul", "Europe/Kyiv", "Europe/Minsk", "Europe/Berlin", "Europe/London", "Asia/Dubai", "Asia/Riyadh", "Asia/Karachi",
  "Asia/Kolkata", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC",
];

export function timezoneOptions(current?: string | null) {
  let browser: string | null = null;
  try { browser = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { browser = null; }
  return [...new Set([...(current ? [current] : []), ...(browser ? [browser] : []), ...TIMEZONES])];
}
