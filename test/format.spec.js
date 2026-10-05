// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    formatCurrency,
    formatNumber,
    formatDate,
    formatDateTime,
    formatBytes,
    statusColor,
    buildCsv,
    downloadFile,
    downloadCsv,
} from '../format.js';

describe('formatCurrency', () => {
    // O Intl separa 'R$' do valor por U+00A0 (espaço não separável) —
    // normalizamos para o teste; na tela o caractere é invisível.
    const nb = (s) => s.replace(/\u00A0/g, ' ');

    it('formata moeda pt-BR com milhar e centavos', () => {
        expect(nb(formatCurrency(1234.5))).toBe('R$ 1.234,50');
        expect(nb(formatCurrency(0))).toBe('R$ 0,00');
        expect(nb(formatCurrency(-50))).toBe('-R$ 50,00');
    });

    it('dado ausente/não numérico → fallback; zero → moeda', () => {
        expect(formatCurrency(null)).toBe('—');
        expect(formatCurrency(undefined)).toBe('—');
        expect(formatCurrency('')).toBe('—');
        expect(formatCurrency('abc')).toBe('—');
        expect(nb(formatCurrency(0))).toBe('R$ 0,00');
    });

    it('aceita locale/moeda alternativos', () => {
        expect(formatCurrency(10, { locale: 'en-US', currency: 'USD' })).toBe('$10.00');
    });
});

describe('formatNumber', () => {
    it('formata número pt-BR e respeita opções do Intl', () => {
        expect(formatNumber(1234.5)).toBe('1.234,5');
        expect(formatNumber(1234.567, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('1.234,57');
        expect(formatNumber('x')).toBe('—');
    });
});

describe('formatDate / formatDateTime', () => {
    it('formata data ISO em dd/mm/aaaa e vazio/inválido no fallback', () => {
        expect(formatDate('2026-03-15T12:00:00')).toBe('15/03/2026');
        expect(formatDate(new Date(2026, 2, 15))).toBe('15/03/2026');
        expect(formatDate(null)).toBe('—');
        expect(formatDate('não é data')).toBe('—');
        expect(formatDate('', { fallback: 'sem data' })).toBe('sem data');
    });

    it('formatDateTime inclui data e hora (sem segundos por padrão)', () => {
        const out = formatDateTime('2026-03-15T12:34:00');
        expect(out).toContain('15/03/2026');
        expect(out).toContain('12:34');
        expect(out).not.toContain('12:34:00');
        expect(formatDateTime('2026-03-15T12:34:00', { seconds: true })).toContain('12:34:00');
    });
});

describe('formatBytes', () => {
    it('converte bytes em unidades legíveis (base 1024)', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1,5 KB');
        expect(formatBytes(2097152)).toBe('2 MB');
        expect(formatBytes(null)).toBe('—');
        expect(formatBytes(-1)).toBe('—');
    });
});

describe('statusColor', () => {
    it('resolve no mapa e cai no fallback', () => {
        const map = { PAGO: { bg: '#dcfce7', color: '#166534' } };
        expect(statusColor('PAGO', map)).toEqual({ bg: '#dcfce7', color: '#166534' });
        expect(statusColor('OUTRO', map)).toEqual({ bg: '#f3f4f6', color: '#374151' });
        expect(statusColor('OUTRO', map, { bg: 'x', color: 'y' })).toEqual({ bg: 'x', color: 'y' });
    });
});

describe('buildCsv', () => {
    it('monta cabeçalho com labels, delimitador ; e \r\n', () => {
        const out = buildCsv(
            [{ nome: 'Ana', qtd: 2 }],
            { columns: [{ key: 'nome', label: 'Nome' }, { key: 'qtd', label: 'Qtd' }] }
        );
        expect(out).toBe('Nome;Qtd\r\nAna;2');
    });

    it('usa as chaves do 1º registro quando não há columns', () => {
        expect(buildCsv([{ a: 1, b: 2 }, { a: 3, b: 4 }])).toBe('a;b\r\n1;2\r\n3;4');
    });

    it('entrepa aspas, ponto-e-vírgula e quebras de linha', () => {
        const out = buildCsv(
            [{ nome: 'Ana;Maria', obs: 'dito "isso"\noutra linha' }],
            { columns: ['nome', 'obs'] }
        );
        expect(out).toBe('nome;obs\r\n"Ana;Maria";"dito ""isso""\noutra linha"');
    });

    it('vazio gera só o cabeçalho (ou nada sem columns)', () => {
        expect(buildCsv([], { columns: ['nome'] })).toBe('nome');
        expect(buildCsv([])).toBe('');
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('downloadFile / downloadCsv', () => {
    it('downloadFile cria blob, clica na âncora e a remove', async () => {
        const blobs = [];
        URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:fake'; });
        URL.revokeObjectURL = vi.fn();
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        expect(downloadFile('arquivo.txt', 'conteúdo', 'text/plain')).toBe('arquivo.txt');
        expect(blobs[0].type).toBe('text/plain');
        expect(await blobs[0].text()).toBe('conteúdo');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(document.querySelector('a[download="arquivo.txt"]')).toBeNull();
        vi.restoreAllMocks();
    });

    it('downloadCsv gera CSV UTF-8 com BOM e as opções de buildCsv', async () => {
        const blobs = [];
        URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:fake'; });
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        downloadCsv('dados.csv', [{ nome: 'José' }], { columns: [{ key: 'nome', label: 'Nome' }] });
        expect(blobs[0].type).toBe('text/csv;charset=utf-8');
        // BOM checado nos bytes: Blob.text() decodifica UTF-8 e remove o BOM
        const bytes = new Uint8Array(await blobs[0].arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
        const text = await blobs[0].text();
        expect(text).toContain('Nome\r\nJosé');
        vi.restoreAllMocks();
    });
});
