// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { FilterBar, EmptyState, KpiCard } from '../ui/patterns.js';

describe('FilterBar', () => {
    it('cria a barra com input de busca (placeholder, valor inicial e onInput)', () => {
        const onInput = vi.fn();
        const bar = FilterBar({ search: { placeholder: 'Buscar cliente...', value: 'abc', onInput } });
        expect(bar.className).toBe('ui-filter-bar');

        const input = bar.querySelector('input.ui-filter-search');
        expect(input).not.toBeNull();
        expect(input.placeholder).toBe('Buscar cliente...');
        expect(input.value).toBe('abc');

        input.value = 'xyz';
        input.dispatchEvent(new Event('input'));
        expect(onInput).toHaveBeenCalledWith('xyz', expect.anything());
    });

    it('Enter e o botão Buscar disparam onSearch com o valor do input', () => {
        const onSearch = vi.fn();
        const bar = FilterBar({ search: { placeholder: 'b', onSearch } });
        const input = bar.querySelector('input');

        const btn = [...bar.querySelectorAll('button')].find((b) => b.textContent === 'Buscar');
        expect(btn).toBeTruthy();
        input.value = 'oi';
        btn.click();
        expect(onSearch).toHaveBeenCalledWith('oi');

        input.value = 'teclado';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onSearch).toHaveBeenLastCalledWith('teclado', expect.anything());
    });

    it('sem onSearch não cria botão; children e actions aparecem na ordem', () => {
        const extra = document.createElement('select');
        extra.className = 'minha-select';
        const action = document.createElement('span');
        action.className = 'minha-acao';

        const bar = FilterBar({ search: { placeholder: 'b' }, children: [extra], actions: [action] });
        expect(bar.querySelector('button')).toBeNull();
        const kids = [...bar.children];
        expect(kids[0].tagName).toBe('INPUT');
        expect(kids[1]).toBe(extra);
        expect(kids[2]).toBe(action);
    });

    it('sem search a barra só monta os children', () => {
        const extra = document.createElement('span');
        const bar = FilterBar({ children: [extra] });
        expect([...bar.children]).toEqual([extra]);
    });

    it('aceita builders (ElementBuilder/`{ el }`) em children e actions', () => {
        const maze = { build: () => document.createElement('select') };
        const bar = FilterBar({
            search: { placeholder: 'b' },
            children: [{ el: document.createElement('input') }, maze],
            actions: [{ build: () => document.createElement('button') }],
        });
        expect(bar.querySelector('select')).not.toBeNull();
        expect(bar.querySelector('button')).not.toBeNull();
    });
});

describe('EmptyState', () => {
    it('monta ícone, mensagem e dica', () => {
        const el = EmptyState({ icon: '👥', message: 'Nenhum cliente.', hint: 'Cadastre o primeiro.' });
        expect(el.className).toBe('ui-empty-state');
        expect(el.querySelector('.ui-empty-icon').textContent).toBe('👥');
        expect(el.querySelector('.ui-empty-message').textContent).toBe('Nenhum cliente.');
        expect(el.querySelector('.ui-empty-hint').textContent).toBe('Cadastre o primeiro.');
    });

    it('action como objeto vira botão clicável; action como nó entra crua', () => {
        const onClick = vi.fn();
        const el = EmptyState({ icon: '', message: 'x', action: { text: 'Novo', onClick } });
        const btn = el.querySelector('button.ui-btn');
        expect(btn.textContent).toBe('Novo');
        btn.click();
        expect(onClick).toHaveBeenCalledTimes(1);

        const noIcon = EmptyState({ icon: '', message: 'x' });
        expect(noIcon.querySelector('.ui-empty-icon')).toBeNull();

        const raw = document.createElement('div');
        raw.className = 'acao-crua';
        expect(EmptyState({ message: 'x', action: raw }).querySelector('.acao-crua')).toBe(raw);

        // Builder (ElementBuilder ou compatível) também é aceito como action
        const built = EmptyState({ message: 'y', action: { build: () => document.createElement('button') } });
        expect(built.querySelector('button')).not.toBeNull();
    });
});

describe('KpiCard', () => {
    it('monta label, valor e ícone', () => {
        const el = KpiCard({ label: 'Chamados', value: 42, icon: '🎫' });
        expect(el.className).toBe('ui-kpi-card');
        expect(el.querySelector('.ui-kpi-label').textContent).toBe('Chamados');
        expect(el.querySelector('.ui-kpi-value').textContent).toBe('42');
        expect(el.querySelector('.ui-kpi-icon').textContent).toBe('🎫');
    });

    it('valor vazio vira — e color vira variável de destaque', () => {
        expect(KpiCard({ label: 'X' }).querySelector('.ui-kpi-value').textContent).toBe('—');
        const colored = KpiCard({ label: 'X', value: 1, color: '#22c55e' });
        expect(colored.style.getPropertyValue('--kpi-accent')).toBe('#22c55e');
    });
});
