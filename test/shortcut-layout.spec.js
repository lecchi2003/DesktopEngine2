// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ShortcutContainer, Shortcut } from '../ui/navigation.js';

describe('ShortcutContainer direction', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="desk"></div>';
    });

    it('row por padrão, column quando pedido (+ API setDirection)', () => {
        const row = ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'a', label: 'A' })],
        });
        expect(row.style.flexDirection).toBe('row');

        document.body.innerHTML = '<div id="desk"></div>';
        const col = ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'b', label: 'B' })],
            direction: 'column',
        });
        expect(col.style.flexDirection).toBe('column');
        col.setDirection('row');
        expect(col.style.flexDirection).toBe('row');
    });

    it('column + alignH right: fluxo RTL (1ª coluna na borda direita, preenche p/ a esquerda)', () => {
        const col = ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'a', label: 'A' })],
            direction: 'column',
            alignH: 'right',
            alignV: 'top',
        });
        // eixo principal vertical (alignV) no topo; rtl inverte o cruzado:
        // flex-start = direita → linhas/itens encostados na lateral direita
        expect(col.style.justifyContent).toBe('flex-start'); // começa do topo
        expect(col.style.direction).toBe('rtl');            // preenche da direita p/ a esquerda
        expect(col.style.alignItems).toBe('flex-start');
        expect(col.style.alignContent).toBe('flex-start');

        // setAlignV mexe só no eixo principal (vertical) em column
        col.setAlignV('bottom');
        expect(col.style.justifyContent).toBe('flex-end');
        expect(col.style.alignItems).toBe('flex-start'); // cruzado (horizontal) não muda
        expect(col.style.direction).toBe('rtl');
    });

    it('column + alignH left mantém fluxo LTR; setAlignH alterna o fluxo', () => {
        const col = ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'a', label: 'A' })],
            direction: 'column',
            alignH: 'left',
            alignV: 'top',
        });
        expect(col.style.direction).toBe(''); // LTR: colunas crescem p/ a direita
        expect(col.style.alignItems).toBe('flex-start');
        expect(col.style.alignContent).toBe('flex-start');

        col.setAlignH('right');
        expect(col.style.direction).toBe('rtl'); // passa a preencher da direita
        expect(col.style.alignItems).toBe('flex-start'); // rtl: cross-start = direita

        col.setAlignH('left');
        expect(col.style.direction).toBe('');
        expect(col.style.alignItems).toBe('flex-start');
    });

    it('row mantém o mapeamento e os setters trocam de eixo junto com setDirection', () => {
        const row = ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'a', label: 'A' })],
            alignH: 'right',
            alignV: 'bottom',
        });
        expect(row.style.justifyContent).toBe('flex-end'); // principal horizontal
        expect(row.style.alignItems).toBe('flex-end');     // cruzado vertical

        row.setAlignH('center');
        expect(row.style.justifyContent).toBe('center');
        expect(row.style.alignItems).toBe('flex-end'); // cruzado não muda

        row.setDirection('column');
        // eixos trocam: alignH passa a valer no cruzado (horizontal)
        expect(row.style.justifyContent).toBe('flex-end'); // alignV bottom → vertical
        expect(row.style.alignItems).toBe('center');       // alignH center → horizontal
    });
});
