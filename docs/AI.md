# AI Service Documentation

## Overview

The AI Service (`src/lib/ai/ai-service.ts`) provides AI-powered content generation for social media platforms. It supports both mock mode (for development/testing) and real OpenAI API calls.

## Configuration

### Environment Variables

- `MOCK_MODE=true` - Enable mock responses (no API calls)
- `OPENAI_API_KEY` - OpenAI API key for real AI generation

### Behavior

- If `MOCK_MODE=true` OR `OPENAI_API_KEY` is not set → Returns mock responses
- If `OPENAI_API_KEY` is set → Calls OpenAI GPT-4o-mini API

## API Endpoint

**POST** `/api/ai/generate`

### Request Body

```json
{
  "mediaItemIds": ["uuid1", "uuid2"],
  "action": "caption" | "title" | "hashtags" | "rewrite",
  "platform": "instagram" | "youtube" | "facebook" | "tiktok",
  "tone": "engaging" | "professional" | "casual" | "exciting"
}
```

### Response

```json
{
  "success": true,
  "results": [
    { "mediaId": "uuid1", "generated": "generated content" },
    { "mediaId": "uuid2", "generated": "generated content" }
  ]
}
```

## Prompts Used

### Generate Caption
```
Eres copywriter para {platform}. Reescribe este caption para maximizar engagement, mantén tono original, máx 150 chars:

{original}
```

### Generate Title
```
Genera un título atractivo para {platform} basado en este contenido, máx 100 chars:

{original}
```

### Generate Hashtags
```
Genera {count} hashtags relevantes y de alto engagement para {platform}, separados por espacios. Solo los hashtags.
```

### Rewrite
```
Reescribe este texto con tono "{tone}", mantén el significado original, máx 150 chars:

{text}
```

### Adapt for Platform
```
Adapta este contenido para {platform}, optimiza para la plataforma, incluye hashtags relevantes, máx 150 chars:

{content}
```

## Mock Responses

When in mock mode, responses follow this pattern:

- **Caption**: `[IA] caption para {platform}: {original.slice(0,80)}... #viral #fyp #trending`
- **Title**: `[IA] título para {platform}: {original.slice(0,60)}...`
- **Hashtags**: `#viral #fyp #trending #social #content #engagement #reels #shorts` (up to requested count)
- **Rewrite**: `[IA] reescrito ({tone}): {text.slice(0,80)}...`
- **Adapt**: `[IA] adaptado para {platform}: {content.slice(0,80)}... #viral #fyp`

## Security

- API keys are only used server-side (in `ai-service.ts`)
- No API keys are exposed to the frontend
- All requests verify user ownership of media items via Supabase RLS