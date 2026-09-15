#!/usr/bin/env node

/**
 * fb-comments — read comments from Facebook Pages and Groups via the Graph API.
 *
 * Zero dependencies. Node 18+ (uses global fetch).
 *
 * Auth:
 *   FB_TOKEN        Page access token (Pages) or user token (Groups). Required.
 *   FB_API_VERSION  Graph API version. Default v21.0.
 *                   Meta deprecates versions on a ~2 year cycle — if you get
 *                   "Unsupported get request" or a version error, bump this and
 *                   check developers.facebook.com/docs/graph-api/changelog
 *
 * Quick start:
 *   export FB_TOKEN="your-token"
 *   node fb-comments.js pages                        # find your Page ID + token
 *   node fb-comments.js page-comments --page <ID>    # every comment, all posts
 */

const TOKEN = process.env.FB_TOKEN
const API_VERSION = process.env.FB_API_VERSION || 'v21.0'
const BASE = `https://graph.facebook.com/${API_VERSION}`

// ---------------------------------------------------------------- arg parsing

function parseArgs(argv) {
  const cmd = argv[2]
  const flags = {}
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }
  return { cmd, flags }
}

const { cmd, flags } = parseArgs(process.argv)

const USAGE = `
fb-comments — read Facebook Page and Group comments via the Graph API

  Setup
    token-info                      Show token scopes, expiry, and validity
    exchange --app-id <> --app-secret <> --token <>
                                    Short-lived token -> long-lived (~60 days)
    pages                           List Pages you manage, with their tokens

  Reading comments
    posts         --page  <id>      Recent posts on a Page
    comments      --post  <id>      Comments on one post (+ nested replies)
    page-comments --page  <id>      Every comment across a Page's recent posts
    group-posts   --group <id>      Posts in a Group (app must be installed)
    group-comments --group <id>     Every comment across a Group's recent posts

  Options
    --limit <n>      Items per API page (default 100, max 100)
    --max-posts <n>  Cap posts scanned (default 25)
    --max-pages <n>  Cap pagination pages per resource (default 20)
    --since <date>   Only posts after this ISO date, e.g. 2026-01-01
    --replies        Fetch nested replies for each top-level comment
    --format <fmt>   json (default) | csv | ndjson
    --out <file>     Write to file instead of stdout
    --verbose        Log progress and rate-limit usage to stderr

  Examples
    node fb-comments.js pages
    node fb-comments.js page-comments --page 1234 --replies --format csv --out c.csv
    node fb-comments.js comments --post 1234_5678 --replies
    node fb-comments.js group-comments --group 9876 --since 2026-09-01
`

// ------------------------------------------------------------------ utilities

const log = (...a) => { if (flags.verbose) console.error('[fb]', ...a) }

function fail(msg, hint) {
  console.error(`error: ${msg}`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Meta reports quota in X-Business-Use-Case-Usage (per-Page) and X-App-Usage.
 * Back off proactively at 75% — once throttled, regaining access can take an
 * hour, which is far more expensive than pausing here.
 */
async function checkRateLimit(res) {
  const raw = res.headers.get('x-business-use-case-usage') || res.headers.get('x-app-usage')
  if (!raw) return
  let usage
  try { usage = JSON.parse(raw) } catch { return }

  const pcts = []
  const collect = (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of ['call_count', 'total_cputime', 'total_time']) {
      if (typeof o[k] === 'number') pcts.push(o[k])
    }
  }
  if (Array.isArray(usage)) usage.forEach(collect)
  else for (const v of Object.values(usage)) Array.isArray(v) ? v.forEach(collect) : collect(v)
  collect(usage)

  const peak = pcts.length ? Math.max(...pcts) : 0
  if (peak >= 95) {
    log(`rate limit at ${peak}% — pausing 60s`)
    await sleep(60000)
  } else if (peak >= 75) {
    log(`rate limit at ${peak}% — pausing 10s`)
    await sleep(10000)
  }
}

const RETRYABLE = new Set([1, 2, 4, 17, 32, 341, 613])

async function api(path, params = {}, token = TOKEN, attempt = 0) {
  const url = new URL(path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`)
  // A `next` cursor URL already carries its querystring; don't clobber it.
  if (!path.startsWith('http')) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
    url.searchParams.set('access_token', token)
  }

  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (e) {
    if (attempt < 4) {
      const wait = 2 ** attempt * 1000
      log(`network error, retrying in ${wait}ms: ${e.message}`)
      await sleep(wait)
      return api(path, params, token, attempt + 1)
    }
    fail(`network error after retries: ${e.message}`)
  }

  await checkRateLimit(res)
  const body = await res.json().catch(() => ({}))

  if (body.error) {
    const { code, message, error_subcode } = body.error
    if (RETRYABLE.has(code) && attempt < 4) {
      const wait = 2 ** attempt * 5000
      log(`API code ${code}, retrying in ${wait}ms`)
      await sleep(wait)
      return api(path, params, token, attempt + 1)
    }
    const hints = {
      190: 'Token invalid or expired. Regenerate it, or run `token-info` to inspect.',
      200: 'Missing permission. Needs pages_read_engagement + pages_read_user_content.',
      10: "This needs Page Public Content Access — you're reading a Page you don't own.",
      100: `Invalid field or parameter for ${API_VERSION}. Try a newer FB_API_VERSION.`,
      803: 'Object not found, deleted, or not visible to this token.',
    }
    fail(`Graph API ${code}${error_subcode ? `/${error_subcode}` : ''}: ${message}`, hints[code])
  }

  return body
}

/** Follow cursor pagination. Always capped — an uncapped loop eats the quota. */
async function paginate(path, params, token = TOKEN, maxPages = Number(flags['max-pages']) || 20) {
  const out = []
  let next = null
  let pages = 0

  while (pages < maxPages) {
    const body = next ? await api(next, {}, token) : await api(path, params, token)
    const batch = body.data || []
    out.push(...batch)
    pages++
    next = body.paging?.next || null
    if (!next || batch.length === 0) break
    log(`  page ${pages}: +${batch.length} (total ${out.length})`)
  }

  if (next) log(`stopped at --max-pages ${maxPages}; more data remains`)
  return out
}

// -------------------------------------------------------------------- output

function toCSV(rows) {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

function emit(data) {
  const fmt = flags.format || 'json'
  let text
  if (fmt === 'csv') text = toCSV(Array.isArray(data) ? data : [data])
  else if (fmt === 'ndjson') text = (Array.isArray(data) ? data : [data]).map((d) => JSON.stringify(d)).join('\n')
  else text = JSON.stringify(data, null, 2)

  if (flags.out) {
    require('fs').writeFileSync(flags.out, text)
    const n = Array.isArray(data) ? data.length : 1
    console.error(`wrote ${n} record${n === 1 ? '' : 's'} to ${flags.out}`)
  } else {
    console.log(text)
  }
}

// ------------------------------------------------------------------- shaping

const COMMENT_FIELDS = 'id,message,created_time,like_count,comment_count,from{id,name},permalink_url'
const POST_FIELDS =
  'id,message,story,created_time,permalink_url,shares,' +
  'reactions.summary(true).limit(0),comments.summary(true).limit(0)'

function shapeComment(c, ctx = {}) {
  return {
    comment_id: c.id,
    post_id: ctx.postId || null,
    parent_comment_id: ctx.parentId || null,
    is_reply: Boolean(ctx.parentId),
    message: c.message || '',
    created_time: c.created_time || null,
    author_name: c.from?.name || null,   // absent unless the commenter authorized the app
    author_id: c.from?.id || null,
    like_count: c.like_count ?? 0,
    reply_count: c.comment_count ?? 0,
    permalink: c.permalink_url || null,
  }
}

function shapePost(p) {
  return {
    post_id: p.id,
    message: p.message || p.story || '',
    created_time: p.created_time || null,
    permalink: p.permalink_url || null,
    shares: p.shares?.count ?? 0,
    reactions: p.reactions?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
  }
}

/** Comments on one post. With --replies, walks one level of nested replies. */
async function fetchPostComments(postId, token) {
  const params = {
    fields: COMMENT_FIELDS,
    filter: flags.replies ? 'toplevel' : 'stream',
    order: 'chronological',
    limit: Number(flags.limit) || 100,
  }

  const top = await paginate(`${postId}/comments`, params, token)
  const out = top.map((c) => shapeComment(c, { postId }))

  if (flags.replies) {
    for (const c of top) {
      if (!c.comment_count) continue
      const replies = await paginate(
        `${c.id}/comments`,
        { fields: COMMENT_FIELDS, limit: Number(flags.limit) || 100 },
        token
      )
      out.push(...replies.map((r) => shapeComment(r, { postId, parentId: c.id })))
    }
  }

  return out
}

/** Comments across every recent post on a Page or Group. */
async function fetchAllComments(ownerId, token, edge = 'posts') {
  const maxPosts = Number(flags['max-posts']) || 25
  const postParams = { fields: POST_FIELDS, limit: Math.min(maxPosts, 100) }
  if (flags.since) postParams.since = flags.since

  const posts = (await paginate(`${ownerId}/${edge}`, postParams, token)).slice(0, maxPosts)
  log(`${posts.length} post(s) to scan`)

  const all = []
  for (const [i, p] of posts.entries()) {
    const known = p.comments?.summary?.total_count
    if (known === 0) { log(`[${i + 1}/${posts.length}] ${p.id} — no comments, skipping`); continue }
    log(`[${i + 1}/${posts.length}] ${p.id}${known ? ` (~${known})` : ''}`)
    const comments = await fetchPostComments(p.id, token)
    for (const c of comments) c.post_message = (p.message || p.story || '').slice(0, 120)
    all.push(...comments)
  }

  log(`total: ${all.length} comment(s) across ${posts.length} post(s)`)
  return all
}

// ------------------------------------------------------------------ commands

async function main() {
  if (!cmd || cmd === 'help' || flags.help) { console.log(USAGE); process.exit(0) }
  if (!TOKEN) {
    fail('FB_TOKEN not set.', 'export FB_TOKEN="your-token" — get one from developers.facebook.com/tools/explorer')
  }

  switch (cmd) {
    case 'token-info': {
      const appId = flags['app-id'] || process.env.FB_APP_ID
      const appSecret = flags['app-secret'] || process.env.FB_APP_SECRET
      if (!appId || !appSecret) {
        fail('token-info needs app credentials.', 'Pass --app-id and --app-secret, or set FB_APP_ID / FB_APP_SECRET')
      }
      const r = await api('debug_token', { input_token: TOKEN }, `${appId}|${appSecret}`)
      const d = r.data || {}
      emit({
        valid: d.is_valid,
        type: d.type,
        app_id: d.app_id,
        scopes: d.scopes,
        expires_at: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never',
        data_access_expires_at: d.data_access_expires_at
          ? new Date(d.data_access_expires_at * 1000).toISOString() : null,
      })
      break
    }

    case 'exchange': {
      const appId = flags['app-id'] || process.env.FB_APP_ID
      const appSecret = flags['app-secret'] || process.env.FB_APP_SECRET
      const short = flags.token || TOKEN
      if (!appId || !appSecret) fail('exchange needs --app-id and --app-secret')
      const r = await api('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short,
      })
      emit({
        access_token: r.access_token,
        expires_in_days: r.expires_in ? Math.round(r.expires_in / 86400) : null,
        note: 'Long-lived user token. Now run `pages` to get non-expiring Page tokens.',
      })
      break
    }

    case 'pages': {
      const pages = await paginate('me/accounts', { fields: 'id,name,category,access_token,fan_count' })
      if (!pages.length) {
        fail('No Pages found for this token.', 'Check the token has pages_show_list and you manage at least one Page.')
      }
      emit(pages.map((p) => ({
        page_id: p.id,
        name: p.name,
        category: p.category,
        followers: p.fan_count ?? null,
        page_access_token: p.access_token,
      })))
      break
    }

    case 'posts': {
      if (!flags.page) fail('--page <id> required', 'Run `pages` to find your Page ID.')
      const params = { fields: POST_FIELDS, limit: Number(flags.limit) || 100 }
      if (flags.since) params.since = flags.since
      const posts = await paginate(`${flags.page}/posts`, params)
      emit(posts.slice(0, Number(flags['max-posts']) || posts.length).map(shapePost))
      break
    }

    case 'comments': {
      if (!flags.post) fail('--post <id> required', 'Post IDs look like PAGEID_POSTID. Get them from `posts`.')
      emit(await fetchPostComments(flags.post))
      break
    }

    case 'page-comments': {
      if (!flags.page) fail('--page <id> required', 'Run `pages` to find your Page ID.')
      emit(await fetchAllComments(flags.page, TOKEN, 'posts'))
      break
    }

    case 'group-posts': {
      if (!flags.group) fail('--group <id> required')
      const params = {
        fields: 'id,message,story,created_time,permalink_url,from{id,name},comments.summary(true).limit(0)',
        limit: Number(flags.limit) || 100,
      }
      if (flags.since) params.since = flags.since
      const posts = await paginate(`${flags.group}/feed`, params)
      emit(posts.slice(0, Number(flags['max-posts']) || posts.length).map((p) => ({
        post_id: p.id,
        message: p.message || p.story || '',
        created_time: p.created_time,
        author_name: p.from?.name || null,
        author_id: p.from?.id || null,
        comments: p.comments?.summary?.total_count ?? 0,
        permalink: p.permalink_url || null,
      })))
      break
    }

    case 'group-comments': {
      if (!flags.group) fail('--group <id> required')
      emit(await fetchAllComments(flags.group, TOKEN, 'feed'))
      break
    }

    default:
      console.error(`unknown command: ${cmd}`)
      console.log(USAGE)
      process.exit(1)
  }
}

main().catch((e) => fail(e.message))
