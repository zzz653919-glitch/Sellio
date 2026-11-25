export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  plan: "free" | "pro";
  createdAt: string;
};

export type Metric = "generations" | "forecasts" | "priceSearches";
export type Usage = { plan: "free" | "pro"; periodStart: string; metrics: Record<Metric, { used: number; limit: number }> };

export type Meta = {
  integrations: {
    email: boolean;
    imageGeneration: boolean;
    priceProviders: { serpapi: boolean; ebay: boolean };
    marketDataProviders: string[];
    payments: boolean;
  };
};

export type Upload = { id: string; url: string; width: number; height: number; mime: string; size: number; name: string | null; createdAt?: string };

export type Generation = {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  productName: string;
  category: string;
  style: string;
  styleLabel: string;
  background: string;
  settings: { size?: string; quality?: string; lighting?: string; brandColor?: string; instructions?: string };
  provider: string;
  model: string;
  error: string | null;
  retryOf: string | null;
  originalUrl: string;
  uploadId: string;
  resultUrl: string | null;
  resultUploadId: string | null;
  projectId: string | null;
  favoriteId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type StudioOptions = {
  configured: boolean;
  categories: string[];
  styles: { value: string; label: string }[];
  backgrounds: { value: string; label: string }[];
  sizes: { value: string; label: string; pixels: string }[];
  qualities: string[];
  lighting: string[];
  limits: { maxBytes: number; minSide: number; maxSide: number; formats: string[] };
};

export type Granularity = "day" | "week" | "month";
export type Offer = {
  id: string;
  provider: string;
  storeName: string;
  title: string;
  price: number;
  currency: string | null;
  priceText: string;
  previousPrice: number | null;
  imageUrl: string | null;
  url: string;
  condition: "new" | "used" | "refurbished" | null;
  availability: "in_stock" | "out_of_stock" | null;
  gtin: string | null;
  shipping: string | null;
};

export type OfferGroup = {
  id: string;
  title: string;
  imageUrl: string | null;
  relevance: number;
  currency: string | null;
  offers: Offer[];
  cheapest: Offer;
  highest: Offer;
  storesCount: number;
  potentialSavings: number | null;
};

export type ProviderStatus = { name: string; label: string; status: "ok" | "error"; count: number; error?: string };

export type PriceSearch = {
  id: string;
  query: string;
  status: "completed" | "partial" | "failed" | "no_providers";
  providers: ProviderStatus[];
  offersCount: number;
  bestPrice: number | null;
  bestCurrency: string | null;
  bestOffer: Offer | null;
  result?: { query: string; fetchedAt: string; dataSource: "live"; providers: ProviderStatus[]; groups: OfferGroup[]; bestGroupId: string | null; bestOffer: Offer | null; totalOffers: number } | null;
  projectId: string | null;
  favoriteId: string | null;
  createdAt: string;
};

export type ProjectType = "advertisement" | "forecast" | "price_comparison";
export type Project = {
  id: string;
  type: ProjectType;
  refId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  favoriteId: string | null;
  thumbnailUrl: string | null;
  subtitle: string;
  status: string;
  downloadUrl: string | null;
};

export type FavoriteType = "product" | "price_comparison" | "advertisement" | "forecast";
export type Favorite = { id: string; itemType: FavoriteType; refId: string; title: string; category: string | null; data: Record<string, unknown>; createdAt: string };

export type AppNotification = { id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

export type Activity = { id: string; type: string; service: string; title: string; success: boolean; createdAt: string; refId: string | null };

export type Settings = {
  theme: "light" | "dark" | "system";
  language: "en" | "uz" | "ru";
  notifications: { inApp: boolean; email: boolean; generation: boolean; forecast: boolean; price: boolean; account: boolean };
};

