#!/usr/bin/env node

// MiniMax (Hailuo) text-to-video CLI for marketing footage generation.
// Text-to-video is an async flow: submit a generation task, poll for status,
// then retrieve the finished file. This CLI wraps those three steps.

const API_KEY = process.env.MINIMAX_API_KEY

// Regional endpoints. Global (English) is the default; the mainland China
// region uses a different host. Override the host entirely with MINIMAX_BASE_URL.
const REGIONS = {
  global_en: 'https://api.minimax.io',
  cn_zh: 'https://api.minimaxi.com',
}

// Text-to-video models. Hailuo 2.3 is the current default.
const T2V_MODELS = [
  'MiniMax-Hailuo-2.3',
  'MiniMax-Hailuo-2.3-Fast',
  'MiniMax-Hailuo-02',
  'T2V-01-Director',
  'T2V-01',
]
const DEFAULT_MODEL = 'MiniMax-Hailuo-2.3'

// Request fields accepted by the text-to-video operation.
const T2V_FIELDS = ['model', 'prompt', 'prompt_optimizer', 'fast_pretreatment', 'duration', 'resolution', 'callback_url']

function parseArgs(argv) {
  const result = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        result[key] = next
        i++
      } else {
        result[key] = true
      }
    } else {
      result._.push(arg)
    }
  }
  return result
}

const args = parseArgs(process.argv.slice(2))
const [cmd, sub] = args._

const region = args.region || process.env.MINIMAX_REGION || 'global_en'
if (!REGIONS[region]) {
  console.error(JSON.stringify({ error: `Unknown region "${region}". Use: ${Object.keys(REGIONS).join(', ')}` }))
  process.exit(1)
}
const BASE_URL = process.env.MINIMAX_BASE_URL || REGIONS[region]

async function api(method, path, body) {
  if (args['dry-run']) {
    return {
      _dry_run: true,
      method,
      url: `${BASE_URL}${path}`,
      headers: { 'Authorization': 'Bearer ***', 'Content-Type': 'application/json' },
      body: body || undefined,
    }
  }
  if (!API_KEY) {
    return { error: 'MINIMAX_API_KEY environment variable required' }
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { status: res.status, body: text }
  }
}

// Numeric flags stay numeric so the API sees the right JSON types.
function numeric(value) {
  const n = Number(value)
  return Number.isNaN(n) ? value : n
}

async function main() {
  let result

  switch (cmd) {
    case 'video':
      switch (sub) {
        case 'generate': {
          const prompt = args.prompt
          if (!prompt) { result = { error: '--prompt required' }; break }
          const body = { model: args.model || DEFAULT_MODEL, prompt }
          if (args['prompt-optimizer'] !== undefined) body.prompt_optimizer = args['prompt-optimizer'] !== 'false'
          if (args['fast-pretreatment'] !== undefined) body.fast_pretreatment = args['fast-pretreatment'] !== 'false'
          if (args.duration !== undefined) body.duration = numeric(args.duration)
          if (args.resolution) body.resolution = args.resolution
          if (args['callback-url']) body.callback_url = args['callback-url']
          result = await api('POST', '/v1/video_generation', body)
          break
        }
        case 'status': {
          const taskId = args['task-id']
          if (!taskId) { result = { error: '--task-id required' }; break }
          result = await api('GET', `/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`)
          break
        }
        case 'download': {
          const fileId = args['file-id']
          if (!fileId) { result = { error: '--file-id required' }; break }
          result = await api('GET', `/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`)
          break
        }
        default:
          result = { error: 'Unknown video subcommand. Use: generate, status, download' }
      }
      break

    case 'models':
      result = { default: DEFAULT_MODEL, text_to_video: T2V_MODELS }
      break

    default:
      result = {
        error: 'Unknown command',
        usage: {
          video: 'video [generate --prompt <text> [--model <id>] [--duration <n>] [--resolution <res>] [--prompt-optimizer <bool>] [--fast-pretreatment <bool>] [--callback-url <url>] | status --task-id <id> | download --file-id <id>]',
          models: 'models',
          options: '--region <global_en|cn_zh> --dry-run',
          fields: T2V_FIELDS,
        },
      }
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
})
