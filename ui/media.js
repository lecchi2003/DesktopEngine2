// ui/media.js
// DesktopEngine V2.0
import { createElement, applyCommonProps, resolveInstance } from './core-dom.js';


export function WebView({ bindUrl, instance, height = "100%" }) {
    const inst = resolveInstance(instance);
    const wrap = createElement("div", "ui-webview-wrap", []);
    wrap.style.height = height;

    const iframe = document.createElement("iframe");
    iframe.className = "ui-webview";

    if (bindUrl && inst && inst.state) {
        if (inst.state[bindUrl]) {
            iframe.src = inst.state[bindUrl];
        }
    }

    wrap.appendChild(iframe);
    return wrap;
}

export function Avatar({ src, initials, size = 40, status }) {
    const wrap = createElement("div", "ui-avatar-wrap");
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
    wrap.style.fontSize = `${size / 2.5}px`;

    const img = document.createElement("img");
    img.className = "ui-avatar-img";

    if (src) {
        img.src = src;
        img.onerror = () => {
            img.style.display = "none";
            if (initials) {
                const initEl = createElement("div", "ui-avatar-initials", [initials]);
                wrap.appendChild(initEl);
            }
        };
        wrap.appendChild(img);
    } else if (initials) {
        const initEl = createElement("div", "ui-avatar-initials", [initials]);
        wrap.appendChild(initEl);
    }

    if (status) {
        const statusBadge = createElement("span", `ui-avatar-status ui-status-${status}`, []);
        wrap.appendChild(statusBadge);
    }

    return wrap;
}

export function Carousel({ items = [], height = "200px", prevControl, nextControl, controlsPosition = "side" }) {
    const wrap = createElement("div", `ui-carousel-wrap pos-${controlsPosition}`);

    const track = createElement("div", "ui-carousel");
    track.style.height = height;

    items.forEach(item => {
        const slide = createElement("div", "ui-carousel-slide");
        if (typeof item === 'string') {
            slide.innerHTML = item;
        } else if (item instanceof Node) {
            slide.appendChild(item);
        }
        track.appendChild(slide);
    });

    if (prevControl && nextControl) {
        const btnPrev = createElement("div", "ui-carousel-control prev");
        if (typeof prevControl === 'string') btnPrev.innerHTML = prevControl;
        else if (prevControl instanceof Node) btnPrev.appendChild(prevControl);

        const btnNext = createElement("div", "ui-carousel-control next");
        if (typeof nextControl === 'string') btnNext.innerHTML = nextControl;
        else if (nextControl instanceof Node) btnNext.appendChild(nextControl);

        btnPrev.onclick = () => {
            track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' });
        };
        btnNext.onclick = () => {
            track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' });
        };

        if (controlsPosition === "side") {
            wrap.appendChild(btnPrev);
            wrap.appendChild(track);
            wrap.appendChild(btnNext);
        } else {
            const controlsRow = createElement("div", `ui-carousel-controls-row pos-${controlsPosition}`);
            controlsRow.appendChild(btnPrev);
            controlsRow.appendChild(btnNext);

            if (controlsPosition.startsWith("top")) {
                wrap.appendChild(controlsRow);
                wrap.appendChild(track);
            } else if (controlsPosition.startsWith("bottom")) {
                wrap.appendChild(track);
                wrap.appendChild(controlsRow);
            }
        }
    } else {
        wrap.appendChild(track);
    }

    return wrap;
}

