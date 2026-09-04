// ui/data.js
// DesktopEngine V2.0
import { createElement, applyCommonProps, resolveInstance } from './core-dom.js';
import { Button } from './forms.js';
import { UIContext } from '../core.js?v=2';


export function Table(options = {}) {
    const { columns = [], data = [] } = options;
    const thead = createElement("thead", "", [
        createElement("tr", "", columns.map(c => createElement("th", "", [c.label || c])))
    ]);
    const rows = data.map(row => {
        return createElement("tr", "", columns.map(c => {
            const val = typeof c === 'string' ? row[c] : row[c.key];
            if (c.render) {
                const td = document.createElement("td");
                const result = c.render(val, row);
                if (typeof result === 'string') td.innerHTML = result;
                else if (result instanceof Node) td.appendChild(result);
                return td;
            }
            return createElement("td", "", [val !== undefined && val !== null ? String(val) : ""]);
        }));
    });
    const table = createElement("table", "ui-table", [thead, createElement("tbody", "", rows)]);
    const wrapper = createElement("div", "ui-table-wrapper", [table]);
    return applyCommonProps(wrapper, options);
}

export function Tabs({ tabs = [], instance, activeTabBind }) {
    const inst = resolveInstance(instance);
    const tabContainer = document.createElement("div");
    tabContainer.className = "ui-tabs";
    const tabHeaders = document.createElement("div");
    tabHeaders.className = "ui-tab-headers";
    const tabContent = document.createElement("div");
    tabContent.className = "ui-tab-content";

    const currentTabId = (inst && inst.state && activeTabBind && inst.state[activeTabBind]) ? inst.state[activeTabBind] : (tabs[0] ? tabs[0].id : null);

    tabs.forEach(tab => {
        const header = document.createElement("div");
        header.className = `ui-tab-header ${currentTabId === tab.id ? 'active' : ''}`;
        header.textContent = tab.label;
        header.onclick = () => {
            if (inst && activeTabBind) inst.state[activeTabBind] = tab.id;
        };
        tabHeaders.appendChild(header);

        if (currentTabId === tab.id && typeof tab.view === 'function') {
            tabContent.appendChild(tab.view.call(inst || window));
        }
    });

    tabContainer.appendChild(tabHeaders);
    tabContainer.appendChild(tabContent);
    return tabContainer;
}

export function TreeView({ data = [], onSelect, instance }) {
    const inst = resolveInstance(instance);
    const createNode = (nodeData) => {
        const wrap = document.createElement("div");
        wrap.className = "ui-tree-node";
        const row = document.createElement("div");
        row.className = "ui-tree-row";
        const icon = document.createElement("span");
        icon.className = "ui-tree-icon";
        const label = document.createElement("span");
        label.className = "ui-tree-label";
        label.textContent = nodeData.label;

        const hasChildren = nodeData.children && nodeData.children.length > 0;
        icon.textContent = hasChildren ? "▶ " : "• ";

        row.appendChild(icon);
        row.appendChild(label);
        wrap.appendChild(row);

        let childrenWrap = null;
        if (hasChildren) {
            childrenWrap = document.createElement("div");
            childrenWrap.className = "ui-tree-children";
            childrenWrap.style.display = "none";
            nodeData.children.forEach(child => childrenWrap.appendChild(createNode(child)));
            wrap.appendChild(childrenWrap);
        }

        row.onclick = (e) => {
            e.stopPropagation();
            if (hasChildren) {
                const isOpen = childrenWrap.style.display === "block";
                childrenWrap.style.display = isOpen ? "none" : "block";
                icon.textContent = isOpen ? "▶ " : "▼ ";
            }
            wrap.closest('.ui-treeview')?.querySelectorAll('.ui-tree-row').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');

            if (typeof onSelect === 'function') onSelect(nodeData);
            if (typeof onSelect === 'string' && inst) inst.runAction(onSelect, nodeData);
        };
        return wrap;
    };

    const container = document.createElement("div");
    container.className = "ui-tree";
    data.forEach(node => container.appendChild(createNode(node)));
    return container;
}

export function DraggableList({ bindItems, onReorder, instance }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-draggable-list", []);

    const items = (inst && inst.state && bindItems && inst.state[bindItems]) ? inst.state[bindItems] : [];
    let draggedItemIdx = null;

    items.forEach((item, index) => {
        const row = createElement("div", "ui-draggable-item", [
            createElement("span", "drag-handle", ["☰"]),
            createElement("span", "drag-text", [typeof item === 'string' ? item : item.label || JSON.stringify(item)])
        ]);
        row.draggable = true;

        row.addEventListener('dragstart', (e) => {
            draggedItemIdx = index;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            draggedItemIdx = null;
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedItemIdx !== null && draggedItemIdx !== index) {
                const rect = row.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    row.classList.add('drag-over-top');
                    row.classList.remove('drag-over-bottom');
                } else {
                    row.classList.add('drag-over-bottom');
                    row.classList.remove('drag-over-top');
                }
            }
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-over-top', 'drag-over-bottom');
            if (draggedItemIdx !== null && draggedItemIdx !== index) {
                const rect = row.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const dropIndex = e.clientY < mid ? index : index + 1;

                const newItems = [...items];
                const [moved] = newItems.splice(draggedItemIdx, 1);

                const adjustedIndex = dropIndex > draggedItemIdx ? dropIndex - 1 : dropIndex;
                newItems.splice(adjustedIndex, 0, moved);

                if (inst && inst.state && bindItems) {
                    inst.state[bindItems] = newItems;
                }

                if (onReorder) {
                    if (typeof onReorder === 'string' && inst && typeof inst.runAction === 'function') {
                        inst.runAction(onReorder, newItems);
                    } else if (typeof onReorder === 'function') {
                        onReorder(newItems);
                    }
                }
            }
        });

        wrap.appendChild(row);
    });

    return wrap;
}

export function DataGrid(options = {}) {
    const { columns = [], bindData, instance, itemsPerPage = 5, serverSide = false, bindTotalPages = null, onPageChange = null } = options;
    if (!instance.state._gridState) instance.state._gridState = {};
    if (!instance.state._gridState[bindData]) {
        instance.state._gridState[bindData] = { sortKey: null, sortDesc: false, filters: {}, currentPage: 1 };
    }
    const gridState = instance.state._gridState[bindData];
    const rawData = instance.state[bindData] || [];

    // Filtros
    let processedData = rawData.filter(row => {
        for (let key of Object.keys(gridState.filters)) {
            const term = gridState.filters[key].toLowerCase();
            if (!term) continue;
            const val = String(row[key] || "").toLowerCase();
            if (!val.includes(term)) return false;
        }
        return true;
    });

    // Ordenação
    if (gridState.sortKey) {
        processedData.sort((a, b) => {
            const valA = a[gridState.sortKey];
            const valB = b[gridState.sortKey];
            if (valA < valB) return gridState.sortDesc ? 1 : -1;
            if (valA > valB) return gridState.sortDesc ? -1 : 1;
            return 0;
        });
    }

    const thead = document.createElement("thead");

    // Cabeçalho de Ordenação
    const trHead = document.createElement("tr");
    columns.forEach(c => {
        const th = document.createElement("th");
        th.textContent = c.label || c.key;
        if (c.sortable) {
            th.classList.add("sortable");
            const icon = document.createElement("span");
            icon.className = "sort-icon";
            icon.textContent = "▼";
            if (gridState.sortKey === c.key) {
                icon.classList.add("active");
                icon.textContent = gridState.sortDesc ? "▼" : "▲";
            }
            th.appendChild(icon);
            th.onclick = () => {
                if (gridState.sortKey === c.key) {
                    if (gridState.sortDesc) gridState.sortKey = null;
                    else gridState.sortDesc = true;
                } else {
                    gridState.sortKey = c.key;
                    gridState.sortDesc = false;
                }
                instance.update();
            };
        }
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    // Cabeçalho de Filtros
    if (columns.some(c => c.filterable)) {
        const trFilter = document.createElement("tr");
        trFilter.className = "filter-row";
        columns.forEach(c => {
            const th = document.createElement("th");
            if (c.filterable) {
                const inp = document.createElement("input");
                inp.className = "filter-input";
                inp.placeholder = "Filtrar...";
                inp.value = gridState.filters[c.key] || "";
                // Uso do bind falso para o core.js restaurar o foco após re-render
                inp.dataset.bind = `_grid_${bindData}_${c.key}`;

                inp.oninput = (e) => {
                    gridState.filters[c.key] = e.target.value;
                    instance.update();
                };
                th.appendChild(inp);
            }
            trFilter.appendChild(th);
        });
        thead.appendChild(trFilter);
    }

    // Paginação
    let totalPages = 1;
    let pagedData = processedData;

    if (serverSide) {
        if (bindTotalPages && instance.state[bindTotalPages]) {
            totalPages = instance.state[bindTotalPages];
        }
        pagedData = processedData;
    } else {
        const totalItems = processedData.length;
        totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages === 0) totalPages = 1;
        if (gridState.currentPage > totalPages) {
            gridState.currentPage = totalPages;
        }
        const startIndex = (gridState.currentPage - 1) * itemsPerPage;
        pagedData = processedData.slice(startIndex, startIndex + itemsPerPage);
    }

    const tbody = document.createElement("tbody");
    pagedData.forEach(row => {
        const tr = document.createElement("tr");
        columns.forEach(c => {
            const val = typeof c === 'string' ? row[c] : row[c.key];
            if (c.render) {
                const td = document.createElement("td");
                const result = c.render(val, row);
                if (typeof result === 'string') td.innerHTML = result;
                else if (result instanceof Node) td.appendChild(result);
                tr.appendChild(td);
            } else {
                tr.appendChild(createElement("td", "", [val !== undefined && val !== null ? String(val) : ""]));
            }
        });
        tbody.appendChild(tr);
    });

    const table = createElement("table", "ui-datagrid", [thead, tbody]);

    // UI de Paginação
    const paginationWrapper = createElement("div", "ui-pagination", []);
    const info = createElement("div", "ui-pagination-info", [`Página ${gridState.currentPage} de ${totalPages}`]);
    const btnGroup = createElement("div", "ui-pagination-buttons", []);

    const createBtn = (label, disabled, onClick) => {
        const btn = document.createElement("button");
        btn.innerHTML = label;
        btn.className = "ui-pagination-btn";
        btn.disabled = disabled;
        btn.onclick = onClick;
        return btn;
    };

    const triggerPageChange = (newPage) => {
        gridState.currentPage = newPage;
        if (onPageChange) {
            if (typeof onPageChange === 'string') instance.runAction(onPageChange, newPage);
            else onPageChange(newPage);
        } else {
            instance.update();
        }
    };

    // Ícones: Primeira (&#171;), Anterior (&#8249;), Próxima (&#8250;), Última (&#187;)
    btnGroup.appendChild(createBtn("&#171;", gridState.currentPage === 1, () => {
        triggerPageChange(1);
    }));
    btnGroup.appendChild(createBtn("&#8249;", gridState.currentPage === 1, () => {
        triggerPageChange(gridState.currentPage - 1);
    }));
    btnGroup.appendChild(createBtn("&#8250;", gridState.currentPage === totalPages, () => {
        triggerPageChange(gridState.currentPage + 1);
    }));
    btnGroup.appendChild(createBtn("&#187;", gridState.currentPage === totalPages, () => {
        triggerPageChange(totalPages);
    }));

    paginationWrapper.appendChild(info);
    paginationWrapper.appendChild(btnGroup);

    const wrapper = createElement("div", "ui-table-wrapper", [table, paginationWrapper]);
    return applyCommonProps(wrapper, options);
}

// --- COMPONENTES DE FEEDBACK E NOTIFICAÇÕES (GRUPO 1) ---

export function Accordion({ items = [], instance }) {
    const inst = resolveInstance(instance);
    const container = createElement("div", "ui-accordion");

    items.forEach((item, index) => {
        const itemEl = createElement("div", "ui-accordion-item");

        const header = createElement("div", "ui-accordion-header", [
            createElement("span", "ui-accordion-title", [item.title]),
            createElement("span", "ui-accordion-icon", ["▼"])
        ]);

        const content = createElement("div", "ui-accordion-content");
        if (typeof item.content === 'string') {
            content.innerHTML = item.content;
        } else if (item.content instanceof Node) {
            content.appendChild(item.content);
        } else if (typeof item.content === 'function') {
            const res = item.content.call(inst || window);
            if (typeof res === 'string') content.innerHTML = res;
            else if (res instanceof Node) content.appendChild(res);
        }

        header.onclick = () => {
            const isOpen = itemEl.classList.contains("open");
            container.querySelectorAll('.ui-accordion-item').forEach(el => el.classList.remove("open"));
            if (!isOpen) itemEl.classList.add("open");
        };

        itemEl.appendChild(header);
        itemEl.appendChild(content);
        container.appendChild(itemEl);
    });

    return container;
}

