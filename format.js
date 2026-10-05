// format.js
// Utilitários genéricos de formatação e arquivo do DesktopEngine — moeda,
// datas, números, bytes, cores de status e exportação CSV. Nada aqui é regra
// de negócio: qualquer aplicação sobre o framework pode usar.
//
//   import { formatCurrency, formatDate, downloadCsv } from './format.js';
//   formatCurrency(1234.5)              // 'R$ 1.234,50'
//   formatDate('2026-03-15T12:00:00')   // '15/03/2026'
//   downloadCsv('dados.csv', rows, { columns: [{ key: 'nome', label: 'Nome' }] });

const _currencyFormatters = new Map();
const _numberFormatters = new Map();

/** Intl.NumberFormat de moeda em cache (locale|currency -> formatter). */
function currencyFormatter(locale, currency) {
    const key = `${locale}|${currency}`;
    if (!_currencyFormatters.has(key)) {
        _currencyFormatters.set(key, new Intl.NumberFormat(locale, { style: 'currency', currency }));
    }
    return _currencyFormatters.get(key);
}

/** Intl.NumberFormat genérico em cache (locale|opts -> formatter). */
function numberFormatter(locale, opts) {
    const key = `${locale}|${JSON.stringify(opts)}`;
    if (!_numberFormatters.has(key)) {
        _numberFormatters.set(key, new Intl.NumberFormat(locale, opts));
    }
    return _numberFormatters.get(key);
}

/**
 * Moeda no padrão pt-BR: formatCurrency(1234.5) → 'R$ 1.234,50'.
 * Dado ausente (null/undefined/vazio) → `fallback` ('—'); zero explícito →
 * 'R$ 0,00'; valor não numérico → `fallback`.
 */
export function formatCurrency(value, { locale = 'pt-BR', currency = 'BRL', fallback = '—' } = {}) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return currencyFormatter(locale, currency).format(n);
}

/**
 * Número no padrão local: formatNumber(1234.5) → '1.234,5'.
 * Dado ausente/não numérico → `fallback`. Aceita as opções do
 * Intl.NumberFormat (minimumFractionDigits etc.).
 */
export function formatNumber(value, { locale = 'pt-BR', fallback = '—', ...opts } = {}) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return numberFormatter(locale, opts).format(n);
}

/** Data (ISO, timestamp ou Date) → 'dd/mm/aaaa' pt-BR; vazio/inválido → fallback. */
export function formatDate(value, { fallback = '—' } = {}) {
    if (!value) return fallback;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString('pt-BR');
}

/** Data + hora pt-BR ('dd/mm/aaaa, hh:mm'); `seconds: true` inclui segundos. */
export function formatDateTime(value, { fallback = '—', seconds = false } = {}) {
    if (!value) return fallback;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return fallback;
    const base = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    };
    if (seconds) base.second = '2-digit';
    return d.toLocaleString('pt-BR', base);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Tamanho em bytes → '512 B', '1,5 KB', '2 MB' (base 1024, até 1 casa decimal). */
export function formatBytes(bytes, { fallback = '—' } = {}) {
    if (bytes === null || bytes === undefined || bytes === '') return fallback;
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return fallback;
    if (n < 1024) return `${n} B`;
    let i = 0;
    let v = n;
    while (v >= 1024 && i < BYTE_UNITS.length - 1) {
        v /= 1024;
        i += 1;
    }
    const text = numberFormatter('pt-BR', { maximumFractionDigits: 1 }).format(v);
    return `${text} ${BYTE_UNITS[i]}`;
}

/**
 * Resolve a cor de um selo de status: statusColor('PAGO', MAPA) →
 * { bg, color }. Sem correspondência → `fallback` (cinza neutro).
 */
export function statusColor(status, map = {}, fallback = { bg: '#f3f4f6', color: '#374151' }) {
    return (status !== null && status !== undefined && map[status]) || fallback;
}

/**
 * Monta o conteúdo CSV (delimitador ';' e quebras \r\n — padrão Excel pt-BR),
 * com aspas duplas escapadas quando o campo tem ; " ou quebra de linha.
 * columns: null (chaves do 1º registro) | ['key'] | [{ key, label }].
 */
export function buildCsv(rows = [], { columns = null, delimiter = ';' } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const cols = columns && columns.length ? columns : (list[0] ? Object.keys(list[0]) : []);
    const keys = cols.map((c) => (typeof c === 'string' ? c : c.key));
    const labels = cols.map((c) => (typeof c === 'string' ? c : (c.label || c.key)));
    const cell = (v) => {
        if (v === null || v === undefined) v = '';
        if (v instanceof Date) v = v.toISOString();
        if (typeof v === 'object') v = JSON.stringify(v);
        v = String(v);
        return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [labels.map(cell).join(delimiter)];
    for (const row of list) lines.push(keys.map((k) => cell(row[k])).join(delimiter));
    return lines.join('\r\n');
}

/**
 * Baixa um arquivo pelo navegador (Blob + âncora temporária).
 * Retorna o nome do arquivo. O URL é liberado após 1s.
 */
export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
}

/**
 * Baixa `rows` como CSV UTF-8 (BOM incluso por padrão — Excel abre acentos
 * corretamente). Aceita as opções de buildCsv ({ columns, delimiter }).
 */
export function downloadCsv(filename, rows, { bom = true, ...csvOpts } = {}) {
    const content = (bom ? '\uFEFF' : '') + buildCsv(rows, csvOpts);
    return downloadFile(filename, content, 'text/csv;charset=utf-8');
}
