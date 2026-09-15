# Graph API Reference

The official route. Free, sanctioned, and richer than any scraper for properties you own.

Meta versions the Graph API and deprecates versions on roughly a two-year cycle. Examples here use `v{VERSION}` — substitute the current version and check the [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog) before building, since permission names and response shapes do move between versions.

## App Setup

1. Create an app at `developers.facebook.com` → **Business** type.
2. Add products: **Facebook Login**, **Pages API**. Add **Webhooks** if you want push updates.
3. Complete **Business Verification** — needed to serve users who aren't role users on the app, not to read your own Pages.
4. Add a privacy policy URL and data deletion callback — App Review will reject without them.

### You do not need App Review to read your own Page

This is the step that stops people unnecessarily, so be explicit about it when guiding a user.

Meta gates permissions by **access level**, not by app mode:

| Access level | Whose data it reaches | App Review |
|---|---|---|
| **Standard** | Users with a **role on the app** — admins, developers, testers | No |
| **Advanced** | Anyone else (the general public) | Yes |

Page-read permissions start at Standard Access. So if the person owns the Page **and** is an admin on the app, Standard Access covers them and no review is required. App Review exists to let *other people's* accounts use your app — it is not a gate on reading your own data.

The practical consequence: someone with a Page can go from zero to reading their own comments in about fifteen minutes through the Graph API Explorer, with no review, no Business Verification and no waiting. Route them there first and let them see real data before proposing anything heavier.

Two ways this genuinely does bite:

- **Reading a Page you don't own** — that's `Page Public Content Access`, a separate feature request with its own review.
- **Shipping to other users** — the moment someone without an app role needs to connect their own Page, you need Advanced Access and review.

If a user hits a review wall while reading their own Page, the usual cause is that their Facebook account isn't actually a role user on the app, or the Page is owned by a Business they're not an admin of. Check both before assuming review is required.

## Permissions

Request only what the analysis needs. Every extra permission lengthens App Review and widens your breach surface.

| Permission | Grants | Needed for |
|---|---|---|
| `pages_show_list` | List Pages the user manages | Page picker on connect |
| `pages_read_engagement` | Posts, reactions, comment counts | Core post reads |
| `pages_read_user_content` | User comments and visitor posts on your Page | Comment mining, moderation |
| `read_insights` | Reach, impressions, demographics | Performance analysis |
| `pages_manage_posts` | Create/edit/delete posts | Publishing (see `social`) |
| `pages_manage_engagement` | Reply to / hide / delete comments | Moderation workflows |
| `Page Public Content Access` | Public content on Pages you don't own | Competitor monitoring at scale |

`Page Public Content Access` is a **feature**, not a permission — requested separately in App Review with its own justification and screencast.

## Tokens

Three kinds, and conflating them is the most common integration bug:

- **User access token** — short-lived (~1–2 hours), identifies a person.
- **Long-lived user token** — ~60 days, obtained by exchanging a short-lived one.
- **Page access token** — what you actually want for Page data. Derived from a long-lived user token; inherits its expiry.

Exchange flow:

```bash
# 1. Short-lived user token -> long-lived user token
curl -G "https://graph.facebook.com/v{VERSION}/oauth/access_token" \
  -d "grant_type=fb_exchange_token" \
  -d "client_id={APP_ID}" \
  -d "client_secret={APP_SECRET}" \
  -d "fb_exchange_token={SHORT_LIVED_TOKEN}"

# 2. Long-lived user token -> Page tokens for every Page the user manages
curl -G "https://graph.facebook.com/v{VERSION}/me/accounts" \
  -d "access_token={LONG_LIVED_USER_TOKEN}"
```

**Never hardcode tokens.** Store them encrypted, scoped per user, and refresh on a schedule ahead of expiry — not reactively on first 401. Use `/debug_token` to check expiry and granted scopes:

```bash
curl -G "https://graph.facebook.com/v{VERSION}/debug_token" \
  -d "input_token={TOKEN_TO_CHECK}" \
  -d "access_token={APP_ID}|{APP_SECRET}"
```

A Page token derived from a *System User* in Business Manager does not expire, which is the right choice for server-side monitoring that shouldn't break every 60 days.

## Core Endpoints

### Page posts

```bash
curl -G "https://graph.facebook.com/v{VERSION}/{PAGE_ID}/feed" \
  -d "fields=id,message,created_time,permalink_url,shares,reactions.summary(true),comments.summary(true)" \
  -d "limit=25" \
  -d "access_token={PAGE_TOKEN}"
```

`/feed` includes visitor posts; `/posts` returns only posts by the Page itself. Use `/published_posts` for the Page's own published posts including ones hidden from the public feed.

### Comments on a post

```bash
curl -G "https://graph.facebook.com/v{VERSION}/{POST_ID}/comments" \
  -d "fields=id,message,created_time,from,like_count,comment_count" \
  -d "filter=stream&order=reverse_chronological" \
  -d "limit=100" \
  -d "access_token={PAGE_TOKEN}"
```

`filter=stream` returns all comments including replies; `filter=toplevel` returns only top-level. Nested replies come from `/{COMMENT_ID}/comments`.

Note `from` is often absent for comments by users who haven't authorized your app — this is expected, not a bug, and it is a deliberate privacy boundary.

### Page insights (owner-only)

```bash
curl -G "https://graph.facebook.com/v{VERSION}/{PAGE_ID}/insights" \
  -d "metric=page_impressions,page_post_engagements,page_fans" \
  -d "period=day&since=2026-01-01&until=2026-01-31" \
  -d "access_token={PAGE_TOKEN}"
```

Per-post insights come from `/{POST_ID}/insights` with metrics like `post_impressions`, `post_clicks`, `post_reactions_by_type_total`. Metric names change between API versions more often than anything else — verify against the current [Insights reference](https://developers.facebook.com/docs/graph-api/reference/insights).

### Groups

Group access requires the app to be **installed in the Group by an admin** — there is no way to read a Group you don't administer.

```bash
curl -G "https://graph.facebook.com/v{VERSION}/{GROUP_ID}/feed" \
  -d "fields=id,message,created_time,from,comments.summary(true)" \
  -d "access_token={TOKEN}"
```

Meta sharply restricted Groups API access in 2020. Most historical tutorials describing broad Group reads no longer reflect reality.

## Pagination

Graph API uses cursor pagination. Follow `paging.next` until absent — never construct offsets by hand:

```python
import requests

def fetch_all(url, params, max_pages=50):
    results, pages = [], 0
    while url and pages < max_pages:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        payload = r.json()
        results.extend(payload.get("data", []))
        url = payload.get("paging", {}).get("next")
        params = None            # 'next' already carries the full querystring
        pages += 1
    return results
```

Always cap pages. An unbounded loop over a busy Page will exhaust your rate limit and stall every other job sharing the app.

## Rate Limits

Page-level calls are governed by **Business Use Case (BUC) rate limits**, calculated per Page per app on a rolling window that scales with the Page's engagement. Small Pages get small budgets.

Read the `X-Business-Use-Case-Usage` response header — it reports percentage of the call, CPU and total-time budgets consumed:

```python
import json

usage = json.loads(resp.headers.get("X-Business-Use-Case-Usage", "{}"))
for page_id, stats in usage.items():
    if any(s.get("call_count", 0) > 75 for s in stats):
        # back off before Meta does it for you
        ...
```

Back off at ~75% rather than waiting for a 429 — once throttled, `estimated_time_to_regain_access` can be an hour. Batch related reads into a single request where possible:

```bash
curl -X POST "https://graph.facebook.com/v{VERSION}" \
  -d "access_token={PAGE_TOKEN}" \
  -d 'batch=[{"method":"GET","relative_url":"{PAGE_ID}/feed?limit=25"},
             {"method":"GET","relative_url":"{PAGE_ID}/insights?metric=page_impressions"}]'
```

## Webhooks

For ongoing monitoring of your own Pages, webhooks beat polling on every axis — lower latency, no rate-limit burn, no missed events between polls.

1. Add the Webhooks product, subscribe to the `page` object.
2. Choose fields: `feed` (posts and comments), `mention`, `ratings` (reviews).
3. Expose an HTTPS endpoint that echoes `hub.challenge` on the `GET` verification request.
4. Subscribe each Page: `POST /{PAGE_ID}/subscribed_apps` with `subscribed_fields=feed,ratings`.
5. **Verify `X-Hub-Signature-256`** on every delivery — an unverified webhook endpoint accepts forged payloads from anyone who finds the URL.

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, app_secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        app_secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header or "")
```

Webhook payloads are notifications, not data — treat them as "something changed, go read it" and fetch the full object via the API.

## App Review

Anything beyond your own dev-mode assets needs review. What gets approved:

- A **screencast** showing the actual end-user flow that consumes each permission, in your live product.
- A written use case that names the user benefit, not the technical capability. "Page admins see all comments in one inbox" passes; "we need post data" does not.
- A working test account with credentials.
- A public privacy policy covering what you collect, why, retention, and deletion.
- A data deletion callback URL.

Common rejections: requesting permissions the screencast never exercises, a demo that only shows an admin dashboard rather than the user-facing benefit, and asking for `Page Public Content Access` without a research or brand-monitoring justification.

Budget two to four weeks including at least one round of back-and-forth. Build against dev mode in the meantime.

## Error Handling

| Code | Meaning | Response |
|---|---|---|
| 190 | Token invalid or expired | Refresh; re-prompt if the user revoked |
| 200 | Permission missing | Check granted scopes with `/debug_token` |
| 4 / 17 / 32 | Rate limit hit | Exponential backoff; read the usage header |
| 100 | Invalid parameter or field | Field may not exist in this API version |
| 10 | Requires PPCA | You're reading a Page you don't own |
| 803 | Object not visible | Deleted, private, or not accessible to this token |

Treat 190 and 200 as user-actionable (reconnect, re-authorize); treat 4/17/32 as automatic (back off and retry). Distinguishing them prevents pointless "please reconnect" prompts during a throttle.
