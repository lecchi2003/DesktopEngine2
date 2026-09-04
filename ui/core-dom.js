// ui/core-dom.js
// DesktopEngine V2.0
import { Desktop } from '../desktop.js?v=2';
import { EventBus, UIContext, isSignal, effect } from '../core.js?v=2';
import { bindContextMenu } from './navigation.js';


export function resolveInstance(inst) {
    return inst || UIContext.getCurrent() || null;
}

export function createElement(tag, arg2, arg3) {
    const el = document.createElement(tag);

    // Anexa a API programática de menu de contexto a todo elemento criado no framework
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
 * Utilitário global do framework para imprimir apenas um elemento HTML específico.
 * Ele clona o HTML do elemento e os estilos da página atual para um iFrame oculto e dispara a impressão.
 */

export function printElement(element, options = {}) {
    const title = options.title || "Imprimir Documento";
    const target = typeof element === 'string' ? document.getElementById(element) : element;

    if (!target) {
        console.error("printElement: Elemento alvo não encontrado.");
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();

    // Clona os estilos da página atual para o iframe de impressão
    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
        stylesHtml += el.outerHTML;
    });

    doc.write(`
        <html>
            <head>
                <title>${title}</title>
                ${stylesHtml}
                <style>
                    body { padding: 20px; font-family: sans-serif; background: white; }
                    /* Esconde os redimensionadores ou UI desnecessária caso a pessoa imprima a janela toda */
                    .resizeHandle, .winButtons, .titlebar, .statusbar { display: none !important; }
                    .window { position: relative !important; left: 0 !important; top: 0 !important; border: none !important; box-shadow: none !important; }
                </style>
            </head>
            <body>
                ${target.outerHTML}
            </body>
        </html>
    `);
    doc.close();

    const doPrint = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error("Erro na impressão: ", err);
        } finally {
            setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 1000);
        }
    };

    // Tenta disparar logo no onload. Se falhar, tem um fallback
    let printed = false;
    iframe.onload = () => {
        if (!printed) {
            printed = true;
            doPrint();
        }
    };

    setTimeout(() => {
        if (!printed) {
            printed = true;
            doPrint();
        }
    }, 500);
}

