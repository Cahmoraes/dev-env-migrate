---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: csv-export-button
---

# Design Spec — Export to CSV Button (Reports Page)

## Overview

Add an "Export to CSV" button to the reports page. It exports the **full
filtered result set** of the current report as a `.csv` file for use in Excel.
Because some reports are large, the export is generated asynchronously and the
user is given a download link when it is ready.

## Purpose & Success Criteria

- **Who uses it:** PMs and analysts who pull report data into Excel for their
  own analysis.
- **Success:** A user clicks Export, the export is prepared server-side, and the
  user can download the complete filtered report as a CSV.

## Clarified Requirements

Captured during brainstorming (roots before leaves):

1. **Dataset (root decision):** Export the **full filtered result set**, not
   only the visible page. The user confirmed reports can be large — tens of
   thousands of rows, sometimes more.
2. **Sync vs async (follows from #1):** Because the result set can be large, a
   direct synchronous download risks timing out. The export is generated
   **asynchronously**: the user clicks Export, the server prepares the file, and
   the user gets a download link / notification when it's ready.
3. **Date & time formatting:** Timestamps are rendered in the **user's local
   timezone** (matching what they see on the page), not raw server UTC.
4. **Format:** A normal comma-separated CSV that opens in Excel.

## Approaches Considered

- **A — Async server-side export (recommended).** Export button calls a backend
  endpoint that enqueues a job; the job queries the full filtered result set,
  writes a CSV, and exposes a download link (with a progress/notification cue).
  - *Trade-off:* More infrastructure (a job + storage for the generated file),
    but it is the only option that reliably handles large result sets without
    timing out.
- **B — Synchronous server-side export.** Endpoint queries and returns the CSV
  inline.
  - *Trade-off:* Simpler, but a large filtered result set would exceed request
    timeouts — rejected because #1 established the data can be large.

**Recommendation:** Approach A, driven by the confirmed large-dataset
requirement.

## Components

- **Export button (UI):** Triggers the export request; shows a "preparing…"
  state and surfaces the download link/notification when ready.
- **Export request endpoint:** Accepts the current report + active filters,
  enqueues an export job, returns a job/handle id.
- **Export job:** Queries the full filtered result set, formats rows (dates in
  user's local timezone), writes the CSV to storage.
- **Download link:** Serves the finished CSV file to the user.

## Data Flow

Click → export endpoint (report + filters) → job enqueued → job queries full
filtered result → CSV written to storage → user notified → download.

## Testing

- Job produces a CSV whose row count matches the full filtered result.
- Dates render in the user's local timezone.
- CSV escaping (commas/quotes/newlines) is correct.
- UI reflects preparing → ready states.

## Risks

- 🔴 Large exports must not block a web request — the async job design mitigates
  this.
- File storage / cleanup of generated exports needs a retention policy.

## Open Items

- Notification mechanism (in-app toast vs email) to confirm with the team.
- File retention window for generated exports.
