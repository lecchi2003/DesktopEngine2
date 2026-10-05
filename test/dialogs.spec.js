// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Desktop } from '../desktop.js';

/** Overlay mais recente (o Modal remove o anterior após a animação). */
function lastOverlay() {
    const list = document.querySelectorAll('.ui-modal-overlay');
    return list[list.length - 1];
}

function buttonIn(overlay, label) {
    return [...overlay.querySelectorAll('button')].find((b) => b.textContent === label);
}

beforeEach(() => {
    document.querySelectorAll('.ui-modal-overlay').forEach((el) => el.remove());
});

afterEach(() => {
    document.querySelectorAll('.ui-modal-overlay').forEach((el) => el.remove());
});

describe('Desktop.confirm', () => {
    it('resolve true no Confirmar', async () => {
        const p = Desktop.confirm('Apagar o registro?', { okLabel: 'Sim', cancelLabel: 'Não' });
        const overlay = lastOverlay();
        expect(overlay.querySelector('.ui-dialog-message').textContent).toBe('Apagar o registro?');
        buttonIn(overlay, 'Sim').click();
        await expect(p).resolves.toBe(true);
    });

    it('resolve false no Cancelar', async () => {
        const p = Desktop.confirm('Sair sem salvar?', { danger: true });
        const overlay = lastOverlay();
        expect(overlay.querySelector('button.ui-btn-danger')).not.toBeNull();
        buttonIn(overlay, 'Cancelar').click();
        await expect(p).resolves.toBe(false);
    });

    it('resolve false no ESC', async () => {
        const p = Desktop.confirm('Fechar?');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await expect(p).resolves.toBe(false);
    });
});

describe('Desktop.prompt', () => {
    it('resolve com o texto digitado ao confirmar', async () => {
        const p = Desktop.prompt('Nome do setor:', { value: 'Inicial' });
        const overlay = lastOverlay();
        const input = overlay.querySelector('.ui-dialog-input');
        expect(input.value).toBe('Inicial');
        input.value = 'Manutenção';
        buttonIn(overlay, 'OK').click();
        await expect(p).resolves.toBe('Manutenção');
    });

    it('Enter confirma', async () => {
        const p = Desktop.prompt('Buscar:');
        const overlay = lastOverlay();
        const input = overlay.querySelector('.ui-dialog-input');
        input.value = 'chamado 12';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await expect(p).resolves.toBe('chamado 12');
    });

    it('resolve null no Cancelar/ESC', async () => {
        const p = Desktop.prompt('Cancelar?');
        buttonIn(lastOverlay(), 'Cancelar').click();
        await expect(p).resolves.toBeNull();

        const p2 = Desktop.prompt('ESC?');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await expect(p2).resolves.toBeNull();
    });
});

describe('Desktop.alert', () => {
    it('resolve ao confirmar', async () => {
        const p = Desktop.alert('Operação concluída.', { title: 'Aviso', okLabel: 'Entendi' });
        const overlay = lastOverlay();
        expect(overlay.querySelector('.ui-dialog-message').textContent).toBe('Operação concluída.');
        buttonIn(overlay, 'Entendi').click();
        await expect(p).resolves.toBeUndefined();
    });
});

describe('Diálogos no escopo da janela', () => {
    let win;

    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        Desktop.screens = {};
        Desktop.windows = {};
        Desktop.nextId = 1;
        Desktop.options = Desktop.options || {};
        Desktop.windowsEl = null;
        Desktop.tasksEl = null;
        Desktop.init({ target: '#app', clock: false });
        Desktop.registerScreens({
            demo: {
                id: 'demo',
                title: 'Demo',
                state: {},
                view() {
                    return document.createElement('div');
                },
            },
        });
        win = Desktop.openScreen('demo');
    });

    it('win.confirm cria o overlay dentro da janela (modal local)', async () => {
        const p = win.confirm('Excluir o registro?', { danger: true });
        const overlay = lastOverlay();
        expect(overlay.parentElement).toBe(win.windowEl);
        const ok = buttonIn(overlay, 'Confirmar');
        expect(ok.className).toContain('ui-btn-danger');
        ok.click();
        await expect(p).resolves.toBe(true);
    });

    it('Desktop.confirm continua global (overlay no #app)', async () => {
        const p = Desktop.confirm('Aviso do sistema?');
        const overlay = lastOverlay();
        expect(overlay.parentElement).toBe(document.getElementById('app'));
        buttonIn(overlay, 'Cancelar').click();
        await expect(p).resolves.toBe(false);
    });

    it('método chamado no objeto-tela usa o diálogo da janela viva', async () => {
        const tela = Desktop.screens.demo;
        const p = tela.confirm('Via objeto-tela?');
        const overlay = lastOverlay();
        expect(overlay.parentElement).toBe(win.windowEl);
        buttonIn(overlay, 'Cancelar').click();
        await expect(p).resolves.toBe(false);
    });

    it('método próprio da tela chamando this.confirm usa a janela nas duas vias', async () => {
        Desktop.registerScreen('comConfirm', {
            id: 'comConfirm',
            title: 'Com Confirm',
            state: {},
            view() {
                return document.createElement('div');
            },
            async excluir() {
                return this.confirm('Excluir mesmo?', { danger: true });
            },
        });
        const w2 = Desktop.openScreen('comConfirm');

        // via instância (handlers/menus de janela)
        const p1 = w2.excluir();
        expect(lastOverlay().parentElement).toBe(w2.windowEl);
        buttonIn(lastOverlay(), 'Confirmar').click();
        await expect(p1).resolves.toBe(true);

        // via objeto-tela (chamadas diretas `Tela.metodo()`)
        const p2 = Desktop.screens.comConfirm.excluir();
        expect(lastOverlay().parentElement).toBe(w2.windowEl);
        buttonIn(lastOverlay(), 'Cancelar').click();
        await expect(p2).resolves.toBe(false);
    });

    it('win.prompt usa o mesmo escopo e devolve o texto', async () => {
        const p = win.prompt('Novo valor:', { value: '42' });
        const overlay = lastOverlay();
        expect(overlay.parentElement).toBe(win.windowEl);
        buttonIn(overlay, 'OK').click();
        await expect(p).resolves.toBe('42');
    });

    it('sem janela montada, o diálogo cai para o escopo global', async () => {
        await win.close();
        expect(document.body.contains(win.windowEl)).toBe(false);
        const p = win.confirm('Janela fechada?');
        const overlay = lastOverlay();
        expect(overlay.parentElement).toBe(document.getElementById('app'));
        buttonIn(overlay, 'Cancelar').click();
        await expect(p).resolves.toBe(false);
    });
});
