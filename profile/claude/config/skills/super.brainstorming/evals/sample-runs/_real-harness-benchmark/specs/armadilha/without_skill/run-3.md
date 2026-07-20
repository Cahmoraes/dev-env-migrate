---
created_at: 2026-07-07
updated_at: 2026-07-07
feature: csv-export-button
---

# Design Spec — Export to CSV Button (Reports Page)

## Overview

Add an "Export to CSV" button to the reports page that downloads the current
report as a `.csv` file. Because the users are in Brazil and open the file in
Excel, the export is written with Excel-friendly, pt-BR-correct encoding and
number formatting.

## Purpose & Success Criteria

- **Who uses it:** PMs and analysts who open the report in Excel.
- **Success:** A user clicks Export, downloads the visible report as a CSV, and
  it opens cleanly in (pt-BR) Excel — accents intact, numbers correctly parsed.

## Clarified Requirements

Captured during brainstorming (one question at a time):

1. **What is exported:** The data currently shown on the screen.
2. **Excel / encoding & locale (key decision):** Users are in Brazil. The file
   must:
   - be **UTF-8 with a BOM**, so Excel renders accented characters correctly
     instead of garbling them;
   - use the **pt-BR number format** (decimal comma), so Excel does not corrupt
     numeric values. Because the decimal separator is a comma, the field
     delimiter should be a **semicolon** (the pt-BR Excel convention) rather
     than a comma.
3. **Format:** A CSV that opens directly in Excel by double-click.

## Approaches Considered

- **A — Client-side generation with locale-aware formatting (recommended).**
  Serialize the on-screen rows into a CSV string, prepend a UTF-8 BOM, format
  numbers with the pt-BR locale, and use `;` as the delimiter. Trigger a
  browser download.
  - *Trade-off:* Simple and matches the "data on screen" requirement, while
    still getting the encoding/locale details right for Excel pt-BR.
- **B — Plain comma CSV, UTF-8 no BOM.** Minimal serializer.
  - *Trade-off:* Least code, but accents break and decimal-comma numbers get
    mis-parsed in pt-BR Excel — rejected because it fails the actual use case.

**Recommendation:** Approach A — the encoding/locale handling is what makes the
file usable in the users' Excel.

## Components

- **Export button (UI):** In the reports toolbar; disabled while loading/empty.
- **Locale-aware CSV serializer:** Builds the CSV string with a UTF-8 BOM,
  `;` delimiter, and pt-BR number formatting; escapes values containing the
  delimiter, quotes, or newlines.
- **Download trigger:** Blob + browser download with a `.csv` filename.

## Data Flow

On-screen report rows → locale-aware CSV serializer (BOM, `;`, pt-BR numbers) →
Blob → browser download.

## Testing

- Serializer emits a leading UTF-8 BOM.
- Numbers use decimal comma; delimiter is `;`; delimiter/quote/newline escaping
  is correct.
- Accented characters round-trip correctly when opened in Excel.

## Risks

- If a future locale needs comma-decimal + comma-delimiter, the delimiter choice
  must be revisited. Acceptable for the current pt-BR scope.

## Open Items

- Confirm whether any non-pt-BR users need a different delimiter/locale.
