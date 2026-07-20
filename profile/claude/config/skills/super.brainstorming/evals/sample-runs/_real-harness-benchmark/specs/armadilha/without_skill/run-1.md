---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: csv-export-button
---

# Design Spec — Export to CSV Button (Reports Page)

## Overview

Add an "Export to CSV" button to the reports page. When clicked, it downloads
the currently displayed report as a `.csv` file that users can open in Excel.
This is a small, self-contained addition to an existing page.

## Purpose & Success Criteria

- **Who uses it:** Product managers and analysts who want to pull the report
  data into Excel for their own ad-hoc analysis.
- **Success:** A user on the reports page clicks the button and immediately
  gets a CSV download containing the data they see on screen, openable in Excel.

## Clarified Requirements

Captured during brainstorming (one question at a time):

1. **What is exported:** Just the data currently shown on the screen (the
   visible report rows and their columns).
2. **Format:** A normal comma-separated CSV, the kind people routinely open in
   Excel.
3. **Delivery:** Click the button and the file downloads directly in the
   browser. The user expects it to be quick.

## Approaches Considered

- **A — Client-side generation (recommended).** Serialize the report rows that
  are already loaded in the page into a CSV string and trigger a browser
  download (Blob + object URL). No new backend endpoint needed.
  - *Trade-off:* Simplest and fastest to ship; works only against the data the
    page already has in memory.
- **B — Backend export endpoint.** Add an API route that re-queries the report
  and returns a CSV attachment.
  - *Trade-off:* More moving parts and a new endpoint to maintain; unnecessary
    when we are only exporting what is already on screen.

**Recommendation:** Approach A — it matches the requirement ("just the data on
the screen") with the least code.

## Components

- **Export button (UI):** Lives in the reports page toolbar; disabled while the
  report is still loading or empty.
- **CSV serializer:** Pure function that takes the in-memory report rows +
  column definitions and returns a CSV string (header row + data rows, values
  quoted/escaped as needed).
- **Download trigger:** Wraps the CSV string in a Blob and initiates the
  browser download with a sensible filename (e.g. `report-<date>.csv`).

## Data Flow

Report rows in page state → CSV serializer → Blob → browser download.

## Testing

- Unit test the CSV serializer: header row matches columns, commas/quotes/
  newlines inside values are escaped, empty report handled.
- UI test: button disabled on empty/loading report; click produces a download.

## Risks

- Values containing commas, quotes, or line breaks must be escaped correctly, or
  the CSV will be malformed. Covered by serializer unit tests.

## Open Items

- Exact filename convention to confirm with the team.
