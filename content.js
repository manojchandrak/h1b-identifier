// Finds the company name on supported job sites and injects a green/red
// H-1B sponsorship badge right under it.

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

function findCompanyElement() {
  const selectors = SITE_SELECTORS[location.hostname]
  if (!selectors) return null
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el && el.textContent.trim()) return el
  }
  return null
}

function makeBadge(result) {
  const badge = document.createElement('div')
  badge.setAttribute(BADGE_ATTR, 'true')
  if (result.found) {
    badge.className = 'h1b-badge h1b-badge-green'
    const years = result.years.join(', ')
    badge.innerHTML =
      `<span class="h1b-badge-dot"></span> H-1B sponsor &mdash; approved petitions in ${years}` +
      (result.approvals ? ` (${result.approvals.toLocaleString()} total)` : '')
    badge.title =
      'Matched USCIS H-1B Employer Data Hub record for "' +
      result.matchedName +
      '". Historical data (fiscal years 2019\u20132023); may miss subsidiaries or alternate legal names.'
  } else {
    badge.className = 'h1b-badge h1b-badge-red'
    badge.innerHTML = `<span class="h1b-badge-dot"></span> No H-1B record found (USCIS data, 2019\u20132023)`
    badge.title =
      'No matching employer found in the USCIS H-1B Employer Data Hub export. This does not guarantee ' +
      'the company has never sponsored \u2014 it may file under a different legal name, be a new employer, ' +
      'or sponsor too rarely to appear. Always verify directly with the employer.'
  }
  return badge
}

function injectBadge(companyEl) {
  if (!companyEl) return
  const companyName = companyEl.textContent.trim()
  if (!companyName) return

  // Same element, same company text as last time \u2014 already handled, nothing to do.
  if (companyEl.getAttribute(FOR_ATTR) === companyName) return

  // SPA job boards frequently reuse the same DOM node when you click through
  // different listings, so the company text can change under an already-badged
  // element. Clear the stale badge before looking up the new name.
  const stale = companyEl.nextElementSibling
  if (stale && stale.hasAttribute(BADGE_ATTR)) stale.remove()

  companyEl.setAttribute(FOR_ATTR, companyName)

  chrome.runtime.sendMessage({ type: 'lookup', company: companyName }, (result) => {
    if (!result) return
    // The company changed again while this lookup was in flight \u2014 drop the stale response.
    if (companyEl.getAttribute(FOR_ATTR) !== companyName) return
    const badge = makeBadge(result)
    companyEl.insertAdjacentElement('afterend', badge)
  })
}

function scan() {
  const el = findCompanyElement()
  if (el) injectBadge(el)
}

scan()

const observer = new MutationObserver(() => scan())
observer.observe(document.body, { childList: true, subtree: true })
