#!/usr/bin/env node
/* Builds journey.html: one file holding the plan data and the whole customer
   journey, for reviewing the flow end to end without a server and without
   filling anything in.

   Run:  node build.js

   Generated, not hand-copied, on purpose. A pasted snapshot of four pages is a
   fork that starts rotting the moment anyone edits a real page. This reads the
   real index.html, start.html, thank-you.html and intake.html every time, so
   rebuilding always shows what the site actually does.

   Each stage goes into a <template> and is rendered into an iframe. The four
   pages have colliding CSS: neurohome.css and intake.html's inline styles both
   define :root custom properties, .button-primary, .nav and more. An iframe gives
   each stage the exact styling it has in production with no rescoping and no
   chance of one stage bleeding into another.

   Three things are deliberately broken in the embedded copies, because a review
   artifact must not be able to touch production systems:
     - the two GHL webhook URLs and the intake progress ping are emptied
     - fetch, XHR and sendBeacon are stubbed, so even a URL missed above goes
       nowhere and the success paths still render
     - start.html's redirect to thank-you.html advances the shell instead, since
       a relative navigation inside a srcdoc iframe has no base to resolve
   Verify with the network panel: nothing should reach leadconnectorhq.com. */

const fs = require('fs');
const path = require('path');

/* Two roots, and the split is the whole reason this repo can exist separately.

   `here` is this repo: the internal documents nobody outside the team should read,
   which is why they are not in the public site repo.

   `site` is the live site repo, checked out beside this one. The build reads the
   REAL index.html, start.html, thank-you.html and intake.html from there on every
   run. Copying them in here instead would have been simpler and would have broken
   the one property this build exists for: a pasted snapshot of four pages is a fork
   that starts rotting the moment anyone edits a real page.

   So this repo does not build alone, on purpose. Clone both side by side:

     C:\dev\neurohome-landing   the public site
     C:\dev\neurohome-journey   this

   SITE_DIR overrides the location if they live somewhere else. */
const here = __dirname;
const site = path.resolve(process.env.SITE_DIR || path.join(here, '..', 'neurohome-landing'));

if (!fs.existsSync(path.join(site, 'index.html'))) {
  throw new Error(
    'cannot find the site repo at ' + site + '\n' +
    'This build reads the live pages rather than keeping copies of them, so the\n' +
    'neurohome-landing repo has to be checked out beside this one. Clone it there,\n' +
    'or set SITE_DIR to wherever it lives.'
  );
}

/* Anything this repo owns resolves against `here`; everything else is a live page
   and resolves against the site repo. The list is explicit rather than a heuristic,
   so a new file added to either side has to be classified deliberately. */
const OWN_FILES = new Set([
  'intake-results.html', 'checkout.html', 'email-preview.html',
  'sources/plans.html', 'sources/funnel.html',
]);
const read = f => fs.readFileSync(path.join(OWN_FILES.has(f) ? here : site, f), 'utf8');

const css = read('neurohome.css');
const js = read('neurohome.js');

/* ---------------------------------------------------------------------------
   ONE INVENTED FAMILY, USED BY EVERY STAGE

   The walkthrough used to show three different families: the lead form was blank,
   the intake thank-you seeded Maria and Leo, and the results summary shipped with
   Sarah and Ethan. Read end to end, nothing joined up.

   This is now the only place a name, an answer or a date is written down. The
   summary's six domain lines are DERIVED from the same seeded answers the intake
   stages are filled with, rather than typed in beside them, so the two cannot
   disagree no matter what changes.

   Invented, and deliberately so: example.com and the 555 prefix are both reserved
   for fiction, so nothing here can reach a real person. */
const FAMILY = {
  parentFirst: 'Maria',
  parentLast: 'Alvarez',
  email: 'maria.alvarez@example.com',
  phone: '(512) 555-0142',      // 512 is Austin, which agrees with the state below
  country: 'United States',
  state: 'Texas',
  childFirst: 'Leo',
  childAge: 6,
  childAgeBucket: '3-18',       // the lead form asks for a band, the intake for a number
  primaryConcern: 'Speech / not talking',
  topConcerns: ['Speech / not talking', 'Meltdowns / emotional regulation', 'Sleep', 'Diet / nutrition'],
  goal6Months: 'Leo asking for what he wants with words instead of pulling my hand.',
  goal2Years: 'A classroom where he is not the child who has to leave the room.',
  goal5Years: 'Independence with the everyday things: dressing, eating, sleeping through.',
  submittedOn: '18 August 2026',
  preparedOn: '21 August 2026',

  /* One target per phenotype, in the order intake.html defines them, on the same
     0 to 4 scale the parent sees: 0 is "doesn't apply", 4 is "daily". These match
     the four concerns chosen above, so the form the parent fills and the summary
     they get back tell the same story.

     These numbers are also tuned so the clinical engine can actually classify Leo.
     That is not cosmetic. bandOf() reads a phenotype at roughly 75% as VERY_HIGH
     and 60% as HIGH, and a flat severity of n lands the phenotype near 25n percent,
     so a 3 anywhere means VERY_HIGH:

       - Phenotypes 7, 8, 9 and 11 are the biomedical group. Any one of them at
         HIGH or above sets bioHigh, which blocks the foundational_2 archetype and
         drops the whole intake to no_template_clinician_consult. That raises the
         unclear_classification gate and sets autoRoute false, while the summary
         goes on recommending Clinical Intensive. Diet is a real concern for this
         family, so 8 and 9 sit at 2, which reads WATCHLIST: present, not dominant.
       - Phenotype 10 stays 0. Its second question at 3 or higher fires the
         active_seizure gate, and combined with the nonverbal history item a high
         P10 also routes straight to severe_dysregulation_10.
       - Only 1 and 6 are left VERY_HIGH. Three or more VERY_HIGH phenotypes route
         to severe_dysregulation_10 as soon as any safety gate fires, so keeping
         the count at two leaves margin rather than sitting on the edge.

     Verified outcome: archetype foundational_2, no gates fired, autoRoute true. */
  severity: [
    3, //  1  Sensory Sensitivity & Regulation        <- meltdowns
    2, //  2  Focus, Routines & Flexibility
    2, //  3  Social & Emotional Awareness
    2, //  4  Early Development & Reflexes
    2, //  5  Balance & Coordination
    4, //  6  Speech & Communication                  <- the primary concern
    1, //  7  Energy & Stamina
    2, //  8  Gut & Digestive Health                  <- diet, see the note above
    2, //  9  Eating & Feeding                        <- diet
    0, // 10  Staring, Tics & Seizure Signs           <- see the note above
    1, // 11  Sudden Changes After Illness
    2, // 12  Reading, Memory & Learning
  ],

  /* Section 13 is the health and development history: thirty-six yes/no items, none
     of them scored. Ticking nothing would leave the last section of the form blank,
     so these are the ones true for Leo. Everything not listed stays false.

     What is deliberately NOT ticked matters as much as what is. Six of these items
     fire blocking safety gates in evaluateSafetyGates: severe_self_injury,
     severe_aggression and elopement_risk raise safety_risk, active_hyperimmune_flare
     raises active_flare, currently_ill_or_recovering_48h raises acute_illness_fever,
     and regression_in_last_90_days raises recent_regression. Any one of them sets
     autoRoute to false, which would leave the summary recommending a program the
     engine had refused to route to. All six are left false on purpose.

     night_waking_5plus is safe to tick even though sleep is one of the four
     concerns: severe_sleep_collapse needs P01_q10 at 4 or above as well, and the
     seed puts that question at 2. */
  history: [
    'c_section',                      // common and benign
    'mild_jaundice',                  //   "
    'recurrent_ear_sinus',            // repeated ear infections, the usual travelling
    'nonverbal_or_minimally_verbal',  //   companion to a speech delay this age
    'night_waking_5plus',             // the sleep concern, one signal and not the gate
    'developmental_delay',
    'cannot_sit_still',               // agrees with the summary's "short blocks for now"
  ],

  /* The summary reports six lines a parent would recognise, not twelve clinical
     phenotype names. Each names the phenotypes it is built from by their 1-based
     number, and its severity is computed from those answers.

     Sleep is one of the four concerns but has no phenotype of its own, so it is
     not a line here. Reporting a sleep severity would mean inventing a
     measurement the form never took. */
  domains: [
    { name: 'Speech and communication',    sub: 'expressing needs, back and forth, play',        from: [6, 3] },
    { name: 'Attention and regulation',    sub: 'focus, transitions, recovering from upset',     from: [1, 2] },
    { name: 'Eating and digestion',        sub: 'range of foods, appetite, gut comfort',         from: [8, 9] },
    { name: 'Movement and coordination',   sub: 'balance, motor skills, early reflexes',         from: [4, 5] },
    { name: 'Reading, memory and learning', sub: 'holding instructions, recall, school work',    from: [12] },
    { name: 'Energy and general health',   sub: 'stamina, illness, tics and staring spells',     from: [7, 10, 11] },
  ],
};

/* The questions themselves, read out of intake.html so the seed can never be
   written against a set of qids that no longer exists. */
const PHENOTYPES = (() => {
  const m = read('intake.html').match(/const PHENOTYPE_QUESTIONS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('intake.html: could not read PHENOTYPE_QUESTIONS, so the family cannot be seeded');
  return eval(m[1]); // eslint-disable-line no-eval -- build-time read of our own literal
})();

if (PHENOTYPES.length !== FAMILY.severity.length) {
  throw new Error(`intake.html has ${PHENOTYPES.length} phenotypes but FAMILY.severity lists ${FAMILY.severity.length}`);
}
(() => {
  const used = FAMILY.domains.reduce((a, d) => a.concat(d.from), []).sort((a, b) => a - b);
  const want = PHENOTYPES.map((_, i) => i + 1);
  if (used.join() !== want.join()) {
    throw new Error(`FAMILY.domains must cover every phenotype exactly once: got [${used}] for [${want}]`);
  }
})();

/* The history keys have to be real, and they must not be the ones that stop the
   engine routing. Both are cheap to check here and invisible if they go wrong: a
   typo would silently tick nothing, and a gate key would silently contradict the
   summary. */
(() => {
  const src = read('intake.html');
  const m = src.match(/const HISTORY_SECTION = (\{[\s\S]*?\n\};)/);
  if (!m) throw new Error('intake.html: could not read HISTORY_SECTION to check the seeded history');
  const hx = eval(`(${m[1].replace(/;$/, '')})`); // eslint-disable-line no-eval
  const real = new Set();
  hx.groups.forEach(g => g.items.forEach(it => real.add(it.key)));
  const unknown = FAMILY.history.filter(k => !real.has(k));
  if (unknown.length) throw new Error(`FAMILY.history names items intake.html does not have: ${unknown.join(', ')}`);

  const gateKeys = ['severe_self_injury', 'severe_aggression', 'elopement_risk',
    'active_hyperimmune_flare', 'currently_ill_or_recovering_48h', 'regression_in_last_90_days'];
  const gating = FAMILY.history.filter(k => gateKeys.includes(k));
  if (gating.length) {
    throw new Error(`FAMILY.history ticks ${gating.join(', ')}, which fires a blocking safety gate. `
      + 'The summary would then recommend a program the engine refused to route to.');
  }
})();

/* All 121 answers, generated once and handed to the intake stages and the summary
   alike. A flat value per phenotype would colour the review view in solid blocks
   and land every domain average exactly on its target, so each answer is nudged
   off target by a fixed repeating amount. No randomness: the file has to build
   byte-identically every time. */
const JITTER = [0, 1, -1, 0, -1, 1, 0];
const SEEDED_SCORES = {};
PHENOTYPES.forEach((p, pi) => {
  p.questions.forEach((q, qi) => {
    const raw = FAMILY.severity[pi] + JITTER[(pi * 3 + qi) % JITTER.length];
    SEEDED_SCORES[q.qid] = Math.max(0, Math.min(4, raw));
  });
});
const SEEDED_COUNT = Object.keys(SEEDED_SCORES).length;

/* A summary line's level comes from the answers, not from a number typed next to
   them. Three levels, matching the three bar widths the summary already styles. */
const SAID = { 1: 'Not a concern', 2: 'Some difficulty', 3: 'A significant challenge' };
function domainLevel(from) {
  const vals = [];
  from.forEach(n => PHENOTYPES[n - 1].questions.forEach(q => vals.push(SEEDED_SCORES[q.qid])));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg >= 2.6 ? 3 : avg >= 1.4 ? 2 : 1;
}

/* Shared by the two intake stages: the same identity and the same 121 answers. */
const SEED_INTAKE = `    Object.assign(state, ${JSON.stringify({
  parentFirstName: FAMILY.parentFirst,
  parentLastName: FAMILY.parentLast,
  email: FAMILY.email,
  phone: FAMILY.phone,
  parentCountry: FAMILY.country,
  childName: FAMILY.childFirst,
  age: FAMILY.childAge,
  topConcerns: FAMILY.topConcerns,
  primaryConcern: FAMILY.primaryConcern,
  goal6Months: FAMILY.goal6Months,
  goal2Years: FAMILY.goal2Years,
  goal5Years: FAMILY.goal5Years,
})});
    var seeded = ${JSON.stringify(SEEDED_SCORES)};
    Object.keys(seeded).forEach(function (qid) { state.scores[qid] = seeded[qid]; });
    ${JSON.stringify(FAMILY.history)}.forEach(function (key) { state.history[key] = true; });

    /* The seed and the results summary have to agree about what the engine made of
       this family. The summary states plainly that Clinical Intensive is the closer
       fit, which is only honest if the engine actually routed. Nudging any severity
       in FAMILY can silently flip that: a single phenotype crossing into HIGH sets
       bioHigh and drops the whole thing to no_template_clinician_consult.

       There is no way to run this engine at build time without reimplementing it,
       so it self-checks here instead and says so loudly rather than leaving a
       contradiction for a reader to find. */
    try {
      var _pcts = getPhenoPercents();
      var _crit = computeCriticalOverrides();
      var _hf = evaluateHistoryFlags();
      var _fired = evaluateSafetyGates(_hf, _crit);
      var _arch = routeArchetype(_hf, _fired, _pcts, _crit).arch;
      evaluatePostRoutingGates(_arch, getSubtype(_arch, _hf, _pcts))
        .forEach(function (g) { if (_fired.indexOf(g) === -1) _fired.push(g); });
      if (_fired.length || _arch !== 'foundational_2') {
        console.error('[journey preview] the seeded family no longer routes cleanly: archetype '
          + _arch + ', gates [' + _fired + ']. The results summary still recommends Clinical '
          + 'Intensive, so those two now disagree. Retune FAMILY.severity in build.js.');
      }
    } catch (e) {
      console.error('[journey preview] could not check the seeded family against the engine', e);
    }`;

/* Everything a stage needs to run standalone and to stay inert, in two halves,
   and the split is load-bearing.

   The stubs go in the head, because they have to be installed before any script the
   page itself ships. This whole guard used to be injected at the end of the body,
   which let a page run its own startup code against the real APIs first. The Plans
   document syncs its tabs into the URL as it initialises, so that call reached the
   genuine history.replaceState and threw on every load. The same hole applied to the
   part that actually matters: a page calling fetch while starting up would have
   reached the network before the stub existed.

   The link router has no such requirement and stays at the end of the body, where
   the DOM it listens to already exists. */
const GUARD_STUBS = `
<script>
/* Journey preview guard. This is a review copy: nothing may leave the browser. */
(function () {
  var noted = [];
  function note(where, url) {
    noted.push(where + ' ' + url);
    console.info('[journey preview] blocked ' + where + ' to ' + url);
  }
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    note('fetch', String(url));
    // Shape the success both submit paths check for, so the flow completes and
    // the thank-you state renders the way it does in production.
    return Promise.resolve({
      ok: true, status: 200, statusText: 'OK (journey preview)',
      json: function () { return Promise.resolve({ ok: true }); },
      text: function () { return Promise.resolve('{"ok":true}'); }
    });
  };
  var RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var x = new RealXHR();
    var open = x.open;
    x.open = function (m, u) { note('xhr', String(u)); return open.call(x, m, 'data:,'); };
    return x;
  };
  if (navigator.sendBeacon) {
    navigator.sendBeacon = function (url) { note('beacon', String(url)); return true; };
  }
  /* A page that syncs state into the URL throws in here: history calls are refused
     on an about:srcdoc document. The Plans document does exactly that when its tabs
     change, which threw on every click. Swallow it, since there is no address bar to
     keep in step anyway. */
  try {
    history.replaceState = function () {};
    history.pushState = function () {};
  } catch (e) { /* nothing to do if it is already locked down */ }

  window.__journeyBlocked = noted;
})();
<\/script>`;

const GUARD_LINKS = `
<script>
(function () {
  /* Every link between these four pages is relative, and a relative href inside a
     srcdoc frame has no base URL to resolve against, so clicking one does nothing
     at all. This routes them to the matching stage instead: the thank-you page's
     "Start your intake" opens the intake, the landing nav CTA opens the web form,
     the footer's "Continue your intake" opens the intake, and the intake's "Back
     to homepage" returns to the landing page. A link with no stage of its own is
     swallowed and logged rather than left to fail silently. */
  var STAGE_FOR_PAGE = {
    'index.html': 'landing', '': 'landing',
    'start.html': 'start',
    'thank-you.html': 'thankyou',
    'intake.html': 'intake'
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    // Same-page anchors, external links and protocol links behave normally.
    if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) return;
    e.preventDefault();
    // Split rather than regex: this whole script is built inside a template
    // literal, where a backslash is eaten before it ever reaches the output. A
    // pattern like ^\./ silently became invalid and took the entire guard down.
    var page = href.split('?')[0].split('#')[0];
    if (page.slice(0, 2) === './') page = page.slice(2);
    var stage = STAGE_FOR_PAGE[page];
    if (stage) parent.postMessage({ journeyAdvance: stage }, '*');
    else console.info('[journey preview] ' + href + ' has no stage in this file');
  }, true);
})();
<\/script>`;

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

/* Photographs are referenced by relative path, which only resolves while the file
   sits next to the images directory. Move it, mail it or host it and the hero photo
   and the headshot break. Inline them as data URIs so the file carries its own
   pictures, the same reason the CSS and JS are inlined.

   Whatever an attribute points at is embedded as itself: the picture element's webp
   source stays webp and its jpg fallback stays jpg, so the browser still gets the
   choice the real page gives it. A missing file is a build failure, not a silent
   broken image. */
let inlinedImageBytes = 0;
function inlineImages(src) {
  return src.replace(/(src|srcset)="(images\/[^"]+)"/g, (whole, attr, file) => {
    if (file.indexOf(',') > -1) {
      throw new Error(`${file}: multi-candidate srcset is not handled, inline it by hand`);
    }
    // Images belong to the pages that reference them, so they come from the site
    // repo like the pages do.
    const abs = path.join(site, file);
    if (!fs.existsSync(abs)) throw new Error(`${file} is referenced but missing from ${site}`);
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) throw new Error(`${file}: no MIME type known for this extension`);
    const b64 = fs.readFileSync(abs).toString('base64');
    inlinedImageBytes += b64.length;
    return `${attr}="data:${type};base64,${b64}"`;
  });
}

/* neurohome.css and neurohome.js are separate files in production. Inline them so
   a stage renders identically with no network and no relative paths to resolve. */
function inlineAssets(src) {
  return inlineImages(src)
    .replace(/<link rel="stylesheet" href="neurohome\.css\?v=\d+">/,
             `<style>\n${css}\n</style>`)
    .replace(/<script src="neurohome\.js\?v=\d+"><\/script>/,
             `<script>\n${js}\n<\/script>`);
}

/* Empty the constants as well as stubbing the transport. Either alone would do;
   both means a future edit has to defeat two independent guards to leak.

   The intake thank-you's "Book my call" CTA is a fourth leak of the same kind: not
   a webhook but a live GHL booking calendar, one click from putting a reviewer on
   Dr. Kyle's real diary. The button has to keep rendering, because it IS the point
   of stage 6, so the href is swapped rather than the anchor removed.

   It is swapped for a relative sentinel, not emptied. GUARD_LINKS maps '' to the
   landing stage, so href="" would send a click back to stage 1 instead of nowhere.
   A page name with no stage of its own falls through to the guard's swallow-and-log
   branch, which is the behaviour wanted: preventDefault, no navigation, a console
   line naming what was clicked. */
function deadenWebhooks(src) {
  return src
    .replace(/const LEAD_WEBHOOK_URL = '[^']*'/,
             "const LEAD_WEBHOOK_URL = '' /* emptied for the journey preview */")
    .replace(/const GHL_WEBHOOK_URL = '[^']*'/,
             "const GHL_WEBHOOK_URL = '' /* emptied for the journey preview */")
    .replace(/const INTAKE_PROGRESS_WEBHOOK_URL = '[^']*'/,
             "const INTAKE_PROGRESS_WEBHOOK_URL = '' /* emptied for the journey preview */")
    /* target="_blank" goes with it. The stages are not sandboxed, so if the guard
       ever fails to install, a blank target is the one thing that would still open
       a real tab. */
    .replace(/href="https:\/\/api\.leadconnectorhq\.com\/widget\/booking\/[^"]*"(?:\s+target="_blank")?(?:\s+rel="noopener")?/g,
             'href="book-my-call" data-journey-preview="booking calendar removed"');
}

function addGuard(src) {
  if (src.indexOf('</head>') === -1) throw new Error('a stage has no </head> to install the stubs in');
  if (src.indexOf('</body>') === -1) throw new Error('a stage has no </body> to install the link router in');
  return src
    .replace('</head>', `${GUARD_STUBS}\n</head>`)
    .replace(/<\/body>/, `${GUARD_LINKS}\n</body>`);
}

// ---- stage 1: the top of the landing page ---------------------------------
/* Nav plus hero, cut at the "WHAT WE ADDRESS" marker. Stops well short of the
   GHL booking calendar further down the page, which a reviewer clicking around
   must not be able to book a real Discovery call through. */
function buildLanding() {
  const src = read('index.html');
  const cut = src.indexOf('<!-- ============ 3. WHAT WE ADDRESS');
  if (cut === -1) throw new Error('index.html: could not find the section 3 marker to cut the hero at');
  const head = src.slice(0, src.indexOf('<body>') + '<body>'.length);
  const top = src.slice(src.indexOf('<body>') + '<body>'.length, cut);
  const out = `${head}\n${top}\n<script src="neurohome.js?v=0"><\/script>\n</body>\n</html>`;
  if (/widget\/booking/.test(out)) throw new Error('landing stage still contains the booking calendar');
  return addGuard(inlineAssets(out));
}

// ---- stage 2: the lead form ----------------------------------------------
/* On success the real page does window.location.href = 'thank-you.html'. Inside a
   srcdoc iframe there is no base URL for that to resolve against, so it becomes a
   message that moves the shell to the next stage. Submitting the form really does
   take you to Thank you, which is the point. */
function buildStart() {
  let src = read('start.html');
  const before = (src.match(/window\.location\.href = REDIRECT_URL;/g) || []).length;
  if (before !== 2) throw new Error(`start.html: expected 2 redirects to rewrite, found ${before}`);
  src = src.replace(/window\.location\.href = REDIRECT_URL;/g,
    "parent.postMessage({ journeyAdvance: 'thankyou' }, '*'); /* journey preview */");
  return addGuard(inlineAssets(deadenWebhooks(src))).replace(/<\/body>/, `${START_PREFILL}\n</body>`);
}

/* The lead form arrives filled in with the same family as every later stage, so the
   walkthrough reads as one person moving through it. Still fully editable, and
   Reset puts it back.

   The country list is built at load from PRIORITY_COUNTRIES, so this has to run
   after the page's own script rather than in the head, or there would be no
   option to select. */
const START_PREFILL = `
<script>
(function () {
  try {
    var v = ${JSON.stringify({
  first_name: FAMILY.parentFirst,
  last_name: FAMILY.parentLast,
  email: FAMILY.email,
  phone: FAMILY.phone,
  country: FAMILY.country,
  child_first_name: FAMILY.childFirst,
  child_age: FAMILY.childAgeBucket,
})};
    var form = document.getElementById('lead-form');
    if (!form) throw new Error('no lead-form on the page');
    Object.keys(v).forEach(function (name) {
      var el = form.elements[name];
      if (!el) { console.info('[journey preview] the lead form has no field named ' + name); return; }
      el.value = v[name];
      // The country select and the phone field both have change handlers that
      // decide how the number is shaped, so let them run rather than leaving the
      // form in a state the page never produces itself.
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Transactional texts are the box a family would tick to get their intake
    // link. Marketing consent is left off, which is the honest default.
    var t = form.elements.consent_sms_transactional;
    if (t) t.checked = true;
  } catch (e) {
    console.error('[journey preview] could not prefill the lead form', e);
  }
})();
<\/script>`;

/* The thank-you page echoes back the address the parent typed, reading it from
   sessionStorage where start.html left it. Seeding that key in the head means the
   page's own real code path runs here rather than being bypassed. If storage is
   unavailable the page bails silently by design, so a fallback after the body
   writes the same line directly. */
function buildThankYou() {
  const seed = `
<script>
try { sessionStorage.setItem('nh_lead_email', ${JSON.stringify(FAMILY.email)}); } catch (e) {}
<\/script>`;
  const fallback = `
<script>
(function () {
  var wrap = document.getElementById('ty-email-wrap');
  var slot = document.getElementById('ty-email');
  if (!wrap || !slot || !wrap.hidden) return;
  slot.textContent = ${JSON.stringify(FAMILY.email)};
  wrap.hidden = false;
})();
<\/script>`;
  return addGuard(inlineAssets(read('thank-you.html')))
    .replace('</head>', `${seed}\n</head>`)
    .replace(/<\/body>/, `${fallback}\n</body>`);
}

/* The 10-day nurture sequence, lifted out of the three-tab "Sales Cycle & Team"
   document kept at sources/funnel.html.

   Extracted by marker rather than hand-copied, so that file can be replaced with
   the full original document and this keeps working: it takes the stylesheet, the
   brand bar (which ends where <header> begins), and the funnel panel (which ends
   at the TAB 2 comment). The other two tabs and the tab chrome are dropped, since
   a journey stage should show one thing.

   The panel is display:none until it carries .active, so the class goes on here.
   The Loom posters keep their artwork but not their click handlers: swapping in a
   loom.com iframe would reach outside the page, and this file is meant to open
   with no network at all. The "open in Loom" links still work, because a click on
   an absolute URL is left alone by the guard's link router. */
function buildFunnel() {
  const src = read('sources/funnel.html');

  const styleStart = src.indexOf('<style>');
  const styleEnd = src.lastIndexOf('</style>');
  if (styleStart === -1 || styleEnd === -1) throw new Error('funnel source: no <style> block found');
  const css = src.slice(styleStart, styleEnd + '</style>'.length);

  /* Search from <body> onward, never from 0. The source file's own header comment
     describes these markers and therefore contains them as text; matching from the
     top of the file finds the comment instead of the markup, and silently yields a
     stage with the stylesheet and almost none of the content. */
  const from = src.indexOf('<body');
  if (from === -1) throw new Error('funnel source: no <body> found');

  const barStart = src.indexOf('<div class="brandbar">', from);
  const barEnd = src.indexOf('<header>', from);
  if (barStart === -1 || barEnd === -1 || barEnd < barStart) {
    throw new Error('funnel source: could not find the brand bar ahead of the header element');
  }
  const brandbar = src.slice(barStart, barEnd);

  const panelStart = src.indexOf('<div class="panel-body" id="tab-funnel"', from);
  const panelEnd = src.indexOf('<!-- ============ TAB 2', panelStart);
  if (panelStart === -1 || panelEnd === -1 || panelEnd < panelStart) {
    throw new Error('funnel source: could not find the funnel panel ahead of the second tab');
  }
  const panel = src.slice(panelStart, panelEnd)
    .replace('<div class="panel-body" id="tab-funnel"', '<div class="panel-body active" id="tab-funnel"');

  const fonts = (src.match(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || []).join('\n');

  return addGuard(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>NeuroHome: the 10-day nurture funnel</title>
${fonts}
${css}
</head>
<body>
${brandbar}
${panel}
</body>
</html>`);
}

/* intake.html already carries its own CSS and JS inline, so it needs the webhooks
   emptied, the guard appended, and the family filled in.

   It opens on the welcome screen with every field and all ${SEEDED_COUNT} answers already
   there, so a reviewer can page through the whole form and find it consistently
   filled rather than meeting a blank one. Still fully interactive: change any
   answer, or use Reset to reload the stage as it was. */
function buildIntake() {
  return addGuard(deadenWebhooks(read('intake.html')))
    .replace(/<\/body>/, `${INTAKE_PREFILL}\n</body>`);
}

const INTAKE_PREFILL = `
<script>
(function () {
  try {
${SEED_INTAKE}
    /* setupWelcome() has already run and copied the empty state into the inputs.
       Calling it again would bind a second listener to every field, so write the
       values straight in instead. */
    var fields = {
      'parent-first-name': state.parentFirstName,
      'parent-last-name': state.parentLastName,
      'parent-country': state.parentCountry,
      'parent-email': state.email,
      'parent-phone': state.phone,
      'child-name': state.childName,
      'child-age': state.age
    };
    Object.keys(fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = fields[id];
      else console.info('[journey preview] the intake has no field ' + id);
    });
    showScreen('welcome');
  } catch (e) {
    console.error('[journey preview] could not prefill the intake', e);
  }
})();
<\/script>`;

/* Stage 5 is the same intake.html opened on its submitted screen. That screen is
   not a page of its own: it is #screen-thanks inside the intake, normally reached
   only by finishing all 121 questions and posting to the CRM. Neither is going to
   happen in a review, so this boots straight to it.

   The intake's top-level declarations are const/let/function in a classic script,
   which puts them in the shared global lexical scope, so a later classic script
   can read state and reassign submitPhase without any of it being on window.

   A finished intake is seeded first, purely so "Review my answers (read-only)"
   opens a form with real answers in it and the section picker we added for
   reviewers has something to move between. Nothing is written to storage. */
const INTAKE_THANKS_BOOT = `
<script>
(function () {
  try {
${SEED_INTAKE}
    submitPhase = 'submitted_success';
    renderThanks(null, true);
  } catch (e) {
    console.error('[journey preview] could not open the intake thank-you screen', e);
  }
})();
<\/script>`;

function buildIntakeThanks() {
  return addGuard(deadenWebhooks(read('intake.html'))).replace(/<\/body>/, `${INTAKE_THANKS_BOOT}\n</body>`);
}

/* What the family receives after the intake lands: the personalised summary and the
   two care options. Embedded whole, since it arrives self-contained with no relative
   assets, no network calls and no forms.

   Its own four pages (summary, care options, Clinical Intensive, Wellness) stay as
   tabs inside the frame rather than being lifted into the shell's sub-tab row. The
   Plans document gets lifted because it IS a whole section; this is one stage among
   seven, so promoting its pages would put a third level of tabs on the page.

   It ships with its own worked example in a DATA block. That block is replaced here
   with the one family this file uses, and the six domain lines are computed from the
   same seeded answers the intake stages are filled with, so the summary reports what
   the form was actually given. Editing FAMILY.severity moves both together. */
/* The email that carries the letter. Extracted by marker from email-preview.html
   rather than written again here, so the copy a family reads has one source: edit
   it there and this follows.

   Only the family-facing half comes across. That file also holds a merge-tag copy
   and a fields table, which are notes for whoever builds the CRM template and have
   no place in a walkthrough of what a parent sees.

   The attachment is a real control here. Clicking it advances the shell to the
   letter, which is the sequence in life: the email arrives, the PDF gets opened.
   It posts to the shell rather than navigating, because a relative navigation
   inside a srcdoc frame has no base to resolve. */
function buildEmail() {
  const src = read('email-preview.html');

  const from = src.indexOf('<body');
  if (from === -1) throw new Error('email-preview.html: no <body> found');
  const a = src.indexOf('<!-- STAGE EMAIL START', from);
  const b = src.indexOf('<!-- STAGE EMAIL END', from);
  if (a === -1 || b === -1 || b < a) {
    throw new Error('email-preview.html: could not find the STAGE EMAIL markers around the family view');
  }
  const mail = src.slice(src.indexOf('-->', a) + 3, b).trim();

  /* The rail names stage 8 after this attachment, so the two have to agree. The
     filename is authored in email-preview.html and the rail label is built from
     FAMILY, which is two places for one string. */
  const attachName = `${FAMILY.childFirst}-intake-summary.pdf`;
  if (mail.indexOf(attachName) === -1) {
    throw new Error(`email-preview.html: the attachment should be named ${attachName}, `
      + 'to match the family seeded everywhere else and the label on stage 8');
  }

  const styleStart = src.indexOf('<style>');
  const styleEnd = src.lastIndexOf('</style>');
  if (styleStart === -1 || styleEnd === -1) throw new Error('email-preview.html: no <style> block found');
  const style = src.slice(styleStart, styleEnd + '</style>'.length);

  const fonts = (src.match(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || []).join('\n');

  return addGuard(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>Leo's intake summary</title>
${fonts}
${style}
<style>
  /* The inbox sits on its own here rather than inside the reference page, so it
     gets the centring that page's wrapper was giving it. */
  body { display: flex; align-items: flex-start; justify-content: center; padding: clamp(20px,4vw,44px) 16px; }
  .inbox { width: 100%; max-width: 720px; }
  .opener { font-size: 13px; color: var(--ink-3); margin-bottom: 14px; }
  /* The attachment is clickable in this stage, so it has to look it. */
  .attach { cursor: pointer; text-align: left; width: 100%; font: inherit;
            transition: border-color .15s, box-shadow .15s; }
  .attach:hover { border-color: var(--brand-deep); box-shadow: 0 2px 10px rgba(14,14,14,.08); }
  .attach:focus-visible { outline: 2px solid var(--brand-deep); outline-offset: 2px; }
  .attach-open { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--brand-text);
                 white-space: nowrap; }
</style>
</head>
<body>
<div class="inbox">
  <p class="opener">The email that arrives with the summary. Open the attachment to read the letter.</p>
  ${mail}
</div>
<script>
(function () {
  // The attachment div becomes a button: same look, real semantics.
  var chip = document.querySelector('.attach');
  if (!chip) return;
  var btn = document.createElement('button');
  btn.className = chip.className;
  btn.type = 'button';
  btn.innerHTML = chip.innerHTML + '<span class="attach-open">Open &rarr;</span>';
  btn.setAttribute('aria-label', 'Open the intake summary, 7 pages');
  chip.parentNode.replaceChild(btn, chip);
  btn.addEventListener('click', function () {
    parent.postMessage({ journeyAdvance: 'results' }, '*');
  });
})();
<\/script>
</body>
</html>`);
}

/* Where a family lands when they say they are ready. Self-contained already, with
   no relative assets and no network, so it needs nothing but the guard.

   Its "Talk to us first" link points at index.html#book, which the guard's router
   sends to the landing stage, so that path stays live inside the walkthrough. Its
   "Continue to payment" is deliberately a dead end: there is no payment step wired
   to this, and a review artifact should not be the thing that discovers one. */
function buildCheckout() {
  const src = read('checkout.html');
  if (/<\/?template/i.test(src)) throw new Error('checkout.html: contains a template tag, which would break its container');
  if (/<(script|link)[^>]+(src|href)="https?:\/\//.test(src)) {
    throw new Error('checkout.html: loads something over the network by tag, so it is not self-contained');
  }
  /* Now the same self-extracting bundle the letter is, so the same caveat applies:
     the controls and prices live inside the compressed payload and cannot be
     checked from here. Verified in a browser instead, inside the frame and behind
     the guard: switching programs moves the total between $13,000 and $5,000, and
     the OAT panel takes it to $14,150. */
  return addGuard(src);
}

function buildResults() {
  const src = read('intake-results.html');

  /* Embedded whole, with no data injection. The previous version of this document
     carried a `var DATA = {}` block this function rewrote, and a question count it
     patched. Neither exists now: the seven page letter carries its own data inside
     a bundled component, already set to the same family seeded everywhere else.
     There is nothing here to personalise, so the checks that used to throw on a
     missing DATA block are gone with it.

     It is a self-extracting bundle: React, the runtime and the assets are gzipped
     into the file and unpacked into blob: URLs at load. Two things were verified
     before relying on that, because neither is obvious:

       - it makes no network request at all. The unpkg.com URLs inside it are
         manifest keys for bundled modules, not fetches. Loading it produced only
         blob: requests.
       - it survives srcdoc. blob: inherits the creating origin, and an srcdoc
         frame has an opaque one, so script-from-blob could have been blocked
         there. It is not: seven pages render with every template value resolved.

     What can and cannot be checked here is worth being precise about. The seven
     page sections are INSIDE the compressed payload, so no build-time regex can
     count them: the plain text is a loader. Asserting on them was tried and failed
     honestly, reporting 0. So the checks below are the ones that mean something at
     this level, and the page count is verified in a browser instead. */
  if (!/__bundler_loading/.test(src) || !/DecompressionStream/.test(src)) {
    throw new Error('intake-results.html: not the self-extracting bundle this expects. '
      + 'If it was replaced with a plain document, buildResults needs revisiting.');
  }
  const payload = (src.match(/[A-Za-z0-9+/]{2000,}={0,2}/g) || []);
  if (!payload.length) throw new Error('intake-results.html: the bundle carries no compressed payload');
  if (/<\/?template/i.test(src)) throw new Error('intake-results.html: contains a template tag, which would break its container');
  if (/<(script|link)[^>]+(src|href)="https?:\/\//.test(src)) {
    throw new Error('intake-results.html: loads something over the network by tag, so it is not self-contained');
  }

  /* Something real was lost when this document started carrying its own data, and
     this is the replacement for it.

     The previous version had its six domain lines COMPUTED from the seeded intake
     answers, so the form and the summary could not disagree. The letter hardcodes
     them instead, which means FAMILY.severity could be retuned and the letter would
     go on reporting the old picture with nothing to catch it. That is exactly the
     drift this file exists to prevent.

     So the derivation stays, and its result is compared against what the letter
     says. They agree today, all six. If a severity change breaks that, the build
     fails here rather than shipping a letter that contradicts the intake it came
     from. The levels sit inside the compressed payload, so the comparison is
     against the readable copy the canvas exports alongside it. */
  const LETTER_LEVELS = {
    'Speech and communication': 3,
    'Attention and regulation': 3,
    'Eating and digestion': 2,
    'Movement and coordination': 2,
    'Reading, memory and learning': 2,
    'Energy and general health': 1,
  };
  const drift = FAMILY.domains
    .map(d => ({ name: d.name, derived: domainLevel(d.from), stated: LETTER_LEVELS[d.name] }))
    .filter(x => x.stated === undefined || x.derived !== x.stated);
  if (drift.length) {
    throw new Error('the letter\'s domain levels no longer match the seeded answers:\n'
      + drift.map(x => `  ${x.name}: intake derives ${x.derived}, the letter states ${x.stated}`).join('\n')
      + '\nRetune FAMILY.severity, or update the letter and LETTER_LEVELS together.');
  }

  return addGuard(src);
}

/* Section 1's plan data: the standalone Plans document, embedded whole. It arrives
   self-contained, with no relative assets, no network calls and no forms, so it
   needs nothing but the guard. Its own four tabs (Overview, Clinical Intensive,
   Wellness, Rover) are left working, because all four ARE the plan data. Its
   version is read out of the title so the shell can show which build is embedded. */
function buildPlans() { return addGuard(read('sources/plans.html')); }

function plansVersion() {
  const m = read('sources/plans.html').match(/<title>([^<]*)<\/title>/);
  const v = m && m[1].match(/v\d+(?:\.\d+)*/);
  return v ? v[0] : '';
}

const STAGES = [
  { id: 'landing',  n: 1, name: 'Landing page',  note: 'Top of the site: nav and hero.',                         html: buildLanding() },
  { id: 'start',    n: 2, name: 'Web form',      note: 'start.html. Fill it in and submit, or skip ahead.',      html: buildStart() },
  { id: 'thankyou', n: 3, name: 'Thank you',     note: 'What a family sees after the lead form.',                html: buildThankYou() },
  /* The nurture sequence sits here, not later: a family lands on Thank you, then
     spends ten days being warmed by email and text, and every one of those touches
     points at the intake. So it is what happens between the lead form and the
     intake, and the walkthrough should read in that order. */
  { id: 'funnel',   n: 4, name: 'The funnel',    note: 'The 10-day nurture sequence. Every touch drives the intake.',   html: buildFunnel() },
  { id: 'intake',   n: 5, name: 'Intake form',   note: `121 questions across 12 sections, plus history. Filled in for one family, still editable.`,   html: buildIntake() },
  { id: 'submitted', n: 6, name: 'Intake submitted', note: 'What a family sees after sending the intake. Book my call is the next step, live-looking but inert here. Review my answers opens the read-only view.', html: buildIntakeThanks() },
  /* The email comes before the letter because that is the order a family meets
     them: the email arrives, the attachment gets opened. Two stages rather than one
     with a reveal inside it, and not for want of trying: the letter is a complete
     866KB document, so nesting it would mean either a <template> inside a stage,
     which breaks the container the shell puts every stage into, or a second srcdoc
     built from an escaped 866KB string. The shell already has a tested way for a
     stage to move the rail, so the attachment uses that. */
  { id: 'email',    n: 7, name: 'The email',      note: 'What arrives in the inbox. The attachment opens the letter.', html: buildEmail() },
  /* Named for the attachment rather than described, so the rail reads as the thing
     the family actually opens. Built from FAMILY rather than typed, so it cannot
     end up naming a different child than the letter does. */
  { id: 'results',  n: 8, name: `${FAMILY.childFirst}-intake-summary`, note: 'The seven page summary, sent as the PDF attachment.', html: buildResults() },
  /* Last, because it is where "ready to move forward" lands. There is no click path
     into it from the letter and that is correct rather than missing: the letter is a
     PDF, so its last page prints neurohome.com/start as text instead of linking it.
     Use the rail or Next. */
  { id: 'checkout', n: 9, name: 'Checkout',      note: 'Choose a program, add to it, see the total. No payment step is connected.', html: buildCheckout() },
];

/* The guard is assembled inside a template literal, so a stray backslash is eaten
   before it reaches the output. That produced an invalid regex once, which threw on
   load and silently disabled the whole guard in every stage: fetch unstubbed, links
   dead, and nothing to see except a stage that quietly did not work. Syntax-check
   the emitted script here so that fails the build instead. */
const guardBody = [GUARD_STUBS, GUARD_LINKS]
  .map(g => g.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, ''))
  .join('\n;\n');
try {
  new Function(guardBody);
} catch (e) {
  throw new Error(`the preview guard does not parse (${e.message}). Check for backslashes eaten by the template literal.`);
}

// A stage that would break the <template> containers has to be caught at build
// time, not discovered as a blank iframe by whoever opens the file.
STAGES.forEach(s => {
  if (/<\/?template/i.test(s.html)) throw new Error(`${s.id}: contains a template tag, which would break its container`);
  if (/leadconnectorhq\.com\/hooks/.test(s.html)) throw new Error(`${s.id}: still contains a live webhook URL`);
  if (/widget\/booking/.test(s.html)) throw new Error(`${s.id}: still contains the booking calendar`);
});

const shell = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>NeuroHome: plans and customer journey</title>
<!-- GENERATED FILE. Do not edit by hand: run node build.js.
     Section 1 holds the plan data. Section 2 is the live customer journey, each
     stage embedded from the real page in an iframe so its CSS cannot collide with
     the others. Every outbound webhook is disabled.

     Eight templates, built from seven sources:
       index.html                              -> tpl-landing
       start.html                              -> tpl-start
       thank-you.html                           -> tpl-thankyou
       intake.html                             -> tpl-intake and tpl-submitted
       sources/plans.html          -> tpl-plans
       sources/funnel.html         -> tpl-funnel
       intake-results.html -> tpl-results -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  /* Shell tokens. Three of these are contrast fixes, not preferences: the value
     beside each was measured against the background it is actually used on, and
     WCAG AA wants 4.5:1 for text this size. Changing them back reintroduces a
     failure, so the ratio is recorded here rather than left to be rediscovered.

       --badge-ink  on --brand-soft #E0F7FE   5.09:1   was #0095BD at 3.13:1
       --ink-3      on --bg         #FAFAFA   4.63:1   .about was #A1A1AA at 2.46:1
       --warn       on --bg         #FAFAFA   5.66:1   was #B07520 at 3.72:1

     --border-soft and --warm-soft were defined here and referenced nowhere, so
     they are gone. */
  :root {
    --ink: #0E0E0E; --ink-2: #3F3F46; --ink-3: #71717A; --ink-4: #A1A1AA;
    --bg: #FAFAFA; --surface: #FFFFFF; --border: #E4E4E7;
    --brand: #00CEFD; --brand-deep: #0095BD; --brand-soft: #E0F7FE;
    --badge-ink: #00708F;
    --navy: #0f1b33; --warn: #8A5A12;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* The shell had no focus styling of any kind, so a keyboard user got only the
     UA ring, which is all but invisible against .btn-dark's near-black fill. One
     rule covers every interactive thing in here. :focus-visible rather than
     :focus, so a mouse click does not leave a ring behind. */
  :focus-visible {
    outline: 2px solid var(--brand-deep);
    outline-offset: 2px;
    border-radius: 100px;
  }
  .masthead :focus-visible { outline-color: var(--brand); }
  .about summary:focus-visible { border-radius: 4px; }
  /* The stage gets the viewport. The shell is a flex column: a compact masthead and
     one control row at their natural height, then the frame taking every remaining
     pixel, edge to edge. The frame used to be a 78vh card inside a 1180px column,
     which made every embedded page a small scrolling window inside another page.

     min-height rather than height, so if the controls wrap on a narrow screen the
     page scrolls instead of crushing the frame. */
  html { height: 100%; }
  body {
    background: var(--bg); color: var(--ink); font-family: 'Inter', system-ui, sans-serif;
    font-size: 15px; line-height: 1.55;
    min-height: 100dvh; display: flex; flex-direction: column;
  }
  .wrap { padding: 0 clamp(14px, 2.2vw, 24px); }

  .masthead { background: var(--navy); color: #fff; padding: 10px 0 9px; flex: 0 0 auto; }
  .masthead .wrap { display: flex; align-items: center; gap: 6px 20px; flex-wrap: wrap; }
  /* 16px to 17px, and a brand rule down the left. Both are free on height: the
     masthead's own padding sets the row, and 17px sits inside it. */
  .masthead h1 {
    font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 800; letter-spacing: -0.3px;
    padding-left: 10px; border-left: 3px solid var(--brand);
  }
  .masthead p { color: #9FB3C8; font-size: 12px; }
  /* Auto margin rather than space-between: on a full row the two lay out identically,
     but when this wraps to its own line space-between flings a lone item to the far
     left instead of leaving it where it belongs. */
  .masthead-tabs { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
  .masthead-tab {
    background: rgba(255,255,255,0.06); color: #C9D6E4; border: 1px solid rgba(255,255,255,0.16);
    border-radius: 100px; padding: 7px 16px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .masthead-tab:hover { border-color: var(--brand); color: #fff; }
  .masthead-tab[aria-current="true"] { background: var(--brand); border-color: var(--brand); color: #04212B; }

  /* A section is itself a flex column so the frame can grow. min-height: 0 is what
     lets it shrink below its content's intrinsic height, which is what makes the
     frame scroll internally rather than stretching the page. */
  .sec { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
  .sec[hidden] { display: none; }

  /* One control row: stage pills on the left, the actions that used to live in the
     frame's title bar on the right. */
  /* The control band sits on --surface while the stage below is also white, so a
     1px border alone left the two reading as one undifferentiated slab. The band
     keeps the surface and the seam does the separating, which costs no height. */
  .band { background: var(--surface); flex: 0 0 auto; }
  .barline { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; padding: 9px 0 8px; }
  .actions { margin-left: auto; display: flex; gap: 7px; }
  .hint { display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; font-size: 12.5px; padding-bottom: 8px; }
  .hint .req { color: var(--warn); font-weight: 600; }
  .about { margin-left: auto; color: var(--ink-3); font-size: 12px; }
  .about summary { cursor: pointer; }
  /* Opening this took 65px off the stage. It still displaces it, because it is in
     the flex flow; the cap just bounds how much. 4em was measured, not guessed: the
     first cap tried was 8.5em, which is taller than the text's natural height and
     so made the displacement worse (108px) rather than better. Zero displacement
     would mean floating this over the frame, which is a bigger change than a cap. */
  .about[open] { flex: 1 1 100%; margin-left: 0; padding-bottom: 4px; max-height: 4em; overflow: auto; }
  .about p { max-width: 92ch; padding-top: 5px; }
  .about code { font-family: ui-monospace, "SF Mono", monospace; }

  .steps { display: flex; gap: 7px; flex-wrap: wrap; }
  .step {
    display: flex; align-items: center; gap: 9px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 100px;
    padding: 7px 14px 7px 10px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink-2); cursor: pointer;
  }
  .step:hover { border-color: var(--brand); color: var(--ink); }
  .step[aria-current="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .step:active, .btn:active:not(:disabled) { transform: translateY(1px); }
  .step-n {
    display: grid; place-items: center; width: 21px; height: 21px; border-radius: 50%;
    background: var(--brand-soft); color: var(--badge-ink); font-size: 11.5px; font-weight: 800; flex-shrink: 0;
  }
  .step[aria-current="true"] .step-n { background: var(--brand); color: #04212B; }

  /* The stage name is the one thing in this row worth reading first. */
  .frame-title { font-weight: 700; color: var(--ink); letter-spacing: 0.01em; }
  .frame-note { color: var(--ink-3); }
  .btn { background: var(--surface); border: 1px solid var(--border); border-radius: 100px; padding: 7px 15px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--ink-2); cursor: pointer; }
  .btn:hover:not(:disabled) { border-color: var(--brand); color: var(--brand-deep); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-dark { background: var(--ink); border-color: var(--ink); color: #fff; }
  .btn-dark:hover:not(:disabled) { background: var(--brand-deep); border-color: var(--brand-deep); color: #fff; }
  /* Edge to edge and filling whatever is left. The embedded pages centre themselves,
     so a very wide frame costs nothing. min-height is the floor that makes the page
     scroll rather than the frame collapse when the controls take two or three rows. */
  iframe#stage, iframe#plans {
    display: block; flex: 1 1 auto; width: 100%; min-height: 420px;
    border: 0; border-top: 1px solid var(--border); background: #fff;
  }

  /* Seven pills plus three buttons need about 1250px to share a row. Below that the
     band wrapped and chrome went from 135px at 1280 to 209px at 1024, taking 74px
     off the stage with nothing gained. The sideways-scrolling rail was already
     written for phones; it belongs here too, so the band stays one row down to
     700px where the rest of the phone treatment takes over.

     mask-image fades the right edge, because a rail with no scrollbar and four
     stages off-screen gives no sign there is anything more to reach. */
  /* 1420, not 1100. Naming stage 8 after the attachment took the pills from 1019px
     to 1150px of natural width, and 1150 plus the 229px of actions plus the gap
     needs 1393px to sit on one row. At 1280 the band wrapped and chrome went from
     53px to 96px. The threshold has to clear the widest the row can actually be,
     not a round number, so it is measured plus a little margin: add a stage or
     lengthen a name and this is the number to recheck. */
  @media (max-width: 1420px) {
    /* .barline must stop wrapping, or the actions simply drop to a second row and
       the rail keeps its full width: that was the 74px of chrome this breakpoint
       exists to reclaim. With nowrap the rail is the item that gives, which is
       what we want, and it scrolls instead.

       On .steps: flex-basis auto with min-width 0, NOT 100%. A basis of 100% claims
       the whole row by itself, and min-width: 0 is what actually permits a flex
       item to shrink below its content width. */
    .barline { flex-wrap: nowrap; }
    /* The rail is the item that gives, so the buttons must not. Without this they
       were squeezed to 211px, their labels wrapped inside them, and .actions stood
       54px tall: the band went to two rows anyway, just for a different reason. */
    .actions { flex: none; }
    .steps {
      flex: 1 1 auto; min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;
      padding-bottom: 2px;
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
    }
    .steps::-webkit-scrollbar { display: none; }
    .step { flex: 0 0 auto; }
  }

  @media (max-width: 700px) {
    .masthead-tabs, .actions, .about { margin-left: 0; }
    /* The subtitle is orientation, not navigation. On a phone that row is worth more
       to the stage. */
    .masthead p { display: none; }
    /* On a phone the buttons get their own full-width row, so wrapping comes back
       on and the rail claims the whole line above them. */
    .barline { flex-wrap: wrap; }
    .actions { width: 100%; }
    .steps { flex: 1 1 100%; }
    iframe#stage, iframe#plans { min-height: 300px; }
  }
</style>
</head>
<body>

<div class="masthead">
  <div class="wrap">
    <h1>NeuroHome: plans and customer journey</h1>
    <p>The plans a family chooses between, and the journey a family actually takes.</p>
    <div class="masthead-tabs" role="tablist" aria-label="Sections">
      <button class="masthead-tab" role="tab" data-section="plans" aria-controls="section-plans">Plans</button>
      <button class="masthead-tab" role="tab" data-section="journey" aria-controls="section-journey">Customer journey</button>
    </div>
  </div>
</div>

<section class="sec" id="section-plans" role="tabpanel" hidden>
  <div class="band">
    <div class="wrap barline">
      <!-- role="group", not "tablist". See the note on #steps below: this is a button
           group driving a shared frame, and aria-current is the accurate state. -->
      <div class="steps" id="plan-tabs" role="group" aria-label="Plans"></div>
      <span class="actions"><button class="btn" id="plans-reload">Reset</button></span>
    </div>
    <div class="wrap hint">
      <span class="frame-title">Plans ${plansVersion()}</span>
      <span class="frame-note" id="plans-note"></span>
    </div>
  </div>
  <iframe id="plans" title="NeuroHome plans"></iframe>
</section>

<section class="sec" id="section-journey" role="tabpanel" hidden>
  <div class="band">
    <div class="wrap barline">
      <!-- role="group", not "tablist". These are a button group driving a shared
           frame that Back, Next and Reset drive too, not a tab set that owns its own
           panels: the iframe is not a tabpanel and belongs to no one control. A
           tablist here announced "tab list" and then offered no tabs, because the
           children are plain buttons. aria-current is the accurate state signal for
           "this is the stage you are on". The masthead's Plans / Customer journey
           pair IS a real tab set and keeps its tablist and tab roles. -->
      <div class="steps" id="steps" role="group" aria-label="Journey stages"></div>
      <span class="actions">
        <button class="btn" id="reload" title="Reload this stage from scratch">Reset</button>
        <button class="btn" id="prev">&larr; Back</button>
        <button class="btn btn-dark" id="next">Next &rarr;</button>
      </span>
    </div>
    <div class="wrap hint">
      <span class="frame-title" id="frame-title"></span>
      <span class="frame-note" id="frame-note"></span>
      <span class="req">Nothing is required.</span>
      <details class="about">
        <summary>About this file</summary>
        <p>Use the numbered stages or Next to move on with the forms left empty. Nothing you type leaves this
          page.</p>
        <p>Generated by <code>build.js</code> from the live index.html, start.html,
          thank-you.html and intake.html, plus sources/plans.html, funnel.html and
          intake-results.html. Every outbound webhook is disabled in these copies, so submitting a form here
          cannot create a lead or send an intake. Rebuild after editing any of those files.</p>
      </details>
    </div>
  </div>
  <iframe id="stage" title="Journey stage"></iframe>
</section>

<template id="tpl-plans">${buildPlans()}</template>
${STAGES.map(s => `<template id="tpl-${s.id}">${s.html}</template>`).join('\n')}

<script>
var STAGES = ${JSON.stringify(STAGES.map(s => ({ id: s.id, n: s.n, name: s.name, note: s.note })))};
var frame = document.getElementById('stage');
var stepsEl = document.getElementById('steps');
var i = 0;

stepsEl.innerHTML = STAGES.map(function (s, idx) {
  return '<button class="step" data-i="' + idx + '"><span class="step-n">' + s.n + '</span>' + s.name + '</button>';
}).join('');

function show(n) {
  i = Math.max(0, Math.min(STAGES.length - 1, n));
  var s = STAGES[i];
  // srcdoc rather than src: each stage is embedded in this file, so the whole
  // thing works offline with no sibling pages to resolve.
  frame.srcdoc = document.getElementById('tpl-' + s.id).innerHTML;
  document.getElementById('frame-title').textContent = s.n + '. ' + s.name;
  document.getElementById('frame-note').textContent = s.note;
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === STAGES.length - 1;
  [].forEach.call(stepsEl.children, function (b, idx) {
    b.setAttribute('aria-current', idx === i ? 'true' : 'false');
  });
}

stepsEl.addEventListener('click', function (e) {
  var b = e.target.closest('.step'); if (b) show(+b.dataset.i);
});
document.getElementById('prev').addEventListener('click', function () { show(i - 1); });
document.getElementById('next').addEventListener('click', function () { show(i + 1); });
document.getElementById('reload').addEventListener('click', function () { show(i); });

/* Stages ask the shell to move rather than navigating themselves, since a relative
   navigation inside a srcdoc frame has nothing to resolve against. Two things use
   this: the lead form's success path, so submitting it really does land on Thank
   you, and any link between the four pages, so "Start your intake" on the thank-you
   page opens the intake stage. */
window.addEventListener('message', function (e) {
  var want = e.data && e.data.journeyAdvance;
  if (!want) return;
  var idx = STAGES.map(function (s) { return s.id; }).indexOf(want);
  if (idx > -1) show(idx);
});

/* Section 1's sub-tabs are not authored here: they are read out of the embedded
   Plans document once it loads, and clicking one reaches in and clicks the real
   tab inside it. That way the programs listed here are always exactly the programs
   that document defines, and adding or renaming one upstream needs no change here.
   The document's own tab strip is hidden, so the control is not duplicated. */
var plansFrame = document.getElementById('plans');
var planTabsEl = document.getElementById('plan-tabs');
var plansNote = document.getElementById('plans-note');

/* SHELL CONTRACT, this half. The other half is the tab markup in
   sources/plans.html, which carries the same list in its <head>.
   Seven things in that file are load-bearing here; change one and this breaks:

     1. role="tab" on all four tabs        -> the querySelectorAll below finds none
     2. aria-controls prefixed "panel-"    -> same
     3. the four tabs share one parent     -> inner[0].parentNode hides the wrong
                                              thing, leaving two tab rails visible
     4. label is bare TEXT NODES, first    -> nameOf() blanks the pill label.
                                              Not obvious: wrapping the label in a
                                              <span> is enough to break it.
     5. meta is the FIRST ELEMENT CHILD    -> subOf() empties #plans-note.
                                              Not obvious: inserting any element
                                              before .tab-meta is enough.
     6. clicking the tab switches panels   -> inner[i].click() stops working
     7. DOM order of the four tabs         -> pill order and numbering desync

   If the rail ever renders with blank labels or no note text, start here. */
function wirePlanTabs() {
  var d = plansFrame.contentDocument;
  if (!d) return;
  var inner = [].slice.call(d.querySelectorAll('[role="tab"][aria-controls^="panel-"]'));
  if (!inner.length) {
    plansNote.textContent = 'Use the tabs inside the page to move between programs.';
    return;
  }
  // The strip inside the document duplicates what we are about to draw.
  var strip = inner[0].parentNode;
  if (strip) strip.style.display = 'none';

  /* Each of their tabs is a name in bare text followed by an element holding the
     price. Walk the leading text nodes for the name rather than splitting the whole
     textContent: no escape sequences, so nothing here can be mangled by the
     template literal this script is assembled inside. */
  function nameOf(t) {
    var s = '';
    for (var k = 0; k < t.childNodes.length; k++) {
      if (t.childNodes[k].nodeType !== 3) break;
      s += t.childNodes[k].textContent;
    }
    s = s.trim();
    return s || (t.textContent || '').trim();
  }
  function subOf(t) {
    var el = t.firstElementChild;
    return el ? (el.textContent || '').trim() : '';
  }

  /* No role="tab" on these. Their container is a role="group", and a tab outside a
     tablist is invalid: it would announce as a tab belonging to nothing. Plain
     buttons carrying aria-current, matching the journey rail. */
  planTabsEl.innerHTML = inner.map(function (t, i) {
    return '<button class="step" data-plan="' + i + '">' +
           '<span class="step-n">' + (i + 1) + '</span>' + nameOf(t) + '</button>';
  }).join('');

  function selectPlan(i) {
    inner[i].click();
    [].forEach.call(planTabsEl.children, function (b, idx) {
      b.setAttribute('aria-current', idx === i ? 'true' : 'false');
    });
    plansNote.textContent = subOf(inner[i]);
  }
  planTabsEl.onclick = function (e) {
    var b = e.target.closest('.step');
    if (b) selectPlan(+b.dataset.plan);
  };
  selectPlan(0);
}

function loadPlans() {
  plansFrame.srcdoc = document.getElementById('tpl-plans').innerHTML;
}
plansFrame.addEventListener('load', wirePlanTabs);
document.getElementById('plans-reload').addEventListener('click', loadPlans);

// ---- top level: one section visible at a time -----------------------------
var sections = { plans: document.getElementById('section-plans'),
                 journey: document.getElementById('section-journey') };
var sectionTabs = [].slice.call(document.querySelectorAll('.masthead-tab'));

function showSection(name) {
  Object.keys(sections).forEach(function (k) { sections[k].hidden = k !== name; });
  sectionTabs.forEach(function (t) {
    var on = t.dataset.section === name;
    t.setAttribute('aria-current', on ? 'true' : 'false');
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  window.scrollTo(0, 0);
}
sectionTabs.forEach(function (t) {
  t.addEventListener('click', function () { showSection(t.dataset.section); });
});

loadPlans();
show(0);
showSection('plans');
<\/script>
</body>
</html>
`;

/* Parse the shell's own script before writing, for the same reason the guard is
   checked: it is assembled inside a template literal, so an escape sequence in it
   is eaten before it reaches the output. That has produced an invalid emitted
   script twice now, and the symptom is a page that simply does not initialise. */
const shellScript = shell.slice(shell.lastIndexOf('<script>') + '<script>'.length,
                               shell.lastIndexOf('</' + 'script>'));
try {
  new Function(shellScript);
} catch (e) {
  throw new Error(`the shell script does not parse (${e.message}). Check for escape sequences eaten by the template literal.`);
}

fs.writeFileSync(path.join(here, 'journey.html'), shell);
const kb = n => (n / 1024).toFixed(0) + 'KB';
console.log('journey.html written, ' + kb(shell.length));
// Padded to the longest name rather than a fixed 18, which the attachment-named
// stage overran and ran straight into its own size.
const nameCol = Math.max(...STAGES.map(s => s.name.length)) + 2;
STAGES.forEach(s => console.log('  stage ' + s.n + '  ' + s.name.padEnd(nameCol) + kb(s.html.length)));
console.log('\nimages inlined: ' + kb(inlinedImageBytes) + ' of data URIs, so the file carries its own pictures.');
console.log('webhooks emptied and transport stubbed in every stage.');
console.log(`\nfamily: ${FAMILY.parentFirst} ${FAMILY.parentLast} and ${FAMILY.childFirst}, ${FAMILY.childAge}, `
  + `${FAMILY.state}. ${SEEDED_COUNT} answers seeded, same in every stage.`);
FAMILY.domains.forEach(d => {
  const level = domainLevel(d.from);
  console.log(`  ${SAID[level].padEnd(24)} ${d.name}  (from phenotype ${d.from.join(', ')})`);
});
