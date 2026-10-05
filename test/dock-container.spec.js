// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DockWidget, DockContainer } from '../ui/navigation.js';
import { ActivityService } from '../activity-service.js';

const created = [];
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function makeDock(opts = {}) {
    const api = DockWidget({ title: 'Dock', ...opts });
    created.push(api);
    return api;
}

function makeContainer(opts = {}) {
    const api = DockContainer({ title: 'Central', ...opts });
    created.push(api);
    return api;
}

afterEach(async () => {
    ActivityService.reset();
    ActivityService.configure({ dockContainer: null });
    for (const api of created.splice(0)) {
        try { api.destroy(); } catch { /* já removido */ }
    }
    document.body.innerHTML = '';
    await tick();
});

describe('DockContainer — painel com scroll', () => {
    it('hospeda docks: entram no corpo, sem posição fixa, com badge', () => {
        const central = makeContainer({});
        const d1 = makeDock({});
        const d2 = makeDock({});

        central.attach(d1);
        central.attach(d2);

        expect(d1.element.parentNode).toBe(central.body);
        expect(d2.element.parentNode).toBe(central.body);
        expect(d1.element.style.bottom).toBe('');
        expect(d1.element.classList.contains('is-stacked')).toBe(true);
        expect(central.getCount()).toBe(2);
        expect(central.getBadge()).toBe(2);
        expect(central.body.querySelector('.ui-dock-container-empty').style.display).toBe('none');
    });

    it('destroy atualiza badge; esvaziar recolhe e mostra vazio', async () => {
        const central = makeContainer({});
        const d1 = makeDock({});
        central.attach(d1);
        expect(central.isExpanded()).toBe(true);

        d1.destroy();
        await vi.waitFor(() => expect(central.getCount()).toBe(0));
        expect(central.getBadge()).toBe(0);
        expect(central.isExpanded()).toBe(false); // autoCollapse
        expect(central.body.querySelector('.ui-dock-container-empty').style.display).not.toBe('none');
    });

    it('novo dock após esvaziar expande sozinho', async () => {
        const central = makeContainer({});
        const d1 = makeDock({});
        central.attach(d1);
        d1.destroy();
        await vi.waitFor(() => expect(central.isExpanded()).toBe(false));

        central.attach(makeDock({}));
        expect(central.isExpanded()).toBe(true);
        expect(central.getCount()).toBe(1);
    });

    it('hospedar libera o canto fixo', () => {
        const central = makeContainer({ position: 'bottom-right' });
        const d1 = makeDock({ position: 'bottom-right' });
        expect(d1.element.style.bottom).toBe('12px'); // acima do container vazio

        central.attach(d1); // d1 sai da pilha fixa…
        const d2 = makeDock({ position: 'bottom-right' });
        expect(d2.element.style.bottom).toBe('12px'); // …e o canto não anda (sem ele seria 24px)
    });

    it('detach devolve o dock ao fluxo fixo do canto', () => {
        const central = makeContainer({ position: 'bottom-right' });
        const d1 = makeDock({ position: 'bottom-right' });
        central.attach(d1);

        central.detach(d1);
        expect(d1.element.parentNode).toBe(document.body);
        expect(d1.element.classList.contains('is-stacked')).toBe(false);
        expect(d1.element.style.bottom).not.toBe('');
        expect(central.getCount()).toBe(0);
    });

    it('o próprio container empilha com docks fixos do canto', () => {
        const central = makeContainer({ position: 'bottom-right' });
        expect(central.element.style.bottom).toBe('0px');
        const d1 = makeDock({ position: 'bottom-right' });
        expect(d1.element.style.bottom).toBe('12px'); // acima do container (alturas 0 no jsdom)
    });

    it('corpo rolável com teto configurável', () => {
        const central = makeContainer({ maxHeight: 400 });
        expect(central.body.className).toContain('ui-dock-container-body');
        expect(central.element.style.getPropertyValue('--dock-container-max')).toBe('400px');
        // o teto padrão (100vh) vive no core.css (.ui-dock-container-body)
    });

    it('vazio: botão direito oferece Remover e fecha o painel', () => {
        const onClose = vi.fn();
        const central = makeContainer({ onClose });
        expect(central.getCount()).toBe(0);

        central.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
        const menu = document.querySelector('.ui-context-menu');
        expect(menu).not.toBeNull();
        expect(menu.textContent).toContain('Remover painel');

        menu.querySelector('.menuOption')?.click();
        expect(document.body.contains(central.element)).toBe(false);
        expect(onClose).toHaveBeenCalled();
    });

    it('com docks: sem menu por padrão; contextMenu:true sempre removível', () => {
        const central = makeContainer({});
        central.attach(makeDock({}));
        central.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
        expect(document.querySelector('.ui-context-menu')).toBeNull();

        const sempre = makeContainer({ contextMenu: true });
        sempre.attach(makeDock({}));
        sempre.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
        expect(document.querySelector('.ui-context-menu')?.textContent).toContain('Remover painel');
    });

    it('ícone na taskbar: botão direito oferece Restaurar + Remover', () => {
        const central = makeContainer({});
        central.minimizeToTray();
        const tray = document.querySelector('.ui-dock-tray-icon');
        expect(tray).not.toBeNull();

        tray.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
        const menu = document.querySelector('.ui-context-menu');
        expect(menu).not.toBeNull();
        expect(menu.textContent).toContain('Restaurar painel');
        expect(menu.textContent).toContain('Remover painel');

        menu.querySelectorAll('.menuOption')[1]?.click(); // Remover (0 = Restaurar)
        expect(document.body.contains(central.element)).toBe(false);
        expect(document.querySelector('.ui-dock-tray-icon')).toBeNull();
    });

    it('setContextMenu troca os itens em tempo de uso (Remover anexado quando vazio)', () => {
        const central = makeContainer({});
        central.setContextMenu([{ label: 'Personalizado', action: () => {} }]);
        central.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
        const menu = document.querySelector('.ui-context-menu');
        expect(menu.textContent).toContain('Personalizado');
        expect(menu.textContent).toContain('Remover painel');
    });
});

describe('ActivityService — container', () => {
    it('attachContainer hospeda os docks próprios do serviço', async () => {
        const central = makeContainer({ title: 'Central do Serviço' });
        ActivityService.attachContainer(central);

        const act = ActivityService.enqueue({
            title: 'Job longo', run: async () => 'ok', target: 'none', track: 'dock',
        });
        const entry = ActivityService.getDock(act.dockId);
        expect(entry).not.toBeNull();
        expect(entry.owned).toBe(true);
        expect(entry.api.element.parentNode).toBe(central.body);
        expect(central.getCount()).toBe(1);

        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        await vi.waitFor(() => expect(central.getCount()).toBe(0), { timeout: 1000 });
    });

    it('attachContainer exige api com attach', () => {
        expect(() => ActivityService.attachContainer({})).toThrow('attach');
        expect(ActivityService.getContainer()).toBeNull();
    });

    it('configure({ dockContainer }) cria a Central sozinha no 1º dock', () => {
        ActivityService.configure({ dockContainer: true });
        expect(ActivityService.getContainer()).toBeNull(); // lazy: nada criado ainda

        const act = ActivityService.enqueue({
            title: 'Job', run: async () => 'ok', target: 'none', track: 'dock',
        });
        const central = ActivityService.getContainer();
        expect(central).not.toBeNull();
        expect(central.getTitle()).toBe('Atividades');
        const entry = ActivityService.getDock(act.dockId);
        expect(entry.api.element.parentNode).toBe(central.body);
    });

    it('opções do dockContainer são respeitadas', () => {
        ActivityService.configure({ dockContainer: { title: 'Central X' } });
        ActivityService.enqueue({
            title: 'Job', run: async () => 'ok', target: 'none', track: 'dock',
        });
        expect(ActivityService.getContainer().getTitle()).toBe('Central X');
    });

    it('detachContainer destrói a própria e devolve os docks ao fixo', () => {
        ActivityService.configure({ dockContainer: true });
        const act = ActivityService.enqueue({
            title: 'Job', run: () => new Promise(() => {}), target: 'none', track: 'dock',
        });
        const central = ActivityService.getContainer();
        const entry = ActivityService.getDock(act.dockId);
        expect(entry.api.element.parentNode).toBe(central.body);

        ActivityService.detachContainer();
        expect(ActivityService.getContainer()).toBeNull();
        expect(document.body.contains(central.element)).toBe(false);
        expect(entry.api.element.parentNode).toBe(document.body); // de volta ao fixo
        expect(entry.api.element.style.bottom).not.toBe('');
        ActivityService.cancel(act.id);
    });

    it('reset destrói a Central própria, mas mantém a da app', () => {
        const appCentral = makeContainer({ title: 'Da App' });
        ActivityService.attachContainer(appCentral);
        ActivityService.reset();
        expect(document.body.contains(appCentral.element)).toBe(true);

        ActivityService.configure({ dockContainer: true });
        ActivityService.enqueue({
            title: 'Job', run: async () => 'ok', target: 'none', track: 'dock',
        });
        const auto = ActivityService.getContainer();
        expect(auto).not.toBe(appCentral);
        ActivityService.reset();
        expect(document.body.contains(auto.element)).toBe(false);
        expect(document.body.contains(appCentral.element)).toBe(true);
    });

    it('attachDock com { container: true } hospeda o dock da app', () => {
        ActivityService.configure({ dockContainer: true });
        const appDock = makeDock({ title: 'Dock da App' });
        ActivityService.attachDock('grupo', appDock, { container: true });
        const central = ActivityService.getContainer();
        expect(appDock.element.parentNode).toBe(central.body);

        const fixo = makeDock({ title: 'Fixo' });
        ActivityService.attachDock('outro', fixo);
        expect(fixo.element.parentNode).toBe(document.body);
    });

    it('attachDock com { container: true } sem Central exige configuração', () => {
        const appDock = makeDock({ title: 'Dock da App' });
        expect(() => ActivityService.attachDock('grupo', appDock, { container: true }))
            .toThrow('Central');
    });
});
