// lib/llm.js
// Unified wrapper for Claude and Kimi LLMs used across DallIA chat and DallIA Actions.
// Priority: if KIMI_API_KEY is set, use Kimi; otherwise use ANTHROPIC_API_KEY.

'use strict';

const logger = require('./logger');

/**
 * Call an LLM with a system prompt and user message.
 * @param {string} systemPrompt - System prompt / role definition
 * @param {string} userMessage - User's message or structured input
 * @param {object} opts - { maxTokens = 2048 }
 * @returns {Promise<string>} - LLM response text
 * @throws {Error} - if no API key is configured or the call fails
 */
async function chatWithLLM(systemPrompt, userMessage, opts = {}) {
    const maxTokens = opts.maxTokens || 2048;
    const kimiKey = process.env.KIMI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!kimiKey && !anthropicKey) {
        throw new Error('No LLM API key configured (need KIMI_API_KEY or ANTHROPIC_API_KEY)');
    }

    if (kimiKey) {
        return callKimi(kimiKey, systemPrompt, userMessage, maxTokens);
    }
    return callClaude(anthropicKey, systemPrompt, userMessage, maxTokens);
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
    return response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
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
    return data.choices?.[0]?.message?.content || '';
}

module.exports = { chatWithLLM };
