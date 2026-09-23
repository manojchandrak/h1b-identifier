// Central lookup service. Loads data/sponsor-index.json once per service-worker
// lifetime and answers lookup requests from content.js and popup.js.
//
// Index format: { "NORMALIZED NAME": [totalApprovals, ...fiscalYears] }

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
async function findSponsor(companyName) {
  const index = await loadIndex()
  const key = normalizeCompanyName(companyName)
  if (!key) return { found: false }

  if (index[key]) {
    const [approvals, ...years] = index[key]
    return { found: true, matchedName: key, approvals, years }
  }

  const keyWords = key.split(' ').filter((w) => w.length >= 3)
  if (keyWords.length === 0) return { found: false }
  const keyWordSet = new Set(keyWords)

  for (const sponsorKey in index) {
    const sponsorWords = sponsorKey.split(' ').filter((w) => w.length >= 3)
    if (sponsorWords.length === 0) continue
    const sponsorWordSet = new Set(sponsorWords)
    const [smaller, larger] =
      keyWordSet.size <= sponsorWordSet.size ? [keyWordSet, sponsorWordSet] : [sponsorWordSet, keyWordSet]
    let allMatch = true
    for (const w of smaller) {
      if (!larger.has(w)) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      const [approvals, ...years] = index[sponsorKey]
      return { found: true, matchedName: sponsorKey, approvals, years }
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
