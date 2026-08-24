# NeuroHome journey preview

One file, `journey.html`, holding the plan data and the whole customer journey, so
the flow can be reviewed end to end without a server and without filling anything in.

Nine stages: the landing page, the lead form, the thank you, the ten day nurture
funnel, the intake, the intake submitted screen, the email a family gets, the seven
page letter it carries, and the checkout.

## This repo does not build on its own, on purpose

The build reads the **real** `index.html`, `start.html`, `thank-you.html` and
`intake.html` from the site repo every time it runs. It never keeps copies of them.
That is the whole point: a pasted snapshot of four pages is a fork, and it starts
rotting the moment somebody edits a real page.

So clone both side by side:

```
C:\dev\neurohome-landing    the public site
C:\dev\neurohome-journey    this
```

Then:

```
node build.js
```

If the site repo lives somewhere else, point at it:

```
SITE_DIR=/path/to/neurohome-landing node build.js
```

The build fails with an explanation rather than a stack trace if it cannot find it.

## Open it

**https://lopescapital-test.github.io/neurohome-journey/journey.html**

Nothing to install. It is one self-contained file: no server, no network, no build
step to read it.

## Why this is separate from the site repo

Separate because the site repo deploys to Vercel and this does not belong on the
website. Both repos are public.

Be deliberate about who you send the link to. `sources/plans.html`, and the Plans
tab of the preview built from it, carry labor rates, per-product COGS and gross
margins. `sources/funnel.html` carries the qualification strategy. That is fine for
anyone inside the company and a decision worth making on purpose for anyone outside
it.

## What is here

| Path | What it is |
|---|---|
| `build.js` | The build. Reads the site pages, embeds each stage in an iframe, disables everything that could reach production. |
| `intake-results.html` | The seven page letter a family gets after the intake. A self-extracting bundle exported from Claude Design. |
| `checkout.html` | The checkout. Same kind of bundle. |
| `email-preview.html` | The email that carries the letter, in an inbox view and a merge-tag view. The build lifts the family-facing half into stage 7. |
| `sources/plans.html` | Internal plan data: unit economics, margins, the Rover model. |
| `sources/funnel.html` | The ten day nurture sequence. |

## What the build guarantees

A review artifact must not be able to touch production, so three things are broken
deliberately in the embedded copies:

- the two GHL webhook URLs and the intake progress ping are emptied
- `fetch`, XHR and `sendBeacon` are stubbed, so a URL missed above still goes nowhere
  and the success paths still render
- `start.html`'s redirect advances the shell instead, since a relative navigation
  inside a `srcdoc` frame has no base to resolve

The build throws if a live webhook URL, the booking calendar, or a referenced but
missing image survives. Verify with the network panel: nothing should reach
leadconnectorhq.com.

## The seeded family

One invented family, Maria Alvarez and Leo, is filled into every stage that shows a
name or an answer, so the walkthrough reads as one person moving through it.
`example.com` and the 555 prefix are both reserved for fiction.

The 121 intake answers are generated from `FAMILY.severity` in `build.js`, and the
seed self-checks against the real clinical engine on load: if a severity change stops
the intake routing cleanly, the console says so, because a letter recommending a
program the engine refused to route to would be incoherent.
