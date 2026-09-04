// core.js
//Autor: Gildasio Lecchi Cravo
// --- Event Bus (Pub/Sub com suporte a LocalStorage) ---
export const EventBus = {
    listeners: {},
    
    // Inicializa a escuta de eventos inter-abas via LocalStorage
    init() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'desktop_event_bus' && e.newValue) {
                try {
                    const { event, payload } = JSON.parse(e.newValue);
                    this.emitLocal(event, payload);
                } catch (err) {
                    console.error("Erro ao processar evento do EventBus:", err);
                }
            }
        });
    },

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },

    // Emite o evento apenas na aba atual
    emitLocal(event, payload) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(payload));
        }
    },

    // Emite o evento localmente e para outras abas
    emit(event, payload) {
        this.emitLocal(event, payload);
        
        // Persistência no LocalStorage para sincronizar entre abas
        localStorage.setItem('desktop_event_bus', JSON.stringify({
            event,
            payload,
            timestamp: Date.now()
        }));
    }
};

// Inicializa o EventBus se estiver no navegador
if (typeof window !== 'undefined') {
    EventBus.init();
}

// --- Signals Engine (Atômico, Fine-Grained, Zero Deps) ---
const SIGNAL_MARKER = Symbol.for('DesktopEngine.Signal');

let currentListener = null;
const listenerStack = [];

export function isSignal(obj) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
    return !!(obj[SIGNAL_MARKER] || (typeof obj.peek === 'function' && typeof obj.subscribe === 'function' && 'value' in obj));
}

export function signal(initialValue) {
    let _value = initialValue;
    const subscribers = new Set();

    const sig = {
        [SIGNAL_MARKER]: true,
        get value() {
            if (currentListener) {
                subscribers.add(currentListener);
            }
            return _value;
        },
        set value(newValue) {
            if (_value === newValue) return;
            _value = newValue;
            // Notifica os assinantes registrados
            const list = Array.from(subscribers);
            for (const sub of list) {
                try { sub(_value); } catch (err) { console.error("Erro no subscriber do Signal:", err); }
            }
        },
        peek() {
            return _value;
        },
        subscribe(callback) {
            subscribers.add(callback);
            try { callback(_value); } catch (err) { console.error("Erro ao executar callback de subscribe:", err); }
            return () => subscribers.delete(callback);
        },
        toString() {
            return String(this.value);
        },
        valueOf() {
            return this.value;
        }
    };

    return sig;
}

export function effect(fn) {
    let cleanup = null;

    const run = () => {
        if (typeof cleanup === 'function') {
            try { cleanup(); } catch (e) { console.error("Erro no cleanup de effect:", e); }
            cleanup = null;
        }
        listenerStack.push(run);
        currentListener = run;
        try {
            cleanup = fn();
        } finally {
            listenerStack.pop();
            currentListener = listenerStack[listenerStack.length - 1] || null;
        }
    };

    run();

    return () => {
        if (typeof cleanup === 'function') {
            try { cleanup(); } catch (e) {}
        }
    };
}

export function computed(fn) {
    const computedSignal = signal(undefined);
    effect(() => {
        computedSignal.value = fn();
    });
    return {
        [SIGNAL_MARKER]: true,
        get value() {
            return computedSignal.value;
        },
        peek() {
            return computedSignal.peek();
        },
        subscribe(cb) {
            return computedSignal.subscribe(cb);
        },
        toString() {
            return String(this.value);
        },
        valueOf() {
            return this.value;
        }
    };
}

export function createStore(initialObj = {}) {
    const signals = {};
    for (const key of Object.keys(initialObj)) {
        signals[key] = signal(initialObj[key]);
    }
    return new Proxy(initialObj, {
        get(target, prop) {
            if (prop === '$signals') return signals;
            if (prop === '$getSignal') return (key) => {
                if (!signals[key]) signals[key] = signal(target[key]);
                return signals[key];
            };
            if (!signals[prop] && typeof prop === 'string') {
                signals[prop] = signal(target[prop]);
            }
            if (signals[prop]) {
                return signals[prop].value;
            }
            return target[prop];
        },
        set(target, prop, val) {
            target[prop] = val;
            if (!signals[prop]) {
                signals[prop] = signal(val);
            } else {
                signals[prop].value = val;
            }
            return true;
        }
    });
}

// --- Contexto Reativo Implícito ---
// Permite que componentes UI acessem a janela atual sem exigir 'instance: this' do desenvolvedor
export const UIContext = {
    _current: null,
    _stack: [],

    getCurrent() {
        return this._current;
    },

    setCurrent(instance) {
        this._current = instance;
    },

    runWith(instance, fn) {
        this._stack.push(this._current);
        this._current = instance;
        try {
            return fn();
        } finally {
            this._current = this._stack.pop() || null;
        }
    }
};

// --- Classe Base para Extensão de Componentes por Desenvolvedores ---
export class BaseComponent {
    constructor(props = {}) {
        this.props = { ...props };
        this.state = {};
        this.el = null;
        this._listeners = {};
    }

    setState(partialOrFn) {
        const next = typeof partialOrFn === 'function' ? partialOrFn(this.state) : partialOrFn;
        this.state = { ...this.state, ...next };
        this.update();
    }

    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }

    emit(event, payload) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(h => {
                try { h(payload); } catch (e) { console.error(`Erro no listener de ${event}:`, e); }
            });
        }
    }

    mount(parent) {
        this.el = this.render();
        if (parent && this.el) {
            if (parent instanceof Node) parent.appendChild(this.el);
            else if (typeof parent.appendChild === 'function') parent.appendChild(this.el);
        }
        if (typeof this.onMount === 'function') {
            try { this.onMount(); } catch (e) { console.error("Erro no hook onMount de BaseComponent:", e); }
        }
        return this.el;
    }

    update() {
        if (!this.el || !this.el.parentNode) return;
        const oldEl = this.el;
        const newEl = this.render();
        if (oldEl && newEl && oldEl.parentNode) {
            oldEl.parentNode.replaceChild(newEl, oldEl);
            this.el = newEl;
            if (typeof this.onUpdate === 'function') {
                try { this.onUpdate(); } catch (e) { console.error("Erro no hook onUpdate de BaseComponent:", e); }
            }
        }
    }

    destroy() {
        if (typeof this.onDestroy === 'function') {
            try { this.onDestroy(); } catch (e) { console.error("Erro no hook onDestroy de BaseComponent:", e); }
        }
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
        this._listeners = {};
        this.el = null;
    }

    render() {
        throw new Error("Componente deve implementar o método render() retornando um elemento DOM.");
    }
}

// --- Core Engine ---
export const Framework = {
    _components: {},
    _plugins: [],

    /** Registra um novo componente no framework para uso declarativo e programático */
    defineComponent(name, componentDef) {
        if (!name || !componentDef) throw new Error("Nome e definição do componente são obrigatórios.");
        this._components[name] = componentDef;
        return this;
    },

    /** Retorna um componente previamente registrado */
    getComponent(name) {
        return this._components[name];
    },

    /** Registra e executa um plugin que estende o framework */
    use(plugin, options = {}) {
        if (!plugin) return this;
        if (typeof plugin === 'function') {
            plugin(this, options);
        } else if (typeof plugin.install === 'function') {
            plugin.install(this, options);
        }
        this._plugins.push({ plugin, options });
        return this;
    },
    createWindow(config, instanceId, desktopManager) {
        let isSilentStateUpdate = false;
        const _signalsMap = {};

        // Objeto de estado reativo via Proxy
        let state = new Proxy({ ...config.state }, {
            get(target, prop) {
                return target[prop];
            },
            set(target, prop, value) {
                const oldValue = target[prop];
                target[prop] = value;
                if (_signalsMap[prop] && _signalsMap[prop].peek() !== value) {
                    _signalsMap[prop].value = value;
                }
                if (instance.update && !isSilentStateUpdate && instance.el) {
                    instance.update(prop, value, oldValue);
                }
                return true;
            }
        });

        // Proxy de signals para acesso fino e direto: this.signals.nomeDaPropriedade
        const signalsProxy = new Proxy(_signalsMap, {
            get(target, prop) {
                if (typeof prop === 'symbol') return target[prop];
                if (!target[prop]) {
                    target[prop] = signal(state[prop]);
                    target[prop].subscribe((newVal) => {
                        if (state[prop] !== newVal) {
                            state[prop] = newVal;
                        }
                    });
                }
                return target[prop];
            }
        });

        const instance = {
            id: instanceId,
            state,
            signals: signalsProxy,
            config,
            el: null, // Elemento raiz (conteúdo da janela)
            windowEl: null, // Elemento físico da janela (container)

            $signal(prop, initialValue = undefined) {
                return this.signals[prop];
            },
            
            _setSilentState(prop, value) {
                isSilentStateUpdate = true;
                this.state[prop] = value;
                if (_signalsMap[prop] && _signalsMap[prop].peek() !== value) {
                    _signalsMap[prop].value = value;
                }
                isSilentStateUpdate = false;

                // Sincroniza outros campos da mesma janela vinculados à mesma propriedade sem recriar o DOM
                if (this.el) {
                    const boundEls = this.el.querySelectorAll(`[data-bind="${prop}"]`);
                    boundEls.forEach(el => {
                        if (el !== document.activeElement && el.value !== undefined && el.value !== value) {
                            el.value = value;
                        }
                    });
                }
            },
            
            async runAction(actionName, eventPayload = null) {
                const actionChain = config.actions?.[actionName];
                if (!actionChain) return;
                
                const steps = Array.isArray(actionChain) ? actionChain : [actionChain];
                let index = 0;
                
                const context = { 
                    state: this.state, 
                    instance: this,
                    event: eventPayload,
                    response: null
                };
                
                const next = async () => {
                    if (index < steps.length) {
                        await UIContext.runWith(this, async () => {
                            await steps[index++](context, next);
                        });
                    }
                };
                
                try {
                    await next();
                } catch (err) {
                    console.error(`Erro na action '${actionName}':`, err);
                    if (desktopManager && desktopManager.notify) {
                        desktopManager.notify(err.message, "error");
                    } else {
                        alert(err.message);
                    }
                }
            },

            render() {
                return UIContext.runWith(this, () => {
                    if (typeof config.view === 'function') {
                        const node = config.view.call(this);
                        this.el = node;
                        return node;
                    }
                    // Fallback para conteúdo estático
                    const div = document.createElement('div');
                    div.innerHTML = config.view || '';
                    this.el = div;
                    return div;
                });
            },

            update(prop = null, newValue = null, oldValue = null) {
                UIContext.runWith(this, () => {
                    if (typeof this.beforeUpdate === 'function') {
                        try { this.beforeUpdate(prop, newValue, oldValue); } catch (e) { console.error("Erro no hook beforeUpdate:", e); }
                    }

                    if (this.el && this.el.parentNode) {
                        // Salvar o foco atual e posições de seleção/cursor
                        const activeElement = document.activeElement;
                        let focusedBind = null;
                        let selStart = null;
                        let selEnd = null;

                        if (activeElement && activeElement.dataset && activeElement.dataset.bind) {
                            focusedBind = activeElement.dataset.bind;
                            if (typeof activeElement.selectionStart === "number") {
                                selStart = activeElement.selectionStart;
                                selEnd = activeElement.selectionEnd;
                            }
                        }
                        
                        const oldEl = this.el;
                        const newEl = this.render();
                        oldEl.parentNode.replaceChild(newEl, oldEl);
                        this.el = newEl;
                        
                        // Restaurar foco e cursor sem perder a posição de digitação
                        if (focusedBind) {
                            const elToFocus = newEl.querySelector(`[data-bind="${focusedBind}"]`);
                            if (elToFocus) {
                                elToFocus.focus();
                                if (selStart !== null && typeof elToFocus.setSelectionRange === "function") {
                                    elToFocus.setSelectionRange(selStart, selEnd);
                                }
                            }
                        }

                        if (typeof this.onUpdate === 'function') {
                            try { this.onUpdate(); } catch (e) { console.error("Erro no hook onUpdate:", e); }
                        }
                    }
                });
            },
            
            setStatus(msg) {
                if (this.windowEl) {
                    const sb = this.windowEl.querySelector('.statusbar');
                    if (sb) sb.textContent = msg;
                }
            },

            setTitle(newTitle) {
                if (this.windowEl) {
                    const tt = this.windowEl.querySelector('.titleText');
                    if (tt) tt.textContent = newTitle;
                }
                if (this.taskEl) {
                    const icon = config.icon ? config.icon + " " : "";
                    this.taskEl.textContent = icon + newTitle;
                    this.taskEl.title = icon + newTitle;
                }
            },
            
            setMenuBar(menus, position) {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.setWindowMenuBar === 'function') {
                    dm.setWindowMenuBar(this, menus, position);
                }
            },

            getMenuBar() {
                return this.windowEl ? this.windowEl.querySelector('.window-menubar') : null;
            },

            setActionToolbar(actions, position) {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.setWindowActionToolbar === 'function') {
                    dm.setWindowActionToolbar(this, actions, position);
                }
            },

            getActionToolbar() {
                return this.windowEl ? this.windowEl.querySelector('.window-action-toolbar') : null;
            },

            openDialog(childScreenOrId, initialProps = {}) {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.openDialog === 'function') {
                    return dm.openDialog(childScreenOrId, this, initialProps);
                }
                return Promise.reject(new Error("DesktopManager não disponível para abrir janela modal filha."));
            },

            openChildWindow(childScreenOrId, initialProps = {}) {
                return this.openDialog(childScreenOrId, initialProps);
            },

            close(resultData = undefined) {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.closeWindow === 'function') {
                    return dm.closeWindow(this, this.windowEl, this.taskEl, resultData);
                }
            },

            minimize() {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.minimizeWindow === 'function' && this.windowEl) {
                    dm.minimizeWindow(this.windowEl);
                }
            },

            maximize() {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.maximizeWindow === 'function' && this.windowEl) {
                    dm.maximizeWindow(this.windowEl);
                }
            },

            restore() {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.restoreWindow === 'function' && this.windowEl) {
                    dm.restoreWindow(this.windowEl);
                }
            },

            toggleMaximize() {
                if (this.isMaximized()) this.restore();
                else this.maximize();
            },

            isMaximized() {
                return !!(this.windowEl && this.windowEl.classList.contains("maximized"));
            },

            isMinimized() {
                return !!(this.windowEl && this.windowEl.classList.contains("minimized"));
            },

            isFocused() {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                return !!(dm && dm.activeWindowId === this.id);
            },

            focus() {
                const dm = desktopManager || (typeof window !== 'undefined' ? window.Desktop : null);
                if (dm && typeof dm.focusWindow === 'function' && this.windowEl) {
                    dm.focusWindow(this.windowEl);
                }
            },
            
            // --- Lifecycle Hooks (Ciclo de Vida da Janela) ---
            beforeMount() {
                if (typeof config.beforeMount === 'function') {
                    UIContext.runWith(this, () => config.beforeMount.call(this));
                }
            },

            onMount() {
                if (typeof config.onMount === 'function') {
                    UIContext.runWith(this, () => config.onMount.call(this));
                }
            },

            beforeUpdate(prop, newValue, oldValue) {
                if (typeof config.beforeUpdate === 'function') {
                    UIContext.runWith(this, () => config.beforeUpdate.call(this, prop, newValue, oldValue));
                }
            },

            onUpdate() {
                if (typeof config.onUpdate === 'function') {
                    UIContext.runWith(this, () => config.onUpdate.call(this));
                }
            },

            onFocus() {
                if (typeof config.onFocus === 'function') {
                    UIContext.runWith(this, () => config.onFocus.call(this));
                }
            },

            onBlur() {
                if (typeof config.onBlur === 'function') {
                    UIContext.runWith(this, () => config.onBlur.call(this));
                }
            },

            onMinimize() {
                if (typeof config.onMinimize === 'function') {
                    UIContext.runWith(this, () => config.onMinimize.call(this));
                }
            },

            onRestore() {
                if (typeof config.onRestore === 'function') {
                    UIContext.runWith(this, () => config.onRestore.call(this));
                }
            },

            onMaximize(isMaximized) {
                if (typeof config.onMaximize === 'function') {
                    UIContext.runWith(this, () => config.onMaximize.call(this, isMaximized));
                }
            },

            onResize(width, height) {
                if (typeof config.onResize === 'function') {
                    UIContext.runWith(this, () => config.onResize.call(this, width, height));
                }
            },

            onMove(x, y) {
                if (typeof config.onMove === 'function') {
                    UIContext.runWith(this, () => config.onMove.call(this, x, y));
                }
            },

            async beforeClose() {
                if (typeof config.beforeClose === 'function') {
                    return await UIContext.runWith(this, async () => await config.beforeClose.call(this));
                }
                return true;
            },
            
            onDestroy() {
                if (typeof config.onDestroy === 'function') {
                    UIContext.runWith(this, () => config.onDestroy.call(this));
                }
            }
        };

        // Vincula e delega métodos personalizados do config para a instância
        if (config && typeof config === 'object') {
            for (const [key, val] of Object.entries(config)) {
                if (typeof val === 'function' && !(key in instance)) {
                    instance[key] = val.bind(instance);
                }
            }
        }

        return instance;
    }
};
