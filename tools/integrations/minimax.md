# MiniMax (Hailuo)

AI video generation platform. Generate original marketing footage from text prompts — B-roll, hero shots, and scenes you can't practically film — with strong character consistency across clips. Powered by the Hailuo video models.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | Yes | REST API for text-to-video generation, task polling, and file retrieval |
| MCP | - | - |
| CLI | Yes | [minimax-video.js](../clis/minimax-video.js) — zero-dependency, single-file |
| SDK | - | - |

## Authentication

- **Type**: Bearer token
- **Header**: `Authorization: Bearer {api_key}`
- **Environment variable**: `MINIMAX_API_KEY`
- **Get key**: API key section of the MiniMax platform console

## Regional Endpoints

Pick the region closest to your account. The global (English) region is the default.

| Region | Host | Docs |
|--------|------|------|
| `global_en` | `https://api.minimax.io` | [platform.minimax.io/docs](https://platform.minimax.io/docs/api-reference/video-generation-t2v) |
| `cn_zh` | `https://api.minimaxi.com` | [platform.minimaxi.com/docs](https://platform.minimaxi.com/docs/api-reference/video-generation-t2v) |

Select the region with `--region <global_en|cn_zh>` on the CLI (or the `MINIMAX_REGION` environment variable). Set `MINIMAX_BASE_URL` to override the host entirely.

## Models

Text-to-video is an asynchronous flow: submit a generation task, poll until it completes, then retrieve the finished file.

| Model | Notes |
|-------|-------|
| `MiniMax-Hailuo-2.3` | Current default — highest fidelity |
| `MiniMax-Hailuo-2.3-Fast` | Faster generation, lower cost |
| `MiniMax-Hailuo-02` | Previous-generation Hailuo |
| `T2V-01-Director` | Director model with camera-movement control |
| `T2V-01` | Base text-to-video model |

## CLI Quick Start

```bash
# Preview any request without sending it (key is masked)
node tools/clis/minimax-video.js video generate \
  --prompt "A close-up of hands typing on a laptop, warm office lighting, camera slowly pulls back" \
  --duration 6 --resolution 1080P --prompt-optimizer true --dry-run

# 1. Submit a generation task → returns task_id
node tools/clis/minimax-video.js video generate \
  --prompt "A close-up of hands typing on a laptop, warm office lighting" \
  --model MiniMax-Hailuo-2.3 --duration 6 --resolution 1080P

# 2. Poll the task until status is complete → returns file_id when done
node tools/clis/minimax-video.js video status --task-id TASK_ID

# 3. Retrieve the finished video file
node tools/clis/minimax-video.js video download --file-id FILE_ID

# List available text-to-video models
node tools/clis/minimax-video.js models
```

## API Quick Start

### Submit a Text-to-Video Task

```bash
curl -X POST https://api.minimax.io/v1/video_generation \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MiniMax-Hailuo-2.3",
    "prompt": "A close-up of hands typing on a laptop, warm office lighting",
    "duration": 6,
    "resolution": "1080P",
    "prompt_optimizer": true
  }'
```

Accepted request fields: `model`, `prompt`, `prompt_optimizer`, `fast_pretreatment`, `duration`, `resolution`, `callback_url`.

### Poll the Task

```bash
curl "https://api.minimax.io/v1/query/video_generation?task_id=TASK_ID" \
  -H "Authorization: Bearer $MINIMAX_API_KEY"
```

Returns `status` and, once finished, a `file_id`.

### Retrieve the File

```bash
curl "https://api.minimax.io/v1/files/retrieve?file_id=FILE_ID" \
  -H "Authorization: Bearer $MINIMAX_API_KEY"
```

Response fields across these operations: `task_id`, `status`, `file_id`, `base_resp.status_code`.

## Common Marketing Use Cases

| Use Case | Approach |
|----------|----------|
| Hero visuals | Generate a cinematic hero shot from a scene description |
| B-roll | Text prompts for background footage you can't easily film |
| Consistent scenes | Reuse subject/style phrasing across shots for character consistency |
| Ad concept testing | Rapidly generate short clips to validate a creative direction |
| Social short-form | Vertical clips for feeds and stories |

## Relevant Skills

- video
- social
- ad-creative
