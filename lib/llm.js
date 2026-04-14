// lib/llm.js
// Unified wrapper for LLMs used across DalIA chat and DalIA Actions.
// Priority: DEEPSEEK_API_KEY > KIMI_API_KEY > ANTHROPIC_API_KEY
// Rationale: DeepSeek V3 es ~4x más barato que Kimi, ~6x más barato que Claude.
// El tono peruano se refuerza en el system prompt, así cualquier modelo lo replica.

'use strict';

const logger = require('./logger');

// ── Pricing por modelo (USD por 1M tokens) — ACTUALIZAR si cambian tarifas ──
const PRICING = {
    'deepseek-chat':              { input: 0.28,  output: 0.42,  cache_hit: 0.028 },
    'moonshot-v1-8k':             { input: 0.60,  output: 2.50,  cache_hit: 0.15  },
    'moonshotai/kimi-k2':         { input: 0.60,  output: 2.50,  cache_hit: 0.15  },
    'claude-sonnet-4-20250514':   { input: 3.00,  output: 15.00, cache_hit: 0.30  }
};

function estimarCostoUSD(modelo, inputTokens, outputTokens, cacheHit = false) {
    const p = PRICING[modelo] || { input: 0.5, output: 1.5, cache_hit: 0.05 };
    const inPrice = cacheHit ? p.cache_hit : p.input;
    return ((inputTokens * inPrice) + (outputTokens * p.output)) / 1_000_000;
}

/**
 * Call an LLM with a system prompt and user message.
 *
 * Backwards-compatible return value:
 *   - Default: returns string (para callers existentes que esperan texto plano)
 *   - Con opts.returnMeta = true: returns { text, modelo, inputTokens, outputTokens, cacheHitTokens, costoUSD }
 *
 * @param {string} systemPrompt - System prompt / role definition
 * @param {string} userMessage - User's message or structured input
 * @param {object} opts - { maxTokens = 2048, temperature = 0.7, returnMeta = false }
 * @throws {Error} - if no API key is configured or the call fails
 */
async function chatWithLLM(systemPrompt, userMessage, opts = {}) {
    const maxTokens = opts.maxTokens || 2048;
    const temperature = opts.temperature ?? 0.7;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const kimiKey = process.env.KIMI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!deepseekKey && !kimiKey && !anthropicKey) {
        throw new Error('No LLM API key configured (need DEEPSEEK_API_KEY, KIMI_API_KEY or ANTHROPIC_API_KEY)');
    }

    let result;
    if (deepseekKey) {
        result = await callDeepSeek(deepseekKey, systemPrompt, userMessage, maxTokens, temperature);
    } else if (kimiKey) {
        result = await callKimi(kimiKey, systemPrompt, userMessage, maxTokens);
    } else {
        result = await callClaude(anthropicKey, systemPrompt, userMessage, maxTokens);
    }

    return opts.returnMeta ? result : result.text;
}

/**
 * DeepSeek V3.2 — OpenAI-compatible endpoint.
 * Prefix caching is automatic: identical prompt prefixes get 10% price on hit.
 */
async function callDeepSeek(apiKey, systemPrompt, userMessage, maxTokens, temperature) {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            max_tokens: maxTokens,
            temperature,
            top_p: 0.9,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMessage }
            ]
        })
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data?.error?.message || `DeepSeek API error ${resp.status}`);
    }
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const inputTokens  = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const cacheHitTokens = usage.prompt_cache_hit_tokens ?? 0;
    return {
        text,
        modelo: 'deepseek-chat',
        inputTokens,
        outputTokens,
        cacheHitTokens,
        costoUSD: estimarCostoUSD('deepseek-chat', inputTokens - cacheHitTokens, outputTokens) +
                  estimarCostoUSD('deepseek-chat', cacheHitTokens, 0, true)
    };
}

async function callClaude(apiKey, systemPrompt, userMessage, maxTokens) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
    });
    const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
    const inputTokens  = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
        text,
        modelo: 'claude-sonnet-4-20250514',
        inputTokens,
        outputTokens,
        cacheHitTokens: 0,
        costoUSD: estimarCostoUSD('claude-sonnet-4-20250514', inputTokens, outputTokens)
    };
}

async function callKimi(apiKey, systemPrompt, userMessage, maxTokens) {
    const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'moonshot-v1-8k',
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ]
        })
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data?.error?.message || `Kimi API error ${resp.status}`);
    }
    const text = data.choices?.[0]?.message?.content || '';
    const inputTokens  = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    return {
        text,
        modelo: 'moonshot-v1-8k',
        inputTokens,
        outputTokens,
        cacheHitTokens: 0,
        costoUSD: estimarCostoUSD('moonshot-v1-8k', inputTokens, outputTokens)
    };
}

module.exports = { chatWithLLM, estimarCostoUSD, PRICING };
