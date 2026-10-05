// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    createMockTransport,
    createWebSocketTransport,
    createSseTransport,
    createSocketIoTransport,
} from '../api-transports.js';
import { ApiService, ApiError } from '../api-service.js';

// --------------------------------------------------------------- fakes

/** WebSocket fake: conexão/manual open, sent[], emit() de mensagens, drop() de queda. */
function makeFakeWS() {
    return class FakeWS {
        static instances = [];
        constructor(u, protocols) {
            this.url = u;
            this.protocols = protocols;
            this.readyState = 0;
            this.sent = [];
            FakeWS.instances.push(this);
        }
        open() { this.readyState = 1; this.onopen?.(); }
        send(d) { this.sent.push(JSON.parse(d)); }
        close() { this.readyState = 3; this.onclose?.(); }
        drop() { this.readyState = 3; this.onclose?.(); } // queda sem ação do cliente
        emit(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    };
}

/** EventSource fake: listeners addEventListener/removeEventListener, open/fire/fail. */
function makeFakeES() {
    return class FakeES {
        static instances = [];
        constructor(u, opts) {
            this.url = u;
            this.opts = opts;
            this.readyState = 0;
            this.listeners = {};
            FakeES.instances.push(this);
        }
        addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
        removeEventListener(ev, fn) {
            this.listeners[ev] = (this.listeners[ev] || []).filter((f) => f !== fn);
        }
        close() { this.readyState = 2; this.closed = true; }
        open() { this.readyState = 1; (this.listeners.open || []).forEach((f) => f({})); }
        fire(ev, data) { (this.listeners[ev] || []).forEach((f) => f({ data, lastEventId: '42' })); }
        fail() { (this.listeners.error || []).forEach((f) => f({})); }
    };
}

/**
 * Fábrica io(...) fake do Socket.IO: sockets capturados em io.sockets,
 * emit(event, payload, ack) registrado em emitted, fire() para pushes.
 */
function makeFakeSocketIo() {
    const sockets = [];
    class FakeSocket {
        constructor(u, options) {
            this.url = u;
            this.options = options;
            this.connected = false;
            this.handlers = {};
            this.emitted = [];
            sockets.push(this);
        }
        on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
        emit(event, payload, ack) { this.emitted.push({ event, payload, ack }); return this; }
        disconnect() { this.connected = false; this.disconnected = true; return this; }
        // helpers de teste
        fire(event, data) { (this.handlers[event] || []).forEach((fn) => fn(data)); }
        ackLast(response) {
            const last = this.emitted[this.emitted.length - 1];
            last.ack?.(response);
        }
    }
    const io = (u, options) => new FakeSocket(u, options);
    io.sockets = sockets;
    return io;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
    vi.useRealTimers();
    ApiService.removeTransport('mock-test');
});

// ---------------------------------------------------------------- Mock

describe('createMockTransport', () => {
    it('resolve rotas exatas (dado estático e handler com params/body)', async () => {
        const mock = createMockTransport({
            routes: {
                'GET /ping': { pong: true },
                'POST /chamados': (params, body) => ({ ...body, origem: 'mock' }),
                'get /usuarios': [{ id: 1 }], // método minúsculo é normalizado
            },
        });

        await expect(mock.request('/ping')).resolves.toEqual({ pong: true });
        await expect(mock.request('/usuarios')).resolves.toEqual([{ id: 1 }]);
        await expect(mock.request('/chamados', { method: 'POST', body: { titulo: 'X' } }))
            .resolves.toEqual({ titulo: 'X', origem: 'mock' });
    });

    it('combina path params (:id) com query params e normaliza a URL', async () => {
        const mock = createMockTransport({
            routes: {
                'GET /usuarios/:id': (params) => params,
            },
        });

        // path param + query params; URL absoluta, barra final e query
        // embutida caem no mesmo caminho (params via options.params)
        await expect(mock.request('http://host/usuarios/7/?pagina=2', { params: { filtro: 'ativo' } }))
            .resolves.toEqual({ id: '7', filtro: 'ativo' });
    });

    it('rota ausente vira ApiError 404; fallback customizado é usado quando existe', async () => {
        const mock = createMockTransport({ routes: { 'GET /ping': {} } });
        const err = await mock.request('/nao-existe').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(404);
        expect(err.message).toContain('GET /nao-existe');

        const withFallback = createMockTransport({
            fallback: (method, path) => ({ deuErro: false, method, path }),
        });
        await expect(withFallback.request('/qualquer'))
            .resolves.toEqual({ deuErro: false, method: 'GET', path: '/qualquer' });
    });

    it('propaga ApiError do handler e converte Error comum em 500', async () => {
        const mock = createMockTransport({
            routes: {
                'POST /login': () => { throw new ApiError('Senha inválida', 401); },
                'GET /boom': () => { throw new Error('explodiu'); },
            },
        });

        const e1 = await mock.request('/login', { method: 'POST' }).catch((e) => e);
        expect(e1).toBeInstanceOf(ApiError);
        expect(e1.status).toBe(401);
        expect(e1.message).toBe('Senha inválida');

        const e2 = await mock.request('/boom').catch((e) => e);
        expect(e2).toBeInstanceOf(ApiError);
        expect(e2.status).toBe(500);
        expect(e2.message).toBe('explodiu');
    });

    it('aplica latência simulada antes de responder', async () => {
        vi.useFakeTimers();
        const mock = createMockTransport({ routes: { 'GET /slow': { ok: true } }, latency: 50 });

        let done = false;
        const p = mock.request('/slow').then((r) => { done = true; return r; });

        await vi.advanceTimersByTimeAsync(49);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await p).toEqual({ ok: true });
    });

    it('addRoute/removeRoute funcionam em tempo de execução', async () => {
        const mock = createMockTransport();
        mock.addRoute('GET', '/versao', { build: '1.0' });
        await expect(mock.request('/versao')).resolves.toEqual({ build: '1.0' });

        mock.removeRoute('GET', '/versao');
        const err = await mock.request('/versao').catch((e) => e);
        expect(err.status).toBe(404);
    });

    it('chave de rota inválida lança erro na criação', () => {
        expect(() => createMockTransport({ routes: { '/sem-metodo': {} } }))
            .toThrow("MÉTODO /caminho");
    });

    it('integra com o ApiService (registerTransport + get)', async () => {
        ApiService.registerTransport('mock-test', createMockTransport({
            routes: { 'GET /ping': { pong: true } },
        }));
        await expect(ApiService.get('/ping', {}, 'mock-test')).resolves.toEqual({ pong: true });
    });
});

// ----------------------------------------------------------- WebSocket

describe('createWebSocketTransport', () => {
    it('faz request/response por id de correlação', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({ url: 'ws://host/ws', WebSocket: FakeWS, reconnect: false });

        const p = t.request('/ping', { method: 'GET' });
        const ws = FakeWS.instances[0];
        expect(ws.url).toBe('ws://host/ws');
        expect(t.getStatus()).toBe('connecting');

        ws.open();
        expect(t.getStatus()).toBe('open');
        expect(ws.sent[0]).toMatchObject({ endpoint: '/ping', method: 'GET' });
        expect(ws.sent[0].id).toBeTruthy();

        ws.emit({ id: ws.sent[0].id, data: { pong: true } });
        await expect(p).resolves.toEqual({ pong: true });
    });

    it('anexa o token na URL e envia params/body no payload', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({
            url: 'ws://host/ws', getToken: () => 'T', WebSocket: FakeWS, reconnect: false,
        });

        const p = t.request('/salvar', { method: 'POST', params: { a: 1 }, body: { x: 2 } });
        const ws = FakeWS.instances[0];
        expect(ws.url).toBe('ws://host/ws?token=T');
        ws.open();
        expect(ws.sent[0]).toMatchObject({ method: 'POST', params: { a: 1 }, body: { x: 2 } });

        ws.emit({ id: ws.sent[0].id, data: null });
        await expect(p).resolves.toBeNull();
    });

    it('erro do servidor vira ApiError com status/data', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({ url: 'ws://host/ws', WebSocket: FakeWS, reconnect: false });

        const p = t.request('/restrito');
        const ws = FakeWS.instances[0];
        ws.open();
        ws.emit({ id: ws.sent[0].id, error: { message: 'Negado', status: 403, data: { campo: 'x' } } });

        const err = await p.catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(403);
        expect(err.message).toBe('Negado');
        expect(err.data).toEqual({ campo: 'x' });
    });

    it('sem resposta no tempo estoura timeout em ApiError', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({
            url: 'ws://host/ws', WebSocket: FakeWS, reconnect: false, timeout: 10,
        });

        const p = t.request('/ping');
        FakeWS.instances[0].open();
        await expect(p).rejects.toThrow('Tempo esgotado');
    });

    it('subscribe recebe push { event, data } e ignora respostas órfãs', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({ url: 'ws://host/ws', WebSocket: FakeWS, reconnect: false });

        const events = [];
        const off = t.subscribe((e) => events.push(e));
        const ws = FakeWS.instances[0]; // subscribe já conecta
        ws.open();

        ws.emit({ event: 'notifica', data: { n: 1 } });
        ws.emit({ id: 'id-que-nao-existe', data: 'lixo' }); // resposta tardia: descarta
        expect(events).toEqual([{ event: 'notifica', data: { n: 1 } }]);

        off();
        ws.emit({ event: 'notifica', data: { n: 2 } });
        expect(events).toHaveLength(1);
    });

    it('close() rejeita pendentes e não reconecta', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({
            url: 'ws://host/ws', WebSocket: FakeWS, reconnect: true, reconnectDelay: 5,
        });

        const p = t.request('/ping');
        FakeWS.instances[0].open();
        t.close();

        await expect(p).rejects.toThrow('Transporte WebSocket fechado');
        expect(t.getStatus()).toBe('closed');
        await sleep(25);
        expect(FakeWS.instances).toHaveLength(1); // sem nova tentativa
    });

    it('reconecta com backoff após queda do servidor', async () => {
        const FakeWS = makeFakeWS();
        const t = createWebSocketTransport({
            url: 'ws://host/ws', WebSocket: FakeWS, reconnect: true,
            reconnectDelay: 5, maxReconnectDelay: 10,
        });

        t.subscribe(() => {});
        const ws1 = FakeWS.instances[0];
        ws1.open();

        ws1.drop(); // queda sem ação do cliente
        await sleep(30);
        expect(FakeWS.instances.length).toBeGreaterThanOrEqual(2);
        expect(t.getStatus()).not.toBe('closed');
    });
});

// ----------------------------------------------------------------- SSE

describe('createSseTransport', () => {
    it('request abre o stream e resolve ao conectar (token/params na query)', async () => {
        const FakeES = makeFakeES();
        const t = createSseTransport({ baseUrl: 'http://host', getToken: () => 'T', EventSource: FakeES });

        const p = t.request('/events', { params: { a: 1 } });
        const es = FakeES.instances[0];
        expect(es.url).toBe('http://host/events?a=1&token=T');

        es.open();
        await expect(p).resolves.toEqual({ endpoint: '/events', connected: true });
    });

    it('subscribe entrega eventos JSON/texto e o último assinante fecha o stream', async () => {
        const FakeES = makeFakeES();
        const t = createSseTransport({
            baseUrl: 'http://host', events: ['notifica'], EventSource: FakeES,
        });

        const got = [];
        const off = t.subscribe('/events', (e) => got.push(e));
        const es = FakeES.instances[0];
        es.open();

        es.fire('message', '{"n":1}');
        es.fire('notifica', 'texto-livre');
        expect(got).toEqual([
            { event: 'message', data: { n: 1 }, lastEventId: '42' },
            { event: 'notifica', data: 'texto-livre', lastEventId: '42' },
        ]);

        // stream já aberto: request resolve direto, sem novo EventSource
        await expect(t.request('/events')).resolves.toEqual({ endpoint: '/events', connected: true });
        expect(FakeES.instances).toHaveLength(1);

        off();
        expect(es.closed).toBe(true);
    });

    it('falha antes de abrir rejeita quem aguardava e derruba o stream órfão', async () => {
        const FakeES = makeFakeES();
        const t = createSseTransport({ baseUrl: 'http://host', EventSource: FakeES });

        const p = t.request('/events');
        const es = FakeES.instances[0];
        es.fail();

        await expect(p).rejects.toThrow('Falha na conexão SSE');
        expect(es.closed).toBe(true);
    });

    it('DELETE fecha o stream e resolve null (como um 204)', async () => {
        const FakeES = makeFakeES();
        const t = createSseTransport({ baseUrl: 'http://host', EventSource: FakeES });

        const off = t.subscribe('/events', () => {});
        const es = FakeES.instances[0];
        es.open();

        await expect(t.request('/events', { method: 'DELETE' })).resolves.toBeNull();
        expect(es.closed).toBe(true);
        off(); // já destruído: não pode quebrar
    });
});

// ----------------------------------------------------------- Socket.IO

describe('createSocketIoTransport', () => {
    it('RPC no modo ack: evento padrão (sem barra), handshake com token e { data }', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io, getToken: () => 'TK' });

        const p = t.request('/chamados', { method: 'get', params: { page: 1 } });
        const s = io.sockets[0];
        expect(s.url).toBe('http://host');
        expect(s.options.auth).toEqual({ token: 'TK' }); // token no handshake
        expect(t.getStatus()).toBe('connecting');

        expect(s.emitted[0].event).toBe('chamados');
        expect(s.emitted[0].payload).toMatchObject({
            endpoint: '/chamados', method: 'GET', params: { page: 1 },
        });
        expect(s.emitted[0].payload.id).toBeTruthy();

        s.connected = true;
        expect(t.getStatus()).toBe('open');
        s.ackLast({ data: [{ id: 1 }] });
        await expect(p).resolves.toEqual([{ id: 1 }]);
    });

    it('erro via ack vira ApiError e dado cru também resolve', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io });

        const p1 = t.request('/restrito');
        io.sockets[0].ackLast({ error: { message: 'Negado', status: 403, data: { campo: 'x' } } });
        const err = await p1.catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(403);
        expect(err.data).toEqual({ campo: 'x' });

        const p2 = t.request('/ping');
        io.sockets[0].ackLast({ id: 7 }); // sem data/error: resolve cru
        await expect(p2).resolves.toEqual({ id: 7 });
    });

    it('event string fixo e event função personalizam o nome do evento', async () => {
        const io1 = makeFakeSocketIo();
        const t1 = createSocketIoTransport({ url: 'http://host', io: io1, event: 'rpc' });
        const p1 = t1.request('/chamados');
        expect(io1.sockets[0].emitted[0].event).toBe('rpc');
        io1.sockets[0].ackLast({ data: null });
        await expect(p1).resolves.toBeNull();

        const io2 = makeFakeSocketIo();
        const t2 = createSocketIoTransport({
            url: 'http://host', io: io2,
            event: (endpoint, options) => `${options.method}:${endpoint}`,
        });
        const p2 = t2.request('/chamados', { method: 'POST' });
        expect(io2.sockets[0].emitted[0].event).toBe('POST:/chamados');
        io2.sockets[0].ackLast({ data: 'ok' });
        await expect(p2).resolves.toBe('ok');
    });

    it('sem resposta no tempo estoura timeout em ApiError', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io, timeout: 10 });

        await expect(t.request('/ping')).rejects.toThrow('Tempo esgotado');
    });

    it('modo replyEvent: correlação por id (resposta certa resolve, id errado ignora)', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io, replyEvent: 'rpc-reply' });

        const p = t.request('/chamados');
        const s = io.sockets[0];
        expect(s.emitted[0].event).toBe('chamados');

        s.fire('rpc-reply', { id: 'outro', data: 'lixo' }); // id alheio: descarta
        s.fire('rpc-reply', { id: s.emitted[0].payload.id, data: [1] });
        await expect(p).resolves.toEqual([1]);

        const p2 = t.request('/salvar', { method: 'POST', body: { x: 1 } });
        s.fire('rpc-reply', {
            id: s.emitted[1].payload.id,
            error: { message: 'Falhou', status: 500 },
        });
        const err = await p2.catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(500);
    });

    it('push via cfg.events/subscribe e unsubscribe', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io, events: ['notifica'] });

        const got = [];
        const off = t.subscribe((e) => got.push(e));
        const s = io.sockets[0]; // subscribe cria o socket
        s.fire('notifica', { n: 1 });
        expect(got).toEqual([{ event: 'notifica', data: { n: 1 } }]);

        off();
        s.fire('notifica', { n: 2 });
        expect(got).toHaveLength(1);
    });

    it('close() rejeita pendentes, desconecta e bloqueia novos pedidos', async () => {
        const io = makeFakeSocketIo();
        const t = createSocketIoTransport({ url: 'http://host', io });

        const p = t.request('/ping');
        const s = io.sockets[0];
        t.close();

        await expect(p).rejects.toThrow('Transporte Socket.IO fechado');
        expect(s.disconnected).toBe(true);
        expect(t.getStatus()).toBe('closed');
        await expect(t.request('/outro')).rejects.toThrow('Transporte Socket.IO fechado');
    });

    it('aceita um socket já criado (cfg.socket) sem tocar na fábrica io', async () => {
        const io = makeFakeSocketIo();
        const externo = io('http://host', {});
        const t = createSocketIoTransport({ socket: externo });

        const p = t.request('/ping');
        expect(externo.emitted[0].event).toBe('ping');
        expect(io.sockets).toHaveLength(1); // nada novo criado

        externo.ackLast({ data: 'ok' });
        await expect(p).resolves.toBe('ok');
        expect(t.getSocket()).toBe(externo);
    });
});
