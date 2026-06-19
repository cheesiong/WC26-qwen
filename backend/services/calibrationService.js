/**
 * Output probability calibration via temperature scaling.
 *
 *   p_calibrated_i ∝ p_raw_i^(1/T)
 *
 * T > 1 softens probabilities (less confident); T < 1 sharpens.
 * We fit T by minimising negative log-likelihood on the existing
 * (raw prediction, actual outcome) pairs in the `predictions` table.
 *
 * Triggered from analysisService.recordMatchResult every 10 new completed
 * matches once we have ≥20 results. Before that the temperature stays at
 * its seeded default (1.0 = no scaling).
 */

const { getDb } = require('../database/db');
const { dcScoreMatrix } = require('./predictionEngine');

const MIN_SAMPLES = 15;
const T_MIN = 0.5;
const T_MAX = 2.5;
const T_STEPS = 41;          // 0.05 resolution on [0.5, 2.5]

const RHO_MIN = -0.30;
const RHO_MAX =  0.05;
const RHO_STEPS = 36;        // 0.01 resolution on [-0.30, 0.05]
const RHO_MIN_SAMPLES = 20;  // need a few more matches than W/D/L temperature

function softmaxScale(probs, T) {
  // log-space, with floor to avoid log(0)
  const logH = Math.log(Math.max(probs.prob_home, 1e-6)) / T;
  const logD = Math.log(Math.max(probs.prob_draw, 1e-6)) / T;
  const logA = Math.log(Math.max(probs.prob_away, 1e-6)) / T;
  const m = Math.max(logH, logD, logA);
  const eH = Math.exp(logH - m);
  const eD = Math.exp(logD - m);
  const eA = Math.exp(logA - m);
  const z = eH + eD + eA;
  return { pH: eH / z, pD: eD / z, pA: eA / z };
}

function nllAt(predictions, T) {
  let total = 0;
  for (const p of predictions) {
    const { pH, pD, pA } = softmaxScale(p, T);
    const pActual = p.actual_outcome === 'HOME' ? pH
                  : p.actual_outcome === 'DRAW' ? pD
                  : pA;
    total += -Math.log(Math.max(pActual, 1e-12));
  }
  return total / predictions.length;
}

function refitTemperature() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT prob_home, prob_draw, prob_away, actual_outcome
    FROM predictions
    WHERE actual_outcome IS NOT NULL
  `).all();

  if (rows.length < MIN_SAMPLES) {
    return { fitted: false, reason: `need ≥${MIN_SAMPLES} samples (have ${rows.length})` };
  }

  // Grid search over T (smooth NLL surface, ~40 evaluations)
  let bestT = 1.0;
  let bestNll = Infinity;
  for (let i = 0; i < T_STEPS; i++) {
    const T = T_MIN + (T_MAX - T_MIN) * (i / (T_STEPS - 1));
    const nll = nllAt(rows, T);
    if (nll < bestNll) { bestNll = nll; bestT = T; }
  }

  db.prepare(`
    INSERT INTO model_config (key, value, description, updated_at)
    VALUES ('calibration_temperature', ?, 'Temperature scaling applied to output W/D/L probs; 1.0 = no scaling', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run([bestT]);

  console.log(`📐 Calibration refit: T=${bestT.toFixed(3)} (NLL=${bestNll.toFixed(4)}, n=${rows.length})`);
  return { fitted: true, temperature: bestT, nll: bestNll, samples: rows.length };
}

// ── Dixon-Coles ρ fit ───────────────────────────────────────────────
// For each completed match with stored backbone lambdas, the DC matrix at
// candidate ρ assigns a probability to the actual scoreline. The MLE ρ
// maximises Σ log P(actual | λ_home, λ_away, ρ).
function refitDcRho() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.lambda_home, p.lambda_away,
           CAST(m.home_score AS INTEGER) AS hs,
           CAST(m.away_score AS INTEGER) AS as_
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.actual_outcome IS NOT NULL
      AND p.lambda_home IS NOT NULL
      AND p.lambda_away IS NOT NULL
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL
  `).all();

  if (rows.length < RHO_MIN_SAMPLES) {
    return { fitted: false, reason: `need ≥${RHO_MIN_SAMPLES} samples (have ${rows.length})` };
  }

  let bestRho = 0;
  let bestNll = Infinity;
  for (let i = 0; i < RHO_STEPS; i++) {
    const rho = RHO_MIN + (RHO_MAX - RHO_MIN) * (i / (RHO_STEPS - 1));
    let nll = 0;
    for (const r of rows) {
      const matrix = dcScoreMatrix(r.lambda_home, r.lambda_away, rho);
      const cell = matrix[`${r.hs}-${r.as_}`] ?? 0;
      nll += -Math.log(Math.max(cell, 1e-12));
    }
    nll /= rows.length;
    if (nll < bestNll) { bestNll = nll; bestRho = rho; }
  }

  db.prepare(`
    INSERT INTO model_config (key, value, description, updated_at)
    VALUES ('dc_rho', ?, 'Dixon-Coles low-score correction; fit on observed WC scorelines', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run([bestRho]);

  console.log(`📐 DC ρ refit: ρ=${bestRho.toFixed(3)} (NLL=${bestNll.toFixed(4)}, n=${rows.length})`);
  return { fitted: true, rho: bestRho, nll: bestNll, samples: rows.length };
}

module.exports = { refitTemperature, refitDcRho };
