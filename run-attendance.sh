#!/bin/bash
# =============================================================================
# Attendance Automation Wrapper
# Handles: public holiday skipping, random delay within window, env setup
#
# Usage:
#   run-attendance.sh checkin    → used for 2:31-3:15 PM window (Mon-Fri)
#   run-attendance.sh checkout   → used for 1:31-2:15 AM window (Tue-Sat)
# =============================================================================

set -euo pipefail

export TZ="Asia/Karachi"

# Full paths since cron has a minimal PATH
export PATH="/Users/sheraz/.nvm/versions/node/v22.20.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_DIR="/Users/sheraz/projects/personal/attendance-automation"
LOG_FILE="$PROJECT_DIR/logs/cron.log"

# Ensure logs dir exists
mkdir -p "$PROJECT_DIR/logs"

log() {
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] [WRAPPER] $*" | tee -a "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# Tell the attendance script when check-in vs check-out phases begin.
# CHECK_IN_TIME=14:30 → at 2:30 PM onwards, the script will check in.
# CHECK_OUT_TIME=01:30 → from 1:30 AM until 2:30 PM, the script checks out.
# These are read by the TypeScript script via dotenv — exporting here overrides .env.
# ---------------------------------------------------------------------------
export CHECK_IN_TIME="14:30"
export CHECK_OUT_TIME="01:30"

# ---------------------------------------------------------------------------
# Pakistan Federal Public Holidays (non-working days)
# Sources: timeanddate.com/holidays/pakistan/2026
# Tentative Islamic dates included — update yearly.
# ---------------------------------------------------------------------------
HOLIDAYS=(
  # --- 2026 ---
  "2026-02-05"  # Kashmir Day
  "2026-03-21"  # Eid-ul-Fitr (Tentative)
  "2026-03-22"  # Eid-ul-Fitr Holiday (Tentative)
  "2026-03-23"  # Pakistan Day + Eid-ul-Fitr Holiday
  "2026-05-01"  # Labour Day
  "2026-05-27"  # Eid al-Adha (Tentative)
  "2026-05-28"  # Youm-i-Takbeer + Eid al-Adha Holiday
  "2026-05-29"  # Eid al-Adha Holiday (Tentative)
  "2026-06-24"  # Ashura (Tentative)
  "2026-06-25"  # Ashura Holiday (Tentative)
  "2026-08-14"  # Independence Day
  "2026-08-25"  # Eid Milad un-Nabi (Tentative)
  "2026-11-09"  # Iqbal Day
  "2026-12-25"  # Christmas Day + Quaid-e-Azam Day
  # --- Add 2027 holidays here when available ---
)

MODE="${1:-checkin}"

# For checkout, the "work happened yesterday" — check if yesterday was a holiday
if [ "$MODE" = "checkout" ]; then
  CHECK_DATE=$(date -v-1d +%Y-%m-%d)
else
  CHECK_DATE=$(date +%Y-%m-%d)
fi

is_holiday() {
  local target="$1"
  for h in "${HOLIDAYS[@]}"; do
    if [ "$h" = "$target" ]; then
      return 0
    fi
  done
  return 1
}

log "=== Attendance wrapper starting (mode=$MODE, check_date=$CHECK_DATE) ==="

if is_holiday "$CHECK_DATE"; then
  log "$CHECK_DATE is a public holiday — skipping."
  exit 0
fi

# ---------------------------------------------------------------------------
# Random delay: 0–2640 seconds (0–44 minutes)
# Window: 2:31–3:15 PM (checkin) or 1:31–2:15 AM (checkout) = 44 min each
# Using two RANDOM calls to get a wider range before modulo (reduces bias)
# ---------------------------------------------------------------------------
MIN_DELAY=60    # at least 1 minute — never fire exactly at cron trigger time
MAX_DELAY=2700  # at most 45 minutes
RANGE=$(( MAX_DELAY - MIN_DELAY + 1 ))
DELAY=$(( MIN_DELAY + (RANDOM * 32768 + RANDOM) % RANGE ))
DELAY_MIN=$(( DELAY / 60 ))
DELAY_SEC=$(( DELAY % 60 ))
log "Random delay: ${DELAY}s (${DELAY_MIN}m ${DELAY_SEC}s) — will run at approx $(date -v+"${DELAY}"S '+%H:%M:%S')"

sleep "$DELAY"

log "Running attendance script..."
cd "$PROJECT_DIR"

npm run start >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

log "Attendance script finished (exit code: $EXIT_CODE)"
