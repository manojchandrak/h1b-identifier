// Central lookup service. Loads data/sponsor-index.json once per service-worker
// lifetime and answers lookup requests from content.js and popup.js.
//
// Index format: { "NORMALIZED NAME": { a: totalApprovals, ay: [uscisFiscalYears],
//                                       l: totalLcaFilings, ly: [lcaFiscalYears] } }
// a/ay come from USCIS approved-petition data (FY2019-2023); l/ly come from DOL LCA
// filings (any case status), which is broader and reaches further into the present.

const SUFFIX_WORDS = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'lp', 'ltd', 'limited', 'corp',
  'corporation', 'co', 'company', 'plc', 'pc', 'pllc', 'group', 'holdings',
  'technologies', 'technology', 'solutions', 'systems', 'services', 'usa',
  'us', 'na', 'international',
])

// Kept in sync with scripts/build-index.js / content.js / popup.js's copy of this function.
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

let indexPromise = null

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(chrome.runtime.getURL('data/sponsor-index.json')).then((r) => r.json())
  }
  return indexPromise
}

/** Direct key match first, then a whole-word-subset fallback (e.g. "Acme Consulting"
 * matches "ACME CONSULTING GROUP") rather than raw substring containment, which would
 * wrongly match e.g. "Develop" inside "Development Dimensions International". */
function toResult(matchedName, rec) {
  return {
    found: true,
    matchedName,
    approvals: rec.a,
    uscisYears: rec.ay,
    lcaFilings: rec.l,
    lcaYears: rec.ly,
  }
}

async function findSponsor(companyName) {
  const index = await loadIndex()
  const key = normalizeCompanyName(companyName)
  if (!key) return { found: false }

  if (index[key]) {
    return toResult(key, index[key])
  }

  const keyWords = key.split(' ').filter((w) => w.length >= 3)
  // A single generic word (e.g. "Mogul", "Oak") is too weak a signal to fuzzy-match against
  // 150k+ employer names: it previously matched an unrelated company like "FEDERAL MOGUL
  // MOTORPARTS" just because both names contain "MOGUL". Require 2+ distinctive words before
  // attempting the fallback; a single-word query only gets an exact match.
  if (keyWords.length < 2) return { found: false }
  const keyWordSet = new Set(keyWords)

  for (const sponsorKey in index) {
    const sponsorWords = sponsorKey.split(' ').filter((w) => w.length >= 3)
    if (sponsorWords.length === 0) continue
    // The query's words must all appear in the candidate's words, never the reverse ("Acme
    // Consulting" should find "ACME CONSULTING GROUP", but a query for "Oak Ridge National
    // Laboratory" must not match an unrelated employer whose whole name happens to be "OAK").
    if (keyWordSet.size > sponsorWords.length) continue
    const sponsorWordSet = new Set(sponsorWords)
    let allMatch = true
    for (const w of keyWordSet) {
      if (!sponsorWordSet.has(w)) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      return toResult(sponsorKey, index[sponsorKey])
    }
  }

  return { found: false }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'lookup' && typeof msg.company === 'string') {
    findSponsor(msg.company).then(sendResponse)
    return true // keep the message channel open for the async response
  }
  return false
})
