const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/worldcup2026.db');
const LOCK_PATH = DB_PATH + '.lock';

let db;

function getDb() {
  if (!db) {
    // node-sqlite3-wasm uses a directory-based lock; remove stale locks left by crashed processes
    try { fs.rmdirSync(LOCK_PATH); } catch {}
    db = new Database(DB_PATH);
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Teams with dynamic ELO (starts from FIFA points, updates after each match)
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      flag TEXT,
      group_code TEXT,
      confederation TEXT,
      fifa_rank INTEGER,
      fifa_points REAL,
      elo REAL,          -- Live ELO, updated after each match
      avg_scored REAL,
      avg_conceded REAL,
      wc_appearances INTEGER DEFAULT 0,
      last_wc_round TEXT,
      -- Group stage running totals
      gs_played INTEGER DEFAULT 0,
      gs_won INTEGER DEFAULT 0,
      gs_drawn INTEGER DEFAULT 0,
      gs_lost INTEGER DEFAULT 0,
      gs_gf INTEGER DEFAULT 0,
      gs_ga INTEGER DEFAULT 0,
      gs_pts INTEGER DEFAULT 0,
      eliminated INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- All matches (group + knockout)
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      stage TEXT NOT NULL,        -- 'GROUP', 'R32', 'R16', 'QF', 'SF', 'F'
      group_code TEXT,
      match_number INTEGER,
      home_team TEXT REFERENCES teams(id),
      away_team TEXT REFERENCES teams(id),
      scheduled_date TEXT,
      scheduled_time TEXT,
      venue TEXT,
      status TEXT DEFAULT 'SCHEDULED',  -- SCHEDULED | LIVE | COMPLETED
      home_score INTEGER,
      away_score INTEGER,
      home_score_pens INTEGER,
      away_score_pens INTEGER,
      winner TEXT REFERENCES teams(id),
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- Pre-match predictions
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL REFERENCES matches(id),
      generated_at TEXT DEFAULT (datetime('now')),
      prob_home REAL NOT NULL,
      prob_draw REAL NOT NULL,
      prob_away REAL NOT NULL,
      expected_score_home REAL,
      expected_score_away REAL,
      most_likely_score TEXT,
      top_scores TEXT,          -- JSON: [{score, prob}, ...] top 3 scorelines
      confidence TEXT,          -- LOW | MEDIUM | HIGH | VERY_HIGH
      factors TEXT,             -- JSON array of factor objects
      web_intel TEXT,           -- JSON: scraped news/injury info
      insight TEXT,             -- Human-readable summary paragraph
      methodology TEXT,
      -- Post-match truth (filled in after match ends)
      actual_outcome TEXT,      -- 'HOME' | 'DRAW' | 'AWAY'
      was_correct INTEGER,      -- 0 or 1
      brier_score REAL,         -- probability calibration error
      upset INTEGER DEFAULT 0   -- 1 if heavy favourite lost
    );

    -- Model performance tracking
    CREATE TABLE IF NOT EXISTS model_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT REFERENCES matches(id),
      stage TEXT,
      predicted_outcome TEXT,
      actual_outcome TEXT,
      was_correct INTEGER,
      brier_score REAL,
      prob_predicted REAL,      -- probability assigned to actual outcome
      confidence TEXT,
      upset INTEGER DEFAULT 0,
      analysis_notes TEXT,      -- what we learned
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Bracket progression tracking
    CREATE TABLE IF NOT EXISTS bracket_slots (
      match_id TEXT PRIMARY KEY REFERENCES matches(id),
      slot_home TEXT,   -- e.g. "1A", "2B", "3rd-ABCD"
      slot_away TEXT,
      filled_at TEXT
    );

    -- ELO rating history (one record per completed match)
    CREATE TABLE IF NOT EXISTS elo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL REFERENCES teams(id),
      match_id TEXT REFERENCES matches(id),
      elo_before REAL,
      elo_after REAL,
      opponent_id TEXT REFERENCES teams(id),
      result TEXT,         -- 'W' | 'D' | 'L'
      stage TEXT,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    -- Player suspensions (yellow card accumulation, red cards)
    CREATE TABLE IF NOT EXISTS suspensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL REFERENCES teams(id),
      player_name TEXT NOT NULL,
      reason TEXT NOT NULL,         -- 'yellow_accumulation' | 'red_card' | 'disciplinary'
      yellow_cards INTEGER DEFAULT 0,
      suspended_for_match_id TEXT,  -- the match they CANNOT play
      source TEXT DEFAULT 'manual', -- 'manual' | 'api' | 'scraped'
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Cached web intelligence (injury news, form, lineups)
    CREATE TABLE IF NOT EXISTS web_intel_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT,
      match_id TEXT,
      intel_type TEXT,          -- 'injury' | 'form' | 'lineup' | 'news'
      content TEXT,
      source_url TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    -- Model weights (adjustable after learning)
    CREATE TABLE IF NOT EXISTS model_config (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Multi-agent session tracking ──────────────────────────────
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,                        -- UUID
      match_id TEXT REFERENCES matches(id),
      agents_used TEXT,                           -- JSON array of agent names
      rounds INTEGER DEFAULT 1,                   -- 1 = no conflicts, 2 = negotiation ran
      conflicts_detected INTEGER DEFAULT 0,
      conflicts_resolved INTEGER DEFAULT 0,
      synthesis_method TEXT,                      -- 'log_pool_weighted' | 'arbitrated'
      wall_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Every agent message: Round 1 analyses + Round 2 rebuttals
    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES agent_sessions(id),
      round INTEGER NOT NULL,                     -- 1 or 2
      agent TEXT NOT NULL,                        -- e.g. 'FormAgent'
      role TEXT NOT NULL,                         -- 'analysis' | 'rebuttal' | 'arbitration'
      probability TEXT,                           -- JSON {winHome, draw, winAway}
      confidence REAL,
      evidence TEXT,                              -- JSON array of strings
      raw_response TEXT,
      latency_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Detected conflicts and their resolution outcomes
    CREATE TABLE IF NOT EXISTS agent_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES agent_sessions(id),
      agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL,
      delta REAL NOT NULL,                        -- max probability gap that triggered conflict
      round_detected INTEGER DEFAULT 1,
      resolution TEXT,                            -- 'agent_a_won' | 'agent_b_won' | 'arbitrated'
      winner TEXT,
      resolution_reasoning TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add scheduled_time if missing from existing databases
  try { db.exec('ALTER TABLE matches ADD COLUMN scheduled_time TEXT'); } catch {}
  // Migration: add top_scores if missing from existing databases
  try { db.exec('ALTER TABLE predictions ADD COLUMN top_scores TEXT'); } catch {}
  // Migration: Dixon-Coles attack/defense ratings (v2 backbone)
  try { db.exec('ALTER TABLE teams ADD COLUMN log_alpha REAL'); } catch {}
  try { db.exec('ALTER TABLE teams ADD COLUMN log_beta REAL'); } catch {}
  try { db.exec('ALTER TABLE teams ADD COLUMN log_alpha_prior REAL'); } catch {}
  try { db.exec('ALTER TABLE teams ADD COLUMN log_beta_prior REAL'); } catch {}
  // Migration: points-based scoring (3/2/1/0 per match)
  try { db.exec('ALTER TABLE model_performance ADD COLUMN points INTEGER DEFAULT 0'); } catch {}
  // Migration: backbone lambdas captured at prediction time, used by
  // calibrationService to refit Dixon-Coles ρ on observed scorelines.
  try { db.exec('ALTER TABLE predictions ADD COLUMN lambda_home REAL'); } catch {}
  try { db.exec('ALTER TABLE predictions ADD COLUMN lambda_away REAL'); } catch {}
  // Migration: link predictions to the multi-agent session that produced them
  try { db.exec('ALTER TABLE predictions ADD COLUMN agent_session_id TEXT'); } catch {}

  // Seed default model weights if not present
  const weights = [
    ['w_elo',        0.28, 'ELO rating differential weight'],
    ['w_poisson',    0.22, 'Poisson goal model weight'],
    ['w_form',       0.18, 'Recent form weight (last 10 matches)'],
    ['w_h2h',        0.12, 'Head-to-head record weight (real historical data)'],
    ['w_intel',      0.10, 'Web intelligence (injuries/news) weight'],
    ['w_wc_exp',     0.05, 'World Cup experience weight'],
    ['w_lineup',     0.05, 'Announced starting XI strength weight (activates ~1hr before KO)'],
    ['w_host',       0.04, 'Host nation home advantage (USA/CAN/MEX only)'],
    ['w_rest',       0.03, 'Rest days / fixture congestion factor'],
    ['elo_k_factor', 40,   'K-factor for ELO updates in WC matches'],
    ['global_avg_goals', 2.7, 'Global average goals per match (reference)'],
    ['use_multi_agent', 0, 'Feature flag: 1 = multi-agent Qwen prediction, 0 = legacy single-agent'],
  ];

  const upsert = db.prepare(`
    INSERT OR IGNORE INTO model_config (key, value, description)
    VALUES (?, ?, ?)
  `);
  for (const [k, v, d] of weights) upsert.run([k, v, d]);
}

module.exports = { getDb };
