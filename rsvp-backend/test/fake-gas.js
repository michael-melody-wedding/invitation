// In-memory stand-ins for the Google Apps Script services Code.gs uses, so the
// real script can run under Node for tests. Only the calls Code.gs makes exist.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const pad = (row, n) => Array.from({ length: n }, (_, j) => (row[j] === undefined ? '' : row[j]))

function makeSheet(name, rows = []) {
  const sheet = {
    name,
    rows: rows.map(r => r.slice()),
    written: [],   // exactly what the script passed to setValues, before Sheets' handling
    // Like Sheets, ranges read back as rectangles, with '' for empty cells
    getDataRange() {
      return { getValues: () => sheet.rows.length ? sheet.rows.map(r => pad(r, sheet.getLastColumn())) : [['']] }
    },
    getLastRow() { return sheet.rows.length },
    getLastColumn() { return Math.max(0, ...sheet.rows.map(r => r.length)) },
    setFrozenRows() {},
    deleteColumn(c) { sheet.rows.forEach(r => r.splice(c - 1, 1)) },
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues() {
          return Array.from({ length: numRows }, (_, i) => pad((sheet.rows[row - 1 + i] || []).slice(col - 1), numCols))
        },
        setValues(values) {
          if (values.length !== numRows || values.some(v => v.length !== numCols)) throw new Error('setValues size mismatch')
          sheet.written.push(...values.map(v => v.slice()))
          values.forEach((v, i) => {
            const r = row - 1 + i
            while (sheet.rows.length <= r) sheet.rows.push([])
            // Like Sheets: a leading apostrophe forces text and is not part of the value
            v.forEach((cell, j) => { sheet.rows[r][col - 1 + j] = typeof cell === 'string' && cell.startsWith("'") ? cell.slice(1) : cell })
          })
          return this
        },
        setFontWeight() { return this },
      }
    },
  }
  return sheet
}

function makeEnv({ sheets = {}, now } = {}) {
  const book = {}
  for (const [name, rows] of Object.entries(sheets)) book[name] = makeSheet(name, rows)
  const cache = new Map()
  const mail = []
  const logs = []
  const env = {
    book, cache, mail, logs,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: name => book[name] || null,
        insertSheet: name => (book[name] = makeSheet(name)),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, String(v)),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (to, subject, body) => mail.push({ to, subject, body }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Apps Script returns signed bytes (-128..127)
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, mime: null, setMimeType(m) { this.mime = m; return this }, getContent() { return this.text } }),
    },
    console: { error: () => {}, log: m => logs.push(String(m)) },
  }
  if (now) {
    const RealDate = Date
    env.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(now) } static now() { return new RealDate(now).getTime() } }
  }
  const context = vm.createContext({ ...env, Math, JSON, String, Number, Array, Object, isNaN, Date: env.Date || Date })
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), context, { filename: 'Code.gs' })
  env.post = body => JSON.parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent())
  env.get = () => JSON.parse(context.doGet().getContent())
  env.context = context
  return env
}

module.exports = { makeEnv }
