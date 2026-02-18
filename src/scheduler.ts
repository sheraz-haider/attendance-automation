import cron from "node-cron";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CHECK_IN_TIME = process.env.CHECK_IN_TIME || "15:00";
const CHECK_OUT_TIME = process.env.CHECK_OUT_TIME || "01:30";
const TIMEZONE = "Asia/Karachi";

// Dates to skip (YYYY-MM-DD) — Pakistan federal public holidays 2026
// Islamic dates are approximate and subject to moon sighting
const SKIP_DATES: Set<string> = new Set([
  // National holidays
  "2026-02-05", // Kashmir Day
  "2026-03-23", // Pakistan Day
  "2026-05-01", // Labour Day
  "2026-05-28", // Youm-e-Takbeer
  "2026-08-14", // Independence Day
  "2026-11-09", // Iqbal Day
  "2026-12-25", // Quaid-e-Azam Day

  // Eid ul-Fitr (1–3 Shawwal)
  "2026-03-21",
  "2026-03-22",
  "2026-03-23",

  // Eid ul-Adha (10–12 Dhul Hijjah)
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",

  // Ashura (9th & 10th Muharram)
  "2026-06-25",
  "2026-06-26",

  // Eid Milad-un-Nabi (12 Rabi ul-Awal)
  "2026-08-25",
]);
const LOGS_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOGS_DIR, "cron.log");
const PROJECT_DIR = path.join(__dirname, "..");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] [SCHEDULER] ${message}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}

function randomDelay(): number {
  return Math.floor(Math.random() * 15 * 60 * 1000); // 0–15 minutes in ms
}

function shouldSkipToday(): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

  if (SKIP_DATES.has(dateStr)) {
    log(`Skipping today (${dateStr}) — date is in SKIP_DATES.`);
    return true;
  }
  return false;
}

function runAttendance() {
  if (shouldSkipToday()) return;

  const delay = randomDelay();
  const delayMin = (delay / 60000).toFixed(1);
  log(`Triggering attendance script after ${delayMin} min random delay...`);

  setTimeout(() => {
    log("Executing attendance script now.");
    const child = exec(`npx ts-node src/attendance.ts`, { cwd: PROJECT_DIR });

    child.stdout?.on("data", (data) => fs.appendFileSync(LOG_FILE, data));
    child.stderr?.on("data", (data) => fs.appendFileSync(LOG_FILE, data));
    child.on("close", (code) => log(`Attendance script exited with code ${code}`));
  }, delay);
}

function timeToCron(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * 1-5`;
}

const checkInCron = timeToCron(CHECK_IN_TIME);
const checkOutCron = timeToCron(CHECK_OUT_TIME);

log(`Scheduling check-in:  "${checkInCron}" (${CHECK_IN_TIME}) Mon-Fri ${TIMEZONE}`);
log(`Scheduling check-out: "${checkOutCron}" (${CHECK_OUT_TIME}) Mon-Fri ${TIMEZONE}`);
if (SKIP_DATES.size > 0) log(`Skip dates: ${[...SKIP_DATES].join(", ")}`);

cron.schedule(checkInCron, runAttendance, { timezone: TIMEZONE });
cron.schedule(checkOutCron, runAttendance, { timezone: TIMEZONE });

log("Scheduler running. Press Ctrl+C to stop.");
