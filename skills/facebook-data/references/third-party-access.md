# Third-Party Access Reference

For Facebook data Meta does not expose officially — arbitrary public Groups, cross-Page comment mining, public profile posts. Commercial scraping providers are the only route that works here.

Read `compliance.md` before running anything in this file. This route sits outside Meta's Terms of Service and returns other people's personal data.

## Provider Landscape

| Provider | Access | Notes |
|---|---|---|
| **Monid** | CLI over a catalog of ~1,700 endpoints, prepaid per-result billing | Fronts Apify and others behind one balance and one auth. Best fit when you want several sources without managing several accounts. |
| **Apify** | Direct account, per-actor pricing | The underlying actors for most Facebook endpoints. Direct use gives finer control and the actor's own docs. |
| **Bright Data / Oxylabs** | Enterprise contracts | Higher volume, higher commitment, more sales friction. |

The endpoints below are addressed through Monid, since that's what this repo's tooling assumes. The same Apify actors are reachable directly if the user already has an Apify account — check that first, because **routing through Monid when the user already pays Apify spends money twice.**

## Available Facebook Endpoints

| Endpoint | Returns | Price (per result) |
|---|---|---|
| `/apify/facebook-pages-scraper` | Page/profile data: contact info, likes, followers, ratings | $0.015 |
| `/apify/facebook-groups-scraper` | Posts and comments from public Groups | $0.006 |
| `/apify/facebook-comments-scraper` | Comments and threaded replies on posts, photos, videos, reels | $0.003 + $0.001 flat |
| `/apify/facebook-reviews-scraper` | Business Page reviews with ratings and reviewer info | $0.003 + $0.001 flat |
| `/cleansyntax/facebook-profile-posts-scraper` | Public profile posts, profile details, profile ID | $0.009 |
| `/apify/facebook-events-scraper` | Event listings by search query, Page or URL | $0.015 |

All are tagged `verified` in the catalog. Prices are current as of this skill's release — confirm with `monid discover` before quoting a figure to the user.

## Workflow

Always **discover → inspect → run**. Never skip inspect.

```bash
# 1. Find what exists for the need
monid discover -q "facebook group posts"

# 2. Read the input schema — this is the source of truth for parameter names
monid inspect -p apify -e /apify/facebook-groups-scraper

# 3. Run with a small limit first
monid run -p apify -e /apify/facebook-groups-scraper \
  -i '{"startUrls":[{"url":"https://www.facebook.com/groups/example"}],"resultsLimit":10}'
# -> Run ID: 01HXYZ...

# 4. Poll until COMPLETED, then save
monid runs get -r 01HXYZ... -o group_posts.json
```

**The input JSON above is illustrative, not authoritative.** Parameter names differ per actor and change without notice — `startUrls` vs `groupUrls`, `resultsLimit` vs `maxItems` vs `maxPosts`. Run `monid inspect` and map its `input` block: `body` → `-i`, `queryParams` → `--query`, `pathParams` → `--path`. Guessing wastes money on failed runs that still bill for partial results.

Add `-j` for machine-readable output when you're parsing rather than reading.

## Run Lifecycle

| Status | Meaning |
|---|---|
| `READY` | Queued |
| `RUNNING` | Executing |
| `COMPLETED` | Done, results available |
| `FAILED` | Check error detail; usually bad input |
| `BLOCKED` | A workspace budget or run cap stopped it — **terminal**, tell the user |
| `TIMED_OUT` | Exceeded its limit |

Status values are uppercase and case-sensitive. Runs typically take 1–120 seconds. Poll every 5–10 seconds rather than using `--wait` in an interactive session, so the conversation stays responsive.

A `BLOCKED` run will not self-resolve. Report which control blocked it and point the user at their dashboard.

## Cost Control

Per-result billing plus per-query limits is where budgets get destroyed.

**The trap:** limit parameters usually apply **per query, not per call**. Three Group URLs with `resultsLimit: 100` bills for up to 300 results, not 100.

Rules:

- One URL, term or hashtag per call unless the user explicitly asked for more.
- First run at 5–10 results to validate output shape. Scale only after seeing real fields.
- Identify the volume parameter from `monid inspect` before scaling — it is not always named what you expect.
- Set a workspace budget and run cap in the dashboard before any scheduled job.
- For recurring monitoring, pull **deltas** — filter by date and fetch only what's new. Re-scraping full history nightly is the single most common way to burn a balance.

Estimate before running anything large:

```
results × unit price × frequency = monthly cost
```

Put that number in front of the user. "Roughly $18/month for daily monitoring of 4 Pages" is a decision. A surprise invoice is not.

## Data Quality

Brief the user honestly on what scraped data is and isn't.

**What you get:** a snapshot of what a logged-out viewer could see at that moment.

**What's missing or unreliable:**

- **No reach or impressions.** Owner-only metrics. Any vendor claiming competitor reach is modelling an estimate.
- **Truncated comment threads.** Deep reply chains are commonly cut at some depth.
- **Inconsistent fields.** A field present on one row may be absent on the next; write parsers defensively and never assume a key exists.
- **Engagement counts are point-in-time** and drift as a post ages.
- **Silent breakage.** When Facebook changes its markup, actors return empty or partial results rather than erroring. A run that "succeeds" with 0 results usually means the actor broke, not that there were no posts.
- **No historical backfill.** You generally get what's currently visible, not an archive.

**Validate before trusting.** Open two or three source URLs by hand and compare against the scraped rows. If counts or text don't match, the actor is stale — check its health status and consider an alternative endpoint.

Good enough for: themes, volume trends, verbatim language, sentiment direction, competitive cadence.

Not good enough for: anything that must reconcile to a number, anything reported as fact to a client without caveat, or anything feeding an automated decision.

## Output Handling

Always save to a file (`-o results.json`) — re-running to recover lost output bills you twice.

Then, in order:

1. **Aggregate immediately.** Turn rows into counts, themes and quotes.
2. **Drop personal fields** you don't need — names, profile URLs, IDs — once aggregation is done.
3. **Store the aggregate, delete the raw.** Set the deletion date before the first pull.

The raw scrape is the liability; the aggregate is the asset. Minimizing how long the former exists is the cheapest compliance measure available.
