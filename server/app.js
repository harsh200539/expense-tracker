import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { db } from './db.js';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
const fail = (res, code, message) => res.status(code).json({ error: message });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const secret = () => { if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters'); return process.env.JWT_SECRET; };
const publicUser = u => ({ id: String(u._id), name: u.name, email: u.email, currency: u.currency || 'INR' });
const authenticate = (req, res, next) => { try { const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const payload = jwt.verify(token, secret()); req.userId = new ObjectId(payload.sub); next(); } catch { fail(res, 401, 'Please sign in again.'); } };
const id = raw => ObjectId.isValid(raw) && String(new ObjectId(raw)) === raw ? new ObjectId(raw) : null;
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const transactionInput = body => {
  const title = cleanText(body.title, 100);
  const category = cleanText(body.category, 40);
  const amount = Number(body.amount);
  const type = body.type;
  const date = body.date;
  if (!title || !category || !['income', 'expense'].includes(type) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) return null;
  return { title, category, amount: Math.round(amount * 100) / 100, type, date };
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = req.body.password;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return fail(res, 400, 'Enter a name, valid email and password of at least 8 characters.');
  const users = (await db()).collection('users');
  await users.createIndex({ email: 1 }, { unique: true });
  const user = { name, email, passwordHash: await bcrypt.hash(password, 12), currency: 'INR', createdAt: new Date() };
  try { const inserted = await users.insertOne(user); user._id = inserted.insertedId; } catch (error) { if (error.code === 11000) return fail(res, 409, 'An account with this email already exists.'); throw error; }
  res.status(201).json({ user: publicUser(user), token: jwt.sign({ sub: String(user._id) }, secret(), { expiresIn: '7d' }) });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase();
  const user = await (await db()).collection('users').findOne({ email });
  if (!user || typeof req.body.password !== 'string' || !(await bcrypt.compare(req.body.password, user.passwordHash))) return fail(res, 401, 'Incorrect email or password.');
  res.json({ user: publicUser(user), token: jwt.sign({ sub: String(user._id) }, secret(), { expiresIn: '7d' }) });
}));
app.get('/api/me', authenticate, wrap(async (req, res) => {
  const user = await (await db()).collection('users').findOne({ _id: req.userId });
  if (!user) return fail(res, 404, 'Account not found.');
  res.json({ user: publicUser(user) });
}));
app.patch('/api/me', authenticate, wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const currency = req.body.currency;
  if (!name || !['INR', 'USD', 'EUR', 'GBP'].includes(currency)) return fail(res, 400, 'Enter a name and select a supported currency.');
  const user = await (await db()).collection('users').findOneAndUpdate({ _id: req.userId }, { $set: { name, currency } }, { returnDocument: 'after' });
  res.json({ user: publicUser(user) });
}));
app.get('/api/transactions', authenticate, wrap(async (req, res) => {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  const filter = { userId: req.userId };
  if (['income', 'expense'].includes(req.query.type)) filter.type = req.query.type;
  if (typeof req.query.category === 'string' && req.query.category) filter.category = req.query.category;
  if (typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)) filter.date = { $gte: `${req.query.month}-01`, $lte: `${req.query.month}-31` };
  else if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) filter.date = req.query.date;
  if (typeof req.query.search === 'string' && req.query.search.trim()) filter.title = { $regex: req.query.search.trim().slice(0,80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const min = Number(req.query.minAmount), max = Number(req.query.maxAmount);
  if (req.query.minAmount !== undefined && Number.isFinite(min) && min >= 0) (filter.amount ||= {}).$gte = min;
  if (req.query.maxAmount !== undefined && Number.isFinite(max) && max >= 0) (filter.amount ||= {}).$lte = max;
  const collection = (await db()).collection('transactions');
  const [total, items] = await Promise.all([collection.countDocuments(filter), collection.find(filter).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray()]);
  res.json({ items: items.map(({ _id, userId, ...rest }) => ({ id: String(_id), ...rest })), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));
app.post('/api/transactions', authenticate, wrap(async (req, res) => {
  let transaction; try { transaction = transactionInput(req.body); } catch { transaction = null; }
  if (!transaction) return fail(res, 400, 'Enter a valid title, category, date and positive amount.');
  const result = await (await db()).collection('transactions').insertOne({ ...transaction, userId: req.userId, createdAt: new Date() });
  res.status(201).json({ id: String(result.insertedId), ...transaction });
}));
app.patch('/api/transactions/:id', authenticate, wrap(async (req, res) => {
  const objectId = id(req.params.id); let transaction; try { transaction = transactionInput(req.body); } catch { transaction = null; }
  if (!objectId || !transaction) return fail(res, 400, 'Invalid transaction.');
  const result = await (await db()).collection('transactions').updateOne({ _id: objectId, userId: req.userId }, { $set: transaction });
  if (!result.matchedCount) return fail(res, 404, 'Transaction not found.');
  res.json({ id: req.params.id, ...transaction });
}));
app.delete('/api/transactions/:id', authenticate, wrap(async (req, res) => {
  const objectId = id(req.params.id);
  if (!objectId) return fail(res, 400, 'Invalid transaction ID.');
  const result = await (await db()).collection('transactions').deleteOne({ _id: objectId, userId: req.userId });
  if (!result.deletedCount) return fail(res, 404, 'Transaction not found.');
  res.status(204).end();
}));
app.get('/api/reports', authenticate, wrap(async (req, res) => {
  const transactions = await (await db()).collection('transactions').find({ userId: req.userId }, { projection: { amount: 1, type: 1, category: 1, date: 1 } }).toArray();
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0,7);
  const monthly = {}, categories = {};
  let totalIncome = 0, totalExpenses = 0, income = 0, expenses = 0;
  for (const item of transactions) {
    const bucket = (monthly[item.date.slice(0,7)] ||= { income: 0, expenses: 0 });
    if (item.type === 'income') { totalIncome += item.amount; bucket.income += item.amount; if (item.date.startsWith(month)) income += item.amount; }
    else { totalExpenses += item.amount; bucket.expenses += item.amount; if (item.date.startsWith(month)) { expenses += item.amount; categories[item.category] = (categories[item.category] || 0) + item.amount; } }
  }
  res.json({ month, totalIncome, totalExpenses, balance: totalIncome - totalExpenses, income, expenses, savings: income - expenses, spendingPercentage: income ? expenses / income * 100 : null, categories, monthly });
}));
app.use((error, _req, res, _next) => { console.error(error); fail(res, 500, 'Something went wrong. Please try again.'); });
export default app;
