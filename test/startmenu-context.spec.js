// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { StartMenu } from '../ui/navigation.js';
import { EventBus } from '../core.js';
import { Desktop } from '../desktop.js';

describe('StartMenu contexto de tela', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"><button id="startBtn"></button></div>';
    });

    function leafOptions() {
        return [...document.querySelectorAll('.menuOption')].filter(
            (el) => !el.classList.contains('has-submenu'),
        );
    }

    function rightClick(el, x = 50, y = 60) {
        const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
        el.dispatchEvent(e);
        return e;
    }

    it('emite evento com aspas duplas (formato de bundler)', () => {
        const seen = [];
        EventBus.on('menu:screen-context', (p) => seen.push(p));

        StartMenu({
            buttonId: 'startBtn',
            menus: [{ label: 'M', items: [{ label: 'Dash', action: () => Desktop.openScreen("dashboard") }] }],
        });

        const leaf = leafOptions()[0];
        const e = rightClick(leaf, 111, 222);

        expect(e.defaultPrevented).toBe(true);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ screenId: 'dashboard', label: 'Dash', x: 111, y: 222 });
    });

    it('emite evento com aspas simples', () => {
        const seen = [];
        EventBus.on('menu:screen-context', (p) => seen.push(p));

        StartMenu({
            buttonId: 'startBtn',
            menus: [{ label: 'M', items: [{ label: 'Chamados', action: () => Desktop.openScreen('chamados') }] }],
        });

        rightClick(leafOptions()[0]);

        expect(seen).toHaveLength(1);
        expect(seen[0].screenId).toBe('chamados');
    });

    it('respeita noContextMenu e disabled', () => {
        const seen = [];
        EventBus.on('menu:screen-context', (p) => seen.push(p));

        StartMenu({
            buttonId: 'startBtn',
            menus: [{
                label: 'M',
                items: [
                    { label: 'Oculto', noContextMenu: true, action: () => openIt('a') },
                    { label: 'Bloq', disabled: true, action: () => openIt('b') },
                ],
            }],
        });

        leafOptions().forEach((el) => rightClick(el));
        expect(seen).toHaveLength(0);
    });
});
