const form = document.getElementById('searchForm')
const input = document.getElementById('companyInput')
const resultEl = document.getElementById('result')

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const company = input.value.trim()
  if (!company) return
  runLookup(company)
})

function runLookup(company) {
  resultEl.className = 'result hidden'
  chrome.runtime.sendMessage({ type: 'lookup', company }, (result) => {
    if (!result) return
    render(company, result)
  })
}

function formatYearRange(years) {
  if (!years || years.length === 0) return ''
  const min = years[0]
  const max = years[years.length - 1]
  return min === max ? `FY${min}` : `FY${min}\u2013${max}`
}

function render(query, result) {
  resultEl.classList.remove('hidden')
  if (result.found) {
    resultEl.className = 'result green'
    const rows = []
    if (result.uscisYears.length) {
      rows.push(
        `<p class="result-detail">USCIS approved petitions: ${formatYearRange(result.uscisYears)}` +
          (result.approvals ? ` (${result.approvals.toLocaleString()} approvals)` : '') +
          `</p>`
      )
    }
    if (result.lcaYears.length) {
      rows.push(
        `<p class="result-detail">DOL LCA filed: ${formatYearRange(result.lcaYears)}` +
          (result.lcaFilings ? ` (${result.lcaFilings.toLocaleString()} filings)` : '') +
          `</p>`
      )
    }
    resultEl.innerHTML = `
      <div class="result-title"><span class="result-dot"></span> H-1B sponsor found</div>
      <p class="result-detail"><strong>${escapeHtml(result.matchedName)}</strong></p>
      ${rows.join('')}
      <p class="result-caveat">Historical data \u2014 not a guarantee of current or future sponsorship.</p>
    `
  } else {
    resultEl.className = 'result red'
    resultEl.innerHTML = `
      <div class="result-title"><span class="result-dot"></span> No H-1B record found</div>
      <p class="result-detail">No match for "${escapeHtml(query)}" in USCIS petition data (FY2019\u20132023) or DOL LCA data (FY2024\u20132026).</p>
      <p class="result-caveat">
        This doesn't prove the company has never sponsored \u2014 it may file under a different
        legal name, be a newer employer, or sponsor too rarely to appear in this export.
      </p>
    `
  }
}

function escapeHtml(s) {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

input.focus()
