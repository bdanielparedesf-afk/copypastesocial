import type { ProviderId } from '@/types';

export interface AIPack {
  title: string;
  description: string;
  hashtags: string[];
}

export interface AIService {
  generateCaption(original: string, platform: ProviderId): Promise<string>;
  generateTitle(original: string, platform: ProviderId): Promise<string>;
  generateHashtags(count: number, platform: ProviderId, context?: string): Promise<string[]>;
  rewrite(text: string, tone: string): Promise<string>;
  adaptFor(platform: ProviderId, content: string): Promise<string>;
  /** Genera título + descripción + hashtags en una sola llamada (1 request). */
  generatePack(context: string, platform: ProviderId): Promise<AIPack>;
}

const mockHashtags = ['#viral', '#fyp', '#trending', '#social', '#content', '#engagement', '#reels', '#shorts'];

function getMockCaption(original: string, platform: ProviderId): string {
  const preview = original.slice(0, 80);
  return `[IA] caption para ${platform}: ${preview}... ${mockHashtags.slice(0, 3).join(' ')}`;
}

function getMockTitle(original: string, platform: ProviderId): string {
  const preview = original.slice(0, 60);
  return `[IA] título para ${platform}: ${preview}...`;
}

function getMockHashtags(count: number): string[] {
  return mockHashtags.slice(0, Math.min(count, mockHashtags.length));
}

function getMockRewrite(text: string, tone: string): string {
  const preview = text.slice(0, 80);
  return `[IA] reescrito (${tone}): ${preview}...`;
}

function getMockAdapt(platform: ProviderId, content: string): string {
  const preview = content.slice(0, 80);
  return `[IA] adaptado para ${platform}: ${preview}... ${mockHashtags.slice(0, 2).join(' ')}`;
}

function getMockPack(context: string, platform: ProviderId): AIPack {
  const clean = context
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\d]+/g, ' ')
    .trim() || 'mi video';
  const title = `${clean.charAt(0).toUpperCase()}${clean.slice(1)} ✨ ${platform === 'youtube' ? 'Shorts' : platform === 'tiktok' ? 'TikTok' : 'Reel'}`;
  return {
    title: title.slice(0, 95),
    description: `[IA] ${clean}: contenido optimizado para ${platform}. Sígueme para más. ${mockHashtags.slice(0, 3).join(' ')}`,
    hashtags: mockHashtags.slice(0, 8),
  };
}

function buildPackPrompt(context: string, platform: ProviderId): string {
  return `Genera metadatos de publicación para ${platform} a partir de este contexto de video: "${context}".\nResponde ÚNICAMENTE con JSON válido, sin markdown, sin bloques de código, sin explicaciones y sin texto fuera del JSON: {"title": "título atractivo de máx 95 caracteres", "description": "descripción optimizada para la plataforma de máx 200 caracteres", "hashtags": ["#hashtag", "8 hashtags relevantes"]}`;
}

function parsePack(raw: string, context: string, platform: ProviderId): AIPack {
  const fallback = getMockPack(context || 'video', platform);
  const jsonText = raw.replace(/```json|```/g, '').trim();
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as Partial<AIPack>;
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 95) : fallback.title,
      description:
        typeof parsed.description === 'string' && parsed.description.trim()
          ? parsed.description.trim().slice(0, 200)
          : fallback.description,
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
        ? parsed.hashtags.slice(0, 15).map((h) => {
            const t = String(h).replace(/[#*\s]+/g, ' ').trim();
            return `#${t.replace(/\s+/g, '')}`;
          })
        : fallback.hashtags,
    };
  } catch {
    // Fallback 2: extracción por regex cuando el JSON viene parcial/corrupto
    const title = jsonText.match(/"title"\s*:\s*"([^"]{4,95})"/)?.[1];
    const description = jsonText.match(/"description"\s*:\s*"([^"]{10,200})"/)?.[1];
    const hashtags = jsonText.match(/#[A-Za-z0-9_ÁÉÍÓÚáéíóúñÑüÜ]+/g);
    if (title || description || (hashtags && hashtags.length > 0)) {
      return {
        title: (title ?? fallback.title).slice(0, 95),
        description: (description ?? fallback.description).slice(0, 200),
        hashtags: hashtags && hashtags.length > 0 ? hashtags.slice(0, 15) : fallback.hashtags,
      };
    }
    console.warn('[ai-service] parsePack: salida no parseable:', raw.slice(0, 220));
    return fallback;
  }
}

const GEMINI_SYSTEM =
  'Eres un copywriter experto en redes sociales. Genera contenido optimizado para engagement.';

/**
 * Llama a Google Gemini (generativelanguage API).
 * Claves AI Studio (AIza...) y Vertex express (AQ...) funcionan con
 * el header `x-goog-api-key`. Si el modelo configurado no existe,
 * reintenta con el alias estable `gemini-flash-latest`.
 */
async function callGemini(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const configured = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const models = configured === 'gemini-flash-latest' ? [configured] : [configured, 'gemini-flash-latest'];

  let lastError = '';
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      };
      // Filtra partes de "thinking" (thought: true) típicas de Gemini 3.x
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => p && !p.thought && typeof p.text === 'string')
        .map((p) => p?.text ?? '')
        .join('')
        .trim();
      if (text) return text;
      lastError = `Gemini ${model}: respuesta vacía`;
      continue;
    }

    lastError = `Gemini ${model}: ${response.status} ${(await response.text()).slice(0, 180)}`;
  }

  throw new Error(`Gemini API error: ${lastError}`);
}

/**
 * Proveedor único para todas las generaciones.
 * Prioridad: Gemini (GEMINI_API_KEY) → OpenAI (OPENAI_API_KEY) → mock.
 * maxTokens holgado: los modelos Gemini 3.x "piensan" (thoughtsTokenCount)
 * y ese consumo descuenta del mismo presupuesto — con límites cortos el
 * JSON de salida queda truncado.
 */
async function callLLM(prompt: string, maxTokens = 2048): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini(prompt, maxTokens);
    } catch (err) {
      if (!process.env.OPENAI_API_KEY) throw err;
      console.error('[ai-service] Gemini falló, usando fallback OpenAI:', err);
    }
  }
  return callOpenAI(prompt, maxTokens);
}

async function callOpenAI(prompt: string, maxTokens = 200): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Eres un copywriter experto en redes sociales. Genera contenido optimizado para engagement.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? '';
}

function buildCaptionPrompt(original: string, platform: ProviderId): string {
  return `Eres copywriter para ${platform}. Reescribe este caption para maximizar engagement, mantén tono original, máx 150 chars:\n\n${original}`;
}

function buildTitlePrompt(original: string, platform: ProviderId): string {
  return `Genera un título atractivo para ${platform} basado en este contenido, máx 100 chars:\n\n${original}`;
}

function buildHashtagsPrompt(count: number, platform: ProviderId, context?: string): string {
  const base = `Genera ${count} hashtags relevantes y de alto engagement para ${platform}. Responde ÚNICAMENTE con los hashtags separados por espacios (formato: #tag1 #tag2 #tag3). Sin numeración, sin markdown, sin asteriscos, sin texto adicional.`;
  return context ? `${base} Contexto del contenido: ${context}.` : base;
}

function buildRewritePrompt(text: string, tone: string): string {
  return `Reescribe este texto con tono "${tone}", mantén el significado original, máx 150 chars:\n\n${text}`;
}

function buildAdaptPrompt(platform: ProviderId, content: string): string {
  return `Adapta este contenido para ${platform}, optimiza para la plataforma, incluye hashtags relevantes, máx 150 chars:\n\n${content}`;
}

export function createAIService(): AIService {
  // MOCK_MODE gobierna publicación/OAuth. La IA es real si hay clave de
  // Gemini u OpenAI configurada, independiente del modo mock.
  const useMock = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY;

  return {
    async generateCaption(original: string, platform: ProviderId): Promise<string> {
      if (useMock) {
        return getMockCaption(original, platform);
      }
      const prompt = buildCaptionPrompt(original, platform);
      return callLLM(prompt);
    },

    async generateTitle(original: string, platform: ProviderId): Promise<string> {
      if (useMock) {
        return getMockTitle(original, platform);
      }
      const prompt = buildTitlePrompt(original, platform);
      return callLLM(prompt);
    },

    async generateHashtags(count: number, platform: ProviderId, context?: string): Promise<string[]> {
      if (useMock) {
        return getMockHashtags(count);
      }
      const prompt = buildHashtagsPrompt(count, platform, context);
      const result = await callLLM(prompt, 2048);
      // Extrae tokens tipo #tag tolerando markdown (**#tag**) y puntuación
      const matches = result.match(/#[A-Za-z0-9_ÁÉÍÓÚáéíóúñÑüÜ]+/g);
      if (matches && matches.length > 0) return matches.slice(0, count);
      // Fallback: usa palabras sueltas como hashtags
      return result
        .split(/[\s,]+/)
        .filter(Boolean)
        .slice(0, count)
        .map((w) => `#${w.replace(/[^A-Za-z0-9_ÁÉÍÓÚáéíóúñÑüÜ]/g, '')}`)
        .filter((w) => w.length > 1);
    },

    async rewrite(text: string, tone: string): Promise<string> {
      if (useMock) {
        return getMockRewrite(text, tone);
      }
      const prompt = buildRewritePrompt(text, tone);
      return callLLM(prompt);
    },

    async adaptFor(platform: ProviderId, content: string): Promise<string> {
      if (useMock) {
        return getMockAdapt(platform, content);
      }
      const prompt = buildAdaptPrompt(platform, content);
      return callLLM(prompt);
    },

    async generatePack(context: string, platform: ProviderId): Promise<AIPack> {
      if (useMock) {
        return getMockPack(context, platform);
      }
      const prompt = buildPackPrompt(context, platform);
      const raw = await callLLM(prompt, 4096);
      return parsePack(raw, context, platform);
    },
  };
}

export const aiService = createAIService();