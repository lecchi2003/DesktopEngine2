// ui/sanitize.js
// DesktopEngine V2.0 — Módulo de Sanitização HTML
// [SEC-001] Protege contra XSS em componentes que aceitam HTML como string.
// Usa DOMParser nativo (sem dependências externas) + allowlist de elementos/atributos.

/**
 * Elementos HTML seguros permitidos no conteúdo de componentes.
 * Bloqueia: script, iframe, object, embed, form, input, button, link, meta, style, base
 */
const ALLOWED_TAGS = new Set([
    'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
    'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del',
    'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins',
    'kbd', 'label', 'legend', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'picture',
    'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small', 'source',
    'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot',
    'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
    'text', 'tspan', 'g', 'defs', 'use', 'symbol', 'clipPath', 'mask',
    'linearGradient', 'radialGradient', 'stop', 'animate', 'animateTransform',
    'feBlend', 'feColorMatrix', 'feComposite', 'feFlood', 'feGaussianBlur',
    'feMerge', 'feMergeNode', 'feOffset', 'filter', 'title', 'desc'
]);

const BLOCKED_ATTRS = new Set(['formaction', 'ping', 'data-bind']);
const URL_ATTRS = new Set(['href', 'src', 'cite', 'poster', 'srcset']);
const SAFE_URL_PATTERN = /^(?:https?:\/\/|\/|\.\/|#|mailto:|tel:|data:image\/)/i;

function sanitizeNode(node) {
    const children = [...node.childNodes];
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            if (!ALLOWED_TAGS.has(tag)) {
                child.remove();
                continue;
            }
            const attrs = [...child.attributes];
            for (const attr of attrs) {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on')) { child.removeAttribute(attr.name); continue; }
                if (BLOCKED_ATTRS.has(name)) { child.removeAttribute(attr.name); continue; }
                if (URL_ATTRS.has(name)) {
                    const val = attr.value.trim();
                    if (val && !SAFE_URL_PATTERN.test(val)) { child.removeAttribute(attr.name); continue; }
                }
            }
            sanitizeNode(child);
        }
    }
}

/**
 * Retorna uma string HTML sanitizada, segura para inserção via innerHTML.
 * @param {string} html
 * @returns {string}
 */
export function safeHTML(html) {
    if (typeof html !== 'string' || !html.trim()) return '';
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        sanitizeNode(doc.body);
        return doc.body.innerHTML;
    } catch (e) {
        console.warn('[DesktopEngine] safeHTML: erro na sanitizacao, conteudo bloqueado.', e);
        return '';
    }
}

/**
 * Define o conteudo HTML de um elemento de forma segura.
 * Substitui `el.innerHTML = html` nos componentes de UI.
 * @param {HTMLElement} el
 * @param {string} html
 */
export function safeSetHTML(el, html) {
    if (!(el instanceof Element)) return;
    // Usar Sanitizer API nativa se disponivel (Chrome 116+)
    if (typeof el.setHTML === 'function') {
        try { el.setHTML(html ?? ''); return; } catch (e) { /* fallback */ }
    }
    el.innerHTML = safeHTML(html ?? '');
}
