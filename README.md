# Ledger — Expense Tracker

A responsive full stack personal finance tracker with React, Express, Supabase PostgreSQL, Supabase Auth, row level security, and Chart.js.

## Features

- Register, log in, log out and update profile
- Add, edit and delete income and expenses; categories and dates
- Dashboard totals, balance, monthly spending and charts
- Monthly reports with savings and spending percentage
- Transaction search, date/category/type/amount filters, pagination and CSV export
- Import a bank statement CSV after signing in, with column mapping, preview and duplicate detection
- Print monthly reports as PDF using the browser print dialog

## Local setup

1. Run `npm install`.
2. Create a dedicated Supabase project. Apply the SQL in `supabase/migrations/` through the Supabase CLI or SQL Editor. Enable email signups and configure the Auth Site URL to your frontend domain so confirmation links return to the app.
3. Copy `.env.example` to `.env`. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` using your project's API settings. Use the publishable key, never a service-role/secret key.
4. Run `npm run server` in one terminal and `npm run dev` in another.
5. Open `http://localhost:5173`.

New users confirm their email if confirmation is enabled in Supabase. The API refreshes expired access tokens. Existing accounts from the former MongoDB version are not migrated; that deployment never had a configured MongoDB connection.

## Bank statements

Use **Transactions → Import bank CSV** after exporting a CSV from your bank. Give the account a consistent nickname, choose date, description and either separate debit/credit columns or a signed amount column, then review every row before import. Dates can be YYYY-MM-DD or DD/MM/YYYY. Import at most 1,000 rows or 2 MB per file. Rows with invalid amounts or dates block import until corrected. Categories default to Other income/Other expense and can be edited later. Re-importing the same normalized row with the same nickname skips it; identical same-day rows in one statement are counted separately. For overlapping statements with different ordering of identical same-day rows, review for possible duplicates.

The file is parsed in the browser; only selected transaction data and the account nickname are sent to the API. No bank passwords, OTPs, account numbers or raw statement files are requested or stored. This is a manual statement import, not a live bank connection. Live Indian bank data through Account Aggregator requires a regulated FIU or approved partner, provider onboarding and a consent flow; no provider credentials or paid service are configured here.

## Vercel deployment

Import this repository into Vercel as a root project. The included `vercel.json` builds the React frontend and routes `/api/*` to the Express function. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` under Vercel project environment variables for Production and Preview. Production calls use the same domain. Set the Supabase Auth Site URL to the deployed address, and enable its URL in the redirect allow list if needed. Remove legacy `MONGODB_URI` and `JWT_SECRET` from Vercel configuration after the Supabase release is live. Do not import `.env.example` as actual production credentials.

Do not commit `.env`. The sample `.env.example` contains placeholders only. For a local production build run `npm run build`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/refresh` | Refresh session |
| POST | `/api/auth/logout` | Revoke session |
| GET, PATCH | `/api/me` | Read/update own profile |
| GET, POST | `/api/transactions` | List/create own transactions |
| PATCH, DELETE | `/api/transactions/:id` | Update/delete own transaction |
| POST | `/api/imports/bank-csv` | Import up to 100 authenticated statement rows per request, skipping prior imports |
| GET | `/api/reports?month=YYYY-MM` | Monthly and all-time aggregates |

Protected routes require `Authorization: Bearer <Supabase access token>`. PostgreSQL RLS also enforces ownership on profiles and transactions. Monetary values use `numeric(15,2)`. Currency preference changes formatting only; it does not convert values.
# Bank accounts and live connections

The **Bank accounts** page groups imported CSV statements by account nickname. It labels these as imported statements, with no live bank connection or automatic sync. Account history remains available through the Transactions view and its account filter. Imports are idempotent for the same statement rows and nickname.

Live Indian bank linking requires a licensed or otherwise eligible Financial Information User, production Account Aggregator provider credentials, the provider's consent flow and approved webhook/data handling. No production provider access is configured in this repository. The `/api/banks/status` endpoint reports this explicitly; the connect button is disabled until a real integration is approved and implemented. Never enter bank passwords or OTPs into this application. The count of participating financial information providers is dynamic and includes more than banks.
