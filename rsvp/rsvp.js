/* RSVP flow: find your invitation → choose guests → attendance → details →
   review → saved. Talks to the Google Apps Script in rsvp-backend/Code.gs. */
(function () {
  'use strict';

  var config = window.RSVP_CONFIG || {};
  var root = document.getElementById('rsvp');
  var email = config.email || '';
  var contact = (config.contact || 'us') + (email ? ' at ' + email : '');
  var event = config.event || { name: 'Wedding', when: '' };

  var DAYS = ['Friday', 'Saturday', 'Sunday'];
  var LODGING = ['Cabin', 'Lodge', 'Staying elsewhere'];

  var ERRORS = {
    not_found: 'We couldn’t find that name. Please enter your first and last name exactly as they appear on your invitation.',
    ambiguous: 'More than one invitation matches that name. Please reach out to ' + contact + ' and we’ll sort it out.',
    busy: 'The RSVP service is busy right now. Please try again in a few minutes.',
    closed: 'RSVPs are now closed. Please reach out to ' + contact + ' if you need to make a change.',
    invalid: 'Something in your RSVP didn’t go through. Please check your answers and try again.',
    network: 'We couldn’t reach the RSVP service. Please check your connection and try again.',
  };

  var state;
  function reset() {
    state = {
      step: 'find',
      first: '', last: '',
      party: null, previous: null,
      selected: {},
      answers: {},
      details: { days: [], lodging: '', room: '' },
      message: '',
      busy: false,
    };
  }

  /* ── Talking to the backend ───────────────────────────────── */

  function api(payload) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller && setTimeout(function () { controller.abort(); }, 25000);
    /* text/plain keeps this a "simple" request: Apps Script can't answer a
       CORS preflight, but its reply to a plain POST is readable */
    return fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || typeof data.ok !== 'boolean') throw new Error('Bad reply');
      return data;
    }).catch(function () {
      return { ok: false, error: 'network' };
    }).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    });
  }

  function errorText(code) {
    return ERRORS[code] || ERRORS.network;
  }

  /* ── Small DOM helpers (text always goes in as text, never HTML) ── */

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (function add(children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }

  var ICONS = {
    right: 'M5 12h14M12 5l7 7-7 7',
    left: 'M19 12H5M12 19l-7-7 7-7',
    check: 'M5 13l4 4L19 7',
  };
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', name === 'check' ? '2.5' : '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function goButton(label, opts) {
    opts = opts || {};
    return h('button', {
      type: opts.type || 'button',
      class: 'rsvp-go' + (opts.primary ? ' rsvp-go--primary' : '') + (opts.search ? ' rsvp-go--search' : ''),
      'aria-label': opts.search ? 'Search' : null,
      disabled: state.busy,
      onclick: opts.onclick,
    }, label ? h('span', { text: state.busy && opts.busyLabel ? opts.busyLabel : label }) : null,
      h('span', { class: 'rsvp-go__circle' }, icon('right')));
  }

  function nav(onBack, next) {
    return h('div', { class: 'rsvp-nav' },
      h('button', { type: 'button', class: 'rsvp-back', onclick: onBack, disabled: state.busy }, icon('left'), 'Back'),
      next);
  }

  function progress(n, label) {
    return h('div', { class: 'rsvp-progress' },
      h('div', { class: 'rsvp-progress__labels' }, h('span', { text: n + '/3' }), h('span', { text: label })),
      h('div', { class: 'rsvp-progress__bar' }, h('span', { style: 'width:' + (n / 3 * 100).toFixed(2) + '%' })));
  }

  /* The contact email in a message becomes a mail link */
  function message() {
    var parts = email ? state.message.split(email) : [state.message];
    var children = [];
    parts.forEach(function (part, i) {
      if (i) children.push(h('a', { href: 'mailto:' + email + '?subject=Wedding%20RSVP', text: email }));
      if (part) children.push(part);
    });
    return h('p', { class: 'rsvp-message', role: 'alert' }, children);
  }

  function choice(type, name, value, checked, label, onchange, extraClass) {
    return h('label', { class: 'rsvp-choice' + (extraClass ? ' ' + extraClass : '') },
      h('input', { type: type, name: name, value: value, checked: checked, onchange: onchange }),
      h('span', { text: label }),
      h('span', { class: 'rsvp-choice__mark' }, icon('check')));
  }

  /* ── Steps ────────────────────────────────────────────────── */

  function chosenGuests() {
    return state.party.guests.filter(function (g) { return state.selected[g.id]; });
  }
  function comingGuests() {
    return chosenGuests().filter(function (g) { return state.answers[g.id].attending === 'yes'; });
  }

  function go(step) {
    state.step = step;
    state.message = '';
    render(true);
  }

  function renderUnavailable() {
    root.className = 'rsvp rsvp--center';
    root.replaceChildren(
      h('div', { class: 'rsvp-step' },
        h('h1', { class: 'rsvp-title', text: 'RSVP' }),
        h('p', { class: 'rsvp-kicker', text: 'Coming soon' }),
        h('p', { class: 'rsvp-lede', text: 'Online RSVPs will open here soon. Please check back.' }),
        email ? h('p', { class: 'rsvp-lede' }, 'Questions? Email ',
          h('a', { href: 'mailto:' + email + '?subject=Wedding%20Question', text: email }), '.') : null));
  }

  function renderFind() {
    var first = h('input', { class: 'rsvp-input', type: 'text', name: 'first', placeholder: 'First Name', 'aria-label': 'First Name', autocomplete: 'given-name', value: state.first, required: true });
    var last = h('input', { class: 'rsvp-input', type: 'text', name: 'last', placeholder: 'Last Name', 'aria-label': 'Last Name', autocomplete: 'family-name', value: state.last, required: true });

    var form = h('form', {
      class: 'rsvp-find',
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        if (state.busy) return;
        state.first = first.value.trim();
        state.last = last.value.trim();
        if (!state.first || !state.last) {
          state.message = 'Please enter your first and last name.';
          return render();
        }
        state.busy = true;
        state.message = '';
        render();
        api({ action: 'search', first: state.first, last: state.last }).then(function (res) {
          state.busy = false;
          if (res.ok) return found(res);
          state.message = errorText(res.error);
          render();
          var box = root.querySelector('input[name=first]');
          if (box) box.focus();
        });
      },
    }, first, last, message(),
      h('div', { class: 'rsvp-nav rsvp-nav--plain' }, goButton(null, { type: 'submit', search: true })));

    root.className = 'rsvp rsvp--center';
    root.replaceChildren(
      h('div', { class: 'rsvp-step', tabindex: '-1' },
        h('h1', { class: 'rsvp-title', text: 'RSVP' }),
        h('p', { class: 'rsvp-kicker', text: 'Find Your Invitation' }),
        form));
  }

  function found(res) {
    state.party = res.party;
    state.previous = res.previous || null;
    state.selected = {};
    state.answers = {};
    var prev = state.previous;
    res.party.guests.forEach(function (g) {
      state.selected[g.id] = true;
      var p = prev && prev.guests && prev.guests[g.id];
      state.answers[g.id] = {
        attending: p ? p.attending : '',
        dietary: p ? p.dietary : '',
        songs: p ? p.songs : '',
        advice: p ? p.advice : '',
      };
    });
    state.details = prev && prev.party
      ? { days: prev.party.days.slice(), lodging: prev.party.lodging, room: prev.party.room }
      : { days: [], lodging: '', room: '' };
    go('guests');
  }

  function renderGuests() {
    var guests = state.party.guests;
    var count = h('span');
    function updateCount() {
      count.textContent = chosenGuests().length + '/' + guests.length;
    }
    updateCount();

    var note = null;
    if (state.previous) {
      var when = formatDate(state.previous.submittedAt);
      note = h('p', { class: 'rsvp-note', text: 'We already have your RSVP' + (when ? ' from ' + when : '') + '. Your answers are filled in, so you can change anything that’s different.' });
    }

    root.className = 'rsvp';
    root.replaceChildren(
      h('div', { class: 'rsvp-step', tabindex: '-1' },
        h('p', { class: 'rsvp-kicker', text: 'You’re responding for' }),
        h('h1', { class: 'rsvp-title', text: state.party.name }),
        h('div', { class: 'rsvp-row-head' }, h('span', { text: 'Select guests' }), count),
        note,
        h('div', { class: 'rsvp-choices', role: 'group', 'aria-label': 'Guests you are responding for' },
          guests.map(function (g) {
            return choice('checkbox', 'guest', g.id, !!state.selected[g.id], g.name, function (e) {
              state.selected[g.id] = e.target.checked;
              updateCount();
            }, 'rsvp-choice--guest');
          })),
        message(),
        nav(function () { go('find'); }, goButton('Start RSVP', {
          onclick: function () {
            if (!chosenGuests().length) {
              state.message = 'Please select at least one guest.';
              return render();
            }
            go('attendance');
          },
        }))));
  }

  function renderAttendance() {
    root.className = 'rsvp';
    root.replaceChildren(
      h('div', { class: 'rsvp-step', tabindex: '-1' },
        progress(1, 'Attendance'),
        h('h1', { class: 'rsvp-title', text: 'Events' }),
        h('p', { class: 'rsvp-lede', text: 'Will you be joining us?' }),
        chosenGuests().map(function (g) {
          var a = state.answers[g.id];
          function pill(value, label) {
            return h('label', { class: 'rsvp-pill' },
              h('input', { type: 'radio', name: 'attending-' + g.id, value: value, checked: a.attending === value, onchange: function () { a.attending = value; } }),
              h('span', { text: label }));
          }
          return h('section', { class: 'rsvp-guest' },
            h('h2', { class: 'rsvp-guest__name', text: g.name }),
            h('p', { class: 'rsvp-event__name', text: event.name }),
            h('p', { class: 'rsvp-event__when', text: event.when }),
            h('fieldset', { class: 'rsvp-pills' }, h('legend', { text: g.name + ': ' + event.name }), pill('yes', 'Yes'), pill('no', 'No')));
        }),
        message(),
        nav(function () { go('guests'); }, goButton('Next', {
          onclick: function () {
            var missing = chosenGuests().filter(function (g) { return !state.answers[g.id].attending; });
            if (missing.length) {
              state.message = 'Please choose Yes or No for ' + missing.map(function (g) { return g.name; }).join(', ') + '.';
              return render();
            }
            go(comingGuests().length ? 'details' : 'review');
          },
        }))));
  }

  function field(label, help, control) {
    return h('div', { class: 'rsvp-field' },
      h('label', { class: 'rsvp-field__label', text: label, for: control.id }),
      help ? h('span', { class: 'rsvp-field__help', text: help }) : null,
      control);
  }

  function textBox(id, multi, value, placeholder, max, oninput) {
    return h(multi ? 'textarea' : 'input', {
      class: 'rsvp-text', id: id, type: multi ? null : 'text', value: value,
      placeholder: placeholder, maxlength: String(max), oninput: function (e) { oninput(e.target.value); },
    });
  }

  function renderDetails() {
    var d = state.details;
    var guestCards = comingGuests().map(function (g, i) {
      var a = state.answers[g.id];
      return [
        h('h2', { class: 'rsvp-section-title', text: g.name }),
        h('div', { class: 'rsvp-card' },
          h('div', { class: 'rsvp-event' },
            h('p', { class: 'rsvp-event__name', text: event.name }),
            h('p', { class: 'rsvp-event__when', text: event.when })),
          field('Dietary restrictions', 'Do you have any dietary restrictions?',
            textBox('dietary-' + i, false, a.dietary, 'e.g. Vegetarian, nut allergy', 1000, function (v) { a.dietary = v; })),
          field('Song requests', 'What songs will get you dancing?',
            textBox('songs-' + i, false, a.songs, 'e.g. September', 1000, function (v) { a.songs = v; })),
          field('Marriage advice', 'What is the best marriage advice you’ve heard?',
            textBox('advice-' + i, true, a.advice, '', 1000, function (v) { a.advice = v; }))),
      ];
    });

    var daysGroup = h('div', { class: 'rsvp-choices', role: 'group', 'aria-label': 'Days staying' },
      DAYS.map(function (day) {
        return choice('checkbox', 'days', day, d.days.indexOf(day) >= 0, day, function (e) {
          d.days = DAYS.filter(function (x) {
            return x === day ? e.target.checked : d.days.indexOf(x) >= 0;
          });
        });
      }));
    var lodgingGroup = h('div', { class: 'rsvp-choices', role: 'radiogroup', 'aria-label': 'Lodging' },
      LODGING.map(function (place) {
        return choice('radio', 'lodging', place, d.lodging === place, place, function () { d.lodging = place; }, 'rsvp-choice--lead');
      }));

    root.className = 'rsvp';
    root.replaceChildren(
      h('div', { class: 'rsvp-step', tabindex: '-1' },
        progress(2, 'Details'),
        h('h1', { class: 'rsvp-title', text: 'Details' }),
        h('p', { class: 'rsvp-lede', text: 'Any preferences we should know about?' }),
        guestCards,
        h('hr', { class: 'rsvp-divider' }),
        h('h2', { class: 'rsvp-section-title', text: 'Party details' }),
        h('div', { class: 'rsvp-card' },
          h('div', { class: 'rsvp-field' },
            h('span', { class: 'rsvp-field__label', text: 'Days staying' }),
            h('span', { class: 'rsvp-field__help', text: 'Which days are you planning on staying?' }),
            daysGroup),
          h('div', { class: 'rsvp-field' },
            h('span', { class: 'rsvp-field__label', text: 'Lodging' }),
            h('span', { class: 'rsvp-field__help', text: 'Are you staying at a cabin or the lodge?' }),
            lodgingGroup),
          field('Room or cabin number', 'What room number or cabin number?',
            textBox('room', false, d.room, 'e.g. Cabin 12', 100, function (v) { d.room = v; }))),
        nav(function () { go('attendance'); }, goButton('Next', { onclick: function () { go('review'); } }))));
  }

  function renderReview() {
    function row(label, value, sub) {
      return h('div', { class: 'rsvp-review__row' + (sub ? ' rsvp-review__row--sub' : '') },
        h('dt', { text: label }), h('dd', { text: value }));
    }
    var anyone = comingGuests().length > 0;
    var cards = chosenGuests().map(function (g) {
      var a = state.answers[g.id];
      var yes = a.attending === 'yes';
      return h('section', { class: 'rsvp-review' },
        h('h2', { class: 'rsvp-review__name', text: g.name }),
        h('dl', null,
          row(event.name, yes ? 'Yes' : 'No'),
          yes ? row('Dietary restrictions', a.dietary.trim() || 'None', true) : null,
          yes ? row('Song requests', a.songs.trim() || 'None', true) : null,
          yes ? row('Marriage advice', a.advice.trim() || 'None', true) : null));
    });
    var party = anyone
      ? h('section', { class: 'rsvp-review' },
          h('h2', { class: 'rsvp-review__name', text: 'Party details' }),
          h('dl', null,
            row('Days staying', state.details.days.join(', ') || 'Not sure yet'),
            row('Lodging', state.details.lodging || 'Not sure yet'),
            row('Room or cabin number', state.details.room.trim() || 'None')))
      : null;

    root.className = 'rsvp';
    root.replaceChildren(
      h('div', { class: 'rsvp-step', tabindex: '-1' },
        progress(3, 'Review'),
        h('h1', { class: 'rsvp-title', text: 'Review' }),
        h('p', { class: 'rsvp-lede', text: 'Almost there. Please check your details.' }),
        cards,
        party,
        h('div', { style: 'margin-top:32px' }, message()),
        nav(function () { go(anyone ? 'details' : 'attendance'); }, goButton('Submit RSVP', {
          primary: true,
          busyLabel: 'Sending…',
          onclick: submit,
        }))));
  }

  function submit() {
    if (state.busy) return;
    var anyone = comingGuests().length > 0;
    var payload = {
      action: 'submit',
      first: state.first,
      last: state.last,
      guests: chosenGuests().map(function (g) {
        var a = state.answers[g.id];
        return { id: g.id, attending: a.attending, dietary: a.dietary, songs: a.songs, advice: a.advice };
      }),
      party: anyone ? state.details : { days: [], lodging: '', room: '' },
    };
    state.busy = true;
    state.message = '';
    render();
    api(payload).then(function (res) {
      state.busy = false;
      if (res.ok) {
        state.attending = anyone;
        return go('done');
      }
      state.message = errorText(res.error);
      render();
      var msg = root.querySelector('.rsvp-message');
      if (msg) msg.scrollIntoView({ block: 'center' });
    });
  }

  function renderDone() {
    root.className = 'rsvp rsvp--center';
    root.replaceChildren(
      h('div', { class: 'rsvp-step rsvp-done', tabindex: '-1' },
        h('p', { class: 'rsvp-kicker', text: 'Saved' }),
        h('h1', { class: 'rsvp-title', text: 'Thank you!' }),
        h('p', { class: 'rsvp-lede', text: state.attending
          ? 'We can’t wait to celebrate with you. You can come back anytime to update your RSVP.'
          : 'We’ll miss you, and thank you for letting us know. You can come back anytime to update your RSVP.' }),
        h('button', { type: 'button', class: 'rsvp-link', text: 'Return to search', onclick: function () { reset(); render(true); } })));
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return d.toDateString();
    }
  }

  var STEPS = { find: renderFind, guests: renderGuests, attendance: renderAttendance, details: renderDetails, review: renderReview, done: renderDone };

  /* moved: a new step, so start at the top and move focus to it */
  function render(moved) {
    var active = document.activeElement;
    var focusName = active && root.contains(active) && active.name ? active.name : null;
    STEPS[state.step]();
    if (moved) {
      window.scrollTo(0, 0);
      var step = root.querySelector('.rsvp-step');
      if (step && state.step !== 'find') step.focus({ preventScroll: true });
    } else if (focusName) {
      var again = root.querySelector('[name="' + focusName + '"]');
      if (again && again.type !== 'radio' && again.type !== 'checkbox') again.focus();
    }
  }

  reset();
  if (!config.endpoint) renderUnavailable();
  else render();
})();
