// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { DockWidget } from '../ui/navigation.js';

const created = [];

function makeDock(opts = {}) {
    const api = DockWidget({ title: 'Dock', ...opts });
    created.push(api);
    return api;
}

function mockHeight(api, h) {
    Object.defineProperty(api.element, 'offsetHeight', { configurable: true, value: h });
}

afterEach(() => {
    for (const api of created.splice(0)) {
        try { api.destroy(); } catch { /* já removido */ }
    }
    document.body.innerHTML = '';
});

describe('DockWidget — empilhamento automático', () => {
    it('docks do mesmo canto não se sobrepõem (mais novo acima)', () => {
        const d1 = makeDock({ position: 'bottom-right' });
        mockHeight(d1, 100);
        const d2 = makeDock({ position: 'bottom-right' });

        expect(d1.element.style.bottom).toBe('0px'); // base do CSS (jsdom: 0)
        expect(d2.element.style.bottom).toBe('112px'); // 0 + 100 + gap 12
    });

    it('cantos diferentes têm pilhas independentes', () => {
        makeDock({ position: 'bottom-right' });
        const other = makeDock({ position: 'bottom-left' });
        expect(other.element.style.bottom).toBe('0px');
    });

    it('destroy/remove devolve o de cima para a base', () => {
        const d1 = makeDock({ position: 'bottom-right' });
        mockHeight(d1, 100);
        const d2 = makeDock({ position: 'bottom-right' });
        expect(d2.element.style.bottom).toBe('112px');

        d1.destroy();
        expect(d2.element.style.bottom).toBe('0px');
    });

    it('minimizar libera o espaço; restaurar reempilha', () => {
        const d1 = makeDock({ position: 'bottom-right' });
        mockHeight(d1, 80);
        const d2 = makeDock({ position: 'bottom-right' });
        expect(d2.element.style.bottom).toBe('92px');

        d1.minimizeToTray();
        expect(d2.element.style.bottom).toBe('0px');

        d1.restoreFromTray(false);
        expect(d2.element.style.bottom).toBe('92px');
    });

    it('toggle mantém a pilha consistente', () => {
        const d1 = makeDock({ position: 'bottom-right', expanded: false });
        mockHeight(d1, 60);
        const d2 = makeDock({ position: 'bottom-right' });
        expect(d2.element.style.bottom).toBe('72px');

        d2.expand();
        expect(d2.element.classList.contains('expanded')).toBe(true);
        expect(d2.element.style.bottom).toBe('72px');
        d2.collapse();
        expect(d2.element.style.bottom).toBe('72px');
    });

    it('dock local (dentro de janela) não entra na pilha', () => {
        const holder = document.createElement('div');
        document.body.appendChild(holder);
        const local = makeDock({ instance: { element: holder } });
        expect(local.element.style.bottom).toBe('');

        const global = makeDock({ position: 'bottom-right' });
        expect(global.element.style.bottom).toBe('0px');
    });

    it('corpo cresce com o conteúdo até o teto da viewport', () => {
        const d = makeDock({ height: 320 });
        const maxH = d.element.querySelector('.ui-dock-body').style.maxHeight;
        expect(maxH).toContain('min(');
        expect(maxH).toContain('320px');
        expect(maxH).toContain('100vh');
    });
});
