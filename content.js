// Finds the company name on supported job sites and injects a green/red
// H-1B sponsorship badge right under it (single "detail pane" view), and
// also badges every job card in the results list with a compact inline badge.

const BADGE_ATTR = 'data-h1b-badge'
const FOR_ATTR = 'data-h1b-for'

/** Each entry returns the element whose text is the company name, or null. */
const SITE_SELECTORS = {
  'www.linkedin.com': [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    '[data-tracking-control-name="public_jobs_topcard-org-name"]',
    '.topcard__org-name-link',
  ],
  'www.indeed.com': [
    '[data-testid="inline-company-name"]',
    '.jobsearch-CompanyInfoContainer a',
    '.jobsearch-CompanyInfoContainer',
  ],
  'smartapply.indeed.com': [
    '[data-testid="inline-company-name"]',
    '.jobsearch-CompanyInfoContainer a',
  ],
  'www.glassdoor.com': [
    '[data-test="employer-name"]',
    '.EmployerProfile_employerNameHeading__bXBYr',
    '[data-test="employerName"]',
  ],
}

/** Job-list ("left rail") item + company-name-within-item selectors. Verified live
 * against LinkedIn's classic job search; Indeed/Glassdoor are best-effort and may
 * need adjustment if their markup differs. */
const LIST_SELECTORS = {
  'www.linkedin.com': {
    item: 'li[data-occludable-job-id]',
    company: '.artdeco-entity-lockup__subtitle',
  },
  'www.indeed.com': {
    item: '.job_seen_beacon, .jobsearch-ResultsList > li',
    company: '[data-testid="company-name"]',
  },
  'smartapply.indeed.com': {
    item: '.job_seen_beacon, .jobsearch-ResultsList > li',
    company: '[data-testid="company-name"]',
  },
  'www.glassdoor.com': {
    item: 'li[data-test="jobListing"]',
    company: '[data-test="employer-short-name"]',
  },
}

function findCompanyElement() {
  const selectors = SITE_SELECTORS[location.hostname]
  if (!selectors) return null
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el && el.textContent.trim()) return el
  }
  return null
}

function formatYearRange(years) {
  if (!years || years.length === 0) return ''
  const min = years[0]
  const max = years[years.length - 1]
  return min === max ? `FY${min}` : `FY${min}–${max}`
}

function describeSponsor(result) {
  const parts = []
  if (result.uscisYears.length) {
    parts.push(
      `approved petitions ${formatYearRange(result.uscisYears)}` +
        (result.approvals ? ` (${result.approvals.toLocaleString()})` : '')
    )
  }
  if (result.lcaYears.length) {
    parts.push(
      `LCA filed ${formatYearRange(result.lcaYears)}` +
        (result.lcaFilings ? ` (${result.lcaFilings.toLocaleString()})` : '')
    )
  }
  return parts.join('; ')
}

function makeBadge(result) {
  const badge = document.createElement('div')
  badge.setAttribute(BADGE_ATTR, 'true')
  if (result.found) {
    badge.className = 'h1b-badge h1b-badge-green'
    badge.innerHTML = `<span class="h1b-badge-dot"></span> H-1B sponsor &mdash; ${describeSponsor(result)}`
    badge.title =
      'Matched record for "' +
      result.matchedName +
      '" in USCIS approved-petition data (FY2019–2023) and/or DOL LCA filing data ' +
      '(FY2024–2026). May miss subsidiaries or alternate legal names.'
  } else {
    badge.className = 'h1b-badge h1b-badge-red'
    badge.innerHTML = `<span class="h1b-badge-dot"></span> No H-1B record found (USCIS 2019–2023, DOL LCA 2024–2026)`
    badge.title =
      'No matching employer found in USCIS approved-petition data or DOL LCA filing data. This does not ' +
      'guarantee the company has never sponsored — it may file under a different legal name, be a new ' +
      'employer, or sponsor too rarely to appear. Always verify directly with the employer.'
  }
  return badge
}

function injectBadge(companyEl) {
  if (!companyEl) return
  const companyName = companyEl.textContent.trim()
  if (!companyName) return

  // Same element, same company text as last time — already handled, nothing to do.
  if (companyEl.getAttribute(FOR_ATTR) === companyName) return

  // SPA job boards frequently reuse the same DOM node when you click through
  // different listings, so the company text can change under an already-badged
  // element. Clear the stale badge before looking up the new name.
  const stale = companyEl.nextElementSibling
  if (stale && stale.hasAttribute(BADGE_ATTR)) stale.remove()

  companyEl.setAttribute(FOR_ATTR, companyName)

  chrome.runtime.sendMessage({ type: 'lookup', company: companyName }, (result) => {
    if (!result) return
    // The company changed again while this lookup was in flight — drop the stale response.
    if (companyEl.getAttribute(FOR_ATTR) !== companyName) return
    const badge = makeBadge(result)
    companyEl.insertAdjacentElement('afterend', badge)
  })
}

function scan() {
  const el = findCompanyElement()
  if (el) injectBadge(el)
}

// ---- Job list ("left rail") badging ----

function makeListBadge(result) {
  const badge = document.createElement('span')
  badge.setAttribute(BADGE_ATTR, 'true')
  if (result.found) {
    badge.className = 'h1b-list-badge h1b-list-badge-green'
    badge.textContent = 'H-1B sponsor'
    badge.title =
      'Matched "' + result.matchedName + '" — ' + describeSponsor(result) + '. Historical data, not a guarantee.'
  } else {
    badge.className = 'h1b-list-badge h1b-list-badge-red'
    badge.textContent = 'No H-1B record'
    badge.title =
      'No match in USCIS (FY2019–2023) or DOL LCA (FY2024–2026) data. Does not prove the company ' +
      'has never sponsored — it may file under a different legal name.'
  }
  return badge
}

function scanList() {
  const selectors = LIST_SELECTORS[location.hostname]
  if (!selectors) return

  const items = document.querySelectorAll(selectors.item)
  if (items.length === 0) return

  const pending = [] // { companyEl, companyName }
  items.forEach((item) => {
    const companyEl = item.querySelector(selectors.company)
    if (!companyEl) return
    const companyName = companyEl.textContent.trim()
    if (!companyName) return
    if (companyEl.getAttribute(FOR_ATTR) === companyName) return

    const stale = companyEl.parentElement?.querySelector(`[${BADGE_ATTR}]`)
    if (stale) stale.remove()

    companyEl.setAttribute(FOR_ATTR, companyName)
    pending.push({ companyEl, companyName })
  })

  if (pending.length === 0) return

  chrome.runtime.sendMessage(
    { type: 'lookupBatch', companies: pending.map((p) => p.companyName) },
    (results) => {
      if (!results) return
      pending.forEach((p, i) => {
        const result = results[i]
        if (!result) return
        // Company changed again while this lookup was in flight.
        if (p.companyEl.getAttribute(FOR_ATTR) !== p.companyName) return
        const badge = makeListBadge(result)
        p.companyEl.insertAdjacentElement('afterend', badge)
      })
    }
  )
}

function scanAll() {
  scan()
  scanList()
}

scanAll()

// LinkedIn/Indeed/Glassdoor mutate the DOM constantly (virtualized lists, live
// re-renders); debounce so a burst of mutations triggers one scan, not dozens.
let debounceHandle = null
const observer = new MutationObserver(() => {
  clearTimeout(debounceHandle)
  debounceHandle = setTimeout(scanAll, 200)
})
observer.observe(document.body, { childList: true, subtree: true })
