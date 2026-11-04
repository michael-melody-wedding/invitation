/**
 * RSVP backend for the wedding website, run as a Google Apps Script web app
 * bound to the RSVP spreadsheet. See README.md in this folder for setup.
 *
 * The website POSTs JSON (as text/plain, so browsers send it without a CORS
 * preflight) and gets JSON back:
 *
 *   { action: 'search', first, last }
 *     -> { ok: true, party: { name, guests: [{ id, name }] }, previous }
 *   { action: 'submit', first, last, guests: [...], party: {...} }
 *     -> { ok: true }
 *
 * Errors come back as { ok: false, error } where error is one of:
 *   not_found, ambiguous, busy, closed, invalid, server
 *
 * Guests never see the spreadsheet: the only things anyone can do through
 * the web app URL are the two actions above.
 */

var SHEETS = {
  guests: 'Guests',
  responses: 'Responses',
  settings: 'Settings',
};

var GUEST_HEADERS = ['Party', 'First Name', 'Last Name'];

var RESPONSE_HEADERS = [
  'Submitted At', 'Party', 'Guest', 'Attending', 'Dietary Restrictions',
  'Song Requests', 'Marriage Advice', 'Days Staying', 'Lodging',
  'Room or Cabin Number', 'Submission ID',
];

var SETTING_ROWS = [
  ['Setting', 'Value', 'Notes'],
  ['Notify email', '', 'Optional. Gets an email for every RSVP. Separate several addresses with commas.'],
  ['RSVP deadline', '', 'Optional date. RSVPs are accepted until the end of this day; leave blank for no deadline.'],
];

var DAYS = ['Friday', 'Saturday', 'Sunday'];
var LODGING = ['Cabin', 'Lodge', 'Staying elsewhere'];
var MAX_TEXT = 1000;

/* Limit on guessing names: failed searches across everyone, per 10 minutes */
var MAX_FAILED_SEARCHES = 150;

/* ── Web app entry points ─────────────────────────────────────────────── */

function doGet() {
  return json_({ ok: true, service: 'rsvp' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid' });
  }
  try {
    if (body.action === 'search') return json_(search_(body));
    if (body.action === 'submit') return json_(submit_(body));
    return json_({ ok: false, error: 'invalid' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'server' });
  }
}

/* ── Actions ──────────────────────────────────────────────────────────── */

function search_(body) {
  if (isClosed_()) return { ok: false, error: 'closed' };
  var found = findParty_(body);
  if (!found.ok) return found;
  return {
    ok: true,
    party: {
      name: partyDisplayName_(found.guests),
      guests: found.guests.map(function (g) { return { id: g.id, name: g.name }; }),
    },
    previous: previousAnswers_(found.party, found.guests),
  };
}

function submit_(body) {
  if (isClosed_()) return { ok: false, error: 'closed' };

  /* Look the party up again from the name: never trust a party sent by the page */
  var found = findParty_(body);
  if (!found.ok) return found;

  var byId = {};
  found.guests.forEach(function (g) { byId[g.id] = g; });

  var answers = [];
  var seen = {};
  var list = Array.isArray(body.guests) ? body.guests : [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i] || {};
    var guest = byId[a.id];
    if (!guest || seen[a.id]) return { ok: false, error: 'invalid' };
    if (a.attending !== 'yes' && a.attending !== 'no') return { ok: false, error: 'invalid' };
    seen[a.id] = true;
    var coming = a.attending === 'yes';
    answers.push({
      name: guest.name,
      attending: coming ? 'Yes' : 'No',
      dietary: coming ? text_(a.dietary) : '',
      songs: coming ? text_(a.songs) : '',
      advice: coming ? text_(a.advice) : '',
    });
  }
  if (!answers.length) return { ok: false, error: 'invalid' };

  var anyoneComing = answers.some(function (a) { return a.attending === 'Yes'; });
  var p = body.party || {};
  var days = Array.isArray(p.days) ? p.days : [];
  for (var d = 0; d < days.length; d++) {
    if (DAYS.indexOf(days[d]) < 0) return { ok: false, error: 'invalid' };
  }
  var lodging = p.lodging || '';
  if (lodging && LODGING.indexOf(lodging) < 0) return { ok: false, error: 'invalid' };
  var party = anyoneComing
    ? {
        days: DAYS.filter(function (day) { return days.indexOf(day) >= 0; }).join(', '),
        lodging: lodging,
        room: text_(p.room, 100),
      }
    : { days: '', lodging: '', room: '' };

  var now = new Date();
  var submissionId = Utilities.getUuid();
  var rows = answers.map(function (a) {
    return [
      now, found.party, a.name, a.attending, a.dietary, a.songs, a.advice,
      party.days, party.lodging, party.room, submissionId,
    ].map(cell_);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_(SHEETS.responses, RESPONSE_HEADERS);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }

  notify_(found.party, answers, party);
  return { ok: true };
}

/* ── Guest list lookup ────────────────────────────────────────────────── */

function findParty_(body) {
  var first = norm_(body.first);
  var last = norm_(body.last);
  if (!first || !last) return { ok: false, error: 'invalid' };

  if (failedSearches_() >= MAX_FAILED_SEARCHES) return { ok: false, error: 'busy' };

  var all = readGuests_();
  var parties = {};
  all.forEach(function (g) {
    if (g.first === first && g.last === last) parties[g.party] = true;
  });
  var names = Object.keys(parties);
  if (names.length === 0) {
    countFailedSearch_();
    return { ok: false, error: 'not_found' };
  }
  if (names.length > 1) return { ok: false, error: 'ambiguous' };

  var party = names[0];
  var guests = all.filter(function (g) { return g.party === party; });
  return { ok: true, party: party, guests: guests };
}

function readGuests_() {
  var values = sheet_(SHEETS.guests, GUEST_HEADERS).getDataRange().getValues();
  var col = headerIndex_(values[0], GUEST_HEADERS);
  var guests = [];
  var ids = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var party = String(row[col['Party']] || '').trim();
    var firstName = String(row[col['First Name']] || '').trim();
    var lastName = String(row[col['Last Name']] || '').trim();
    if (!party || !firstName) continue;
    var id = 'g' + hash_(party + '|' + firstName + '|' + lastName);
    if (ids[id]) continue;   // the same guest listed twice in one party
    ids[id] = true;
    guests.push({
      id: id,
      party: party,
      name: (firstName + ' ' + lastName).trim(),
      first: norm_(firstName),
      last: norm_(lastName),
    });
  }
  return guests;
}

/* The latest answer for each guest in the party, so a returning guest can
   see and update what they sent before. */
function previousAnswers_(party, guests) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.responses);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getDataRange().getValues();
  var col = headerIndex_(values[0], RESPONSE_HEADERS);
  var byName = {};
  guests.forEach(function (g) { byName[g.name] = g.id; });

  var latest = {};
  var partyRow = null;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[col['Party']]) !== party) continue;
    var id = byName[String(row[col['Guest']])];
    if (!id) continue;
    latest[id] = row;   // rows are appended in order, so later rows win
    partyRow = row;
  }
  if (!partyRow) return null;

  var out = { guests: {}, party: {}, submittedAt: dateString_(partyRow[col['Submitted At']]) };
  Object.keys(latest).forEach(function (id) {
    var row = latest[id];
    out.guests[id] = {
      attending: String(row[col['Attending']]) === 'Yes' ? 'yes' : 'no',
      dietary: plain_(row[col['Dietary Restrictions']]),
      songs: plain_(row[col['Song Requests']]),
      advice: plain_(row[col['Marriage Advice']]),
    };
  });
  out.party = {
    days: String(partyRow[col['Days Staying']] || '').split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return DAYS.indexOf(s) >= 0; }),
    lodging: LODGING.indexOf(String(partyRow[col['Lodging']])) >= 0 ? String(partyRow[col['Lodging']]) : '',
    room: plain_(partyRow[col['Room or Cabin Number']]),
  };
  return out;
}

/* ── Settings, notifications, limits ──────────────────────────────────── */

function setting_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.settings);
  if (!sheet) return '';
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim().toLowerCase() === name.toLowerCase()) return values[r][1];
  }
  return '';
}

function isClosed_() {
  var deadline = setting_('RSVP deadline');
  if (!deadline) return false;
  var end = deadline instanceof Date ? new Date(deadline.getTime()) : new Date(String(deadline));
  if (isNaN(end.getTime())) return false;
  end.setHours(23, 59, 59, 999);
  return new Date() > end;
}

function notify_(party, answers, details) {
  var to = String(setting_('Notify email') || '').trim();
  if (!to) return;
  var lines = answers.map(function (a) {
    return a.name + ': ' + (a.attending === 'Yes' ? 'attending' : 'not attending') +
      (a.dietary ? '\n  Dietary: ' + a.dietary : '') +
      (a.songs ? '\n  Songs: ' + a.songs : '') +
      (a.advice ? '\n  Advice: ' + a.advice : '');
  });
  if (details.days || details.lodging || details.room) {
    lines.push('', 'Days staying: ' + (details.days || '-'),
      'Lodging: ' + (details.lodging || '-'), 'Room or cabin: ' + (details.room || '-'));
  }
  try {
    MailApp.sendEmail(to, 'RSVP from ' + party, lines.join('\n'));
  } catch (err) {
    console.error('RSVP email failed: ' + err);   // the RSVP itself is already saved
  }
}

function failedSearches_() {
  return Number(CacheService.getScriptCache().get(failKey_()) || 0);
}

function countFailedSearch_() {
  var cache = CacheService.getScriptCache();
  cache.put(failKey_(), String(failedSearches_() + 1), 600);
}

function failKey_() {
  return 'failed:' + Math.floor(Date.now() / 600000);
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/* Lower case, no accents, letters and digits only: "O’Brien" == "obrien" */
function norm_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function text_(value, max) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max || MAX_TEXT);
}

/* Text a guest typed must never become a formula in the sheet */
function cell_(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

/* Sheets keeps the apostrophe cell_ adds as a text marker, not as part of
   the value, so answers read back exactly as the guest typed them */
function plain_(value) {
  return String(value == null ? '' : value);
}

function dateString_(value) {
  return value instanceof Date ? value.toISOString() : String(value || '');
}

function hash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.slice(0, 6).map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function partyDisplayName_(guests) {
  var firsts = guests.map(function (g) { return g.name.split(' ')[0]; });
  if (firsts.length <= 2) return firsts.join(' & ');
  return firsts.slice(0, -1).join(', ') + ' & ' + firsts[firsts.length - 1];
}

function headerIndex_(header, names) {
  var col = {};
  names.forEach(function (name) {
    var i = header.map(function (h) { return String(h).trim(); }).indexOf(name);
    if (i < 0) throw new Error('Missing column "' + name + '" in the ' + header.join(', ') + ' header row');
    col[name] = i;
  });
  return col;
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── One-time setup: run this once from the Apps Script editor ────────── */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var guests = sheet_(SHEETS.guests, GUEST_HEADERS);
  if (guests.getLastRow() < 2) {
    guests.getRange(2, 1, 2, GUEST_HEADERS.length).setValues([
      ['Michael & Melody', 'Michael', 'Example'],
      ['Michael & Melody', 'Melody', 'Example'],
    ]);
  }
  sheet_(SHEETS.responses, RESPONSE_HEADERS);
  if (!ss.getSheetByName(SHEETS.settings)) {
    var settings = ss.insertSheet(SHEETS.settings);
    settings.getRange(1, 1, SETTING_ROWS.length, 3).setValues(SETTING_ROWS);
    settings.getRange(1, 1, 1, 3).setFontWeight('bold');
    settings.setFrozenRows(1);
  }
}
