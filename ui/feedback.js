// ui/feedback.js
// DesktopEngine V2.0
import { createElement, applyCommonProps, resolveInstance } from './core-dom.js';
import { Desktop } from '../desktop.js?v=2';


export function Badge({ text, variant = "primary" }) {
    return createElement("span", `ui-badge ui-badge-${variant}`, [text]);
}

export function ProgressBar({ value = 0, max = 100 }) {
    const wrap = createElement("div", "ui-progress-wrap", []);
    const bar = createElement("div", "ui-progress-bar", []);
    bar.style.width = `${(value / max) * 100}%`;
    wrap.appendChild(bar);
    return wrap;
}

export function Modal({
    title,
    icon = "🪟",
    children = [],
    onClose,
    beforeClose,
    showCloseButton = true,
    closable = true,
    instance = null,
    targetContainer = null,
    global = false,
    width,
    height,
    animation = "",
    closeAnimation = ""
} = {}) {
    const overlay = createElement("div", "ui-modal-overlay", []);
    const content = [];
    const hasCloseBtn = (showCloseButton !== false && closable !== false);

    // [UI-009] AbortController garante que o listener de Escape é sempre removido,
    // mesmo que o modal seja destruído por um fechamento externo (janela pai fechada).
    const escController = new AbortController();

    const closeModal = async () => {
        escController.abort(); // Remove o listener de Escape imediatamente
        if (typeof beforeClose === 'function') {
            try {
                const canClose = await beforeClose();
                if (canClose === false) return;
            } catch (err) {
                console.error("Erro no hook beforeClose do Modal:", err);
            }
        }
        if (onClose && instance) instance.runAction(onClose);
        else if (typeof onClose === 'function') onClose();

        const animClose = closeAnimation || animation;
        if (animClose && animClose !== 'none') {
            overlay.classList.add(`anim-close-${animClose}`);
            overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
        } else {
            overlay.classList.remove("show");
            setTimeout(() => {
                overlay.remove();
            }, 150);
        }
        document.removeEventListener('keydown', escListener);
    };

    const modalApi = {
        element: overlay,
        close: () => closeModal()
    };

    if (title) {
        const headerChildren = [];
        if (icon) {
            headerChildren.push(createElement("span", "titleIcon windowIcon ui-modal-icon", [icon]));
        }
        headerChildren.push(createElement("span", "titleText windowTitle ui-modal-title", [title]));

        if (hasCloseBtn) {
            const closeBtn = createElement("div", "winBtn close ui-modal-close", ["✕"]);
            closeBtn.title = "Fechar";
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeModal();
            };
            const btnGroup = createElement("div", "winButtons windowControls ui-modal-controls", [closeBtn]);
            headerChildren.push(btnGroup);
        }

        const header = createElement("div", "titlebar windowTitleBar ui-modal-header", headerChildren);
        content.push(header);
    }

    const resolvedChildren = typeof children === 'function' ? children(modalApi) : children;
    const body = createElement("div", "windowBody ui-modal-body", Array.isArray(resolvedChildren) ? resolvedChildren : [resolvedChildren]);
    content.push(body);

    const dialog = createElement("div", "window ui-modal-dialog active", content);
    modalApi.dialog = dialog;
    if (width) dialog.style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) dialog.style.height = typeof height === 'number' ? `${height}px` : height;

    overlay.appendChild(dialog);

    // [UI-009] Registrar listener de Escape com AbortController (auto-remove ao fechar)
    const escListener = (e) => {
        if (e.key === 'Escape' && hasCloseBtn) closeModal();
    };
    document.addEventListener('keydown', escListener, { signal: escController.signal });

    // [UI-009] Safety net: se o overlay for removido do DOM por um agente externo,
    // aborta o controller para não deixar listener zombie no document.
    const _escObserver = new MutationObserver(() => {
        if (!document.contains(overlay)) {
            escController.abort();
            _escObserver.disconnect();
        }
    });
    _escObserver.observe(document.body, { childList: true, subtree: true });

    // Resolve Container: se global for true ou se não tiver instance nem targetContainer, assume Desktop (#app)
    let container = targetContainer;
    if (!container) {
        if (global || !instance) {
            container = document.getElementById("app") || document.body;
        } else if (instance && instance.windowEl) {
            container = instance.windowEl;
        } else {
            container = document.getElementById("app") || document.body;
        }
    }

    // Se o container não tem posição definida, forçar relativa
    if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
    }

    if (animation && animation !== 'none') {
        overlay.classList.add(`anim-open-${animation}`);
    }

    container.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    overlay.close = closeModal;
    overlay.modalApi = modalApi;
    return overlay;
}

// --- V0.3 NOVOS COMPONENTES ---

export function Alert({ text, variant = "info" }) {
    // variants: info, success, warning, error
    const alertEl = createElement("div", `ui-alert ui-alert-${variant}`, [text]);
    return alertEl;
}

export function Spinner({ size = "24px", color = "currentColor" }) {
    const spinner = createElement("div", "ui-spinner", []);
    spinner.style.width = size;
    spinner.style.height = size;
    spinner.style.borderColor = `${color} transparent transparent transparent`;
    return spinner;
}

export function Toast({ message, type = "info", duration = 3000 }) {
    // Certifica-se de que o container de toasts existe
    let container = document.getElementById("ui-toast-container");
    if (!container) {
        container = createElement("div", "", []);
        container.id = "ui-toast-container";
        document.body.appendChild(container);
    }

    const toast = createElement("div", `ui-toast ui-toast-${type}`, [message]);
    container.appendChild(toast);

    // Força um reflow para garantir a animação de entrada
    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");
        // [UI-008] { once: true } previne chamadas múltiplas se várias propriedades CSS animarem
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// --- NAVEGAÇÃO E LAYOUT (GRUPO 2) ---

export function Tooltip({ content, position = "top", children }) {
    // children: elemento que vai acionar o tooltip no hover
    const wrap = createElement("div", "ui-tooltip-wrap");

    const tooltipText = createElement("span", `ui-tooltip-text ui-tooltip-${position}`, [content]);

    if (typeof children === 'string') {
        wrap.appendChild(document.createTextNode(children));
    } else if (children instanceof Node) {
        wrap.appendChild(children);
    }

    wrap.appendChild(tooltipText);
    return wrap;
}

export function Skeleton({ width = "100%", height = "20px", shape = "rect" }) {
    const el = createElement("div", `ui-skeleton ui-skeleton-${shape}`);
    el.style.width = typeof width === 'number' ? `${width}px` : width;
    el.style.height = typeof height === 'number' ? `${height}px` : height;
    return el;
}

// --- DOCK WIDGET (COLLAPSIBLE TRAY / MESSENGER / LOG DOCK) ---

