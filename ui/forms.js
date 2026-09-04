// ui/forms.js
// DesktopEngine V2.0
import { createElement, applyCommonProps, resolveInstance } from './core-dom.js';
import { UIContext, isSignal, effect } from '../core.js?v=2';

export function Form({ fields = [], actions = [] }) {
    const content = [];
    if (fields.length) content.push(createElement("div", "ui-form-fields", fields));
    if (actions.length) content.push(createElement("div", "ui-actions", actions));
    return createElement("div", "ui-form", content);
}

export function Input({ label, bind, instance, type = "text", placeholder = "", width = "100%", style = "" }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field");
    if (width !== "100%") wrap.style.width = width;
    if (style) wrap.style.cssText += style;

    if (label) wrap.appendChild(createElement("label", "", [label]));

    const inp = document.createElement("input");
    inp.type = type;
    inp.placeholder = placeholder;

    if (isSignal(bind)) {
        inp.value = bind.value !== undefined ? bind.value : "";
        effect(() => {
            if (inp !== document.activeElement) {
                inp.value = bind.value !== undefined ? bind.value : "";
            }
        });
        inp.addEventListener("input", (e) => {
            bind.value = e.target.value;
        });
    } else if (bind && inst) {
        inp.dataset.bind = bind;
        inp.value = inst.state[bind] !== undefined ? inst.state[bind] : "";
        inp.addEventListener("input", (e) => {
            if (typeof inst._setSilentState === 'function') {
                inst._setSilentState(bind, e.target.value);
            } else {
                inst.state[bind] = e.target.value;
            }
        });
    }
    wrap.appendChild(inp);
    return wrap;
}

export function Textarea({ label, bind, instance, placeholder = "", rows = 4, width = "100%", style = "", inputStyle = "" }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field");
    if (width !== "100%") wrap.style.width = width;
    if (style) wrap.style.cssText += style;

    if (label) wrap.appendChild(createElement("label", "", [label]));

    const txt = document.createElement("textarea");
    txt.className = "filter-input";
    txt.rows = rows;
    txt.placeholder = placeholder;
    if (inputStyle) txt.style.cssText += inputStyle;

    if (isSignal(bind)) {
        txt.value = bind.value !== undefined ? bind.value : "";
        effect(() => {
            if (txt !== document.activeElement) {
                txt.value = bind.value !== undefined ? bind.value : "";
            }
        });
        txt.addEventListener("input", (e) => {
            bind.value = e.target.value;
        });
    } else if (bind && inst) {
        txt.dataset.bind = bind;
        txt.value = inst.state[bind] !== undefined ? inst.state[bind] : "";
        txt.addEventListener("input", (e) => {
            if (typeof inst._setSilentState === 'function') {
                inst._setSilentState(bind, e.target.value);
            } else {
                inst.state[bind] = e.target.value;
            }
        });
    }
    wrap.appendChild(txt);
    return wrap;
}

export function Button(options = {}) {
    const { text, onClick, variant = "primary" } = options;
    const inst = resolveInstance(options.instance);
    const btn = createElement("button", `ui-btn ui-btn-${variant}`, [text]);
    if (onClick) {
        if (typeof onClick === "function") {
            btn.addEventListener("click", (e) => onClick(e, inst));
        } else if (typeof onClick === "string" && inst && typeof inst.runAction === "function") {
            btn.addEventListener("click", () => inst.runAction(onClick));
        }
    }
    return applyCommonProps(btn, options);
}

export function Select({ label, bind, instance, options = [], onChange }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field");
    if (label) wrap.appendChild(createElement("label", "", [label]));

    const select = document.createElement("select");
    const currentVal = isSignal(bind) 
        ? bind.value 
        : ((bind && inst && inst.state) ? inst.state[bind] : undefined);

    options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value !== undefined ? opt.value : opt;
        option.textContent = opt.label !== undefined ? opt.label : opt;
        if (currentVal !== undefined && currentVal === option.value) option.selected = true;
        select.appendChild(option);
    });

    if (isSignal(bind)) {
        effect(() => {
            select.value = bind.value !== undefined ? bind.value : "";
        });
        select.addEventListener("change", (e) => {
            bind.value = e.target.value;
            if (typeof onChange === 'function') onChange(e.target.value, e);
        });
    } else if (bind && inst) {
        select.dataset.bind = bind;
        select.addEventListener("change", (e) => {
            if (inst.state) inst.state[bind] = e.target.value;
            if (typeof onChange === 'function') onChange(e.target.value, e);
            else if (typeof onChange === 'string' && typeof inst.runAction === 'function') inst.runAction(onChange, e);
        });
    } else if (typeof onChange === 'function') {
        select.addEventListener("change", (e) => onChange(e.target.value, e));
    }
    wrap.appendChild(select);
    return wrap;
}

export function Checkbox({ label, bind, instance }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("label", "ui-checkbox-wrap", [
        createElement("input", "ui-checkbox", []),
        createElement("span", "ui-checkbox-label", [label])
    ]);
    const inp = wrap.querySelector("input");
    inp.type = "checkbox";

    if (isSignal(bind)) {
        inp.checked = !!bind.value;
        effect(() => {
            inp.checked = !!bind.value;
        });
        inp.addEventListener("change", (e) => {
            bind.value = e.target.checked;
        });
    } else if (bind && inst) {
        inp.dataset.bind = bind;
        inp.checked = !!(inst.state && inst.state[bind]);
        inp.addEventListener("change", (e) => {
            if (inst.state) inst.state[bind] = e.target.checked;
        });
    }
    return wrap;
}

export function Toggle({ label, bind, instance }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("label", "ui-toggle-wrap", [
        createElement("input", "ui-toggle-input", []),
        createElement("span", "ui-toggle-slider", []),
        createElement("span", "ui-toggle-label", [label])
    ]);
    const inp = wrap.querySelector("input");
    inp.type = "checkbox";

    if (isSignal(bind)) {
        inp.checked = !!bind.value;
        effect(() => {
            inp.checked = !!bind.value;
        });
        inp.addEventListener("change", (e) => {
            bind.value = e.target.checked;
        });
    } else if (bind && inst) {
        inp.dataset.bind = bind;
        inp.checked = !!(inst.state && inst.state[bind]);
        inp.addEventListener("change", (e) => {
            if (inst.state) inst.state[bind] = e.target.checked;
        });
    }
    return wrap;
}

export function Slider({ label, bind, min = 0, max = 100, step = 1, instance }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field ui-slider-wrap");

    const topRow = createElement("div", "ui-slider-header", []);
    if (label) topRow.appendChild(createElement("label", "", [label]));

    const valueDisplay = createElement("span", "ui-slider-value", []);
    topRow.appendChild(valueDisplay);
    wrap.appendChild(topRow);

    const inp = document.createElement("input");
    inp.type = "range";
    inp.className = "ui-slider-input";
    inp.min = min;
    inp.max = max;
    inp.step = step;

    const updateDisplay = (val) => {
        valueDisplay.textContent = val;
        const percent = ((val - min) / (max - min)) * 100;
        inp.style.backgroundSize = `${percent}% 100%`;
    };

    if (isSignal(bind)) {
        inp.value = bind.value !== undefined ? bind.value : min;
        updateDisplay(inp.value);
        effect(() => {
            if (inp !== document.activeElement) {
                inp.value = bind.value !== undefined ? bind.value : min;
                updateDisplay(inp.value);
            }
        });
        inp.addEventListener("input", (e) => {
            updateDisplay(Number(e.target.value));
            bind.value = Number(e.target.value);
        });
    } else if (bind && inst) {
        inp.dataset.bind = bind;
        let currentVal = (inst.state && inst.state[bind] !== undefined) ? inst.state[bind] : min;
        inp.value = currentVal;
        updateDisplay(currentVal);
        inp.addEventListener("input", (e) => {
            updateDisplay(Number(e.target.value));
        });

        inp.addEventListener("change", (e) => {
            if (inst.state) inst.state[bind] = Number(e.target.value);
        });
    } else {
        inp.value = min;
        updateDisplay(min);
        inp.addEventListener("input", (e) => updateDisplay(e.target.value));
    }

    wrap.appendChild(inp);
    return wrap;
}

export function RadioGroup({ label, name, bind, options = [], instance, layout = "vertical" }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field ui-radiogroup-wrap");
    if (label) wrap.appendChild(createElement("label", "ui-radiogroup-label", [label]));

    const container = createElement("div", `ui-radiogroup ui-radiogroup-${layout}`);
    const groupName = name || `radio_${(bind && bind.name) || Math.random().toString(36).substr(2, 5)}`;

    options.forEach(opt => {
        const lbl = document.createElement("label");
        lbl.className = "ui-radio-label";

        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = groupName;
        inp.value = opt.value !== undefined ? opt.value : opt;

        if (isSignal(bind)) {
            if (bind.value === inp.value) inp.checked = true;
            effect(() => {
                inp.checked = (bind.value === inp.value);
            });
            inp.addEventListener("change", (e) => {
                if (e.target.checked) bind.value = inp.value;
            });
        } else if (bind && inst) {
            inp.dataset.bind = bind;
            if (inst.state && inst.state[bind] === inp.value) inp.checked = true;

            inp.addEventListener("change", (e) => {
                if (e.target.checked && inst.state) {
                    inst.state[bind] = inp.value;
                }
            });
        }

        lbl.appendChild(inp);
        lbl.appendChild(document.createTextNode(" " + (opt.label !== undefined ? opt.label : opt)));
        container.appendChild(lbl);
    });

    wrap.appendChild(container);
    return wrap;
}

export function Autocomplete({ label, bind, options = [], instance, placeholder = "Digite para buscar...", multiple = false }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-field ui-autocomplete-wrap");
    if (label) wrap.appendChild(createElement("label", "", [label]));

    const listId = `dl_${Math.random().toString(36).substr(2, 5)}`;
    const chipsContainer = createElement("div", "ui-autocomplete-chips");

    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ui-autocomplete-input";
    inp.placeholder = placeholder;
    inp.setAttribute("list", listId);

    const datalist = document.createElement("datalist");
    datalist.id = listId;

    options.forEach(opt => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value || opt;
        if (opt.label) optionEl.textContent = opt.label;
        datalist.appendChild(optionEl);
    });

    if (isSignal(bind)) {
        inp.value = bind.value !== undefined ? bind.value : "";
        effect(() => {
            if (inp !== document.activeElement) inp.value = bind.value !== undefined ? bind.value : "";
        });
        inp.addEventListener("input", (e) => {
            bind.value = e.target.value;
        });
    } else if (bind && inst) {
        inp.dataset.bind = bind;

        if (multiple) {
            const currentArr = Array.isArray(inst.state && inst.state[bind]) ? inst.state[bind] : [];
            currentArr.forEach(val => {
                const chip = createElement("span", "ui-chip", [val]);
                const closeBtn = createElement("span", "ui-chip-close", ["×"]);
                closeBtn.onclick = () => {
                    if (inst.state) inst.state[bind] = inst.state[bind].filter(item => item !== val);
                };
                chip.appendChild(closeBtn);
                chipsContainer.appendChild(chip);
            });

            inp.addEventListener("change", (e) => {
                const val = e.target.value.trim();
                if (val && inst.state) {
                    const current = Array.isArray(inst.state[bind]) ? inst.state[bind] : [];
                    if (!current.includes(val)) {
                        inst.state[bind] = [...current, val];
                    }
                }
                e.target.value = "";
            });
        } else {
            inp.value = (inst.state && inst.state[bind] !== undefined) ? inst.state[bind] : "";
            inp.addEventListener("input", (e) => {
                if (typeof inst._setSilentState === 'function') {
                    inst._setSilentState(bind, e.target.value);
                } else if (inst.state) {
                    inst.state[bind] = e.target.value;
                }
            });
        }
    }

    if (multiple) wrap.appendChild(chipsContainer);
    wrap.appendChild(inp);
    wrap.appendChild(datalist);
    return wrap;
}

export function Stepper({ steps = [], currentStep = 0 }) {
    const container = createElement("div", "ui-stepper");

    steps.forEach((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;

        const stepEl = createElement("div", `ui-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`);

        const circle = createElement("div", "ui-step-circle", [String(index + 1)]);
        const label = createElement("div", "ui-step-label", [step]);

        stepEl.appendChild(circle);
        stepEl.appendChild(label);
        container.appendChild(stepEl);

        if (index < steps.length - 1) {
            const line = createElement("div", `ui-step-line ${isCompleted ? 'completed' : ''}`);
            container.appendChild(line);
        }
    });

    return container;
}
