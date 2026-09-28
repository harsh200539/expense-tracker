# Ledger — Expense Tracker

A responsive full stack personal finance tracker with React, Express, MongoDB, JWT authentication, bcrypt password hashing, and Chart.js.

## Features

- Register, log in, log out and update profile
- Add, edit and delete income and expenses; categories and dates
- Dashboard totals, balance, monthly spending and charts
- Monthly reports with savings and spending percentage
- Transaction search, date/category/type/amount filters, pagination and CSV export
- Print monthly reports as PDF using the browser print dialog

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI` to a MongoDB database you control and `JWT_SECRET` to a randomly generated string of at least 32 characters.
3. Run `npm run server` in one terminal and `npm run dev` in another.
4. Open `http://localhost:5173`.

The database needs no manual schema setup. Registration creates a unique email index.

## Vercel deployment

Import this repository into Vercel as a root project. The included `vercel.json` builds the React frontend and routes `/api/*` to the Express function. Add a real `MONGODB_URI` and a randomly generated `JWT_SECRET` under Vercel project environment variables for Production and Preview. MongoDB Atlas network access must permit Vercel's outgoing connections. The default CORS origin permits local development; production calls always use the same domain and do not need CORS. Sample `.env.example` values must not be copied into production.

Do not commit `.env`. The sample `.env.example` contains placeholders only. For a local production build run `npm run build`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| GET, PATCH | `/api/me` | Read/update own profile |
| GET, POST | `/api/transactions` | List/create own transactions |
| PATCH, DELETE | `/api/transactions/:id` | Update/delete own transaction |
| GET | `/api/reports?month=YYYY-MM` | Monthly and all-time aggregates |

Protected routes require `Authorization: Bearer <token>`. Monetary values are stored as two-decimal numeric amounts. Currency preference changes formatting only; it does not convert values.
