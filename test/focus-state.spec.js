// @vitest-environment jsdom
// Regressões da janela: foco preservado em re-render (data-bind E data-eid),
// estado fresco a cada abertura e handlers preservados no binding silencioso.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Desktop } from '../desktop.js';
import { ElementBuilder } from '../ElementBuilder.js';

function initDesktop() {
    document.body.innerHTML = '<div id="app"></div>';
    Desktop.screens = {};
    Desktop.windows = {};
    Desktop.nextId = 1;
    Desktop.options = Desktop.options || {};
    Desktop.windowsEl = null;
    Desktop.tasksEl = null;
    Desktop.init({ target: '#app', clock: false });
}

function registerAndOpen(config, props) {
    Desktop.registerScreen(config.id, config);
    return Desktop.openScreen(config.id, props);
}

const digitar = (input, valor) => {
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
};

beforeEach(initDesktop);
afterEach(() => {
    document.querySelectorAll('.ui-modal-overlay').forEach((el) => el.remove());
});

describe('foco em re-render', () => {
    it('mantém o foco e o valor de campo com data-eid (sem data-bind)', () => {
        const win = registerAndOpen({
            id: 'foco-eid',
            title: 'Foco',
            state: { valor: '' },
            view() {
                const input = new ElementBuilder('input')
                    .attr('type', 'text').eid('campo')
                    .on('input', (e) => { this.state.valor = e.target.value; });
                input.build().value = this.state.valor;
                return new ElementBuilder('div').children([input]).build();
            },
        });

        const input = win.windowEl.querySelector('[data-eid="campo"]');
        input.focus();
        digitar(input, 'abc');

        // Sem data-bind o re-render acontece (o nó é recriado), mas o foco —
        // que antes se perdia a cada tecla — agora é restaurado pelo data-eid.
        const depois = win.windowEl.querySelector('[data-eid="campo"]');
        expect(document.activeElement).toBe(depois);
        expect(win.state.valor).toBe('abc');
    });

    it('mantém o foco de campo com data-bind quando o re-render acontece', () => {
        const win = registerAndOpen({
            id: 'foco-bind',
            title: 'Foco Bind',
            state: { nome: '' },
            view() {
                const input = new ElementBuilder('input')
                    .attr('type', 'text').attr('data-bind', 'nome')
                    .on('input', (e) => { this.state.nome = e.target.value; });
                input.build().value = this.state.nome;
                return new ElementBuilder('div').children([input]).build();
            },
        });

        const input = win.windowEl.querySelector('[data-bind="nome"]');
        input.focus();
        // Força um update real da janela (o re-render recria o DOM)
        win.state.nome = 'Maria';
        win.update();

        const depois = win.windowEl.querySelector('[data-bind="nome"]');
        expect(depois.value).toBe('Maria');
        expect(document.activeElement).toBe(depois);
    });

    it('on() com data-bind mantém o handler do desenvolvedor (efeitos colaterais)', () => {
        const win = registerAndOpen({
            id: 'handler-bind',
            title: 'Handler',
            state: { busca: '', espelho: '' },
            view() {
                const input = new ElementBuilder('input')
                    .attr('type', 'text').attr('data-bind', 'busca')
                    .on('input', (e) => { this.state.espelho = e.target.value.toUpperCase(); });
                input.build().value = this.state.busca;
                return new ElementBuilder('div').children([input]).build();
            },
        });

        const input = win.windowEl.querySelector('[data-bind="busca"]');
        digitar(input, 'pa');
        expect(win.state.espelho).toBe('PA'); // o handler custom continuou rodando
    });
});

describe('estado fresco por abertura', () => {
    it('fechar e reabrir a tela parte do estado declarado (sem vazamento)', async () => {
        const tela = {
            id: 'fresco',
            title: 'Fresco',
            state: { codigo: '', itens: [] },
            view() {
                const input = new ElementBuilder('input')
                    .attr('type', 'text').attr('data-bind', 'codigo')
                    .on('input', (e) => { this.state.codigo = e.target.value; });
                input.build().value = this.state.codigo;
                return new ElementBuilder('div').children([input]).build();
            },
        };
        Desktop.registerScreen('fresco', tela);

        const win = Desktop.openScreen('fresco');
        digitar(win.windowEl.querySelector('[data-bind="codigo"]'), 'PC-12');
        win.state.itens.push('sujo');
        expect(win.state.codigo).toBe('PC-12');

        await win.close();

        const win2 = Desktop.openScreen('fresco');
        expect(win2.state.codigo).toBe('');
        expect(win2.state.itens).toEqual([]);
        expect(win2.windowEl.querySelector('[data-bind="codigo"]').value).toBe('');

        // O template do estado também não foi corrompido
        await win2.close();
        const win3 = Desktop.openScreen('fresco');
        expect(win3.state.itens).toEqual([]);
    });

    it('initialProps continuam entrando no estado da janela', () => {
        const win = registerAndOpen({
            id: 'props',
            title: 'Props',
            state: { nome: '', id: null },
            view() {
                return new ElementBuilder('div').text(this.state.nome || '').build();
            },
        }, { nome: 'Ana' });

        expect(win.state.nome).toBe('Ana');
    });
});
