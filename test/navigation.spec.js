// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityService } from '../core.js';
import { filterAuthorizedMenuItems, MenuBar, extractScreenId } from '../ui/navigation.js';

describe('filterAuthorizedMenuItems', () => {
    beforeEach(() => {
        SecurityService.init({ user: { id: '1' }, roles: ['TECNICO'], permissions: ['a:view'] }, false);
    });

    it('remove itens sem permission e mantém os autorizados', () => {
        const out = filterAuthorizedMenuItems([
            { label: 'Ver', permission: 'a:view' },
            { label: 'Apagar', permission: 'a:delete' },
        ]);
        expect(out.map((i) => i.label)).toEqual(['Ver']);
    });

    it('filtra recursivamente preservando caminho (hookCtx)', () => {
        const out = filterAuthorizedMenuItems(
            [{ label: 'Pai', items: [{ label: 'Filho' }] }],
            { screenId: 's', kind: 'menu' },
        );
        expect(out[0].items.map((i) => i.label)).toEqual(['Filho']);
    });

    it('remove separadores órfãos/duplicados', () => {
        const out = filterAuthorizedMenuItems(['separator', { label: 'Só', permission: 'nope' }, 'separator']);
        expect(out).toEqual([]);
    });

    it('aplica filtros de plugin por caminho de rótulo', async () => {
        const { Framework } = await import('../core.js');
        const off = Framework.registerMenuItemFilter(({ labelPath }) => labelPath !== 'Pai/Secreto');
        const out = filterAuthorizedMenuItems(
            [{ label: 'Pai', items: [{ label: 'Secreto' }, { label: 'Livre' }] }],
            { screenId: 's', kind: 'menu' },
        );
        expect(out[0].items.map((i) => i.label)).toEqual(['Livre']);
        off();
    });

    it('sem plugins, comportamento anterior intacto', () => {
        const items = [{ label: 'A' }, 'separator', { label: 'B' }];
        expect(filterAuthorizedMenuItems(items)).toHaveLength(3);
    });
});

describe('MenuBar trilho de icones', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        SecurityService.init({ user: { id: '1' }, roles: ['ADMIN'], permissions: [] }, false);
    });

    it('itens de topo carregam title (tooltip do trilho lateral)', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        MenuBar({
            element: host,
            position: 'left',
            menus: [{ label: 'Cadastros', icon: 'x', items: [{ label: 'X' }] }],
        });
        const item = host.querySelector('.menubar-item');
        expect(item).not.toBeNull();
        expect(item.getAttribute('title')).toBe('Cadastros');
    });
});

describe('extractScreenId', () => {
    it('aceita aspas simples', () => {
        const fn = () => Desktop.openScreen('chamados');
        expect(extractScreenId(fn)).toBe('chamados');
    });

    it('aceita aspas duplas (saida de bundlers como esbuild/vite)', () => {
        const minified = () => Desktop.openScreen("dashboard");
        expect(extractScreenId(minified)).toBe('dashboard');
    });

    it('retorna null sem openScreen', () => {
        expect(extractScreenId(() => console.log('x'))).toBeNull();
        expect(extractScreenId(null)).toBeNull();
    });
});
