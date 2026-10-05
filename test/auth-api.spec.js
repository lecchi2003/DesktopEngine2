// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../auth-service.js';
import { ApiService } from '../api-service.js';
import { ElementPermissionPlugin } from '../element-permission-plugin.js';
import { EventBus } from '../core.js';

describe('AuthService (genérico)', () => {
    beforeEach(() => {
        localStorage.clear();
        AuthService._session = null;
        AuthService._providers.clear();
    });

    it('registra provedores e faz login/logout com eventos', async () => {
        const events = [];
        EventBus.on('auth:login', (u) => events.push(['login', u.id]));
        EventBus.on('auth:logout', () => events.push(['logout']));

        AuthService.registerProvider('email', {
            login: async (email) => ({ user: { id: email }, token: 'tok' }),
            logout: async () => {},
        });

        const res = await AuthService.login('email', 'tec');
        expect(res.token).toBe('tok');
        expect(AuthService.isAuthenticated()).toBe(true);
        expect(AuthService.getToken()).toBe('tok');
        expect(JSON.parse(localStorage.getItem('auth_session')).user.id).toBe('tec');

        await AuthService.logout();
        expect(AuthService.isAuthenticated()).toBe(false);
        expect(AuthService.getSession()).toBeNull();
        expect(localStorage.getItem('auth_session')).toBeNull();
        expect(events).toEqual([['login', 'tec'], ['logout']]);
    });

    it('setSession define/restaura sessão sem emitir eventos', () => {
        expect(AuthService.setSession({ user: { id: 'u1' }, token: 't1' })).toMatchObject({ token: 't1' });
        expect(AuthService.getCurrentUser().id).toBe('u1');
        expect(JSON.parse(localStorage.getItem('auth_session')).token).toBe('t1');

        // null encerra em silêncio (sem eventos) e limpa a persistência
        expect(AuthService.setSession(null)).toBeNull();
        expect(AuthService.getSession()).toBeNull();
        expect(localStorage.getItem('auth_session')).toBeNull();
    });

    it('init restaura sessão persistida', async () => {
        AuthService.setSession({ user: { id: 'u9' }, token: 'tk', provider: 'email' });
        AuthService._session = null;
        const user = await AuthService.init();
        expect(user.id).toBe('u9');
        expect(AuthService.getToken()).toBe('tk');
    });

    it('updateSession exige sessão ativa', () => {
        expect(() => AuthService.updateSession({ token: 'x' })).toThrow('Não há sessão ativa');
        AuthService.setSession({ user: { id: 'a' }, token: 't' });
        expect(AuthService.updateSession({ token: 'novo' }).token).toBe('novo');
    });
});

describe('ApiService (genérico)', () => {
    beforeEach(() => {
        ApiService.clearInterceptors();
        ApiService._transports.clear();
        ApiService._defaultTransport = null;
    });

    it('transportes registráveis com default e remoção', async () => {
        ApiService.registerTransport('fake', { request: async (endpoint) => ({ endpoint, via: 'fake' }) });
        ApiService.setDefaultTransport('fake');
        expect(await ApiService.get('/ping')).toEqual({ endpoint: '/ping', via: 'fake' });

        expect(ApiService.listTransports()).toContain('fake');
        ApiService.removeTransport('fake');
        expect(ApiService.getTransport('fake')).toBeNull();
    });

    it('interceptors de requição/resposta/erro são acionados', async () => {
        const calls = [];
        ApiService.registerTransport('ok', { request: async () => ({ v: 1 }) });
        ApiService.setDefaultTransport('ok');
        ApiService.onRequest((ctx) => { calls.push(['req', ctx.endpoint]); });
        ApiService.onResponse((res) => { calls.push(['res', res.v]); });
        ApiService.onError(() => calls.push(['err']));

        await ApiService.post('/a', { x: 1 });
        expect(calls).toEqual([['req', '/a'], ['res', 1]]);

        ApiService.registerTransport('boom', { request: async () => { throw new Error('falhou'); } });
        await expect(ApiService.get('/b', {}, 'boom')).rejects.toThrow('falhou');
        expect(calls.at(-1)).toEqual(['err']);
    });
});

describe('ElementPermissionPlugin', () => {
    it('load/isAllowed/clear com fonte de permissões configurável', async () => {
        const FW = {
            hooks: [],
            filters: [],
            registerContentHook(fn) { this.hooks.push(fn); },
            registerMenuItemFilter(fn) { this.filters.push(fn); },
        };
        ElementPermissionPlugin.install(FW, {
            loadPermissoes: async () => ([
                { screenId: 'telas', key: 'btn-x', kind: 'button', effect: 'hide', allowed: false },
                { screenId: 'telas', key: 'livre', kind: 'field', effect: 'hide', allowed: true },
            ]),
            isEditMode: () => false,
            fallbackAllowed: true,
        });

        await FW.elementPermissions.load();
        expect(FW.elementPermissions.isLoaded()).toBe(true);
        expect(FW.elementPermissions.isAllowed('telas', 'btn-x')).toBe(false);
        expect(FW.elementPermissions.isAllowed('telas', 'livre')).toBe(true);
        // ausente do catálogo → fallback configurado
        expect(FW.elementPermissions.isAllowed('telas', 'desconhecido')).toBe(true);

        FW.elementPermissions.clear();
        expect(FW.elementPermissions.isLoaded()).toBe(false);
        expect(FW.elementPermissions.isAllowed('telas', 'btn-x')).toBe(true);
    });

    it('refresh recarrega a fonte e reaplica nas janelas abertas', async () => {
        const FW = {
            hooks: [],
            filters: [],
            registerContentHook(fn) { this.hooks.push(fn); },
            registerMenuItemFilter(fn) { this.filters.push(fn); },
        };
        let rows = [
            { screenId: 'telas', key: 'btn-x', kind: 'button', effect: 'hide', allowed: false },
        ];
        ElementPermissionPlugin.install(FW, {
            loadPermissoes: async () => rows,
            isEditMode: () => false,
            fallbackAllowed: true,
        });

        // Janela aberta com o data-screen-id carimbado pelo createWindow
        const win = document.createElement('div');
        win.className = 'window';
        win.dataset.screenId = 'telas';
        win.innerHTML = '<div class="windowBody"><button data-eid="btn-x">X</button></div>';
        document.body.appendChild(win);
        const btn = win.querySelector('button');

        await FW.elementPermissions.load();
        FW.elementPermissions.reapplyOpenWindows();
        expect(btn.style.display).toBe('none');

        // Mutação no catálogo (ex.: admin liberou o elemento)
        rows = [{ screenId: 'telas', key: 'btn-x', kind: 'button', effect: 'hide', allowed: true }];
        await FW.elementPermissions.refresh();

        expect(FW.elementPermissions.rowsForScreen('telas')[0].allowed).toBe(true);
        expect(btn.style.display).not.toBe('none');

        win.remove();
    });

    it('reapplyOpenWindows ignora janelas sem data-screen-id', async () => {
        const FW = {
            hooks: [],
            filters: [],
            registerContentHook(fn) { this.hooks.push(fn); },
            registerMenuItemFilter(fn) { this.filters.push(fn); },
        };
        ElementPermissionPlugin.install(FW, {
            loadPermissoes: async () => ([
                { screenId: 'telas', key: 'btn-x', kind: 'button', effect: 'hide', allowed: false },
            ]),
            isEditMode: () => false,
            fallbackAllowed: true,
        });
        await FW.elementPermissions.load();

        const win = document.createElement('div');
        win.className = 'window';
        win.innerHTML = '<div class="windowBody"><button data-eid="btn-x">X</button></div>';
        document.body.appendChild(win);

        FW.elementPermissions.reapplyOpenWindows();
        expect(win.querySelector('button').style.display).toBe('');

        win.remove();
    });
});
