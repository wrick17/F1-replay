const DEFAULT_ARCHIVE_CATALOG_URL = "https://data.f1.wrick17.com/catalog.json";

export const getArchiveCatalogUrl = () => {
  const configured = import.meta.env.RSBUILD_ARCHIVE_URL?.trim();
  if (configured) return new URL("catalog.json", `${configured.replace(/\/?$/, "/")}`).href;
  const origin = globalThis.location?.origin ?? "http://localhost";
  return new URL("/archive/catalog.json", origin).href;
};

export const getBundledCatalogUrl = (catalogUrl: string) => {
  if (!globalThis.location?.origin) return null;
  try {
    if (new URL(catalogUrl).href !== DEFAULT_ARCHIVE_CATALOG_URL) return null;
    return new URL("/archive/catalog.json", globalThis.location.origin).href;
  } catch {
    return null;
  }
};
