// ui/layout.js
// DesktopEngine V2.0
import { createElement, applyCommonProps } from './core-dom.js';


export function Row(options = {}) {
    const { children = [], style = "" } = options;
    const el = createElement("div", "ui-row", children);
    if (style) el.style.cssText = style;
    return applyCommonProps(el, options);
}

export function Col(options = {}) {
    const { children = [], style = "" } = options;
    const el = createElement("div", "ui-col", children);
    if (style) el.style.cssText = style;
    return applyCommonProps(el, options);
}

export function Grid(options = {}) {
    const { children = [], columns = 2 } = options;
    const el = createElement("div", "ui-grid", children);
    el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    return applyCommonProps(el, options);
}

export function Card(options = {}) {
    const { title, children = [] } = options;
    const content = [];
    if (title) content.push(createElement("h3", "ui-card-title", [title]));
    content.push(...children);
    const el = createElement("div", "ui-card", content);
    return applyCommonProps(el, options);
}

