(function () {
  'use strict';

  /* ── Particle config ────────────────────────────── */
  var PARTICLES = [
    { size: 4,  color: '#d4a96a', x: 12,  dur: 18, delay: 0   },
    { size: 3,  color: '#e8c88a', x: 28,  dur: 22, delay: 3   },
    { size: 5,  color: '#c49458', x: 55,  dur: 16, delay: 1   },
    { size: 3,  color: '#dab870', x: 72,  dur: 25, delay: 5   },
    { size: 4,  color: '#c8a060', x: 88,  dur: 20, delay: 2   },
    { size: 2,  color: '#e0c080', x: 40,  dur: 28, delay: 7   },
    { size: 3,  color: '#cca860', x: 18,  dur: 14, delay: 9   },
    { size: 5,  color: '#d8b468', x: 65,  dur: 19, delay: 4   },
    { size: 2,  color: '#e4c878', x: 82,  dur: 23, delay: 11  },
    { size: 4,  color: '#c09050', x: 5,   dur: 17, delay: 6   },
    { size: 3,  color: '#d9b878', x: 47,  dur: 21, delay: 13  },
    { size: 2,  color: '#cfa766', x: 94,  dur: 26, delay: 8   },
  ];

  /* ── Wax seal SVG ───────────────────────────────── */
  /* Irregular wax blob: a circle with a few overlapping wobbles */
  function sealOutline() {
    var points = [];
    for (var i = 0; i < 72; i++) {
      var a = (i / 72) * Math.PI * 2;
      var r = 25 + 1.5 * Math.sin(5 * a) + 1.0 * Math.sin(9 * a + 1) + 0.6 * Math.sin(14 * a + 2);
      points.push((28 + r * Math.cos(a)).toFixed(2) + ',' + (28 + r * Math.sin(a)).toFixed(2));
    }
    return points.join(' ');
  }

  var SEAL_SVG = [
    '<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '  <defs>',
    '    <radialGradient id="ei-wax" cx="38%" cy="32%" r="75%">',
    '      <stop offset="0%"   stop-color="#c48a50"/>',
    '      <stop offset="55%"  stop-color="#985e2c"/>',
    '      <stop offset="100%" stop-color="#6b3a14"/>',
    '    </radialGradient>',
    '    <radialGradient id="ei-wax-press" cx="62%" cy="70%" r="75%">',
    '      <stop offset="0%"   stop-color="#a86b36"/>',
    '      <stop offset="100%" stop-color="#7a4519"/>',
    '    </radialGradient>',
    '  </defs>',
    '  <polygon points="' + sealOutline() + '" fill="url(#ei-wax)"/>',
    /* pressed disc, lit from the opposite side so it reads as stamped in */
    '  <circle cx="28" cy="28" r="17.5" fill="url(#ei-wax-press)"/>',
    '  <circle cx="28" cy="28" r="17.5" fill="none" stroke="rgba(255,226,180,0.35)" stroke-width="0.8"/>',
    '  <circle cx="28" cy="28" r="15.2" fill="none" stroke="rgba(60,28,6,0.4)" stroke-width="0.6" stroke-dasharray="0.9 1.6"/>',
    '  <text x="28" y="31.8" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic"',
    '        font-size="11.5" fill="rgba(255,238,210,0.94)">M&amp;M</text>',
    '  <ellipse cx="19" cy="14.5" rx="6.5" ry="2.6" fill="rgba(255,240,215,0.22)" transform="rotate(-28 19 14.5)"/>',
    '</svg>',
  ].join('');

  /* Fine gold rule with a four-point star, above the names */
  var ORNAMENT_SVG = [
    '<svg class="ei-letter-ornament" viewBox="0 0 120 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '  <defs>',
    '    <linearGradient id="ei-orn-l" x1="0" x2="1"><stop offset="0" stop-color="#c4a473" stop-opacity="0"/><stop offset="1" stop-color="#c4a473"/></linearGradient>',
    '    <linearGradient id="ei-orn-r" x1="1" x2="0"><stop offset="0" stop-color="#c4a473" stop-opacity="0"/><stop offset="1" stop-color="#c4a473"/></linearGradient>',
    '  </defs>',
    '  <rect x="0" y="5.6" width="49" height="0.8" fill="url(#ei-orn-l)"/>',
    '  <rect x="71" y="5.6" width="49" height="0.8" fill="url(#ei-orn-r)"/>',
    '  <circle cx="52.5" cy="6" r="1" fill="#b8915a"/>',
    '  <circle cx="67.5" cy="6" r="1" fill="#b8915a"/>',
    '  <path d="M60 0.8 L61.5 4.5 65.2 6 61.5 7.5 60 11.2 58.5 7.5 54.8 6 58.5 4.5Z" fill="#b8915a"/>',
    '</svg>',
  ].join('');

  /* ── Build overlay HTML ─────────────────────────── */
  function buildHTML() {
    var particles = PARTICLES.map(function (p) {
      return (
        '<div class="ei-particle" style="' +
        'width:' + p.size + 'px;height:' + p.size + 'px;' +
        'background:' + p.color + ';' +
        'left:' + p.x + '%;bottom:-10px;' +
        'animation-duration:' + p.dur + 's;' +
        'animation-delay:' + p.delay + 's;' +
        '"></div>'
      );
    }).join('');

    return (
      '<div id="ei-overlay">' +
        '<div class="ei-particles">' + particles + '</div>' +
        '<div class="ei-scene" id="ei-scene">' +
          '<p class="ei-subtitle" id="ei-subtitle">you are cordially invited</p>' +

          '<div class="ei-env-container" id="ei-envelope" role="button" tabindex="0" aria-label="Open invitation">' +
            /* inside of the envelope back, with its liner */
            '<div class="ei-back"></div>' +

            /* flap — on top while closed, drops behind the letter once open */
            '<div class="ei-flap-wrap">' +
              '<div class="ei-flap" id="ei-flap">' +
                '<div class="ei-flap-face ei-flap-front"></div>' +
                '<div class="ei-flap-face ei-flap-back"></div>' +
                /* wax seal, cracks in two when opened */
                '<div class="ei-seal" id="ei-seal">' +
                  '<div class="ei-seal-half ei-seal-left">' + SEAL_SVG + '</div>' +
                  '<div class="ei-seal-half ei-seal-right">' + SEAL_SVG + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +

            /* letter card — tucked in the pocket until opened */
            '<div class="ei-letter">' +
              ORNAMENT_SVG +
              '<p class="ei-letter-names">Michael <span class="ei-letter-amp">&amp;</span> Melody</p>' +
              '<p class="ei-letter-invite">request the pleasure of your company</p>' +
              '<div class="ei-letter-rule"></div>' +
              '<p class="ei-letter-date">Saturday, May 22, 2027</p>' +
              '<p class="ei-letter-place">Lydia Mountain &middot; Virginia</p>' +
            '</div>' +

            /* front pocket folds, in front of the letter */
            '<div class="ei-pocket">' +
              '<div class="ei-fold-wrap ei-fold-wrap-left"><div class="ei-fold ei-fold-left"></div></div>' +
              '<div class="ei-fold-wrap ei-fold-wrap-right"><div class="ei-fold ei-fold-right"></div></div>' +
              '<div class="ei-fold-wrap ei-fold-wrap-bottom"><div class="ei-fold ei-fold-bottom"></div></div>' +
            '</div>' +
          '</div>' +

          '<div class="ei-btn-wrap">' +
            '<button class="ei-open-btn" id="ei-open-btn">Open invitation</button>' +
          '</div>' +
        '</div>' +
        /* outside the scene so it can sit under the enlarged letter */
        '<button class="ei-enter-btn" id="ei-enter-btn">Enter</button>' +
      '</div>'
    );
  }

  /* ── Animation controller ───────────────────────── */
  function init() {
    /* Inject our overlay as a child of <html>, NOT <body>.
       Next.js App Router owns <body> and will blow away any children
       we add there during its hydration pass.  <html> is safe. */
    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML();
    document.documentElement.appendChild(wrapper.firstChild);

    var overlay   = document.getElementById('ei-overlay');
    var scene     = document.getElementById('ei-scene');
    var envelope  = document.getElementById('ei-envelope');
    var subtitle  = document.getElementById('ei-subtitle');
    var openBtn   = document.getElementById('ei-open-btn');
    var enterBtn  = document.getElementById('ei-enter-btn');

    /* Stagger in — subtitle and open button appear after a beat */
    requestAnimationFrame(function () {
      setTimeout(function () { subtitle.classList.add('ei-visible'); }, 300);
      setTimeout(function () { openBtn.classList.add('ei-visible'); }, 600);
    });

    /* Open envelope: seal cracks → flap swings up → letter slides out of
       the pocket → letter comes forward → Enter appears */
    var opened = false;
    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Work out, for the current window, how far the scene zooms out while
       the letter is pulled out, and where/how big the letter ends up.
       Uses layout boxes (offset*), which ignore the transforms applied. */
    function layout() {
      var vw = overlay.clientWidth, vh = overlay.clientHeight;
      var W = envelope.offsetWidth, H = envelope.offsetHeight;
      var cx = scene.offsetLeft + scene.offsetWidth / 2;
      var cy = scene.offsetTop + scene.offsetHeight / 2;
      var envTop = scene.offsetTop + envelope.offsetTop;
      var envCx = scene.offsetLeft + envelope.offsetLeft + W / 2;

      /* Pulled out, the letter's top sits 0.922 H above the envelope:
         fit that whole stack on screen, centred */
      var zoom = Math.min(1, (vh - 48) / (1.922 * H));
      var stackMid = envTop + 0.039 * H;
      var shift = vh / 2 - (cy + zoom * (stackMid - cy));
      scene.style.setProperty('--ei-zoom', zoom.toFixed(4));
      scene.style.setProperty('--ei-shift', shift.toFixed(1) + 'px');

      /* Final letter: as large as fits, with room for Enter below it */
      var ratio = W / H;
      var cardW = Math.min(vw * 0.92, (vh - 150) * ratio, W);
      var cardH = cardW / ratio;
      var gap = 26, btnH = enterBtn.offsetHeight || 46;
      var top = (vh - (cardH + gap + btnH)) / 2;
      var outX = cx + zoom * (envCx - cx);
      var outY = cy + zoom * (envTop + 0.5 * H - 0.972 * H - cy) + shift;
      var grow = cardW / (0.9 * W * zoom);
      var dx = (vw / 2 - outX) / zoom;
      var dy = (top + cardH / 2 - outY) / zoom;
      envelope.style.setProperty('--ei-letter-front',
        'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px) ' +
        'translateY(-108%) scale(' + grow.toFixed(4) + ')');
      overlay.style.setProperty('--ei-enter-top', (top + cardH + gap).toFixed(1) + 'px');
    }

    window.addEventListener('resize', function () {
      if (opened) layout();
    });

    function openEnvelope() {
      if (opened) return;
      opened = true;

      scene.classList.add('ei-opening');
      openBtn.classList.remove('ei-visible');
      openBtn.style.pointerEvents = 'none';

      var at = reduceMotion ? [0, 0, 0, 0] : [260, 860, 1700, 2450];
      layout();

      envelope.classList.add('ei-seal-broken');
      setTimeout(function () {
        envelope.classList.add('ei-open');
        /* start making room above while the flap swings up, so neither
           the flap nor the rising letter outruns the scene's shift */
        scene.classList.add('ei-stage-out');
      }, at[0]);
      setTimeout(function () {
        envelope.classList.add('ei-letter-out');
      }, at[1]);
      setTimeout(function () {
        envelope.classList.add('ei-letter-front');
      }, at[2]);
      setTimeout(function () {
        enterBtn.classList.add('ei-visible');
      }, at[3]);
    }

    openBtn.addEventListener('click', openEnvelope);
    envelope.addEventListener('click', openEnvelope);
    envelope.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEnvelope();
      }
    });

    /* Enter site */
    function enterSite() {
      overlay.classList.add('ei-exiting');
      dismissReactIntro();

      /* Always run cleanup unconditionally — belt-and-suspenders in case
         the React click handler did not fire (common on mobile). */
      setTimeout(releaseSite, 100);

      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 850);
    }

    /* Tell the site's own (React) intro the guest has entered. On a slow
       phone the guest can get here before React has hydrated, when its
       button has no click handler yet, so keep the intro hidden and retry
       until React is ready (it may also re-render the intro in between). */
    function dismissReactIntro() {
      var tries = 0;
      (function tick() {
        var intro = document.querySelector('[data-testid="envelope-introduction"]');
        var btn = intro && intro.querySelector('button');
        var ready = btn && Object.keys(btn).some(function (k) {
          return k.indexOf('__reactProps') === 0;
        });

        if (ready) {
          /* Click while displayed — clicking a display:none element does
             not reliably fire React's synthetic event handler on mobile.
             Unhide, click and hide in one task, so nothing is painted. */
          intro.style.removeProperty('display');
          btn.click();
        }

        /* Hide straight away so the React component's 1700 ms
           garden-background zoom animation cannot show through the fading
           overlay (iOS overflow:hidden on fixed elements does not always
           clip children reliably). */
        if (intro) intro.style.cssText += 'display:none!important;';

        if (ready) {
          setTimeout(releaseSite, 100);
        } else if (++tries < 300) {
          setTimeout(tick, 200);
        }
      })();
    }

    function releaseSite() {
      document.documentElement.classList.remove('envelope-active');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      try { window.history.scrollRestoration = 'auto'; } catch (e) {}
      if (window.__lenis__) {
        window.__lenis__.resize && window.__lenis__.resize();
        if (window.__lenis__.scrollTo) {
          window.__lenis__.scrollTo(0, { immediate: true });
        }
        window.__lenis__.start && window.__lenis__.start();
      }
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('resize'));
    }

    enterBtn.addEventListener('click', enterSite);
    keepAttached(overlay);
  }

  /* The static export triggers React error #418 (text mismatch), which
     causes a full client re-render that can clear <html> children. On a
     slow phone that happens whenever the JS arrives, so instead of waiting
     for it, put the overlay straight back (same node, so its listeners
     and animation state survive) until the guest has entered the site. */
  function keepAttached(overlay) {
    var root = document.documentElement;
    var watcher = new MutationObserver(function () {
      if (overlay.classList.contains('ei-exiting')) {
        watcher.disconnect();
      } else if (!overlay.isConnected) {
        root.appendChild(overlay);
      }
    });
    watcher.observe(root, { childList: true });
  }

  /* ── Inject as soon as the DOM is ready ─────────────────────────────
     Waiting for window.load meant waiting for every image on the page,
     which on a phone connection left the envelope untappable for up to a
     minute. Until we inject, html.ei-loading::before (CSS pseudo-element)
     covers the existing tunnel so the user sees a blank cream screen. */
  function launch() {
    window.__eiStopLoading && window.__eiStopLoading();
    document.documentElement.classList.remove('ei-loading');
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launch);
  } else {
    launch();
  }
})();
