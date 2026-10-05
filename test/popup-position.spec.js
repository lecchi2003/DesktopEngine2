// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { positionPopupSubmenu, resetPopupPosition, resolvePopupBounds } from '../ui/navigation.js';

describe('positionPopupSubmenu', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    });

    function els(nestedRect, optRect) {
        const nested = document.createElement('div');
        const opt = document.createElement('div');
        document.body.append(nested, opt);
        nested.getBoundingClientRect = () => ({ ...nestedRect, toJSON: () => ({}) });
        opt.getBoundingClientRect = () => ({ ...optRect, toJSON: () => ({}) });
        return { nested, opt };
    }

    it('vira para a esquerda ao ultrapassar a borda direita', () => {
        const { nested, opt } = els(
            { left: 900, right: 1100, top: 10, bottom: 200, width: 200, height: 190, x: 900, y: 10 },
            { left: 850, right: 950, top: 10, bottom: 40, width: 100, height: 30, x: 850, y: 10 },
        );
        positionPopupSubmenu(nested, opt);
        expect(nested.classList.contains('open-left')).toBe(true);
        expect(nested.style.display).toBe('flex');
    });

    it('não altera nada sem overflow', () => {
        const { nested, opt } = els(
            { left: 100, right: 300, top: 10, bottom: 200, width: 200, height: 190, x: 100, y: 10 },
            { left: 100, right: 200, top: 10, bottom: 40, width: 100, height: 30, x: 100, y: 10 },
        );
        positionPopupSubmenu(nested, opt);
        expect(nested.classList.contains('open-left')).toBe(false);
        expect(nested.classList.contains('open-top')).toBe(false);
    });

    it('resetPopupPosition limpa classes e estilos', () => {
        const { nested } = els(
            { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 },
            { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 },
        );
        nested.classList.add('open-left');
        nested.style.setProperty('right', '100%');
        resetPopupPosition(nested);
        expect(nested.classList.contains('open-left')).toBe(false);
        expect(nested.style.getPropertyValue('right')).toBe('');
    });

    it('resolvePopupBounds usa viewport por padrão', () => {
        expect(resolvePopupBounds()).toMatchObject({ right: 1000, bottom: 800, left: 0, top: 0 });
    });
});
