const { GoogleGenAI } = require("@google/genai");
const { buildVenueDocument } = require("./clean");
const { LLM_EXTRACTION_SCHEMA, SYSTEM_PROMPT } = require("./llm-schema");
const { GEMINI_RESPONSE_SCHEMA, PILOT_GEMINI_MODELS } = require("./llm-schema-gemini");

const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return { apiKey };
}

/**
 * Vertex AI (bills to GCP project credits via ADC / service account).
 * Requires: Vertex AI API enabled, GOOGLE_CLOUD_PROJECT, and either
 * GOOGLE_APPLICATION_CREDENTIALS (SA JSON) or `gcloud auth application-default login`.
 */
function getVertexConfig() {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  if (!project) return null;
  return {
    project,
    // Gemini 3.x PayGo is on global (and us/eu multi-region), not us-central1.
    location: process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION || "global",
  };
}

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.ENRICH_LLM_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  };
}

/** @deprecated use getGeminiConfig */
function getLlmConfig() {
  return getOpenAiConfig();
}

function buildUserContent(pages, venueMeta) {
  const doc = buildVenueDocument(pages);
  const venueLabel = venueMeta.name || venueMeta.website || "Unknown venue";
  const userContent = `Venue: ${venueLabel}\nWebsite: ${venueMeta.website || pages[0]?.url || ""}\nPages: ${doc.page_count}\n\n${doc.document}`;
  return { doc, userContent };
}

async function extractWithGemini(pages, venueMeta = {}, modelId = "gemini-3.5-flash") {
  const config = getGeminiConfig();
  if (!config) {
    throw new Error("GEMINI_API_KEY not set in .env.local — add it to run Gemini extraction.");
  }

  const { doc, userContent } = buildUserContent(pages, venueMeta);
  const started = Date.now();
  const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 800)}`);
  }

  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const block = body.candidates?.[0]?.finishReason || body.promptFeedback;
    throw new Error(`Gemini returned empty content (${JSON.stringify(block)?.slice(0, 200)})`);
  }

  let extraction;
  try {
    extraction = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  const usage = body.usageMetadata ?? null;
  return {
    extraction,
    meta: {
      provider: "gemini",
      model: modelId,
      extracted_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
      input_chars: doc.char_count,
      page_count: doc.page_count,
      usage,
      estimated_cost_usd: estimateGeminiCost(usage, modelId),
    },
  };
}

async function extractWithVertex(pages, venueMeta = {}, modelId = "gemini-3.5-flash") {
  const config = getVertexConfig();
  if (!config) {
    throw new Error(
      "Vertex not configured — set GOOGLE_CLOUD_PROJECT (and GOOGLE_APPLICATION_CREDENTIALS or ADC).",
    );
  }

  const { doc, userContent } = buildUserContent(pages, venueMeta);
  const started = Date.now();
  const ai = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
  });

  const response = await ai.models.generateContent({
    model: modelId,
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(`Vertex returned empty content for ${modelId}`);
  }

  let extraction;
  try {
    extraction = JSON.parse(text);
  } catch {
    throw new Error(`Vertex returned non-JSON: ${text.slice(0, 200)}`);
  }

  const usage = response.usageMetadata ?? null;
  return {
    extraction,
    meta: {
      provider: "vertex",
      model: modelId,
      project: config.project,
      location: config.location,
      extracted_at: new Date().toISOString(),
      latency_ms: Date.now() - started,
      input_chars: doc.char_count,
      page_count: doc.page_count,
      usage,
      estimated_cost_usd: estimateGeminiCost(usage, modelId),
    },
  };
}

async function extractWithOpenAi(pages, venueMeta = {}) {
  const config = getOpenAiConfig();
  if (!config) {
    throw new Error("OPENAI_API_KEY not set in .env.local.");
  }

  const { doc, userContent } = buildUserContent(pages, venueMeta);
  const started = Date.now();
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: LLM_EXTRACTION_SCHEMA,
      },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = await res.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  return {
    extraction: JSON.parse(content),
    meta: {
      provider: "openai",
      model: config.model,
      latency_ms: Date.now() - started,
      input_chars: doc.char_count,
      page_count: doc.page_count,
      usage: body.usage ?? null,
      estimated_cost_usd: estimateOpenAiCost(body.usage, config.model),
    },
  };
}

/** @deprecated use extractWithGemini */
async function extractWithLlm(pages, venueMeta = {}) {
  return extractWithOpenAi(pages, venueMeta);
}

/** Run all pilot Gemini models on the same cached pages. */
async function extractWithPilotModels(pages, venueMeta = {}) {
  const results = {};
  for (const model of PILOT_GEMINI_MODELS) {
    results[model.slug] = await extractWithGemini(pages, venueMeta, model.id);
  }
  return results;
}

function estimateOpenAiCost(usage, model) {
  if (!usage) return null;
  const rates = {
    "gpt-4o-mini": { in: 0.15 / 1e6, out: 0.6 / 1e6 },
    "gpt-4o": { in: 2.5 / 1e6, out: 10 / 1e6 },
  };
  const rate = rates[model] || rates["gpt-4o-mini"];
  return (usage.prompt_tokens || 0) * rate.in + (usage.completion_tokens || 0) * rate.out;
}

/** Approximate Vertex list pricing (USD); actual spend draws from GCP credits. */
function estimateGeminiCost(usage, model) {
  if (!usage) return null;
  const rates = {
    "gemini-3.5-flash": { in: 1.5 / 1e6, out: 9 / 1e6 },
    "gemini-3.1-flash-lite": { in: 0.25 / 1e6, out: 1.5 / 1e6 },
    "gemini-2.5-flash": { in: 0.3 / 1e6, out: 2.5 / 1e6 },
  };
  const rate = rates[model] || rates["gemini-3.5-flash"];
  const input = usage.promptTokenCount || usage.prompt_tokens || 0;
  const output =
    usage.candidatesTokenCount ||
    usage.completion_tokens ||
    usage.candidatesTokensCount ||
    0;
  return input * rate.in + output * rate.out;
}

/**
 * Pick extract function by provider.
 * @param {"vertex"|"gemini"|"openai"} provider
 */
function getExtractFn(provider) {
  if (provider === "vertex") return extractWithVertex;
  if (provider === "openai") return extractWithOpenAi;
  return extractWithGemini;
}

function providerReady(provider) {
  if (provider === "vertex") return Boolean(getVertexConfig());
  if (provider === "openai") return Boolean(getOpenAiConfig());
  return Boolean(getGeminiConfig());
}

function summarizeLlmExtraction(result) {
  const e = result.extraction;
  const catering = e.policies?.catering?.value ?? null;
  const eventInsurance = e.policies?.event_insurance?.value ?? null;
  const configs = Array.isArray(e.capacity_configurations) ? e.capacity_configurations : [];
  const assets = Array.isArray(e.discovered_assets) ? e.discovered_assets : [];
  return {
    model: result.meta?.model ?? null,
    provider: result.meta?.provider ?? null,
    capacity_max: e.capacity_max?.value ?? null,
    capacity_as_stated: e.capacity_as_stated?.value ?? null,
    capacity_configurations_count: configs.length,
    capacity_configurations: configs.slice(0, 12).map((c) => ({
      space: c.space ?? null,
      setting: c.setting ?? null,
      style: c.style ?? null,
      guests: c.guests ?? null,
    })),
    capacity_source: e.capacity_max?.source_url ?? e.capacity_as_stated?.source_url ?? null,
    capacity_quote: e.capacity_max?.quote ?? e.capacity_as_stated?.quote ?? null,
    price_display: e.price_display?.value ?? null,
    pricing_model: e.pricing_model?.value ?? null,
    pricing_as_stated: e.pricing_as_stated?.value ?? null,
    discovered_assets_count: assets.length,
    discovered_assets: assets.slice(0, 10).map((a) => ({
      url: a.url,
      kind: a.kind,
      label: a.label ?? null,
    })),
    amenities_count: (e.amenities || []).length,
    included_inventory_count: (e.included_inventory || []).length,
    catering,
    event_insurance: eventInsurance,
    policies_set: Object.values(e.policies || {}).filter(
      (p) => p && typeof p === "object" && p.value != null,
    ).length,
    confidence: e.confidence ?? null,
    notes: e.notes ?? null,
    cost_usd: result.meta?.estimated_cost_usd ?? null,
    latency_ms: result.meta?.latency_ms ?? null,
    input_chars: result.meta?.input_chars ?? null,
  };
}

module.exports = {
  getLlmConfig,
  getGeminiConfig,
  getVertexConfig,
  getOpenAiConfig,
  getExtractFn,
  providerReady,
  extractWithLlm,
  extractWithGemini,
  extractWithVertex,
  extractWithOpenAi,
  extractWithPilotModels,
  summarizeLlmExtraction,
  PILOT_GEMINI_MODELS,
};
