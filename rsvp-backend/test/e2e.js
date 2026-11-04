// End-to-end test of rsvp/ in real browsers against mock-apps-script.js.
//   node e2e.js <path to playwright> <site base URL> <mock API base URL> [screenshot dir]
// e.g. node e2e.js ~/web-clone/node_modules/playwright http://127.0.0.1:8767/invitation/ http://127.0.0.1:8790
const pw = require(process.argv[2])
const [site, apiBase, shots] = process.argv.slice(3)
const rsvpUrl = new URL('rsvp/', site).href
let failures = 0
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++ }

async function state() { return (await fetch(apiBase + '/__state')).json() }
async function resetApi() { await fetch(apiBase + '/__reset', { method: 'POST' }) }

async function newPage(browser, device, endpoint = apiBase + '/exec') {
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  page.errors = []
  // React #418 is the home page's known, harmless hydration warning (seen after "Exit")
  page.on('pageerror', e => /#418/.test(e.message) || page.errors.push(e.message))
  page.on('dialog', d => { page.errors.push('dialog: ' + d.message()); d.dismiss() })
  await page.route('**/rsvp/config.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.RSVP_CONFIG = { endpoint: ${JSON.stringify(endpoint)}, event: { name: 'Wedding Ceremony & Reception', when: 'May 22, 2027 at 3:00 PM' }, contact: 'Michael or Melody' };`,
  }))
  await page.goto(rsvpUrl, { waitUntil: 'networkidle' })
  return page
}

const tap = async (page, locator) => { await locator.scrollIntoViewIfNeeded(); await locator.click() }
const text = page => page.locator('#rsvp').innerText()
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
async function noSideScroll(page, where) {
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  ok(r[0] <= r[1], `${where}: no sideways scrolling (${r[0]} <= ${r[1]})`)
}

async function find(page, first, last) {
  await page.getByLabel('First Name').fill(first)
  await page.getByLabel('Last Name').fill(last)
  await tap(page, page.getByRole('button', { name: 'Search' }))
}

async function run(engine, device, tag) {
  const browser = await pw[engine].launch(engine === 'chromium' ? { chromiumSandbox: true } : {})
  const T = s => `[${tag}] ${s}`
  await resetApi()

  // Before the Apps Script URL is set, the page says so instead of pretending
  {
    const page = await newPage(browser, device, '')
    ok(/Coming soon/i.test(await text(page)) && !(await page.getByLabel('First Name').count()), T('no endpoint: shows "coming soon", no form'))
    await page.context().close()
  }

  const page = await newPage(browser, device)
  await shot(page, `${tag}-1-find`)
  await noSideScroll(page, T('find'))

  // Validation and lookups that fail
  await tap(page, page.getByRole('button', { name: 'Search' }))
  ok(/first and last name/i.test(await text(page)), T('empty search asks for both names'))
  await find(page, 'Nobody', 'Here')
  await page.getByText(/couldn’t find that name/).waitFor()
  ok(true, T('unknown name: "couldn’t find" message'))

  // A name is all it takes: there is never an invite code field
  await find(page, 'Stella', 'Flynn')
  await page.getByText('Will you be joining us?').waitFor()
  ok(/Stella/.test(await text(page)) && !/Select guests/i.test(await text(page)), T('name alone finds the party; a party of one skips choosing guests'))
  ok(!(await page.getByLabel(/invite code/i).count()) && !/invite code/i.test(await page.content()), T('no invite code field or wording anywhere'))
  await tap(page, page.getByRole('button', { name: /Back/ }))
  ok(await page.getByLabel('First Name').inputValue() === 'Stella', T('Back keeps the typed name'))

  // Network trouble shows a message and recovers
  await page.route(apiBase + '/exec', r => r.abort())
  await find(page, 'John', 'Okello')
  await page.getByText(/couldn’t reach the RSVP service/).waitFor()
  ok(true, T('network failure: friendly message'))
  await page.unroute(apiBase + '/exec')

  // Full RSVP: Enter key submits the search
  await page.getByLabel('First Name').fill('john')
  await page.getByLabel('Last Name').fill('OKELLO')
  await page.getByLabel('Last Name').press('Enter')
  await page.getByText('You’re responding for').waitFor()
  ok((await text(page)).includes('John & Guest') && /2\/2/.test(await text(page)), T('party "John & Guest", both selected (2/2)'))
  await shot(page, `${tag}-2-guests`)
  await noSideScroll(page, T('guests'))

  await tap(page, page.getByText('Guest Okello'))
  await tap(page, page.getByText('John Okello'))
  ok(/0\/2/.test(await text(page)), T('unticking guests updates the count'))
  await tap(page, page.getByRole('button', { name: /Start RSVP/ }))
  ok(/at least one guest/i.test(await text(page)), T('no guests selected: asks for one'))
  await tap(page, page.getByText('John Okello'))
  await tap(page, page.getByText('Guest Okello'))
  await tap(page, page.getByRole('button', { name: /Start RSVP/ }))

  await page.getByText('Will you be joining us?').waitFor()
  await tap(page, page.getByRole('button', { name: /Next/ }))
  ok(/Please choose Yes or No for John Okello, Guest Okello/.test(await text(page)), T('attendance: unanswered guests are named'))
  const pills = page.locator('.rsvp-guest')
  await tap(page, pills.nth(0).getByText('Yes', { exact: true }))
  await tap(page, pills.nth(1).getByText('No', { exact: true }))
  await shot(page, `${tag}-3-attendance`)
  await noSideScroll(page, T('attendance'))
  await tap(page, page.getByRole('button', { name: /Next/ }))

  await page.getByText('Any preferences we should know about?').waitFor()
  const details = await text(page)
  ok(details.includes('John Okello') && !details.includes('Guest Okello'), T('details only for guests who are coming'))
  await page.locator('#dietary-0').fill('No nuts')
  await page.locator('#songs-0').fill('<img src=x onerror=alert(1)> September')
  await page.locator('#advice-0').fill('Never go to bed angry.\nLaugh daily.')
  await tap(page, page.getByText('Saturday', { exact: true }))
  await tap(page, page.getByText('Friday', { exact: true }))
  await tap(page, page.getByText('Cabin', { exact: true }))
  await page.locator('#room').fill('Cabin 12')
  await shot(page, `${tag}-4-details`)
  await noSideScroll(page, T('details'))
  await tap(page, page.getByRole('button', { name: /Next/ }))

  await page.getByText('Almost there').waitFor()
  const review = await text(page)
  ok(review.includes('<img src=x onerror=alert(1)> September'), T('review shows typed text literally (no HTML injection)'))
  ok(/Days staying\s*Friday, Saturday/.test(review) && /Lodging\s*Cabin/.test(review) && /Room or cabin number\s*Cabin 12/.test(review), T('review shows party details'))
  ok(/Guest Okello[\s\S]*No/.test(review), T('review shows the guest who declined'))
  await shot(page, `${tag}-5-review`)
  await noSideScroll(page, T('review'))
  // Back and forward keeps answers
  await tap(page, page.getByRole('button', { name: /Back/ }))
  ok(await page.locator('#room').inputValue() === 'Cabin 12' && await page.locator('#dietary-0').inputValue() === 'No nuts', T('Back from review keeps the answers'))
  await tap(page, page.getByRole('button', { name: /Next/ }))
  await tap(page, page.getByRole('button', { name: /Submit RSVP/ }))
  await page.getByText('Thank you!').waitFor()
  ok(/can’t wait to celebrate/.test(await text(page)), T('saved: thank-you message'))
  await shot(page, `${tag}-6-done`)

  let rows = (await state()).responses
  const head = rows[0], col = n => head.indexOf(n)
  const john = rows.find(r => r[col('Guest')] === 'John Okello'), guest = rows.find(r => r[col('Guest')] === 'Guest Okello')
  ok(rows.length === 3, T('sheet: one row per guest'))
  ok(john && john[col('Attending')] === 'Yes' && john[col('Dietary Restrictions')] === 'No nuts' && john[col('Days Staying')] === 'Friday, Saturday' && john[col('Lodging')] === 'Cabin' && john[col('Room or Cabin Number')] === 'Cabin 12', T('sheet: John’s answers saved'))
  ok(john && john[col('Marriage Advice')] === 'Never go to bed angry.\nLaugh daily.', T('sheet: multi-line advice kept'))
  ok(guest && guest[col('Attending')] === 'No', T('sheet: Guest saved as not attending'))

  // Coming back: answers are filled in and can be changed
  await tap(page, page.getByRole('button', { name: 'Return to search' }))
  await find(page, 'Guest', 'Okello')
  await page.getByText('We already have your RSVP').waitFor()
  ok(true, T('returning guest: "we already have your RSVP" note'))
  await tap(page, page.getByRole('button', { name: /Start RSVP/ }))
  ok(await pills.nth(0).getByLabel('Yes').isChecked() && await pills.nth(1).getByLabel('No').isChecked(), T('returning guest: attendance pre-filled'))
  await tap(page, pills.nth(1).getByText('Yes', { exact: true }))
  await tap(page, page.getByRole('button', { name: /Next/ }))
  ok(await page.locator('#dietary-0').inputValue() === 'No nuts' && await page.locator('#room').inputValue() === 'Cabin 12', T('returning guest: details pre-filled'))
  await page.locator('#dietary-1').fill('Vegetarian')
  await tap(page, page.getByRole('button', { name: /Next/ }))
  await tap(page, page.getByRole('button', { name: /Submit RSVP/ }))
  await page.getByText('Thank you!').waitFor()
  rows = (await state()).responses
  const latestGuest = rows.filter(r => r[col('Guest')] === 'Guest Okello').at(-1)
  ok(rows.length === 5 && latestGuest[col('Attending')] === 'Yes' && latestGuest[col('Dietary Restrictions')] === 'Vegetarian', T('update: new rows added, earlier ones kept'))

  // Everyone declines: no details step
  await tap(page, page.getByRole('button', { name: 'Return to search' }))
  await find(page, 'Sam', "O'Brien")
  await page.getByText('Will you be joining us?').waitFor()
  await tap(page, page.locator('.rsvp-guest').first().getByText('No', { exact: true }))
  await tap(page, page.getByRole('button', { name: /Next/ }))
  await page.getByText('Almost there').waitFor()
  ok(!/Party details/.test(await text(page)), T('nobody coming: details skipped, no party details'))
  await tap(page, page.getByRole('button', { name: /Submit RSVP/ }))
  await page.getByText('Thank you!').waitFor()
  ok(/We’ll miss you/.test(await text(page)), T('nobody coming: "we’ll miss you" message'))

  // Exit goes back to the website
  await tap(page, page.getByRole('link', { name: 'Exit RSVP' }))
  await page.waitForURL(u => u.href === site)
  ok(true, T('Exit returns to the website'))

  ok(page.errors.length === 0, T('no script errors or dialogs ' + page.errors.join(' | ')))
  await browser.close()
}

;(async () => {
  const d = pw.devices
  await run('chromium', { ...d['iPhone 13'] }, 'iphone-chromium')
  await run('webkit', { ...d['iPhone SE'] }, 'iphone-se-webkit')
  await run('chromium', { viewport: { width: 1366, height: 900 } }, 'laptop-chromium')
  await run('firefox', { viewport: { width: 1280, height: 800 } }, 'laptop-firefox')
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(1) })
