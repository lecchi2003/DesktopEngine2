// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ShortcutContainer, Shortcut } from '../ui/navigation.js';

function dragEvents() {
    const data = {};
    return {
        create(type, target, x = 0, y = 0) {
            const e = new Event(type, { bubbles: true, cancelable: true });
            e.clientX = x;
            e.clientY = y;
            e.dataTransfer = {
                effectAllowed: '',
                dropEffect: '',
                setData: (k, v) => { data[k] = v; },
                getData: (k) => data[k],
            };
            return e;
        },
    };
}

describe('ShortcutContainer reorderable', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="desk"></div>';
    });

    it('emite onReorder com os ids na nova ordem após drop', () => {
        const seen = [];
        const sc = (id, label) => Shortcut({ id, label, icon: '🔗' });
        ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [sc('a', 'A'), sc('b', 'B'), sc('c', 'C')],
            reorderable: true,
            onReorder: (ids) => seen.push(ids),
        });

        const { create } = dragEvents();
        const container = document.querySelector('.ui-shortcut-container');
        const [elA, , elC] = container.querySelectorAll('.ui-shortcut');

        elA.dispatchEvent(create('dragstart', elA));
        // arrasta A para depois de C: dragover além do meio de C
        const rect = { top: 0, left: 200, width: 80, height: 80, right: 280, bottom: 80 };
        elC.getBoundingClientRect = () => rect;
        container.dispatchEvent(create('dragover', container, 500, 10));
        container.dispatchEvent(create('drop', container));

        expect(seen).toHaveLength(1);
        expect(seen[0][seen[0].length - 1]).toBe('a');
        expect(container.querySelectorAll('.ui-shortcut')[2].id).toBe('a');
    });

    it('sem reorderable não há drag habilitado', () => {
        ShortcutContainer({
            container: document.getElementById('desk'),
            shortcuts: [Shortcut({ id: 'a', label: 'A' })],
        });
        const el = document.querySelector('.ui-shortcut');
        expect(el.draggable).toBe(false);
    });
});

describe('Shortcut visual (cor da fonte, tamanho e fundo)', () => {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s/g, '');

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('aplica fontColor, fontSize e backgroundColor vindos das options', () => {
        const el = Shortcut({
            label: 'Docs',
            icon: '📁',
            fontSize: 14,
            fontColor: '#ff0000',
            backgroundColor: '#102030',
        });

        const lbl = el.querySelector('.ui-shortcut__label');
        expect(lbl.style.fontSize).toBe('14px');
        expect(norm(lbl.style.color)).toMatch(/#ff0000|rgb\(255,0,0\)/);
        expect(norm(el.style.backgroundColor)).toMatch(/#102030|rgb\(16,32,48\)/);
    });

    it('aplica fontWeight (negrito) e fontStyle (itálico)', () => {
        const bold = Shortcut({ label: 'Forte', icon: '⭐', fontWeight: 'bold', fontStyle: 'italic' });
        const boldLbl = bold.querySelector('.ui-shortcut__label');
        expect(boldLbl.style.fontWeight).toBe('bold');
        expect(boldLbl.style.fontStyle).toBe('italic');

        // peso numérico também é aceito
        const strong = Shortcut({ label: '600', icon: '⭐', fontWeight: 600 });
        expect(strong.querySelector('.ui-shortcut__label').style.fontWeight).toBe('600');

        // sem opção = tema
        const plain = Shortcut({ label: 'Simples', icon: '🔗' });
        expect(plain.querySelector('.ui-shortcut__label').style.fontWeight).toBe('');
        expect(plain.querySelector('.ui-shortcut__label').style.fontStyle).toBe('');
    });

    it('sem fontColor/backgroundColor o tema do componente governa', () => {
        const el = Shortcut({ label: 'Sem cor', icon: '🔗' });
        expect(el.querySelector('.ui-shortcut__label').style.color).toBe('');
        expect(el.style.backgroundColor).toBe('');
    });

    it('setters alteram e restauram o padrão (string vazia)', () => {
        const el = Shortcut({ label: 'A', icon: '🔗' });
        const lbl = el.querySelector('.ui-shortcut__label');

        expect(el.setFontColor('#00ff00')).toBe(el);
        el.setFontSize(18);
        el.setBackgroundColor('#000000');
        expect(norm(lbl.style.color)).toMatch(/#00ff00|rgb\(0,255,0\)/);
        expect(lbl.style.fontSize).toBe('18px');
        expect(norm(el.style.backgroundColor)).toMatch(/#000000|rgb\(0,0,0\)/);

        // '' volta ao tema
        el.setFontColor('');
        el.setBackgroundColor('');
        expect(lbl.style.color).toBe('');
        expect(el.style.backgroundColor).toBe('');
    });

    it('setFontWeight/setFontStyle alteram e restauram o tema', () => {
        const el = Shortcut({ label: 'A', icon: '🔗' });
        const lbl = el.querySelector('.ui-shortcut__label');

        el.setFontWeight('bold');
        el.setFontStyle('italic');
        expect(lbl.style.fontWeight).toBe('bold');
        expect(lbl.style.fontStyle).toBe('italic');

        el.setFontWeight(700);
        expect(lbl.style.fontWeight).toBe('700');

        el.setFontWeight('');
        el.setFontStyle('');
        expect(lbl.style.fontWeight).toBe('');
        expect(lbl.style.fontStyle).toBe('');
    });
});
