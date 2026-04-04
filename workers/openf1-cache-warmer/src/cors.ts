const DEFAULT_DASHBOARD_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://f1.wrick17.com",
  "https://www.f1.wrick17.com",
];

const parseCsvOrigins = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const parseAllowedOrigins = (configuredOrigins: string | undefined) => {
  if (configuredOrigins === undefined) {
    return DEFAULT_DASHBOARD_ALLOWED_ORIGINS;
  }
  const parsed = parseCsvOrigins(configuredOrigins);
  return parsed.length ? parsed : DEFAULT_DASHBOARD_ALLOWED_ORIGINS;
};

export const isAllowedOrigin = (origin: string | null, allowlist: string[]) => {
  if (!origin) return false;
  return allowlist.includes(origin);
};

