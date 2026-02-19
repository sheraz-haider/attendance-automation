import { chromium, Page, BrowserContext } from "playwright";
import path from "path";
import os from "os";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const HRMS_URL = "https://hrms.crootive.net/login";
const HRMS_DASHBOARD = "https://hrms.crootive.net";
const EMAIL = process.env.HRMS_EMAIL!;
const PASSWORD = process.env.HRMS_PASSWORD!;
const CHECK_IN_TIME = process.env.CHECK_IN_TIME || "15:00";
const CHECK_OUT_TIME = process.env.CHECK_OUT_TIME || "01:30";
const HAS_GEOLOCATION = !!(process.env.GEOLOCATION_LAT && process.env.GEOLOCATION_LNG);
const GEOLOCATION_LAT = parseFloat(process.env.GEOLOCATION_LAT || "0");
const GEOLOCATION_LNG = parseFloat(process.env.GEOLOCATION_LNG || "0");
const USER_DATA_DIR = path.join(os.homedir(), ".playwright-chrome-profile");
const SCREENSHOTS_DIR = path.join(__dirname, "..", "screenshots");
const EXTENSIONS_DIR = path.join(__dirname, "..", "extensions");
const ADGUARD_PATH = path.join(EXTENSIONS_DIR, "adguard");
const SESSION_FILE = path.join(__dirname, "..", ".session-storage.json");
const LOGS_DIR = path.join(__dirname, "..", "logs");

// --- Logger ---

function getLogFilePath(): string {
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); // YYYY-MM-DD
  return path.join(LOGS_DIR, `${date}.log`);
}

function formatLogMessage(level: string, message: string): string {
  const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Karachi" }); // YYYY-MM-DD HH:MM:SS
  return `[${timestamp}] [${level}] ${message}`;
}

function writeToLog(formatted: string) {
  fs.appendFileSync(getLogFilePath(), formatted + "\n");
}

const log = {
  info(message: string) {
    const formatted = formatLogMessage("INFO", message);
    console.log(formatted);
    writeToLog(formatted);
  },
  error(message: string) {
    const formatted = formatLogMessage("ERROR", message);
    console.error(formatted);
    writeToLog(formatted);
  },
  warn(message: string) {
    const formatted = formatLogMessage("WARN", message);
    console.warn(formatted);
    writeToLog(formatted);
  },
};

// --- Utilities ---

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(min = 800, max = 2000) {
  return sleep(min + Math.random() * (max - min));
}

function screenshotPath(label: string) {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); // YYYY-MM-DD
  const timestamp = now.toLocaleString("sv-SE", { timeZone: "Asia/Karachi" }).replace(" ", "T").replace(/:/g, "-");
  const dailyDir = path.join(SCREENSHOTS_DIR, date);
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }
  return path.join(dailyDir, `${label}-${timestamp}.png`);
}

async function takeErrorScreenshot(page: Page, label: string) {
  try {
    const filePath = screenshotPath(`error-${label}`);
    await page.screenshot({ path: filePath, fullPage: true });
    log.error(`Error screenshot saved to ${filePath}`);
  } catch {
    log.error("Failed to take error screenshot.");
  }
}

async function typeSlowly(page: Page, selector: string, text: string) {
  const element = page.locator(selector);
  await element.click();
  await humanDelay(400, 800);

  // Mistake configuration
  const mistakeChance = 0.08; // 8% chance to make a typo
  const nearbyKeys: Record<string, string[]> = {
    a: ["q", "s", "z"],
    b: ["v", "g", "h", "n"],
    c: ["x", "d", "f", "v"],
    d: ["s", "e", "r", "f", "c", "x"],
    e: ["w", "s", "d", "r"],
    f: ["d", "r", "t", "g", "v", "c"],
    g: ["f", "t", "y", "h", "b", "v"],
    h: ["g", "y", "u", "j", "n", "b"],
    i: ["u", "j", "k", "o"],
    j: ["h", "u", "i", "k", "m", "n"],
    k: ["j", "i", "o", "l", "m"],
    l: ["k", "o", "p"],
    m: ["n", "j", "k"],
    n: ["b", "h", "j", "m"],
    o: ["i", "k", "l", "p"],
    p: ["o", "l"],
    q: ["w", "a", "s"],
    r: ["e", "d", "f", "t"],
    s: ["a", "w", "e", "d", "z", "x"],
    t: ["r", "f", "g", "y"],
    u: ["y", "h", "j", "i"],
    v: ["c", "f", "g", "b"],
    w: ["q", "a", "s", "e"],
    x: ["z", "s", "d", "c"],
    y: ["t", "g", "h", "u"],
    z: ["a", "s", "x"],
    "@": ["2", "!", "#"],
    ".": [",", "l", "/"],
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lowerChar = char.toLowerCase();

    // Decide if making a mistake
    if (Math.random() < mistakeChance && nearbyKeys[lowerChar]) {
      // Type a wrong character
      const wrongChars = nearbyKeys[lowerChar];
      const wrongChar = wrongChars[Math.floor(Math.random() * wrongChars.length)];
      await page.keyboard.type(wrongChar, { delay: 70 + Math.random() * 130 });

      // Pause to "realize" the mistake
      await sleep(200 + Math.random() * 400);

      // Delete the wrong character
      await page.keyboard.press("Backspace", { delay: 50 + Math.random() * 100 });
      await sleep(100 + Math.random() * 200);

      // Maybe pause longer (thinking)
      if (Math.random() < 0.3) {
        await sleep(300 + Math.random() * 600);
      }
    }

    // Type the correct character
    await page.keyboard.type(char, { delay: 60 + Math.random() * 140 });

    // Random thinking pause
    if (Math.random() < 0.1) {
      await sleep(300 + Math.random() * 500);
    }
  }
}

// Bezier curve point calculation for natural mouse movement
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Track last mouse position globally for smooth curves
let lastMouseX = -1;
let lastMouseY = -1;

async function humanMouseMove(page: Page, targetX: number, targetY: number) {
  // On first call, initialize from current mouse position or near the target
  if (lastMouseX < 0 || lastMouseY < 0) {
    lastMouseX = targetX - 50 + Math.random() * 100;
    lastMouseY = targetY - 50 + Math.random() * 100;
  }

  // Generate bezier control points for curved path
  const cp1x = lastMouseX + (Math.random() - 0.5) * 200;
  const cp1y = lastMouseY + (Math.random() - 0.5) * 200;
  const cp2x = targetX + (Math.random() - 0.5) * 150;
  const cp2y = targetY + (Math.random() - 0.5) * 150;

  const steps = 15 + Math.floor(Math.random() * 20);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease in-out for acceleration/deceleration
    const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const x = bezierPoint(easedT, lastMouseX, cp1x, cp2x, targetX);
    const y = bezierPoint(easedT, lastMouseY, cp1y, cp2y, targetY);

    await page.mouse.move(x, y);
    // Small random delay per step (speed variation comes from eased position interpolation)
    const stepDelay = 8 + Math.random() * 20;
    await sleep(stepDelay);
  }

  lastMouseX = targetX;
  lastMouseY = targetY;
  await sleep(50 + Math.random() * 100);
}

// --- Stealth ---

async function applyStealthScripts(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);

    (window as any).chrome = {
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
      app: { isInstalled: false },
    };
  });
  log.info("Stealth scripts applied.");
}

// --- Session Persistence ---

function saveSessionStorage(data: Record<string, string>) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  log.info("Session storage saved to disk.");
}

function loadSessionStorage(): Record<string, string> | null {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      log.info("Session storage loaded from disk.");
      return data;
    }
  } catch {
    log.warn("Failed to load saved session.");
  }
  return null;
}

async function captureSessionStorage(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      entries[key] = sessionStorage.getItem(key)!;
    }
    return entries;
  });
}

// --- Auth ---

async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (!url.includes("/login")) {
    return true;
  }
  const loginForm = await page.locator('input[name="name"]').count();
  return loginForm === 0;
}

async function login(page: Page) {
  log.info("Entering email...");
  await typeSlowly(page, 'input[name="name"]', EMAIL);
  await humanDelay(600, 1500);

  await humanMouseMove(page, 400 + Math.random() * 200, 380 + Math.random() * 50);
  await humanDelay(300, 700);

  log.info("Entering password...");
  await typeSlowly(page, 'input[name="password"]', PASSWORD);
  await humanDelay(1000, 2000);

  await humanMouseMove(page, 450 + Math.random() * 100, 450 + Math.random() * 50);
  await humanDelay(1200, 2800);

  log.info("Submitting login...");
  await page.click('button[type="submit"]');

  await page.waitForLoadState("networkidle");
  await humanDelay(3000, 5000);

  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on login page after submit");
  }

  log.info("Login successful.");
}

// --- Time Logic ---

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

function getCurrentMinutesSinceMidnight(): number {
  const pkTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" }));
  return pkTime.getHours() * 60 + pkTime.getMinutes();
}

type Action = "checkin" | "checkout" | "none";

function determineAction(): Action {
  const now = getCurrentMinutesSinceMidnight();
  const checkIn = parseTime(CHECK_IN_TIME);
  const checkOut = parseTime(CHECK_OUT_TIME);
  const checkInMinutes = checkIn.hours * 60 + checkIn.minutes;
  const checkOutMinutes = checkOut.hours * 60 + checkOut.minutes;

  // CHECK_OUT_TIME (e.g. 01:30) is smaller than CHECK_IN_TIME (e.g. 15:00)
  // meaning checkout is after midnight. The timeline across two days:
  //
  //   00:00 ............. 01:30 ............. 15:00 ............. 23:59
  //   |-- checkin phase ---|-- checkout phase --|-- checkin phase ---------|
  //
  // Check-in phase: from CHECK_IN_TIME through midnight until CHECK_OUT_TIME
  // Check-out phase: from CHECK_OUT_TIME until next CHECK_IN_TIME
  //   (button state handles the rest — if already checked out, does nothing)

  if (checkOutMinutes < checkInMinutes) {
    // Checkout time is after midnight (crosses day boundary)
    if (now >= checkInMinutes) {
      // After check-in time today (e.g. 15:00 - 23:59) → check-in phase
      return "checkin";
    } else if (now < checkOutMinutes) {
      // After midnight but before checkout time (e.g. 00:00 - 01:29) → still check-in phase
      return "checkin";
    } else {
      // After checkout time, before next check-in (e.g. 01:30 - 14:59) → checkout phase
      return "checkout";
    }
  } else {
    // Normal case: checkout time is after check-in time within same day
    if (now >= checkInMinutes && now < checkOutMinutes) {
      return "checkin";
    } else if (now >= checkOutMinutes) {
      return "checkout";
    } else {
      return "none";
    }
  }
}

// --- Human-like Button Click ---

async function humanClickButton(page: Page, button: ReturnType<Page["locator"]>, label: string) {
  // Scroll back to top for a clean view
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await humanDelay(1500, 2500);

  // Look around the page like a human
  await humanMouseMove(page, 300 + Math.random() * 200, 150 + Math.random() * 100);
  await humanDelay(800, 1500);
  await humanMouseMove(page, 200 + Math.random() * 150, 250 + Math.random() * 100);
  await humanDelay(600, 1200);

  // Take a pre-click screenshot
  const preScreenshot = screenshotPath(`pre-${label}`);
  await page.screenshot({ path: preScreenshot, fullPage: true });
  log.info(`Pre-${label} screenshot saved to ${preScreenshot}`);

  // Scroll button into view
  await button.scrollIntoViewIfNeeded();
  await humanDelay(800, 1500);

  // Get bounding box for natural mouse movement
  const box = await button.boundingBox();
  if (!box) {
    throw new Error(`Could not get bounding box for ${label} button`);
  }

  // Move mouse nearby first (not directly to button)
  const nearbyX = box.x + box.width / 2 + (Math.random() * 80 - 40);
  const nearbyY = box.y - 30 - Math.random() * 50;
  await humanMouseMove(page, nearbyX, nearbyY);
  await humanDelay(400, 800);

  // Move to button center with slight randomness
  const targetX = box.x + box.width / 2 + (Math.random() * 10 - 5);
  const targetY = box.y + box.height / 2 + (Math.random() * 4 - 2);
  await humanMouseMove(page, targetX, targetY);
  await humanDelay(500, 1000);

  // Brief pause before clicking
  await humanDelay(300, 700);

  // Click
  log.info(`Clicking ${label} button...`);
  await page.mouse.click(targetX, targetY);

  // Wait for network response
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  await humanDelay(3000, 5000);

  // Take post-click screenshot
  const postScreenshot = screenshotPath(`post-${label}`);
  await page.screenshot({ path: postScreenshot, fullPage: true });
  log.info(`Post-${label} screenshot saved to ${postScreenshot}`);
}

// --- Attendance Actions ---

async function performCheckIn(page: Page) {
  log.info("--- Starting check-in process ---");

  const checkInButton = page.locator('button', { hasText: /^[\s\S]*Check In[\s\S]*$/ }).first();
  await checkInButton.waitFor({ state: "visible", timeout: 15000 });
  log.info("Check In button is visible.");

  const isDisabled = await checkInButton.isDisabled();
  if (isDisabled) {
    log.info("Check In button is DISABLED — already checked in. Nothing to do.");
    const filePath = screenshotPath("checkin-already-done");
    await page.screenshot({ path: filePath, fullPage: true });
    log.info(`Screenshot saved to ${filePath}`);
    return;
  }

  log.info("Check In button is enabled. Proceeding with check-in...");
  await humanClickButton(page, checkInButton, "checkin");

  // Verify: Check Out button should now be enabled
  const checkOutButton = page.locator('button', { hasText: /^[\s\S]*Check Out[\s\S]*$/ }).first();
  const checkOutEnabled = await checkOutButton.isEnabled().catch(() => false);
  if (checkOutEnabled) {
    log.info("Check-in SUCCESSFUL — Check Out button is now enabled.");
  } else {
    log.warn("Check-in status unclear — please verify from the post-checkin screenshot.");
  }

  log.info("--- Check-in process completed ---");
}

async function performCheckOut(page: Page) {
  log.info("--- Starting check-out process ---");

  const checkOutButton = page.locator('button', { hasText: /^[\s\S]*Check Out[\s\S]*$/ }).first();
  await checkOutButton.waitFor({ state: "visible", timeout: 15000 });
  log.info("Check Out button is visible.");

  const isDisabled = await checkOutButton.isDisabled();
  if (isDisabled) {
    log.info("Check Out button is DISABLED — already checked out. Nothing to do.");
    const filePath = screenshotPath("checkout-already-done");
    await page.screenshot({ path: filePath, fullPage: true });
    log.info(`Screenshot saved to ${filePath}`);
    return;
  }

  log.info("Check Out button is enabled. Proceeding with check-out...");
  await humanClickButton(page, checkOutButton, "checkout");

  // Verify: Check In button should now be enabled (reset for next day)
  const checkInButton = page.locator('button', { hasText: /^[\s\S]*Check In[\s\S]*$/ }).first();
  const checkInEnabled = await checkInButton.isEnabled().catch(() => false);
  if (checkInEnabled) {
    log.info("Check-out SUCCESSFUL — Check In button is now enabled (reset).");
  } else {
    log.warn("Check-out status unclear — please verify from the post-checkout screenshot.");
  }

  log.info("--- Check-out process completed ---");
}

// --- Main ---

async function main() {
  log.info("=== Attendance script started ===");

  if (!EMAIL || !PASSWORD) {
    log.error("Missing HRMS_EMAIL or HRMS_PASSWORD in .env file");
    process.exit(1);
  }

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    log.info("Launching browser...");
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: true,
      channel: "chrome",
      viewport: null,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      permissions: ["geolocation"],
      geolocation: HAS_GEOLOCATION
        ? { latitude: GEOLOCATION_LAT, longitude: GEOLOCATION_LNG }
        : undefined,
      args: [
        "--start-maximized",
        "--disable-infobars",
        "--no-first-run",
        "--no-default-browser-check",
        `--load-extension=${ADGUARD_PATH}`,
      ],
      ignoreDefaultArgs: ["--enable-automation", "--no-sandbox", "--disable-extensions"],
      locale: "en-US",
      timezoneId: "Asia/Karachi",
    });
    log.info("Browser launched.");

    page = context.pages()[0] || (await context.newPage());
    await applyStealthScripts(page);

    // Restore session storage before the page loads via init script
    const savedSession = loadSessionStorage();
    if (savedSession) {
      await page.addInitScript((sessionData) => {
        for (const [key, value] of Object.entries(sessionData)) {
          sessionStorage.setItem(key, value);
        }
      }, savedSession);
      log.info("Session restore script injected.");
    } else {
      log.info("No saved session found. Will perform fresh login.");
    }

    log.info(`Navigating to ${HRMS_DASHBOARD}...`);
    await page.goto(HRMS_DASHBOARD, { waitUntil: "networkidle" });
    log.info(`Page loaded. Current URL: ${page.url()}`);

    await humanDelay(2000, 3500);
    await humanMouseMove(page, 400 + Math.random() * 200, 300 + Math.random() * 100);
    await humanDelay(500, 1000);

    if (await isLoggedIn(page)) {
      log.info("Already logged in. Skipping login.");
    } else {
      log.info(`Logging in as ${EMAIL}...`);
      await login(page);
    }

    // Save session storage for next run
    const sessionData = await captureSessionStorage(page);
    saveSessionStorage(sessionData);

    // Scroll down slightly like a user checking the dashboard
    log.info("Scrolling dashboard...");
    for (let i = 0; i < 2; i++) {
      const scrollAmount = 150 + Math.floor(Math.random() * 200);
      const steps = 6 + Math.floor(Math.random() * 4);
      for (let s = 0; s < steps; s++) {
        await page.mouse.wheel(0, scrollAmount / steps);
        await sleep(40 + Math.random() * 60);
      }
      await humanDelay(1000, 2000);
    }

    // Determine action based on current time
    const action = determineAction();
    const now = new Date();
    log.info(`Current time: ${now.toLocaleTimeString("en-US", { hour12: true, timeZone: "Asia/Karachi" })} | CHECK_IN_TIME: ${CHECK_IN_TIME} | CHECK_OUT_TIME: ${CHECK_OUT_TIME} | Action: ${action}`);

    if (action === "checkin") {
      await performCheckIn(page);
    } else if (action === "checkout") {
      await performCheckOut(page);
    } else {
      log.info("Outside check-in/check-out windows. Nothing to do.");
      const filePath = screenshotPath("no-action");
      await page.screenshot({ path: filePath, fullPage: true });
      log.info(`Screenshot saved to ${filePath}`);
    }

    await humanDelay(3000, 5000);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Unexpected error: ${message}`);
    if (page) {
      await takeErrorScreenshot(page, "crash");
    }
  } finally {
    if (context) {
      log.info("Closing browser...");
      await context.close();
    }
    log.info("=== Attendance script finished ===");
  }
}

main();
