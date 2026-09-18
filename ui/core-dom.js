// ui/core-dom.js
// DesktopEngine V2.0
import { Desktop } from '../desktop.js?v=3';
import { EventBus, UIContext, isSignal, effect } from '../core.js?v=3';
import { bindContextMenu } from './navigation.js';

/**
 * [UI-006] Função privada única para anexar a API de menu de contexto a um elemento.
 * Elimina a duplicação entre createElement e applyCommonProps.
 */
function _attachContextMenuAPI(el) {
    el.setContextMenu = (items) => {
        if (el._contextMenuController && typeof el._contextMenuController.destroy === 'function') {
            el._contextMenuController.destroy();
        }
        if (items) {
            let menuItems = items;
            let menuOptions = {};
            if (items && !Array.isArray(items) && typeof items === 'object' && items.items) {
                menuItems = items.items;
                menuOptions = items;
            }
            el._contextMenuController = bindContextMenu(el, menuItems, menuOptions);
        } else {
            el._contextMenuController = null;
        }
        return el._contextMenuController;
    };
}


export function resolveInstance(inst) {
    return inst || UIContext.getCurrent() || null;
}

export function createElement(tag, arg2, arg3) {
    const el = document.createElement(tag);


    // [UI-006] Usa função centralizada — sem duplicação
    _attachContextMenuAPI(el);

    let children = [];
    let pendingProps = null;

    // Caso 1: Modo legado tradicional com String no 2º argumento:
    // createElement("div", "classe", [...]) ou createElement("div", "", [...])
    if (typeof arg2 === 'string') {
        if (arg2) el.className = arg2;
        if (Array.isArray(arg3)) {
            children = arg3;
        } else if (arg3 !== undefined && arg3 !== null) {
            children = [arg3];
        }
    }
    // Caso 2: Segundo argumento é um Array de filhos diretamente:
    // createElement("div", [child1, child2])
    else if (Array.isArray(arg2)) {
        children = arg2;
        if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3)) {
            pendingProps = arg3;
        }
    }
    // Caso 3: Segundo argumento é um Node do DOM:
    // createElement("div", meuElemento)
    else if (arg2 instanceof Node) {
        children = [arg2];
    }
    // Caso 4: Segundo argumento é um Objeto de propriedades/atributos:
    // createElement("div", { className: "card", id: "app" }, [children])
    else if (arg2 && typeof arg2 === 'object') {
        pendingProps = arg2;
        if (Array.isArray(arg3)) {
            children = arg3;
        } else if (arg3 !== undefined && arg3 !== null) {
            children = [arg3];
        }
    }

    // 1. Anexa filhos primeiro
    const appendChild = (child) => {
        if (child === null || child === undefined || child === false) return;
        if (typeof child === 'string' || typeof child === 'number') {
            el.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
            el.appendChild(child);
        } else if (Array.isArray(child)) {
            child.forEach(appendChild);
        }
    };

    children.forEach(appendChild);

    // 2. Aplica propriedades DEPOIS de anexar os filhos (permite que <select> encontre options ao definir value)
    if (pendingProps) {
        Object.entries(pendingProps).forEach(([key, val]) => {
            if (val === undefined || val === null) return;
            if (key === 'className' || key === 'class') {
                el.className = val;
            } else if (key === 'style' && typeof val === 'string') {
                el.style.cssText = val;
            } else if (key === 'style' && typeof val === 'object') {
                Object.assign(el.style, val);
            } else if (key === 'contextMenu' || key === 'contextmenu') {
                el.setContextMenu(val);
            } else if (key.startsWith('on') && typeof val === 'function') {
                const eventName = key.slice(2).toLowerCase();
                el.addEventListener(eventName, val);
            } else if (key in el && typeof el[key] !== 'function') {
                try { el[key] = val; } catch (e) { el.setAttribute(key, val); }
            } else {
                el.setAttribute(key, val);
            }
        });
    }

    return el;
}

export function applyCommonProps(el, props) {
    if (!el || !props) return el;

    // Suporte ao setContextMenu programático
    if (!el.setContextMenu) {
        // [UI-006] Reutiliza a função centralizada
        _attachContextMenuAPI(el);
    }

    if (props.contextMenu || props.contextmenu) {
        el.setContextMenu(props.contextMenu || props.contextmenu);
    }
    if (props.id) el.id = props.id;

    if (props.style) {
        if (typeof props.style === 'string') {
            el.style.cssText = (el.style.cssText || "") + ";" + props.style;
        } else {
            Object.assign(el.style, props.style);
        }
    }

    if (props.className || props.class) {
        const cls = props.className || props.class;
        el.className = (el.className || "") + " " + cls;
    }

    return el;
}

/**
 * [UI-002] Utilitário para imprimir um elemento HTML via iframe seguro.
 * Usa DOM API (importNode + srcdoc) em vez do depreciado doc.write() + outerHTML,
 * eliminando o vetor de XSS e a injeção de HTML não sanitizado.
 */
export function printElement(element, options = {}) {
    const title = options.title || "Imprimir Documento";
    const target = typeof element === 'string' ? document.getElementById(element) : element;

    if (!target) {
        console.error("printElement: Elemento alvo não encontrado.");
        return;
    }

    // Usar srcdoc com HTML mínimo — evita doc.open()/doc.write()
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;';
    // srcdoc inicializa o documento de forma segura
    iframe.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
    document.body.appendChild(iframe);

    const doSetup = () => {
        try {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // Ttulo seguro via textContent
            doc.title = title;

            // Clonar folhas de estilo externas (link) e internas (style) de forma segura
            document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                const clone = doc.createElement('link');
                clone.rel = 'stylesheet';
                clone.href = link.href; // URL absoluta — sem injeção
                doc.head.appendChild(clone);
            });
            document.querySelectorAll('style').forEach(style => {
                const clone = doc.createElement('style');
                clone.textContent = style.textContent; // textContent — sem innerHTML
                doc.head.appendChild(clone);
            });

            // Estilos específicos de impressão
            const printStyle = doc.createElement('style');
            printStyle.textContent = [
                'body { padding: 20px; font-family: sans-serif; background: white; }',
                '.resizeHandle, .winButtons, .titlebar, .statusbar { display: none !important; }',
                '.window { position: relative !important; left: 0 !important; top: 0 !important;',
                '          border: none !important; box-shadow: none !important; }'
            ].join('\n');
            doc.head.appendChild(printStyle);

            // Importar o elemento alvo de forma segura — sem outerHTML
            const imported = doc.importNode(target, true);
            doc.body.appendChild(imported);

            // Disparar impressão
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error("Erro na impressão:", err);
        } finally {
            setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 1000);
        }
    };

    // Aguardar o srcdoc carregar antes de manipular o DOM
    let executed = false;
    iframe.onload = () => {
        if (!executed) { executed = true; doSetup(); }
    };
    // Fallback caso onload já tenha disparado (iframe sincronamente pronto)
    setTimeout(() => {
        if (!executed) { executed = true; doSetup(); }
    }, 300);
}

