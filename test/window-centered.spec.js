// @vitest-environment jsdom
// `centered: true` — a janela abre centralizada na superfície,
// ignorando a cascata padrão (ex.: tela de autenticação).
import { describe, it, expect, beforeEach } from 'vitest';
import { Desktop } from '../desktop.js';

const screen = (extra = {}) => ({
    id: 'demo',
    title: 'Demo',
    state: {},
    view() {
        const el = document.createElement('div');
        el.textContent = 'demo';
        return el;
    },
    ...extra,
});

beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    Desktop.screens = {};
    Desktop.windows = {};
    Desktop.nextId = 1;
    Desktop.options = Desktop.options || {};
    Desktop.windowsEl = null;
    Desktop.tasksEl = null;
    Desktop.init({ target: '#app', clock: false });
});

describe('Janela centralizada (`centered`)', () => {
    it('sem centered: abre em cascata (deslocada da origem)', () => {
        Desktop.registerScreens({ demo: screen() });
        const win = Desktop.openScreen('demo');
        expect(win.windowEl.style.left).not.toBe('0px');
    });

    it('com centered: ignora a cascata e centraliza', () => {
        Desktop.registerScreens({ demo: screen({ centered: true, width: 420, height: 380 }) });
        const win = Desktop.openScreen('demo');
        // jsdom: superfície sem tamanho → trava em 0 (sem a cascata de 45px+)
        expect(win.windowEl.style.left).toBe('0px');
        expect(win.windowEl.style.top).toBe('0px');
    });

    it('centerWindow centraliza com as dimensões declaradas', () => {
        Desktop.registerScreens({ demo: screen({ width: 400, height: 200 }) });
        const win = Desktop.openScreen('demo');
        Object.defineProperty(Desktop.windowsEl, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(Desktop.windowsEl, 'clientHeight', { value: 800, configurable: true });
        Desktop.centerWindow(win);
        expect(win.windowEl.style.left).toBe('300px'); // (1000-400)/2
        expect(win.windowEl.style.top).toBe('300px'); // (800-200)/2
    });

    it('centerWindow nunca devolve posição negativa', () => {
        Desktop.registerScreens({ demo: screen({ width: 2000, height: 1200 }) });
        const win = Desktop.openScreen('demo');
        Desktop.centerWindow(win);
        expect(win.windowEl.style.left).toBe('0px');
        expect(win.windowEl.style.top).toBe('0px');
    });
});
