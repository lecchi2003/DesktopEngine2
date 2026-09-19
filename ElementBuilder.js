// ElementBuilder.js
// Autor: Gildasio Lecchi Cravo
import { UIContext, Framework, isSignal, effect, SecurityService } from './core.js';
import * as UIComponents from './ui.js';
import { safeSetHTML } from './ui/sanitize.js';

/**
 * ElementBuilder: Construtor fluente e programático para elementos DOM e componentes de UI.
 * Permite criar e encadear estilizações, eventos, atributos e filhos de forma limpa.
 */
export class ElementBuilder {
    constructor(tagOrElement, options = {}) {
        if (typeof tagOrElement === 'string') {
            this.el = document.createElement(tagOrElement);
        } else if (tagOrElement instanceof Node) {
            this.el = tagOrElement;
        } else {
            this.el = document.createElement('div');
        }

        // [CORE-001] Armazena cleanups de effects reativos para liberar na destruição
        this._effects = [];
        this._isRestricted = false;

        if (options.className) this.class(options.className);
        if (options.text) this.text(options.text);
        if (options.html) this.html(options.html);
        if (options.style) this.style(options.style);
        if (options.children) this.children(options.children);
    }

    /** Adiciona uma ou mais classes CSS */
    class(...classNames) {
        if (this._isRestricted || !this.el.classList) return this;
        const flat = classNames.flat().filter(Boolean);
        flat.forEach(c => {
            c.split(' ').forEach(cls => {
                if (cls) this.el.classList.add(cls);
            });
        });
        return this;
    }

    /** Alias para class */
    addClass(...classNames) {
        return this.class(...classNames);
    }

    /** Remove classes CSS */
    removeClass(...classNames) {
        const flat = classNames.flat().filter(Boolean);
        flat.forEach(c => {
            c.split(' ').forEach(cls => {
                if (cls) this.el.classList.remove(cls);
            });
        });
        return this;
    }

    /** Alterna classe CSS */
    toggleClass(className, force) {
        this.el.classList.toggle(className, force);
        return this;
    }

    /** Define o ID do elemento */
    id(value) {
        if (this._isRestricted || !this.el) return this;
        this.el.id = value;
        return this;
    }

    /** Define estilos inline (objeto ou chave-valor ou string cssText) */
    style(keyOrObj, value) {
        if (this._isRestricted || !this.el || !this.el.style) return this;
        if (typeof keyOrObj === 'string') {
            if (value !== undefined) {
                this.el.style[keyOrObj] = value;
            } else {
                this.el.style.cssText += ';' + keyOrObj;
            }
        } else if (keyOrObj && typeof keyOrObj === 'object') {
            Object.assign(this.el.style, keyOrObj);
        }
        return this;
    }

    /** Define largura */
    width(val) {
        if (this._isRestricted || !this.el || !this.el.style) return this;
        this.el.style.width = typeof val === 'number' ? `${val}px` : val;
        return this;
    }

    /** Define altura */
    height(val) {
        if (this._isRestricted || !this.el || !this.el.style) return this;
        this.el.style.height = typeof val === 'number' ? `${val}px` : val;
        return this;
    }

    /** Define atributo HTML */
    attr(name, val) {
        if (this._isRestricted || !this.el || !this.el.setAttribute) return this;
        if (val === null || val === undefined || val === false) {
            this.el.removeAttribute(name);
        } else {
            this.el.setAttribute(name, val === true ? '' : val);
        }
        return this;
    }

    /** Define dataset attribute */
    data(key, val) {
        if (this._isRestricted || !this.el || !this.el.dataset) return this;
        this.el.dataset[key] = val;
        return this;
    }

    /** Define o texto do elemento (suporta string, número ou Signal reativo atômico) */
    text(txtOrSignal) {
        if (this._isRestricted || !this.el || !('textContent' in this.el)) return this;
        if (isSignal(txtOrSignal)) {
            this.el.textContent = '';
            const textNode = document.createTextNode(txtOrSignal.value !== undefined ? String(txtOrSignal.value) : '');
            this.el.appendChild(textNode);
            // [CORE-001] Guarda o cleanup para ser chamado em dispose()
            const stop = effect(() => {
                textNode.textContent = txtOrSignal.value !== undefined ? String(txtOrSignal.value) : '';
            });
            this._effects.push(stop);
            return this;
        }
        this.el.textContent = txtOrSignal !== undefined && txtOrSignal !== null ? String(txtOrSignal) : '';
        return this;
    }

    /**
     * Define o HTML interno de forma INSEGURA (sem sanitização).
     * ⚠️ Use apenas com conteúdo 100% controlado pelo desenvolvedor.
     * Para conteúdo externo ou de usuário, use .safeHtml() em vez deste método.
     */
    html(markup) {
        if (this._isRestricted || !this.el || !('innerHTML' in this.el)) return this;
        this.el.innerHTML = markup !== undefined && markup !== null ? String(markup) : '';
        return this;
    }

    /**
     * Define o HTML interno com sanitização automática (recomendado para conteúdo externo).
     * [CORE-005] Alternativa segura ao método .html()
     */
    safeHtml(markup) {
        if (this._isRestricted || !this.el) return this;
        safeSetHTML(this.el, markup !== undefined && markup !== null ? String(markup) : '');
        return this;
    }

    /** Exibe ou oculta o elemento condicionalmente (suporta Signal booleano ou função) */
    showIf(conditionOrSignal) {
        if (this._isRestricted || !this.el || !this.el.style) return this;
        if (isSignal(conditionOrSignal)) {
            // [CORE-001] Guarda cleanup
            const stop = effect(() => {
                this.el.style.display = conditionOrSignal.value ? '' : 'none';
            });
            this._effects.push(stop);
        } else if (typeof conditionOrSignal === 'function') {
            const stop = effect(() => {
                this.el.style.display = conditionOrSignal() ? '' : 'none';
            });
            this._effects.push(stop);
        } else {
            this.el.style.display = conditionOrSignal ? '' : 'none';
        }
        return this;
    }

    /**
     * Aplica autorização por permissão (RBAC) via SecurityService.
     * @param {string} permission - Ex: 'products:delete'
     * @param {Object} options - { behavior: 'remove' | 'disable', title: string }
     */
    requirePermission(permission, options = {}) {
        const behavior = options.behavior || 'remove';
        const allowed = SecurityService.can(permission);
        if (!allowed) {
            if (behavior === 'remove') {
                const comment = document.createComment(`[Acesso Restrito: ${permission}]`);
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.replaceChild(comment, this.el);
                }
                this.el = comment;
                this._isRestricted = true;
            } else {
                this.attr('disabled', 'true');
                this.class('is-disabled');
                this.attr('title', options.title || 'Acesso restrito: permissão insuficiente');
                this.style('pointer-events', 'none');
                this.style('opacity', '0.5');
            }
        }
        return this;
    }

    /**
     * Aplica autorização por papel (Role) via SecurityService.
     * @param {string} role - Ex: 'ADMIN'
     * @param {Object} options - { behavior: 'remove' | 'disable', title: string }
     */
    requireRole(role, options = {}) {
        const behavior = options.behavior || 'remove';
        const allowed = SecurityService.hasRole(role);
        if (!allowed) {
            if (behavior === 'remove') {
                const comment = document.createComment(`[Acesso Restrito: Papel ${role}]`);
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.replaceChild(comment, this.el);
                }
                this.el = comment;
                this._isRestricted = true;
            } else {
                this.attr('disabled', 'true');
                this.class('is-disabled');
                this.attr('title', options.title || `Acesso restrito: requer papel ${role}`);
                this.style('pointer-events', 'none');
                this.style('opacity', '0.5');
            }
        }
        return this;
    }

    /** Adiciona um listener de evento */
    on(event, handler, options) {
        if (this._isRestricted || !this.el.addEventListener) return this;
        this.el.addEventListener(event, handler, options);
        return this;
    }

    /** Atalho para evento click ou action da janela atual */
    click(handlerOrActionName) {
        if (this._isRestricted || !this.el.addEventListener) return this;
        if (typeof handlerOrActionName === 'function') {
            this.el.addEventListener('click', (e) => handlerOrActionName(e, UIContext.getCurrent()));
        } else if (typeof handlerOrActionName === 'string') {
            this.el.addEventListener('click', () => {
                const inst = UIContext.getCurrent();
                if (inst && typeof inst.runAction === 'function') {
                    inst.runAction(handlerOrActionName);
                }
            });
        }
        return this;
    }

    /** Atalho para evento change */
    change(handler) {
        this.el.addEventListener('change', (e) => handler(e, UIContext.getCurrent()));
        return this;
    }

    /** Atalho para evento input */
    input(handler) {
        this.el.addEventListener('input', (e) => handler(e, UIContext.getCurrent()));
        return this;
    }

    /** Liga o valor do elemento a um Signal ou ao state da janela (Two-Way Data Binding) */
    bind(signalOrStateKey) {
        if (this._isRestricted || !this.el) return this;
        if (isSignal(signalOrStateKey)) {
            const sig = signalOrStateKey;
            if (this.el.type === 'checkbox') {
                // [CORE-001] Guarda cleanup do effect de binding
                const stop = effect(() => {
                    this.el.checked = !!sig.value;
                });
                this._effects.push(stop);
                this.el.addEventListener('change', (e) => {
                    sig.value = e.target.checked;
                });
            } else if ('value' in this.el) {
                const stop = effect(() => {
                    if (this.el !== document.activeElement) {
                        this.el.value = sig.value !== undefined ? sig.value : '';
                    }
                });
                this._effects.push(stop);
                this.el.addEventListener('input', (e) => {
                    sig.value = e.target.value;
                });
            }
            return this;
        }

        const stateKey = signalOrStateKey;
        this.data('bind', stateKey);
        const inst = UIContext.getCurrent();
        if (inst && inst.state) {
            const currentVal = inst.state[stateKey];
            if (this.el.type === 'checkbox') {
                this.el.checked = !!currentVal;
                this.el.addEventListener('change', (e) => {
                    inst.state[stateKey] = e.target.checked;
                });
            } else if ('value' in this.el) {
                if (currentVal !== undefined) this.el.value = currentVal;
                this.el.addEventListener('input', (e) => {
                    if (typeof inst._setSilentState === 'function') {
                        inst._setSilentState(stateKey, e.target.value);
                    } else {
                        inst.state[stateKey] = e.target.value;
                    }
                });
            }
        }
        return this;
    }

    /** Conecta menu de contexto ao elemento */
    contextMenu(items) {
        if (this._isRestricted || !this.el) return this;
        if (typeof this.el.setContextMenu === 'function') {
            this.el.setContextMenu(items);
        } else {
            UIComponents.bindContextMenu(this.el, Array.isArray(items) ? items : items.items, {});
        }
        return this;
    }

    /** Anexa nós filhos (aceita Strings, Números, Signals, HTMLElement, ElementBuilder, Arrays ou falsy) */
    children(...children) {
        if (this._isRestricted || !this.el || !this.el.appendChild) return this;
        const flat = children.flat(Infinity);
        flat.forEach(child => {
            if (child === null || child === undefined || child === false) return;

            if (isSignal(child)) {
                const textNode = document.createTextNode(child.value !== undefined ? String(child.value) : '');
                this.el.appendChild(textNode);
                // [CORE-001] Guarda cleanup de Signal filho reativo
                const stop = effect(() => {
                    textNode.textContent = child.value !== undefined ? String(child.value) : '';
                });
                this._effects.push(stop);
            } else if (child instanceof ElementBuilder) {
                this.el.appendChild(child.build());
            } else if (child instanceof Node) {
                this.el.appendChild(child);
            } else if (typeof child === 'string' || typeof child === 'number') {
                this.el.appendChild(document.createTextNode(String(child)));
            } else if (typeof child === 'function') {
                const res = child(this);
                if (res) this.children(res);
            }
        });
        return this;
    }

    /** Alias para children */
    add(...children) {
        return this.children(...children);
    }

    /**
     * Anexa o elemento deste builder a um elemento pai (HTMLElement, seletor CSS ou outro ElementBuilder).
     * @param {HTMLElement|ElementBuilder|string} target
     */
    appendTo(target) {
        if (!target) return this;
        let parentEl = null;
        if (target instanceof ElementBuilder) {
            parentEl = target.el;
        } else if (target instanceof Node) {
            parentEl = target;
        } else if (typeof target === 'string') {
            parentEl = document.querySelector(target);
        }

        if (parentEl && parentEl.appendChild) {
            parentEl.appendChild(this.build());
        }
        return this;
    }

    /** Retorna o elemento DOM nativo */
    build() {
        return this.el;
    }

    /** Getter conveniente para acessar o DOM nativo */
    get node() {
        return this.el;
    }

    /**
     * [CORE-001] Libera todos os effects reativos registrados neste builder.
     * Chamar quando o componente pai for destruído (onDestroy da janela).
     * Propaga o dispose para builders filhos registrados.
     */
    dispose() {
        this._effects.forEach(stop => {
            if (typeof stop === 'function') {
                try { stop(); } catch (e) { console.warn('[ElementBuilder] Erro ao limpar effect:', e); }
            }
        });
        this._effects = [];
    }
}

/**
 * Função utilitária para normalizar qualquer argumento de nó (ElementBuilder, Node, etc.)
 */
function toNode(item) {
    if (item instanceof ElementBuilder) return item.build();
    return item;
}

/**
 * Fachada UI: Catálogo programático fluente para construir interfaces ricas no DesktopEngine.
 */
export const UI = {
    /** Cria um ElementBuilder para uma tag HTML qualquer */
    create(tag, ...children) {
        const b = new ElementBuilder(tag);
        if (children.length) b.children(...children);
        return b;
    },

    // --- Elementos HTML Base ---
    div(...children) { return UI.create('div', ...children); },
    span(...children) { return UI.create('span', ...children); },
    p(...children) { return UI.create('p', ...children); },
    h1(txt) { return UI.create('h1').text(txt); },
    h2(txt) { return UI.create('h2').text(txt); },
    h3(txt) { return UI.create('h3').text(txt); },
    h4(txt) { return UI.create('h4').text(txt); },
    label(txt) { return UI.create('label').text(txt); },
    hr() { return UI.create('hr'); },

    icon(symbolOrClass) {
        const b = UI.create('span').class('ui-icon');
        if (symbolOrClass.startsWith('fa-') || symbolOrClass.startsWith('icon-')) {
            b.class(symbolOrClass);
        } else {
            b.text(symbolOrClass);
        }
        return b;
    },

    // --- Componentes Estruturais de Layout ---
    row(...children) {
        const nodes = children.flat().map(toNode);
        return new ElementBuilder(UIComponents.Row({ children: nodes }));
    },

    col(...children) {
        const nodes = children.flat().map(toNode);
        return new ElementBuilder(UIComponents.Col({ children: nodes }));
    },

    grid(optionsOrColumns, ...children) {
        let options = {};
        if (typeof optionsOrColumns === 'number') {
            options = { columns: optionsOrColumns, children: children.flat().map(toNode) };
        } else if (optionsOrColumns && typeof optionsOrColumns === 'object') {
            options = { ...optionsOrColumns };
            if (children.length) options.children = children.flat().map(toNode);
            else if (options.children) options.children = options.children.map(toNode);
        }
        return new ElementBuilder(UIComponents.Grid(options));
    },

    card(titleOrProps, ...children) {
        let props = {};
        if (typeof titleOrProps === 'string') {
            props = { title: titleOrProps, children: children.flat().map(toNode) };
        } else if (titleOrProps && typeof titleOrProps === 'object') {
            props = { ...titleOrProps };
            if (children.length) props.children = children.flat().map(toNode);
            else if (props.children) props.children = props.children.map(toNode);
        }
        return new ElementBuilder(UIComponents.Card(props));
    },

    // --- Controles de Formulário e Entrada ---
    button(textOrOptions, onClick) {
        let opts = {};
        if (typeof textOrOptions === 'string') {
            opts = { text: textOrOptions, onClick };
        } else if (textOrOptions && typeof textOrOptions === 'object') {
            opts = { ...textOrOptions };
        }
        return new ElementBuilder(UIComponents.Button(opts));
    },

    input(labelOrProps, bind) {
        let props = {};
        if (typeof labelOrProps === 'string') {
            props = { label: labelOrProps, bind };
        } else if (labelOrProps && typeof labelOrProps === 'object') {
            props = { ...labelOrProps };
        }
        return new ElementBuilder(UIComponents.Input(props));
    },

    textarea(labelOrProps, bind) {
        let props = {};
        if (typeof labelOrProps === 'string') {
            props = { label: labelOrProps, bind };
        } else if (labelOrProps && typeof labelOrProps === 'object') {
            props = { ...labelOrProps };
        }
        return new ElementBuilder(UIComponents.Textarea(props));
    },

    select(props) {
        return new ElementBuilder(UIComponents.Select(props));
    },

    checkbox(labelOrProps, bind) {
        let props = {};
        if (typeof labelOrProps === 'string') {
            props = { label: labelOrProps, bind };
        } else if (labelOrProps && typeof labelOrProps === 'object') {
            props = { ...labelOrProps };
        }
        return new ElementBuilder(UIComponents.Checkbox(props));
    },

    toggle(labelOrProps, bind) {
        let props = {};
        if (typeof labelOrProps === 'string') {
            props = { label: labelOrProps, bind };
        } else if (labelOrProps && typeof labelOrProps === 'object') {
            props = { ...labelOrProps };
        }
        return new ElementBuilder(UIComponents.Toggle(props));
    },

    slider(props) {
        return new ElementBuilder(UIComponents.Slider(props));
    },

    radioGroup(props) {
        return new ElementBuilder(UIComponents.RadioGroup(props));
    },

    autocomplete(props) {
        return new ElementBuilder(UIComponents.Autocomplete(props));
    },

    // --- Componentes de Dados e Exibição ---
    badge(text, variant = 'primary') {
        return new ElementBuilder(UIComponents.Badge({ text, variant }));
    },

    progressBar(value = 0, max = 100) {
        return new ElementBuilder(UIComponents.ProgressBar({ value, max }));
    },

    table(options) {
        return new ElementBuilder(UIComponents.Table(options));
    },

    tabs(tabs, activeTabBind) {
        const opts = Array.isArray(tabs) ? { tabs, activeTabBind } : tabs;
        return new ElementBuilder(UIComponents.Tabs(opts));
    },

    treeView(options) {
        return new ElementBuilder(UIComponents.TreeView(options));
    },

    dataGrid(options) {
        return new ElementBuilder(UIComponents.DataGrid(options));
    },

    alert(text, variant = 'info') {
        return new ElementBuilder(UIComponents.Alert({ text, variant }));
    },

    spinner(size = '24px', color = 'currentColor') {
        return new ElementBuilder(UIComponents.Spinner({ size, color }));
    },

    accordion(items) {
        const opts = Array.isArray(items) ? { items } : items;
        return new ElementBuilder(UIComponents.Accordion(opts));
    },

    drawer(options) {
        return new ElementBuilder(UIComponents.Drawer(options));
    },

    tooltip(content, position = 'top', children) {
        return new ElementBuilder(UIComponents.Tooltip({ content, position, children }));
    },

    avatar(props) {
        return new ElementBuilder(UIComponents.Avatar(props));
    },

    shortcut(options) {
        return new ElementBuilder(UIComponents.Shortcut(options));
    },

    shortcutContainer(options) {
        return new ElementBuilder(UIComponents.ShortcutContainer(options));
    },

    dockWidget(options) {
        return new ElementBuilder(UIComponents.DockWidget(options));
    },

    floatButton(options) {
        return new ElementBuilder(UIComponents.FloatButton(options));
    },

    modal(options) {
        return UIComponents.Modal(options);
    },

    /** Instancia um componente customizado registrado via Framework.defineComponent */
    custom(name, props = {}) {
        const compDef = Framework.getComponent(name);
        if (!compDef) {
            throw new Error(`Componente customizado '${name}' não está registrado.`);
        }
        if (typeof compDef === 'function') {
            // Pode ser classe derivada de BaseComponent ou função construtora
            if (compDef.prototype && compDef.prototype.render) {
                const instance = new compDef(props);
                const el = instance.mount();
                return new ElementBuilder(el);
            } else {
                const el = compDef(props);
                return new ElementBuilder(el);
            }
        }
        throw new Error(`Definição inválida para o componente '${name}'.`);
    }
};

// Integração automática: Quando novos componentes forem definidos no Framework,
// disponibiliza atalho direto em UI[name]
const originalDefine = Framework.defineComponent;
Framework.defineComponent = function(name, compDef) {
    originalDefine.call(Framework, name, compDef);
    UI[name] = (props) => UI.custom(name, props);
    return Framework;
};
