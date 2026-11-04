# RSVP backend (Google Sheets + Apps Script)

The RSVP page (`rsvp/`) saves replies into a Google Sheet through a small
Apps Script web app (`Code.gs`). The sheet stays private in your Google
Drive. Guests look up their invitation by first and last name and send
their answers; that is all the web app lets anyone do.

Until the web app URL is filled in (step 6), the RSVP page tells guests
"Online RSVPs will open here soon."

## Setup (about 10 minutes)

1. **Create the sheet.** In Google Drive, create a blank Google Sheet, e.g.
   "Wedding RSVPs".
2. **Add the script.** In the sheet: **Extensions → Apps Script**. Delete
   the example code in `Code.gs`, paste in everything from
   [`Code.gs`](Code.gs) in this folder, and click **Save**.
3. **Create the tabs.** In the toolbar's function menu pick **`setup`** and
   click **Run**. Google asks for permission the first time: choose your
   account, then **Advanced → Go to (project name)** (the warning appears
   because the script is yours and not reviewed by Google), then **Allow**.
   This creates three tabs: **Guests**, **Responses** and **Settings**.
4. **Fill in the guest list** on the **Guests** tab, one row per person:

   | Party | First Name | Last Name |
   |---|---|---|
   | Okello | John | Okello |
   | Okello | Guest | Okello |
   | Flynn | Stella | Flynn |

   - **Party** groups the people who RSVP together (any label you like). The
     page greets them with their first names, e.g. "John & Guest".
   - Guests search with their **first and last name**. Capitals, accents and
     punctuation don't matter ("O’Brien" = "obrien"), but nicknames do: use
     the names you put on the invitation.
   - For a plus-one without a known name, add a row like `Guest` + the host's
     last name.
   - Extra columns (notes, addresses, table numbers…) are fine; the script
     only reads these three.
   - Delete the two example rows that `setup` added.
5. **Settings** tab (both optional):
   - **Notify email**: who gets an email for every RSVP. Gmail accounts can
     send about 100 of these a day.
   - **RSVP deadline**: a date. RSVPs are accepted until the end of that day,
     then the page says RSVPs are closed.
6. **Publish the web app.** In Apps Script: **Deploy → New deployment →**
   gear icon **→ Web app**. Set **Execute as: Me** and **Who has access:
   Anyone**, then **Deploy**. Copy the **Web app URL** (it ends in `/exec`).
   "Anyone" means anyone can *send requests to the script*; they still
   can't open your sheet.
7. **Connect the website.** Put the URL into [`rsvp/config.js`](../rsvp/config.js):

   ```js
   endpoint: 'https://script.google.com/macros/s/…/exec',
   ```

   then commit and push. To check the URL works, open it in a browser: it
   should show `{"ok":true,"service":"rsvp"}`.

## Reading the responses

Each RSVP adds **one row per guest** to **Responses**, and nothing is ever
overwritten: if a guest updates their RSVP, new rows are added and the
**latest row for each guest is their current answer** (rows from the same
submission share a Submission ID). When a guest searches again, the page fills
in their latest answers so they can change them.

Text guests type is always stored as plain text, never as a formula.

## Changing the script later

After editing `Code.gs` in Apps Script, use **Deploy → Manage deployments →
(pencil) Edit → Version: New version → Deploy**. This keeps the same URL.
Creating a *new deployment* instead gives a new URL, which would then have to
go into `rsvp/config.js`.

## What the page sends

All requests are `POST` with a JSON body sent as `text/plain`, which lets the
browser read Google's reply without a CORS preflight:

- `{ action: 'search', first, last }` returns the party's guests and any
  previous answers.
- `{ action: 'submit', first, last, guests: [...], party: {...} }` saves an
  RSVP. The script looks the party up again from the name, so answers can
  only be saved for guests in that name's party.

There are no invite codes, so anyone who knows a guest's full name could
RSVP for that party. Every reply is kept with a timestamp (nothing is
overwritten), so anything odd is easy to spot and undo. A burst of failed
name searches makes the service answer "busy" for a few minutes.

## Tests

The tests run the real `Code.gs` against in-memory fakes of the Google
services (no Google account needed):

```bash
node --test rsvp-backend/test/api.test.js
```

End-to-end browser tests of the RSVP page against a mock of the deployed
web app (needs Playwright, and the site served at some URL):

```bash
node rsvp-backend/test/mock-apps-script.js 8790 &
node rsvp-backend/test/e2e.js /path/to/node_modules/playwright http://127.0.0.1:8767/invitation/ http://127.0.0.1:8790
```
