// @vitest-environment jsdom
// Builders de menus padrão do ambiente: estrutura do framework (janelas,
// sobre, invólucro do LaF) + injeção do que é da app (sessão, itens de LaF).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Desktop } from '../desktop.js';

beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.restoreAllMocks();
});

describe('Menus padrão do ambiente', () => {
    it('getDefaultWindowItems traz organizar + área de trabalho + mobile', () => {
        const arrange = vi.spyOn(Desktop, 'arrangeWindows').mockImplementation(() => {});
        const show = vi.spyOn(Desktop, 'showDesktop').mockImplementation(() => {});
        const mobile = vi.spyOn(Desktop, 'toggleMobileMode').mockImplementation(() => {});

        const items = Desktop.getDefaultWindowItems();
        expect(items.map((i) => (i === 'separator' ? i : i.label))).toEqual([
            'Organizar Janelas em Grade',
            'Mostrar / Ocultar Área de Trabalho',
            'separator',
            'Alternar Modo Mobile / Desktop',
        ]);
        items[0].action(); expect(arrange).toHaveBeenCalled();
        items[1].action(); expect(show).toHaveBeenCalled();
        items[3].action(); expect(mobile).toHaveBeenCalled();
    });

    it('getDesktopContextItems: extras da app + LaF + janelas + sobre', () => {
        const items = Desktop.getDesktopContextItems({
            extraItems: [{ label: 'Abrir Dashboard', action: () => {} }],
            lafItems: [{ label: 'Tema X', action: () => {} }],
            appName: 'Demo',
        });
        const labels = items.map((i) => (i === 'separator' ? i : i.label));
        expect(labels).toEqual([
            'Abrir Dashboard',
            'separator',
            '🎨 Look and Feel',
            'Organizar Janelas em Grade',
            'Mostrar / Ocultar Área de Trabalho',
            'separator',
            'Alternar Modo Mobile / Desktop',
            'separator',
            'ℹ️ Sobre Demo',
        ]);
        expect(items[2].items).toHaveLength(1);
    });

    it('getDesktopContextItems: sem LaF e sem janelas quando desligados', () => {
        const items = Desktop.getDesktopContextItems({ appName: 'Demo', includeWindows: false });
        expect(items.map((i) => (i === 'separator' ? i : i.label))).toEqual(['ℹ️ Sobre Demo']);
    });

    it('Sobre padrão notifica; onAbout personaliza', () => {
        const notify = vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const items = Desktop.getDesktopContextItems({ appName: 'Demo' });
        items[items.length - 1].action();
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('Demo'), 'info');

        const custom = vi.fn();
        const customItems = Desktop.getDesktopContextItems({ appName: 'Demo', onAbout: custom });
        customItems[customItems.length - 1].action();
        expect(custom).toHaveBeenCalled();
    });

    it('getEnvironmentMenus monta Sistema/LaF/Janelas/Ajuda', () => {
        const menus = Desktop.getEnvironmentMenus({
            sessionItems: [{ label: 'Sair', action: () => {} }],
            lafItems: [{ label: 'Tema X', action: () => {} }],
            appName: 'Demo',
        });
        expect(menus.map((m) => m.label)).toEqual(['📊 Sistema', '🎨 Look and Feel', '🖥️ Janelas', 'ℹ️ Ajuda']);
        expect(menus[0].items).toHaveLength(1);
        expect(menus[3].items[0].label).toContain('Demo');
    });

    it('getEnvironmentMenus: sem sessão/LaF e sem janelas quando desligados', () => {
        const menus = Desktop.getEnvironmentMenus({ appName: 'Demo', includeWindows: false });
        expect(menus.map((m) => m.label)).toEqual(['ℹ️ Ajuda']);
    });
});
