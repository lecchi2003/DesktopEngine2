// api-transports.js
// Transportes prontos ("meio caminho andado") para o ApiService — mesmos
// princípios dos auth-providers.js: o desenvolvedor só registra com a
// URL/endpoints da aplicação e o fluxo (conexão, correlação de mensagens,
// reconexão, simulação de rede) já vem resolvido.
//
//   ApiService.registerTransport('ws',   createWebSocketTransport({ url: 'ws://host/ws' }));
//   ApiService.registerTransport('sio',  createSocketIoTransport({ url: 'http://host', getToken }));
//   ApiService.registerTransport('sse',  createSseTransport({ baseUrl: 'http://host', events: ['notifica'] }));
//   ApiService.registerTransport('mock', createMockTransport({ routes: { 'GET /ping': { pong: true } } }));
//
// O createHttpTransport continua em api-service.js (é o transporte padrão
// da maioria das aplicações). Todos os transportes aqui cumprem o contrato
// { request(endpoint, options) => Promise } exigido pelo registerTransport.

import { ApiError } from './api-service.js';

// ---------------------------------------------------------------- helpers

/** Monta a URL: endpoint absoluto passa direto; senão baseUrl + endpoint. */
function joinUrl(baseUrl, endpoint) {
    return /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl || ''}${endpoint}`;
}

/** Anexa query params (ignora undefined/null/'') preservando query/hash existentes. */
function appendQuery(url, params) {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!entries.length) return url;
    const [base, hash = ''] = String(url).split('#');
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${new URLSearchParams(entries)}${hash ? `#${hash}` : ''}`;
}

/** Caminho normalizado de um endpoint: remove origem, query e barra final. */
function normalizePath(endpoint) {
    let path = String(endpoint || '/');
    if (/^https?:\/\//i.test(path)) {
        try { path = new URL(path).pathname; } catch { /* mantém como está */ }
    } else {
        path = path.split('?')[0].split('#')[0];
    }
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
}

/** Espera em ms (latência simulada). */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------- Mock (memória)

/**
 * Cria um transporte mock: responde das rotas em memória — ideal para
 * demonstrações, testes e desenvolvimento sem backend.
 *
 * Contrato das rotas:
 * - chave `'MÉTODO /caminho'` (ex: `'GET /usuarios'`, `'POST /chamados'`);
 * - `:param` no caminho vira parâmetro (ex: `'GET /usuarios/:id'` → params.id);
 * - valor = dado estático OU função `(params, body, options) => data` (async ok);
 * - erro = `throw new ApiError('msg', 404)` (qualquer Error vira ApiError 500);
 * - rota ausente → ApiError 404, a menos que `fallback` seja informado.
 *
 * @param {Object} [cfg]
 * @param {Object} [cfg.routes] - { 'GET /ping': { pong: true }, ... }
 * @param {number|Function} [cfg.latency=0] - ms fixos ou (method, path) => ms
 * @param {Function} [cfg.fallback] - (method, path, options) => data chamado no 404
 * @returns {Object} Transporte { request, addRoute, removeRoute }
 */
export function createMockTransport({ routes = {}, latency = 0, fallback = null } = {}) {
    const exact = new Map();      // 'GET /ping' -> handler
    const paramRoutes = [];       // { method, pattern, names, handler, key }

    function addRoute(method, path, handler) {
        const m = String(method || 'GET').toUpperCase();
        const p = normalizePath(path);
        const key = `${m} ${p}`;
        removeRoute(m, p);
        if (p.includes(':')) {
            const names = [];
            const pattern = new RegExp(`^${p.split('/').map((seg) => {
                if (seg.startsWith(':')) {
                    names.push(seg.slice(1));
                    return '([^/]+)';
                }
                return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('/')}$`);
            paramRoutes.push({ method: m, pattern, names, handler, key });
        } else {
            exact.set(key, handler);
        }
    }

    function removeRoute(method, path) {
        const m = String(method || 'GET').toUpperCase();
        const p = normalizePath(path);
        exact.delete(`${m} ${p}`);
        const i = paramRoutes.findIndex((r) => r.key === `${m} ${p}`);
        if (i >= 0) paramRoutes.splice(i, 1);
    }

    // Registra as rotas iniciais
    for (const [key, handler] of Object.entries(routes)) {
        const sep = key.indexOf(' ');
        if (sep <= 0) {
            throw new Error(`Mock: rota '${key}' deve ser 'MÉTODO /caminho' (ex: 'GET /usuarios')`);
        }
        addRoute(key.slice(0, sep), key.slice(sep + 1), handler);
    }

    async function request(endpoint, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const path = normalizePath(endpoint);
        const exactKey = `${method} ${path}`;

        let handler;
        let found = exact.has(exactKey);
        let pathParams = {};

        if (!found) {
            for (const r of paramRoutes) {
                if (r.method !== method) continue;
                const m = path.match(r.pattern);
                if (m) {
                    found = true;
                    handler = r.handler;
                    r.names.forEach((n, i) => { pathParams[n] = decodeURIComponent(m[i + 1]); });
                    break;
                }
            }
        } else {
            handler = exact.get(exactKey);
        }

        const ms = typeof latency === 'function' ? latency(method, path) : latency;
        if (ms > 0) await sleep(ms);

        const params = { ...pathParams, ...(options.params || {}) };
        try {
            if (!found) {
                if (typeof fallback === 'function') {
                    return await fallback(method, path, options);
                }
                throw new ApiError(`Rota não encontrada no mock: ${method} ${path}`, 404, { method, path });
            }
            return typeof handler === 'function'
                ? await handler(params, options.body, options)
                : handler;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError(error?.message || `Erro no mock: ${method} ${path}`, 500, null);
        }
    }

    return {
        request,
        /** Registra (ou substitui) uma rota em tempo de execução. */
        addRoute,
        /** Remove uma rota. */
        removeRoute,
    };
}

// ------------------------------------------------------- WebSocket (request/push)

/**
 * Cria um transporte WebSocket com request/response por id de correlação.
 *
 * Contrato de fio (JSON):
 *   → { id, endpoint, method, params?, body? }
 *   ← { id, data }                     sucesso (data null = sem conteúdo)
 *   ← { id, error: { message, status?, data? } }   falha → ApiError
 *   ← { event, data }                  push do servidor → subscribe()
 *
 * Fila antes do open, timeout em ApiError, reconexão automática com backoff
 * exponencial e rejeição dos pendentes quando o socket cai.
 *
 * @param {Object} cfg
 * @param {string|Function} cfg.url - URL ws(s):// (ou função que devolve a URL)
 * @param {Function|string|null} [cfg.getToken] - Token anexado como ?token=
 * @param {string} [cfg.tokenParam='token'] - Nome do parâmetro do token
 * @param {string|string[]} [cfg.protocols] - Subprotocolos WebSocket
 * @param {number} [cfg.timeout=10000] - Timeout da resposta (ms)
 * @param {boolean} [cfg.reconnect=true] - Reconexão automática após queda
 * @param {number} [cfg.reconnectDelay=1000] - Delay base da reconexão (ms)
 * @param {number} [cfg.maxReconnectDelay=30000] - Teto do backoff (ms)
 * @param {Function} [cfg.WebSocket] - Classe WebSocket alternativa (testes)
 * @returns {Object} Transporte { request, subscribe, close, getStatus }
 */
export function createWebSocketTransport({
    url,
    getToken = null,
    tokenParam = 'token',
    protocols = null,
    timeout = 10000,
    reconnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    WebSocket: WS = null,
} = {}) {
    if (!url) {
        throw new Error('WebSocket: url é obrigatória');
    }
    const WSClass = WS || globalThis.WebSocket;
    if (!WSClass) {
        throw new Error('WebSocket: classe WebSocket indisponível neste ambiente (informe cfg.WebSocket)');
    }

    let ws = null;               // socket atual
    let closedByUser = false;    // close() explícito (sem reconectar)
    let seq = 0;                 // sequência de ids
    let attempt = 0;             // tentativas de reconexão consecutivas
    let reconnectTimer = null;
    const pending = new Map();   // id -> { resolve, reject, timer, endpoint }
    const queue = [];            // mensagens aguardando o open
    const subs = new Set();      // handlers de push (event, data)

    const buildUrl = () => {
        const base = typeof url === 'function' ? url() : url;
        const token = typeof getToken === 'function' ? getToken() : getToken;
        return token ? appendQuery(base, { [tokenParam]: token }) : base;
    };

    /** Rejeita todos os pendentes com o mesmo motivo. */
    function rejectPending(reason) {
        for (const [, p] of pending) {
            clearTimeout(p.timer);
            p.reject(new ApiError(reason, 0, null));
        }
        pending.clear();
    }

    /** Despacha uma mensagem recebida: resposta (id) ou push (event). */
    function dispatch(raw) {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; } // contrato = JSON

        if (msg && msg.id != null) {
            const p = pending.get(String(msg.id));
            if (!p) return; // resposta atrasada de uma requisição já expirada
            pending.delete(String(msg.id));
            clearTimeout(p.timer);
            if (msg.error) {
                const e = msg.error;
                p.reject(new ApiError(e.message || 'Erro reportado pelo WebSocket', e.status ?? 0, e.data ?? null));
            } else {
                p.resolve(Object.prototype.hasOwnProperty.call(msg, 'data') ? msg.data : null);
            }
            return;
        }

        // Push do servidor (sem id de requisição)
        const evt = {
            event: (msg && msg.event) || 'message',
            data: msg && Object.prototype.hasOwnProperty.call(msg, 'data') ? msg.data : msg,
        };
        for (const fn of [...subs]) {
            try { fn(evt); } catch { /* um handler não derruba o fluxo */ }
        }
    }

    /** Abre o socket se ainda não houver um. */
    function connect() {
        if (closedByUser || ws) return;
        const socket = new WSClass(buildUrl(), protocols || undefined);
        ws = socket;

        socket.onopen = () => {
            attempt = 0;
            while (queue.length) socket.send(JSON.stringify(queue.shift()));
        };
        socket.onmessage = (ev) => dispatch(ev && typeof ev === 'object' && 'data' in ev ? ev.data : ev);
        socket.onclose = () => {
            if (ws === socket) ws = null;
            rejectPending('Conexão WebSocket encerrada');
            if (!closedByUser && reconnect) {
                const delay = Math.min(reconnectDelay * 2 ** attempt, maxReconnectDelay);
                attempt += 1;
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connect, delay);
            }
        };
        socket.onerror = () => { /* o onclose do browser vem em seguida */ };
    }

    /** Envia já estiver aberto; caso contrário entra na fila do open. */
    function send(payload) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
        else queue.push(payload);
    }

    function request(endpoint, options = {}) {
        if (closedByUser) {
            return Promise.reject(new ApiError('Transporte WebSocket fechado', 0, null));
        }
        const id = `${Date.now().toString(36)}-${++seq}`;
        const payload = { id, endpoint, method: String(options.method || 'GET').toUpperCase() };
        if (options.params) payload.params = options.params;
        if (options.body !== undefined) payload.body = options.body;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new ApiError(`Tempo esgotado aguardando o WebSocket: ${endpoint}`, 0, null));
            }, timeout);
            pending.set(id, { resolve, reject, timer, endpoint });
            connect();
            send(payload);
        });
    }

    /**
     * Assina os pushes do servidor. Retorna a função de unsubscribe.
     * Abre o socket se ainda não houver um.
     */
    function subscribe(handler) {
        if (typeof handler !== 'function') return () => {};
        subs.add(handler);
        connect();
        return () => subs.delete(handler);
    }

    /** Fecha o socket, cancela reconexão e rejeita os pendentes. */
    function close() {
        closedByUser = true;
        clearTimeout(reconnectTimer);
        rejectPending('Transporte WebSocket fechado');
        queue.length = 0;
        if (ws) {
            try { ws.close(); } catch { /* já fechado */ }
            ws = null;
        }
    }

    function getStatus() {
        if (closedByUser) return 'closed';
        if (!ws) return 'idle';
        return ws.readyState === 1 ? 'open' : 'connecting';
    }

    return { request, subscribe, close, getStatus };
}

// ----------------------------------------------------------- SSE (EventSource)

/**
 * Cria um transporte SSE (Server-Sent Events) — fluxo servidor→cliente.
 *
 * O SSE não tem resposta única, então:
 * - `request(endpoint)` abre o stream e resolve quando conecta
 *   ({ connected: true }); com `method: 'DELETE'` fecha e resolve null;
 * - `subscribe(endpoint, handler)` é a API principal: entrega cada evento
 *   como `{ event, data, lastEventId }` e devolve a função de unsubscribe
 *   (o stream fecha quando o último assinante sai);
 * - token e params vão na query string (EventSource não aceita headers);
 * - eventos `'message'` sempre + os nomes em `cfg.events`/`options.events`;
 * - `data` é JSON quando possível, senão o texto puro.
 *
 * @param {Object} [cfg]
 * @param {string} [cfg.baseUrl=''] - Prefixo das URLs (ex: 'http://host:3001')
 * @param {Function|string|null} [cfg.getToken] - Token anexado como ?token=
 * @param {string} [cfg.tokenParam='token'] - Nome do parâmetro do token
 * @param {string[]} [cfg.events=[]] - Eventos nomeados além de 'message'
 * @param {boolean} [cfg.withCredentials=false] - withCredentials do EventSource
 * @param {Function} [cfg.EventSource] - Classe EventSource alternativa (testes)
 * @returns {Object} Transporte { request, subscribe, close }
 */
export function createSseTransport({
    baseUrl = '',
    getToken = null,
    tokenParam = 'token',
    events = [],
    withCredentials = false,
    EventSource: ES = null,
} = {}) {
    const ESClass = ES || globalThis.EventSource;
    const streams = new Map(); // url -> entry

    function urlFor(endpoint, options = {}) {
        const withQuery = appendQuery(joinUrl(baseUrl, endpoint), options.params);
        const token = typeof getToken === 'function' ? getToken() : getToken;
        return token ? appendQuery(withQuery, { [tokenParam]: token }) : withQuery;
    }

    function destroy(entry) {
        if (entry.gone) return;
        entry.gone = true;
        try { entry.es.close(); } catch { /* já fechado */ }
        if (streams.get(entry.url) === entry) streams.delete(entry.url);
    }

    /** Registra eventos nomeados adicionais (sem duplicar 'message'). */
    function registerNamed(entry, extra) {
        for (const name of extra || []) {
            if (entry.named.has(name)) continue;
            entry.named.add(name);
            if (name !== 'message') entry.es.addEventListener(name, entry.onNamed(name));
        }
    }

    function ensureStream(endpoint, options = {}) {
        const url = urlFor(endpoint, options);
        const existing = streams.get(url);
        if (existing) {
            registerNamed(existing, options.events);
            return existing;
        }
        if (!ESClass) {
            throw new ApiError('SSE: EventSource indisponível neste ambiente (informe cfg.EventSource)', 0, null);
        }

        const entry = {
            url,
            es: null,
            opened: false,
            gone: false,
            handlers: new Set(),
            named: new Set(), // apenas eventos COM listener registrado
            waiters: new Set(), // { resolve, reject, value } de request() pendente
            onNamed: null,
        };

        entry.onNamed = (name) => (ev) => {
            const raw = ev?.data;
            let data = raw;
            try { data = JSON.parse(raw); } catch { /* texto puro */ }
            const payload = { event: name, data };
            if (ev?.lastEventId != null) payload.lastEventId = ev.lastEventId;
            for (const fn of [...entry.handlers]) {
                try { fn(payload); } catch { /* um handler não derruba o fluxo */ }
            }
        };

        const es = new ESClass(url, withCredentials ? { withCredentials: true } : undefined);
        entry.es = es;

        es.addEventListener('open', () => {
            entry.opened = true;
            for (const w of [...entry.waiters]) {
                entry.waiters.delete(w);
                w.resolve(w.value);
            }
            // request() sem assinante: não manter um stream órfão aberto
            if (entry.handlers.size === 0) destroy(entry);
        });

        es.addEventListener('error', () => {
            if (entry.gone) return;
            if (!entry.opened) {
                // Primeira conexão falhou: aborta quem aguardava e, sem
                // assinantes, derruba o stream (sem retries órfãos).
                for (const w of [...entry.waiters]) {
                    entry.waiters.delete(w);
                    w.reject(new ApiError(`Falha na conexão SSE: ${url}`, 0, null));
                }
                if (entry.handlers.size === 0) destroy(entry);
            }
            // Já aberto: o próprio EventSource reconecta (readyState CONNECTING)
        });

        es.addEventListener('message', entry.onNamed('message'));
        registerNamed(entry, events); // eventos nomeados de cfg.events

        streams.set(url, entry);
        return entry;
    }

    function request(endpoint, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();

        if (method === 'DELETE') {
            // DELETE fecha o stream do endpoint (resolve null, como um 204)
            const entry = streams.get(urlFor(endpoint, options));
            if (entry) destroy(entry);
            return Promise.resolve(null);
        }
        if (!ESClass) {
            return Promise.reject(new ApiError('SSE: EventSource indisponível neste ambiente (informe cfg.EventSource)', 0, null));
        }

        const entry = ensureStream(endpoint, options);
        if (entry.opened) return Promise.resolve({ endpoint, connected: true });
        return new Promise((resolve, reject) => {
            entry.waiters.add({ resolve, reject, value: { endpoint, connected: true } });
        });
    }

    /**
     * Assina os eventos do stream. Retorna a função de unsubscribe
     * (fecha o stream quando o último assinante sai).
     */
    function subscribe(endpoint, handler, options = {}) {
        if (typeof handler !== 'function') return () => {};
        const entry = ensureStream(endpoint, options);
        entry.handlers.add(handler);
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            entry.handlers.delete(handler);
            if (entry.handlers.size === 0 && entry.waiters.size === 0) destroy(entry);
        };
    }

    /** Fecha todos os streams. */
    function close() {
        for (const entry of [...streams.values()]) destroy(entry);
    }

    return { request, subscribe, close };
}

// --------------------------------------------------- Socket.IO (ack / NestJS)

/**
 * Cria um transporte Socket.IO — o adaptador padrão do NestJS. Não depende
 * do pacote `socket.io-client`: injete a fábrica `io` (o import ou o bundle
 * que o próprio servidor serve em `/socket.io/socket.io.js` → `window.io`)
 * ou um socket já criado (`cfg.socket`).
 *
 * Contrato de fio (o ack correlaciona; no modo replyEvent o `id` do payload):
 *   → emit(event, { id, endpoint, method, params?, body? })
 *   ← ack({ data }) | ack({ error: { message, status?, data? } })   modo ack (default)
 *   ← emit(replyEvent, { id, data } | { id, error })                modo replyEvent
 *   ← on(cfg.events, data)                                          push → subscribe()
 *
 * Também é aceita a resposta "crua" (sem as chaves data/error) — resolve
 * como está. Reconexão e buffer de envios são internos do Socket.IO; o token
 * vai no handshake (`options.auth`) via getToken.
 *
 * @param {Object} [cfg]
 * @param {string} [cfg.url] - URL do servidor (ex: 'http://host:3001') — omita se informar socket
 * @param {Function} [cfg.io] - Fábrica io(...) — default: globalThis.io
 * @param {Object} [cfg.socket] - Socket já criado (substitui url/io)
 * @param {Object} [cfg.options] - Opções do Socket.IO (path, transports, extraHeaders...)
 * @param {Function|string|null} [cfg.getToken] - Token do handshake (options.auth.token)
 * @param {Object} [cfg.auth] - auth extra do handshake (mesclado com o token)
 * @param {string|Function} [cfg.event] - Nome do evento RPC: string fixa ou
 *   (endpoint, options) => nome. Default: endpoint sem a barra inicial ('/chamados' → 'chamados')
 * @param {string} [cfg.replyEvent] - Modo replyEvent: nome do evento de resposta
 *   (a partir daí o servidor responde emitindo { id, data } em vez de ack)
 * @param {string[]} [cfg.events=[]] - Eventos de push repassados ao subscribe()
 * @param {number} [cfg.timeout=10000] - Timeout do ack/resposta (ms)
 * @returns {Object} Transporte { request, subscribe, close, getStatus, getSocket }
 */
export function createSocketIoTransport({
    url = null,
    io = null,
    socket = null,
    options = {},
    getToken = null,
    auth = null,
    event = null,
    replyEvent = null,
    events = [],
    timeout = 10000,
} = {}) {
    let sock = socket || null;
    let closedByUser = false;
    let seq = 0;
    const pending = new Map(); // id -> { settled, timer, respond, abort, resolve, reject }
    const subs = new Set();

    /** Nome do evento RPC: cfg.event (fn/string) ou o endpoint sem barra/query. */
    const nameFor = (endpoint, opts) => {
        if (typeof event === 'function') return event(endpoint, opts);
        if (event) return event;
        return String(endpoint || '').split('?')[0].replace(/^\//, '');
    };

    /** Interpreta a resposta: { error } → ApiError, { data } → data, resto cru. */
    function parseResponse(response) {
        if (response && typeof response === 'object' && response.error) {
            const e = response.error;
            throw new ApiError(e.message || 'Erro reportado pelo Socket.IO', e.status ?? 0, e.data ?? null);
        }
        if (response && typeof response === 'object' && 'data' in response) return response.data;
        return response;
    }

    function makeEntry(id, endpoint) {
        const entry = {
            settled: false,
            timer: null,
            resolve: null,
            reject: null,
            /** Responde (ack ou replyEvent) e limpa o pendente. */
            respond(response) {
                if (entry.settled) return;
                entry.settled = true;
                clearTimeout(entry.timer);
                pending.delete(id);
                try { entry.resolve(parseResponse(response)); }
                catch (error) { entry.reject(error); }
            },
            /** Aborta (close/timeout) e limpa o pendente. */
            abort(error) {
                if (entry.settled) return;
                entry.settled = true;
                clearTimeout(entry.timer);
                pending.delete(id);
                entry.reject(error);
            },
        };
        entry.timer = setTimeout(
            () => entry.abort(new ApiError(`Tempo esgotado aguardando o Socket.IO: ${endpoint}`, 0, null)),
            timeout
        );
        return entry;
    }

    /** Anexa os listeners (pushes de cfg.events + evento de resposta). */
    function attach(s) {
        for (const name of events) {
            s.on(name, (data) => {
                const evt = { event: name, data };
                for (const fn of [...subs]) {
                    try { fn(evt); } catch { /* um handler não derruba o fluxo */ }
                }
            });
        }
        if (replyEvent) {
            s.on(replyEvent, (msg) => {
                if (!msg || msg.id == null) return;
                const entry = pending.get(String(msg.id));
                if (entry) entry.respond(msg);
            });
        }
    }
    if (sock) attach(sock);

    function ensureSocket() {
        if (sock) return sock;
        const factory = io || globalThis.io;
        if (!factory) {
            throw new ApiError(
                "Socket.IO: informe cfg.io (import de 'socket.io-client' ou carregue /socket.io/socket.io.js do servidor)",
                0, null
            );
        }
        if (!url) throw new ApiError('Socket.IO: url é obrigatória (ou informe cfg.socket)', 0, null);
        const opts = { ...options };
        const token = typeof getToken === 'function' ? getToken() : getToken;
        if (token) opts.auth = { ...(opts.auth || {}), ...(auth || {}), token };
        else if (auth) opts.auth = { ...(opts.auth || {}), ...auth };
        sock = factory(url, opts);
        attach(sock);
        return sock;
    }

    function request(endpoint, options = {}) {
        if (closedByUser) {
            return Promise.reject(new ApiError('Transporte Socket.IO fechado', 0, null));
        }
        let s;
        try { s = ensureSocket(); } catch (error) { return Promise.reject(error); }

        const id = `${Date.now().toString(36)}-${++seq}`;
        const payload = { id, endpoint, method: String(options.method || 'GET').toUpperCase() };
        if (options.params) payload.params = options.params;
        if (options.body !== undefined) payload.body = options.body;

        return new Promise((resolve, reject) => {
            const entry = makeEntry(id, endpoint);
            entry.resolve = resolve;
            entry.reject = reject;
            pending.set(id, entry);

            const eventName = nameFor(endpoint, options);
            if (replyEvent) s.emit(eventName, payload);
            else s.emit(eventName, payload, (response) => entry.respond(response));
        });
    }

    /**
     * Assina os pushes de cfg.events. Retorna a função de unsubscribe.
     * Cria (e conecta) o socket na primeira assinatura.
     */
    function subscribe(handler) {
        if (typeof handler !== 'function') return () => {};
        subs.add(handler);
        ensureSocket();
        return () => subs.delete(handler);
    }

    /** Desconecta o socket e rejeita todos os pendentes. */
    function close() {
        closedByUser = true;
        for (const entry of [...pending.values()]) {
            entry.abort(new ApiError('Transporte Socket.IO fechado', 0, null));
        }
        pending.clear();
        if (sock && typeof sock.disconnect === 'function') {
            try { sock.disconnect(); } catch { /* já desconectado */ }
        }
    }

    function getStatus() {
        if (closedByUser) return 'closed';
        if (!sock) return 'idle';
        return sock.connected ? 'open' : 'connecting';
    }

    /** Retorna o socket (cria se ainda não existir) para uso avançado. */
    function getSocket() {
        return ensureSocket();
    }

    return { request, subscribe, close, getStatus, getSocket };
}
