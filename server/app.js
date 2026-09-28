import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import { db } from './db.js';

const app = express();
app.use(express.json({ limit: '128kb' }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const fail = (res, code, message) => res.status(code).json({ error: message });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const checked = result => { if (result.error) throw result.error; return result; };
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicUser = (user, profile) => ({ id: user.id, name: profile?.name || user.user_metadata?.name || 'User', email: user.email, currency: profile?.currency || 'INR' });
const uuid = raw => typeof raw === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
const transactionInput = body => {
  const title = cleanText(body.title, 100);
  const category = cleanText(body.category, 40);
  const amount = Number(body.amount);
  const type = body.type;
  const date = body.date;
  if (!title || !category || !['income', 'expense'].includes(type) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  return { title, category, amount: Math.round(amount * 100) / 100, type, date };
};
const authenticate = wrap(async (req, res, next) => {
  const token = (req.headers.authorization || '').match(/^Bearer (.+)$/i)?.[1];
  if (!token) return fail(res, 401, 'Please sign in again.');
  const client = db(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return fail(res, 401, 'Please sign in again.');
  req.user = data.user;
  req.client = client;
  req.token = token;
  next();
});
const profileFor = async req => {
  const result = checked(await req.client.from('profiles').select('name,currency').eq('user_id', req.user.id).maybeSingle());
  if (result.data) return result.data;
  // Email confirmation can defer profile creation until the first authenticated request.
  const name = cleanText(req.user.user_metadata?.name, 80) || 'User';
  return checked(await req.client.from('profiles').upsert({ user_id: req.user.id, name, currency: 'INR' }, { onConflict: 'user_id' }).select('name,currency').single()).data;
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = req.body.password;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return fail(res, 400, 'Enter a name, valid email and password of at least 8 characters.');
  const { data, error } = await db().auth.signUp({ email, password, options: { data: { name } } });
  if (error) return fail(res, error.status === 429 ? 429 : 400, error.message);
  if (!data.session) return res.status(201).json({ confirmationRequired: true });
  res.status(201).json({ user: publicUser(data.user), token: data.session.access_token, refreshToken: data.session.refresh_token });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase();
  if (!email || typeof req.body.password !== 'string') return fail(res, 400, 'Enter your email and password.');
  const { data, error } = await db().auth.signInWithPassword({ email, password: req.body.password });
  if (error) return fail(res, 401, error.message);
  res.json({ user: publicUser(data.user), token: data.session.access_token, refreshToken: data.session.refresh_token });
}));
app.post('/api/auth/refresh', wrap(async (req, res) => {
  if (typeof req.body.refreshToken !== 'string') return fail(res, 401, 'Please sign in again.');
  const { data, error } = await db().auth.refreshSession({ refresh_token: req.body.refreshToken });
  if (error || !data.session) return fail(res, 401, 'Please sign in again.');
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
}));
app.post('/api/auth/logout', authenticate, wrap(async (req, res) => {
  if (typeof req.body?.refreshToken === 'string') {
    const client = db();
    const { error } = await client.auth.setSession({ access_token: req.token, refresh_token: req.body.refreshToken });
    if (!error) await client.auth.signOut();
  }
  res.status(204).end();
}));
app.get('/api/me', authenticate, wrap(async (req, res) => res.json({ user: publicUser(req.user, await profileFor(req)) })));
app.get('/api/banks/status', authenticate, (_req, res) => res.json({ liveConnectionsAvailable: false, provider: 'Account Aggregator', message: 'Live bank linking requires production FIU approval and Account Aggregator credentials. Bank passwords and OTPs are never collected by Ledger.' }));
app.get('/api/bank-accounts', authenticate, wrap(async (req, res) => {
  const { data } = checked(await req.client.from('bank_accounts').select('id,nickname,source,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }));
  res.json({ items: data });
}));
app.patch('/api/me', authenticate, wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const currency = req.body.currency;
  if (!name || !['INR', 'USD', 'EUR', 'GBP'].includes(currency)) return fail(res, 400, 'Enter a name and select a supported currency.');
  const result = checked(await req.client.from('profiles').upsert({ user_id: req.user.id, name, currency }, { onConflict: 'user_id' }).select('name,currency').single());
  res.json({ user: publicUser(req.user, result.data) });
}));
app.get('/api/transactions', authenticate, wrap(async (req, res) => {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  let query = req.client.from('transactions').select('id,title,amount,type,category,date,bank_account_id', { count: 'exact' }).eq('user_id', req.user.id);
  if (uuid(req.query.bankAccountId)) query = query.eq('bank_account_id', req.query.bankAccountId);
  if (['income', 'expense'].includes(req.query.type)) query = query.eq('type', req.query.type);
  if (typeof req.query.category === 'string' && req.query.category) query = query.eq('category', req.query.category);
  if (typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) {
    const [year, month] = req.query.month.split('-').map(Number);
    query = query.gte('date', `${req.query.month}-01`).lt('date', new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10));
  } else if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) query = query.eq('date', req.query.date);
  if (typeof req.query.search === 'string' && req.query.search.trim()) query = query.ilike('title', `%${req.query.search.trim().slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`);
  const min = Number(req.query.minAmount), max = Number(req.query.maxAmount);
  if (req.query.minAmount !== undefined && Number.isFinite(min) && min >= 0) query = query.gte('amount', min);
  if (req.query.maxAmount !== undefined && Number.isFinite(max) && max >= 0) query = query.lte('amount', max);
  const { data, count } = checked(await query.order('date', { ascending: false }).order('id', { ascending: false }).range((page - 1) * limit, page * limit - 1));
  res.json({ items: data, total: count || 0, page, pages: Math.max(1, Math.ceil((count || 0) / limit)) });
}));
app.post('/api/transactions', authenticate, wrap(async (req, res) => {
  let transaction; try { transaction = transactionInput(req.body); } catch { transaction = null; }
  if (!transaction) return fail(res, 400, 'Enter a valid title, category, date and positive amount.');
  res.status(201).json(checked(await req.client.from('transactions').insert({ ...transaction, user_id: req.user.id }).select('id,title,amount,type,category,date').single()).data);
}));
app.post('/api/imports/bank-csv', authenticate, wrap(async (req, res) => {
  const account = cleanText(req.body?.account, 60);
  const rows = req.body?.rows;
  if (!account || !Array.isArray(rows) || rows.length < 1 || rows.length > 100) return fail(res, 400, 'Provide an account nickname and 1–100 statement rows.');
  const records = [];
  for (const row of rows) {
    let transaction;
    try { transaction = transactionInput(row); } catch { transaction = null; }
    if (!transaction || !Number.isSafeInteger(row.occurrence) || row.occurrence < 1 || row.occurrence > 1000) return fail(res, 400, 'One or more statement rows are invalid.');
    const key = JSON.stringify([account.toLowerCase(), transaction.date, transaction.type, transaction.amount, transaction.title.toLowerCase(), row.occurrence]);
    records.push({ ...transaction, user_id: req.user.id, source_fingerprint: createHash('sha256').update(key).digest('hex') });
  }
  let bankAccount = checked(await req.client.from('bank_accounts').select('id,source').eq('user_id', req.user.id).eq('nickname', account).maybeSingle()).data;
  if (bankAccount?.source !== 'csv' && bankAccount) return fail(res, 409, 'This account name belongs to a live connection. Choose another nickname.');
  if (!bankAccount) bankAccount = checked(await req.client.from('bank_accounts').upsert({ user_id: req.user.id, nickname: account, source: 'csv' }, { onConflict: 'user_id,nickname', ignoreDuplicates: true }).select('id').maybeSingle()).data || checked(await req.client.from('bank_accounts').select('id').eq('user_id', req.user.id).eq('nickname', account).single()).data;
  for (const record of records) record.bank_account_id = bankAccount.id;
  const { data } = checked(await req.client.from('transactions').upsert(records, { onConflict: 'user_id,source_fingerprint', ignoreDuplicates: true }).select('id'));
  res.json({ imported: data.length, skipped: rows.length - data.length });
}));
app.patch('/api/transactions/:id', authenticate, wrap(async (req, res) => {
  let transaction; try { transaction = transactionInput(req.body); } catch { transaction = null; }
  if (!uuid(req.params.id) || !transaction) return fail(res, 400, 'Invalid transaction.');
  const result = checked(await req.client.from('transactions').update(transaction).eq('id', req.params.id).eq('user_id', req.user.id).select('id,title,amount,type,category,date').maybeSingle());
  if (!result.data) return fail(res, 404, 'Transaction not found.');
  res.json(result.data);
}));
app.delete('/api/transactions/:id', authenticate, wrap(async (req, res) => {
  if (!uuid(req.params.id)) return fail(res, 400, 'Invalid transaction ID.');
  const result = checked(await req.client.from('transactions').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle());
  if (!result.data) return fail(res, 404, 'Transaction not found.');
  res.status(204).end();
}));
app.get('/api/reports', authenticate, wrap(async (req, res) => {
  const transactions = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = checked(await req.client.from('transactions').select('amount,type,category,date').eq('user_id', req.user.id).order('id').range(offset, offset + 999));
    transactions.push(...data);
    if (data.length < 1000) break;
  }
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const monthly = {}, categories = {};
  let totalIncome = 0, totalExpenses = 0, income = 0, expenses = 0;
  for (const item of transactions) {
    const amount = Number(item.amount);
    const bucket = (monthly[item.date.slice(0, 7)] ||= { income: 0, expenses: 0 });
    if (item.type === 'income') { totalIncome += amount; bucket.income += amount; if (item.date.startsWith(month)) income += amount; }
    else { totalExpenses += amount; bucket.expenses += amount; if (item.date.startsWith(month)) { expenses += amount; categories[item.category] = (categories[item.category] || 0) + amount; } }
  }
  res.json({ month, totalIncome, totalExpenses, balance: totalIncome - totalExpenses, income, expenses, savings: income - expenses, spendingPercentage: income ? expenses / income * 100 : null, categories, monthly });
}));
app.use((error, _req, res, _next) => { console.error(error); fail(res, 500, 'Something went wrong. Please try again.'); });
export default app;
