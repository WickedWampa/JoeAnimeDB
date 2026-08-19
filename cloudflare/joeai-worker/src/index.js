const CHAT_MODEL = '@cf/zai-org/glm-4.7-flash';
const RERANK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS
  });
}

function compactContext(value, limit = 22000) {
  // The client already selects question-relevant context. This is a final
  // guardrail so one malformed request cannot send an entire database.
  const text = JSON.stringify(value || {});
  return text.length > limit ? text.slice(0, limit) : text;
}

function textFromContent(content) {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content?.text === 'string') return content.text;
  return '';
}

function extractText(result) {
  if (!result) return '';

  if (typeof result.response === 'string') return result.response;
  if (typeof result.result?.response === 'string') return result.result.response;
  if (typeof result.text === 'string') return result.text;
  if (typeof result.output_text === 'string') return result.output_text;

  const choice = result.choices?.[0];
  const messageText = textFromContent(choice?.message?.content);
  if (messageText) return messageText;

  const choiceText = textFromContent(choice?.text);
  if (choiceText) return choiceText;

  const wrappedChoice = result.result?.choices?.[0];
  const wrappedText = textFromContent(wrappedChoice?.message?.content);
  if (wrappedText) return wrappedText;

  return '';
}

function responseShape(result) {
  const choice = result?.choices?.[0] || result?.result?.choices?.[0];
  const message = choice?.message;

  return {
    topLevelKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    finishReason: choice?.finish_reason || '',
    messageKeys: message && typeof message === 'object' ? Object.keys(message) : [],
    contentType: Array.isArray(message?.content) ? 'array' : typeof message?.content,
    hasReasoning: Boolean(message?.reasoning || message?.reasoning_content),
    usage: result?.usage || result?.result?.usage || null
  };
}

function parseJsonText(text = '') {
  const clean = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!clean) return null;

  try {
    return JSON.parse(clean);
  } catch {}

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function salvageRankingObjects(text = '') {
  const source = String(text || '');
  const rankingsKey = source.search(/"rankings"\s*:/i);
  if (rankingsKey < 0) return [];
  const arrayStart = source.indexOf('[', rankingsKey);
  if (arrayStart < 0) return [];

  const items = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        try {
          const item = JSON.parse(source.slice(objectStart, index + 1));
          if (item && typeof item === 'object') items.push(item);
        } catch {}
        objectStart = -1;
      }
    }
  }

  return items;
}

function extractStructuredResponse(result) {
  if (!result) return null;

  if (result.response && typeof result.response === 'object' && !Array.isArray(result.response)) {
    return result.response;
  }
  if (result.result?.response && typeof result.result.response === 'object' && !Array.isArray(result.result.response)) {
    return result.result.response;
  }

  const text = extractText(result);
  const parsed = parseJsonText(text);
  if (parsed) return parsed;

  // JSON-mode models can occasionally hit their output limit after writing several
  // complete ranking objects. Salvage those completed objects instead of throwing
  // away the entire second-pass review and falling back to the old recommendation.
  const rankings = salvageRankingObjects(text);
  if (rankings.length) {
    return {
      summary: 'JoeAI recovered the completed portion of the cloud taste review.',
      rankings,
      partial: true
    };
  }

  return null;
}

const RERANK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          requestFit: { type: 'integer', minimum: 0, maximum: 100 },
          tasteFit: { type: 'integer', minimum: 0, maximum: 100 },
          verdict: { type: 'string', enum: ['strong', 'good', 'maybe', 'reject'] },
          reason: { type: 'string' }
        },
        required: ['key', 'title', 'requestFit', 'tasteFit', 'verdict', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['summary', 'rankings'],
  additionalProperties: false
};

function clampScore(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeRerankData(data = {}, context = {}) {
  const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
  const rawRankings = Array.isArray(data?.rankings) ? data.rankings : [];
  const allowedVerdicts = new Set(['strong', 'good', 'maybe', 'reject']);
  const byKey = new Map(candidates.map((candidate) => [String(candidate?.key || ''), candidate]));
  const byTitle = new Map(candidates.map((candidate) => [String(candidate?.title || '').trim().toLowerCase(), candidate]));
  const total = Math.max(1, rawRankings.length || candidates.length);
  const sourceAnchored = Boolean(context?.sourceAnchor);

  const rankings = rawRankings.map((entry, index) => {
    const key = String(entry?.key || '');
    const title = String(entry?.title || '').trim();
    const candidate = byKey.get(key) || byTitle.get(title.toLowerCase()) || candidates[index] || {};
    const localMatch = clampScore(candidate?.localMatch || 0);
    const localSourceSimilarity = clampScore(candidate?.sourceSimilarity || 0);
    const rankFit = clampScore(94 - ((index / Math.max(1, total - 1)) * 34), 45, 96);

    let requestFit = Number(entry?.requestFit);
    let tasteFit = Number(entry?.tasteFit);

    if (!Number.isFinite(requestFit)) {
      requestFit = sourceAnchored
        ? (localSourceSimilarity || rankFit)
        : rankFit;
    }
    if (!Number.isFinite(tasteFit)) {
      tasteFit = localMatch || rankFit;
    }

    requestFit = clampScore(requestFit);
    tasteFit = clampScore(tasteFit);

    // Anchored "like X" requests are primarily a similarity problem; generic
    // discovery is primarily a personal-taste problem. Local JoeAI's old 90%+
    // score is evidence/fallback only and never directly inflates the final score.
    let fit = sourceAnchored
      ? clampScore((requestFit * 0.70) + (tasteFit * 0.30))
      : clampScore((requestFit * 0.35) + (tasteFit * 0.65));

    let verdict = String(entry?.verdict || '').toLowerCase();
    if (!allowedVerdicts.has(verdict)) verdict = '';

    // Preserve an explicit reject (hard constraint, obvious mismatch). Otherwise
    // derive the tier from the actual final fit so "strong" cannot force 90%+.
    if (verdict === 'reject') {
      fit = clampScore(fit, 0, 49);
    } else if (fit >= 90) {
      verdict = 'strong';
    } else if (fit >= 77) {
      verdict = 'good';
    } else if (fit >= 60) {
      verdict = 'maybe';
    } else {
      verdict = 'reject';
    }

    return {
      ...entry,
      key: key || String(candidate?.key || ''),
      title: title || String(candidate?.title || ''),
      requestFit,
      tasteFit,
      fit,
      verdict,
      reason: String(entry?.reason || '').trim(),
      caution: String(entry?.caution || '').trim(),
      signals: Array.isArray(entry?.signals) ? entry.signals.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 6) : [],
      _rawRequestFit: Number.isFinite(Number(entry?.requestFit)) ? Number(entry.requestFit) : null,
      _rawTasteFit: Number.isFinite(Number(entry?.tasteFit)) ? Number(entry.tasteFit) : null
    };
  });

  // Diversity remains important, but the score now decides the tier instead of
  // blindly trusting a model-provided verdict.
  const strongIndexes = rankings.map((entry, index) => entry.verdict === 'strong' ? index : -1).filter((index) => index >= 0);
  strongIndexes.slice(2).forEach((index) => {
    const entry = rankings[index];
    entry.verdict = 'good';
    entry.fit = Math.min(entry.fit, 89);
  });

  const counts = rankings.reduce((acc, entry) => {
    acc[entry.verdict] = (acc[entry.verdict] || 0) + 1;
    return acc;
  }, {});
  const rejected = counts.reject || 0;
  const modeLabel = sourceAnchored ? 'source similarity + personal taste' : 'request fit + personal taste';
  const summary = rejected
    ? `JoeAI reranked ${rankings.length} local candidates using ${modeLabel}, rejecting ${rejected} weaker fit${rejected === 1 ? '' : 's'}.`
    : `JoeAI reranked ${rankings.length} local candidates using ${modeLabel}.`;

  return {
    ...data,
    summary,
    modelSummary: String(data?.summary || '').trim(),
    rankings
  };
}

async function runRecommendationRerank(env, prompt, context = {}) {
  const candidateCount = Array.isArray(context?.candidates) ? context.candidates.length : 0;
  if (!candidateCount) {
    return json({ error: 'Recommendation rerank requires local candidates.' }, 400);
  }

  const rerankContext = compactContext(context, 22000);
  const messages = [
    {
      role: 'system',
      content: [
        'You are the second-pass taste reviewer inside JoeAnimeDB.',
        'The local JoeAI engine already generated the ONLY allowed recommendation candidates.',
        'Your job is to be skeptical: rerank those candidates using the user request plus their real library evidence, ratings, favorites, rewatches, Anime DNA, saved recommendation feedback, and candidate metadata.',
        'When sourceAnchor is present for a request like something-like-X, score TWO different things: requestFit = similarity to the source title/request; tasteFit = how well the candidate fits this user personally. Source similarity includes tone, comedy style, worldbuilding, progression, themes, character dynamics, pacing, stakes, and supplied Genome signals — not just shared genres.',
        'For ordinary recommendation/discovery requests, candidates should already be unseen. Never reward a title merely because it appears in the taste-profile library evidence; library titles are evidence, not selectable recommendations unless explicitly supplied as candidates.',
        'Do not invent, add, substitute, or rename anime. Return every supplied candidate exactly once using its supplied key.',
        'Treat explicit user constraints as hard requirements. If the prompt says instead of, not, no, without, avoid, under, movie, finished, or another concrete constraint, reject candidates that violate it.',
        'requestConstraints.exclude is authoritative when present. A candidate matching an excluded genre/theme/setting should be rejected even if its personal taste fit is high.',
        'Challenge surface-level false positives. A show can share Action, Shounen, long length, or a studio and still be a poor fit because its comedy style, parody level, tone, pacing, romance emphasis, school setting, storytelling structure, or other supplied traits conflict with stronger user signals.',
        'Saved negative feedback is stronger evidence than genre absence. Do not infer dislike merely because a genre is rare or absent from the library.',
        'Recent recommendations are a repetition signal: unless the user is explicitly asking for the same title again, downgrade candidates that JoeAI has just recommended repeatedly when equally strong fresh options exist.',
        'Prefer batch diversity. Unless the user asks for a specific franchise or season order, do not place multiple seasons/entries from the same franchise among the top recommendations.',
        'A high local match is evidence, not an order. You may reject a high local match when the deeper taste evidence conflicts, but explain why.',
        'For sourceAnchor requests, think approximately 70% source/request similarity and 30% personal taste. A title the user would probably enjoy can still be a weak answer if it is not actually much like the source.',
        'When sourceAnchor is present, compare EVERY candidate independently to sourceAnchor. Never use the current #1 candidate, a previous candidate, or another recommendation as the comparison target. Reasons for sourceAnchor requests should describe similarity or contrast with sourceAnchor/the user request, not with another candidate.',
        'Do not rank specials, recap entries, OVAs, or later seasons alongside the main franchise entry unless the user explicitly asks for those; prefer the main/starting entry.',
        'Return rankings strongest to weakest. requestFit and tasteFit MUST each be meaningful whole-number 0-100 scores and should differ when the evidence differs. For sourceAnchor requests, requestFit is the more important score; for generic discovery, tasteFit is more important.',
        'Reserve strong for the genuinely best one or two candidates. Use good, maybe, or reject to express real differences; marking every candidate strong is not useful review.',
        'Keep each reason to one short concrete sentence of at most 20 words. Do not add extra fields.',
        'The output is structured JSON only.'
      ].join(' ')
    },
    {
      role: 'user',
      content: `USER REQUEST:\n${prompt}\n\nJOEANIMEDB TASTE + CANDIDATE CONTEXT:\n${rerankContext}`
    }
  ];

  const result = await env.AI.run(RERANK_MODEL, {
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: RERANK_SCHEMA
    },
    max_tokens: 1100,
    temperature: 0.15,
    seed: 42
  });

  const data = extractStructuredResponse(result);
  const shape = responseShape(result);
  console.log('JoeAnime recommendation rerank response shape:', shape);

  if (!data || !Array.isArray(data.rankings)) {
    console.warn('JoeAnime recommendation rerank returned unusable JSON:', shape, extractText(result).slice(0, 500));
    return json({
      error: 'Workers AI recommendation review returned unusable structured data.'
    }, 502);
  }

  const normalized = normalizeRerankData(data, context);
  const summary = String(normalized.summary || '').trim() || 'JoeAI completed a second-pass taste review.';
  if (data.partial) console.warn('JoeAnime recommendation rerank used partial JSON salvage.', { recovered: normalized.rankings.length, requested: candidateCount });
  console.log('JoeAnime recommendation rerank decisions:', normalized.rankings.map((entry) => ({
    title: entry.title,
    requestFit: entry.requestFit,
    tasteFit: entry.tasteFit,
    fit: entry.fit,
    verdict: entry.verdict
  })));
  return json({
    ok: true,
    mode: 'recommendation-rerank',
    text: summary,
    data: {
      summary,
      modelSummary: normalized.modelSummary || '',
      rankings: normalized.rankings.map(({ _rawRequestFit, _rawTasteFit, ...entry }) => entry),
      partial: Boolean(data.partial)
    },
    model: RERANK_MODEL,
    usage: shape.usage || null
  });
}

async function runFastConversationFallback(env, messages = [], reason = '', maxTokens = 520) {
  try {
    const startedAt = Date.now();
    const result = await env.AI.run(RERANK_MODEL, {
      messages,
      max_tokens: maxTokens,
      temperature: 0.35
    });
    const text = extractText(result).trim();
    const shape = responseShape(result);
    console.log('JoeAnime fast conversation response shape:', {
      ...shape,
      latencyMs: Date.now() - startedAt,
      reason
    });
    if (!text) return null;
    return {
      text,
      model: RERANK_MODEL,
      usage: shape.usage || null
    };
  } catch (error) {
    console.warn('JoeAnime fast conversation fallback failed:', error);
    return null;
  }
}

function conversationKind(context = {}) {
  const explicit = String(context?.contextMode || '').trim();
  if (explicit) return explicit;
  const evidenceKind = String(context?.localEvidence?.kind || '').trim();
  if (evidenceKind === 'libraryReflection') return 'libraryReflection';
  if (evidenceKind === 'titleComparison' || context?.localEvidence?.comparisonMode) return 'titleComparison';
  return 'conversation';
}

function comparisonReceiptLines(context = {}) {
  const targets = Array.isArray(context?.comparisonTargets)
    ? context.comparisonTargets.slice(0, 2)
    : (Array.isArray(context?.localEvidence?.comparedTitles)
      ? context.localEvidence.comparedTitles.slice(0, 2)
      : []);

  return targets
    .filter((item) => Boolean(item) && (
      item.owned === true ||
      item.inLibrary === true ||
      String(item.source || '').toLowerCase() === 'library'
    ))
    .map((item) => {
      const title = String(item.title || 'Unknown title').trim();
      const score = Number(item.score);
      const rewatches = Number(item.rewatches || 0) || 0;
      const favorite = item.favorite === true ? 'yes' : 'no';
      const status = String(item.status || '').trim() || 'unspecified';
      const scoreText = Number.isFinite(score) && score > 0 ? score.toFixed(1).replace(/\.0$/, '.0') : 'not saved';
      return `${title}: saved score ${scoreText}; rewatches ${rewatches}; favorite ${favorite}; status ${status}; in library yes`;
    });
}

function comparisonReceiptSummary(context = {}) {
  const lines = comparisonReceiptLines(context);
  return lines.length ? `Saved receipts — ${lines.join(' | ')}` : '';
}

function sanitizeComparisonRead(text = '') {
  const source = String(text || '').trim();
  if (!source) return '';

  // Scores, rewatches, favorites, ownership and status are rendered by the local
  // deterministic receipt card. Strip model sentences that try to restate them,
  // because that is exactly where an LLM can invent a 9.7 that does not exist.
  const blockedFact = /\b(?:score|scored|rating|rated|rewatch|rewatched|rewatches|favorite|favourite|in your library|library entry|own|owned|ownership|watch status|completed|watching|dropped)\b/i;

  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !blockedFact.test(sentence));

  return sentences.join(' ').trim();
}

async function runConversation(env, prompt, context = {}) {
  const kind = conversationKind(context);
  const joeAnimeContext = compactContext(context, 14000);
  const comparisonReceipt = kind === 'titleComparison' ? comparisonReceiptSummary(context) : '';
  const messages = [
    {
      role: 'system',
      content: [
        'You are JoeAI, the conversational anime assistant inside JoeAnimeDB.',
        'JoeAnimeDB already has deterministic library actions, recommendation scoring, Anime DNA, ratings, rewatches, and title-resolution logic.',
        'Treat supplied JoeAnimeDB context and localEvidence as authoritative user/app data.',
        'Never invent a title as being in the user library, never invent a user score or rewatch count, and never claim you changed the library.',
        'If localEvidence is present, preserve its reliable facts while making the answer natural and conversational.',
        'For comparison questions, treat localEvidence.companions, metrics, and contributors as broad library signals only; never treat the user comparison phrase itself as a genre or claim that every library title matches it.',
        'For title comparisons, comparisonTargets and localEvidence.comparedTitles are authoritative resolved targets. A target with source library / owned true contains saved user evidence. A target with source catalog / owned false is predictive evidence and must never be described as watched, owned, rated, favorited, or rewatched.',
        'For a title comparison, the local JoeAnimeDB comparison card has ALREADY printed any saved receipts and any predictive-fit numbers before your prose appears. Do NOT repeat or restate numeric/state facts.',
        'Your comparison prose is commentary only: explain qualitative differences in themes, tone, pacing, character focus, worldbuilding, comedy, stakes, or story structure. Never invent or infer a user score, rating, rewatch count, favorite state, ownership state, or watch status. predictedFit is a JoeAI estimate, never a saved user rating.',
        'Ownership is explicit per comparison target. For owned/library targets, never imply they are unseen. For catalog/unowned targets, never imply the user has watched or rated them; it is fine to discuss them as something the user may like.',
        'If an owned resolved comparison record contains a score, never claim that title has no direct user score. If an owned score is absent, treat it as unavailable. For an unowned target, do not look for or invent a saved score; use predictedFit and predictionReasons only as prediction evidence.',
        'For comparisons, use comparisonTargets first, then titleMatches and libraryIndex for title-specific facts. localEvidence.comparisonMode may be saved, mixed, or predictive. When localEvidence.decision.winnerTitle is supplied, that is the deterministic JoeAI verdict; explain why it makes sense rather than overriding it. If decision.close is true, describe the choice as close instead of forcing a winner.',
        'When data is missing, say you do not have that detail instead of guessing.',
        'Do not compare the user to an average viewer, typical viewer, population, norm, or benchmark unless an explicit comparison baseline is supplied in the context.',
        'Treat rewatches as recorded rewatch events/counts. Do not turn a total rewatch count into a claim about how many distinct titles were rewatched unless the context explicitly gives a distinct-title count.',
        'Absence from the library is not proof the user dislikes or avoids something. For blind-spot, avoidance, or underrepresented-category questions, say a genre/studio/type is underrepresented or absent unless explicit negative evidence is supplied.',
        'Do not call synopsis, Genome fields, title metadata, or inferred themes user notes. User notes are not supplied in this request unless an explicit notes field exists.',
        'Do not expose implementation details, provider names, model names, or internal routing unless the user explicitly asks.',
        'Use light Markdown when useful. Be concise: most answers should be under 140 words, library reflections under 110 words, and comparisons under 160 words. Finish every sentence and never start a section you cannot complete.'
      ].join(' ')
    },
    {
      role: 'user',
      content: `JOEANIMEDB CONTEXT:
${joeAnimeContext}${comparisonReceipt ? `\n\nAUTHORITATIVE SAVED RECEIPTS:\n${comparisonReceipt}` : ''}\n\nUSER:
${prompt}`
    }
  ];

  console.log('JoeAnime conversation request:', {
    kind,
    contextChars: joeAnimeContext.length
  });

  // Library reflection is synthesis over already-computed local evidence. Use the
  // fast model directly instead of paying reasoning-model latency for this path.
  if (kind === 'libraryReflection') {
    const fastReflection = await runFastConversationFallback(
      env,
      messages,
      'library reflection fast path',
      500
    );
    if (fastReflection) {
      return json({
        ok: true,
        mode: 'conversation',
        text: fastReflection.text,
        model: fastReflection.model,
        usage: fastReflection.usage,
        fastPath: true
      });
    }
  }

  // Title comparisons are also grounded in deterministic local receipts. Use the
  // fast model for the prose layer so it cannot spend a long reasoning pass
  // rediscovering facts JoeAnimeDB already knows.
  if (kind === 'titleComparison') {
    const fastComparison = await runFastConversationFallback(
      env,
      messages,
      'title comparison receipt fast path',
      560
    );
    if (fastComparison) {
      const safeRead = sanitizeComparisonRead(fastComparison.text);
      return json({
        ok: true,
        mode: 'conversation',
        text: safeRead || 'The local comparison receipts above are the deciding evidence; the remaining difference is mainly tone, pacing, themes, and the kind of character journey each series emphasizes.',
        model: fastComparison.model,
        usage: fastComparison.usage,
        fastPath: true
      });
    }
  }

  const maxCompletionTokens = kind === 'titleComparison' ? 1200 : 900;
  let result = null;
  const startedAt = Date.now();
  try {
    result = await env.AI.run(CHAT_MODEL, {
      messages,
      max_completion_tokens: maxCompletionTokens,
      reasoning_effort: 'low',
      temperature: 0.55
    });
  } catch (error) {
    console.warn('JoeAnime primary conversation model failed; trying fast fallback:', error);
    const fallback = await runFastConversationFallback(env, messages, 'primary model error');
    if (fallback) {
      return json({
        ok: true,
        mode: 'conversation',
        text: fallback.text,
        model: fallback.model,
        usage: fallback.usage,
        fallback: true
      });
    }
    throw error;
  }

  const shape = responseShape(result);
  console.log('JoeAnime Workers AI response shape:', {
    ...shape,
    kind,
    contextChars: joeAnimeContext.length,
    latencyMs: Date.now() - startedAt
  });
  const text = extractText(result).trim();

  if (shape.finishReason === 'length') {
    console.warn('JoeAnime primary conversation hit its output budget; using fast concise fallback.');
    const fallback = await runFastConversationFallback(env, messages, 'primary output limit', 520);
    if (fallback) {
      return json({
        ok: true,
        mode: 'conversation',
        text: fallback.text,
        model: fallback.model,
        usage: fallback.usage,
        fallback: true
      });
    }
  }

  if (!text) {
    console.warn('JoeAnime Workers AI returned no final text; trying fast fallback:', shape);
    const fallback = await runFastConversationFallback(
      env,
      messages,
      `empty primary response (${shape.finishReason || 'unknown'})`
    );
    if (fallback) {
      return json({
        ok: true,
        mode: 'conversation',
        text: fallback.text,
        model: fallback.model,
        usage: fallback.usage,
        fallback: true
      });
    }
    return json({
      error: `Workers AI returned no final text (finish: ${shape.finishReason || 'unknown'}). Check the Wrangler console for the response shape.`
    }, 502);
  }

  return json({
    ok: true,
    mode: 'conversation',
    text,
    model: CHAT_MODEL,
    usage: shape.usage || null
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'joeanime-ai-local-test',
        chatModel: CHAT_MODEL,
        rerankModel: RERANK_MODEL
      });
    }

    if (url.pathname !== '/api/joeai' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404);
    }

    try {
      const body = await request.json();
      const prompt = String(body?.prompt || '').trim();
      const mode = String(body?.mode || 'conversation').trim().toLowerCase();
      if (!prompt) return json({ error: 'Prompt is required.' }, 400);

      if (mode === 'recommendation-rerank') {
        return await runRecommendationRerank(env, prompt, body?.context || {});
      }

      return await runConversation(env, prompt, body?.context || {});
    } catch (error) {
      console.error('JoeAnime Workers AI request failed:', error);
      return json({ error: String(error?.message || error || 'Workers AI request failed.') }, 500);
    }
  }
};
