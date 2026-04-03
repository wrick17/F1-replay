export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const parseEmailAllowlist = (value: string | undefined) => {
  if (!value) return new Set<string>();
  const emails = value
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return new Set(emails);
};

export const isAllowedEmailClaim = (claim: unknown, allowlist: Set<string>) => {
  if (typeof claim !== "string") return false;
  if (!allowlist.size) return false;
  return allowlist.has(normalizeEmail(claim));
};

export const buildShooAudience = (origin: string) => `origin:${origin}`;
