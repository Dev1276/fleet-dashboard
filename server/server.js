require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { google } = require('googleapis');

const { DASHBOARD_PASSWORD, TOKEN_SECRET, AXESTRACK_TOKEN, SHEET_ID } = process.env;
if (!DASHBOARD_PASSWORD || !TOKEN_SECRET) throw new Error('Set DASHBOARD_PASSWORD and TOKEN_SECRET in .env');

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173' })); // only your frontend
app.use(express.json());

// ---------- AUTH: signed, expiring tokens (no extra dependency) ----------
const sign = (p) => crypto.createHmac('sha256', TOKEN_SECRET).update(p).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const makeToken = () => { const exp = String(Date.now() + 8 * 3600 * 1000); return `${exp}.${sign(exp)}`; };
const requireAuth = (req, res, next) => {
  const [exp, sig] = (req.headers.authorization || '').replace('Bearer ', '').split('.');
  if (!exp || !sig || !safeEq(sig, sign(exp)) || Date.now() > Number(exp)) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const attempts = {}; // naive brute-force limiter: 10 tries / 15 min / IP
app.post('/api/login', (req, res) => {
  const ip = req.ip, now = Date.now();
  attempts[ip] = (attempts[ip] || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts[ip].length >= 10) return res.status(429).json({ error: 'Too many attempts' });
  const pw = String(req.body.password || '');
  if (!safeEq(pw, DASHBOARD_PASSWORD)) { attempts[ip].push(now); return res.status(401).json({ error: 'Wrong password' }); }
  res.json({ token: makeToken() });
});

// ---------- CACHE: protects Axestrack / Sheets rate limits ----------
const cache = {};
const cached = async (key, ttlMs, fn) => {
  const hit = cache[key];
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache[key] = { v, t: Date.now() };
  return v;
};

const axes = async (path, body) => {
  const r = await fetch(`https://api.fvts.in/webapi/reports/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', AuthToken: AXESTRACK_TOKEN },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Axestrack ${path} returned ${r.status}`);
  return r.json();
};

app.get('/api/fleet', requireAuth, async (req, res) => {
  try { res.json(await cached('fleet', 30000, () => axes('company/commonreport', { reporttype: 'kmsummary', groupid: -1 }))); }
  catch (e) { console.error('KM error:', e.message); res.status(502).json({ error: 'Failed to fetch KM data' }); }
});

app.get('/api/status', requireAuth, async (req, res) => {
  try { res.json(await cached('status', 30000, () => axes('dashboard/homepage', { groupid: -1 }))); }
  catch (e) { console.error('Status error:', e.message); res.json({ data: [] }); } // map status is optional
});

app.get('/api/loads', requireAuth, async (req, res) => {
  try {
    const rows = await cached('loads', 60000, async () => {
      const auth = new google.auth.GoogleAuth({ keyFile: 'google-credentials.json', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
      const sheets = google.sheets({ version: 'v4', auth });
      const get = (range) => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
      const [r1, r2] = await Promise.all([get('Sheet1!A:Z'), get('Sheet2!A:Z')]);
      const format = (values, loadType) => {
        if (!values || !values.length) return [];
        const headers = values[0].map(h => h.trim());
        return values.slice(1).map(row => Object.fromEntries([['loadType', loadType], ...headers.map((h, i) => [h, row[i] || ''])]));
      };
      return [...format(r1.data.values, 'Type 1'), ...format(r2.data.values, 'Type 2')];
    });
    res.json(rows);
  } catch (e) { console.error('Sheets error:', e.message); res.status(502).json({ error: 'Failed to fetch Google Sheets data' }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
