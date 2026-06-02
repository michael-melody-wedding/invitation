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
  ];

  /* ── Wax seal SVG ───────────────────────────────── */
  var SEAL_SVG = [
    '<svg class="ei-seal-svg" viewBox="0 0 54 54" xmlns="http://www.w3.org/2000/svg">',
    '  <defs>',
    '    <radialGradient id="ei-seal-grad" cx="42%" cy="38%">',
    '      <stop offset="0%"   stop-color="#b87840"/>',
    '      <stop offset="100%" stop-color="#7a4a1e"/>',
    '    </radialGradient>',
    '  </defs>',
    /* jagged wax-blob shape */
    '  <polygon points="27,2 31.5,8 38,5 40,12 47,11 47,18 54,20 51,27 54,34 47,36 47,43 40,42 38,49 31.5,46 27,52 22.5,46 16,49 14,42 7,43 7,36 0,34 3,27 0,20 7,18 7,11 14,12 16,5 22.5,8" fill="url(#ei-seal-grad)"/>',
    /* inner ring */
    '  <circle cx="27" cy="27" r="17" fill="none" stroke="rgba(255,240,200,0.35)" stroke-width="1"/>',
    /* monogram */
    '  <text x="27" y="33" text-anchor="middle" font-family="Georgia,serif" font-style="italic"',
    '        font-size="16" fill="rgba(255,248,225,0.92)" letter-spacing="1">M</text>',
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

          '<div class="ei-env-container" id="ei-envelope">' +
            /* body */
            '<div class="ei-body">' +
              '<div class="ei-fold-left"></div>' +
              '<div class="ei-fold-right"></div>' +
              '<div class="ei-fold-bottom"></div>' +
            '</div>' +

            /* letter card — rises when open */
            '<div class="ei-letter">' +
              '<p class="ei-letter-ornament">— ✦ —</p>' +
              '<p class="ei-letter-invite">request the pleasure of your company</p>' +
              '<div class="ei-letter-rule"></div>' +
              '<p class="ei-letter-names">Michael &amp; Melody</p>' +
              '<div class="ei-letter-rule"></div>' +
              '<p class="ei-letter-date">May 22, 2027</p>' +
            '</div>' +

            /* flap */
            '<div class="ei-flap-perspective">' +
              '<div class="ei-flap" id="ei-flap">' +
                '<div class="ei-flap-front"></div>' +
                '<div class="ei-flap-back"></div>' +
              '</div>' +
            '</div>' +

            /* wax seal */
            '<div class="ei-seal" id="ei-seal">' + SEAL_SVG + '</div>' +
          '</div>' +

          '<div class="ei-btn-wrap">' +
            '<button class="ei-open-btn" id="ei-open-btn">Open invitation</button>' +
            '<button class="ei-enter-btn" id="ei-enter-btn">Enter</button>' +
          '</div>' +
        '</div>' +
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

    /* Open envelope */
    function openEnvelope() {
      if (envelope.classList.contains('ei-open')) return;

      scene.classList.add('ei-opening');
      openBtn.style.opacity = '0';
      openBtn.style.pointerEvents = 'none';

      /* Seal disappears first */
      envelope.classList.add('ei-open');

      /* Show enter button after letter has risen */
      setTimeout(function () {
        enterBtn.classList.add('ei-visible');
      }, 1400);
    }

    openBtn.addEventListener('click', openEnvelope);
    envelope.addEventListener('click', function () {
      if (!envelope.classList.contains('ei-open')) openEnvelope();
    });

    /* Enter site */
    function enterSite() {
      var existing = document.querySelector('[data-testid="envelope-introduction"]');

      /* Fade out scene content for immediate visual feedback. */
      scene.style.transition = 'opacity 400ms ease';
      scene.style.opacity = '0';

      /* Click the React button while everything is still visible so the
         synthetic event fires reliably on mobile. */
      var siteBtn = existing && existing.querySelector('button');
      if (siteBtn) {
        siteBtn.click();
      }

      /* Always run cleanup unconditionally — belt-and-suspenders in case
         the React click handler did not fire (common on mobile). */
      setTimeout(function () {
        document.documentElement.classList.remove('envelope-active');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.body.style.overscrollBehavior = '';
        try { window.history.scrollRestoration = 'auto'; } catch (e) {}
        if (window.__lenis__) {
          window.__lenis__.resize && window.__lenis__.resize();
          window.__lenis__.start && window.__lenis__.start();
        }
        window.dispatchEvent(new Event('resize'));
      }, 100);

      /* Wait for the React envelope-introduction transition (1700 ms) to
         complete before revealing the site — the garden background scales
         from tiny to full during that window and would otherwise show
         through the fading overlay as a brownish full-screen image.
         Use a fast 400 ms fade so the total feel is still snappy. */
      setTimeout(function () {
        overlay.style.transition = 'opacity 400ms ease, transform 400ms ease';
        overlay.classList.add('ei-exiting');
      }, 1300);

      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 1300 + 500);
    }

    enterBtn.addEventListener('click', enterSite);
  }

  /* ── Inject after React's re-render is done ─────────────────────────
     The static export triggers React error #418 (text mismatch) which
     causes a full client re-render that clears <html> children at ~334 ms
     after DOMContentLoaded; the last mutation lands at ~546 ms.
     We wait for window.load then pad 650 ms to clear that window.
     Meanwhile html.ei-loading::before (CSS pseudo-element) covers the
     existing tunnel so the user sees a blank cream screen instead. */
  function launch() {
    setTimeout(function () {
      window.__eiStopLoading && window.__eiStopLoading();
      document.documentElement.classList.remove('ei-loading');
      init();
    }, 650);
  }

  if (document.readyState === 'complete') {
    launch();
  } else {
    window.addEventListener('load', launch);
  }
})();
