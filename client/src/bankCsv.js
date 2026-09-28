export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && !field) quoted = true;
    else if (char === ',') { row.push(field.trim()); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(value => value)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  row.push(field.trim()); if (row.some(value => value)) rows.push(row);
  if (rows.length < 2) throw new Error('Choose a CSV with a header and at least one transaction.');
  const width = rows[0].length;
  if (rows.some(r => r.length !== width)) throw new Error('Some CSV rows have a different number of columns. Check the file format.');
  if (rows.length > 1001) throw new Error('Please import at most 1,000 transactions at once.');
  return { headers: rows[0].map((h, i) => h || `Column ${i + 1}`), rows: rows.slice(1) };
}

export function guessColumns(headers) {
  const find = expression => String(headers.findIndex(h => expression.test(h)));
  return { date: find(/^(txn|transaction|value|posting)?\s*date$/i), title: find(/description|narration|particular|details|remarks|transaction\s*title/i), debit: find(/debit|withdrawal|paid\s*out/i), credit: find(/credit|deposit|paid\s*in/i), amount: find(/^(amount|transaction\s*amount)$/i) };
}

export function parseDate(value) {
  const raw = String(value || '').trim();
  let iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s.*)?$/);
  if (!iso) {
    const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/);
    if (dayFirst) iso = [null, dayFirst[3], dayFirst[2], dayFirst[1]];
  }
  if (!iso) return null;
  const date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function money(value) {
  const raw = String(value || '').replace(/[₹$£€\s,]/g, '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function mapStatement(rows, mapping) {
  const index = key => Number(mapping[key]);
  if (['date', 'title'].some(k => mapping[k] === '-1') || (mapping.amount === '-1' && mapping.debit === '-1' && mapping.credit === '-1')) throw new Error('Select date, description, and amount columns.');
  const mapped = [], rejected = []; const occurrences = new Map();
  rows.forEach((row, indexOfRow) => {
    const date = parseDate(row[index('date')]);
    const title = String(row[index('title')] || '').trim().slice(0, 100);
    const debit = mapping.debit === '-1' ? 0 : money(row[index('debit')]);
    const credit = mapping.credit === '-1' ? 0 : money(row[index('credit')]);
    const signed = mapping.amount === '-1' ? 0 : money(row[index('amount')]);
    const validPair = (debit > 0) !== (credit > 0);
    const amount = validPair ? debit + credit : Math.abs(signed);
    const type = validPair ? (debit > 0 ? 'expense' : 'income') : signed < 0 ? 'expense' : 'income';
    if (!date || !title || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || (debit > 0 && credit > 0)) { rejected.push(indexOfRow + 2); return; }
    const key = JSON.stringify([date, type, Math.round(amount * 100) / 100, title.toLowerCase()]);
    const occurrence = (occurrences.get(key) || 0) + 1; occurrences.set(key, occurrence);
    mapped.push({ title, date, type, amount: Math.round(amount * 100) / 100, category: type === 'income' ? 'Other income' : 'Other expense', occurrence });
  });
  return { mapped, rejected };
}
