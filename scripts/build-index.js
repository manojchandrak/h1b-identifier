#!/usr/bin/env node
// Builds data/sponsor-index.json from the USCIS H-1B Employer Data Hub CSV
// exports in data-source/h1b/ (https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub).
//
// Output format: { "NORMALIZED EMPLOYER NAME": [totalApprovals, ...fiscalYears] }
// e.g. "GOOGLE": [4210, 2019, 2020, 2021, 2022, 2023]
//
// Re-run after dropping newer-year CSVs into data-source/h1b/.

const fs = require('fs')
const path = require('path')

const SOURCE_DIR = path.join(__dirname, '..', 'data-source', 'h1b')
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

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`No source directory at ${SOURCE_DIR}`)
    process.exit(1)
  }
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.csv'))
  if (files.length === 0) {
    console.error(`No CSV files found in ${SOURCE_DIR}`)
    process.exit(1)
  }

  const index = new Map()
  let totalRows = 0

  for (const file of files) {
    const lines = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf-8').split('\n')
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      totalRows++
      const [fyRaw, employerRaw, initApproval, , contApproval] = parseCsvLine(line)
      if (!employerRaw) continue
      const key = normalizeCompanyName(employerRaw)
      if (!key) continue
      const fy = Number(fyRaw)
      const approvals = (Number(initApproval) || 0) + (Number(contApproval) || 0)

      const existing = index.get(key) ?? { years: [], approvals: 0 }
      if (!existing.years.includes(fy)) existing.years.push(fy)
      existing.approvals += approvals
      index.set(key, existing)
    }
  }

  const out = {}
  for (const [key, rec] of index) {
    rec.years.sort((a, b) => a - b)
    out[key] = [rec.approvals, ...rec.years]
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(out))

  console.log(`Parsed ${totalRows} rows from ${files.length} file(s): ${files.join(', ')}`)
  console.log(`Indexed ${index.size} unique employers -> ${OUT_FILE}`)
  console.log(`Output size: ${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)} MB`)
}

main()
