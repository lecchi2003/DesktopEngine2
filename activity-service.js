// activity-service.js
// ActivityService — fila de atividades assíncronas com acompanhamento e
// exibição configurável. Genérico: a aplicação informa como iniciar
// (`run` ou `request`), como acompanhar (`watch` por poll ou push) e onde
// exibir o resultado (`target`: dock, janela, modal, toast ou função).
// Persiste em localStorage e retoma o acompanhamento após reload, desde
// que a spec esteja registrada (`registerSpec`) — funções não serializam.

import { EventBus } from './core.js';
import { ApiService } from './api-service.js';
import { Desktop } from './desktop.js';
import { DockWidget } from './ui/navigation.js';
import { createElement } from './ui/core-dom.js';
import { Badge, ProgressBar, Spinner } from './ui/feedback.js';

const STORAGE_VERSION = 1;

const TARGETS = ['dock', 'window', 'modal', 'toast', 'none'];
const TRACKS = ['dock', 'none'];
const MODES = ['auto', 'poll', 'push'];

// ------------------------------------------------------------- configuração

const DEFAULTS = {
    maxConcurrent: 3,
    interval: 3000,          // intervalo padrão do poll (ms)
    maxAttempts: 100,        // tentativas padrão do poll
    persist: true,
    storageKey: 'desktop_engine_activities',
    historyLimit: 50,        // teto de atividades terminais guardadas
    notifyOnError: true,     // toast de erro nas falhas
    dockContainer: null,      // true|{...opts} = o serviço cria a Central sozinho (lazy)
    dock: {
        title: 'Atividades',
        icon: '⚡',
        position: 'bottom-right',
        width: 320,
        height: 320,
        expanded: true,
    },
};

// ------------------------------------------------------------------ estado

let _config = structuredClone(DEFAULTS);
const _activities = new Map(); // id -> atividade
let _queue = [];               // ids aguardando slot (FIFO)
const _running = new Set();    // ids com slot alocado
const _specs = new Map();      // name -> template registrado
const _docks = new Map();      // dockId -> { api, owned, items: [ids] }
let _dockContainer = null;     // DockContainer ativo (da app ou criado pelo serviço)
let _containerOwned = false;   // true = o serviço criou (gerencia o ciclo de vida)
let _initialized = false;
let _seq = 0;

const _now = () => Date.now();
const _uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${++_seq}`;

/** Emite o evento granular + `activity:changed` (só local: sem allowlist inter-abas). */
function _emit(event, act) {
    EventBus.emitLocal(event, act);
    if (event !== 'activity:changed') EventBus.emitLocal('activity:changed', act);
}

function _errMessage(err) {
    if (!err) return 'Erro desconhecido';
    if (typeof err === 'string') return err;
    return err.message || String(err);
}

// ------------------------------------------------------------------ specs

/**
 * Mescla o template registrado (`name`) com a spec do `enqueue`.
 * request/watch são substituídos por inteiro; targetOptions é mesclado.
 */
function _buildSpec(name, input) {
    const tpl = name ? (_specs.get(name) || null) : null;
    const spec = { ...(tpl || {}), ...(input || {}) };
    if (tpl?.targetOptions || input?.targetOptions) {
        spec.targetOptions = { ...(tpl?.targetOptions || {}), ...(input?.targetOptions || {}) };
    }
    return spec;
}

function _validateSpec(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new Error('[ActivityService] spec inválida: informe um objeto');
    }
    if (!spec.run && !spec.request && !spec.watch) {
        throw new Error('[ActivityService] spec inválida: informe `run`, `request` ou `watch`');
    }
    if (spec.request && !spec.request.endpoint) {
        throw new Error('[ActivityService] `request` exige `endpoint`');
    }
    const track = spec.track ?? 'dock';
    if (!TRACKS.includes(track)) {
        throw new Error(`[ActivityService] \`track\` inválido: use ${TRACKS.join('|')}`);
    }
    const target = spec.target ?? 'toast';
    if (typeof target !== 'function' && !TARGETS.includes(target)) {
        throw new Error(`[ActivityService] \`target\` inválido: use ${TARGETS.join('|')} ou função`);
    }
    if (target === 'window' && !(typeof spec.targetOptions?.screen === 'string' && spec.targetOptions.screen)) {
        throw new Error('[ActivityService] `target: "window"` exige `targetOptions.screen`');
    }
    if (spec.watch) {
        const mode = spec.watch.mode ?? 'auto';
        if (!MODES.includes(mode)) {
            throw new Error(`[ActivityService] \`watch.mode\` inválido: use ${MODES.join('|')}`);
        }
        if (mode === 'poll' && !spec.watch.endpoint) {
            throw new Error('[ActivityService] `watch.mode: "poll"` exige `watch.endpoint`');
        }
    }
}

// ------------------------------------------------------------------ fila

function _enqueueActivity(act) {
    act.status = 'queued';
    act.updatedAt = _now();
    _activities.set(act.id, act);
    _queue.push(act.id);
    _emit('activity:queued', act);
    _save();
    _syncDock(act);
}

function _pump() {
    while (_running.size < _config.maxConcurrent && _queue.length) {
        const id = _queue.shift();
        const act = _activities.get(id);
        if (!act || act.status !== 'queued') continue; // cancelada/removida na fila
        _start(act);
    }
}

function _start(act) {
    if (act.status !== 'queued') return;
    act.status = 'running';
    act.attempt = (act.attempt || 0) + 1;
    act.updatedAt = _now();
    _running.add(act.id);
    _emit('activity:started', act);
    _save();
    _syncDock(act);
    _run(act); // async sem await: o slot fica retido até o término
}

function _resolveEndpoint(endpoint, act) {
    if (typeof endpoint === 'function') return endpoint(act.jobId, act);
    if (typeof endpoint === 'string' && act.jobId != null) {
        return endpoint.replace(':id', String(act.jobId));
    }
    return endpoint;
}

async function _run(act) {
    const spec = act.spec;
    try {
        if (typeof spec.run === 'function') {
            const result = await spec.run(act);
            if (act.status !== 'running') return; // cancelada no meio
            _done(act, result);
            return;
        }
        if (spec.request && act.jobId == null) {
            const req = spec.request;
            const res = await ApiService.request(
                _resolveEndpoint(req.endpoint, act),
                {
                    method: req.method || 'POST',
                    ...(req.params !== undefined ? { params: req.params } : {}),
                    ...(req.body !== undefined ? { body: typeof req.body === 'function' ? req.body(act) : req.body } : {}),
                },
                req.transport || null
            );
            if (act.status !== 'running') return;
            act.jobId = typeof spec.getJobId === 'function'
                ? spec.getJobId(res, act)
                : (res?.id ?? res?.jobId ?? res?.taskId ?? null);
            if (!spec.watch) {
                _done(act, res); // request avulsa: a resposta é o resultado
                return;
            }
        }
        if (spec.watch) {
            _watch(act);
            return;
        }
        _done(act, null);
    } catch (err) {
        if (act.status !== 'running') return;
        _fail(act, err);
    }
}

// ------------------------------------------------------------------ watch

function _transportName(...names) {
    for (const n of names) {
        if (typeof n === 'string' && n) return n;
    }
    return ApiService.getDefaultTransport();
}

/** push é possível quando o transporte tem subscribe(); arity>=2 = estilo SSE (endpoint, handler). */
function _canPush(transportName, watch, act) {
    const t = ApiService.getTransport(transportName);
    if (!t || typeof t.subscribe !== 'function') return false;
    if (t.subscribe.length >= 2 && !_resolveEndpoint(watch.endpoint, act)) return false;
    return true;
}

function _isDone(res, watch) {
    if (typeof watch.isDone === 'function') return !!watch.isDone(res);
    if (res?.done === true) return true;
    const s = String(res?.status ?? '').toLowerCase();
    return ['done', 'completed', 'concluido', 'concluído', 'concluida', 'concluída', 'success', 'finished', 'ready', 'pronto'].includes(s);
}

function _isFailed(res, watch) {
    if (typeof watch.isFailed === 'function') return !!watch.isFailed(res);
    const s = String(res?.status ?? '').toLowerCase();
    return ['failed', 'fail', 'error', 'erro', 'cancelled', 'canceled', 'cancelado', 'abort', 'aborted'].includes(s)
        || res?.success === false;
}

function _extract(res, watch) {
    if (typeof watch.extract === 'function') return watch.extract(res);
    if (res && typeof res === 'object' && 'data' in res) return res.data;
    return res;
}

function _progressOf(res, watch) {
    if (typeof watch.progress === 'function') return watch.progress(res);
    const p = res?.progress ?? res?.percent ?? null;
    return typeof p === 'number' && Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : null;
}

/** Mensagem de status: hook `watch.message` ou o campo `message` da resposta. */
function _messageOf(res, watch, act) {
    if (typeof watch.message === 'function') {
        try {
            const m = watch.message(res, act);
            return m != null ? m : null;
        } catch { return null; }
    }
    const m = res?.message ?? null;
    return typeof m === 'string' && m ? m : null;
}

function _resultError(res, watch) {
    if (typeof watch.error === 'function') {
        try { return watch.error(res) || 'Falha reportada pelo servidor'; } catch { /* usa o padrão */ }
    }
    return res?.message || res?.error || 'Falha reportada pelo servidor';
}

function _watch(act) {
    const watch = act.spec.watch;
    const mode = watch.mode ?? 'auto';
    const transportName = _transportName(watch.transport, act.spec.request?.transport);
    if (mode === 'push') {
        if (!_canPush(transportName, watch, act)) {
            _fail(act, new Error('[ActivityService] transporte sem `subscribe()` para watch push'));
            return;
        }
        _watchPush(act, transportName, watch);
        return;
    }
    if (mode === 'auto' && _canPush(transportName, watch, act)) {
        _watchPush(act, transportName, watch);
        return;
    }
    _watchPoll(act, transportName, watch);
}

async function _watchPoll(act, transportName, watch) {
    const endpoint = _resolveEndpoint(watch.endpoint, act);
    if (!endpoint) {
        _fail(act, new Error('[ActivityService] watch sem `endpoint`'));
        return;
    }
    const interval = watch.interval ?? _config.interval;
    const max = watch.maxAttempts ?? _config.maxAttempts;
    let attempts = 0;
    while (act.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, interval));
        if (act.status !== 'running') return;
        attempts++;
        try {
            const res = await ApiService.request(endpoint, { method: watch.method || 'GET' }, transportName);
            if (act.status !== 'running') return;
            if (_isFailed(res, watch)) {
                _fail(act, _resultError(res, watch));
                return;
            }
            if (_isDone(res, watch)) {
                _done(act, _extract(res, watch));
                return;
            }
            const p = _progressOf(res, watch);
            if (p != null) act.progress = p;
            const m = _messageOf(res, watch, act);
            if (m != null) act.message = m;
            act.updatedAt = _now();
            _emit('activity:progress', act);
            _syncDock(act);
        } catch (err) {
            if (act.status !== 'running') return;
            const st = err?.status;
            // erro definitivo (4xx, exceto timeout/rate-limit): falha na hora
            if (typeof st === 'number' && st >= 400 && st < 500 && st !== 408 && st !== 429) {
                _fail(act, err);
                return;
            }
            act.message = _errMessage(err); // transitório: tenta de novo
        }
        if (attempts >= max) {
            _fail(act, new Error(`[ActivityService] tempo esgotado aguardando a atividade (${max} tentativas)`));
            return;
        }
    }
}

function _watchPush(act, transportName, watch) {
    const transport = ApiService.getTransport(transportName);
    const handler = (payload) => {
        if (act.status !== 'running') return;
        if (watch.event && payload?.event !== watch.event) return;
        const data = payload && typeof payload === 'object' && 'data' in payload && payload.event !== undefined
            ? payload.data
            : payload;
        if (typeof watch.match === 'function' && !watch.match(data, act)) return;
        if (_isFailed(data, watch)) {
            _fail(act, _resultError(data, watch));
            return;
        }
        if (_isDone(data, watch)) {
            _done(act, _extract(data, watch));
            return;
        }
        const p = _progressOf(data, watch);
        if (p != null) act.progress = p;
        const m = _messageOf(data, watch, act);
        if (m != null) act.message = m;
        act.updatedAt = _now();
        _emit('activity:progress', act);
        _syncDock(act);
    };
    const unsub = transport.subscribe.length >= 2
        ? transport.subscribe(_resolveEndpoint(watch.endpoint, act), handler)
        : transport.subscribe(handler);
    act._teardown.push(() => { try { unsub?.(); } catch { /* unsubscribe opcional */ } });
    if (watch.timeout) {
        const timer = setTimeout(() => {
            if (act.status === 'running') {
                _fail(act, new Error('[ActivityService] tempo esgotado aguardando o evento push'));
            }
        }, watch.timeout);
        act._teardown.push(() => clearTimeout(timer));
    }
}

// ------------------------------------------------------------------ término

function _teardown(act) {
    const fns = act._teardown || [];
    act._teardown = [];
    for (const fn of fns) {
        try { fn(); } catch { /* limpeza nunca derruba o fluxo */ }
    }
}

function _release(act) {
    _running.delete(act.id);
    _queue = _queue.filter((id) => id !== act.id);
}

function _done(act, result) {
    if (act.status === 'cancelled') return;
    act.status = 'done';
    act.result = result ?? null;
    act.error = null;
    if (act.progress != null) act.progress = 100;
    act.updatedAt = _now();
    _teardown(act);
    _release(act);
    _emit('activity:done', act);
    _save();
    _present(act);
    _syncDock(act); // target !== 'dock' sai da vista do dock
    if (typeof act._resolve === 'function') act._resolve(act.result);
    _pump();
}

function _fail(act, err) {
    if (act.status === 'cancelled') return;
    act.status = 'failed';
    act.error = _errMessage(err);
    act.updatedAt = _now();
    _teardown(act);
    _release(act);
    _emit('activity:failed', act);
    _save();
    _syncDock(act); // falha fica visível no dock, com retry
    const silent = act.spec.notifyOnError === false || (act.spec.notifyOnError == null && !_config.notifyOnError);
    if (!silent) {
        try { Desktop.notify(`${act.title}: ${act.error}`, 'danger'); } catch { /* toast opcional */ }
    }
    if (typeof act._reject === 'function') act._reject(new Error(act.error));
    _pump();
}

// ------------------------------------------------------------------ target

function _defaultResultNode(act) {
    const r = act.result;
    const text = typeof r === 'string' ? r : JSON.stringify(r ?? {}, null, 2);
    return createElement('pre', 'ui-activity-pre', [text]);
}

function _present(act) {
    if (act.status !== 'done') return;
    const opts = act.spec.targetOptions || {};
    const target = act.target;
    try {
        if (typeof target === 'function') {
            target(act.result, act);
            return;
        }
        switch (target) {
            case 'window': {
                const props = typeof opts.props === 'function'
                    ? opts.props(act.result, act)
                    : { result: act.result, ...(opts.props || {}) };
                Desktop.openScreen(opts.screen, props);
                break;
            }
            case 'modal': {
                const content = typeof opts.content === 'function'
                    ? opts.content(act.result, act)
                    : (opts.content ?? _defaultResultNode(act));
                Desktop.openModal({
                    title: opts.title ?? act.title,
                    icon: opts.icon ?? act.icon ?? '⚡',
                    ...(opts.width ? { width: opts.width } : {}),
                    children: [content],
                });
                break;
            }
            case 'toast': {
                const msg = typeof opts.message === 'function'
                    ? opts.message(act.result, act)
                    : (opts.message ?? `${act.title} concluída`);
                Desktop.notify(msg, 'success');
                break;
            }
            case 'dock':
                _syncDock(act); // o item do dock é a exibição final
                break;
            case 'none':
            default:
                break; // só eventos
        }
    } catch (err) {
        // apresentação nunca transforma done em failed
        console.error('[ActivityService] falha ao apresentar o resultado:', err);
    }
}

// ------------------------------------------------------------------ dock

/** Grupo do dock: `targetOptions.dock.id` iguais entram no mesmo DockWidget; sem id, um dock por atividade. */
function _resolveDockId(act) {
    const d = act.spec.targetOptions?.dock;
    if (typeof d === 'string' && d) return d;
    if (d && typeof d === 'object' && d.id) return d.id;
    return act.id;
}

function _shouldShowInDock(act) {
    if (!act.dockId) return false;
    if (act.status === 'queued' || act.status === 'running') return act.track === 'dock';
    if (act.status === 'failed') return act.track === 'dock' || act.target === 'dock';
    if (act.status === 'cancelled') return false; // cancelar = dispensar
    return act.target === 'dock'; // done
}

function _dockAlive(entry) {
    return !!(entry?.api?.element && entry.api.element.isConnected);
}

/**
 * Garante a Central ativa: a da app (attachContainer) ou a criada pelo
 * serviço quando `configure({ dockContainer: true|{...} })`. Cria lazy e
 * migra os docks próprios já abertos para dentro dela.
 */
function _ensureContainer() {
    if (_dockContainer) return _dockContainer;
    const cfg = _config.dockContainer;
    if (!cfg) return null;
    const opts = cfg === true ? {} : (cfg || {});
    const api = Desktop.createDockContainer({
        title: 'Atividades',
        icon: '🧪',
        position: 'bottom-right',
        width: 360,
        ...opts,
    });
    _dockContainer = api;
    _containerOwned = true;
    for (const entry of _docks.values()) {
        if (entry.owned) {
            try { api.attach(entry.api); } catch { /* dock removido */ }
        }
    }
    return api;
}

/** Devolve os docks próprios ao fluxo fixo do canto (ao desfazer a Central). */
function _releaseOwnedFromContainer() {
    if (!_dockContainer) return;
    for (const entry of _docks.values()) {
        if (!entry.owned) continue;
        try { _dockContainer.detach(entry.api); } catch { /* já fora */ }
    }
}

function _createOwnedDock(key, act) {
    const opt = act.spec.targetOptions?.dock;
    const extra = opt && typeof opt === 'object' ? opt : {};
    const solo = key === act.id; // um dock por atividade
    const container = _ensureContainer();
    const api = DockWidget({
        ..._config.dock,
        ...extra,
        title: extra.title ?? (solo ? act.title : _config.dock.title),
        icon: extra.icon ?? (solo ? (act.icon || '⚡') : _config.dock.icon),
        content: [],
        ...(container ? { container } : {}),
        controls: { minimize: true, expand: true, close: false },
        headerActions: [{
            icon: '🗑️',
            title: 'Limpar concluídas',
            action: () => _clearDockFinished(key),
        }],
    });
    return { api, owned: true, items: [] };
}

function _activityRow(act) {
    const row = createElement('div', 'ui-activity-item');
    row.dataset.activityId = act.id;
    row.appendChild(createElement('span', 'ui-activity-icon', [act.icon || '⚡']));

    const main = createElement('div', 'ui-activity-main');
    main.appendChild(createElement('div', 'ui-activity-title', [act.title]));
    const sub = createElement('div', 'ui-activity-sub', []);
    main.appendChild(sub);

    const side = createElement('div', 'ui-activity-side', []);

    if (act.status === 'queued') {
        sub.appendChild(createElement('span', '', ['Na fila…']));
    } else if (act.status === 'running') {
        sub.appendChild(createElement('span', '', [act.message || 'Processando…']));
        if (act.progress != null) {
            sub.appendChild(ProgressBar({ value: act.progress }));
            side.appendChild(Badge({ text: `${Math.round(act.progress)}%`, variant: 'primary' }));
        } else {
            side.appendChild(Spinner({ size: '14px' }));
        }
    } else if (act.status === 'done') {
        sub.appendChild(createElement('span', '', [act.message || 'Concluída']));
        side.appendChild(Badge({ text: '✓', variant: 'success' }));
    } else if (act.status === 'failed') {
        sub.appendChild(createElement('span', '', [act.error || 'Falhou']));
        side.appendChild(Badge({ text: '!', variant: 'danger' }));
    } else {
        sub.appendChild(createElement('span', '', ['Cancelada']));
        side.appendChild(Badge({ text: '–', variant: 'warning' }));
    }

    if ((act.status === 'failed' || act.status === 'cancelled') && act.spec) {
        const retry = createElement('button', 'ui-activity-btn', ['↻']);
        retry.title = 'Tentar novamente';
        retry.onclick = (e) => { e.stopPropagation(); ActivityService.retry(act.id); };
        side.appendChild(retry);
    }
    if (act.status === 'done' && act.target !== 'dock' && act.target !== 'none' && act.target !== 'cancelled') {
        const open = createElement('button', 'ui-activity-btn', ['↗']);
        open.title = 'Abrir resultado';
        open.onclick = (e) => { e.stopPropagation(); ActivityService.present(act.id); };
        side.appendChild(open);
    }
    const action = act.spec?.targetOptions?.action;
    if (act.status === 'done' && action && typeof action.run === 'function') {
        const btn = createElement('button', 'ui-activity-btn', [action.label || 'Abrir']);
        btn.title = action.label || 'Abrir';
        btn.onclick = (e) => { e.stopPropagation(); action.run(act.result, act); };
        side.appendChild(btn);
    }

    row.appendChild(main);
    row.appendChild(side);
    return row;
}

function _renderDock(key) {
    const entry = _docks.get(key);
    if (!entry) return;
    if (!entry.items.length && entry.owned) {
        // dock próprio vazio: some (a app nunca tem o dela fechada pelo serviço)
        try { entry.api.destroy(); } catch { /* já removido */ }
        _docks.delete(key);
        return;
    }
    const acts = entry.items.map((id) => _activities.get(id)).filter(Boolean);
    entry.api.setContent(acts.length ? acts.map(_activityRow) : []);
    const pending = acts.filter((a) => a.status === 'queued' || a.status === 'running').length;
    if (pending) entry.api.setBadge(pending, 'info');
    else entry.api.setBadge(null);
}

function _syncDock(act) {
    const show = _shouldShowInDock(act);
    const key = act.dockId;
    let entry = key ? _docks.get(key) : null;
    if (entry && !_dockAlive(entry)) _docks.delete(key), entry = null;
    if (!show) {
        if (entry && key) {
            entry.items = entry.items.filter((id) => id !== act.id);
            _renderDock(key);
        }
        return;
    }
    if (!entry && key) {
        entry = _createOwnedDock(key, act);
        _docks.set(key, entry);
    }
    if (entry && !entry.items.includes(act.id)) entry.items.push(act.id);
    if (entry && key) _renderDock(key);
}

function _clearDockFinished(key) {
    const entry = _docks.get(key);
    if (!entry) return;
    for (const id of [...entry.items]) {
        const act = _activities.get(id);
        if (act && (act.status === 'done' || act.status === 'failed' || act.status === 'cancelled')) {
            _remove(id, true);
        }
    }
    _renderDock(key);
}

// ------------------------------------------------------------------ persistência

function _snapshot(act) {
    return {
        id: act.id,
        name: act.name || null,
        title: act.title,
        icon: act.icon || null,
        status: act.status,
        progress: act.progress,
        message: act.message || null,
        result: act.result ?? null,
        error: act.error || null,
        jobId: act.jobId,
        attempt: act.attempt || 0,
        createdAt: act.createdAt,
        updatedAt: act.updatedAt,
        track: act.track,
        target: typeof act.target === 'string' ? act.target : 'none',
        dockId: act.dockId,
    };
}

function _prune() {
    const terminal = [..._activities.values()]
        .filter((a) => a.status === 'done' || a.status === 'failed' || a.status === 'cancelled')
        .sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = terminal.length - _config.historyLimit;
    if (excess <= 0) return;
    const touched = new Set();
    for (const act of terminal.slice(0, excess)) {
        if (act.dockId) touched.add(act.dockId);
        _activities.delete(act.id);
        for (const entry of _docks.values()) {
            entry.items = entry.items.filter((id) => id !== act.id);
        }
    }
    for (const key of touched) _renderDock(key);
}

function _save() {
    if (!_config.persist || !_initialized) return;
    try {
        _prune();
        const payload = {
            v: STORAGE_VERSION,
            savedAt: new Date().toISOString(),
            items: [..._activities.values()].map(_snapshot),
        };
        try {
            localStorage.setItem(_config.storageKey, JSON.stringify(payload));
        } catch {
            // resultado grande demais para a cota: tenta sem os resultados
            payload.items.forEach((item) => { item.result = null; });
            localStorage.setItem(_config.storageKey, JSON.stringify(payload));
        }
    } catch (err) {
        console.warn('[ActivityService] não foi possível persistir as atividades:', err);
    }
}

function _restoreItem(item) {
    if (!item || typeof item !== 'object' || !item.id || _activities.has(item.id)) return;
    const template = item.name ? (_specs.get(item.name) || null) : null;
    const spec = template
        ? _buildSpec(item.name, { track: item.track, target: item.target })
        : null;
    const act = _baseActivity(item.id, {
        name: item.name || null,
        title: item.title || 'Atividade',
        icon: item.icon || '⚡',
        spec,
        track: item.track === 'none' ? 'none' : 'dock',
        target: (template ? (spec.target ?? item.target) : item.target) || 'none',
        dockId: item.dockId || null,
    });
    act.progress = typeof item.progress === 'number' ? item.progress : null;
    act.message = item.message || null;
    act.result = item.result ?? null;
    act.error = item.error || null;
    act.jobId = item.jobId ?? null;
    act.attempt = item.attempt || 0;
    act.createdAt = item.createdAt || _now();
    act.updatedAt = item.updatedAt || _now();

    const active = item.status === 'queued' || item.status === 'running';
    if (!active) {
        act.status = ['done', 'failed', 'cancelled'].includes(item.status) ? item.status : 'done';
        _activities.set(act.id, act); // histórico passivo
        _syncDock(act);
        return;
    }
    if (!template) {
        // spec não registrada: não dá para retomar — vira histórico passivo
        act.status = 'failed';
        act.error = 'Atividade interrompida (spec não registrada)';
        _activities.set(act.id, act);
        _syncDock(act);
        return;
    }
    // retomável: volta para a fila (com jobId pula o request e vai ao watch)
    act.status = 'queued';
    _activities.set(act.id, act);
    _queue.push(act.id);
    _syncDock(act);
}

// ------------------------------------------------------------------ atividade

function _baseActivity(id, { name, title, icon, spec, track, target, dockId }) {
    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
    promise.catch(() => {}); // ninguém é obrigado a dar await/then
    const act = {
        id,
        name: name || null,
        title,
        icon,
        status: 'queued',
        progress: null,
        message: null,
        result: null,
        error: null,
        jobId: null,
        attempt: 0,
        createdAt: _now(),
        updatedAt: _now(),
        track,
        target,
        dockId,
        spec: spec || null,
        promise,
        _resolve: resolveFn,
        _reject: rejectFn,
        _teardown: [],
        cancel: () => ActivityService.cancel(id),
        retry: () => ActivityService.retry(id),
        setProgress: (value, message) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                act.progress = Math.max(0, Math.min(100, value));
            }
            if (message != null) act.message = message;
            act.updatedAt = _now();
            _emit('activity:progress', act);
            _syncDock(act);
        },
    };
    return act;
}

// ------------------------------------------------------------------ remoção

function _remove(id, silent = false) {
    const act = _activities.get(id);
    if (!act) return false;
    if (act.status === 'running' || act.status === 'queued') {
        ActivityService.cancel(id);
    }
    _activities.delete(id);
    _queue = _queue.filter((qid) => qid !== id);
    for (const entry of _docks.values()) {
        entry.items = entry.items.filter((qid) => qid !== id);
    }
    if (act.dockId && _docks.has(act.dockId)) _renderDock(act.dockId);
    if (!silent) {
        _emit('activity:removed', act);
        _save();
    }
    return true;
}

// ------------------------------------------------------------------ serviço

export const ActivityService = {
    /** Mescla a configuração (dock é mesclado em profundidade de 1 nível). */
    configure(partial = {}) {
        const { dock, ...rest } = partial || {};
        _config = { ..._config, ...rest };
        if (dock && typeof dock === 'object') _config.dock = { ..._config.dock, ...dock };
        return this;
    },

    /** Registra o template de uma spec (funções ficam em memória; o storage guarda só o `name`). */
    registerSpec(name, template) {
        if (!name || !template) throw new Error('[ActivityService] registerSpec exige `name` e template');
        _specs.set(name, { ...template });
        return this;
    },

    getSpec(name) {
        return _specs.get(name) || null;
    },

    /** Anexa um DockWidget da app a um grupo (`dockId`): o serviço usa e nunca fecha.
     * Com `{ container: true }`, o dock da app também mora na Central ativa
     * (cria-a se `configure({ dockContainer })`, senão exige uma anexada). */
    attachDock(id, dockApi, { container = false } = {}) {
        if (!id || !dockApi || typeof dockApi.setContent !== 'function') {
            throw new Error('[ActivityService] attachDock exige `id` e dockApi com `setContent`');
        }
        if (container) {
            const central = _dockContainer || _ensureContainer();
            if (!central) {
                throw new Error('[ActivityService] `container: true` exige Central ativa ou `configure({ dockContainer })`');
            }
            central.attach(dockApi);
        }
        const prev = _docks.get(id);
        if (prev?.owned) {
            try { prev.api.destroy(); } catch { /* já removido */ }
        }
        _docks.set(id, { api: dockApi, owned: false, items: prev && _dockAlive(prev) ? prev.items : [] });
        _renderDock(id);
        return this;
    },

    getDock(id) {
        return _docks.get(id) || null;
    },

    /**
     * Anexa um DockContainer da app: os docks próprios do serviço passam a
     * morar nele (com scroll) em vez de flutuarem avulsos no canto. Migra os
     * já abertos. O container da app nunca é fechado pelo serviço.
     */
    attachContainer(containerApi) {
        if (!containerApi || typeof containerApi.attach !== 'function') {
            throw new Error('[ActivityService] attachContainer exige api de DockContainer (com `attach`)');
        }
        _dockContainer = containerApi;
        _containerOwned = false;
        for (const entry of _docks.values()) {
            if (entry.owned) {
                try { containerApi.attach(entry.api); } catch { /* dock removido */ }
            }
        }
        return this;
    },

    /**
     * Desfaz a Central: esquece a referência e, se ela foi criada pelo
     * serviço (`configure({ dockContainer })`), destrói (os docks próprios
     * voltam ao fluxo fixo do canto). A da app fica intacta.
     */
    detachContainer() {
        if (_dockContainer && _containerOwned) {
            try { _releaseOwnedFromContainer(); } catch { /* segue o baile */ }
            try { _dockContainer.destroy(); } catch { /* já removida */ }
        }
        _dockContainer = null;
        _containerOwned = false;
        return this;
    },

    getContainer() {
        return _dockContainer;
    },

    /** Para de gerenciar um dock (o próprio some; o da app fica intacto). */
    detachDock(id) {
        const entry = _docks.get(id);
        if (!entry) return false;
        if (entry.owned) {
            try { entry.api.destroy(); } catch { /* já removido */ }
        }
        for (const itemId of entry.items) {
            const act = _activities.get(itemId);
            if (act && act.dockId === id) act.dockId = null;
        }
        _docks.delete(id);
        return true;
    },

    /**
     * Enfileira uma atividade. Retorna o objeto-atividade (com `promise`,
     * `cancel()`, `retry()` e `setProgress()`). Mesmo `id` ativo → devolve a
     * existente (sem duplicar); mesmo `id` terminal → reexecuta.
     */
    enqueue(input = {}) {
        const spec = _buildSpec(input.name, input);
        _validateSpec(spec);
        const id = typeof input.id === 'string' && input.id ? input.id : _uid('act');
        const prev = _activities.get(id);
        if (prev && (prev.status === 'queued' || prev.status === 'running')) return prev;
        if (prev) _remove(id, true);

        const track = spec.track ?? 'dock';
        const target = spec.target ?? 'toast';
        const act = _baseActivity(id, {
            name: input.name || null,
            title: spec.title || input.title || 'Atividade',
            icon: spec.icon ?? input.icon ?? '⚡',
            spec,
            track,
            target,
            dockId: null,
        });
        act.jobId = input.jobId ?? null;
        if (track === 'dock' || target === 'dock') act.dockId = _resolveDockId(act);
        _enqueueActivity(act);
        _pump();
        return act;
    },

    get(id) {
        return _activities.get(id) || null;
    },

    /** Lista as atividades (opcionalmente filtradas por status). */
    list(status = null) {
        const all = [..._activities.values()];
        if (!status) return all;
        const set = new Set(Array.isArray(status) ? status : [status]);
        return all.filter((a) => set.has(a.status));
    },

    cancel(id) {
        const act = _activities.get(id);
        if (!act || act.status === 'done' || act.status === 'failed' || act.status === 'cancelled') return false;
        act.status = 'cancelled';
        act.updatedAt = _now();
        _teardown(act);
        _release(act);
        _emit('activity:cancelled', act);
        _save();
        _syncDock(act); // cancelar = dispensar: sai do dock
        if (typeof act._reject === 'function') act._reject(new Error('Atividade cancelada'));
        _pump();
        return true;
    },

    /** Reexecuta do zero (failed/cancelled): limpa jobId e volta ao fim da fila. */
    retry(id) {
        const act = _activities.get(id);
        if (!act || (act.status !== 'failed' && act.status !== 'cancelled')) return null;
        if (!act.spec) return null;
        act.status = 'queued';
        act.error = null;
        act.result = null;
        act.message = null;
        act.progress = null;
        act.jobId = null;
        act.updatedAt = _now();
        let resolveFn, rejectFn;
        const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
        promise.catch(() => {});
        act.promise = promise;
        act._resolve = resolveFn;
        act._reject = rejectFn;
        _queue.push(act.id);
        _emit('activity:queued', act);
        _save();
        _syncDock(act);
        _pump();
        return act;
    },

    /** (Re)dispara a apresentação do resultado de uma atividade concluída. */
    present(id) {
        const act = typeof id === 'object' ? id : _activities.get(id);
        if (!act) return false;
        if (act.status !== 'done') return false;
        _present(act);
        return true;
    },

    remove(id) {
        const ok = _remove(id);
        if (ok) _save();
        return ok;
    },

    /** Remove as terminais (done/failed/cancelled); as ativas continuam. */
    clear() {
        const terminal = this.list(['done', 'failed', 'cancelled']).map((a) => a.id);
        for (const id of terminal) _remove(id, true);
        _save();
        return terminal.length;
    },

    /**
     * Restaura o storage e retoma specs registradas (com jobId pula o
     * request e reanexa o watch; sem spec registrada vira histórico passivo).
     * Chame uma vez no boot. Sem efeito quando `persist: false`.
     */
    init() {
        if (_initialized) return this;
        _initialized = true;
        if (!_config.persist) return this;
        let payload = null;
        try {
            const raw = localStorage.getItem(_config.storageKey);
            payload = raw ? JSON.parse(raw) : null;
        } catch {
            payload = null;
        }
        if (!payload || payload.v !== STORAGE_VERSION || !Array.isArray(payload.items)) return this;
        for (const item of payload.items) _restoreItem(item);
        _save();
        _pump();
        return this;
    },

    /** Cancela tudo, limpa memória, docks próprios e (por padrão) o storage. Uso em testes e logout. */
    reset({ storage = true } = {}) {
        for (const act of [..._activities.values()]) {
            if (act.status === 'queued' || act.status === 'running') {
                act.status = 'cancelled';
                _teardown(act);
                if (typeof act._reject === 'function') act._reject(new Error('Atividade cancelada'));
            }
        }
        _activities.clear();
        _queue = [];
        _running.clear();
        for (const entry of _docks.values()) {
            if (entry.owned) {
                try { entry.api.destroy(); } catch { /* já removido */ }
            }
        }
        _docks.clear();
        if (_dockContainer && _containerOwned) {
            try { _dockContainer.destroy(); } catch { /* já removida */ }
        }
        _dockContainer = null;
        _containerOwned = false;
        if (storage && _config.persist) {
            try { localStorage.removeItem(_config.storageKey); } catch { /* storage indisponível */ }
        }
        _initialized = false;
        return this;
    },
};
