# H1B Identifier

A Chrome extension that flags whether a company has sponsored H-1B visas in the past, using real
records from the [USCIS H-1B Employer Data Hub](https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub).
Shows a green ("H-1B sponsor") or red ("no record found") badge right under the company name on
LinkedIn, Indeed, and Glassdoor job pages, plus a popup where you can look up any company by name.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`h1b-identifier`).
4. Pin it from the puzzle-piece icon in the toolbar so it's easy to reach.

## Use

- **Automatic badge:** open a job posting on LinkedIn, Indeed, or Glassdoor — a green or red
  pill appears under the company name within a second or two.
- **Manual lookup:** click the toolbar icon and type any company name to check it, regardless of
  what site you're on.

## Data source and its limits

The bundled `data/sponsor-index.json` is built from five years of USCIS H-1B Employer Data Hub
CSV exports (fiscal years 2019–2023, `data-source/h1b/*.csv`) — about 269,000 petition
records covering ~121,700 unique employer names. It records, per employer: the fiscal years they
had approved petitions and the total approval count.

**Read the badges as historical signal, not a guarantee:**

- A **green** badge means the exact or a closely-matched employer name appears in USCIS's own
  approval data for FY2019–2023.
- A **red** badge means no match was found — this does **not** prove the company has never
  sponsored. It may file petitions under a different legal entity name (common for large
  companies with many subsidiaries), be a newer employer with no petitions yet, or sponsor too
  rarely to appear cleanly in the export. Company-name matching against messy real-world
  employer-name data is inherently approximate.
- Sponsorship history also isn't a promise of future sponsorship — policies change.

Always confirm directly with the employer for anything you're making a decision on.

### Refreshing the data

USCIS publishes new fiscal-year data periodically. To update:

1. Download the new year's CSV from the
   [H-1B Employer Data Hub](https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub)
   into `data-source/h1b/`.
2. Run `node scripts/build-index.js` to regenerate `data/sponsor-index.json`.
3. Reload the extension in `chrome://extensions`.

## How it works

- `scripts/build-index.js` parses the CSVs, normalizes employer names (strips punctuation, `DBA`
  aliases, and generic corporate suffixes like "Inc"/"LLC"/"Technologies"), and aggregates
  approvals + fiscal years per normalized name into `data/sponsor-index.json`.
- `background.js` (the service worker) loads that JSON once and answers lookup requests from both
  the popup and content script over `chrome.runtime.sendMessage` — direct name match first,
  falling back to a whole-word-subset match (so "Acme Consulting" matches "ACME CONSULTING
  GROUP") rather than fragile substring matching.
- `content.js` finds the company name element on supported job sites and asks the background
  script for a verdict, then injects the badge. It watches for DOM mutations so it keeps working
  as you click through different job listings on these single-page-app sites, including
  re-checking when a site reuses the same DOM element for a different company.
- `popup.html`/`popup.js` is a standalone manual lookup that works on any page.

## Files

- `manifest.json` — MV3 manifest
- `background.js` — loads the index, answers lookup messages
- `content.js` / `content.css` — company-name detection + badge injection
- `popup.html` / `popup.css` / `popup.js` — manual lookup UI
- `data/sponsor-index.json` — generated lookup index (do not hand-edit; regenerate via the
  build script)
- `data-source/h1b/*.csv` — raw USCIS exports the index is built from
- `scripts/build-index.js` — regenerates the index from the CSVs
- `icons/` — toolbar/extension icons
