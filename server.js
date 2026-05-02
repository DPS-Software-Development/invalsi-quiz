// INVALSI Quiz Server - Express + SQLite
// Endpoints:
//   GET  /api/quiz-data    -> tutto il pool di domande
//   POST /api/scores       -> salva un punteggio { name, mode, scope, total, correct, voto, durationSec }
//   GET  /api/leaderboard  -> top 100 punteggi globali (ordinati per voto desc, durata asc)

const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'leaderboard.db');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DB ---
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    scope TEXT NOT NULL,
    total INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    voto REAL NOT NULL,
    duration_sec INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_scores_voto ON scores (voto DESC, duration_sec ASC);
`);

const insertScore = db.prepare(`
  INSERT INTO scores (name, mode, scope, total, correct, voto, duration_sec)
  VALUES (@name, @mode, @scope, @total, @correct, @voto, @durationSec)
`);

const topScores = db.prepare(`
  SELECT id, name, mode, scope, total, correct, voto, duration_sec AS durationSec, created_at AS createdAt
  FROM scores
  ORDER BY voto DESC, duration_sec ASC, id ASC
  LIMIT 100
`);

// --- Quiz data (lazy loaded) ---
let cachedData = null;
function loadQuizData() {
  if (cachedData) return cachedData;
  const file = path.join(DATA_DIR, 'quiz-data.json');
  cachedData = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return cachedData;
}

// --- Routes ---
app.get('/api/quiz-data', (req, res) => {
  try {
    res.json(loadQuizData());
  } catch (err) {
    console.error('Failed to load quiz data:', err);
    res.status(500).json({ error: 'quiz-data-unavailable' });
  }
});

app.post('/api/scores', (req, res) => {
  const { name, mode, scope, total, correct, voto, durationSec } = req.body || {};
  // Validazione minima
  if (!name || typeof name !== 'string' || name.length > 30) return res.status(400).json({ error: 'invalid-name' });
  if (!['allenamento', 'simulazione'].includes(mode)) return res.status(400).json({ error: 'invalid-mode' });
  if (typeof scope !== 'string' || scope.length > 80) return res.status(400).json({ error: 'invalid-scope' });
  if (!Number.isInteger(total) || total <= 0 || total > 200) return res.status(400).json({ error: 'invalid-total' });
  if (!Number.isInteger(correct) || correct < 0 || correct > total) return res.status(400).json({ error: 'invalid-correct' });
  if (typeof voto !== 'number' || voto < 0 || voto > 10) return res.status(400).json({ error: 'invalid-voto' });
  if (!Number.isInteger(durationSec) || durationSec < 0 || durationSec > 60 * 60 * 3) return res.status(400).json({ error: 'invalid-duration' });

  // sanitize del nome
  const cleanName = name.trim().replace(/[<>]/g, '').slice(0, 30) || 'Anonimo';

  const result = insertScore.run({
    name: cleanName,
    mode,
    scope,
    total,
    correct,
    voto: Math.round(voto * 100) / 100,
    durationSec
  });
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ scores: topScores.all() });
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// SPA fallback (any non-API path -> index.html)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`INVALSI Quiz server listening on :${PORT}`);
});
