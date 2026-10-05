// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Desktop } from '../desktop.js';

describe('openScreen retorno', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        Desktop.screens = {};
        Desktop.windows = {};
        Desktop.nextId = 1;
        Desktop.options = Desktop.options || {};
        Desktop.windowsEl = document.getElementById('windows') || null;
        Desktop.tasksEl = document.getElementById('taskWindows') || null;
        
        // Se os elementos não existem, inicializa o Desktop
        if (!Desktop.windowsEl || !Desktop.tasksEl) {
            Desktop.init({ target: '#app', clock: false });
        }
    });

    it('retorna a instância de forma síncrona para config objeto', () => {
        Desktop.registerScreens({
            demo: {
                id: 'demo',
                title: 'Demo',
                state: {},
                view() {
                    const el = document.createElement('div');
                    el.textContent = 'demo';
                    return el;
                },
            },
        });

        const win = Desktop.openScreen('demo');

        expect(win).not.toBeNull();
        expect(typeof win.then).toBe('undefined');
        expect(typeof win.setCliente).toBe('undefined');
        expect(win.windowEl).not.toBeNull();
        expect(document.body.contains(win.windowEl)).toBe(true);
    });

    it('retorna Promise para tela lazy (função)', async () => {
        Desktop.registerScreens({
            lazy: async () => ({
                id: 'lazy',
                title: 'Lazy',
                state: {},
                view() {
                    return document.createElement('div');
                },
            }),
        });

        const maybePromise = Desktop.openScreen('lazy');
        expect(typeof maybePromise.then).toBe('function');
        const win = await maybePromise;
        expect(win).not.toBeNull();
        expect(win.windowEl).not.toBeNull();
    });

    it('retorna a instância de forma síncrona para factory síncrona (() => obj)', () => {
        const TaskScreen = {
            id: 'tasks',
            title: 'Tasks',
            state: {},
            view() {
                const el = document.createElement('div');
                el.textContent = 'tasks';
                return el;
            },
        };
        Desktop.registerScreens({ tasks: () => TaskScreen });

        const win = Desktop.openScreen('tasks');

        expect(win).not.toBeNull();
        expect(typeof win.then).toBe('undefined');
        expect(win.windowEl).not.toBeNull();
        expect(document.body.contains(win.windowEl)).toBe(true);
    });

    it('await continua funcionando no caso síncrono', async () => {
        Desktop.registerScreens({
            demo2: {
                id: 'demo2',
                title: 'Demo2',
                state: {},
                view() {
                    return document.createElement('div');
                },
            },
        });

        const win = await Desktop.openScreen('demo2');
        expect(win).not.toBeNull();
    });

    it('registerScreen instala stubs delegadores (safeUpdate pré-abertura é no-op)', () => {
        const tela = { id: 'stub', title: 'S', state: {}, view: () => document.createElement('div') };
        Desktop.registerScreen('stub', tela);

        expect(typeof tela.safeUpdate).toBe('function');
        expect(typeof tela.update).toBe('function');
        expect(() => tela.safeUpdate()).not.toThrow(); // sem instância: no-op
        expect(tela.close()).toBeUndefined();
    });

    it('após openScreen, objeto-tela compartilha estado e delega update à instância', () => {
        const tela = {
            id: 'live',
            title: 'Live',
            state: { n: 0 },
            view() {
                const d = document.createElement('div');
                d.textContent = `n=${this.state.n}`;
                return d;
            },
            bump() {
                this.state.n += 1;
                this.safeUpdate();
            },
        };
        Desktop.registerScreen('live', tela);
        const win = Desktop.openScreen('live');

        // Objeto original fica "vivo": mesmo estado e instância carimbada
        expect(tela.state).toBe(win.state);
        expect(tela._instance).toBe(win);

        // Caminho de chamada direta (menus/contexto): lê, escreve e re-renderiza
        tela.bump();
        expect(win.state.n).toBe(1);
        expect(win.windowEl.textContent).toContain('n=1');

        // Caminho pela instância continua o mesmo contrato
        win.bump();
        expect(tela.state.n).toBe(2);
        expect(win.windowEl.textContent).toContain('n=2');
    });
});

describe('closeAllWindows', () => {
    let blockB = false;

    beforeEach(() => {
        blockB = false;
        document.body.innerHTML = '<div id="app"></div>';
        Desktop.screens = {};
        Desktop.windows = {};
        Desktop.nextId = 1;
        Desktop.options = Desktop.options || {};
        if (!document.getElementById('windows')) {
            Desktop.init({ target: '#app', clock: false });
        }
        Desktop.registerScreens({
            a: { id: 'a', title: 'A', state: {}, view() { return document.createElement('div'); } },
            b: {
                id: 'b', title: 'B', state: {},
                view() { return document.createElement('div'); },
                async beforeClose() { return !blockB; },
            },
        });
    });

    const openCount = () => Object.keys(Desktop.windows).length;

    it('fecha todas e devolve true', async () => {
        Desktop.openScreen('a');
        Desktop.openScreen('b');
        expect(openCount()).toBe(2);

        await expect(Desktop.closeAllWindows()).resolves.toBe(true);
        expect(openCount()).toBe(0);
        expect(document.querySelector('.window')).toBeNull();
    });

    it('respeita o beforeClose e devolve false ao bloquear', async () => {
        blockB = true;
        Desktop.openScreen('a');
        Desktop.openScreen('b');

        await expect(Desktop.closeAllWindows()).resolves.toBe(false);
        expect(openCount()).toBe(1); // b bloqueou
    });

    it('force pula o beforeClose', async () => {
        blockB = true;
        Desktop.openScreen('a');
        Desktop.openScreen('b');

        await expect(Desktop.closeAllWindows({ force: true })).resolves.toBe(true);
        expect(openCount()).toBe(0);
    });

    it('sem janelas devolve true', async () => {
        await expect(Desktop.closeAllWindows()).resolves.toBe(true);
    });
});
