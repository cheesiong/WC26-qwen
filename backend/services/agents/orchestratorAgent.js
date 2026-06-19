/**
 * ═══════════════════════════════════════════════════════════════════
 *  ORCHESTRATOR AGENT — WC 2026 Multi-Agent Prediction
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Entry point: runMultiAgentPrediction(matchId, precomputed)
 *
 *  Flow:
 *   1. Build matchContext from precomputed backbone data
 *   2. Pre-fetch all domain data in parallel (H2H, form, intel, lineup)
 *   3. Build agent task list (skip agents with null prompts)
 *   4. AgentSession.dispatch() — Round 1, all agents simultaneously
 *   5. AgentSession.detectConflicts() — flag probability deltas ≥ 0.20
 *   6. AgentSession.negotiate() — Round 2 rebuttals where conflicts exist
 *   7. AgentSession.buildFinalOutputs() — weight-adjusted agent outputs
 *   8. logPool() — geometric blend of all agent probability opinions
 *   9. applyTemperature() — calibrated output scaling
 *  10. Reweight DC score matrix → scoreline picks
 *  11. Qwen insight generation (qwen-plus)
 *  12. Save agent session + all messages to DB
 *  13. Save prediction row (with agent_session_id) and return result
 *
 *  Math helpers (logPool, applyTemperature, reweightMatrixToOutcomeProbs,
 *  pickTopScoresForPoints) are duplicated here to avoid a circular
 *  dependency with predictionEngine.js.
 */

const { getDb }      = require('../../database/db');
const { chatComplete, QWEN_MODELS } = require('../qwenClient');
const { AgentSession }              = require('./agentFramework');

// Specialist agent modules
const statMod   = require('./statisticalAgent');
const h2hMod    = require('./h2hAgent');
const formMod   = require('./formAgent');
const intelMod  = require('./intelAgent');
const lineupMod = require('./lineupAgent');

// ── Math helpers (local copies — avoids circular dep with predictionEngine) ──

function logPool(signals) {
  let logH = 0, logD = 0, logA = 0, wTotal = 0;
  for (const { probs, weight } of signals) {
    if (!probs || weight <= 0) continue;
    logH += Math.log(Math.max(probs.winHome ?? probs.prob_home ?? 1/3, 1e-3)) * weight;
    logD += Math.log(Math.max(probs.draw    ?? probs.prob_draw ?? 1/3, 1e-3)) * weight;
    logA += Math.log(Math.max(probs.winAway ?? probs.prob_away ?? 1/3, 1e-3)) * weight;
    wTotal += weight;
  }
  if (wTotal === 0) return { winHome: 1/3, draw: 1/3, winAway: 1/3 };
  const m  = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m), eD = Math.exp(logD - m), eA = Math.exp(logA - m);
  const z  = eH + eD + eA;
  return { winHome: eH / z, draw: eD / z, winAway: eA / z };
}

function applyTemperature(probs, T) {
  if (!T || T === 1.0) return probs;
  const logH = Math.log(Math.max(probs.winHome, 1e-6)) / T;
  const logD = Math.log(Math.max(probs.draw,    1e-6)) / T;
  const logA = Math.log(Math.max(probs.winAway, 1e-6)) / T;
  const m = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m), eD = Math.exp(logD - m), eA = Math.exp(logA - m);
  const z = eH + eD + eA;
  return { winHome: eH / z, draw: eD / z, winAway: eA / z };
}

function getTemperature(db) {
  const row = db.prepare("SELECT value FROM model_config WHERE key = 'calibration_temperature'").get();
  return row?.value || 1.0;
}

function reweightMatrixToOutcomeProbs(matrix, backboneProbs, finalProbs) {
  const scale = {
    HOME: finalProbs.winHome / Math.max(backboneProbs.winHome, 1e-9),
    DRAW: finalProbs.draw    / Math.max(backboneProbs.draw,    1e-9),
    AWAY: finalProbs.winAway / Math.max(backboneProbs.winAway, 1e-9),
  };
  const out = {};
  let total = 0;
  for (const [s, p] of Object.entries(matrix)) {
    const [h, a] = s.split('-').map(Number);
    const k = h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
    const v = p * scale[k];
    out[s] = v; total += v;
  }
  if (total > 0) for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

function outcomeOf(score) {
  const [h, a] = score.split('-').map(Number);
  return h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
}

function pickTopScoresForPoints(matrix) {
  const totals = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const [s, p] of Object.entries(matrix)) totals[outcomeOf(s)] += p;

  let s1 = null, bestV1 = -Infinity;
  for (const [s, p] of Object.entries(matrix)) {
    const v1 = 2 * p + totals[outcomeOf(s)];
    if (v1 > bestV1) { bestV1 = v1; s1 = s; }
  }
  const o1   = outcomeOf(s1);
  const rest = Object.entries(matrix)
    .filter(([s]) => s !== s1)
    .map(([s, p]) => ({ s, p, v2: p * (outcomeOf(s) === o1 ? 1 : 2) }))
    .sort((a, b) => b.v2 - a.v2 || b.p - a.p);

  return {
    mostLikely: s1,
    top: [
      { score: s1,         prob: +matrix[s1].toFixed(4) },
      { score: rest[0]?.s, prob: +(rest[0]?.p ?? 0).toFixed(4) },
      { score: rest[1]?.s, prob: +(rest[1]?.p ?? 0).toFixed(4) },
    ].filter(t => t.score),
  };
}

function calcConfidence(probs) {
  const max = Math.max(probs.winHome, probs.draw, probs.winAway);
  if (max >= 0.65) return 'VERY_HIGH';
  if (max >= 0.50) return 'HIGH';
  if (max >= 0.40) return 'MEDIUM';
  return 'LOW';
}

// ── Build matchContext (shared across all agents) ─────────────────
function buildMatchContext(match, homeTeam, awayTeam) {
  return {
    matchId:       match.id,
    stage:         match.stage,
    scheduledDate: match.scheduled_date,
    venue:         match.venue ?? null,
    home: {
      id:        homeTeam.id,
      name:      homeTeam.name,
      flag:      homeTeam.flag,
      elo:       homeTeam.elo       ?? 1500,
      fifa_rank: homeTeam.fifa_rank ?? 50,
      log_alpha: homeTeam.log_alpha ?? null,
      log_beta:  homeTeam.log_beta  ?? null,
    },
    away: {
      id:        awayTeam.id,
      name:      awayTeam.name,
      flag:      awayTeam.flag,
      elo:       awayTeam.elo       ?? 1500,
      fifa_rank: awayTeam.fifa_rank ?? 50,
      log_alpha: awayTeam.log_alpha ?? null,
      log_beta:  awayTeam.log_beta  ?? null,
    },
  };
}

// ── Build factors array from agent outputs ────────────────────────
function buildAgentFactors(agentOutputs, matchContext) {
  const { home, away } = matchContext;
  const totalW = agentOutputs.reduce((s, o) => s + (o.finalWeight ?? o.weightRecommendation ?? 0), 0) || 1;

  return agentOutputs.map(o => {
    const p   = o.probability;
    const pct = +(((o.finalWeight ?? o.weightRecommendation ?? 0) / totalW) * 100).toFixed(1);
    const favors = p.winHome > p.winAway + 0.05 ? 'HOME'
                 : p.winAway > p.winHome + 0.05 ? 'AWAY'
                 : 'NEUTRAL';
    return {
      name:        o.agent,
      description: o.evidence.slice(0, 3).join(' · ') || `${o.agent} analysis`,
      favors,
      impact:      o.confidence ?? 0.5,
      weight:      pct,
      model:       o.model,
      confidence:  o.confidence,
      probability: p,
      flags:       o.flags ?? [],
    };
  }).sort((a, b) => b.impact - a.impact);
}

// ── Build methodology string ──────────────────────────────────────
function buildMethodology(agentOutputs) {
  const totalW = agentOutputs.reduce((s, o) => s + (o.finalWeight ?? o.weightRecommendation ?? 0), 0) || 1;
  return agentOutputs
    .map(o => {
      const pct = (((o.finalWeight ?? o.weightRecommendation ?? 0) / totalW) * 100).toFixed(0);
      return `${o.agent}(${pct}%)`;
    })
    .join(' + ');
}

// ── Qwen insight generation ───────────────────────────────────────
async function generateOrchestratorInsight(matchContext, finalProbs, agentOutputs, conflicts, webIntel) {
  const { home, away } = matchContext;

  const topEvidence = [...agentOutputs]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3)
    .map(a => `- ${a.agent}: ${a.evidence.slice(0, 2).join('; ')}`)
    .join('\n');

  const conflictLine = conflicts.length > 0
    ? `Agent disagreements resolved: ${conflicts.map(c => `${c.agentA} vs ${c.agentB} (Δ${(c.delta * 100).toFixed(0)}%)`).join(', ')}.`
    : '';

  const prompt = `You are a concise football analyst writing a pre-match insight for a World Cup 2026 prediction app.

Match: ${home.name} vs ${away.name} | ${matchContext.stage}
Multi-agent final probabilities:
  ${home.name} win: ${(finalProbs.winHome * 100).toFixed(0)}%  |  Draw: ${(finalProbs.draw * 100).toFixed(0)}%  |  ${away.name} win: ${(finalProbs.winAway * 100).toFixed(0)}%

Key analyst findings:
${topEvidence}
${conflictLine}${webIntel?.keySummary ? `\nLatest news: ${webIntel.keySummary}` : ''}

Write 2-3 sentences of sharp analyst commentary in plain English. Be specific — use team names and concrete numbers. No bullet points, no markdown, no "Based on". Write as a pundit giving a take before kickoff.`;

  try {
    const result = await chatComplete({
      model:       QWEN_MODELS.PLUS,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens:   280,
    });
    if (result.text?.length > 20) return result.text;
  } catch (e) {
    console.warn('[orchestratorAgent] insight generation failed:', e.message);
  }

  // Fallback — no LLM needed
  const fav  = finalProbs.winHome > finalProbs.winAway ? home.name : away.name;
  const favP = (Math.max(finalProbs.winHome, finalProbs.winAway) * 100).toFixed(0);
  const n    = agentOutputs.length;
  return `${fav} are favoured at ${favP}% according to ${n}-agent analysis. ${
    conflicts.length > 0
      ? `${conflicts.length} signal conflict${conflicts.length > 1 ? 's' : ''} were detected and resolved during negotiation.`
      : 'Agents reached broad consensus on the outcome.'
  }`;
}

// ── Save prediction to DB ─────────────────────────────────────────
function savePrediction(db, matchId, sessionId, finalProbs, expHome, expAway,
                        mostLikelyScore, topScores, confidence, factors,
                        webIntel, lineupData, insight, methodology,
                        lambdaHome, lambdaAway) {
  const result = db.prepare(`
    INSERT INTO predictions
      (match_id, prob_home, prob_draw, prob_away,
       expected_score_home, expected_score_away,
       most_likely_score, top_scores, confidence,
       factors, web_intel, insight, methodology,
       lambda_home, lambda_away, agent_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    matchId,
    finalProbs.winHome, finalProbs.draw, finalProbs.winAway,
    expHome, expAway,
    mostLikelyScore, JSON.stringify(topScores), confidence,
    JSON.stringify(factors),
    JSON.stringify({ ...webIntel, lineup: lineupData }),
    insight, methodology,
    lambdaHome, lambdaAway,
    sessionId,
  ]);

  const { generated_at } = db.prepare(
    'SELECT generated_at FROM predictions WHERE id = ?'
  ).get(result.lastInsertRowid);

  return { id: result.lastInsertRowid, generated_at };
}

// ═════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ═════════════════════════════════════════════════════════════════

/**
 * Run a full multi-agent prediction for a match.
 *
 * @param {string} matchId
 * @param {object} precomputed — from predictionEngine after backbone math:
 *   { match, homeTeam, awayTeam, lambdaHome, lambdaAway,
 *     backboneProbs, matrix, homeAdv, venueEffect, dcRho }
 *
 * @returns {object} — same shape as predictionEngine.predict() result
 */
async function runMultiAgentPrediction(matchId, precomputed) {
  const {
    match, homeTeam, awayTeam,
    lambdaHome, lambdaAway, backboneProbs, matrix,
    homeAdv, venueEffect,
  } = precomputed;

  const db           = getDb();
  const matchContext = buildMatchContext(match, homeTeam, awayTeam);

  console.log(`[Orchestrator] Starting multi-agent prediction for ${matchId} (${homeTeam.name} vs ${awayTeam.name})`);

  // ── 1. Pre-fetch all domain data in parallel ─────────────────
  console.log('[Orchestrator] Pre-fetching domain data…');
  const [h2hSettled, formSettled, intelSettled, lineupSettled] = await Promise.allSettled([
    h2hMod.fetchDomainData(homeTeam.id, awayTeam.id),
    formMod.fetchDomainData(homeTeam.id, awayTeam.id),
    intelMod.fetchDomainData(homeTeam.id, awayTeam.id, match.scheduled_date, match.stage),
    lineupMod.fetchDomainData(matchId),
  ]);

  const h2hData    = h2hSettled.status    === 'fulfilled' ? h2hSettled.value    : null;
  const formData   = formSettled.status   === 'fulfilled' ? formSettled.value   : null;
  const intelData  = intelSettled.status  === 'fulfilled' ? intelSettled.value  : null;
  const lineupData = lineupSettled.status === 'fulfilled' ? lineupSettled.value : null;

  // ── 2. Build agent task list ──────────────────────────────────
  const agentTasks = [];
  const agentMap   = {};

  // Statistical agent — always active (backbone always available)
  const statPrompt = statMod.buildPrompt(matchContext, {
    lambdaHome, lambdaAway, backboneProbs, homeAdv, venueEffect,
  });
  agentTasks.push({ agent: statMod.agent, userMessage: statPrompt });
  agentMap['StatisticalAgent'] = statMod.agent;

  // H2H agent — skip when fewer than 2 meetings
  if (h2hData?.matchCount >= 2) {
    const h2hPrompt = h2hMod.buildPrompt(matchContext, h2hData);
    if (h2hPrompt) {
      agentTasks.push({ agent: h2hMod.agent, userMessage: h2hPrompt });
      agentMap['H2HAgent'] = h2hMod.agent;
    }
  } else {
    console.log('[Orchestrator] H2HAgent skipped — insufficient meetings');
  }

  // Form agent — skip if fetch failed entirely
  if (formData) {
    const formPrompt = formMod.buildPrompt(matchContext, formData);
    if (formPrompt) {
      agentTasks.push({ agent: formMod.agent, userMessage: formPrompt });
      agentMap['FormAgent'] = formMod.agent;
    }
  }

  // Intel agent — skip if fetch failed
  if (intelData) {
    const intelPrompt = intelMod.buildPrompt(matchContext, intelData);
    if (intelPrompt) {
      agentTasks.push({ agent: intelMod.agent, userMessage: intelPrompt });
      agentMap['IntelAgent'] = intelMod.agent;
    }
  }

  // Lineup agent — skips itself via null prompt when lineup unavailable
  if (lineupData) {
    const lineupPrompt = lineupMod.buildPrompt(matchContext, lineupData);
    if (lineupPrompt) {
      agentTasks.push({ agent: lineupMod.agent, userMessage: lineupPrompt });
      agentMap['LineupAgent'] = lineupMod.agent;
    } else {
      console.log('[Orchestrator] LineupAgent skipped — lineup not yet available');
    }
  }

  console.log(`[Orchestrator] ${agentTasks.length} agents active: ${agentTasks.map(t => t.agent.name).join(', ')}`);

  // ── 3. Create session and dispatch Round 1 ───────────────────
  const session = new AgentSession(matchId);
  await session.dispatch(agentTasks);

  // ── 4. Detect conflicts ───────────────────────────────────────
  const conflicts = session.detectConflicts();

  // ── 5. Negotiate Round 2 if conflicts exist ───────────────────
  if (conflicts.length > 0) {
    await session.negotiate(agentMap);
  }

  // ── 6. Build final weighted outputs ──────────────────────────
  const finalOutputs = session.buildFinalOutputs();

  if (finalOutputs.length === 0) {
    throw new Error('[Orchestrator] All agents failed — cannot produce prediction');
  }

  // ── 7. Log-pool blend ─────────────────────────────────────────
  const signals = finalOutputs.map(o => ({
    probs:  o.probability,
    weight: o.finalWeight ?? o.weightRecommendation ?? 0.20,
  }));
  let finalProbs = logPool(signals);
  finalProbs = applyTemperature(finalProbs, getTemperature(db));

  // ── 8. Scoreline derivation ───────────────────────────────────
  const blendedMatrix = reweightMatrixToOutcomeProbs(matrix, backboneProbs, finalProbs);
  const { mostLikely: mostLikelyScore, top: topScores } = pickTopScoresForPoints(blendedMatrix);

  let expHome = 0, expAway = 0;
  for (const [s, p] of Object.entries(blendedMatrix)) {
    const [h, a] = s.split('-').map(Number);
    expHome += h * p;
    expAway += a * p;
  }

  // ── 9. Generate insight (Qwen) ────────────────────────────────
  const insight = await generateOrchestratorInsight(
    matchContext, finalProbs, finalOutputs, conflicts, intelData
  );

  // ── 10. Build supporting metadata ─────────────────────────────
  const confidence  = calcConfidence(finalProbs);
  const factors     = buildAgentFactors(finalOutputs, matchContext);
  const methodology = buildMethodology(finalOutputs);

  // ── 11. Save session to DB ────────────────────────────────────
  const sessionId = session.save('log_pool_weighted');

  // ── 12. Save prediction to DB ─────────────────────────────────
  const { id: predId, generated_at } = savePrediction(
    db, matchId, sessionId,
    finalProbs,
    +expHome.toFixed(2), +expAway.toFixed(2),
    mostLikelyScore, topScores,
    confidence, factors,
    intelData, lineupData,
    insight, methodology,
    lambdaHome, lambdaAway,
  );

  console.log(
    `[Orchestrator] Done — ${confidence} confidence | ` +
    `${homeTeam.name} ${(finalProbs.winHome * 100).toFixed(0)}% / ` +
    `D ${(finalProbs.draw * 100).toFixed(0)}% / ` +
    `${awayTeam.name} ${(finalProbs.winAway * 100).toFixed(0)}% | ` +
    `session=${sessionId.slice(0, 8)}`
  );

  // ── 13. Return in predict() format ───────────────────────────
  return {
    id: predId,
    match_id:             matchId,
    generated_at,
    homeTeam,
    awayTeam,
    prob_home:            finalProbs.winHome,
    prob_draw:            finalProbs.draw,
    prob_away:            finalProbs.winAway,
    expected_score_home:  +expHome.toFixed(2),
    expected_score_away:  +expAway.toFixed(2),
    most_likely_score:    mostLikelyScore,
    top_scores:           topScores,
    confidence,
    factors,
    web_intel:            intelData,
    lineup:               lineupData,
    insight,
    methodology,
    agent_session_id:     sessionId,
    fromCache:            false,
    // Multi-agent metadata (extra fields, ignored by consumers that don't need them)
    multiAgent: {
      sessionId,
      agentsUsed:          finalOutputs.map(o => o.agent),
      conflictsDetected:   conflicts.length,
      rounds:              conflicts.length > 0 ? 2 : 1,
    },
  };
}

module.exports = { runMultiAgentPrediction };
