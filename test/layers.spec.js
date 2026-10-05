// @vitest-environment jsdom
// Guarda da hierarquia de camadas do shell: o overlay do modal global
// (Desktop.confirm/prompt/alert) precisa ficar acima de TODOS os elementos do
// shell — inclusive o menubar global e seus dropdowns — e abaixo dos toasts.
// Regressão: o overlay estava em 400000 e o menubar em 500000, então o menubar
// ficava clicável por cima do modal ("bloqueia o desktop todo" pela metade).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// vitest roda com cwd em desktop2/
const css = readFileSync(resolve(process.cwd(), 'css/core.css'), 'utf8');

/** z-index declarado para o primeiro seletor que casa com o padrão. */
function zIndexOf(selectorPattern) {
    const rules = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        const selectors = m[1].split(',').map((s) => s.trim());
        const z = m[2].match(/z-index:\s*(\d+)/);
        if (z) rules.push({ selectors, z: Number(z[1]) });
    }
    const hits = rules.filter((r) => r.selectors.some((s) => selectorPattern.test(s)));
    return hits.length ? Math.max(...hits.map((r) => r.z)) : 0;
}

describe('hierarquia de camadas do shell (z-index)', () => {
    const overlay = zIndexOf(/^\.ui-modal-overlay$/);

    it('o overlay do modal global fica acima do menubar global e dropdowns', () => {
        const menubar = zIndexOf(/^#menubar$|^#app>\.ui-menubar$/);
        expect(overlay).toBeGreaterThan(menubar);
        // dropdowns do menubar (submenus usam 500002)
        const subDropdown = zIndexOf(/^\.dropdown\.sub-dropdown$/);
        if (subDropdown) expect(overlay).toBeGreaterThan(subDropdown);
    });

    it('o overlay do modal global fica acima do start menu, taskbar e context menu', () => {
        expect(overlay).toBeGreaterThan(zIndexOf(/^\.ui-start-menu$/));
        expect(overlay).toBeGreaterThan(zIndexOf(/^#taskbar$/));
        expect(overlay).toBeGreaterThan(zIndexOf(/^\.ui-context-menu$/));
    });

    it('os toasts continuam acima do modal (avisos visíveis durante diálogos)', () => {
        expect(zIndexOf(/^#ui-toast-container$/)).toBeGreaterThan(overlay);
    });

    it('o modal é o elemento mais alto do shell (abaixo só dos toasts)', () => {
        const shellLayers = [
            /^#menubar$|^#app>\.ui-menubar$/,
            /^#taskbar$/,
            /^\.ui-start-menu$/,
            /^\.ui-context-menu$/,
        ];
        for (const p of shellLayers) expect(overlay).toBeGreaterThan(zIndexOf(p));
    });
});
