// A stand-in for the deployed Apps Script web app, running the real Code.gs
// against an in-memory sheet. Like Google, a POST to /exec is answered with a
// 302 redirect to a separate URL that returns the JSON, both carrying
// Access-Control-Allow-Origin: *, and there is no CORS preflight support.
//   node mock-apps-script.js <port>
//   POST /exec, GET /exec, GET /__state (sheet contents), POST /__reset
const http = require('http')
const { makeEnv } = require('./fake-gas')

const GUESTS = [
  ['Party', 'First Name', 'Last Name'],
  ['Okello', 'John', 'Okello'],
  ['Okello', 'Guest', 'Okello'],
  ['Flynn', 'Stella', 'Flynn'],
  ['O’Brien', 'Sam', 'O’Brien'],
]

let env
const replies = new Map()
function reset() { env = makeEnv({ sheets: { Guests: GUESTS } }); replies.clear() }
reset()

const port = Number(process.argv[2] || 8790)
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(body) }
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    if (req.method === 'POST' && url.pathname === '/exec') {
      const id = Math.random().toString(36).slice(2)
      replies.set(id, JSON.stringify(env.post(raw)))
      return send(302, '', { Location: '/echo?user_content_key=' + id, 'Access-Control-Allow-Origin': '*' })
    }
    if (req.method === 'GET' && url.pathname === '/echo') {
      const body = replies.get(url.searchParams.get('user_content_key'))
      return body ? send(200, body, { 'Access-Control-Allow-Origin': '*' }) : send(404, '{}')
    }
    if (req.method === 'GET' && url.pathname === '/exec') return send(200, JSON.stringify(env.get()), { 'Access-Control-Allow-Origin': '*' })
    if (url.pathname === '/__state') return send(200, JSON.stringify({ responses: env.book.Responses ? env.book.Responses.rows : null }))
    if (req.method === 'POST' && url.pathname === '/__reset') { reset(); return send(200, '{}') }
    send(405, '{"error":"method not allowed"}')   // includes CORS preflight (OPTIONS)
  })
}).listen(port, '127.0.0.1', () => console.log('mock Apps Script on ' + port))
