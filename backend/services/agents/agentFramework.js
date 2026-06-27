/**
 * ═══════════════════════════════════════════════════════════════════
 *  MULTI-AGENT FRAMEWORK — WC 2026 Prediction System
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Two main exports:
 *
 *   Agent       — A single LLM-backed specialist with a fixed role.
 *                 run(userMessage)           → Round 1 analysis output
 *                 challenge(own, opposing)   → Round 2 rebuttal output
 *
 *   AgentSession — Orchestrates a full multi-agent prediction run:
 *                 dispatch(agentTasks)       → parallel Round 1
 *                 detectConflicts()          → pairwise delta check
 *                 negotiate(agentMap)        → parallel Round 2 rebuttals
 *                 buildFinalOutputs()        → merge + weight adjustment
 *                 save(method)               → persist to DB
 *
 *  Conflict threshold: any outcome probability delta ≥ 0.20 triggers
 *  negotiation. The agent that moves less in Round 2 "wins" and gets a
 *  1.3× weight boost; the loser's weight is cut to 0.6×.
 *
 *  All specialist agents (Phase 2) import { Agent } from here and
 *  supply their own systemPrompt + prompt-building logic.
 */

const { randomUUID } = require('crypto');
const { getDb }       = require('../../database/db');
const { chatComplete } = require('../qwenClient');

// ── Constants ─────────────────────────────────────────────────────
const CONFLICT_THRESHOLD    = 0.20;  // max prob delta that triggers negotiation
const WINNER_WEIGHT_BOOST   = 1.30;
const LOSER_WEIGHT_PENALTY  = 0.60;

/**
 * JSON schema every agent MUST follow in its response.
 * Embed this in each agent's system prompt so the LLM knows the contract.
 */
const AGENT_OUTPUT_SCHEMA = `
Respond ONLY with a valid JSON object — no extra text, no markdown — in this exact schema:
{
  "probability": {
    "winHome": <0-1 float>,
    "draw":    <0-1 float>,
    "winAway": <0-1 float>
  },
  "confidence":         <0-1 float — how certain you are of your estimate>,
  "evidence":           [<string>, ...],  // 2-4 concise bullet points (max 80 chars each)
  "weightRecommendation": <0-1 float — suggested weight for this signal in the final blend>,
  "flags":              [<string>, ...]   // optional tags, e.g. "HOME_IN_FORM", "KEY_INJURY_AWAY"
}
The three probability values must sum to 1.0. Keep each evidence bullet under 80 characters — be concise.`;

// ── JSON extraction ───────────────────────────────────────────────
function sanitizeJSON(text) {
  if (!text) return text;
  // Fix a common qwen-plus mistake: evidence array closed with } instead of ]
  // Pattern: "string"\n  },\n  "nextKey"  →  "string"\n  ],\n  "nextKey"
  // We look for a quoted string followed by } then , then a quoted key — inside what should be an array
  return text.replace(/"(\s*)\},(\s*)"(\w)/g, '"$1],$2"$3');
}

function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;

  text = sanitizeJSON(text);

  // 1. Try ```json ... ``` code fence (non-greedy)
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  // 2. Try first bare { ... } object (find opening { and match to its closing })
  const openIdx = text.indexOf('{');
  if (openIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = openIdx; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(openIdx, i + 1)); } catch {}
        break;
      }
    }
  }
  // 3. Last resort: regex-based greedy match
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) {
    try { return JSON.parse(bare[0]); } catch {}
  }
  return null;
}

// ── Probability helpers ───────────────────────────────────────────
function normalizeProbs(p) {
  if (!p || typeof p !== 'object') return { winHome: 1/3, draw: 1/3, winAway: 1/3 };
  const h = Number(p.winHome) || 0;
  const d = Number(p.draw)    || 0;
  const a = Number(p.winAway) || 0;
  const total = h + d + a;
  if (total <= 0) return { winHome: 1/3, draw: 1/3, winAway: 1/3 };
  return { winHome: h / total, draw: d / total, winAway: a / total };
}

function maxProbDelta(probsA, probsB) {
  return Math.max(
    Math.abs((probsA.winHome ?? 0) - (probsB.winHome ?? 0)),
    Math.abs((probsA.draw    ?? 0) - (probsB.draw    ?? 0)),
    Math.abs((probsA.winAway ?? 0) - (probsB.winAway ?? 0)),
  );
}

// ── Parse raw LLM text into a validated AgentOutput ──────────────
function parseAgentOutput(text, agentName, model, round, latencyMs) {
  const FALLBACK = {
    probability:         { winHome: 1/3, draw: 1/3, winAway: 1/3 },
    confidence:          0.33,
    evidence:            ['JSON parse error — uniform prior applied'],
    weightRecommendation: 0.10,
    flags:               ['PARSE_ERROR'],
  };

  const json = extractJSON(text);

  if (!json) {
    console.warn(`[${agentName}] R${round}: could not extract JSON from response`);
    return {
      ...FALLBACK,
      agent: agentName, model, round,
      rawResponse: text, latencyMs,
      parseError: true,
    };
  }

  return {
    agent:                agentName,
    model,
    round,
    rawResponse:          text,
    latencyMs,
    parseError:           false,
    probability:          normalizeProbs(json.probability),
    confidence:           Math.min(1, Math.max(0, Number(json.confidence)          || 0.5)),
    evidence:             Array.isArray(json.evidence) ? json.evidence.slice(0, 6) : [],
    weightRecommendation: Math.min(1, Math.max(0, Number(json.weightRecommendation) || 0.20)),
    flags:                Array.isArray(json.flags) ? json.flags : [],
  };
}

// ── Build the Round 2 challenge prompt ───────────────────────────
function buildChallengeMessage(ownOutput, opposingOutput, delta) {
  const fmt = (p) =>
    `Home ${(p.winHome * 100).toFixed(1)}% | Draw ${(p.draw * 100).toFixed(1)}% | Away ${(p.winAway * 100).toFixed(1)}%`;

  return `ROUND 2 — NEGOTIATION

Your Round 1 estimate:
  ${fmt(ownOutput.probability)}
  Confidence: ${(ownOutput.confidence * 100).toFixed(0)}%
  Evidence: ${ownOutput.evidence.join(' | ')}

Conflicting estimate from ${opposingOutput.agent}:
  ${fmt(opposingOutput.probability)}
  Confidence: ${(opposingOutput.confidence * 100).toFixed(0)}%
  Evidence: ${opposingOutput.evidence.join(' | ')}

The maximum probability gap is ${(delta * 100).toFixed(1)}% — this exceeds the conflict threshold.

Reconsider your estimate in light of the opposing evidence. You may:
  • Revise your probabilities if the opposing evidence is genuinely compelling
  • Hold your position if your analysis is stronger — but justify it clearly

${AGENT_OUTPUT_SCHEMA}`;
}

// ── DB persistence helpers ────────────────────────────────────────
function saveMessage(sessionId, round, output, role) {
  try {
    getDb().prepare(`
      INSERT INTO agent_messages
        (session_id, round, agent, role, probability, confidence, evidence, raw_response, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      sessionId,
      round,
      output.agent,
      role,
      JSON.stringify(output.probability),
      output.confidence,
      JSON.stringify(output.evidence),
      output.rawResponse,
      output.latencyMs,
    ]);
  } catch (e) {
    console.error('[agentFramework] saveMessage failed:', e.message);
  }
}

// ═════════════════════════════════════════════════════════════════
//  Agent
// ═════════════════════════════════════════════════════════════════

class Agent {
  /**
   * @param {object} opts
   * @param {string} opts.name         — Unique agent name, e.g. 'FormAgent'
   * @param {string} opts.role         — Human-readable role description
   * @param {string} opts.model        — QWEN_MODELS constant
   * @param {string} opts.systemPrompt — Fixed system prompt (injected once per call)
   */
  constructor({ name, role, model, systemPrompt }) {
    this.name         = name;
    this.role         = role;
    this.model        = model;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Round 1 — run initial domain analysis.
   * @param {string} userMessage — match context + domain-specific data
   * @returns {AgentOutput}
   */
  async run(userMessage) {
    const start = Date.now();
    let result;

    try {
      result = await chatComplete({
        model:    this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        temperature: 0.2,
        maxTokens:   1500,
      });
    } catch (e) {
      console.error(`[${this.name}] R1 LLM call failed: ${e.message}`);
      return parseAgentOutput('', this.name, this.model, 1, Date.now() - start);
    }

    let output = parseAgentOutput(result.text, this.name, this.model, 1, result.latencyMs);

    // Retry once if JSON extraction failed
    if (output.parseError) {
      console.warn(`[${this.name}] R1: parse error, retrying…`);
      try {
        result = await chatComplete({
          model:    this.model,
          messages: [
            { role: 'system', content: this.systemPrompt + '\n\nIMPORTANT: Respond ONLY with a valid JSON object. No extra text.' },
            { role: 'user',   content: userMessage },
          ],
          temperature: 0.1,
          maxTokens:   1500,
        });
        output = parseAgentOutput(result.text, this.name, this.model, 1, result.latencyMs);
      } catch (e) {
        console.error(`[${this.name}] R1 retry failed: ${e.message}`);
      }
    }

    return output;
  }

  /**
   * Round 2 — respond to a conflict challenge.
   * If the LLM call fails, returns the Round 1 output unchanged (no concession).
   * @param {AgentOutput} ownOutput       — this agent's Round 1 output
   * @param {AgentOutput} opposingOutput  — the conflicting agent's Round 1 output
   * @param {number}      delta           — maxProbDelta that triggered negotiation
   * @returns {AgentOutput}
   */
  async challenge(ownOutput, opposingOutput, delta) {
    const challengeMessage = buildChallengeMessage(ownOutput, opposingOutput, delta);
    const start = Date.now();
    let result;

    try {
      result = await chatComplete({
        model:    this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user',   content: challengeMessage },
        ],
        temperature: 0.2,
        maxTokens:   1500,
      });
    } catch (e) {
      console.error(`[${this.name}] R2 challenge failed: ${e.message}`);
      return { ...ownOutput, round: 2, latencyMs: Date.now() - start };
    }

    let output = parseAgentOutput(result.text, this.name, this.model, 2, result.latencyMs);

    // Retry once if JSON extraction failed
    if (output.parseError) {
      console.warn(`[${this.name}] R2: parse error, retrying…`);
      try {
        result = await chatComplete({
          model:    this.model,
          messages: [
            { role: 'system', content: this.systemPrompt + '\n\nIMPORTANT: Respond ONLY with a valid JSON object. No extra text.' },
            { role: 'user',   content: challengeMessage },
          ],
          temperature: 0.1,
          maxTokens:   1500,
        });
        output = parseAgentOutput(result.text, this.name, this.model, 2, result.latencyMs);
      } catch (e) {
        console.error(`[${this.name}] R2 retry failed: ${e.message}`);
      }
    }

    // If retry also failed, hold original Round 1 position
    if (output.parseError) {
      return { ...ownOutput, round: 2, latencyMs: Date.now() - start };
    }

    return output;
  }
}

// ═════════════════════════════════════════════════════════════════
//  AgentSession
// ═════════════════════════════════════════════════════════════════

class AgentSession {
  /**
   * @param {string} matchId — matches.id from the DB
   */
  constructor(matchId) {
    this.sessionId     = randomUUID();
    this.matchId       = matchId;
    this.startTime     = Date.now();
    this.round1Outputs = [];  // AgentOutput[]
    this.round2Data    = [];  // { conflict, revisedA, revisedB }[]
    this.conflicts     = [];  // detected conflict objects
    this.resolutions   = [];  // resolution records written to DB
  }

  // ── Round 1: dispatch all agents in parallel ───────────────────
  /**
   * @param {{ agent: Agent, userMessage: string }[]} agentTasks
   * @returns {AgentOutput[]} successful outputs only
   */
  async dispatch(agentTasks) {
    console.log(`[AgentSession ${this.sessionId.slice(0, 8)}] Dispatching ${agentTasks.length} agents in parallel…`);

    const settled = await Promise.allSettled(
      agentTasks.map(({ agent, userMessage }) => agent.run(userMessage))
    );

    this.round1Outputs = settled
      .map((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[AgentSession] ${agentTasks[i].agent.name} rejected: ${r.reason}`);
          return null;
        }
        return r.value;
      })
      .filter(Boolean);

    console.log(`[AgentSession] Round 1 complete: ${this.round1Outputs.length}/${agentTasks.length} agents succeeded`);
    return this.round1Outputs;
  }

  // ── Detect pairwise conflicts ──────────────────────────────────
  /**
   * Compares every pair of Round 1 outputs and flags pairs whose
   * max probability delta exceeds CONFLICT_THRESHOLD.
   * @returns {Conflict[]}
   */
  detectConflicts() {
    const outputs = this.round1Outputs;
    const conflicts = [];

    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const delta = maxProbDelta(outputs[i].probability, outputs[j].probability);
        if (delta >= CONFLICT_THRESHOLD) {
          conflicts.push({
            agentA:  outputs[i].agent,
            agentB:  outputs[j].agent,
            outputA: outputs[i],
            outputB: outputs[j],
            delta,
          });
          console.log(`[AgentSession] CONFLICT: ${outputs[i].agent} vs ${outputs[j].agent} (delta=${(delta * 100).toFixed(1)}%)`);
        }
      }
    }

    this.conflicts = conflicts;
    return conflicts;
  }

  // ── Round 2: negotiate each conflict simultaneously ────────────
  /**
   * @param {{ [agentName: string]: Agent }} agentMap
   * @returns {{ conflict, revisedA, revisedB }[]}
   */
  async negotiate(agentMap) {
    if (this.conflicts.length === 0) {
      console.log('[AgentSession] No conflicts — skipping Round 2');
      return [];
    }

    console.log(`[AgentSession] Round 2: negotiating ${this.conflicts.length} conflict(s)…`);

    const settled = await Promise.allSettled(
      this.conflicts.map(async (conflict) => {
        const agentA = agentMap[conflict.agentA];
        const agentB = agentMap[conflict.agentB];

        if (!agentA || !agentB) {
          console.warn(`[AgentSession] Could not find agent instances for ${conflict.agentA}/${conflict.agentB}`);
          return null;
        }

        // Both sides challenge simultaneously
        const [revisedA, revisedB] = await Promise.all([
          agentA.challenge(conflict.outputA, conflict.outputB, conflict.delta),
          agentB.challenge(conflict.outputB, conflict.outputA, conflict.delta),
        ]);

        return { conflict, revisedA, revisedB };
      })
    );

    this.round2Data = settled
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean);

    console.log(`[AgentSession] Round 2 complete: ${this.round2Data.length} negotiations resolved`);
    return this.round2Data;
  }

  // ── Merge rounds and compute final weight per agent ────────────
  /**
   * Starts from Round 1 outputs, then applies weight adjustments based
   * on who conceded more in Round 2. Returns an array of final outputs
   * suitable for feeding directly into logPool().
   *
   * @returns {{ agent, probability, finalWeight, evidence, flags }[]}
   */
  buildFinalOutputs() {
    // Seed from Round 1
    const finalMap = {};
    for (const o of this.round1Outputs) {
      finalMap[o.agent] = { ...o, finalWeight: o.weightRecommendation };
    }

    // Apply Round 2 resolution adjustments
    for (const { conflict, revisedA, revisedB } of this.round2Data) {
      // How far did each agent move from their Round 1 position?
      const moveA = maxProbDelta(conflict.outputA.probability, revisedA.probability);
      const moveB = maxProbDelta(conflict.outputB.probability, revisedB.probability);

      // The agent that moved MORE is the one that conceded (= loser)
      const [winner, loser, loserRevised] = moveA <= moveB
        ? [conflict.agentA, conflict.agentB, revisedB]
        : [conflict.agentB, conflict.agentA, revisedA];

      if (finalMap[winner]) {
        finalMap[winner].finalWeight = Math.min(
          1.0,
          finalMap[winner].finalWeight * WINNER_WEIGHT_BOOST
        );
      }
      if (finalMap[loser]) {
        finalMap[loser].finalWeight = Math.max(
          0.01,
          finalMap[loser].finalWeight * LOSER_WEIGHT_PENALTY
        );
        // Use the loser's revised (conceded) probability in the final blend
        finalMap[loser].probability = loserRevised.probability;
      }

      const move = Math.max(moveA, moveB);
      const resolution = {
        conflict,
        winner,
        loser,
        moveA,
        moveB,
        reasoning: `${winner} held position (moved ${(Math.min(moveA, moveB) * 100).toFixed(1)}%); ` +
                   `${loser} conceded ${(move * 100).toFixed(1)}% — weight cut to ${(LOSER_WEIGHT_PENALTY * 100).toFixed(0)}%`,
      };
      this.resolutions.push(resolution);
      console.log(`[AgentSession] Resolution: ${resolution.reasoning}`);
    }

    return Object.values(finalMap);
  }

  // ── Persist everything to DB ───────────────────────────────────
  /**
   * @param {string} [synthesisMethod='log_pool_weighted']
   * @returns {string} sessionId
   */
  save(synthesisMethod = 'log_pool_weighted') {
    const db          = getDb();
    const wallTimeMs  = Date.now() - this.startTime;
    const rounds      = this.round2Data.length > 0 ? 2 : 1;

    try {
      db.prepare(`
        INSERT INTO agent_sessions
          (id, match_id, agents_used, rounds, conflicts_detected, conflicts_resolved,
           synthesis_method, wall_time_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        this.sessionId,
        this.matchId,
        JSON.stringify(this.round1Outputs.map(o => o.agent)),
        rounds,
        this.conflicts.length,
        this.resolutions.length,
        synthesisMethod,
        wallTimeMs,
      ]);

      // Round 1 messages
      for (const o of this.round1Outputs) {
        saveMessage(this.sessionId, 1, o, 'analysis');
      }

      // Round 2 rebuttal messages
      for (const { revisedA, revisedB } of this.round2Data) {
        saveMessage(this.sessionId, 2, revisedA, 'rebuttal');
        saveMessage(this.sessionId, 2, revisedB, 'rebuttal');
      }

      // Conflict + resolution records
      for (const res of this.resolutions) {
        db.prepare(`
          INSERT INTO agent_conflicts
            (session_id, agent_a, agent_b, delta, round_detected,
             resolution, winner, resolution_reasoning)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          this.sessionId,
          res.conflict.agentA,
          res.conflict.agentB,
          res.conflict.delta,
          1,
          res.winner === res.conflict.agentA ? 'agent_a_won' : 'agent_b_won',
          res.winner,
          res.reasoning,
        ]);
      }

      console.log(
        `[AgentSession ${this.sessionId.slice(0,8)}] Saved — ` +
        `${rounds} rounds, ${this.conflicts.length} conflicts, ${wallTimeMs}ms wall time`
      );
    } catch (e) {
      console.error('[AgentSession] save() failed:', e.message);
    }

    return this.sessionId;
  }
}

// ═════════════════════════════════════════════════════════════════
//  Exports
// ═════════════════════════════════════════════════════════════════

module.exports = {
  Agent,
  AgentSession,
  CONFLICT_THRESHOLD,
  WINNER_WEIGHT_BOOST,
  LOSER_WEIGHT_PENALTY,
  AGENT_OUTPUT_SCHEMA,
};
