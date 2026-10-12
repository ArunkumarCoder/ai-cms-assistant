# Demo video script (~2.5 minutes)

A shot-by-shot script for recording the demo. Written for the seeded "Larkspur
Coffee Roasters" demo account (`npm run seed:demo` — see the main
[README](../../README.md#run-the-demo)). Plain narration, no hype words, no
"revolutionary"/"game-changing" — the product should speak for itself.

**Before recording, run the pre-flight checklist at the bottom of this file.**

## Live-AI vs. pre-baked, at a glance

| Beat | Live AI call? | Cost/latency risk |
|---|---|---|
| 1. Dashboard | No — reads seeded `AiCallLog`/`QualityScoreHistory` rows | None |
| 2. Open "Beans" (low score) | No — reads the seeded page | None |
| 3. Get AI suggestions (diff view) | **Yes** — `seo-scoring`, routes to Groq | Low cost, usually 1-3s. Can fail/timeout. |
| 4. Accept one, reject one | No — pure UI state, the suggestions are already on screen from step 3 | None |
| 5. Quality score rising | No — recomputed client-side the moment you accept (`SeoPanel`'s live `computeQualityScore`), confirmed by "Save changes" | None |
| 6. Generate a new page from a brief | **Yes** — `page-generation`, routes to Groq | The slowest live call in the demo, usually 3-8s. Can fail/timeout. |
| 7. FAQ generation + JSON-LD | **Yes** — `faq-generation`, routes to Groq | Low cost, usually 1-3s. Can fail/timeout. |
| 8. Media Library batch alt text | **Yes** — `alt-text-single` (vision), routes to OpenAI | Slowest per-item of the live calls; a 2-image batch is safer to record than "all flagged." |
| 9. Cost & Usage dashboard | No — reads seeded `AiCallLog` rows | None |
| 10. Closing line (adapter + AI layer) | No — narration over the Sites screen | None |

Five beats are completely safe to record any number of times, in any order,
with the camera rolling continuously. Four beats (3, 6, 7, 8) make a real API
call — see "Fallbacks for live steps" below before recording those.

## Shot list

### 1. Dashboard (0:00–0:20)

**On screen:** `/dashboard`, logged in as the demo account.

**Do:** Nothing yet — let it sit for 2 seconds so the viewer can read the
numbers, then point the cursor at the "Needs attention" list.

**Say:** "This is Larkspur Coffee Roasters — a seeded demo account with ten
real pages, deliberately mixed quality. The dashboard already knows which
pages need work: quality scores, flagged images, review status, all computed
from the actual content, not hand-entered."

### 2. Open the lowest-scoring page (0:20–0:35)

**On screen:** Click "Beans" in the Needs Attention list (quality score
40/100, status Draft).

**Do:** Click through to `/pages/demo-single-origin-beans`. Scroll past the
status panel to the Quality Score panel so "40/100 · Needs work" and the
three sub-scores (SEO 20/100, Readability, Structure) are all visible at
once.

**Say:** "This one scores 40 — the title's five characters, the meta
description doesn't say anything, there's no target keyword, and the body is
two sentences. Every one of those is a real, specific finding, not a vague
'needs improvement.'"

### 3. Get AI suggestions → diff view (0:35–1:00) — LIVE AI CALL

**On screen:** Scroll to the SEO panel's title/meta/keyword fields.

**Do:** Click **"Get AI suggestions."** Wait for the suggestion card(s) to
appear under the Title and/or Meta description fields in the SEO checklist.

**Say (while it loads):** "This calls a real language model — Groq, by
default — to suggest a better title and meta description grounded in this
page's own content." **Say (once the diff appears):** "Each suggestion shows
exactly what would change, side by side, before anything is applied."

**Fallback if slow/fails:** See "Fallbacks for live steps" below — do not
narrate over a stalled spinner for more than ~5 seconds.

### 4. Accept one, reject one (1:00–1:15)

**On screen:** The diff view from step 3, still on screen.

**Do:** Click **"Accept"** on the title suggestion. Click **"Reject"** on the
meta description suggestion (or vice versa — whichever pairing looks cleaner
on screen; the point is showing both controls work).

**Say:** "Accepting one just updates the field — it's still a draft until I
save. Rejecting the other keeps my own wording. Nothing here auto-publishes
anything."

### 5. Quality score rising, then save (1:15–1:30)

**On screen:** The Quality Score panel, same page.

**Do:** Point at the score — it's already recalculated live from the
accepted title, before any save. Click **"Save changes."** Wait for "Saved."
to appear.

**Say:** "The score updates as you type or accept a suggestion — this isn't
a batch job, it's live. Save, and that's a real write to the connected
site."

### 6. Generate a new page from a brief (1:30–1:55) — LIVE AI CALL

**On screen:** Navigate to `/pages/new`.

**Do:** Fill in **Working title** only (e.g. "Our Winter Blend") — leave
every optional field blank to show they're genuinely optional. Click
**"Generate draft."**

**Say (while it loads):** "One required field. Everything else — audience,
tone, key points — is optional. This is the slowest call in the demo,
usually single-digit seconds." **Say (once the draft appears):** "Title,
slug, meta description, and a full set of body blocks, all editable before
anything is saved."

**Fallback if slow/fails:** See below. Do not click Generate a second time
while a request is still in flight.

### 7. FAQ generation + JSON-LD (1:55–2:10) — LIVE AI CALL

**On screen:** Either the just-generated page (after saving it) or
`/pages/demo-pour-over-guide` (already has real content to generate FAQs
from, if you'd rather not wait for step 6's save round-trip).

**Do:** Scroll to the FAQs section. Click **"Generate FAQs."** Once they
appear, point at one answer, then (optional, if time allows) show the page's
`<script type="application/ld+json">` FAQPage markup via "View Page Source"
in a second tab.

**Say:** "FAQs generate from the page's own body content — no invented
facts. The same data also renders as FAQPage JSON-LD automatically, for
search engines, with no separate step."

### 8. Media Library batch alt text (2:10–2:25) — LIVE AI CALL

**On screen:** `/media`.

**Do:** Point at the "3 flagged" summary and the red "Missing" badges
(two of these are seeded that way on purpose — the wholesale and pour-over
images). Click **"Generate alt text for all flagged"** — or, if you want a
faster/cheaper shot, open one flagged card and click its own **"Generate alt
text"** button instead of the full batch.

**Say:** "This flags every image missing real alt text, then can generate
and review suggestions one at a time or as a batch — vision calls, so these
are the priciest ones in the app, which is exactly why they're batched and
reviewed, not auto-applied."

**Fallback if slow/fails:** Generate for one image, not the whole batch —
narrate the batch *button* without clicking it if time is short.

### 9. Cost & Usage dashboard (2:25–2:40)

**On screen:** Back to `/dashboard`, scrolled to "Cost & usage."

**Do:** Point at total spend, the spend-by-provider/by-feature breakdowns,
and the "1 call fell back to a different provider" banner if it's visible.

**Say:** "Every call this account has ever made is logged — provider, cost,
success or failure — including the handful I just made recording this. If
Groq's rate limit is ever hit, it falls back to OpenAI automatically, logged
as a fallback, not a silent failure."

### 10. Closing line (2:40–2:50)

**On screen:** `/sites` (shows the connected WordPress Site) or back to the
dashboard.

**Say:** "The content layer is CMS-agnostic — Sanity is the primary,
fully-supported adapter; this demo happens to run on WordPress, proving the
same interface works against a second, very different backend. The AI layer
is the same idea: one interface, three providers, with routing, caching,
rate limiting, and a hard spend cap in front of all of them."

## Fallbacks for live steps (3, 6, 7, 8)

1. **Before recording, warm the providers up** — load each live step once,
   off-camera, so DNS/TLS/cold-start latency doesn't eat into the recorded
   take.
2. **If a call is visibly slow (>5s with no response):** keep rolling, but
   stop narrating and let it breathe for at most 10 more seconds, then cut.
   In editing, trim the dead air and cross-fade, or cut to a second take.
3. **If a call fails outright:** the app shows a plain-English error (never
   a raw stack trace or provider error — see SPEC.md §35's error-message
   work), e.g. "The AI provider is busy right now — please try again in a
   moment." Narrate it as a real, honest feature ("and if the provider's
   down, you get a clear message, not a crash") and then click the same
   button again for a second attempt, OR cut and resume from a pre-recorded
   backup take of that one beat.
4. **Record each of the four live beats as its own short, separate clip**
   first, before attempting a full single continuous take — much easier to
   re-record one 15-second clip than the whole 2.5 minutes.
5. **Known-safe backup page for step 3** if "Beans" has already been edited
   by an earlier take: any other page with a short title/meta also works —
   `demo-wholesale` (missing meta description, missing target keyword) is
   the next-best candidate already seeded.

## Pre-flight checklist

Run through this immediately before recording, every time:

- [ ] **Seed fresh**: `npm run seed:demo -- --reset --i-know-this-is-not-prod`
      so every score/status/log matches this script exactly, with no
      leftover edits from a previous take.
- [ ] **Clear the AI response cache** by restarting the dev/prod server
      process (the cache is in-memory and per-process — SPEC.md §30 — so a
      fresh process start is a full clear; there's no separate "clear cache"
      button).
- [ ] **Check API keys are present and the spend cap has headroom**: open
      `/dashboard`'s Cost & Usage panel and confirm "Total spend" is well
      under `AI_MONTHLY_SPEND_CAP_USD` (default $20) — a capped demo account
      mid-recording fails every live step at once.
- [ ] **Browser window**: 1440×900 (matches `demo:shots`' desktop viewport —
      see below), 100% zoom, light mode (unless deliberately showing dark
      mode), no browser extensions' toolbar icons visible.
- [ ] **OS/browser chrome**: hide bookmarks bar, close unrelated tabs, turn
      on Do Not Disturb/mute notifications.
- [ ] **Log in fresh** at the start of the recording, from `/login` — don't
      start mid-session, so the first ~10 seconds can be trimmed cleanly if
      needed.
