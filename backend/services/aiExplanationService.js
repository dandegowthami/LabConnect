import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';

export const AI_PROMPT_VERSION = 'labconnect-report-summary-v1';

const responseSchema = z.object({
  summary: z.string().trim().min(1).max(2500)
}).strict();

const languageNames = { en: 'English', te: 'Telugu', hi: 'Hindi' };

export function explanationFingerprint(classifications, model) {
  const source = JSON.stringify({ classifications, model, promptVersion: AI_PROMPT_VERSION });
  return createHash('sha256').update(source).digest('hex');
}

export function validateAIExplanation(value) {
  return responseSchema.parse(value);
}

export class AIExplanationService {
  constructor({ config = env, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  get isConfigured() {
    return Boolean(
      this.config.AI_PROVIDER
      && this.config.AI_API_KEY
      && this.config.AI_MODEL
      && this.config.AI_API_BASE_URL
    );
  }

  async generate({ language, classifications }) {
    if (!this.isConfigured) {
      throw Object.assign(new Error('AI explanation service is not configured'), {
        status: 503,
        code: 'AI_UNAVAILABLE'
      });
    }

    const configuredUrl = new URL(this.config.AI_API_BASE_URL);
    if (configuredUrl.protocol !== 'https:' || configuredUrl.username || configuredUrl.password) {
      throw Object.assign(new Error('AI provider URL must use HTTPS and must not include credentials'), {
        status: 503,
        code: 'AI_INSECURE_ENDPOINT'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.AI_TIMEOUT_MS || 15000);
    const baseUrl = this.config.AI_API_BASE_URL.replace(/\/+$/, '');
    const endpoint = /\/chat\/completions$/i.test(baseUrl)
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.config.AI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.AI_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Return only a JSON object with one string property named "summary". Explain the supplied laboratory results in simple ${languageNames[language]}. For each value, state whether the deterministic classification is below, within, or above the supplied reference range. Do not diagnose, recommend treatment, infer symptoms, invent medical history, or invent values. Clearly advise the patient to consult their doctor for interpretation and state that the full signed laboratory report is authoritative.`
            },
            {
              role: 'user',
              content: JSON.stringify({ language, results: classifications })
            }
          ]
        })
      });
      if (!response.ok) {
        throw Object.assign(new Error('AI provider returned an unsuccessful response'), {
          status: 503,
          code: 'AI_PROVIDER_FAILURE'
        });
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw Object.assign(new Error('AI provider response did not contain structured output'), {
          status: 502,
          code: 'AI_INVALID_OUTPUT'
        });
      }

      let decoded;
      try {
        decoded = JSON.parse(content);
      } catch {
        throw Object.assign(new Error('AI provider returned invalid structured output'), {
          status: 502,
          code: 'AI_INVALID_OUTPUT'
        });
      }
      const parsed = responseSchema.safeParse(decoded);
      if (!parsed.success) {
        throw Object.assign(new Error('AI provider returned invalid structured output'), {
          status: 502,
          code: 'AI_INVALID_OUTPUT'
        });
      }
      return { ...parsed.data, model: this.config.AI_MODEL };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error('AI explanation request timed out'), {
          status: 503,
          code: 'AI_TIMEOUT'
        });
      }
      if (error.status) throw error;
      throw Object.assign(new Error('AI explanation service is unavailable'), {
        status: 503,
        code: 'AI_PROVIDER_FAILURE'
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const aiExplanationService = new AIExplanationService();
