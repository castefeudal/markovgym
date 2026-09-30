const MAX_RESULTS = 500;

function cleanValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 24).flatMap(([key, raw]) => {
    const name = String(key).trim().slice(0, 64);
    if (!name || raw == null || !['string', 'number', 'boolean'].includes(typeof raw)) return [];
    const content = String(raw).slice(0, 500);
    return [[name, content]];
  }));
}

export function cleanCalculatorResults(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const id = String(row.id || '').trim().slice(0, 100);
    const calculatorId = String(row.calculatorId || '').trim().slice(0, 64);
    const title = String(row.title || calculatorId).trim().slice(0, 120);
    const createdAt = String(row.createdAt || '').slice(0, 40);
    const summary = String(row.summary || '').trim().slice(0, 600);
    if (!id || !calculatorId || !summary || !Number.isFinite(Date.parse(createdAt)) || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      calculatorId,
      title,
      createdAt,
      summary,
      inputs: cleanValues(row.inputs),
      evidenceId: String(row.evidenceId || '').trim().slice(0, 80),
      formulaVersion: String(row.formulaVersion || '').trim().slice(0, 40),
    }];
  }).slice(0, MAX_RESULTS);
}

export function createCalculatorResult({ id, calculatorId, title, createdAt, summary, inputs, evidenceId = '', formulaVersion = '' }) {
  return cleanCalculatorResults([{ id, calculatorId, title, createdAt, summary, inputs, evidenceId, formulaVersion }])[0] || null;
}

export const CALCULATOR_HISTORY_LIMIT = MAX_RESULTS;
