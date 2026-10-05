// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActivityService } from '../activity-service.js';
import { ApiService } from '../api-service.js';
import { createMockTransport } from '../api-transports.js';
import { EventBus } from '../core.js';
import { Desktop } from '../desktop.js';
import { DockWidget } from '../ui/navigation.js';

// --------------------------------------------------------------- helpers

function resetFramework() {
    localStorage.clear();
    ActivityService.reset();
    ActivityService.configure({
        maxConcurrent: 3,
        interval: 5,
        maxAttempts: 20,
        persist: true,
        historyLimit: 50,
        notifyOnError: true,
        dock: {
            title: 'Atividades',
            icon: '⚡',
            position: 'bottom-right',
            width: 320,
            height: 320,
            expanded: true,
        },
    });
    ApiService.clearInterceptors();
    ApiService._transports.clear();
    ApiService._defaultTransport = null;
    document.body.innerHTML = '';
}

/** Transporte com request controlada manualmente (fila FIFO / concorrência). */
function controllableTransport() {
    const calls = [];
    const resolvers = [];
    return {
        calls,
        transport: {
            request: (endpoint, options) => {
                calls.push({ endpoint, options });
                return new Promise((resolve) => resolvers.push(resolve));
            },
        },
        resolveNext: (value = { ok: true }) => resolvers.shift()?.(value),
        resolveAll: (value = { ok: true }) => { while (resolvers.length) resolvers.shift()(value); },
    };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function storageItems() {
    const raw = localStorage.getItem('desktop_engine_activities');
    return raw ? JSON.parse(raw).items : null;
}

beforeEach(() => resetFramework());

afterEach(() => {
    vi.restoreAllMocks();
    resetFramework();
});

// --------------------------------------------------------------- validação

describe('ActivityService — validação', () => {
    it('exige run, request ou watch', () => {
        expect(() => ActivityService.enqueue({ title: 'X' })).toThrow('run');
    });

    it('target window exige targetOptions.screen', () => {
        expect(() => ActivityService.enqueue({
            title: 'X', run: async () => 1, target: 'window',
        })).toThrow('screen');
    });

    it('exige endpoint no request e no poll explícito', () => {
        expect(() => ActivityService.enqueue({ title: 'X', request: {} })).toThrow('endpoint');
        expect(() => ActivityService.enqueue({
            title: 'X', request: { endpoint: '/j' }, watch: { mode: 'poll' },
        })).toThrow('endpoint');
    });

    it('rejeita target/track/mode inválidos', () => {
        expect(() => ActivityService.enqueue({ title: 'X', run: async () => 1, target: 'tela' }))
            .toThrow('target');
        expect(() => ActivityService.enqueue({ title: 'X', run: async () => 1, track: 'janela' }))
            .toThrow('track');
    });
});

// ------------------------------------------------------------------- fila

describe('ActivityService — fila FIFO e concorrência', () => {
    it('respeita maxConcurrent e avança em ordem', async () => {
        ActivityService.configure({ maxConcurrent: 2 });
        const ctl = controllableTransport();
        ApiService.registerTransport('mock', ctl.transport);
        ApiService.setDefaultTransport('mock');

        const mk = (n) => ActivityService.enqueue({
            title: `A${n}`, request: { endpoint: `/job-${n}` }, target: 'none', track: 'none',
        });
        const acts = [mk(1), mk(2), mk(3), mk(4)];

        expect(ctl.calls.map((c) => c.endpoint)).toEqual(['/job-1', '/job-2']);
        expect(ActivityService.get(acts[2].id).status).toBe('queued');

        ctl.resolveNext({ ok: 1 });
        await vi.waitFor(() => expect(ctl.calls.map((c) => c.endpoint))
            .toEqual(['/job-1', '/job-2', '/job-3']));
        ctl.resolveAll();
        await vi.waitFor(() => expect(ctl.calls.map((c) => c.endpoint))
            .toEqual(['/job-1', '/job-2', '/job-3', '/job-4']), { timeout: 2000 });
        ctl.resolveAll();
        await vi.waitFor(() => expect(acts.every((a) => a.status === 'done')).toBe(true));
        expect(ctl.calls.map((c) => c.endpoint)).toEqual(['/job-1', '/job-2', '/job-3', '/job-4']);
    });

    it('não duplica id ativo e reexecuta id terminal', async () => {
        const ctl = controllableTransport();
        ApiService.registerTransport('mock', ctl.transport);
        ApiService.setDefaultTransport('mock');

        const a = ActivityService.enqueue({ id: 'x', title: 'X', request: { endpoint: '/a' }, target: 'none', track: 'none' });
        const b = ActivityService.enqueue({ id: 'x', title: 'X', request: { endpoint: '/b' }, target: 'none', track: 'none' });
        expect(b).toBe(a); // mesma atividade ativa
        expect(ctl.calls).toHaveLength(1);

        ctl.resolveAll();
        await vi.waitFor(() => expect(a.status).toBe('done'));
        const c = ActivityService.enqueue({ id: 'x', title: 'X', request: { endpoint: '/c' }, target: 'none', track: 'none' });
        expect(c).not.toBe(a); // terminal → reexecuta
        expect(ctl.calls.map((x) => x.endpoint)).toEqual(['/a', '/c']);
    });
});

// ------------------------------------------------- request + poll (mock)

function mockBackend({ pending = 2, failFirst = false } = {}) {
    let gets = 0;
    let posts = 0;
    const mock = createMockTransport({
        routes: {
            'POST /relatorios': () => { posts++; return { id: 'j1' }; },
            'GET /relatorios/j1': () => {
                gets++;
                if (failFirst && gets === 1) return { status: 'failed', message: 'quebrou' };
                if (gets <= pending) return { status: 'running', progress: gets * 30 };
                return { status: 'done', data: { url: '/rel/1' } };
            },
        },
    });
    ApiService.registerTransport('http', mock);
    ApiService.setDefaultTransport('http');
    return { get gets() { return gets; }, get posts() { return posts; } };
}

const relSpec = () => ({
    title: 'Relatório de Vendas',
    icon: '📊',
    request: { endpoint: '/relatorios', body: { tipo: 'vendas' } },
    watch: { endpoint: (id) => `/relatorios/${id}` },
    target: 'none',
    track: 'none',
});

describe('ActivityService — request + poll', () => {
    it('gera job, acompanha e conclui com eventos e promise', async () => {
        mockBackend({ pending: 2 });
        const seen = [];
        const on = (ev) => (a) => seen.push([ev, a.status]);
        EventBus.on('activity:queued', on('queued'));
        EventBus.on('activity:started', on('started'));
        EventBus.on('activity:done', on('done'));
        EventBus.on('activity:progress', on('progress'));

        const act = ActivityService.enqueue(relSpec());
        expect(['queued', 'running']).toContain(act.status); // pump pode iniciar na hora
        expect(act.jobId).toBeNull();

        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 2000 });
        expect(act.jobId).toBe('j1');
        expect(act.result).toEqual({ url: '/rel/1' });
        expect(act.progress).toBe(100);
        await expect(act.promise).resolves.toEqual({ url: '/rel/1' });

        const kinds = seen.map(([k]) => k);
        expect(kinds[0]).toBe('queued');
        expect(kinds).toContain('started');
        expect(kinds).toContain('progress');
        expect(kinds[kinds.length - 1]).toBe('done');

        EventBus.off('activity:queued', on('queued'));
    });

    it('isFailed do servidor vira failed com erro', async () => {
        mockBackend({ failFirst: true });
        const notify = vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue(relSpec());
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(act.error).toBe('quebrou');
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('Relatório de Vendas'), 'danger');
        await expect(act.promise).rejects.toThrow('quebrou');
    });

    it('falha por tempo esgotado (maxAttempts)', async () => {
        ActivityService.configure({ maxAttempts: 3 });
        mockBackend({ pending: 99 });
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue(relSpec());
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(act.error).toMatch('tempo esgotado');
    });

    it('404 no poll falha na hora', async () => {
        const { ApiError } = await import('../api-service.js');
        const mock = createMockTransport({
            routes: {
                'POST /relatorios': () => ({ id: 'j9' }),
                'GET /relatorios/j9': () => { throw new ApiError('sumiu', 404); },
            },
        });
        ApiService.registerTransport('http', mock);
        ApiService.setDefaultTransport('http');
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue(relSpec());
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(act.error).toBe('sumiu');
    });

    it('silencia o toast com notifyOnError: false', async () => {
        mockBackend({ failFirst: true });
        const notify = vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({ ...relSpec(), notifyOnError: false });
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(notify).not.toHaveBeenCalled();
    });

    it('usa res.message como mensagem de status por padrão', async () => {
        const mock = createMockTransport({
            routes: {
                'POST /relatorios': () => ({ id: 'jm' }),
                'GET /relatorios/jm': () => ({ status: 'running', message: 'Etapa 1 de 2' }),
            },
        });
        ApiService.registerTransport('http', mock);
        ApiService.setDefaultTransport('http');
        const act = ActivityService.enqueue(relSpec());
        await vi.waitFor(() => expect(act.message).toBe('Etapa 1 de 2'), { timeout: 2000 });
        expect(act.status).toBe('running');
    });
});

// ------------------------------------------------------------- cancel/retry

describe('ActivityService — cancel e retry', () => {
    it('cancela na fila (nunca executa) e em execução (para o poll)', async () => {
        ActivityService.configure({ maxConcurrent: 1 });
        const ctl = controllableTransport();
        ApiService.registerTransport('mock', ctl.transport);
        ApiService.setDefaultTransport('mock');

        const a = ActivityService.enqueue({ title: 'A', request: { endpoint: '/a' }, target: 'none', track: 'none' });
        const b = ActivityService.enqueue({ title: 'B', request: { endpoint: '/b' }, target: 'none', track: 'none' });
        expect(ActivityService.cancel(b.id)).toBe(true);
        expect(b.status).toBe('cancelled');
        ctl.resolveAll();
        await tick(30);
        expect(ctl.calls.map((c) => c.endpoint)).toEqual(['/a']); // B nunca executou

        // cancela em execução: o slot libera para a próxima
        const c = ActivityService.enqueue({ title: 'C', run: () => new Promise(() => {}), target: 'none', track: 'none' });
        const d = ActivityService.enqueue({ title: 'D', request: { endpoint: '/d' }, target: 'none', track: 'none' });
        await tick(10);
        expect(c.status).toBe('running');
        expect(ActivityService.cancel(a.id)).toBe(false); // A já terminou
        expect(ActivityService.cancel(c.id)).toBe(true);
        expect(c.status).toBe('cancelled');
        await vi.waitFor(() => expect(d.status).toBe('running'), { timeout: 1000 });
    });

    it('retry reexecuta do zero (novo request)', async () => {
        const backend = mockBackend({ failFirst: true });
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({ ...relSpec(), target: 'none' });
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(backend.posts).toBe(1);

        // a segunda rodada do mock conclui
        const retried = ActivityService.retry(act.id);
        expect(retried).toBe(act);
        expect(['queued', 'running']).toContain(act.status); // pump pode iniciar na hora
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 2000 });
        expect(backend.posts).toBe(2);
        expect(act.result).toEqual({ url: '/rel/1' });
    });
});

// ------------------------------------------------------------------ run

describe('ActivityService — run local', () => {
    it('executa função local e conclui', async () => {
        let progressSeen = null;
        const act = ActivityService.enqueue({
            title: 'Processar CSV',
            run: async (a) => {
                a.setProgress(50, 'metade');
                progressSeen = a.progress;
                return 'ok';
            },
            target: 'none',
            track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(act.result).toBe('ok');
        expect(progressSeen).toBe(50);
    });

    it('erro no run vira failed', async () => {
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({
            title: 'Quebra', run: async () => { throw new Error('bum'); }, target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 1000 });
        expect(act.error).toBe('bum');
    });
});

// ---------------------------------------------------------------- targets

describe('ActivityService — targets', () => {
    it('window abre a tela com o resultado', async () => {
        const openScreen = vi.spyOn(Desktop, 'openScreen').mockImplementation(() => ({}));
        const act = ActivityService.enqueue({
            title: 'R', run: async () => ({ url: '/x' }),
            target: 'window', targetOptions: { screen: 'relatorio' }, track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(openScreen).toHaveBeenCalledWith('relatorio', { result: { url: '/x' } });
    });

    it('modal abre com conteúdo padrão', async () => {
        const openModal = vi.spyOn(Desktop, 'openModal').mockImplementation(() => ({}));
        const act = ActivityService.enqueue({
            title: 'R', run: async () => 'pronto!',
            target: 'modal', targetOptions: {}, track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(openModal).toHaveBeenCalledTimes(1);
        const opts = openModal.mock.calls[0][0];
        expect(opts.title).toBe('R');
        expect(opts.children).toHaveLength(1);
    });

    it('toast notifica a conclusão', async () => {
        const notify = vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({
            title: 'R', run: async () => 1,
            target: 'toast', targetOptions: { message: (r) => `fim: ${r}` }, track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(notify).toHaveBeenCalledWith('fim: 1', 'success');
    });

    it('target função recebe (result, act)', async () => {
        const seen = [];
        const act = ActivityService.enqueue({
            title: 'R', run: async () => 7,
            target: (result, a) => seen.push([result, a.id]), track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(seen).toEqual([[7, act.id]]);
    });

    it('present redispara o target de uma concluída', async () => {
        const notify = vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({
            title: 'R', run: async () => 1, target: 'toast', track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(notify).toHaveBeenCalledTimes(1);
        expect(ActivityService.present(act.id)).toBe(true);
        expect(notify).toHaveBeenCalledTimes(2);
    });
});

// ------------------------------------------------------------------ push

describe('ActivityService — watch push', () => {
    it('auto usa subscribe(handler) e conclui no evento', async () => {
        let handler = null;
        let unsubbed = false;
        ApiService.registerTransport('ws', {
            request: async () => ({ id: 'j9' }),
            subscribe: (h) => { handler = h; return () => { unsubbed = true; }; },
        });
        const act = ActivityService.enqueue({
            title: 'Push', request: { endpoint: '/jobs', transport: 'ws' },
            watch: { transport: 'ws' }, target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(handler).not.toBeNull(), { timeout: 1000 });
        handler({ event: 'job', data: { status: 'running', progress: 40 } });
        await tick(5);
        expect(act.progress).toBe(40);
        handler({ event: 'other', data: { status: 'done' } }); // sem filtro, qualquer evento vale
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(unsubbed).toBe(true);
    });

    it('filtro por event + match', async () => {
        let handler = null;
        ApiService.registerTransport('ws', {
            request: async () => ({ id: 'j9' }),
            subscribe: (h) => { handler = h; return () => {}; },
        });
        const act = ActivityService.enqueue({
            title: 'Push', request: { endpoint: '/jobs', transport: 'ws' },
            watch: { transport: 'ws', event: 'job:done', match: (d) => d.id === 'j9' },
            target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(handler).not.toBeNull(), { timeout: 1000 });
        handler({ event: 'job:progress', data: { id: 'j9', status: 'running' } });
        await tick(5);
        expect(act.status).toBe('running');
        handler({ event: 'job:done', data: { id: 'outro', status: 'done' } });
        await tick(5);
        expect(act.status).toBe('running');
        handler({ event: 'job:done', data: { id: 'j9', status: 'done', data: 'fim' } });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(act.result).toBe('fim');
    });

    it('estilo SSE: subscribe(endpoint, handler)', async () => {
        const seen = {};
        let handler = null;
        ApiService.registerTransport('sse', {
            request: async () => ({ connected: true }),
            subscribe: (endpoint, h) => { seen.endpoint = endpoint; handler = h; return () => {}; },
        });
        const act = ActivityService.enqueue({
            title: 'SSE', jobId: 'j1',
            watch: { mode: 'push', transport: 'sse', endpoint: '/stream/jobs' },
            target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(handler).not.toBeNull(), { timeout: 1000 });
        expect(seen.endpoint).toBe('/stream/jobs');
        handler({ event: 'message', data: { status: 'done', data: 1 }, lastEventId: '3' });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
    });

    it('push sem subscribe cai para poll no auto', async () => {
        mockBackend({ pending: 0 });
        const act = ActivityService.enqueue({
            title: 'Auto-poll', request: { endpoint: '/relatorios' },
            watch: { mode: 'auto', endpoint: (id) => `/relatorios/${id}` },
            target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 2000 });
    });

    it('push explícito sem subscribe falha', async () => {
        mockBackend({ pending: 0 });
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        const act = ActivityService.enqueue({
            title: 'Push-err', request: { endpoint: '/relatorios' },
            watch: { mode: 'push', endpoint: '/x' }, target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 2000 });
        expect(act.error).toMatch('subscribe');
    });
});

// ------------------------------------------------------------------ dock

describe('ActivityService — dock', () => {
    it('track dock cria widget próprio com item e badge', async () => {
        const ctl = controllableTransport();
        ApiService.registerTransport('mock', ctl.transport);
        ApiService.setDefaultTransport('mock');
        const act = ActivityService.enqueue({
            title: 'Relatório X', request: { endpoint: '/x' }, target: 'toast', track: 'dock',
        });
        await tick(5);
        const widget = document.body.querySelector('.ui-dock-widget');
        expect(widget).not.toBeNull();
        expect(widget.textContent).toContain('Relatório X');
        const entry = ActivityService.getDock(act.dockId);
        expect(entry).not.toBeNull();
        expect(entry.owned).toBe(true);
        ctl.resolveAll();
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        await tick(5);
        // target toast: item sai do dock e o widget próprio some
        expect(document.body.querySelector('.ui-dock-widget')).toBeNull();
    });

    it('target dock mantém o item como exibição final', async () => {
        const act = ActivityService.enqueue({
            title: 'Proc', run: async () => 'fim', target: 'dock', track: 'dock',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        const widget = document.body.querySelector('.ui-dock-widget');
        expect(widget).not.toBeNull();
        expect(widget.textContent).toContain('Proc');
        expect(widget.textContent).toContain('✓');
    });

    it('agrupa por targetOptions.dock.id', async () => {
        const mk = (t) => ActivityService.enqueue({
            title: t, run: () => new Promise(() => {}), // nunca termina
            target: 'none', track: 'dock', targetOptions: { dock: { id: 'central' } },
        });
        mk('Um');
        mk('Dois');
        await tick(10);
        const widgets = document.body.querySelectorAll('.ui-dock-widget');
        expect(widgets).toHaveLength(1);
        expect(widgets[0].querySelectorAll('.ui-activity-item')).toHaveLength(2);
    });

    it('falha fica visível com botão de retry', async () => {
        vi.spyOn(Desktop, 'notify').mockImplementation(() => {});
        let fail = true;
        ApiService.registerTransport('mock', {
            request: async () => { if (fail) throw new Error('ops'); return { ok: 1 }; },
        });
        ApiService.setDefaultTransport('mock');
        const act = ActivityService.enqueue({ title: 'Falha', request: { endpoint: '/f' }, target: 'none', track: 'dock' });
        await vi.waitFor(() => expect(act.status).toBe('failed'), { timeout: 1000 });
        const widget = document.body.querySelector('.ui-dock-widget');
        expect(widget.textContent).toContain('ops');
        const retryBtn = widget.querySelector('.ui-activity-btn');
        expect(retryBtn).not.toBeNull();
        fail = false;
        retryBtn.click();
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
    });

    it('attachDock usa o dock da app e nunca o fecha', async () => {
        const api = DockWidget({ title: 'Central da App' });
        ActivityService.attachDock('central', api);
        const act = ActivityService.enqueue({
            title: 'Job', run: async () => 'ok', target: 'toast', track: 'dock',
            targetOptions: { dock: { id: 'central' } },
        });
        const entry = ActivityService.getDock('central');
        expect(entry.owned).toBe(false);
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        await tick(5);
        expect(document.body.contains(api.element)).toBe(true); // dock da app intacto
        expect(api.element.querySelector('.ui-activity-item')).toBeNull(); // item saiu
    });

    it('track none não cria dock', async () => {
        const act = ActivityService.enqueue({
            title: 'Silenciosa', run: async () => 1, target: 'none', track: 'none',
        });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(document.body.querySelector('.ui-dock-widget')).toBeNull();
    });

    it('clear remove terminais e fecha dock próprio', async () => {
        ActivityService.enqueue({ title: 'A', run: async () => 1, target: 'dock', track: 'dock' });
        ActivityService.enqueue({ title: 'B', run: async () => 2, target: 'dock', track: 'dock' });
        await vi.waitFor(() => expect(ActivityService.list('done')).toHaveLength(2), { timeout: 1000 });
        expect(document.body.querySelectorAll('.ui-dock-widget')).toHaveLength(2);
        expect(ActivityService.clear()).toBe(2);
        expect(ActivityService.list()).toHaveLength(0);
        expect(document.body.querySelector('.ui-dock-widget')).toBeNull();
    });
});

// ------------------------------------------------------------ persistência

describe('ActivityService — persistência e init', () => {
    it('persiste snapshots no localStorage', async () => {
        ActivityService.init();
        const ctl = controllableTransport();
        ApiService.registerTransport('mock', ctl.transport);
        ApiService.setDefaultTransport('mock');
        const act = ActivityService.enqueue({
            title: 'Salva', request: { endpoint: '/salva' }, target: 'none', track: 'none',
        });
        await tick(5);
        expect(act.status).toBe('running');
        expect(storageItems().find((i) => i.id === act.id))
            .toMatchObject({ title: 'Salva', status: 'running' });
        ctl.resolveAll();
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(storageItems().find((i) => i.id === act.id).status).toBe('done');
    });

    it('init retoma spec registrada com jobId (sem re-POST)', async () => {
        ActivityService.registerSpec('rel', {
            request: { endpoint: '/relatorios' },
            watch: { endpoint: (id) => `/relatorios/${id}` },
            target: 'none',
            track: 'none',
        });
        const backend = mockBackend({ pending: 1 });
        ActivityService.init();
        const act = ActivityService.enqueue({ name: 'rel', title: 'Retoma' });
        await vi.waitFor(() => expect(act.jobId).toBe('j1'), { timeout: 1000 });
        expect(backend.posts).toBe(1);

        ActivityService.reset({ storage: false }); // simula reload (memória some, storage fica)
        ActivityService.init();
        const restored = ActivityService.get(act.id);
        expect(restored).not.toBeNull();
        expect(restored.jobId).toBe('j1');
        await vi.waitFor(() => expect(restored.status).toBe('done'), { timeout: 2000 });
        expect(backend.posts).toBe(1); // não reenviou o POST
        expect(restored.result).toEqual({ url: '/rel/1' });
    });

    it('sem spec registrada, ativa vira histórico passivo (failed)', async () => {
        mockBackend({ pending: 99 });
        ActivityService.init();
        const act = ActivityService.enqueue(relSpec()); // sem name
        await vi.waitFor(() => expect(act.jobId).toBe('j1'), { timeout: 1000 });

        ActivityService.reset({ storage: false });
        ActivityService.init();
        const restored = ActivityService.get(act.id);
        expect(restored.status).toBe('failed');
        expect(restored.error).toMatch('spec não registrada');
        expect(restored.spec).toBeNull();
        await tick(30); // passiva: nenhum poll novo acontece
        expect(restored.status).toBe('failed');
    });

    it('terminais restauram como histórico no dock', async () => {
        ActivityService.registerSpec('proc', { run: async () => 'x', target: 'dock', track: 'dock' });
        ActivityService.init();
        const act = ActivityService.enqueue({ name: 'proc', title: 'Histórico' });
        await vi.waitFor(() => expect(act.status).toBe('done'), { timeout: 1000 });
        expect(document.body.querySelector('.ui-dock-widget')).not.toBeNull();

        ActivityService.reset({ storage: false });
        document.body.innerHTML = '';
        ActivityService.init();
        expect(ActivityService.get(act.id).status).toBe('done');
        expect(document.body.querySelector('.ui-dock-widget')).not.toBeNull();
        expect(document.body.querySelector('.ui-dock-widget').textContent).toContain('Histórico');
    });

    it('historyLimit poda as mais antigas', async () => {
        ActivityService.configure({ historyLimit: 2 });
        ActivityService.init();
        for (let i = 0; i < 3; i++) {
            ActivityService.enqueue({ title: `J${i}`, run: async () => i, target: 'none', track: 'none' });
        }
        await vi.waitFor(() => expect(ActivityService.list('done')).toHaveLength(2), { timeout: 2000 });
        expect(ActivityService.list()).toHaveLength(2);
        expect(storageItems()).toHaveLength(2);
    });
});
