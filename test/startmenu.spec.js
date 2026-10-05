// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Desktop } from '../desktop.js';

describe('StartMenu merge (regressão: sem duplicação)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        Desktop._registeredStartMenus = [];
        Desktop._globalMenuBarMenus = [];
        Desktop.options = Desktop.options || {};
    });

    it('registerStartMenu repetido não compõe menus mesclados', () => {
        document.getElementById('app').dataset.menubar = 'none'; // modo startmenu
        const env = [{ label: 'Env', items: [{ label: 'Sair' }] }];
        const app = [{ label: 'App', items: [{ label: 'Abrir' }] }];
        Desktop._globalMenuBarMenus = app;

        Desktop.registerStartMenu({ menus: env });
        Desktop.registerStartMenu({ menus: env });
        Desktop.registerStartMenu({ menus: env });

        // Registro guarda os crus, nunca o efetivo mesclado
        expect(Desktop._registeredStartMenus).toEqual(env);

        const effective = Desktop.getEffectiveStartMenus();
        const labels = effective.filter((m) => m !== 'separator').map((m) => m.label);
        expect(labels.filter((l) => l === 'Env')).toHaveLength(1);
        expect(labels.filter((l) => l === 'App')).toHaveLength(1);
    });
});
