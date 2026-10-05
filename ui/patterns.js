// ui/patterns.js
// Padrões de tela reutilizáveis — barra de filtro, estado vazio e card de KPI.
// Evitam que cada tela redesenhe os mesmos blocos inline (dezenas de telas
// repetiam exatamente este código com <style> literal).
//
//   view() {
//       return UI.col({ children: [
//           UI.filterBar({ search: { placeholder: 'Buscar...', value: this.state.search,
//               onInput: (v) => { this.state.search = v; },
//               onSearch: () => this.load() } }),
//           this.state.loading ? UI.spinner()
//               : this.state.rows.length === 0 ? UI.emptyState({ icon: '👥', message: 'Nenhum registro.' })
//               : UI.table({ columns, data: this.state.rows }),
//       ]});
//   }

import { createElement } from './core-dom.js';
import { Button } from './forms.js';

/**
 * Normaliza um filho para nó DOM: aceita nós, builders (ElementBuilder tem
 * `.build()`) e objetos `{ el }`. Retorna `null` para entradas vazias.
 */
function toNode(child) {
    if (child === null || child === undefined || child === false) return null;
    if (child instanceof Node) return child;
    if (Array.isArray(child)) {
        const frag = document.createDocumentFragment();
        child.forEach((c) => { const n = toNode(c); if (n) frag.appendChild(n); });
        return frag;
    }
    if (typeof child.build === 'function') return toNode(child.build());
    if (child.el instanceof Node) return child.el;
    return null;
}

/**
 * Barra de filtro: input de busca (Enter dispara onSearch) + children
 * (selects, labels…) + actions (botões). Sem onSearch, o botão 'Buscar'
 * não é criado.
 *
 * search: { placeholder, value, onInput(value), onSearch(value), buttonLabel }
 * children: Element[] extras no meio da barra
 * actions: Element[] botões finais
 */
export function FilterBar({ search = null, children = [], actions = [], instance = null } = {}) {
    const nodes = [];
    let input = null;

    if (search) {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'ui-filter-search';
        input.placeholder = search.placeholder || 'Buscar...';
        if (search.value !== undefined && search.value !== null) input.value = search.value;
        if (search.onInput) {
            input.addEventListener('input', (e) => search.onInput(e.target.value, e));
        }
        if (search.onSearch) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') search.onSearch(input.value, e);
            });
        }
        nodes.push(input);
    }

    // Aceita nós DOM e builders (ElementBuilder/`{ el }`) — normaliza antes de montar.
    const normalizedChildren = [];
    children.forEach((c) => { const n = toNode(c); if (n) normalizedChildren.push(n); });
    nodes.push(...normalizedChildren);

    if (actions && actions.length) {
        const normalizedActions = [];
        actions.forEach((a) => { const n = toNode(a); if (n) normalizedActions.push(n); });
        nodes.push(...normalizedActions);
    } else if (input && search.onSearch) {
        nodes.push(Button({
            text: search.buttonLabel || 'Buscar',
            instance,
            onClick: () => search.onSearch(input.value),
        }));
    }

    return createElement('div', 'ui-filter-bar', nodes);
}

/**
 * Estado vazio de lista: ícone + mensagem + dica opcional + ação opcional.
 * `action`: nó pronto OU config de botão { text, onClick, variant }.
 */
export function EmptyState({ icon = '📂', message = 'Nenhum registro encontrado.', hint = null, action = null } = {}) {
    const kids = [];
    if (icon) kids.push(createElement('div', 'ui-empty-icon', [String(icon)]));
    kids.push(createElement('p', 'ui-empty-message', [String(message ?? '')]));
    if (hint) kids.push(createElement('p', 'ui-empty-hint', [String(hint)]));
    if (action) {
        // Nó pronto, builder/`{ el }` ou config de botão { text, onClick, variant }
        const node = toNode(action);
        kids.push(node || Button(action));
    }
    return createElement('div', 'ui-empty-state', kids);
}

/**
 * Card de KPI (dashboards): rótulo em caixa alta, valor grande, ícone e
 * cor de destaque opcional (`color` vira a borda esquerda do card).
 */
export function KpiCard({ label = '', value = null, icon = null, color = null, hint = null } = {}) {
    const head = [];
    if (icon) head.push(createElement('span', 'ui-kpi-icon', [String(icon)]));
    head.push(createElement('span', 'ui-kpi-label', [String(label)]));

    const kids = [createElement('div', 'ui-kpi-head', head)];
    kids.push(createElement('div', 'ui-kpi-value', [value !== null && value !== undefined && value !== '' ? String(value) : '—']));
    if (hint) kids.push(createElement('div', 'ui-kpi-hint', [String(hint)]));

    const card = createElement('div', 'ui-kpi-card', kids);
    if (color) card.style.setProperty('--kpi-accent', color);
    return card;
}
