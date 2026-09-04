// ui/navigation.js
// DesktopEngine V2.0
import { createElement, applyCommonProps, resolveInstance } from './core-dom.js';
import { Desktop } from '../desktop.js?v=2';
import { EventBus, UIContext } from '../core.js?v=2';


export function ContextMenu({ x, y, items = [] }) {
    document.querySelectorAll(".ui-context-menu, .ui-bottom-sheet-backdrop").forEach(el => el.remove());

    const isMobileMode = (typeof window !== 'undefined' && window.Desktop && typeof window.Desktop.isMobile === 'function')
        ? window.Desktop.isMobile()
        : (window.innerWidth <= 768 || !!document.getElementById("app")?.classList.contains("mobile-mode"));

    if (isMobileMode) {
        const currentLaf = (typeof window !== 'undefined' && window.Desktop && typeof window.Desktop.getLookAndFeel === 'function')
            ? window.Desktop.getLookAndFeel()
            : (document.documentElement.getAttribute('data-laf') || 'default');
        const backdrop = createElement("div", "ui-bottom-sheet-backdrop", []);
        const sheet = createElement("div", "ui-bottom-sheet", [
            createElement("div", "bottom-sheet-handle-bar", [
                createElement("div", "bottom-sheet-handle", [])
            ]),
            createElement("div", "bottom-sheet-content", [])
        ]);
        if (currentLaf && currentLaf !== 'default') {
            backdrop.setAttribute('data-laf', currentLaf);
            sheet.setAttribute('data-laf', currentLaf);
        }

        const contentEl = sheet.querySelector(".bottom-sheet-content");

        const closeBottomSheet = () => {
            sheet.classList.remove("show");
            backdrop.classList.remove("show");
            setTimeout(() => {
                backdrop.remove();
            }, 250);
        };

        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeBottomSheet();
        };

        function buildMobileLevel(list) {
            const container = createElement("div", "bottom-sheet-sub-list", []);
            list.forEach(item => {
                if (item === "separator") {
                    container.appendChild(createElement("div", "bottom-sheet-sep", []));
                } else if (item.items && item.items.length > 0) {
                    const header = createElement("div", "bottom-sheet-option has-submenu", [
                        item.icon ? createElement("span", "bottom-sheet-icon", [item.icon]) : null,
                        createElement("span", "bottom-sheet-label", [item.label || ""]),
                        createElement("span", "drawer-accordion-arrow", ["▼"])
                    ].filter(Boolean));

                    const group = createElement("div", "bottom-sheet-group", [header]);
                    const subList = buildMobileLevel(item.items);
                    subList.style.display = "none";

                    header.onclick = (e) => {
                        e.stopPropagation();
                        const isOpen = subList.style.display === "flex";
                        subList.style.display = isOpen ? "none" : "flex";
                        header.classList.toggle("expanded", !isOpen);
                    };
                    group.appendChild(subList);
                    container.appendChild(group);
                } else {
                    const optChildren = [];
                    if (item.icon) {
                        optChildren.push(createElement("span", "bottom-sheet-icon", [item.icon]));
                    }
                    optChildren.push(createElement("span", "bottom-sheet-label", [item.label || ""]));
                    if (item.shortcut) {
                        optChildren.push(createElement("span", "bottom-sheet-shortcut", [item.shortcut]));
                    }

                    const opt = createElement("div", "bottom-sheet-option", optChildren);
                    opt.onclick = (e) => {
                        e.stopPropagation();
                        closeBottomSheet();
                        if (item.screen) {
                            const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                            if (d && typeof d.openScreen === 'function') {
                                d.openScreen(item.screen, item.props);
                            }
                        } else if (item.action) {
                            item.action();
                        }
                    };
                    container.appendChild(opt);
                }
            });
            return container;
        }

        contentEl.appendChild(buildMobileLevel(items));

        // Botão de Cancelar
        const cancelBtn = createElement("button", "bottom-sheet-cancel-btn", ["✕ Cancelar"]);
        cancelBtn.onclick = closeBottomSheet;
        sheet.appendChild(cancelBtn);

        backdrop.appendChild(sheet);
        document.body.appendChild(backdrop);

        requestAnimationFrame(() => {
            backdrop.classList.add("show");
            sheet.classList.add("show");
        });

        return sheet;
    }

    // --- Modo Desktop: Menu Flutuante com Submenus Aninhados ---
    let rootMenu;

    function buildDesktopMenu(itemList, isSub = false) {
        const container = createElement("div", isSub ? "dropdown sub-dropdown" : "ui-context-menu", []);
        if (isSub) {
            container.style.display = "none";
            container.style.flexDirection = "column";
        }

        itemList.forEach(item => {
            if (item === "separator") {
                container.appendChild(createElement("div", "menuSep", []));
            } else {
                const optChildren = [];
                const leftPart = createElement("div", "menuOption-left", []);
                if (item.icon) {
                    leftPart.appendChild(createElement("span", "menuOption-icon", [item.icon]));
                }
                leftPart.appendChild(createElement("span", "menuOption-label", [item.label || ""]));
                optChildren.push(leftPart);

                if (item.shortcut) {
                    optChildren.push(createElement("span", "menuShortcut", [item.shortcut]));
                }

                if (item.items && item.items.length > 0) {
                    optChildren.push(createElement("span", "submenu-arrow", ["▶"]));
                }

                const opt = createElement("div", "menuOption", optChildren);

                const isDisabled = typeof item.disabled === 'function' ? item.disabled() : !!item.disabled;
                if (isDisabled) {
                    opt.classList.add("disabled");
                }

                if (item.items && item.items.length > 0) {
                    opt.classList.add("has-submenu");
                    const nested = buildDesktopMenu(item.items, true);
                    opt.appendChild(nested);

                    const positionSub = () => {
                        nested.style.display = "flex";
                        nested.style.flexDirection = "column";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("margin-top");
                        nested.style.removeProperty("margin-bottom");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("max-width");
                        nested.style.removeProperty("overflow-y");

                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const pad = 10;
                        const rect = nested.getBoundingClientRect();

                        if (rect.right > vw - pad) {
                            nested.classList.add("open-left");
                            nested.style.setProperty("left", "auto", "important");
                            nested.style.setProperty("right", "100%", "important");
                            nested.style.setProperty("margin-left", "0", "important");
                            nested.style.setProperty("margin-right", "-4px", "important");
                        }

                        const curRect = nested.getBoundingClientRect();
                        if (curRect.bottom > vh - pad) {
                            const optRect = opt.getBoundingClientRect();
                            const spaceAbove = optRect.top - pad;
                            const spaceBelow = vh - optRect.bottom - pad;

                            if (spaceAbove > spaceBelow && spaceAbove >= curRect.height) {
                                nested.classList.add("open-top");
                                nested.style.setProperty("top", "auto", "important");
                                nested.style.setProperty("bottom", "0", "important");
                                nested.style.setProperty("margin-top", "0", "important");
                                nested.style.setProperty("margin-bottom", "-4px", "important");
                            } else {
                                const overflow = curRect.bottom - (vh - pad);
                                const shiftY = Math.min(overflow + 4, Math.max(0, optRect.top - pad));
                                nested.style.setProperty("top", `${-shiftY}px`, "important");
                                if (curRect.height > vh - 2 * pad) {
                                    nested.style.setProperty("max-height", `${vh - 2 * pad}px`, "important");
                                    nested.style.setProperty("overflow-y", "auto", "important");
                                    nested.style.setProperty("overflow-x", "hidden", "important");
                                }
                            }
                        }
                    };

                    opt.addEventListener("mouseenter", () => {
                        if (!isDisabled) positionSub();
                    });

                    opt.addEventListener("mouseleave", () => {
                        nested.style.display = "none";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("margin-top");
                        nested.style.removeProperty("margin-bottom");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("max-width");
                        nested.style.removeProperty("overflow-y");
                    });

                    opt.onclick = (e) => {
                        if (isDisabled) return;
                        e.stopPropagation();
                        if (nested.style.display === "flex") {
                            nested.style.display = "none";
                        } else {
                            positionSub();
                        }
                    };
                } else {
                    opt.onclick = (e) => {
                        if (isDisabled) return;
                        e.stopPropagation();
                        if (item.screen) {
                            const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                            if (d && typeof d.openScreen === 'function') {
                                d.openScreen(item.screen, item.props);
                            }
                        } else if (item.action) {
                            item.action();
                        }
                        if (rootMenu) rootMenu.remove();
                    };
                }
                container.appendChild(opt);
            }
        });
        return container;
    }

    // Remove qualquer outro menu de contexto previamente aberto
    document.querySelectorAll('.ui-context-menu').forEach(m => m.remove());

    rootMenu = buildDesktopMenu(items, false);
    rootMenu.style.left = x + "px";
    rootMenu.style.top = y + "px";

    document.body.appendChild(rootMenu);

    // Ajuste de colisão de tela (Impede que vaze nas bordas)
    const rect = rootMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
        rootMenu.style.left = Math.max(10, x - rect.width) + "px";
    }
    if (y + rect.height > window.innerHeight) {
        rootMenu.style.top = Math.max(10, y - rect.height) + "px";
    }

    requestAnimationFrame(() => rootMenu.classList.add("show"));
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!rootMenu || !rootMenu.contains(e.target)) {
                if (rootMenu) rootMenu.remove();
                document.removeEventListener("click", closeMenu, true);
                document.removeEventListener("contextmenu", closeMenu, true);
                document.removeEventListener("pointerdown", closeMenu, true);
            }
        };
        document.addEventListener("click", closeMenu, true);
        document.addEventListener("contextmenu", closeMenu, true);
        document.addEventListener("pointerdown", closeMenu, true);
    }, 10);
    return rootMenu;
}

export function bindContextMenu(element, items = [], options = {}) {
    if (!element) return null;
    let currentItems = items;
    let opt = options || {};

    // Se items for um objeto com a estrutura { items, allowNativeKey, ... }
    if (items && !Array.isArray(items) && typeof items === 'object' && items.items) {
        currentItems = items.items;
        opt = { ...items, ...options };
    }

    const allowNativeKey = opt.allowNativeKey !== undefined ? opt.allowNativeKey : "shift";

    // Clique do botão direito padrão (Desktop)
    const onContextMenu = (e) => {
        // Se a tecla configurada estiver pressionada, ignora o menu do framework e exibe o menu nativo do navegador
        let shouldBypass = false;
        if (allowNativeKey && allowNativeKey !== "none" && allowNativeKey !== "false") {
            const key = String(allowNativeKey).toLowerCase();
            if (key === "alt" && e.altKey) shouldBypass = true;
            else if (key === "ctrl" && e.ctrlKey) shouldBypass = true;
            else if (key === "shift" && e.shiftKey) shouldBypass = true;
            else if (key === "meta" && e.metaKey) shouldBypass = true;
        }

        if (shouldBypass) return;

        e.preventDefault();
        e.stopPropagation();

        // Se os itens forem uma função, permite gerar os itens dinamicamente
        const menuItems = typeof currentItems === 'function' ? currentItems(e) : currentItems;
        if (!menuItems || menuItems.length === 0) return;

        ContextMenu({ x: e.clientX, y: e.clientY, items: menuItems });
    };

    element.addEventListener("contextmenu", onContextMenu);

    // Suporte nativo a Long-Press Touch para Mobile
    let touchTimer = null;
    let startX = 0, startY = 0;

    const onTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        touchTimer = setTimeout(() => {
            touchTimer = null;
            if (navigator.vibrate) try { navigator.vibrate(40); } catch (err) { }
            const menuItems = typeof currentItems === 'function' ? currentItems(touch) : currentItems;
            if (menuItems && menuItems.length > 0) {
                ContextMenu({ x: touch.clientX, y: touch.clientY, items: menuItems });
            }
        }, 450);
    };

    const onTouchMove = (e) => {
        if (!touchTimer) return;
        const touch = e.touches[0];
        if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    };

    const onTouchEnd = () => {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return {
        update(newItems) {
            currentItems = newItems;
        },
        destroy() {
            element.removeEventListener("contextmenu", onContextMenu);
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("touchend", onTouchEnd);
            element.removeEventListener("touchcancel", onTouchEnd);
        }
    };
}

// --- buildMobileItems: constrói lista de opções para drawers/sheets mobile ---
function buildMobileItems(items, closeFn, windowInstance = null) {
    const list = createElement("div", "drawer-item-list", []);
    items.forEach(subItem => {
        if (subItem === "separator") {
            list.appendChild(createElement("div", "drawer-sep", []));
        } else {
            const optChildren = [];
            if (subItem.icon) optChildren.push(createElement("span", "drawer-opt-icon", [subItem.icon]));
            optChildren.push(createElement("span", "drawer-opt-label", [subItem.label || ""]));
            if (subItem.items && subItem.items.length > 0) {
                optChildren.push(createElement("span", "drawer-accordion-arrow", ["▼"]));
            }

            const opt = createElement("div", "drawer-option", optChildren);
            if (subItem.disabled) opt.classList.add("disabled");

            if (subItem.items && subItem.items.length > 0) {
                opt.classList.add("drawer-has-sub");
                const subList = buildMobileItems(subItem.items, closeFn, windowInstance);
                subList.style.display = "none";

                opt.onclick = (ev) => {
                    ev.stopPropagation();
                    const isOpen = subList.style.display === "flex";
                    subList.style.display = isOpen ? "none" : "flex";
                    opt.classList.toggle("expanded", !isOpen);
                };

                const group = createElement("div", "drawer-group", [opt, subList]);
                list.appendChild(group);
            } else {
                opt.onclick = (ev) => {
                    if (subItem.disabled) return;
                    ev.stopPropagation();
                    if (closeFn) closeFn();
                    if (subItem.screen) {
                        const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                        if (d && typeof d.openScreen === 'function') {
                            d.openScreen(subItem.screen, subItem.props);
                        }
                    } else if (subItem.action) {
                        subItem.action(windowInstance, ev);
                    }
                };
                list.appendChild(opt);
            }
        }
    });
    return list;
}

// --- Mobile Hamburger & Drawer Engine Compartilhado ---

export function openMobileMenuDrawer({ menus = [], title = "📱 Menu Principal", icon = "📱", windowInstance = null } = {}) {
    const currentLaf = (typeof window !== 'undefined' && window.Desktop && typeof window.Desktop.getLookAndFeel === 'function')
        ? window.Desktop.getLookAndFeel()
        : (document.documentElement.getAttribute('data-laf') || 'default');
    const backdrop = createElement("div", "menubar-mobile-drawer-backdrop", []);
    const drawer = createElement("div", "menubar-mobile-drawer", [
        createElement("div", "drawer-header", [
            createElement("div", "drawer-title", [icon && !title.includes(icon) ? `${icon} ${title}` : title]),
            createElement("button", "drawer-close-btn", ["✕"])
        ]),
        createElement("div", "drawer-content", [])
    ]);
    if (currentLaf && currentLaf !== 'default') {
        backdrop.setAttribute('data-laf', currentLaf);
        drawer.setAttribute('data-laf', currentLaf);
    }

    const closeDrawer = () => {
        drawer.classList.remove("open");
        backdrop.classList.remove("show");
        setTimeout(() => backdrop.remove(), 250);
    };

    drawer.querySelector(".drawer-close-btn").onclick = closeDrawer;
    backdrop.onclick = (e) => {
        if (e.target === backdrop) closeDrawer();
    };


    const contentEl = drawer.querySelector(".drawer-content");

    menus.forEach(menu => {
        if (menu === "separator") {
            contentEl.appendChild(createElement("div", "drawer-sep", []));
            return;
        }

        // Se o item do topo não tem subitems, renderiza como ação direta no primeiro nível
        if (!menu.items || menu.items.length === 0) {
            const directOpt = createElement("div", "drawer-option", [
                menu.icon ? createElement("span", "drawer-opt-icon", [menu.icon]) : null,
                createElement("span", "drawer-opt-label", [menu.label || ""])
            ].filter(Boolean));

            if (menu.disabled) directOpt.classList.add("disabled");
            directOpt.onclick = (ev) => {
                if (menu.disabled) return;
                ev.stopPropagation();
                closeDrawer();
                if (menu.screen) {
                    const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                    if (d && typeof d.openScreen === 'function') {
                        d.openScreen(menu.screen, menu.props);
                    }
                } else if (menu.action) {
                    menu.action(windowInstance, ev);
                }
            };
            contentEl.appendChild(directOpt);
            return;
        }

        const catHeader = createElement("div", "drawer-cat-header", [
            menu.icon ? createElement("span", "drawer-cat-icon", [menu.icon]) : null,
            createElement("span", "drawer-cat-title", [menu.label || ""]),
            menu.items && menu.items.length > 0 ? createElement("span", "drawer-accordion-arrow", ["▼"]) : null
        ].filter(Boolean));

        const group = createElement("div", "drawer-category-group", [catHeader]);

        if (menu.items && menu.items.length > 0) {
            const subList = buildMobileItems(menu.items, closeDrawer);
            subList.style.display = "none";

            catHeader.onclick = () => {
                const isOpen = subList.style.display === "flex";
                subList.style.display = isOpen ? "none" : "flex";
                catHeader.classList.toggle("expanded", !isOpen);
            };
            group.appendChild(subList);
        }
        contentEl.appendChild(group);
    });

    backdrop.appendChild(drawer);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
        backdrop.classList.add("show");
        drawer.classList.add("open");
    });
}

export function MenuBar({ containerId, element, position, menus = [], windowInstance = null } = {}) {
    let bar;
    if (element && (element.nodeType || element instanceof HTMLElement)) {
        bar = element;
    } else if (containerId) {
        bar = document.getElementById(containerId);
    } else {
        bar = createElement("div", "ui-menubar", []);
    }
    if (!bar) return null;

    bar.innerHTML = "";
    if (!bar.classList.contains("ui-menubar")) {
        bar.classList.add("ui-menubar");
    }

    const app = document.getElementById("app");
    const isGlobalBar = app && (bar.id === "menubar" || (containerId === "menubar" && !bar.closest(".window")));

    // Registra globalmente os menus no Desktop se for a barra de menus global
    if (isGlobalBar && typeof Desktop !== 'undefined' && typeof Desktop.registerMenuBarMenus === 'function') {
        Desktop.registerMenuBarMenus(menus);
    }

    let effectivePosition = position;
    if (!effectivePosition) {
        if (isGlobalBar && typeof Desktop !== 'undefined' && Desktop.getMenuBarPosition) {
            effectivePosition = Desktop.getMenuBarPosition();
        } else {
            effectivePosition = "top";
        }
    }
    bar.dataset.position = effectivePosition;

    if (isGlobalBar) {
        app.dataset.menubar = effectivePosition;
        if (effectivePosition === "none") {
            bar.style.display = "none";
        } else {
            bar.style.display = "";
        }
    }

    // --- Mobile Hamburger & Drawer para Menus Globais, Janelas e StartMenu ---
    if (isGlobalBar) {
        const hamburger = createElement("button", "menubar-mobile-hamburger", ["☰"]);
        hamburger.setAttribute("aria-label", "Abrir Menu");
        bar.appendChild(hamburger);

        hamburger.onclick = (e) => {
            e.stopPropagation();
            openMobileMenuDrawer({
                menus,
                title: "📱 Menu Principal",
                icon: "📱",
                windowInstance
            });
        };
    } else {
        // --- Hamburger & Sheet para Window MenuBar (MenuBar dentro de Janela) ---
        const winTitle = windowInstance?.config?.title ? `Menu: ${windowInstance.config.title}` : "Menu da Janela";
        const winIcon = windowInstance?.config?.icon || "☰";
        const winHamburger = createElement("button", "window-menubar-hamburger", [
            createElement("span", "window-menubar-hamburger-icon", [winIcon]),
            createElement("span", "window-menubar-hamburger-label", ["Menu"])
        ]);
        winHamburger.setAttribute("aria-label", winTitle);
        bar.appendChild(winHamburger);

        winHamburger.onclick = (e) => {
            e.stopPropagation();
            openWindowMobileSheet();
        };

        const openWindowMobileSheet = () => {
            document.querySelectorAll(".ui-bottom-sheet-backdrop").forEach(d => d.remove());

            const currentLaf = (typeof window !== 'undefined' && window.Desktop && typeof window.Desktop.getLookAndFeel === 'function')
                ? window.Desktop.getLookAndFeel()
                : (document.documentElement.getAttribute('data-laf') || 'default');
            const backdrop = createElement("div", "ui-bottom-sheet-backdrop", []);
            const sheet = createElement("div", "ui-bottom-sheet", [
                createElement("div", "bottom-sheet-handle-bar", [
                    createElement("div", "bottom-sheet-handle", [])
                ]),
                createElement("div", "drawer-header", [
                    createElement("div", "drawer-title", [`${winIcon} ${winTitle}`]),
                    createElement("button", "drawer-close-btn", ["✕"])
                ]),
                createElement("div", "bottom-sheet-content", [])
            ]);
            if (currentLaf && currentLaf !== 'default') {
                backdrop.setAttribute('data-laf', currentLaf);
                sheet.setAttribute('data-laf', currentLaf);
            }

            const closeSheet = () => {
                sheet.classList.remove("show");
                backdrop.classList.remove("show");
                setTimeout(() => backdrop.remove(), 250);
            };

            sheet.querySelector(".drawer-close-btn").onclick = closeSheet;
            backdrop.onclick = (e) => {
                if (e.target === backdrop) closeSheet();
            };

            const contentEl = sheet.querySelector(".bottom-sheet-content");

            menus.forEach(menu => {
                const catHeader = createElement("div", "drawer-cat-header", [
                    menu.icon ? createElement("span", "drawer-cat-icon", [menu.icon]) : null,
                    createElement("span", "drawer-cat-title", [menu.label || ""]),
                    menu.items && menu.items.length > 0 ? createElement("span", "drawer-accordion-arrow", ["▼"]) : null
                ].filter(Boolean));

                const group = createElement("div", "drawer-category-group", [catHeader]);

                if (menu.items && menu.items.length > 0) {
                    const subList = buildMobileItems(menu.items, closeSheet, windowInstance);
                    subList.style.display = "none"; // Inicia recolhido em sanfona/accordion

                    catHeader.onclick = () => {
                        const isOpen = subList.style.display === "flex";
                        subList.style.display = isOpen ? "none" : "flex";
                        catHeader.classList.toggle("expanded", !isOpen);
                    };
                    group.appendChild(subList);
                }
                contentEl.appendChild(group);
            });

            // Botão Fechar
            const cancelBtn = createElement("button", "bottom-sheet-cancel-btn", ["✕ Fechar Menu"]);
            cancelBtn.onclick = closeSheet;
            sheet.appendChild(cancelBtn);

            backdrop.appendChild(sheet);
            document.body.appendChild(backdrop);

            requestAnimationFrame(() => {
                backdrop.classList.add("show");
                sheet.classList.add("show");
            });
        };
    }

    // --- Menus Padrão Desktop & Itens da Barra ---
    function buildMenu(items, isSub = false) {
        const container = createElement("div", isSub ? "dropdown sub-dropdown" : "dropdown menubar-dropdown", []);
        container.style.display = "none";
        container.style.flexDirection = "column";

        items.forEach(subItem => {
            if (subItem === "separator") {
                container.appendChild(createElement("div", "menuSep", []));
            } else {
                const optChildren = [];
                const leftPart = createElement("div", "menuOption-left", []);

                if (subItem.icon) {
                    leftPart.appendChild(createElement("span", "menuOption-icon", [subItem.icon]));
                }
                leftPart.appendChild(createElement("span", "menuOption-label", [subItem.label || ""]));
                optChildren.push(leftPart);

                if (subItem.shortcut) {
                    optChildren.push(createElement("span", "menuShortcut", [subItem.shortcut]));
                }

                if (subItem.items && subItem.items.length > 0) {
                    optChildren.push(createElement("span", "submenu-arrow", ["▶"]));
                }

                const opt = createElement("div", "menuOption", optChildren);

                const isDisabled = typeof subItem.disabled === 'function' ? subItem.disabled(windowInstance) : !!subItem.disabled;
                if (isDisabled) {
                    opt.classList.add("disabled");
                }

                if (subItem.items && subItem.items.length > 0) {
                    opt.classList.add("has-submenu");
                    const nested = buildMenu(subItem.items, true);
                    opt.appendChild(nested);

                    const positionSub = () => {
                        nested.style.display = "flex";
                        nested.style.flexDirection = "column";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("margin-top");
                        nested.style.removeProperty("margin-bottom");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("max-width");
                        nested.style.removeProperty("overflow-y");

                        let rightBound = window.innerWidth || document.documentElement.clientWidth;
                        let bottomBound = window.innerHeight || document.documentElement.clientHeight;
                        let leftBound = 0;
                        let topBound = 0;

                        if (windowInstance && (windowInstance.element || windowInstance.windowEl)) {
                            const el = windowInstance.element || windowInstance.windowEl;
                            const winRect = el.getBoundingClientRect();
                            rightBound = winRect.right;
                            bottomBound = winRect.bottom;
                            leftBound = winRect.left;
                            topBound = winRect.top;
                        }

                        const pad = 10;
                        const rect = nested.getBoundingClientRect();

                        // 1. Inversão Horizontal Inteligente (se ultrapassar a borda direita)
                        if (rect.right > rightBound - pad) {
                            nested.classList.add("open-left");
                            nested.style.setProperty("left", "auto", "important");
                            nested.style.setProperty("right", "100%", "important");
                            nested.style.setProperty("margin-left", "0", "important");
                            nested.style.setProperty("margin-right", "-4px", "important");

                            const rectLeft = nested.getBoundingClientRect();
                            if (rectLeft.left < leftBound + pad) {
                                nested.classList.remove("open-left");
                                nested.style.setProperty("left", "auto", "important");
                                nested.style.setProperty("right", "0", "important");
                                nested.style.setProperty("max-width", `${rightBound - leftBound - 2 * pad}px`, "important");
                            }
                        }

                        // 2. Ajuste Vertical Inteligente (se ultrapassar a borda inferior)
                        const curRect = nested.getBoundingClientRect();
                        if (curRect.bottom > bottomBound - pad) {
                            const optRect = opt.getBoundingClientRect();
                            const spaceAbove = optRect.top - topBound - pad;
                            const spaceBelow = bottomBound - optRect.bottom - pad;

                            if (spaceAbove > spaceBelow && spaceAbove >= curRect.height) {
                                nested.classList.add("open-top");
                                nested.style.setProperty("top", "auto", "important");
                                nested.style.setProperty("bottom", "0", "important");
                                nested.style.setProperty("margin-top", "0", "important");
                                nested.style.setProperty("margin-bottom", "-4px", "important");
                            } else {
                                const overflow = curRect.bottom - (bottomBound - pad);
                                const shiftY = Math.min(overflow + 4, Math.max(0, optRect.top - topBound - pad));
                                nested.style.setProperty("top", `${-shiftY}px`, "important");
                                if (curRect.height > bottomBound - topBound - 2 * pad) {
                                    nested.style.setProperty("max-height", `${bottomBound - topBound - 2 * pad}px`, "important");
                                    nested.style.setProperty("overflow-y", "auto", "important");
                                    nested.style.setProperty("overflow-x", "hidden", "important");
                                }
                            }
                        }
                    };

                    opt.addEventListener("mouseenter", () => {
                        if (!isDisabled) positionSub();
                    });
                    opt.addEventListener("mouseleave", () => {
                        nested.style.display = "none";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("margin-top");
                        nested.style.removeProperty("margin-bottom");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("max-width");
                        nested.style.removeProperty("overflow-y");
                    });

                    opt.onclick = (e) => {
                        if (isDisabled) return;
                        e.stopPropagation();
                        if (nested.style.display === "flex") {
                            nested.style.display = "none";
                        } else {
                            positionSub();
                        }
                    };
                } else {
                    opt.onclick = (e) => {
                        if (isDisabled) return;
                        e.stopPropagation();
                        if (subItem.screen) {
                            const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                            if (d && typeof d.openScreen === 'function') {
                                d.openScreen(subItem.screen, subItem.props);
                            }
                        } else if (subItem.action) {
                            subItem.action(windowInstance, e);
                        }
                        bar.querySelectorAll(".menubar-item").forEach(x => x.classList.remove("active"));
                    };
                }
                container.appendChild(opt);
            }
        });
        return container;
    }

    let isMenuOpen = false;

    menus.forEach(menu => {
        const itemChildren = [];
        if (menu.icon) {
            itemChildren.push(createElement("span", "menubar-item-icon", [menu.icon]));
        }
        itemChildren.push(createElement("span", "menubar-item-label", [menu.label || ""]));

        const item = createElement("div", "menubar-item", itemChildren);
        if (menu.items && menu.items.length > 0) {
            const dropdown = buildMenu(menu.items);
            item.appendChild(dropdown);
        }

        const activateItem = () => {
            bar.querySelectorAll(".menubar-item").forEach(x => x.classList.remove("active"));
            item.classList.add("active");
            isMenuOpen = true;

            const dropdown = item.querySelector(".menubar-dropdown");
            if (dropdown) {
                dropdown.classList.remove("align-right");
                const rect = dropdown.getBoundingClientRect();

                let rightBound = window.innerWidth || document.documentElement.clientWidth;
                if (windowInstance && (windowInstance.element || windowInstance.windowEl)) {
                    const el = windowInstance.element || windowInstance.windowEl;
                    rightBound = el.getBoundingClientRect().right;
                }

                if (rect.right > rightBound - 10) {
                    dropdown.classList.add("align-right");
                }
            }
        };

        item.onmousedown = (e) => {
            if (e.target.closest(".ui-start-menu") || e.target.closest(".dropdown")) return;

            document.querySelectorAll('.ui-context-menu').forEach(m => m.remove());
            e.stopPropagation();
            if (item.classList.contains("active")) {
                item.classList.remove("active");
                isMenuOpen = false;
            } else {
                activateItem();
            }
        };

        item.onmouseenter = () => {
            if (isMenuOpen && !item.classList.contains("active")) {
                activateItem();
            }
        };

        bar.appendChild(item);
    });

    document.addEventListener("mousedown", e => {
        if (!bar.contains(e.target)) {
            bar.querySelectorAll(".menubar-item").forEach(x => x.classList.remove("active"));
            isMenuOpen = false;
        }
    });

    if (isGlobalBar) {
        EventBus.on("menubar:positionchange", (pos) => {
            bar.dataset.position = pos;
            if (pos === "none") {
                bar.style.display = "none";
            } else {
                bar.style.display = "";
            }
        });
    }

    return bar;
}

// --- ACTION TOOLBAR (BARRA DE AÇÕES RÁPIDAS DE JANELA / APP) ---

export function ActionToolbar({ containerId, element, position = "top", actions = [], windowInstance = null } = {}) {
    let bar;
    if (element && (element.nodeType || element instanceof HTMLElement)) {
        bar = element;
    } else if (containerId) {
        bar = document.getElementById(containerId);
    } else {
        bar = createElement("div", "ui-action-toolbar", []);
    }
    if (!bar) return null;

    bar.innerHTML = "";
    if (!bar.classList.contains("ui-action-toolbar")) {
        bar.classList.add("ui-action-toolbar");
    }

    bar.dataset.position = position || "top";

    actions.forEach(act => {
        if (act === "separator") {
            bar.appendChild(createElement("div", "action-toolbar-sep", []));
            return;
        }

        const btnChildren = [];
        if (act.icon) {
            btnChildren.push(createElement("span", "action-toolbar-icon", [act.icon]));
        }
        if (act.label) {
            btnChildren.push(createElement("span", "action-toolbar-label", [act.label]));
        }

        const btn = createElement("button", `action-toolbar-btn ${act.variant ? 'btn-' + act.variant : ''} ${act.active ? 'active' : ''}`, btnChildren);

        const hintText = act.hint || act.tooltip || act.title || act.label || "";
        if (hintText) {
            btn.title = hintText;
            btn.setAttribute("aria-label", hintText);
        }

        const isDisabled = typeof act.disabled === 'function' ? act.disabled(windowInstance) : !!act.disabled;
        if (isDisabled) {
            btn.disabled = true;
            btn.classList.add("disabled");
        }

        btn.onclick = (e) => {
            if (btn.disabled) return;
            e.stopPropagation();
            if (typeof act.action === 'function') {
                act.action(windowInstance, e);
            } else if (typeof act.action === 'string' && windowInstance && typeof windowInstance.runAction === 'function') {
                windowInstance.runAction(act.action, e);
            }
        };

        bar.appendChild(btn);
    });

    return bar;
}

export function StartMenu({ buttonId = "startBtn", menus = [] } = {}) {
    let btn = document.getElementById(buttonId);

    // Registra a configuração inicial no Desktop
    if (typeof Desktop !== 'undefined' && typeof Desktop.registerStartMenu === 'function') {
        Desktop.registerStartMenu({ buttonId, menus });
    }

    let menuEl = document.querySelector(".ui-start-menu");
    if (!menuEl) {
        menuEl = createElement("div", "ui-start-menu", []);
        const app = document.getElementById("app") || document.body;
        app.appendChild(menuEl);
    }

    const closeStartMenu = () => {
        menuEl.classList.remove("show");
        menuEl.querySelectorAll(".dropdown, .sub-dropdown").forEach(d => {
            d.style.display = "none";
        });
    };

    function buildMenu(items, isSub = false) {
        const container = isSub ? createElement("div", "dropdown sub-dropdown", []) : menuEl;
        if (isSub) {
            container.style.display = "none";
            container.style.flexDirection = "column";
        }

        items.forEach(subItem => {
            if (subItem === "separator") {
                container.appendChild(createElement("div", "menuSep", []));
            } else {
                const optChildren = [];
                const leftPart = createElement("div", "menuOption-left", []);
                if (subItem.icon) {
                    leftPart.appendChild(createElement("span", "menuOption-icon", [subItem.icon]));
                }
                leftPart.appendChild(createElement("span", "menuOption-label", [subItem.label || ""]));
                optChildren.push(leftPart);

                if (subItem.shortcut) {
                    optChildren.push(createElement("span", "menuShortcut", [subItem.shortcut]));
                }

                if (subItem.items && subItem.items.length > 0) {
                    optChildren.push(createElement("span", "submenu-arrow", ["▶"]));
                }

                const opt = createElement("div", "menuOption", optChildren);
                if (subItem.disabled) {
                    opt.classList.add("disabled");
                }

                if (subItem.items && subItem.items.length > 0) {
                    opt.classList.add("has-submenu");
                    const nested = buildMenu(subItem.items, true);
                    opt.appendChild(nested);

                    const positionStartSub = () => {
                        nested.style.display = "flex";
                        nested.style.flexDirection = "column";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("overflow-y");

                        const vw = window.innerWidth || document.documentElement.clientWidth;
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        const pad = 10;
                        const rect = nested.getBoundingClientRect();

                        if (rect.right > vw - pad) {
                            nested.classList.add("open-left");
                            nested.style.setProperty("left", "auto", "important");
                            nested.style.setProperty("right", "100%", "important");
                            nested.style.setProperty("margin-left", "0", "important");
                            nested.style.setProperty("margin-right", "-4px", "important");
                        }
                        const curRect = nested.getBoundingClientRect();
                        if (curRect.bottom > vh - pad) {
                            const overflow = curRect.bottom - (vh - pad);
                            const optRect = opt.getBoundingClientRect();
                            const shiftY = Math.min(overflow + 4, Math.max(0, optRect.top - pad));
                            nested.style.setProperty("top", `${-shiftY}px`, "important");
                            if (curRect.height > vh - 2 * pad) {
                                nested.style.setProperty("max-height", `${vh - 2 * pad}px`, "important");
                                nested.style.setProperty("overflow-y", "auto", "important");
                                nested.style.setProperty("overflow-x", "hidden", "important");
                            }
                        }
                    };

                    opt.addEventListener("mouseenter", positionStartSub);
                    opt.addEventListener("mouseleave", () => {
                        nested.style.display = "none";
                        nested.classList.remove("open-left", "open-top");
                        nested.style.removeProperty("left");
                        nested.style.removeProperty("right");
                        nested.style.removeProperty("top");
                        nested.style.removeProperty("bottom");
                        nested.style.removeProperty("margin-left");
                        nested.style.removeProperty("margin-right");
                        nested.style.removeProperty("max-height");
                        nested.style.removeProperty("overflow-y");
                    });

                    opt.onclick = (e) => {
                        if (subItem.disabled) return;
                        e.stopPropagation();
                        if (nested.style.display === "flex") {
                            nested.style.display = "none";
                        } else {
                            positionStartSub();
                        }
                    };
                } else {
                    opt.onclick = (e) => {
                        if (subItem.disabled) return;
                        e.stopPropagation();
                        if (subItem.screen) {
                            const d = (Desktop && typeof Desktop.openScreen === 'function') ? Desktop : (window.Desktop || Desktop);
                            if (d && typeof d.openScreen === 'function') {
                                d.openScreen(subItem.screen, subItem.props);
                            }
                        } else if (subItem.action) {
                            subItem.action();
                        }
                        closeStartMenu();
                    };
                }
                container.appendChild(opt);
            }
        });
        return container;
    }

    const renderMenuContent = () => {
        menuEl.innerHTML = "";
        const currentEffectiveMenus = (typeof Desktop !== 'undefined' && typeof Desktop.getEffectiveStartMenus === 'function')
            ? Desktop.getEffectiveStartMenus()
            : menus;

        if (currentEffectiveMenus && currentEffectiveMenus.length > 0) {
            buildMenu(currentEffectiveMenus, false);
            // Garantir que todos submenus fiquem ocultos ao montar
            menuEl.querySelectorAll(".dropdown, .sub-dropdown").forEach(d => {
                d.style.display = "none";
            });
        }
    };

    renderMenuContent();

    const handleButtonClick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.ui-context-menu').forEach(m => m.remove());
        renderMenuContent();
        const currentEffectiveMenus = (typeof Desktop !== 'undefined' && typeof Desktop.getEffectiveStartMenus === 'function')
            ? Desktop.getEffectiveStartMenus()
            : menus;

        if (!currentEffectiveMenus || currentEffectiveMenus.length === 0) {
            return;
        }

        const app = document.getElementById("app");
        const isMobile = (Desktop && typeof Desktop.isMobile === 'function' && Desktop.isMobile()) ||
            app?.classList.contains("mobile-mode") ||
            window.innerWidth <= 768;
        if (isMobile) {
            closeStartMenu();
            openMobileMenuDrawer({
                menus: currentEffectiveMenus,
                title: "Início",
                icon: "☰"
            });
            return;
        }
        if (menuEl.classList.contains("show")) {
            closeStartMenu();
        } else {
            // Posicionamento dinâmico ancorado ao botão que disparou
            const btnEl = e.currentTarget || e.target;
            const btnRect = btnEl ? btnEl.getBoundingClientRect() : null;
            const tbPos = app?.dataset?.taskbar || (Desktop && typeof Desktop.getTaskbarPosition === 'function' ? Desktop.getTaskbarPosition() : 'bottom');

            // Limpa propriedades anteriores
            menuEl.style.removeProperty("top");
            menuEl.style.removeProperty("bottom");
            menuEl.style.removeProperty("left");
            menuEl.style.removeProperty("right");

            if (btnRect) {
                const pad = 4;
                if (tbPos === "left") {
                    menuEl.style.setProperty("top", `${Math.max(4, btnRect.top)}px`, "important");
                    menuEl.style.setProperty("left", `${btnRect.right + pad}px`, "important");
                    menuEl.style.setProperty("bottom", "auto", "important");
                    menuEl.style.setProperty("right", "auto", "important");
                } else if (tbPos === "right") {
                    menuEl.style.setProperty("top", `${Math.max(4, btnRect.top)}px`, "important");
                    menuEl.style.setProperty("right", `${(window.innerWidth - btnRect.left) + pad}px`, "important");
                    menuEl.style.setProperty("left", "auto", "important");
                    menuEl.style.setProperty("bottom", "auto", "important");
                } else if (tbPos === "top") {
                    menuEl.style.setProperty("top", `${btnRect.bottom + pad}px`, "important");
                    menuEl.style.setProperty("left", `${Math.max(4, btnRect.left)}px`, "important");
                    menuEl.style.setProperty("bottom", "auto", "important");
                    menuEl.style.setProperty("right", "auto", "important");
                } else {
                    // bottom
                    menuEl.style.setProperty("bottom", `${(window.innerHeight - btnRect.top) + pad}px`, "important");
                    menuEl.style.setProperty("left", `${Math.max(4, btnRect.left)}px`, "important");
                    menuEl.style.setProperty("top", "auto", "important");
                    menuEl.style.setProperty("right", "auto", "important");
                }
            }

            menuEl.classList.add("show");
        }
    };

    const attachButtonListener = () => {
        const targetIds = [buttonId, "startBtn", "taskStartBtn"].filter(Boolean);
        for (const id of targetIds) {
            const el = document.getElementById(id);
            if (el && !el._startMenuBound) {
                el.onclick = handleButtonClick;
                el._startMenuBound = true;
            }
        }
    };

    attachButtonListener();

    // Sincroniza dinamicamente e imediatamente quando o Desktop emite sincronização de menus
    EventBus.on("startmenu:sync", (data) => {
        renderMenuContent();
        attachButtonListener();
    });

    const closeOnOutside = (e) => {
        const currentBtn = document.getElementById(buttonId) || document.querySelector('.taskStart[data-role="start-button"]');
        if (!menuEl.contains(e.target) && (!currentBtn || e.target !== currentBtn && !currentBtn.contains(e.target))) {
            closeStartMenu();
        }
    };
    document.addEventListener("click", closeOnOutside, true);
    document.addEventListener("contextmenu", closeOnOutside, true);

    return menuEl;
}

// --- MAIS COMPONENTES CORPORATIVOS ---

export function Drawer({ bind, side = "right", content, instance, targetContainer }) {
    const inst = resolveInstance(instance);
    const overlay = createElement("div", "ui-drawer-overlay");
    const drawer = createElement("div", `ui-drawer ui-drawer-${side}`);

    // Close function
    const closeDrawer = () => {
        if (bind && inst && inst.state) {
            inst.state[bind] = false;
        } else {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 300);
        }
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) closeDrawer();
    };

    if (typeof content === 'string') drawer.innerHTML = content;
    else if (content instanceof Node) drawer.appendChild(content);
    else if (Array.isArray(content)) content.forEach(c => drawer.appendChild(c));

    overlay.appendChild(drawer);

    // Resolve Container
    let container = targetContainer;
    if (!container) {
        if (inst && inst.windowEl) {
            container = inst.windowEl;
        } else {
            container = document.getElementById("app") || document.body;
        }
    }

    if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
    }

    // Controle pelo state
    if (bind && inst) {
        const placeholder = createElement("div", "ui-drawer-placeholder", []);
        placeholder.style.display = "none";

        const old = document.getElementById(`drawer_${bind}`);

        if (inst.state && inst.state[bind]) {
            if (old) old.remove();

            overlay.id = `drawer_${bind}`;
            container.appendChild(overlay);

            requestAnimationFrame(() => overlay.classList.add("show"));
        } else if (old) {
            old.classList.remove("show");
            setTimeout(() => old.remove(), 300);
        }

        return placeholder;
    } else {
        container.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("show"));
        return overlay;
    }
}

export function Breadcrumbs({ items = [], separator = "/" }) {
    const nav = createElement("nav", "ui-breadcrumbs", []);

    items.forEach((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast || !item.action) {
            const span = createElement("span", isLast ? "ui-breadcrumb-active" : "ui-breadcrumb-text", [item.label]);
            nav.appendChild(span);
        } else {
            const link = createElement("a", "ui-breadcrumb-link", [item.label]);
            link.href = "javascript:void(0)";
            link.onclick = item.action;
            nav.appendChild(link);
        }

        if (!isLast) {
            const sep = createElement("span", "ui-breadcrumb-separator", [separator]);
            nav.appendChild(sep);
        }
    });

    return nav;
}

export function DockWidget({
    title = "Mensagens",
    icon = "💬",
    badge = null,
    bindBadge = null,
    badgeVariant = "danger",
    expanded = false,
    startMinimized = false,
    bindExpanded = null,
    position = "bottom-right", // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
    width = "320px",
    height = "380px",
    headerActions = [], // [{ icon, title, action: (widget, e) => {} }]
    content = [],       // Array de elementos, nós DOM ou função () => []
    instance = null,
    targetContainer = null,
    allowMinimizeToTray = true, // Mantido para retrocompatibilidade. Use controls.minimize preferencialmente.
    controls = { minimize: true, expand: true, close: false },
    trayTooltip = null,
    onToggle = null,
    onExpand = null,
    onCollapse = null,
    onMinimizeToTray = null,
    onRestoreFromTray = null
} = {}) {
    const isLocal = !!instance && !targetContainer;
    let target = targetContainer || (instance?.element) || document.getElementById("app") || document.body;

    // Contêiner principal do Dock
    const dock = createElement("div", `ui-dock-widget pos-${position} ${isLocal ? 'is-local' : 'is-global'}`);
    dock.style.width = typeof width === 'number' ? `${width}px` : width;

    let isExp = expanded;
    if (bindExpanded && instance?.state && instance.state[bindExpanded] !== undefined) {
        isExp = !!instance.state[bindExpanded];
    }
    if (isExp) dock.classList.add("expanded");

    // Header / Barra clicável
    const header = createElement("div", "ui-dock-header");

    // Esquerda: Ícone + Título + Badge
    const headerLeft = createElement("div", "ui-dock-header-left");
    if (icon) {
        if (typeof icon === 'string') {
            headerLeft.appendChild(createElement("span", "ui-dock-icon", [icon]));
        } else if (icon instanceof Node) {
            headerLeft.appendChild(icon);
        }
    }
    const titleEl = createElement("span", "ui-dock-title", [title]);
    headerLeft.appendChild(titleEl);

    // Badge de notificações/eventos
    let currentBadge = badge;
    if (bindBadge && instance?.state && instance.state[bindBadge] !== undefined) {
        currentBadge = instance.state[bindBadge];
    }
    const badgeEl = createElement("span", `ui-dock-badge badge-${badgeVariant}`, [String(currentBadge || "")]);
    if (!currentBadge) badgeEl.style.display = "none";
    headerLeft.appendChild(badgeEl);

    // Direita: Ações customizadas + Botão de minimizar na Tray + Botão de chevron (Expand/Collapse)
    const headerRight = createElement("div", "ui-dock-header-right");

    headerActions.forEach(act => {
        const actBtn = createElement("button", "ui-dock-action-btn");
        if (act.title) actBtn.title = act.title;
        if (typeof act.icon === 'string') actBtn.innerHTML = act.icon;
        else if (act.icon instanceof Node) actBtn.appendChild(act.icon);
        actBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof act.action === 'function') act.action(dockApi, e);
            else if (typeof act.action === 'string' && instance && typeof instance[act.action] === 'function') {
                instance[act.action](e);
            }
        };
        headerRight.appendChild(actBtn);
    });

    // Botão de Minimizar para Tray (Barra de Tarefas / Canto do Relógio)
    let minTrayBtn = null;
    let trayIconBtn = null;
    let trayBadgeEl = null;

    // Resolve se deve mostrar o minimize (fallback para allowMinimizeToTray se nulo)
    const showMinimize = controls.minimize !== undefined ? controls.minimize : allowMinimizeToTray;

    if (showMinimize && !isLocal) {
        minTrayBtn = createElement("button", "ui-dock-action-btn ui-dock-tray-btn", ["_"]);
        minTrayBtn.title = "Minimizar para a Barra de Tarefas";
        minTrayBtn.onclick = (e) => {
            e.stopPropagation();
            minimizeToTray();
        };
        headerRight.appendChild(minTrayBtn);
    }

    if (controls.expand !== false) {
        const chevronBtn = createElement("button", "ui-dock-chevron-btn", [isExp ? "▼" : "▲"]);
        chevronBtn.title = isExp ? "Recolher" : "Expandir";
        chevronBtn.onclick = (e) => {
            e.stopPropagation();
            dockApi.toggle();
        };
        headerRight.appendChild(chevronBtn);
    }

    if (controls.close) {
        const closeBtn = createElement("button", "ui-dock-action-btn ui-dock-close-btn", ["✕"]);
        closeBtn.title = "Fechar";
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (dockApi.close) dockApi.close();
        };
        headerRight.appendChild(closeBtn);
    }

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // Corpo / Conteúdo expansível
    const body = createElement("div", "ui-dock-body");
    body.style.maxHeight = typeof height === 'number' ? `${height}px` : height;

    const renderContent = () => {
        body.innerHTML = "";
        let items = typeof content === 'function' ? content(dockApi) : content;
        if (!Array.isArray(items)) items = [items];
        items.forEach(child => {
            if (typeof child === 'string') {
                body.appendChild(createElement("div", "ui-dock-text-item", [child]));
            } else if (child instanceof Node) {
                body.appendChild(child);
            }
        });
    };
    renderContent();

    dock.appendChild(header);
    dock.appendChild(body);

    // Toggle logic
    const toggle = (forceState) => {
        const next = typeof forceState === 'boolean' ? forceState : !dock.classList.contains("expanded");
        dock.classList.toggle("expanded", next);

        const chevronBtn = dock.querySelector(".ui-dock-chevron-btn");
        if (chevronBtn) {
            chevronBtn.textContent = next ? "▼" : "▲";
            chevronBtn.title = next ? "Recolher" : "Expandir";
        }

        if (bindExpanded && instance?.state) {
            instance.state[bindExpanded] = next;
        }

        if (next) {
            if (typeof onExpand === 'function') onExpand(dockApi);
            if (typeof onToggle === 'function') onToggle(true, dockApi);
        } else {
            if (typeof onCollapse === 'function') onCollapse(dockApi);
            if (typeof onToggle === 'function') onToggle(false, dockApi);
        }
    };

    if (controls.expand !== false) {
        header.onclick = () => toggle();
    }

    // Minimizar / Restaurar da Tray (Bandeja do Sistema / Taskbar)
    const minimizeToTray = () => {
        dock.classList.add("minimized-to-tray");
        dock.style.display = "none";

        if (!trayIconBtn) {
            // Localiza a taskbar ou contêiner da bandeja
            const taskbar = document.getElementById("taskbar");
            const clock = document.getElementById("clock");

            trayIconBtn = createElement("button", `ui-dock-tray-icon badge-${badgeVariant}`);
            trayIconBtn.title = trayTooltip || `${title} (Minimizado)`;

            const iconSpan = createElement("span", "ui-dock-tray-icon-symbol", [typeof icon === 'string' ? icon : '💬']);
            trayIconBtn.appendChild(iconSpan);

            trayBadgeEl = createElement("span", `ui-dock-tray-badge badge-${badgeVariant}`, [String(currentBadge || "")]);
            if (!currentBadge) trayBadgeEl.style.display = "none";
            trayIconBtn.appendChild(trayBadgeEl);

            trayIconBtn.onclick = (e) => {
                e.stopPropagation();
                // Se expand está oculto, sempre forçamos o andExpand ao restaurar (para ele abrir a lista inteira de uma vez)
                const forceExpand = controls.expand === false ? true : undefined;
                restoreFromTray(forceExpand);
            };

            if (taskbar && clock) {
                taskbar.insertBefore(trayIconBtn, clock);
            } else if (taskbar) {
                taskbar.appendChild(trayIconBtn);
            } else {
                document.body.appendChild(trayIconBtn);
            }
        } else {
            trayIconBtn.style.display = "inline-flex";
        }

        if (typeof onMinimizeToTray === 'function') onMinimizeToTray(dockApi);
    };

    const restoreFromTray = (andExpand = true) => {
        dock.classList.remove("minimized-to-tray");
        dock.style.display = "";
        if (trayIconBtn) {
            trayIconBtn.style.display = "none";
        }
        if (andExpand) {
            toggle(true);
        }
        if (typeof onRestoreFromTray === 'function') onRestoreFromTray(dockApi);
    };

    // API pública do componente
    const dockApi = {
        element: dock,
        trayElement: trayIconBtn,
        toggle: (state) => toggle(state),
        expand: () => toggle(true),
        collapse: () => toggle(false),
        minimizeToTray: () => minimizeToTray(),
        restoreFromTray: (andExpand) => restoreFromTray(andExpand),
        isMinimizedToTray: () => dock.classList.contains("minimized-to-tray"),
        isExpanded: () => dock.classList.contains("expanded"),
        getBadge: () => currentBadge || 0,
        getTitle: () => title,
        getContent: () => content,
        close: () => {
            if (trayIconBtn) trayIconBtn.remove();
            dock.remove();
        },
        setBadge(val, variant) {
            currentBadge = val;
            if (val === null || val === undefined || val === 0 || val === "") {
                badgeEl.style.display = "none";
                badgeEl.textContent = "";
                if (trayBadgeEl) {
                    trayBadgeEl.style.display = "none";
                    trayBadgeEl.textContent = "";
                }
            } else {
                badgeEl.style.display = "inline-flex";
                badgeEl.textContent = String(val);
                if (trayBadgeEl) {
                    trayBadgeEl.style.display = "inline-flex";
                    trayBadgeEl.textContent = String(val);
                }
            }
            if (variant) {
                badgeVariant = variant;
                badgeEl.className = `ui-dock-badge badge-${variant}`;
                if (trayIconBtn) trayIconBtn.className = `ui-dock-tray-icon badge-${variant}`;
                if (trayBadgeEl) trayBadgeEl.className = `ui-dock-tray-badge badge-${variant}`;
            }
            if (bindBadge && instance?.state) {
                instance.state[bindBadge] = val;
            }
        },
        setTitle(t) {
            title = t;
            titleEl.textContent = t;
            if (trayIconBtn) trayIconBtn.title = trayTooltip || `${t} (Minimizado)`;
        },
        setContent(newContent) {
            content = newContent;
            renderContent();
        },
        clear() {
            content = [];
            renderContent();
        },
        addItem(item, prepend = false) {
            const node = typeof item === 'string' ? createElement("div", "ui-dock-text-item", [item]) : item;
            if (prepend && body.firstChild) {
                body.insertBefore(node, body.firstChild);
            } else {
                body.appendChild(node);
            }
        },
        destroy() {
            if (trayIconBtn) trayIconBtn.remove();
            dock.remove();
        }
    };

    // Mescla a API diretamente no elemento do dock para acesso direto
    Object.assign(dock, dockApi);
    dock.dockApi = dockApi;

    // Anexa ao target se for global ou configurado
    if (!instance || targetContainer) {
        target.appendChild(dock);
    }

    if (startMinimized) {
        minimizeToTray();
    }

    return dockApi;
}

export function FloatButton({
    icon = "⚡",
    activeIcon = "✕",
    tooltip = "Ações Rápidas",
    position = "bottom-right", // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
    variant = "primary",       // 'primary', 'success', 'danger', 'info', 'surface'
    size = "52px",
    shape = "circle",          // 'circle', 'square', 'rounded'
    actions = [],              // [{ icon, label, variant, action: (btn, e) => {} }]
    draggable = false,         // Booleano para permitir arrastar o botão livremente pela tela
    onClick = null,
    instance = null,
    targetContainer = null
} = {}) {
    const isLocal = !!instance && !targetContainer;
    let target = targetContainer || (instance?.element) || document.getElementById("app") || document.body;

    const wrap = createElement("div", `ui-float-button-wrap pos-${position} ${isLocal ? 'is-local' : 'is-global'} ${draggable ? 'is-draggable' : ''}`);

    // Contêiner de ações em cascata (Speed Dial)
    const dial = createElement("div", `ui-float-dial dial-${position.startsWith('top') ? 'down' : 'up'}`);

    actions.forEach((act, idx) => {
        const item = createElement("div", `ui-float-dial-item variant-${act.variant || 'surface'}`);
        item.style.transitionDelay = `${idx * 0.04}s`;

        if (act.label) {
            const lbl = createElement("span", "ui-float-dial-label", [act.label]);
            item.appendChild(lbl);
        }

        const actionBtn = createElement("button", `ui-float-dial-btn variant-${act.variant || 'surface'}`);
        if (act.tooltip) actionBtn.title = act.tooltip;
        if (typeof act.icon === 'string') actionBtn.innerHTML = act.icon;
        else if (act.icon instanceof Node) actionBtn.appendChild(act.icon);

        actionBtn.onclick = (e) => {
            e.stopPropagation();
            wrap.classList.remove("open");
            if (typeof act.action === 'function') act.action(fabApi, e);
            else if (typeof act.action === 'string' && instance && typeof instance[act.action] === 'function') {
                instance[act.action](e);
            }
        };

        item.appendChild(actionBtn);
        dial.appendChild(item);
    });

    // Botão Principal
    const mainBtn = createElement("button", `ui-float-btn variant-${variant} shape-${shape}`);
    mainBtn.style.width = typeof size === 'number' ? `${size}px` : size;
    mainBtn.style.height = typeof size === 'number' ? `${size}px` : size;
    if (tooltip) mainBtn.title = tooltip;

    const iconSpan = createElement("span", "ui-float-btn-icon", [typeof icon === 'string' ? icon : '']);
    if (icon instanceof Node) iconSpan.appendChild(icon);

    const activeIconSpan = createElement("span", "ui-float-btn-icon-active", [typeof activeIcon === 'string' ? activeIcon : '']);
    if (activeIcon instanceof Node) activeIconSpan.appendChild(activeIcon);

    mainBtn.appendChild(iconSpan);
    if (actions.length > 0) mainBtn.appendChild(activeIconSpan);

    let isDragging = false;
    let dragThresholdPassed = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    if (draggable) {
        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return; // apenas clique primário
            isDragging = true;
            dragThresholdPassed = false;

            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

            startX = clientX;
            startY = clientY;

            const rect = wrap.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            const onPointerMove = (moveEvent) => {
                if (!isDragging) return;
                const curX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0] ? moveEvent.touches[0].clientX : 0);
                const curY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0] ? moveEvent.touches[0].clientY : 0);

                const deltaX = curX - startX;
                const deltaY = curY - startY;

                if (!dragThresholdPassed && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
                    dragThresholdPassed = true;
                    wrap.classList.add("dragging");
                    // Limpa posicionamentos fixos de classe
                    wrap.style.setProperty("bottom", "auto", "important");
                    wrap.style.setProperty("right", "auto", "important");
                }

                if (dragThresholdPassed) {
                    const parentRect = target === document.body || target === document.getElementById("app")
                        ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
                        : target.getBoundingClientRect();

                    let newLeft = initialLeft + deltaX;
                    let newTop = initialTop + deltaY;

                    // Confinar dentro dos limites da tela ou contêiner
                    const maxLeft = parentRect.left + parentRect.width - wrap.offsetWidth;
                    const maxTop = parentRect.top + parentRect.height - wrap.offsetHeight;

                    newLeft = Math.max(parentRect.left, Math.min(newLeft, maxLeft));
                    newTop = Math.max(parentRect.top, Math.min(newTop, maxTop));

                    wrap.style.setProperty("left", `${newLeft}px`, "important");
                    wrap.style.setProperty("top", `${newTop}px`, "important");

                    // Ajusta direção do dial dinamicamente se estiver muito no topo da tela
                    if (newTop < 180) {
                        dial.classList.remove("dial-up");
                        dial.classList.add("dial-down");
                    } else {
                        dial.classList.remove("dial-down");
                        dial.classList.add("dial-up");
                    }
                }
            };

            const onPointerUp = () => {
                isDragging = false;
                wrap.classList.remove("dragging");
                window.removeEventListener("mousemove", onPointerMove);
                window.removeEventListener("mouseup", onPointerUp);
                window.removeEventListener("touchmove", onPointerMove);
                window.removeEventListener("touchend", onPointerUp);
            };

            window.addEventListener("mousemove", onPointerMove, { passive: false });
            window.addEventListener("mouseup", onPointerUp);
            window.addEventListener("touchmove", onPointerMove, { passive: false });
            window.addEventListener("touchend", onPointerUp);
        };

        mainBtn.addEventListener("mousedown", onPointerDown);
        mainBtn.addEventListener("touchstart", onPointerDown, { passive: true });
    }

    mainBtn.onclick = (e) => {
        e.stopPropagation();
        if (dragThresholdPassed) {
            dragThresholdPassed = false;
            return; // se foi arrasto, não dispara o clique/abertura
        }

        if (actions.length > 0) {
            wrap.classList.toggle("open");
        }
        if (typeof onClick === 'function') onClick(fabApi, e);
        else if (typeof onClick === 'string' && instance && typeof instance[onClick] === 'function') {
            instance[onClick](e);
        }
    };

    // Fecha ao clicar fora
    document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) {
            wrap.classList.remove("open");
        }
    });

    wrap.appendChild(dial);
    wrap.appendChild(mainBtn);

    const fabApi = {
        element: wrap,
        open: () => wrap.classList.add("open"),
        close: () => wrap.classList.remove("open"),
        toggle: () => wrap.classList.toggle("open"),
        isOpen: () => wrap.classList.contains("open"),
        setPosition: (x, y) => {
            wrap.style.setProperty("left", `${x}px`, "important");
            wrap.style.setProperty("top", `${y}px`, "important");
            wrap.style.setProperty("bottom", "auto", "important");
            wrap.style.setProperty("right", "auto", "important");
        },
        destroy: () => wrap.remove()
    };

    // Mescla a API diretamente no elemento do FAB para acesso direto
    Object.assign(wrap, fabApi);
    wrap.fabApi = fabApi;

    if (!instance || targetContainer) {
        target.appendChild(wrap);
    }

    return wrap;
}

// ============================================================
//  ShortcutContainer — Grade de Atalhos (Desktop / Janela)
// ============================================================
/**
 * Cria um contêiner de grade de atalhos, compatível com o Desktop ou o corpo de uma Janela.
 *
 * @param {object} options
 * @param {HTMLElement|string} [options.container]           - Elemento‑pai ou ID do contêiner‑pai.
 * @param {Shortcut[]}         [options.shortcuts=[]]        - Array de elementos Shortcut() iniciais.
 * @param {string}             [options.alignH='left']       - Alinhamento horizontal: 'left'|'center'|'right'|'justify'.
 * @param {string}             [options.alignV='top']        - Alinhamento vertical: 'top'|'center'|'bottom'|'stretch'.
 * @param {string|number}      [options.shortcutSize='80px'] - Tamanho-célula dos atalhos na grade.
 * @param {string}             [options.gap='8px']           - Espaço entre atalhos.
 * @param {string|number}      [options.width='100%']        - Largura do contêiner.
 * @param {string|number}      [options.height='100%']       - Altura do contêiner.
 * @param {boolean}            [options.full=false]          - Preenche todo o pai (position:absolute inset:0).
 * @param {boolean}            [options.scroll=true]         - Exibe scrollbars quando necessário.
 * @param {boolean}            [options.autoResize=false]    - Ajusta shortcutSize para caber na área disponível.
 * @param {boolean}            [options.border=false]        - Exibe borda ao redor do contêiner.
 * @param {boolean}            [options.visible=true]        - Visibilidade inicial.
 * @param {string}             [options.sort='none']         - Ordenação: 'none'|'asc'|'desc'|'type'.
 * @param {string}             [options.id]                  - ID do elemento.
 * @param {string}             [options.className]           - Classes CSS extras.
 * @param {string}             [options.style]               - Estilos inline extras.
 * @param {boolean}            [options.passthroughPointer=false] - Se true, o container passa os eventos de mouse para os elementos abaixo (ideal para overlay no Desktop). Os atalhos individuais mantêm clicabilidade.
 * @param {object}             [options.contextMenu]         - Menu de contexto do contêiner.
 * @returns {HTMLElement}  O elemento do contêiner (com API: addShortcut, removeShortcut, sort, clear, setVisible…)
 */

export function ShortcutContainer(options = {}) {
    const {
        container = null,
        shortcuts = [],
        alignH = 'left',
        alignV = 'top',
        shortcutSize = '80px',
        gap = '8px',
        width = '100%',
        height = '100%',
        full = false,
        scroll = true,
        autoResize = false,
        border = false,
        visible = true,
        sort = 'none',
        passthroughPointer = false,
        id,
        className = '',
        style = '',
        contextMenu = null
    } = options;

    // ---- Mapeamento de alinhamentos para CSS ----
    const hMap = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'space-evenly' };
    const vMap = { top: 'flex-start', center: 'center', bottom: 'flex-end', stretch: 'stretch' };

    const el = document.createElement('div');
    el.className = `ui-shortcut-container ${className}`.trim();
    if (id) el.id = id;

    // ---- Layout base ----
    const shortcutSizePx = typeof shortcutSize === 'number' ? `${shortcutSize}px` : shortcutSize;
    const gapPx = typeof gap === 'number' ? `${gap}px` : gap;
    const widthPx = typeof width === 'number' ? `${width}px` : width;
    const heightPx = typeof height === 'number' ? `${height}px` : height;

    el.style.display = 'flex';
    el.style.flexWrap = 'wrap';
    el.style.justifyContent = hMap[alignH] || 'flex-start';
    el.style.alignContent = vMap[alignV] || 'flex-start';
    el.style.alignItems = vMap[alignV] || 'flex-start';
    el.style.gap = gapPx;
    el.style.padding = gapPx;
    el.style.boxSizing = 'border-box';
    el.style.width = widthPx;
    el.style.height = heightPx;
    el.style.overflow = scroll ? 'auto' : 'hidden';
    el.style.overflowX = scroll ? 'auto' : 'hidden';
    el.dataset.shortcutSize = shortcutSizePx;

    if (full) {
        el.style.position = 'absolute';
        el.style.inset = '0';
        el.style.width = '100%';
        el.style.height = '100%';
    }

    if (border) el.classList.add('ui-shortcut-container--border');
    if (!visible) el.style.display = 'none';

    // ---- Passthrough de pointer (overlay transparente no desktop) ----
    if (passthroughPointer) {
        el.style.pointerEvents = 'none';
    }

    // Nota: o contextMenu do container é vinculado ao próprio elemento.
    // Quando passthroughPointer=true, o contextmenu chega pelo atalho abaixo
    // (que tem pointer-events:auto). O contextMenu do container é útil no modo sem passthrough.

    if (style) {
        if (typeof style === 'string') {
            el.style.cssText += ';' + style;
        } else {
            Object.assign(el.style, style);
        }
    }

    // ---- Função interna de ordenação ----
    function _sortShortcuts(mode) {
        const children = Array.from(el.querySelectorAll('.ui-shortcut'));
        if (!children.length || mode === 'none') return;
        children.sort((a, b) => {
            const la = (a.dataset.shortcutLabel || '').toLowerCase();
            const lb = (b.dataset.shortcutLabel || '').toLowerCase();
            const ta = a.dataset.shortcutType || '';
            const tb = b.dataset.shortcutType || '';
            if (mode === 'type') {
                if (ta !== tb) return ta.localeCompare(tb);
                return la.localeCompare(lb);
            }
            const cmp = la.localeCompare(lb);
            return mode === 'desc' ? -cmp : cmp;
        });
        children.forEach(c => el.appendChild(c));
    }

    // ---- Auto-resize: observa mudanças de tamanho ----
    let _resizeObserver = null;
    function _applyAutoResize() {
        if (!autoResize) return;
        const containerW = el.clientWidth || 300;
        const minCell = 56;
        const cols = Math.max(1, Math.floor(containerW / minCell));
        const cell = Math.floor((containerW - (cols + 1) * 8) / cols);
        el.querySelectorAll('.ui-shortcut').forEach(sc => {
            sc.style.width = `${cell}px`;
            sc.style.height = `${cell}px`;
        });
    }

    if (autoResize && typeof ResizeObserver !== 'undefined') {
        _resizeObserver = new ResizeObserver(_applyAutoResize);
        _resizeObserver.observe(el);
    }

    // ---- Adicionar atalhos ----
    function _addShortcut(scEl) {
        if (!scEl) return;
        scEl.style.width = shortcutSizePx;
        scEl.style.height = shortcutSizePx;
        // Garante clicabilidade individual quando o container está em modo passthrough
        if (passthroughPointer) scEl.style.pointerEvents = 'auto';
        el.appendChild(scEl);
    }

    shortcuts.forEach(sc => _addShortcut(sc));
    if (sort !== 'none') _sortShortcuts(sort);

    // ---- Contexto ----
    if (contextMenu) {
        el.setContextMenu = el.setContextMenu || ((items) => {
            if (el._contextMenuController && typeof el._contextMenuController.destroy === 'function') {
                el._contextMenuController.destroy();
            }
            el._contextMenuController = bindContextMenu(el, Array.isArray(items) ? items : items.items, {});
        });
        el.setContextMenu(contextMenu);
    }

    // ---- API pública ----
    const api = {
        element: el,

        /** Adiciona um atalho (resultado de Shortcut()) ao contêiner. */
        addShortcut(scEl) {
            _addShortcut(scEl);
            if (sort !== 'none') _sortShortcuts(sort);
            if (autoResize) _applyAutoResize();
            return this;
        },

        /** Remove um atalho pelo seu elemento ou por id/label. */
        removeShortcut(target) {
            if (target instanceof HTMLElement) {
                if (el.contains(target)) el.removeChild(target);
            } else if (typeof target === 'string') {
                const found = el.querySelector(`[data-shortcut-label="${target}"], #${target}`);
                if (found) el.removeChild(found);
            }
            return this;
        },

        /** Reordena os atalhos. Modos: 'asc'|'desc'|'type'|'none' */
        sort(mode) { _sortShortcuts(mode); return this; },

        /** Remove todos os atalhos. */
        clear() { el.querySelectorAll('.ui-shortcut').forEach(sc => sc.remove()); return this; },

        /** Altera alinhamento horizontal. */
        setAlignH(h) { el.style.justifyContent = hMap[h] || h; return this; },

        /** Altera alinhamento vertical. */
        setAlignV(v) { el.style.alignContent = el.style.alignItems = vMap[v] || v; return this; },

        /** Altera o tamanho-célula dos atalhos. */
        setShortcutSize(size) {
            const s = typeof size === 'number' ? `${size}px` : size;
            el.dataset.shortcutSize = s;
            el.querySelectorAll('.ui-shortcut').forEach(sc => { sc.style.width = s; sc.style.height = s; });
            return this;
        },

        /** Mostra/oculta o contêiner. */
        setVisible(v) { el.style.display = v ? 'flex' : 'none'; return this; },

        /** Ativa/desativa borda. */
        setBorder(v) { el.classList.toggle('ui-shortcut-container--border', v); return this; },

        /** Altera ou define o menu de contexto do container em tempo real. */
        setContextMenu(items) {
            if (el._contextMenuController && typeof el._contextMenuController.destroy === 'function') {
                el._contextMenuController.destroy();
            }
            el._contextMenuController = bindContextMenu(el, Array.isArray(items) ? items : items.items, {});
            return this;
        },

        /** Retorna todos os atalhos atuais. */
        getShortcuts() { return Array.from(el.querySelectorAll('.ui-shortcut')); },

        /** Destrói o componente e o observer. */
        destroy() {
            if (_resizeObserver) _resizeObserver.disconnect();
            el.remove();
        }
    };

    Object.assign(el, api);

    // ---- Montar no pai, se informado ----
    if (container) {
        const parent = typeof container === 'string' ? document.getElementById(container) : container;
        if (parent) {
            // Se full=true, garante que o pai tem position para o overlay funcionar
            if (full && getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
            parent.appendChild(el);
        }
    }

    return el;
}

// ============================================================
//  Shortcut — Atalho Clicável (para uso em ShortcutContainer ou avulso)
// ============================================================
/**
 * Cria um atalho clicável para uso em ShortcutContainer ou qualquer outro contêiner.
 *
 * @param {object} options
 * @param {string}          [options.label]            - Texto exibido abaixo do atalho.
 * @param {string}          [options.image]            - URL de imagem ou emoji/SVG para o atalho.
 * @param {string}          [options.icon]             - Alias de image (emoji, texto ou URL).
 * @param {function|string} [options.action]           - Função a executar ou screen/ação da Screen.
 * @param {object}          [options.instance]         - Instância de Screen (para runAction por nome).
 * @param {string}          [options.type='app']       - Tipo: 'app'|'folder'|'file'|'link' (para ordenação).
 * @param {number|string}   [options.iconSize='48px']  - Tamanho do ícone/imagem.
 * @param {number|string}   [options.fontSize='11px']  - Tamanho da fonte do label.
 * @param {boolean}         [options.active=false]     - Estado ativo inicial (selecionado).
 * @param {boolean}         [options.disabled=false]   - Desativado (não clicável, aparência faded).
 * @param {boolean}         [options.visible=true]     - Visibilidade.
 * @param {string}          [options.tooltip]          - Texto do tooltip (title).
 * @param {string}          [options.id]               - ID do elemento.
 * @param {string}          [options.className]        - Classes extras.
 * @param {string}          [options.style]            - Estilos inline extras.
 * @param {object}          [options.contextMenu]      - Menu de contexto do atalho.
 * @returns {HTMLElement}  O elemento do atalho (com API: setActive, setDisabled, setVisible, setLabel, setImage…)
 */

export function Shortcut(options = {}) {
    const {
        label = '',
        image = '',
        icon = '',
        action = null,
        instance = null,
        type = 'app',
        iconSize = '48px',
        fontSize = '11px',
        active = false,
        disabled = false,
        visible = true,
        tooltip = '',
        id,
        className = '',
        style = '',
        contextMenu = null
    } = options;

    const visual = image || icon;  // Preferência: image, fallback icon

    const el = document.createElement('div');
    el.className = `ui-shortcut ${className}`.trim();
    if (id) el.id = id;
    if (tooltip || label) el.title = tooltip || label;

    // Datasets para busca/ordenação
    el.dataset.shortcutLabel = label;
    el.dataset.shortcutType = type;

    // ---- Imagem / Ícone ----
    const imgEl = document.createElement('div');
    imgEl.className = 'ui-shortcut__image';

    const iconSizePx = typeof iconSize === 'number' ? `${iconSize}px` : iconSize;

    if (visual) {
        // Detecta se é URL (http/data/blob/caminho com extensão)
        const isUrl = /^(https?:|data:|blob:|\.\/|\.\.\/|\/[^/]|[^:]+\.(png|jpg|jpeg|gif|svg|webp|ico))/.test(visual);
        if (isUrl) {
            const img = document.createElement('img');
            img.src = visual;
            img.alt = label || '';
            img.style.width = iconSizePx;
            img.style.height = iconSizePx;
            img.style.objectFit = 'contain';
            img.draggable = false;
            imgEl.appendChild(img);
        } else {
            // Emoji ou texto
            imgEl.textContent = visual;
            imgEl.style.fontSize = iconSizePx;
            imgEl.style.lineHeight = '1';
        }
    } else {
        // Ícone padrão genérico por tipo
        const defaults = { folder: '📁', file: '📄', link: '🔗', app: '⬜' };
        imgEl.textContent = defaults[type] || '⬜';
        imgEl.style.fontSize = iconSizePx;
        imgEl.style.lineHeight = '1';
    }

    el.appendChild(imgEl);

    // ---- Label ----
    if (label) {
        const lbl = document.createElement('span');
        lbl.className = 'ui-shortcut__label';
        lbl.textContent = label;
        lbl.style.fontSize = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;
        el.appendChild(lbl);
    }

    // ---- Estado inicial ----
    if (active) el.classList.add('active');
    if (disabled) el.classList.add('disabled');
    if (!visible) el.style.display = 'none';

    if (style) {
        if (typeof style === 'string') el.style.cssText += ';' + style;
        else Object.assign(el.style, style);
    }

    // ---- Clique ----
    el.addEventListener('click', (e) => {
        if (el.classList.contains('disabled')) return;

        // Seleciona apenas este atalho no contêiner
        const parent = el.parentElement;
        if (parent) parent.querySelectorAll('.ui-shortcut.active').forEach(sc => sc.classList.remove('active'));
        el.classList.add('active');

        const inst = resolveInstance(instance);
        if (typeof action === 'function') {
            action(e, shortcutApi);
        } else if (typeof action === 'string') {
            if (inst && typeof inst.runAction === 'function') {
                inst.runAction(action);
            } else if (typeof window.Desktop !== 'undefined' && typeof window.Desktop.openScreen === 'function') {
                window.Desktop.openScreen(action);
            }
        }
    });

    // Duplo-clique também executa a ação
    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        el.click();
    });

    // ---- Contexto ----
    if (contextMenu) {
        el.setContextMenu = (items) => {
            if (el._contextMenuController && typeof el._contextMenuController.destroy === 'function') {
                el._contextMenuController.destroy();
            }
            el._contextMenuController = bindContextMenu(el, Array.isArray(items) ? items : items.items, {});
        };
        el.setContextMenu(contextMenu);
    }

    // ---- API pública ----
    const shortcutApi = {
        element: el,

        /** Ativa ou desativa o estado "selecionado". */
        setActive(v) { el.classList.toggle('active', !!v); return this; },

        /** Ativa ou desativa o estado "desabilitado". */
        setDisabled(v) { el.classList.toggle('disabled', !!v); return this; },

        /** Mostra ou oculta o atalho. */
        setVisible(v) { el.style.display = v ? '' : 'none'; return this; },

        /** Altera o texto do label. */
        setLabel(text) {
            el.dataset.shortcutLabel = text;
            const lbl = el.querySelector('.ui-shortcut__label');
            if (lbl) lbl.textContent = text;
            return this;
        },

        /** Altera a imagem/emoji do atalho. */
        setImage(src) {
            const imgEl = el.querySelector('.ui-shortcut__image');
            if (!imgEl) return this;
            imgEl.innerHTML = '';
            const isUrl = /^(https?:|data:|blob:|\.\/|\.\.\/|\/[^/]|[^:]+\.(png|jpg|jpeg|gif|svg|webp|ico))/.test(src);
            if (isUrl) {
                const img = document.createElement('img');
                img.src = src;
                img.style.width = img.style.height = iconSizePx;
                img.style.objectFit = 'contain';
                imgEl.appendChild(img);
            } else {
                imgEl.textContent = src;
            }
            return this;
        },

        /** Altera ou define o menu de contexto do atalho em tempo real. */
        setContextMenu(items) {
            if (el._contextMenuController && typeof el._contextMenuController.destroy === 'function') {
                el._contextMenuController.destroy();
            }
            el._contextMenuController = bindContextMenu(el, Array.isArray(items) ? items : items.items, {});
            return this;
        },

        /** Remove o atalho do DOM. */
        destroy() { el.remove(); }
    };

    Object.assign(el, shortcutApi);

    return el;
}

