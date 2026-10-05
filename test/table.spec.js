// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Table } from '../ui/data.js';

describe('Table', () => {
    it('renderiza cabeçalho e células (coluna string, null → vazio e render com row)', () => {
        const el = Table({
            columns: [
                'nome',
                { key: 'valor', label: 'Valor' },
                { key: 'status', label: 'Status', render: (v, row) => `badge:${v}:${row.id}` },
            ],
            data: [
                { nome: 'Ana', valor: 10, status: 'OK', id: 1 },
                { nome: 'Bia', valor: null, status: 'NO', id: 2 },
            ],
        });
        const ths = [...el.querySelectorAll('th')].map((th) => th.textContent);
        expect(ths).toEqual(['nome', 'Valor', 'Status']);

        const trs = [...el.querySelectorAll('tbody tr')];
        expect(trs).toHaveLength(2);
        expect(trs[0].children[0].textContent).toBe('Ana');
        expect(trs[1].children[1].textContent).toBe(''); // null/undefined → ''
        expect(trs[0].children[2].textContent).toBe('badge:OK:1'); // render(val, row)
    });

    it('render devolvendo Node é anexado à célula', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Abrir';
        const el = Table({
            columns: [{ key: 'id', render: () => btn }],
            data: [{ id: 7 }],
        });
        expect(el.querySelector('td button')).toBe(btn);
    });

    it('onRowClick recebe (row, tr, event) e a linha ganha a classe ui-row-clickable', () => {
        const onRowClick = vi.fn();
        const el = Table({ columns: ['nome'], data: [{ nome: 'Ana' }], onRowClick });
        const tr = el.querySelector('tbody tr');
        expect(tr.classList.contains('ui-row-clickable')).toBe(true);

        tr.click();
        expect(onRowClick).toHaveBeenCalledTimes(1);
        const [row, trArg, evt] = onRowClick.mock.calls[0];
        expect(row).toEqual({ nome: 'Ana' });
        expect(trArg).toBe(tr);
        expect(evt).toBeInstanceOf(MouseEvent);
    });

    it('onRowContext recebe (row, tr, event) e o contextmenu padrão é cancelado', () => {
        const onRowContext = vi.fn();
        const el = Table({ columns: ['nome'], data: [{ nome: 'Ana' }], onRowContext });
        const tr = el.querySelector('tbody tr');
        expect(tr.classList.contains('ui-row-clickable')).toBe(false);

        const evt = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
        tr.dispatchEvent(evt);
        expect(evt.defaultPrevented).toBe(true);
        expect(onRowContext).toHaveBeenCalledTimes(1);
        expect(onRowContext.mock.calls[0][0]).toEqual({ nome: 'Ana' });
        expect(onRowContext.mock.calls[0][1]).toBe(tr);
    });

    it('sem hooks não há classe clicável nem preventDefault no contextmenu', () => {
        const el = Table({ columns: ['nome'], data: [{ nome: 'Ana' }] });
        const tr = el.querySelector('tbody tr');
        expect(tr.classList.contains('ui-row-clickable')).toBe(false);

        const evt = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
        tr.dispatchEvent(evt);
        expect(evt.defaultPrevented).toBe(false);
    });

    it('width e align das colunas viram estilos no th (e align também no td)', () => {
        const el = Table({
            columns: [
                { key: 'nome', label: 'Produto', width: '140px' },
                { key: 'valor', label: 'Valor', align: 'right' },
                { key: 'id', label: 'Ações', width: '100px', align: 'center', render: () => '...' },
            ],
            data: [{ nome: 'Servidor', valor: 10, id: 1 }],
        });
        const ths = [...el.querySelectorAll('th')];
        expect(ths[0].style.width).toBe('140px');
        expect(ths[1].style.textAlign).toBe('right');
        expect(ths[2].style.width).toBe('100px');

        const tds = [...el.querySelectorAll('tbody tr')[0].children];
        expect(tds[1].style.textAlign).toBe('right');
        expect(tds[2].style.textAlign).toBe('center');
    });

    it('rowEvents adiciona listeners extras por linha (ex.: dblclick) e marca a linha clicável', () => {
        const onDbl = vi.fn();
        const el = Table({
            columns: ['nome'],
            data: [{ nome: 'Ana' }],
            rowEvents: { dblclick: onDbl },
        });
        const tr = el.querySelector('tbody tr');
        expect(tr.classList.contains('ui-row-clickable')).toBe(true); // dblclick dá affordance de cursor
        tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(onDbl).toHaveBeenCalledTimes(1);
        expect(onDbl.mock.calls[0][0]).toEqual({ nome: 'Ana' });
        expect(onDbl.mock.calls[0][1]).toBe(tr);
    });

    it('rowEvents sem click/dblclick não marca a linha como clicável', () => {
        const el = Table({
            columns: ['nome'],
            data: [{ nome: 'Ana' }],
            rowEvents: { mouseenter: () => {} },
        });
        expect(el.querySelector('tbody tr').classList.contains('ui-row-clickable')).toBe(false);
    });

    it('contextMenu por linha binda o menu do framework na tr (controller + preventDefault)', () => {
        const el = Table({
            columns: ['nome'],
            data: [{ id: 9, nome: 'Ana' }, { id: 8, nome: 'Bia' }],
            contextMenu: (row) => [{ label: `Abrir ${row.id}`, action: () => {} }],
        });
        const [tr1, tr2] = [...el.querySelectorAll('tbody tr')];
        expect(tr1._contextMenuController).toBeTruthy();
        expect(typeof tr1._contextMenuController.destroy).toBe('function');
        expect(tr2._contextMenuController).toBeTruthy();

        // listener do framework ativo: contextmenu é cancelado (não usa o nativo)
        const evt = new MouseEvent('contextmenu', { cancelable: true, bubbles: true, clientX: 5, clientY: 5 });
        tr1.dispatchEvent(evt);
        expect(evt.defaultPrevented).toBe(true);
    });

    it('id/style/className continuam indo para o wrapper (commonProps preservados)', () => {
        const el = Table({ columns: ['nome'], data: [], id: 'minha-tabela', className: 'extra' });
        expect(el.id).toBe('minha-tabela');
        expect(el.className).toContain('ui-table-wrapper');
        expect(el.className).toContain('extra');
    });
});
