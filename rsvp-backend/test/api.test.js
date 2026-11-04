// Unit tests for Code.gs, run against in-memory fakes of the Google services.
// Run: node --test rsvp-backend/test/
const test = require('node:test')
const assert = require('node:assert/strict')
const { makeEnv } = require('./fake-gas')

const GUESTS = [
  ['Party', 'First Name', 'Last Name'],
  ['Okello', 'John', 'Okello'],
  ['Okello', 'Guest', 'Okello'],
  ['Flynn', 'Stella', 'Flynn'],
  ['O’Brien', 'Sam', 'O’Brien'],
  ['Smith A', 'Alex', 'Smith'],
  ['Smith B', 'Alex', 'Smith'],
  ['Trio', 'Ana', 'Müller'],
  ['Trio', 'Ben', 'Müller'],
  ['Trio', 'Cy', 'Müller'],
]

const env = (extra = {}) => makeEnv({ sheets: { Guests: GUESTS, ...extra } })
const search = (e, first, last) => e.post({ action: 'search', first, last })
const responses = e => e.book.Responses.rows.slice(1)
const col = (e, name) => e.book.Responses.rows[0].indexOf(name)

function submitFor(e, first, last, guests, party = {}) {
  return e.post({ action: 'submit', first, last, guests, party })
}

test('health check', () => {
  assert.deepEqual(env().get(), { ok: true, service: 'rsvp' })
})

test('finds a party by full name, ignoring case, accents and punctuation', () => {
  const e = env()
  for (const [first, last] of [['john', 'okello'], ['  JOHN ', 'Okello'], ['Sam', "O'Brien"], ['sam', 'obrien'], ['Ana', 'Muller'], ['ana', 'MÜLLER']]) {
    const r = search(e, first, last)
    assert.equal(r.ok, true, `${first} ${last}`)
  }
  const r = search(e, 'Guest', 'Okello')
  assert.equal(r.party.name, 'John & Guest')
  assert.deepEqual(r.party.guests.map(g => g.name), ['John Okello', 'Guest Okello'])
  assert.equal(r.previous, null)
  assert.equal(search(e, 'Ben', 'Muller').party.name, 'Ana, Ben & Cy')
})

test('does not find partial names or other people', () => {
  const e = env()
  assert.deepEqual(search(e, 'Jo', 'Okello'), { ok: false, error: 'not_found' })
  assert.deepEqual(search(e, 'John', 'Smith'), { ok: false, error: 'not_found' })
  assert.deepEqual(search(e, 'John', ''), { ok: false, error: 'invalid' })
  assert.deepEqual(search(e, '', 'Okello'), { ok: false, error: 'invalid' })
})

test('two parties with the same guest name are reported, not guessed', () => {
  assert.deepEqual(search(env(), 'Alex', 'Smith'), { ok: false, error: 'ambiguous' })
})

test('a name alone finds the party; old or extra columns in the sheet are ignored', () => {
  const e = makeEnv({ sheets: { Guests: [
    ['Notes', 'Party', 'First Name', 'Last Name', 'Invite Code'],
    ['plus-one TBD', 'Flynn', 'Stella', 'Flynn', 'FLYNN-42'],
    ['', 'Flynn', 'Guest', 'Flynn', ''],
  ] } })
  const r = search(e, 'Stella', 'Flynn')
  assert.equal(r.ok, true)
  assert.deepEqual(r.party.guests.map(g => g.name), ['Stella Flynn', 'Guest Flynn'])
})

test('many failed searches make the service busy', () => {
  const e = env()
  for (let i = 0; i < 150; i++) assert.equal(search(e, 'Nobody', 'Here' + i).error, 'not_found')
  assert.deepEqual(search(e, 'John', 'Okello'), { ok: false, error: 'busy' })
})

test('submit saves one row per guest with the party details', () => {
  const e = env()
  const { party } = search(e, 'John', 'Okello')
  const [john, guest] = party.guests
  const r = submitFor(e, 'John', 'Okello', [
    { id: john.id, attending: 'yes', dietary: 'No nuts', songs: 'September', advice: 'Laugh daily' },
    { id: guest.id, attending: 'no', dietary: 'ignored', songs: 'ignored', advice: 'ignored' },
  ], { days: ['Sunday', 'Friday'], lodging: 'Cabin', room: 'Cabin 12' })
  assert.deepEqual(r, { ok: true })
  const rows = responses(e)
  assert.equal(rows.length, 2)
  const c = name => col(e, name)
  assert.ok(rows[0][c('Submitted At')] instanceof Date)
  assert.equal(rows[0][c('Party')], 'Okello')
  assert.equal(rows[0][c('Guest')], 'John Okello')
  assert.equal(rows[0][c('Attending')], 'Yes')
  assert.equal(rows[0][c('Dietary Restrictions')], 'No nuts')
  assert.equal(rows[0][c('Days Staying')], 'Friday, Sunday', 'days are stored in calendar order')
  assert.equal(rows[0][c('Lodging')], 'Cabin')
  assert.equal(rows[0][c('Room or Cabin Number')], 'Cabin 12')
  assert.equal(rows[1][c('Attending')], 'No')
  assert.equal(rows[1][c('Dietary Restrictions')], '', 'answers of a guest who declines are dropped')
  assert.equal(rows[0][c('Submission ID')], rows[1][c('Submission ID')])
})

test('if nobody is coming, party details are not saved', () => {
  const e = env()
  const { party } = search(e, 'John', 'Okello')
  submitFor(e, 'John', 'Okello', party.guests.map(g => ({ id: g.id, attending: 'no' })), { days: ['Friday'], lodging: 'Lodge', room: '3' })
  for (const row of responses(e)) {
    assert.equal(row[col(e, 'Days Staying')], '')
    assert.equal(row[col(e, 'Lodging')], '')
    assert.equal(row[col(e, 'Room or Cabin Number')], '')
  }
})

test('typed text can never become a spreadsheet formula', () => {
  const e = env()
  const { party } = search(e, 'Sam', 'OBrien')
  submitFor(e, 'Sam', 'OBrien', [{ id: party.guests[0].id, attending: 'yes', songs: '=IMPORTXML("http://x")', dietary: '+1', advice: '-ok' }], { room: '@home' })
  const written = e.book.Responses.written.at(-1)
  for (const v of written) if (typeof v === 'string' && v) assert.ok(!/^[=+\-@]/.test(v), `unsafe cell ${v}`)
  assert.equal(written[col(e, 'Song Requests')], '\'=IMPORTXML("http://x")')
  assert.equal(responses(e)[0][col(e, 'Song Requests')], '=IMPORTXML("http://x")', 'read back as typed')
})

test('long answers are cut to a safe length', () => {
  const e = env()
  const { party } = search(e, 'Sam', 'OBrien')
  submitFor(e, 'Sam', 'OBrien', [{ id: party.guests[0].id, attending: 'yes', advice: 'x'.repeat(5000) }], { room: 'y'.repeat(500) })
  assert.equal(responses(e)[0][col(e, 'Marriage Advice')].length, 1000)
  assert.equal(responses(e)[0][col(e, 'Room or Cabin Number')].length, 100)
})

test('submit re-checks the name instead of trusting the page', () => {
  const e = env()
  const okello = search(e, 'John', 'Okello').party.guests
  const flynn = search(e, 'Stella', 'Flynn').party.guests
  assert.deepEqual(submitFor(e, 'Not', 'Invited', [{ id: okello[0].id, attending: 'yes' }]), { ok: false, error: 'not_found' })
  assert.deepEqual(submitFor(e, 'John', 'Okello', [{ id: flynn[0].id, attending: 'yes' }]), { ok: false, error: 'invalid' }, 'guest from another party')
  assert.deepEqual(submitFor(e, 'Stella', 'Flynn', [{ id: okello[0].id, attending: 'yes' }]), { ok: false, error: 'invalid' }, 'answers for the Okellos sent under Stella’s name')
  assert.equal(e.book.Responses, undefined, 'nothing was written')
})

test('submit rejects malformed answers', () => {
  const e = env()
  const [john, guest] = search(e, 'John', 'Okello').party.guests
  const bad = [
    [[], {}],
    [[{ id: john.id, attending: 'maybe' }], {}],
    [[{ id: john.id, attending: 'yes' }, { id: john.id, attending: 'no' }], {}],
    [[{ id: john.id, attending: 'yes' }], { days: ['Monday'] }],
    [[{ id: john.id, attending: 'yes' }], { lodging: 'Tent' }],
    [[{ id: 'g000', attending: 'yes' }], {}],
  ]
  for (const [guests, party] of bad) assert.deepEqual(submitFor(e, 'John', 'Okello', guests, party), { ok: false, error: 'invalid' }, JSON.stringify(guests) + JSON.stringify(party))
  assert.equal(submitFor(e, 'John', 'Okello', [{ id: guest.id, attending: 'no' }]).ok, true, 'answering for only part of the party is fine')
})

test('a returning guest gets their latest answers back', () => {
  const e = env()
  const [john, guest] = search(e, 'John', 'Okello').party.guests
  submitFor(e, 'John', 'Okello', [
    { id: john.id, attending: 'yes', dietary: 'Vegan', songs: 'Song A', advice: 'A' },
    { id: guest.id, attending: 'yes', dietary: '', songs: '', advice: '' },
  ], { days: ['Saturday'], lodging: 'Lodge', room: '7' })
  submitFor(e, 'John', 'Okello', [{ id: guest.id, attending: 'no' }])
  const prev = search(e, 'Guest', 'Okello').previous
  assert.ok(prev.submittedAt)
  assert.deepEqual(prev.guests[john.id], { attending: 'yes', dietary: 'Vegan', songs: 'Song A', advice: 'A' })
  assert.deepEqual(prev.guests[guest.id], { attending: 'no', dietary: '', songs: '', advice: '' })
  assert.deepEqual(prev.party, { days: [], lodging: '', room: '' }, 'party details come from the latest submission')
  assert.equal(search(e, 'Sam', 'OBrien').previous, null, 'other parties see nothing')
})

test('the RSVP deadline closes the form after that day', () => {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d }
  const settings = v => ({ Settings: [['Setting', 'Value', 'Notes'], ['Notify email', '', ''], ['RSVP deadline', v, '']] })
  assert.equal(search(env(settings(day(-1))), 'John', 'Okello').error, 'closed')
  assert.equal(search(env(settings(day(0))), 'John', 'Okello').ok, true, 'the deadline day itself is still open')
  assert.equal(search(env(settings(day(3))), 'John', 'Okello').ok, true)
  assert.equal(search(env(settings('')), 'John', 'Okello').ok, true)
  const closed = env(settings(day(-1)))
  assert.equal(submitFor(closed, 'John', 'Okello', [{ id: 'x', attending: 'yes' }]).error, 'closed')
})

test('an email goes out for each RSVP when a notify address is set', () => {
  const e = env({ Settings: [['Setting', 'Value', 'Notes'], ['Notify email', 'us@example.com', ''], ['RSVP deadline', '', '']] })
  const [john] = search(e, 'John', 'Okello').party.guests
  submitFor(e, 'John', 'Okello', [{ id: john.id, attending: 'yes', songs: 'September' }], { days: ['Friday'], lodging: 'Lodge', room: '' })
  assert.equal(e.mail.length, 1)
  assert.equal(e.mail[0].to, 'us@example.com')
  assert.equal(e.mail[0].subject, 'RSVP from Okello')
  assert.match(e.mail[0].body, /John Okello: attending\n {2}Songs: September/)
  assert.match(e.mail[0].body, /Days staying: Friday/)
  assert.equal(env().mail.length, 0)
})

test('bad requests and broken sheets fail safely', () => {
  const e = env()
  assert.deepEqual(e.post('not json'), { ok: false, error: 'invalid' })
  assert.deepEqual(e.post({ action: 'delete' }), { ok: false, error: 'invalid' })
  const broken = makeEnv({ sheets: { Guests: [['Party', 'First', 'Last']] } })
  assert.deepEqual(search(broken, 'John', 'Okello'), { ok: false, error: 'server' })
})

// The RSVPs sheet as it was after running the first version of setup
const FIRST_VERSION = () => ({
  Guests: [
    ['Party', 'First Name', 'Last Name', 'Invite Code'],
    ['Michael & Melody', 'Michael', '', ''],
    ['Michael & Melody', 'Melody', 'Example', ''],
  ],
  Responses: [['Submitted At', 'Party', 'Guest', 'Attending', 'Dietary Restrictions', 'Song Requests', 'Marriage Advice', 'Days Staying', 'Lodging', 'Room or Cabin Number', 'Submission ID']],
  Settings: [
    ['Setting', 'Value', 'Notes'],
    ['Notify email', '', 'Optional. Gets an email for every RSVP. Separate several addresses with commas.'],
    ['RSVP deadline', '', 'Optional date. RSVPs are accepted until the end of this day; leave blank for no deadline.'],
  ],
})
const snapshot = e => JSON.stringify(Object.fromEntries(Object.entries(e.book).map(([k, v]) => [k, v.rows])))
function setupTwice(e) {
  const first = e.context.setup()
  const after = snapshot(e)
  const second = e.context.setup()
  assert.deepEqual(Array.from(second), [], 'running setup again changes nothing')
  assert.equal(snapshot(e), after, 'the sheet is identical after the second run')
  assert.match(e.logs.at(-1), /already up to date/)
  return Array.from(first)
}

test('setup on a blank spreadsheet builds everything, with Michael & Melody O’Brien', () => {
  const e = makeEnv({ sheets: {} })
  const changes = setupTwice(e)
  assert.deepEqual(e.book.Guests.rows, [
    ['Party', 'First Name', 'Last Name'],
    ['Michael & Melody', 'Michael', "O'Brien"],
    ['Michael & Melody', 'Melody', "O'Brien"],
  ])
  assert.equal(e.book.Responses.rows.length, 1)
  assert.equal(e.book.Responses.rows[0][0], 'Submitted At')
  assert.deepEqual(e.book.Settings.rows.map(r => r[0]), ['Setting', 'Notify email', 'RSVP deadline'])
  assert.ok(changes.includes('Created the Guests tab') && changes.includes('Added Melody O\'Brien to Guests'))
  const r = search(e, 'Melody', 'OBrien')
  assert.equal(r.ok, true)
  assert.equal(r.party.name, 'Michael & Melody')
})

test('setup fixes the sheet made by the first version: no invite codes, O’Brien last names', () => {
  const e = makeEnv({ sheets: FIRST_VERSION() })
  const settingsBefore = JSON.stringify(e.book.Settings.rows)
  const changes = setupTwice(e)
  assert.deepEqual(changes, [
    'Removed the Invite Code column from Guests',
    'Set Michael’s last name to O\'Brien',
    'Set Melody’s last name to O\'Brien',
  ])
  assert.deepEqual(e.book.Guests.rows, [
    ['Party', 'First Name', 'Last Name'],
    ['Michael & Melody', 'Michael', "O'Brien"],
    ['Michael & Melody', 'Melody', "O'Brien"],
  ])
  assert.equal(e.book.Responses.rows.length, 1, 'Responses untouched')
  assert.equal(JSON.stringify(e.book.Settings.rows), settingsBefore, 'Settings untouched')
  assert.equal(search(e, 'Michael', "O'Brien").ok, true)
})

test('setup keeps real guests, extra columns, replies and settings exactly as they are', () => {
  const e = makeEnv({ sheets: {
    Guests: [
      ['Notes', 'Party', 'Invite Code', 'First Name', 'Last Name', 'Table'],
      ['college friend', 'Okello', 'OK-1', 'John', 'Okello', 4],
      ['', 'Okello', '', 'Guest', 'Okello', 4],
      ['bride', 'Michael & Melody', 'MM', 'Melody', "O'Brien", 1],
    ],
    Responses: [FIRST_VERSION().Responses[0], [new Date('2026-12-01'), 'Okello', 'John Okello', 'Yes', 'Vegan', '', '', 'Friday', 'Cabin', '12', 'abc']],
    Settings: [['Setting', 'Value', 'Notes'], ['Notify email', 'us@example.com', 'x'], ['RSVP deadline', new Date('2027-01-15'), 'y']],
  } })
  const responsesBefore = JSON.stringify(e.book.Responses.rows)
  const settingsBefore = JSON.stringify(e.book.Settings.rows)
  const changes = setupTwice(e)
  assert.deepEqual(changes, ['Removed the Invite Code column from Guests', 'Added Michael O\'Brien to Guests'])
  assert.deepEqual(e.book.Guests.rows, [
    ['Notes', 'Party', 'First Name', 'Last Name', 'Table'],
    ['college friend', 'Okello', 'John', 'Okello', 4],
    ['', 'Okello', 'Guest', 'Okello', 4],
    ['bride', 'Michael & Melody', 'Melody', "O'Brien", 1],
    ['', 'Michael & Melody', 'Michael', "O'Brien", ''],
  ])
  assert.equal(JSON.stringify(e.book.Responses.rows), responsesBefore, 'replies untouched')
  assert.equal(JSON.stringify(e.book.Settings.rows), settingsBefore, 'filled-in settings untouched')
  assert.equal(search(e, 'John', 'Okello').party.name, 'John & Guest')
})

test('setup completes half-made tabs', () => {
  const e = makeEnv({ sheets: {
    Guests: [],
    Settings: [['Setting', 'Value', 'Notes'], ['Notify email', 'us@example.com', '']],
  } })
  const changes = setupTwice(e)
  assert.deepEqual(changes, [
    'Added the column headers to Guests',
    'Added Michael O\'Brien to Guests',
    'Added Melody O\'Brien to Guests',
    'Created the Responses tab',
    'Added the "RSVP deadline" setting',
  ])
  assert.deepEqual(e.book.Guests.rows[0], ['Party', 'First Name', 'Last Name'])
  assert.deepEqual(e.book.Settings.rows[1], ['Notify email', 'us@example.com', ''], 'existing setting kept')
  assert.equal(e.book.Settings.rows[2][0], 'RSVP deadline')
})

test('setup adds a missing required column without disturbing the others', () => {
  const e = makeEnv({ sheets: { Guests: [['Party', 'First Name', 'invite code '], ['Okello', 'John', 'X']] } })
  const changes = setupTwice(e)
  assert.deepEqual(changes.slice(0, 2), ['Removed the Invite Code column from Guests', 'Added the "Last Name" column to Guests'])
  assert.deepEqual(e.book.Guests.rows[0], ['Party', 'First Name', 'Last Name'])
  assert.deepEqual(e.book.Guests.getDataRange().getValues()[1], ['Okello', 'John', ''])
})
