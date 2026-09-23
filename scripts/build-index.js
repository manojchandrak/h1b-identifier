#!/usr/bin/env node
// Builds data/sponsor-index.json from two sources:
//  - USCIS H-1B Employer Data Hub CSV exports in data-source/h1b/
//    (https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub) — approved petitions.
//  - DOL OFLC LCA Disclosure Data CSVs in data-source/lca/ (extracted from the official
//    xlsx releases at https://www.dol.gov/agencies/eta/foreign-labor/performance) — H-1B labor
//    condition applications filed with DOL, any case status (Certified, Denied, Withdrawn, etc).
//    An LCA filing precedes an H-1B petition and is a broader, more current sponsorship signal;
//    USCIS's own petition-approval data currently only goes through FY2023.
//
// Output format: { "NORMALIZED EMPLOYER NAME": { a: totalApprovals, ay: [uscisFiscalYears],
//                                                 l: totalLcaFilings, ly: [lcaFiscalYears] } }
//
// Re-run after dropping newer files into data-source/h1b/ or data-source/lca/.

const fs = require('fs')
const path = require('path')

const USCIS_DIR = path.join(__dirname, '..', 'data-source', 'h1b')
const LCA_DIR = path.join(__dirname, '..', 'data-source', 'lca')
const OUT_FILE = path.join(__dirname, '..', 'data', 'sponsor-index.json')

const SUFFIX_WORDS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'lp', 'ltd', 'limited', 'corp',
  'corporation', 'co', 'company', 'plc', 'pc', 'pllc', 'group', 'holdings',
  'technologies', 'technology', 'solutions', 'systems', 'services', 'usa',
  'us', 'na', 'international',
])

// Kept in sync with content.js / popup.js / background.js's copy of this function.
function normalizeCompanyName(name) {
  const withoutDba = name.split(/\bDBA\b/i)[0]
  const cleaned = withoutDba
    .toUpperCase()
    .replace(/[.,'"()]/g, '')
    .replace(/[^A-Z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned.split(' ').filter((w) => !SUFFIX_WORDS.has(w.toLowerCase()))
  return (words.length > 0 ? words.join(' ') : cleaned).trim()
}

function parseCsvLine(line) {
  const fields = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function getRecord(index, key) {
  let rec = index.get(key)
  if (!rec) {
    rec = { approvals: 0, uscisYears: [], lcaFilings: 0, lcaYears: [] }
    index.set(key, rec)
  }
  return rec
}

function main() {
  const index = new Map()

  if (fs.existsSync(USCIS_DIR)) {
    const files = fs.readdirSync(USCIS_DIR).filter((f) => f.endsWith('.csv'))
    let rows = 0
    for (const file of files) {
      const lines = fs.readFileSync(path.join(USCIS_DIR, file), 'utf-8').split('\n')
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        rows++
        const [fyRaw, employerRaw, initApproval, , contApproval] = parseCsvLine(line)
        if (!employerRaw) continue
        const key = normalizeCompanyName(employerRaw)
        if (!key) continue
        const fy = Number(fyRaw)
        const approvals = (Number(initApproval) || 0) + (Number(contApproval) || 0)

        const rec = getRecord(index, key)
        if (!rec.uscisYears.includes(fy)) rec.uscisYears.push(fy)
        rec.approvals += approvals
      }
    }
    console.log(`USCIS: parsed ${rows} rows from ${files.length} file(s): ${files.join(', ')}`)
  } else {
    console.log(`No USCIS source directory at ${USCIS_DIR}, skipping.`)
  }

  if (fs.existsSync(LCA_DIR)) {
    const files = fs.readdirSync(LCA_DIR).filter((f) => f.endsWith('.csv'))
    let rows = 0
    for (const file of files) {
      const lines = fs.readFileSync(path.join(LCA_DIR, file), 'utf-8').split('\n')
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        rows++
        const [fyRaw, employerRaw] = parseCsvLine(line)
        if (!employerRaw) continue
        const key = normalizeCompanyName(employerRaw)
        if (!key) continue
        const fy = Number(fyRaw.replace(/^FY/i, ''))
        if (!fy) continue

        const rec = getRecord(index, key)
        if (!rec.lcaYears.includes(fy)) rec.lcaYears.push(fy)
        rec.lcaFilings++
      }
    }
    console.log(`LCA: parsed ${rows} rows from ${files.length} file(s): ${files.join(', ')}`)
  } else {
    console.log(`No LCA source directory at ${LCA_DIR}, skipping.`)
  }

  const out = {}
  for (const [key, rec] of index) {
    rec.uscisYears.sort((a, b) => a - b)
    rec.lcaYears.sort((a, b) => a - b)
    out[key] = { a: rec.approvals, ay: rec.uscisYears, l: rec.lcaFilings, ly: rec.lcaYears }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(out))

  console.log(`Indexed ${index.size} unique employers -> ${OUT_FILE}`)
  console.log(`Output size: ${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)} MB`)
}

main()
