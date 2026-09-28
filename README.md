# Ledger — Expense Tracker

A responsive full stack personal finance tracker with React, Express, Supabase PostgreSQL, Supabase Auth, row level security, and Chart.js.

## Features

- Register, log in, log out and update profile
- Add, edit and delete income and expenses; categories and dates
- Dashboard totals, balance, monthly spending and charts
- Monthly reports with savings and spending percentage
- Transaction search, date/category/type/amount filters, pagination and CSV export
- Print monthly reports as PDF using the browser print dialog

## Local setup

1. Run `npm install`.
2. Create a dedicated Supabase project. Apply the SQL in `supabase/migrations/` through the Supabase CLI or SQL Editor. Enable email signups and configure the Auth Site URL to your frontend domain so confirmation links return to the app.
3. Copy `.env.example` to `.env`. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` using your project's API settings. Use the publishable key, never a service-role/secret key.
4. Run `npm run server` in one terminal and `npm run dev` in another.
5. Open `http://localhost:5173`.

New users confirm their email if confirmation is enabled in Supabase. The API refreshes expired access tokens. Existing accounts from the former MongoDB version are not migrated; that deployment never had a configured MongoDB connection.

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
| GET | `/api/reports?month=YYYY-MM` | Monthly and all-time aggregates |

Protected routes require `Authorization: Bearer <Supabase access token>`. PostgreSQL RLS also enforces ownership on profiles and transactions. Monetary values use `numeric(15,2)`. Currency preference changes formatting only; it does not convert values.
