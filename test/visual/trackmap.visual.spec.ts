import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import http from "node:http";

const APP_URL = "http://localhost:3001/replay";
const YEAR = 2025;
const ROUNDS = [3, 4, 5];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type DOMRectLike = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

const intersects = (a: DOMRectLike, b: DOMRectLike) => {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
};

const overlapArea = (a: DOMRectLike, b: DOMRectLike) => {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const isServerLive = (url: string) =>
  new Promise<boolean>((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });

const waitForServer = async (url: string, timeoutMs = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerLive(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready at ${url}`);
};

const launchServerIfNeeded = async () => {
  if (await isServerLive(APP_URL)) {
    return { process: null };
  }
  const proc = spawn("bun", ["run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3001" },
  });
  await waitForServer(APP_URL);
  return { process: proc };
};

let browserInstallAttempted = false;

const isMissingBrowserError = (err: unknown) => {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("Executable doesn't exist") ||
    err.message.includes("playwright install")
  );
};

const installChromium = () =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn("bunx", ["playwright", "install", "chromium"], {
      stdio: "inherit",
      env: { ...process.env },
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to install Playwright browsers (code ${code ?? "unknown"})`));
      }
    });
  });

const launchBrowser = async () => {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!browserInstallAttempted && isMissingBrowserError(err)) {
      browserInstallAttempted = true;
      await installChromium();
      return chromium.launch();
    }
    throw err;
  }
};

const getRect = async (page: Page, selector: string) => {
  return page.locator(selector).evaluate((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
};

const getRects = async (page: Page, selector: string) => {
  return page.$$eval(selector, (elements) =>
    elements.map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    }),
  );
};

const getTrackPathRect = async (page: Page) => {
  return page.evaluate(() => {
    const paths = Array.from(
      document.querySelectorAll("svg[aria-label='F1 track replay'] path"),
    );
    if (paths.length === 0) return null;
    const rects = paths.map((el) => (el as SVGGraphicsElement).getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: left + (right - left) / 2,
      centerY: top + (bottom - top) / 2,
    };
  });
};

describe("trackmap visual layout", () => {
  let server: ChildProcessWithoutNullStreams | null = null;
  let browser: Browser | null = null;

  beforeAll(
    async () => {
      const result = await launchServerIfNeeded();
      server = result.process;
      browser = await launchBrowser();
    },
    180_000,
  );

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      server.kill("SIGTERM");
    }
  });

  for (const viewport of VIEWPORTS) {
    for (const round of ROUNDS) {
      it(
        `round ${round} (${viewport.name}) has safe labels`,
        async () => {
        if (!browser) {
          throw new Error("Browser not available");
        }
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        try {
          const url = `${APP_URL}?year=${YEAR}&round=${round}&session=Race`;
          page.setDefaultTimeout(120_000);
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("svg[aria-label='F1 track replay']");
          await page.waitForFunction(
            () => document.querySelectorAll("svg[aria-label='F1 track replay'] text").length > 10,
          );
          await page.waitForTimeout(500);

          const trackPathBox = await getTrackPathRect(page);
          const telemetryBox = await getRect(page, "aside");
          const headerBox = await getRect(page, "header");
          const footerBox = await getRect(page, "footer");

          if (!trackPathBox) {
            throw new Error("Track path not found");
          }
          expect(trackPathBox.width).toBeGreaterThan(100);
          expect(trackPathBox.height).toBeGreaterThan(100);
          const trackArea = trackPathBox.width * trackPathBox.height;
          const maxTrackOverlapRatio = 0.02;
          expect(overlapArea(trackPathBox, telemetryBox) / trackArea).toBeLessThan(
            maxTrackOverlapRatio,
          );
          expect(overlapArea(trackPathBox, headerBox) / trackArea).toBeLessThan(
            maxTrackOverlapRatio,
          );
          expect(overlapArea(trackPathBox, footerBox) / trackArea).toBeLessThan(
            maxTrackOverlapRatio,
          );

          const labelRects = await getRects(
            page,
            "svg[aria-label='F1 track replay'] rect[stroke='rgba(255,255,255,0.2)']",
          );
          const dotRects = await getRects(
            page,
            "svg[aria-label='F1 track replay'] circle",
          );
          expect(labelRects.length).toBeGreaterThan(10);
          expect(dotRects.length).toBeGreaterThan(10);

          for (const label of labelRects) {
            expect(overlapArea(label, telemetryBox)).toBeLessThan(2);
            expect(overlapArea(label, headerBox)).toBeLessThan(2);
            expect(overlapArea(label, footerBox)).toBeLessThan(2);
          }

          const maxLabelOverlapArea = 60;
          for (let i = 0; i < labelRects.length; i += 1) {
            for (let j = i + 1; j < labelRects.length; j += 1) {
              const a = labelRects[i];
              const b = labelRects[j];
              if (intersects(a, b)) {
                expect(overlapArea(a, b)).toBeLessThan(maxLabelOverlapArea);
              }
            }
          }

          const distanceScale = 0.5;
          const maxDistance = Math.max(trackPathBox.width, trackPathBox.height) * distanceScale;
          for (const label of labelRects) {
            const closest = dotRects.reduce((best, dot) => {
              const dx = label.centerX - dot.centerX;
              const dy = label.centerY - dot.centerY;
              const dist = Math.hypot(dx, dy);
              return dist < best ? dist : best;
            }, Number.POSITIVE_INFINITY);
            expect(closest).toBeLessThan(maxDistance);
          }
        } finally {
          await context.close();
        }
      },
      180_000,
      );
    }
  }
});
