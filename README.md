# Fleet & Logistics Dashboard

A real-time fleet monitoring dashboard built for a small-scale transport company. It combines live GPS data and load records from Google Sheets into one searchable, responsive interface with light and dark themes.

> This repository contains **no business data or credentials**. All secrets live in environment variables that are not committed.

<!-- Add sanitised screenshots here (light + dark), e.g. ![Dashboard](docs/dashboard-light.png) -->

## Features
- Live vehicle status (running / idle / stopped), odometer, daily and monthly km
- Load tracking from two Google Sheets, with POD-missing and not-unloaded alerts
- Sortable, searchable vehicle table with status filters and a per-vehicle load history
- Donut chart pivot of loads grouped by loading point (Recharts)
- Auto-refresh every 60 seconds; a failed refresh keeps the last good data on screen
- Password-protected access, responsive layout, light/dark theme

## Tech stack
**Frontend:** React, Vite, Recharts, CSS variables for theming
**Backend:** Node.js, Express, Google Sheets API, Axestrack GPS API

## Architecture
```
React client  --(Bearer token)-->  Express API  -->  Axestrack GPS API
                                        |-------->  Google Sheets API
```
The browser never talks to third-party APIs or sees their keys; the Express server does, and caches responses for 30-60 seconds to respect rate limits.

## Security
- Passwords and API keys are read from `.env` and are never bundled into the frontend
- Login issues a signed token that expires after 8 hours; all data routes require it
- Login attempts are rate-limited and CORS is restricted to the frontend origin
- `.env` and Google credentials are git-ignored

## Run locally
```bash
# 1. Backend
cd server
cp .env.example .env        # fill in your own values
# place your own google-credentials.json (service account) in this folder
npm install
node server.js

# 2. Frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev
```
Open http://localhost:5173 and sign in with the password you set in `server/.env`.

## Roadmap
- Demo mode with sample data for public hosting
- Split `App.jsx` into components and a `useFleetData` hook
- Unit tests for status and date helpers


Some Screenshots of current business fleet using it are
<br>
<img width="500" height="250" alt="Screenshot (413)" src="https://github.com/user-attachments/assets/da431526-b475-4122-9bb6-2162d4ebb620" />
<img width="500" height="250" alt="Screenshot (414)" src="https://github.com/user-attachments/assets/587e34b4-cf04-49bf-aefa-b32ca81f84c2" />
<img width="500" height="250" alt="Screenshot (415)" src="https://github.com/user-attachments/assets/1737132b-3196-4880-8917-32cd99c06039" />
<img width="500" height="250"  alt="Screenshot (416)" src="https://github.com/user-attachments/assets/ada71414-bf5d-476a-88d7-d5c05790f148" />
<img width="500" height="250" alt="Screenshot (417)" src="https://github.com/user-attachments/assets/476f4c89-5a7e-45f2-903c-4b3700a3328e" />



## Author
Devansh Garg - [LinkedIn](https://www.linkedin.com/in/devansh-garg-407413322/)
