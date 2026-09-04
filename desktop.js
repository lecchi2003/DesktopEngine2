// desktop.js
//Autor: Gildasio Lecchi Cravo
import { EventBus, Framework } from './core.js?v=2';
import { bindContextMenu, MenuBar, ActionToolbar, StartMenu, ContextMenu, Modal, DockWidget, FloatButton } from './ui.js?v=2';

export const Desktop = {
    windowsEl: null,
    tasksEl: null,
    nextId: 1,
    zCounter: 20,
    windows: {}, // Referências das instâncias ativas
    screens: {}, // Registro de telas (lazy loaders ou objetos)
    currentTheme: "light",
    currentLaF: "default",
    isMobileActive: false,
    _clockTimer: null,
    _contextMenuController: null,

    _ensureShell(options = {}) {
        const target = options.target || options.rootContainer || "#app";
        let app = typeof target === 'string' ? document.querySelector(target) : target;
        if (!app) {
            app = document.getElementById("app");
        }
        if (!app) {
            app = document.createElement("div");
            app.id = "app";
            document.body.appendChild(app);
        }
        if (!app.id) app.id = "app";

        const menubarId = options.menubarContainerId || "menubar";
        const desktopId = options.desktopContainerId || "desktop";
        const windowsId = options.windowsContainerId || "windows";
        const taskbarId = options.taskbarId || "taskbar";
        const taskWindowsId = options.taskbarContainerId || "taskWindows";
        const startBtnId = options.startButtonId || "startBtn";
        const showDesktopBtnId = options.showDesktopButtonId || "showDesktop";
        const clockId = options.clockContainerId || "clock";

        // 1. MenuBar (se não existir, cria)
        let menubar = document.getElementById(menubarId) || app.querySelector(`#${menubarId}`);
        if (!menubar) {
            menubar = document.createElement("div");
            menubar.id = menubarId;
            menubar.className = "ui-menubar";
            app.appendChild(menubar);
        }

        // 2. Desktop & Windows (se não existirem, cria)
        let desktop = document.getElementById(desktopId) || app.querySelector(`#${desktopId}`);
        if (!desktop) {
            desktop = document.createElement("div");
            desktop.id = desktopId;
            app.appendChild(desktop);
        }

        let windows = document.getElementById(windowsId) || desktop.querySelector(`#${windowsId}`);
        if (!windows) {
            windows = document.createElement("div");
            windows.id = windowsId;
            desktop.appendChild(windows);
        }

        // 3. Taskbar (se não existir, cria)
        let taskbar = document.getElementById(taskbarId) || app.querySelector(`#${taskbarId}`);
        if (!taskbar) {
            taskbar = document.createElement("div");
            taskbar.id = taskbarId;
            taskbar.className = "taskbar";
            app.appendChild(taskbar);
        }

        // Itens internos da Taskbar
        let startBtn = document.getElementById(startBtnId) || taskbar.querySelector(`button#${startBtnId}, .taskStart`);
        if (!startBtn && options.startButton !== false) {
            startBtn = document.createElement("button");
            startBtn.className = "taskStart";
            startBtn.id = startBtnId;
            startBtn.setAttribute("data-role", "start-button");
            startBtn.textContent = "Iniciar";
            taskbar.appendChild(startBtn);
        }

        let showDesktopBtn = document.getElementById(showDesktopBtnId) || taskbar.querySelector(`button#${showDesktopBtnId}, .taskShowDesktop`);
        if (!showDesktopBtn && options.showDesktopButton !== false) {
            showDesktopBtn = document.createElement("button");
            showDesktopBtn.className = "taskShowDesktop";
            showDesktopBtn.id = showDesktopBtnId;
            showDesktopBtn.title = "Mostrar Área de Trabalho";
            showDesktopBtn.textContent = "🖥️";
            taskbar.appendChild(showDesktopBtn);
        }

        let taskWindows = document.getElementById(taskWindowsId) || taskbar.querySelector(`div#${taskWindowsId}, .taskWindows`);
        if (!taskWindows) {
            taskWindows = document.createElement("div");
            taskWindows.className = "taskWindows";
            taskWindows.id = taskWindowsId;
            taskbar.appendChild(taskWindows);
        }

        let clock = document.getElementById(clockId) || taskbar.querySelector(`div#${clockId}, .clock`);
        if (!clock && options.clock !== false) {
            clock = document.createElement("div");
            clock.className = "clock";
            clock.id = clockId;
            taskbar.appendChild(clock);
        }

        return { app, menubar, desktop, windows, taskbar, startBtn, showDesktopBtn, taskWindows, clock };
    },

    init(options = {}) {
        this.windows = {}; // Reseta referências ativas ao inicializar
        this.options = {
            windowsContainerId: "windows",
            taskbarContainerId: "taskWindows",
            taskbarPosition: "bottom",
            startButtonId: "startBtn",
            showDesktopButtonId: "showDesktop",
            showDesktopButton: true,
            defaultLaF: "default",
            responsiveMode: "auto", // 'auto' | 'mobile' | 'desktop'
            mobileBreakpoint: 768,
            clock: true,
            ...options
        };

        // Garante e monta o shell do Desktop automaticamente se necessário
        this._ensureShell(this.options);

        // Carrega Look and Feel persistido, por URL ou padrão
        try {
            const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
            const urlLaF = urlParams ? urlParams.get("laf") : null;
            const savedLaF = urlLaF || localStorage.getItem("desktop_engine_laf") || this.options.defaultLaF;
            this.setLookAndFeel(savedLaF, !urlLaF);
        } catch (e) {
            this.setLookAndFeel(this.options.defaultLaF, false);
        }

        // Carrega Posição da Taskbar persistida ou padrão
        try {
            const savedTaskbar = localStorage.getItem("desktop_engine_taskbar_pos") || this.options.taskbarPosition || "bottom";
            this.setTaskbarPosition(savedTaskbar, false);
        } catch (e) {
            this.setTaskbarPosition(this.options.taskbarPosition || "bottom", false);
        }

        // Carrega Posição / Modo do MenuBar persistido ou padrão
        try {
            const savedMenuBarMode = localStorage.getItem("desktop_engine_menubar_mode");
            const savedMenuBarPos = localStorage.getItem("desktop_engine_menubar_pos");
            
            if (savedMenuBarMode === "startmenu" || savedMenuBarPos === "none") {
                this.setMenuBarPosition("none", false);
            } else if (savedMenuBarPos && ["top", "bottom", "left", "right"].includes(savedMenuBarPos)) {
                this.setMenuBarPosition(savedMenuBarPos, false);
            } else {
                this.setMenuBarPosition(this.options.menubarPosition || "top", false);
            }
        } catch (e) {
            this.setMenuBarPosition(this.options.menubarPosition || "top", false);
        }

        this.windowsEl = document.getElementById(this.options.windowsContainerId);
        this.tasksEl = document.getElementById(this.options.taskbarContainerId);

        const app = document.getElementById("app");
        if (app) app.dataset.taskbar = this.options.taskbarPosition;

        // Auto-conecta o botão Mostrar Área de Trabalho
        const desktopBtn = document.getElementById(this.options.showDesktopButtonId || "showDesktop");
        if (desktopBtn) {
            if (this.options.showDesktopButton === false) {
                desktopBtn.style.display = "none";
            } else {
                desktopBtn.style.display = "";
                desktopBtn.onclick = () => this.showDesktop();
            }
        }

        // Registro de telas declarativas via init
        if (this.options.screens && typeof this.options.screens === 'object') {
            Object.entries(this.options.screens).forEach(([id, screen]) => {
                this.registerScreen(id, screen);
            });
        }

        // Menu de Contexto Declarativo do Desktop
        if (this.options.contextMenu) {
            this.setContextMenu(this.options.contextMenu, this.options.desktopContainerId || "desktop");
        }

        // MenuBar Declarativo do Desktop
        if (this.options.menuBar) {
            this.setMenuBar(this.options.menuBar, this.options.menubarPosition || "top");
        }

        // StartMenu Declarativo da Taskbar
        if (this.options.startMenu) {
            this.setStartMenu(this.options.startMenu, this.options.startButtonId || "startBtn");
        }

        // Relógio Nativo da Taskbar
        if (this.options.clock !== false) {
            this.setClock(this.options.clock);
        }

        // Atualiza estilo e ícone do botão Iniciar de acordo com o Look and Feel
        this.updateStartButton();
        this.syncTaskbarMenus();

        // Configura modo responsivo
        this.setMobileMode(this.options.responsiveMode || "auto", false);

        window.addEventListener("resize", () => {
            this.checkResponsiveMode();
            if (!this.isMobile()) {
                document.querySelectorAll(".window:not(.maximized)").forEach(w => {
                    const maxX = this.windowsEl.clientWidth - w.offsetWidth;
                    const maxY = this.windowsEl.clientHeight - w.offsetHeight;
                    w.style.left = Math.max(0, Math.min(maxX, w.offsetLeft)) + "px";
                    w.style.top = Math.max(0, Math.min(maxY, w.offsetTop)) + "px";
                });
            }
        });

        document.addEventListener('mousedown', (e) => {
            const winEl = e.target.closest('.window');
            if (winEl) {
                this.focusWindow(winEl);
            }
        });

        // --- UX da Taskbar ---
        // Scroll via Mouse Wheel
        this.tasksEl.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.tasksEl.scrollLeft += e.deltaY;
            }
        });

        // Drag-to-scroll
        let isDown = false;
        let startX;
        let scrollLeft;

        this.tasksEl.addEventListener('mousedown', (e) => {
            // Não ativa o arrastar se clicou especificamente para fechar/minimizar algo, ou fora do container
            isDown = true;
            this.tasksEl.classList.add('dragging');
            startX = e.pageX - this.tasksEl.offsetLeft;
            scrollLeft = this.tasksEl.scrollLeft;
        });
        this.tasksEl.addEventListener('mouseleave', () => {
            isDown = false;
            this.tasksEl.classList.remove('dragging');
        });
        this.tasksEl.addEventListener('mouseup', () => {
            isDown = false;
            this.tasksEl.classList.remove('dragging');
        });
        this.tasksEl.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - this.tasksEl.offsetLeft;
            const walk = (x - startX) * 1.5; // Velocidade do scroll
            this.tasksEl.scrollLeft = scrollLeft - walk;
        });

        this.setupNotifyContainer();
    },

    arrangeWindows() {
        const visible = [...document.querySelectorAll(".window:not(.minimized):not(.maximized)")];
        if (visible.length === 0) return;

        const cols = Math.ceil(Math.sqrt(visible.length));
        const rows = Math.ceil(visible.length / cols);

        const w = this.windowsEl.clientWidth / cols;
        const h = this.windowsEl.clientHeight / rows;

        visible.forEach((win, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            win.style.width = w + "px";
            win.style.height = h + "px";
            win.style.left = (col * w) + "px";
            win.style.top = (row * h) + "px";
            this.focusWindow(win); // Bring to front naturally
        });
    },

    setupNotifyContainer() {
        this.notifyContainer = document.createElement("div");
        this.notifyContainer.className = "desktop-notifications";
        document.body.appendChild(this.notifyContainer);
    },

    notify(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        this.notifyContainer.appendChild(toast);

        // Animação de entrada
        requestAnimationFrame(() => toast.classList.add("show"));

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    blinkWindow(w) {
        if (!w) return;
        w.classList.remove("blink");
        void w.offsetWidth; // Force reflow
        w.classList.add("blink");
        setTimeout(() => {
            if (w && document.body.contains(w)) w.classList.remove("blink");
        }, 400);
    },

    open(instance) {
        return this.createWindow(instance);
    },

    createWindow(instance) {
        if (instance.config?.singleInstance) {
            // Procura se já existe uma instância aberta dessa mesma tela
            for (const [id, openWin] of Object.entries(this.windows)) {
                if (openWin.config === instance.config) {
                    const w = openWin.windowEl;
                    if (w && document.body.contains(w)) {
                        if (w.classList.contains("minimized")) this.restoreWindow(w);
                        else this.focusWindow(w);
                        this.blinkWindow(w);
                        return w;
                    } else {
                        delete this.windows[id];
                    }
                }
            }
        }

        const config = instance.config;

        const w = document.createElement("div");
        w.className = "window";
        w.dataset.id = instance.id;
        instance.windowEl = w;
        this.windows[instance.id] = instance;

        const offset = (this.nextId * 27) % 160;
        w.style.left = (45 + offset) + "px";
        w.style.top = (35 + ((this.nextId * 19) % 100)) + "px";
        w.style.zIndex = ++this.zCounter;

        const animation = config.animation || "";
        if (animation && animation !== 'none') {
            w.classList.add(`anim-open-${animation}`);
        }

        if (config.width) w.style.width = config.width + "px";
        if (config.height) w.style.height = config.height + "px";

        const closable = (config.closable !== false && config.showCloseButton !== false);
        const minimizable = config.minimizable !== false;
        const maximizable = config.maximizable !== false;
        const resizable = config.resizable !== false;

        w.innerHTML = `
            <div class="titlebar">
                <div class="titleIcon"></div>
                <div class="titleText"></div>
                <div class="winButtons">
                    ${minimizable ? `<div class="winBtn minimize" title="Minimizar">−</div>` : ''}
                    ${maximizable ? `<div class="winBtn maximize" title="Maximizar">□</div>` : ''}
                    ${closable ? `<div class="winBtn close" title="Fechar">×</div>` : ''}
                </div>
            </div>
            <div class="window-menubar ui-menubar" style="display: none;"></div>
            <div class="window-action-toolbar ui-action-toolbar" style="display: none;"></div>
            <div class="windowBody"></div>
            <div class="statusbar"></div>
            ${resizable ? `
            <div class="resizeHandle r-n" data-dir="n"></div>
            <div class="resizeHandle r-s" data-dir="s"></div>
            <div class="resizeHandle r-e" data-dir="e"></div>
            <div class="resizeHandle r-w" data-dir="w"></div>
            <div class="resizeHandle r-ne" data-dir="ne"></div>
            <div class="resizeHandle r-nw" data-dir="nw"></div>
            <div class="resizeHandle r-se" data-dir="se"></div>
            <div class="resizeHandle r-sw" data-dir="sw"></div>
            ` : ''}
        `;

        const titleIconEl = w.querySelector(".titleIcon");
        if (titleIconEl) {
            const iconVal = config.icon !== undefined ? config.icon : "🗔";
            titleIconEl.textContent = iconVal || "";
            if (!iconVal) titleIconEl.style.display = "none";
        }

        const titleTextEl = w.querySelector(".titleText");
        if (titleTextEl) titleTextEl.textContent = config.title || "Window";

        const statusbarEl = w.querySelector(".statusbar");
        if (statusbarEl) statusbarEl.textContent = config.status || "Pronto";

        // --- Injeção de Métodos de Controle na Instância ---
        instance.setMenuBar = (menus, position) => this.setWindowMenuBar(instance, menus, position);
        instance.getMenuBar = () => instance.windowEl ? instance.windowEl.querySelector(".window-menubar") : null;
        instance.setActionToolbar = (actions, position) => this.setWindowActionToolbar(instance, actions, position);
        instance.getActionToolbar = () => instance.windowEl ? instance.windowEl.querySelector(".window-action-toolbar") : null;
        instance.setContextMenu = (items) => {
            if (instance._contextMenuController?.destroy) instance._contextMenuController.destroy();
            instance._contextMenuController = bindContextMenu(w.querySelector(".windowBody") || w, items);
            return instance._contextMenuController;
        };
        instance.openModal = (options = {}) => Modal({ ...options, instance, global: false });
        instance.createDockWidget = (options = {}) => DockWidget({ ...options, instance });
        instance.createFloatButton = (options = {}) => FloatButton({ ...options, instance });
        instance.close = (resultData = undefined) => this.closeWindow(instance, w, task, resultData);
        instance.minimize = () => this.minimizeWindow(w);
        instance.maximize = () => this.maximizeWindow(w);
        instance.restore = () => this.restoreWindow(w);
        instance.toggleMaximize = () => instance.isMaximized() ? this.restoreWindow(w) : this.maximizeWindow(w);
        instance.isMaximized = () => !!(w && w.classList.contains("maximized"));
        instance.isMinimized = () => !!(w && w.classList.contains("minimized"));
        instance.isFocused = () => this.activeWindowId === instance.id;
        instance.focus = () => this.focusWindow(w);

        // --- Inicializa Window MenuBar se configurado na tela ---
        const windowMenus = config.menubar || config.menus || config.menu;
        if (windowMenus && Array.isArray(windowMenus) && windowMenus.length > 0) {
            const initialPos = config.menubarPosition || config.menuBarPosition || config.menuPosition || "top";
            this.setWindowMenuBar(instance, windowMenus, initialPos);
        }

        // --- Inicializa Window Action Toolbar se configurado na tela ---
        const windowActions = config.actionToolbar || config.toolbar || config.actionMenu || config.menuActions || (Array.isArray(config.actions) ? config.actions : null);
        if (windowActions && Array.isArray(windowActions) && windowActions.length > 0) {
            const initialActionPos = config.actionToolbarPosition || config.toolbarPosition || config.actionsPosition || "top";
            this.setWindowActionToolbar(instance, windowActions, initialActionPos);
        }

        // --- Inicializa Window ContextMenu se configurado declarativamente na tela ---
        const windowContextMenu = config.contextMenu || config.contextmenu;
        if (windowContextMenu) {
            instance.setContextMenu(windowContextMenu);
        }

        // --- Hook: beforeMount (Antes do primeiro render) ---
        if (typeof instance.beforeMount === 'function') {
            try { instance.beforeMount(); } catch (e) { console.error("Erro no hook beforeMount:", e); }
        }

        // Renderiza conteúdo
        const bodyEl = w.querySelector(".windowBody");
        const contentEl = instance.render();
        if (bodyEl && contentEl) {
            bodyEl.appendChild(contentEl);
        }

        const isContained = (config.contained || config.insideParent || config.containedInParent) && instance.parentInstance && instance.parentInstance.windowEl;

        if (isContained) {
            const pEl = instance.parentInstance.windowEl;
            pEl.classList.add("has-contained-child");
            w.classList.add("is-contained-child");
            pEl.appendChild(w);

            const childW = config.width || 420;
            const childH = config.height || 300;
            const left = Math.max(0, (pEl.clientWidth - childW) / 2);
            const top = Math.max(0, (pEl.clientHeight - childH) / 2);
            w.style.left = left + "px";
            w.style.top = top + "px";
        } else {
            this.windowsEl.appendChild(w);
        }

        // Taskbar button
        const task = document.createElement("button");
        task.className = "taskButton";
        task.dataset.window = instance.id;
        const windowTitle = (config.icon ? config.icon + " " : "") + (config.title || "Window");
        task.textContent = windowTitle;
        task.title = windowTitle; // Hint / tooltip com o título completo ao parar o mouse
        this.tasksEl.appendChild(task);
        instance.taskEl = task;

        // --- Menus Dinâmicos Baseados nas Propriedades ---
        const buildMenu = (forTaskbar = false) => {
            const menu = [];
            if (maximizable) menu.push({ label: "Restaurar / Maximizar", action: () => { if (w.classList.contains("minimized")) this.restoreWindow(w); else this.maximizeWindow(w); } });
            if (minimizable) menu.push({ label: "Minimizar", action: () => this.minimizeWindow(w) });
            if (menu.length > 0) menu.push("separator");
            menu.push({ label: "Fechar Janela", action: () => this.closeWindow(instance, w, task) });
            return menu;
        };

        // --- Adiciona Menu de Contexto na Titlebar e Taskbar ---
        const titlebarEl = w.querySelector('.titlebar');
        bindContextMenu(titlebarEl, buildMenu());
        bindContextMenu(task, buildMenu(true));

        // Bind events
        task.addEventListener("click", () => this.toggleWindow(w));

        const closeBtn = w.querySelector(".close");
        if (closeBtn) closeBtn.onclick = () => this.closeWindow(instance, w, task);
        if (minimizable) w.querySelector(".minimize").onclick = () => this.minimizeWindow(w);
        if (maximizable) w.querySelector(".maximize").onclick = () => this.maximizeWindow(w);

        this.setupDrag(w, w.querySelector(".titlebar"));
        if (resizable) this.setupResize(w);

        this.nextId++;

        // Trigger onMount
        if (typeof instance.onMount === 'function') {
            try { instance.onMount(); } catch (e) { console.error("Erro no hook onMount:", e); }
        }

        this.focusWindow(w);

        if (this.isMobile()) {
            setTimeout(() => {
                try {
                    w.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (e) { }
            }, 80);
        }

        return w;
    },

    setWindowMenuBar(instance, menus, position = null) {
        if (!instance || !instance.windowEl) return;
        const mbEl = instance.windowEl.querySelector(".window-menubar");
        if (!mbEl) return;

        if (!menus || (Array.isArray(menus) && menus.length === 0)) {
            mbEl.innerHTML = "";
            mbEl.style.display = "none";
            return;
        }

        const pos = position || mbEl.dataset.position || instance.config?.menubarPosition || instance.config?.menuBarPosition || "top";
        mbEl.innerHTML = "";
        mbEl.style.display = "flex";
        MenuBar({ element: mbEl, menus, position: pos, windowInstance: instance });
    },

    setWindowActionToolbar(instance, actions, position = null) {
        if (!instance || !instance.windowEl) return;
        const tbEl = instance.windowEl.querySelector(".window-action-toolbar");
        if (!tbEl) return;

        if (!actions || (Array.isArray(actions) && actions.length === 0)) {
            tbEl.innerHTML = "";
            tbEl.style.display = "none";
            return;
        }

        const pos = position || tbEl.dataset.position || instance.config?.actionToolbarPosition || instance.config?.toolbarPosition || instance.config?.actionsPosition || "top";
        tbEl.innerHTML = "";
        tbEl.style.display = "flex";
        ActionToolbar({ element: tbEl, actions, position: pos, windowInstance: instance });
    },

    focusWindow(w) {
        if (!w || !document.body.contains(w)) return;

        const currentId = w.dataset.id;
        if (this.activeWindowId && this.activeWindowId !== currentId) {
            const prevInstance = this.windows[this.activeWindowId];
            if (prevInstance && typeof prevInstance.onBlur === 'function') {
                try { prevInstance.onBlur(); } catch (e) { console.error("Erro no hook onBlur:", e); }
            }
        }

        this.activeWindowId = currentId;
        w.style.zIndex = ++this.zCounter;

        const task = document.querySelector(`[data-window="${currentId}"]`);
        document.querySelectorAll(".taskButton").forEach(x => x.classList.remove("active"));
        if (task) task.classList.add("active");

        const currentInstance = this.windows[currentId];
        if (currentInstance && typeof currentInstance.onFocus === 'function') {
            try { currentInstance.onFocus(); } catch (e) { console.error("Erro no hook onFocus:", e); }
        }
    },

    minimizeWindow(w) {
        if (!w || !document.body.contains(w)) return;
        w.classList.add("minimized");

        const inst = this.windows[w.dataset.id];
        if (inst) {
            // Se possuir janela filha modal, minimiza a filha junto
            if (inst._modalChildWindow && inst._modalChildWindow.windowEl) {
                inst._modalChildWindow.windowEl.classList.add("minimized");
            }
            if (typeof inst.onMinimize === 'function') {
                try { inst.onMinimize(); } catch (e) { console.error("Erro no hook onMinimize:", e); }
            }
        }
    },

    restoreWindow(w) {
        if (!w || !document.body.contains(w)) return;
        w.classList.remove("minimized");
        this.focusWindow(w);

        const inst = this.windows[w.dataset.id];
        if (inst) {
            // Se possuir janela filha modal, restaura e foca a filha
            if (inst._modalChildWindow && inst._modalChildWindow.windowEl) {
                inst._modalChildWindow.windowEl.classList.remove("minimized");
                this.focusWindow(inst._modalChildWindow.windowEl);
            }
            if (typeof inst.onRestore === 'function') {
                try { inst.onRestore(); } catch (e) { console.error("Erro no hook onRestore:", e); }
            }
        }

        if (this.isMobile()) {
            setTimeout(() => {
                try {
                    w.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (e) { }
            }, 60);
        }
    },

    maximizeWindow(w) {
        if (!w || !document.body.contains(w)) return;
        const willMaximize = !w.classList.contains("maximized");

        if (w.classList.contains("maximized")) {
            w.classList.remove("maximized");
            if (w.dataset.oldStyle) {
                const old = JSON.parse(w.dataset.oldStyle);
                w.style.left = old.left;
                w.style.top = old.top;
                w.style.width = old.width;
                w.style.height = old.height;
            }
        } else {
            w.dataset.oldStyle = JSON.stringify({
                left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height
            });
            w.classList.add("maximized");
        }
        this.focusWindow(w);

        if (this.isMobile()) {
            const windowsContainer = document.getElementById("windows");
            if (willMaximize && windowsContainer) {
                try {
                    windowsContainer.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (e) { }
            } else {
                setTimeout(() => {
                    try {
                        w.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } catch (e) { }
                }, 60);
            }
        }

        const inst = this.windows[w.dataset.id];
        if (inst && typeof inst.onMaximize === 'function') {
            try { inst.onMaximize(willMaximize); } catch (e) { console.error("Erro no hook onMaximize:", e); }
        }
    },

    async closeWindow(instance, w, task, resultData = undefined) {
        if (instance && typeof instance.beforeClose === 'function') {
            try {
                const canClose = await instance.beforeClose();
                if (canClose === false) return false; // Bloqueia o fechamento da janela
            } catch (err) {
                console.error("Erro no hook beforeClose:", err);
            }
        }

        // Se esta janela tiver uma janela modal filha aberta, fecha a filha primeiro
        if (instance && instance._modalChildWindow) {
            const child = instance._modalChildWindow;
            await this.closeWindow(child, child.windowEl, child.taskEl);
        }

        // Se esta janela for filha modal de outra, remove o bloqueio/overlay da janela mãe
        if (instance && instance._modalParentOverlay) {
            instance._modalParentOverlay.remove();
            instance._modalParentOverlay = null;
        }

        if (instance && instance.parentInstance) {
            const parent = instance.parentInstance;
            parent._modalChildWindow = null;
            if (parent.windowEl) {
                parent.windowEl.classList.remove("has-modal-child");
                this.focusWindow(parent.windowEl);
            }
        }

        // Se for um diálogo com Promise aguardando retorno, resolve com o resultado
        if (instance && typeof instance._dialogResolver === 'function') {
            instance._dialogResolver(resultData);
            instance._dialogResolver = null;
        }

        if (instance && typeof instance.onDestroy === 'function') {
            try { instance.onDestroy(); } catch (e) { console.error("Erro no hook onDestroy:", e); }
        }

        if (instance) {
            if (this.activeWindowId === instance.id) this.activeWindowId = null;
            delete this.windows[instance.id];
        }
        
        if (w) {
            const animClose = instance?.config?.closeAnimation || instance?.config?.animation || "";
            if (animClose && animClose !== 'none') {
                w.classList.add(`anim-close-${animClose}`);
                w.addEventListener('animationend', () => w.remove(), {once: true});
            } else {
                w.remove();
            }
        }
        
        if (task) task.remove();
        return true;
    },

    toggleWindow(w) {
        if (!w || !document.body.contains(w)) return;

        // --- Modo Mobile: scroll até a janela + efeito de destaque ---
        if (this.isMobile()) {
            if (w.classList.contains("minimized")) {
                this.restoreWindow(w);
            }
            this.focusWindow(w);

            // Scroll suave até a janela
            setTimeout(() => {
                try {
                    w.scrollIntoView({ behavior: "smooth", block: "start" });
                } catch (e) {}
            }, 30);

            // Efeito de highlight: ring + glow pulsante por 1.2s
            w.classList.remove("mobile-highlight");
            void w.offsetWidth; // force reflow para reiniciar a animação
            w.classList.add("mobile-highlight");
            setTimeout(() => w.classList.remove("mobile-highlight"), 1400);
            return;
        }

        // --- Modo Desktop: comportamento original ---
        if (w.classList.contains("minimized")) this.restoreWindow(w);
        else if (w.style.zIndex == this.zCounter || +w.style.zIndex >= this.zCounter - 1) this.minimizeWindow(w);
        else this.focusWindow(w);
    },


    showDesktop() {
        const visible = [...document.querySelectorAll(".window:not(.minimized)")];
        if (visible.length) {
            visible.forEach(w => this.minimizeWindow(w));
        } else {
            document.querySelectorAll(".window.minimized").forEach(w => this.restoreWindow(w));
        }
    },

    setupDrag(w, bar) {
        let drag = null;
        bar.addEventListener("dblclick", e => {
            if (this.isMobile()) return;
            if (e.target.closest(".winBtn")) return;
            this.maximizeWindow(w);
        });
        bar.addEventListener("pointerdown", e => {
            if (this.isMobile()) return;
            if (e.target.closest(".winBtn") || w.classList.contains("maximized")) return;
            this.focusWindow(w);
            drag = { x: e.clientX, y: e.clientY, left: w.offsetLeft, top: w.offsetTop };
            bar.setPointerCapture(e.pointerId);
        });
        bar.addEventListener("pointermove", e => {
            if (!drag || this.isMobile()) return;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            const containerEl = w.parentElement || this.windowsEl;
            const maxX = Math.max(0, containerEl.clientWidth - w.offsetWidth);
            const maxY = Math.max(0, containerEl.clientHeight - w.offsetHeight);
            const newLeft = Math.max(0, Math.min(maxX, drag.left + dx));
            const newTop = Math.max(0, Math.min(maxY, drag.top + dy));
            w.style.left = newLeft + "px";
            w.style.top = newTop + "px";

            const inst = this.windows[w.dataset.id];
            if (inst && typeof inst.onMove === 'function') {
                try { inst.onMove(newLeft, newTop); } catch (err) { }
            }
        });
        const stopDrag = () => drag = null;
        bar.addEventListener("pointerup", stopDrag);
        bar.addEventListener("pointercancel", stopDrag);
    },

    setupResize(w) {
        w.querySelectorAll(".resizeHandle").forEach(handle => {
            handle.addEventListener("pointerdown", e => {
                if (this.isMobile() || w.classList.contains("maximized")) return;
                e.preventDefault();
                e.stopPropagation();
                this.focusWindow(w);

                const dir = handle.dataset.dir;
                const start = {
                    x: e.clientX, y: e.clientY,
                    left: w.offsetLeft, top: w.offsetTop,
                    width: w.offsetWidth, height: w.offsetHeight
                };
                handle.setPointerCapture(e.pointerId);

                const move = ev => {
                    if (this.isMobile()) return;
                    let { x, y, left, top, width, height } = start;
                    const dx = ev.clientX - x, dy = ev.clientY - y;
                    const minW = 280, minH = 180;

                    const containerEl = w.parentElement || this.windowsEl;
                    if (dir.includes("e")) width = Math.max(minW, start.width + dx);
                    if (dir.includes("s")) height = Math.max(minH, start.height + dy);
                    if (dir.includes("w")) {
                        width = Math.max(minW, start.width - dx);
                        left = start.left + (start.width - width);
                    }
                    if (dir.includes("n")) {
                        height = Math.max(minH, start.height - dy);
                        top = start.top + (start.height - height);
                    }

                    if (left < 0) { width += left; left = 0; }
                    if (top < 0) { height += top; top = 0; }

                    if (left + width > containerEl.clientWidth) width = containerEl.clientWidth - left;
                    if (top + height > containerEl.clientHeight) height = containerEl.clientHeight - top;

                    w.style.left = left + "px";
                    w.style.top = top + "px";
                    w.style.width = Math.max(minW, width) + "px";
                    w.style.height = Math.max(minH, height) + "px";

                    const inst = this.windows[w.dataset.id];
                    if (inst && typeof inst.onResize === 'function') {
                        try { inst.onResize(parseInt(w.style.width), parseInt(w.style.height)); } catch (err) { }
                    }
                };

                const up = () => {
                    handle.removeEventListener("pointermove", move);
                    handle.removeEventListener("pointerup", up);
                    handle.removeEventListener("pointercancel", up);
                };

                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
                handle.addEventListener("pointercancel", up);
            });
        });
    },

    // --- Sistema de Look and Feel (L&F / Skins de Interface) ---
    lafStartButtons: {
        'default': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
            label: "Desktop",
            showLabel: true,
            tooltip: "Menu Principal DesktopEngine"
        },
        'aero-glass': {
            icon: `<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" fill="#f25022"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" fill="#7fba00"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" fill="#00a4ef"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" fill="#ffb900"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Menu Principal (Aero Glass)"
        },
        'fluent-acrylic': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="4" width="7" height="7" rx="1.2" fill="#0078d4"/><rect x="13" y="4" width="7" height="7" rx="1.2" fill="#0078d4"/><rect x="4" y="13" width="7" height="7" rx="1.2" fill="#0078d4"/><rect x="13" y="13" width="7" height="7" rx="1.2" fill="#0078d4"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Menu Iniciar (Fluent Acrylic)"
        },
        'luna-blue': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="8" height="8" rx="2" fill="#eb3c00"/><rect x="13" y="3" width="8" height="8" rx="2" fill="#58b947"/><rect x="3" y="13" width="8" height="8" rx="2" fill="#0080ff"/><rect x="13" y="13" width="8" height="8" rx="2" fill="#ffb800"/></svg>`,
            label: "iniciar",
            showLabel: true,
            tooltip: "Menu Iniciar (Luna Classic)"
        },
        'retro-3d': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="8" height="8" fill="#000080"/><rect x="13" y="3" width="8" height="8" fill="#800000"/><rect x="3" y="13" width="8" height="8" fill="#008000"/><rect x="13" y="13" width="8" height="8" fill="#808000"/></svg>`,
            label: "Iniciar",
            showLabel: true,
            tooltip: "Menu Iniciar (Retro 3D)"
        },
        'flat-tiles': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="8.5" height="8.5"/><rect x="12.5" y="3" width="8.5" height="8.5"/><rect x="3" y="12.5" width="8.5" height="8.5"/><rect x="12.5" y="12.5" width="8.5" height="8.5"/></svg>`,
            label: "Iniciar",
            showLabel: true,
            tooltip: "Menu Iniciar (Flat Tiles)"
        },
        'aqua-frosted': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 3a4 4 0 00-4 4 4 4 0 004 4h2V9H7a2 2 0 112-2v2h6V7a4 4 0 10-4 4h2v2h-2a4 4 0 104 4v-2h-2v-2h2a2 2 0 11-2 2v-2H9v2a4 4 0 004 4 4 4 0 004-4 4 4 0 00-4-4h-2v-2h2a4 4 0 004-4 4 4 0 00-4-4 4 4 0 00-4 4v2H9V7a4 4 0 00-4-4zm4 8h2v2h-2v-2z"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Menu Principal (Aqua Frosted)"
        },
        'platinum-classic': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 3a4 4 0 00-4 4 4 4 0 004 4h2V9H7a2 2 0 112-2v2h6V7a4 4 0 10-4 4h2v2h-2a4 4 0 104 4v-2h-2v-2h2a2 2 0 11-2 2v-2H9v2a4 4 0 004 4 4 4 0 004-4 4 4 0 00-4-4h-2v-2h2a4 4 0 004-4 4 4 0 00-4-4 4 4 0 00-4 4v2H9V7a4 4 0 00-4-4zm4 8h2v2h-2v-2z"/></svg>`,
            label: "Finder",
            showLabel: true,
            tooltip: "Menu Sistema (Platinum Classic)"
        },
        'brushed-metal': {
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16" height="16" fill="#184ca7" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin:0 2px;"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Menu Sistema (Brushed Metal)",
            dockPosition: "top",
            dockMode: "full"
        },
        'brushed-metal-2': {
            icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="16" height="16" fill="#184ca7" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin:0 2px;"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Menu (Metal 2)",
            dockPosition: "bottom",
            dockMode: "floating"
        },
        'win11': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Iniciar (Modern Glass)",
            dockPosition: "bottom",
            dockMode: "center"
        },
        'win11-2': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Iniciar (Modern Glass 2)",
            dockPosition: "bottom",
            dockMode: "floating"
        },
        'material-tonal': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="6" cy="6" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="12" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/></svg>`,
            label: "Apps",
            showLabel: false,
            tooltip: "Aplicativos (Material Tonal)"
        },
        'cupertino-touch': {
            icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Início (Cupertino Touch)"
        },
        'one-touch': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Início (One Touch)"
        },
        'spatial-glass': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Home View (Spatial Glass)"
        },
        'neumorphism': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z"/><circle cx="12" cy="12" r="4"/></svg>`,
            label: "Menu",
            showLabel: true,
            tooltip: "Menu Tátil (Soft UI)"
        },
        'tactical-hud': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="22" y2="12"/></svg>`,
            label: "[SYS]",
            showLabel: true,
            tooltip: "Interface Tática (HUD)"
        },
        'steel-metal': {
            icon: `☕`,
            label: "Swing",
            showLabel: true,
            tooltip: "Steel Metal Menu"
        },
        'ocean-metal': {
            icon: `☕`,
            label: "Swing",
            showLabel: true,
            tooltip: "Ocean Metal Menu"
        },
        'nimbus-vector': {
            icon: `☕`,
            label: "Swing",
            showLabel: true,
            tooltip: "Nimbus Vector Menu"
        },
        'flatlaf-light': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 17V7h10v3H10v2h5v3h-5v2z"/></svg>`,
            label: "Studio",
            tooltip: "FlatLaf Studio Light Menu"
        },
        'flatlaf-dark': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 17V7h10v3H10v2h5v3h-5v2z"/></svg>`,
            label: "Studio",
            tooltip: "FlatLaf Studio Dark Menu"
        },
        'modena-soft': {
            icon: `🌿`,
            label: "App",
            showLabel: true,
            tooltip: "Modena Soft Menu"
        },
        'caspian-dark': {
            icon: `🔷`,
            label: "App",
            showLabel: true,
            tooltip: "Caspian Dark Menu"
        },
        'yellow-tab': {
            icon: `<span style="font-weight:900;color:#0033cc;background:#f5d000;padding:1px 4px;border-radius:2px;font-size:11px;line-height:1;">OS</span>`,
            label: "Menu",
            showLabel: false,
            tooltip: "Yellow Tab Deskbar"
        },
        'workbench-boing': {
            icon: `<span style="font-size:14px;line-height:1;">🔴</span>`,
            label: "Desk",
            showLabel: true,
            tooltip: "Workbench Retro Menu"
        },
        'next-dark': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.2L5.2 8.3 12 12.1l6.8-3.8L12 4.2zm-7 5.7v7.2L11 20.6v-7.2L5 9.9zm14 0l-6 3.5v7.2l6-3.5V9.9z"/></svg>`,
            label: "Root",
            showLabel: true,
            tooltip: "Dark Slate Root Menu"
        },
        'warp-enterprise': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#0055aa"/><path d="M7 12a5 5 0 0110 0 5 5 0 01-10 0z" fill="#ffffff"/></svg>`,
            label: "Warp",
            showLabel: true,
            tooltip: "Warp Enterprise Desktop"
        },
        'aubergine-orange': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e95420"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#ffffff" stroke-width="2.5"/><circle cx="5.5" cy="12" r="1.5" fill="#ffffff"/><circle cx="15.2" cy="6.4" r="1.5" fill="#ffffff"/><circle cx="15.2" cy="17.6" r="1.5" fill="#ffffff"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Mostrar Aplicativos (Aubergine Orange)"
        },
        'adwaita-slate': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14.5 2a3 3 0 00-2.8 2 2.5 2.5 0 00-3.2 1.3 2 2 0 00-2.5 1.5 1.8 1.8 0 00-1.8 1.8c0 3.2 2.8 8.4 5.3 11.4 1 1.2 2.5 2 4 2 2.5 0 4.5-2.2 4.5-5.5 0-4.5-1.5-11.5-3.5-14.5z"/></svg>`,
            label: "Atividades",
            showLabel: true,
            tooltip: "Atividades (Adwaita Slate)"
        },
        'breeze-plasma': {
            icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="10" fill="#1d99f3"/><path d="M8 7v10h2.5V13l3.5 4H17l-4.5-5.2L16.8 7h-2.9L10.5 11V7H8z" fill="#fff"/></svg>`,
            label: "",
            showLabel: false,
            tooltip: "Lançador de Aplicativos (Breeze Plasma)"
        },
        'pantheon-pure': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 109 9c0-4.5-3.5-7-6-7s-4 2-4 4 2 3.5 4 3.5 3-1 3-2.5"/></svg>`,
            label: "Aplicativos",
            showLabel: true,
            tooltip: "Aplicativos (Pantheon Pure)"
        },
        'cosmic-teal': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="9" fill="#48b9c7"/><path d="M12 6l2.5 5.5H9.5L12 6zm0 12l-2-4h4l-2 4z" fill="#fff"/></svg>`,
            label: "Aplicativos",
            showLabel: true,
            tooltip: "Aplicativos (Cosmic Teal)"
        },
        'tiling-grid': {
            icon: `>_`,
            label: "[1:main]",
            showLabel: true,
            tooltip: "Espaço de Trabalho (Tiling Grid)"
        },
        'greybird-lite': {
            icon: `🐭`,
            label: "Aplicativos",
            showLabel: true,
            tooltip: "Menu de Aplicativos (Greybird Lite)"
        },
        'e-fusion': {
            icon: `🌌`,
            label: "E25",
            showLabel: true,
            tooltip: "Menu Fusion Neon"
        },
        'x11-box': {
            icon: `⬛`,
            label: "Clip",
            showLabel: true,
            tooltip: "X11 Dock Box"
        },
        'motif-panel': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="12,4 20,18 4,18"/></svg>`,
            label: "Painel",
            showLabel: true,
            tooltip: "Painel Frontal (Motif)"
        },
        'platinum-classic': {
            dockPosition: "bottom",
            dockMode: "full"
        },

        'turbo-tui': {
            icon: `≡`,
            label: "Menu",
            showLabel: true,
            tooltip: "Menu Principal TUI [Alt+F10]"
        },
        'cyberpunk-neon': {
            icon: `⚡`,
            label: "SYS.NET",
            showLabel: true,
            tooltip: "Interface Neural (Cyberdeck)"
        },
        'comic-doodle': {
            icon: `✏️`,
            label: "Doodle",
            showLabel: true,
            tooltip: "Menu Principal (Comic Doodle)"
        }
    },

    lafShowDesktopButtons: {
        'default': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
            label: "",
            tooltip: "Mostrar Área de Trabalho"
        },
        'aero-glass': {
            icon: ``,
            label: "",
            tooltip: "Espiar / Mostrar Área de Trabalho (Aero Peek)"
        },
        'fluent-acrylic': {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/></svg>`,
            label: "",
            tooltip: "Mostrar Área de Trabalho (Fluent)"
        },
        'luna-blue': {
            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 4h18v11H3V4zm2 2v7h14V6H5zm3 12h8v2H8v-2z"/></svg>`,
            label: "",
            tooltip: "Mostrar Área de Trabalho (Luna)"
        },
        'retro-3d': {
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2 3h20v12H2V3zm2 2v8h16V5H4zm4 12h8v2H8v-2z"/></svg>`,
            label: "",
            tooltip: "Mostrar Área de Trabalho (Retro 3D)"
        },
        'flat-tiles': {
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="3" y="3" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2"/><line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" stroke-width="2"/></svg>`,
            label: "",
            tooltip: "Mostrar Desktop (Tiles)"
        },
        'aqua-frosted': {
            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
            label: "",
            tooltip: "Exposé / Mostrar Mesa"
        },
        'platinum-classic': {
            icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="2" y="2" width="20" height="14" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="5" width="14" height="8"/><line x1="8" y1="19" x2="16" y2="19" stroke="currentColor" stroke-width="2"/></svg>`,
            label: "",
            tooltip: "Mesa (Desktop)"
        },
        'aubergine-orange': {
            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`,
            label: "",
            tooltip: "Alternar Áreas de Trabalho"
        },
        'adwaita-slate': {
            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="3"/></svg>`,
            label: "",
            tooltip: "Espaço de Trabalho"
        },
        'breeze-plasma': {
            icon: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M7 12h10"/></svg>`,
            label: "",
            tooltip: "Área de Trabalho Virtual"
        },
        'turbo-tui': {
            icon: `[■]`,
            label: "",
            tooltip: "Desktop [Alt+F3]"
        },
        'cyberpunk-neon': {
            icon: `<span style="font-size:10px;font-weight:900;letter-spacing:1px;">[GRID]</span>`,
            label: "",
            tooltip: "Minimizar / Matriz"
        },
        'comic-doodle': {
            icon: `📐`,
            label: "",
            tooltip: "Mostrar Área de Trabalho (Comic Doodle)"
        }
    },

    setLookAndFeel(lafName, persist = true) {
        const laf = lafName || 'default';
        this.currentLaF = laf;
        if (!laf || laf === 'default') {
            document.documentElement.removeAttribute('data-laf');
        } else {
            document.documentElement.setAttribute('data-laf', laf);
        }

        // Lazy loading dinâmico do tema sob demanda
        this.loadThemeStylesheet(laf);

        if (persist) {
            try { localStorage.setItem("desktop_engine_laf", laf); } catch (e) { }
        }

        // Atualiza os botões Iniciar e Mostrar Área de Trabalho
        this.updateStartButton(laf);

        EventBus.emit("laf:change", laf);
    },

    loadThemeStylesheet(laf) {
        const themeLinkId = 'desktop-theme-stylesheet';
        let themeLink = document.getElementById(themeLinkId);

        if (!laf || laf === 'default') {
            if (themeLink) themeLink.remove();
            return;
        }

        const themeHref = `css/themes/theme-${laf}.css`;
        if (!themeLink) {
            themeLink = document.createElement('link');
            themeLink.id = themeLinkId;
            themeLink.rel = 'stylesheet';
            themeLink.href = themeHref;
            document.head.appendChild(themeLink);
        } else if (themeLink.getAttribute('href') !== themeHref) {
            themeLink.href = themeHref;
        }
    },

    getLookAndFeel() {
        return this.currentLaF || document.documentElement.getAttribute('data-laf') || 'default';
    },

    /**
     * Exporta as configurações atuais do ambiente (Look and Feel, Menubar, Taskbar, Modo Mobile, etc.)
     * @param {boolean} asJson - Se true retorna string JSON formatada; se false retorna objeto puro.
     * @returns {Object|string}
     */
    exportConfig(asJson = false) {
        const config = {
            lookAndFeel: this.getLookAndFeel(),
            taskbarPosition: this.getTaskbarPosition(),
            menubarPosition: this.getMenuBarPosition(),
            menubarMode: this.getMenuBarMode(),
            responsiveMode: this.options?.responsiveMode || (this.isMobile() ? 'mobile' : 'desktop'),
            showDesktopButton: this.options?.showDesktopButton !== false
        };

        return asJson ? JSON.stringify(config, null, 2) : config;
    },

    /**
     * Importa e aplica configurações do ambiente a partir de um objeto ou string JSON.
     * @param {Object|string} config - Objeto com as propriedades ou string JSON gerada por exportConfig.
     * @param {boolean} persist - Se deve persistir no localStorage. Padrão: true.
     * @returns {Object} Configuração aplicada.
     */
    loadConfig(config, persist = true) {
        if (!config) return null;
        let cfg = config;
        if (typeof config === 'string') {
            try {
                cfg = JSON.parse(config);
            } catch (err) {
                console.error("Erro ao analisar JSON de configuração no loadConfig:", err);
                return null;
            }
        }

        if (cfg.lookAndFeel !== undefined) {
            this.setLookAndFeel(cfg.lookAndFeel, persist);
        }

        if (cfg.taskbarPosition !== undefined) {
            this.setTaskbarPosition(cfg.taskbarPosition, persist);
        }

        if (cfg.menubarMode !== undefined) {
            this.setMenuBarMode(cfg.menubarMode, persist);
        } else if (cfg.menubarPosition !== undefined) {
            this.setMenuBarPosition(cfg.menubarPosition, persist);
        }

        if (cfg.responsiveMode !== undefined) {
            this.setMobileMode(cfg.responsiveMode, persist);
        }

        if (cfg.showDesktopButton !== undefined) {
            this.options.showDesktopButton = !!cfg.showDesktopButton;
            const desktopBtn = document.getElementById(this.options.showDesktopButtonId || "showDesktop");
            if (desktopBtn) {
                desktopBtn.style.display = this.options.showDesktopButton ? "" : "none";
            }
        }

        EventBus.emit("desktop:configloaded", cfg);
        return cfg;
    },

    updateStartButton(lafName) {
        const laf = lafName || this.getLookAndFeel();
        const startConfig = this.getStartButtonConfig(laf);

        const targetIds = [this.options?.startButtonId, "startBtn", "taskStartBtn"].filter(Boolean);
        const candidates = new Set();

        targetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) candidates.add(el);
        });

        document.querySelectorAll('.taskStart:not(#showDesktop):not(.taskShowDesktop), [data-role="start-button"]').forEach(el => {
            candidates.add(el);
        });

        const effectiveMenus = this.getEffectiveStartMenus ? this.getEffectiveStartMenus() : [];
        const hasEffectiveMenus = effectiveMenus && effectiveMenus.length > 0;

        candidates.forEach(btn => {
            if (!btn) return;

            let innerHtml = '';
            if (startConfig.icon) {
                innerHtml += `<span class="task-start-icon">${startConfig.icon}</span>`;
            }
            if (startConfig.showLabel && startConfig.label) {
                innerHtml += `<span class="task-start-label">${startConfig.label}</span>`;
            }

            btn.innerHTML = innerHtml;
            if (startConfig.tooltip) {
                btn.title = startConfig.tooltip;
            }
            btn.setAttribute('data-laf-start', laf);

            // Se o botão não possui menus associados (nativos ou acoplados), oculta-o da taskbar
            if (!hasEffectiveMenus) {
                btn.style.display = "none";
            } else {
                btn.style.display = "";
            }
        });

        // Atualiza os botões Mostrar Área de Trabalho
        const showDeskCandidates = new Set();
        const showDeskId = this.options?.showDesktopButtonId || "showDesktop";
        const primaryShowDesk = document.getElementById(showDeskId);
        if (primaryShowDesk) showDeskCandidates.add(primaryShowDesk);
        document.querySelectorAll('.taskShowDesktop').forEach(el => showDeskCandidates.add(el));

        const showDeskConfig = this.getShowDesktopButtonConfig(laf);
        showDeskCandidates.forEach(btn => {
            if (!btn) return;
            if (!btn.classList.contains("taskShowDesktop")) {
                btn.classList.add("taskShowDesktop");
            }
            let innerHtml = '';
            if (showDeskConfig.icon) {
                innerHtml += `<span class="task-show-desktop-icon">${showDeskConfig.icon}</span>`;
            }
            if (showDeskConfig.label) {
                innerHtml += `<span class="task-show-desktop-label">${showDeskConfig.label}</span>`;
            }
            btn.innerHTML = innerHtml;
            btn.title = showDeskConfig.tooltip || "Mostrar Área de Trabalho";
            btn.setAttribute('data-laf-showdesktop', laf);
        });
    },

    setStartButtonConfig(lafName, config) {
        if (!this.lafStartButtons) this.lafStartButtons = {};
        this.lafStartButtons[lafName] = {
            ...(this.lafStartButtons[lafName] || {}),
            ...config
        };
        this.updateStartButton();
    },

    getStartButtonConfig(lafName) {
        const laf = lafName || this.getLookAndFeel();
        return this.lafStartButtons?.[laf] || this.lafStartButtons?.['default'] || {
            icon: "🖥️",
            label: "Desktop",
            showLabel: true,
            tooltip: "Menu Principal"
        };
    },

    setShowDesktopButtonConfig(lafName, config) {
        if (!this.lafShowDesktopButtons) this.lafShowDesktopButtons = {};
        this.lafShowDesktopButtons[lafName] = {
            ...(this.lafShowDesktopButtons[lafName] || {}),
            ...config
        };
        this.updateStartButton();
    },

    getShowDesktopButtonConfig(lafName) {
        const laf = lafName || this.getLookAndFeel();
        return this.lafShowDesktopButtons?.[laf] || this.lafShowDesktopButtons?.['default'] || {
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
            label: "",
            tooltip: "Mostrar Área de Trabalho"
        };
    },

    // --- Modo Mobile & Responsividade ---
    isMobile() {
        if (this._mobileExplicit !== undefined) {
            return this._mobileExplicit;
        }
        const app = document.getElementById("app");
        if (app && app.classList.contains("mobile-mode")) return true;
        const bp = this.options?.mobileBreakpoint || 768;
        return window.innerWidth <= bp;
    },

    checkResponsiveMode() {
        if (this.options.responsiveMode === "auto") {
            const bp = this.options.mobileBreakpoint || 768;
            const isMob = window.innerWidth <= bp;
            this.applyMobileClass(isMob);
        }
    },

    setTaskbarPosition(pos, persist = true) {
        if (!["top", "bottom", "left", "right"].includes(pos)) return;
        this.options.taskbarPosition = pos;
        const app = document.getElementById("app");
        if (app) app.dataset.taskbar = pos;
        this.updateStartButton();
        if (persist) {
            try { localStorage.setItem("desktop_engine_taskbar_pos", pos); } catch (e) { }
        }
        EventBus.emit("taskbar:positionchange", pos);
    },

    getTaskbarPosition() {
        const app = document.getElementById("app");
        return this.options?.taskbarPosition || app?.dataset.taskbar || "bottom";
    },

    // --- Registro e Sincronização Inteligente de Menus (MenuBar & StartMenu) ---
    _globalMenuBarMenus: [],
    _registeredStartMenus: [],
    _startMenuRegistered: false,
    _startMenuInstance: null,
    _autoCreatedStartButton: false,

    registerMenuBarMenus(menus = []) {
        this._globalMenuBarMenus = Array.isArray(menus) ? menus : [];
        this.syncTaskbarMenus();
    },

    registerStartMenu(config = {}) {
        this._startMenuRegistered = true;
        this._registeredStartMenus = Array.isArray(config.menus) ? config.menus : [];
        if (config.instance) {
            this._startMenuInstance = config.instance;
        }
        this.syncTaskbarMenus();
    },

    getEffectiveStartMenus() {
        const mode = this.getMenuBarMode(); // "startmenu" | "separate"
        const startMenus = this._registeredStartMenus || [];
        const menuBarMenus = this._globalMenuBarMenus || [];

        if (mode === "startmenu") {
            if (startMenus.length > 0 && menuBarMenus.length > 0) {
                // Mescla no primeiro nível sem duplicações diretas
                return [...startMenus, "separator", ...menuBarMenus];
            } else if (menuBarMenus.length > 0) {
                return [...menuBarMenus];
            } else {
                return [...startMenus];
            }
        } else {
            // No modo separate, exibe apenas os menus nativos do StartMenu
            return [...startMenus];
        }
    },

    syncTaskbarMenus() {
        const mode = this.getMenuBarMode();
        const effectiveMenus = this.getEffectiveStartMenus();
        const hasEffectiveMenus = effectiveMenus && effectiveMenus.length > 0;

        const targetIds = [this.options?.startButtonId, "startBtn", "taskStartBtn"].filter(Boolean);
        let startBtnEl = null;
        for (const id of targetIds) {
            const el = document.getElementById(id);
            if (el) {
                startBtnEl = el;
                break;
            }
        }

        // Se não existir botão e precisamos de um botão para alocar o menu iniciar gerado
        if (!startBtnEl && hasEffectiveMenus && mode === "startmenu") {
            const taskbar = document.getElementById(this.options?.taskbarContainerId || "taskWindows")?.parentElement ||
                            document.getElementById("taskbar");
            if (taskbar) {
                startBtnEl = document.createElement("button");
                startBtnEl.id = this.options?.startButtonId || "startBtn";
                startBtnEl.className = "taskStart";
                startBtnEl.dataset.role = "start-button";
                taskbar.insertBefore(startBtnEl, taskbar.firstChild);
                this._autoCreatedStartButton = true;
                this.updateStartButton();
            }
        }

        if (startBtnEl) {
            if (hasEffectiveMenus) {
                startBtnEl.style.display = "";
            } else {
                // Se não tem menus acoplados a ele, não deve aparecer na barra de tarefas
                startBtnEl.style.display = "none";
                if (this._autoCreatedStartButton && mode === "separate") {
                    startBtnEl.remove();
                    this._autoCreatedStartButton = false;
                }
            }
        }

        // Notifica o componente StartMenu e a UI global para re-renderizar
        EventBus.emit("startmenu:sync", {
            menus: effectiveMenus,
            hasMenus: hasEffectiveMenus,
            mode
        });
    },

    setMenuBarPosition(pos, persist = true) {
        if (!["top", "bottom", "left", "right", "none"].includes(pos)) return;
        this.options.menubarPosition = pos;
        const app = document.getElementById("app");
        if (app) app.dataset.menubar = pos;
        const globalMenuBar = document.getElementById("menubar") || document.querySelector("#app > .ui-menubar");
        if (globalMenuBar) {
            globalMenuBar.dataset.position = pos;
            if (pos === "none") {
                globalMenuBar.style.display = "none";
            } else {
                globalMenuBar.style.display = "";
            }
        }
        if (persist) {
            try {
                localStorage.setItem("desktop_engine_menubar_pos", pos);
                localStorage.setItem("desktop_engine_menubar_mode", pos === "none" ? "startmenu" : "separate");
            } catch (e) { }
        }
        this.syncTaskbarMenus();
        EventBus.emit("menubar:positionchange", pos);
    },

    getMenuBarPosition() {
        const app = document.getElementById("app");
        const globalMenuBar = document.getElementById("menubar") || document.querySelector("#app > .ui-menubar");
        return this.options?.menubarPosition || app?.dataset.menubar || globalMenuBar?.dataset.position || "top";
    },

    setMenuBarMode(mode, persist = true) {
        // mode: "separate" (exibe barra separada) | "startmenu" (exibe apenas no botão/menu iniciar)
        if (mode === "startmenu" || mode === "hidden" || mode === "none") {
            this.setMenuBarPosition("none", persist);
            if (persist) {
                try { localStorage.setItem("desktop_engine_menubar_mode", "startmenu"); } catch (e) { }
            }
        } else {
            let savedPos = "top";
            try { savedPos = localStorage.getItem("desktop_engine_menubar_pos") || "top"; } catch (e) { }
            const targetPos = savedPos === "none" ? "top" : savedPos;
            this.setMenuBarPosition(targetPos, persist);
            if (persist) {
                try { localStorage.setItem("desktop_engine_menubar_mode", "separate"); } catch (e) { }
            }
        }
        this.syncTaskbarMenus();
        EventBus.emit("menubar:modechange", mode);
    },

    getMenuBarMode() {
        const pos = this.getMenuBarPosition();
        return pos === "none" ? "startmenu" : "separate";
    },

    setMobileMode(mode, persist = true) {
        if (mode === "auto") {
            this.options.responsiveMode = "auto";
            delete this._mobileExplicit;
            this.checkResponsiveMode();
        } else {
            const isMob = mode === true || mode === "mobile";
            this.options.responsiveMode = isMob ? "mobile" : "desktop";
            this._mobileExplicit = isMob;
            this.applyMobileClass(isMob);
        }
        if (persist) {
            try {
                localStorage.setItem("desktop_engine_responsive", this.options.responsiveMode);
            } catch (e) { }
        }
        EventBus.emit("desktop:modechange", { isMobile: this.isMobile(), mode: this.options.responsiveMode });
    },

    toggleMobileMode() {
        const next = !this.isMobile();
        this.setMobileMode(next);
        this.notify(next ? "📱 Modo Mobile ativado (Janelas Empilhadas)" : "🖥️ Modo Desktop ativado (Janelas Flutuantes)", "info");
        return next;
    },

    applyMobileClass(isMob) {
        this.isMobileActive = isMob;
        const app = document.getElementById("app");
        if (app) {
            app.classList.toggle("mobile-mode", isMob);
        }
        document.documentElement.classList.toggle("mobile-mode", isMob);

        const currentMenuBarPos = this.getMenuBarPosition();
        const globalMenuBar = document.getElementById("menubar") || document.querySelector("#app > .ui-menubar");
        if (globalMenuBar && currentMenuBarPos === "none") {
            globalMenuBar.style.display = "none";
        }
    },

    getAvailableLookAndFeels() {
        return [
            // Modernos & Mobile Design Systems
            { id: "win11",           label: "Modern Glass (Centro)",             category: "Sistemas Modernos",  icon: "🪟",  desc: "Dock centralizado estilo Modern Glass" },
            { id: "win11-2",         label: "Modern Glass 2 (Glass)",            category: "Sistemas Modernos",  icon: "🪟",  desc: "Versão sofisticada e translúcida do Modern Glass" },
            { id: "default",         label: "Padrão / Moderno",               category: "Modernos & Mobile",  icon: "✨",  desc: "Design padrão limpo e elegante do DesktopEngine" },
            { id: "aqua-frosted",    label: "Aqua Frosted (Vidro Fosco)",     category: "Modernos & Mobile",  icon: "🍎",  desc: "Traffic lights à esquerda, título centralizado e cantos de 12px" },
            { id: "fluent-acrylic",  label: "Fluent Acrylic (Acrílico)",      category: "Modernos & Mobile",  icon: "🪟",  desc: "Cantos de 8px, controles refinados e botão fechar com hover vermelho" },
            { id: "material-tonal",  label: "Material Tonal (Dynamic)",       category: "Modernos & Mobile",  icon: "🤖",  desc: "Superfícies em camadas tonais, cantos de 20px e botões pílula" },
            { id: "cupertino-touch", label: "Cupertino Touch (Fluid)",         category: "Modernos & Mobile",  icon: "🍏",  desc: "Vidro fosco ultra-translúcido, squircle de 20px e sombras suaves" },
            { id: "one-touch",       label: "One Touch (Curvas)",              category: "Modernos & Mobile",  icon: "🌌",  desc: "Cantos ultra arredondados de 24px, cabeçalhos amplos e foco ergonômico" },
            { id: "flat-tiles",      label: "Flat Tiles (Modern UI)",          category: "Modernos & Mobile",  icon: "🔲",  desc: "Design 100% plano, cantos retos (0px), tipografia marcante" },

            // Computação Espacial & Tátil
            { id: "spatial-glass",   label: "Spatial Glass (Imersivo)",        category: "Espacial & Tátil",   icon: "🥽",  desc: "Vidro espacial hiper-translúcido, bordas com reflexo de luz" },
            { id: "neumorphism",     label: "Neumorphism (Soft UI)",           category: "Espacial & Tátil",   icon: "🫧",  desc: "Superfícies esculpidas em relevo suave com luz e sombra opostas" },
            { id: "tactical-hud",   label: "Tactical HUD (Cyberdeck)",        category: "Espacial & Tátil",   icon: "⚡",  desc: "Interface tática em âmbar/neon, cantos em 45º e linhas de mira" },

            // Ecossistema Java & Swing
            { id: "steel-metal",     label: "Steel Metal (Classic Swing)",     category: "Java PlaF",          icon: "☕",  desc: "Clássico Swing com tons de aço e texturas de relevo" },
            { id: "ocean-metal",     label: "Ocean Metal (Steel Blue)",        category: "Java PlaF",          icon: "🌊",  desc: "Gradiente azul acetinado e contornos chanfrados" },
            { id: "nimbus-vector",   label: "Nimbus Vector (Vibrant)",         category: "Java PlaF",          icon: "✨",  desc: "Superfícies acetinadas, cantos 4px e foco dourado/laranja" },
            { id: "flatlaf-light",   label: "FlatLaf Light (Studio)",          category: "Java PlaF",          icon: "💡",  desc: "Estilo IDE moderno, compacto, minimalista e profissional (Claro)" },
            { id: "flatlaf-dark",    label: "FlatLaf Dark (Studio)",           category: "Java PlaF",          icon: "🌙",  desc: "Estilo IDE moderno, compacto, minimalista e profissional (Escuro)" },
            { id: "modena-soft",     label: "Modena Soft (Enterprise)",        category: "Java PlaF",          icon: "🌿",  desc: "Estética neutra cinza, limpa e moderna" },
            { id: "caspian-dark",    label: "Caspian Slate (Dark Blue)",       category: "Java PlaF",          icon: "🔷",  desc: "Vidro escuro azulado elegante" },

            // Retrô & Clássicos
            { id: "yellow-tab",      label: "Yellow Tab (Media Style)",        category: "Retrô & Clássicos",  icon: "🟡",  desc: "A famosa aba amarela no topo esquerdo da janela" },
            { id: "retro-3d",        label: "Retro 3D (Chanfrado)",            category: "Retrô & Clássicos",  icon: "🕹️", desc: "Bordas 3D chanfradas outset/inset e botões clássicos cinza" },
            { id: "luna-blue",       label: "Luna Blue (Azul & Verde)",        category: "Retrô & Clássicos",  icon: "🔵",  desc: "Barra azul brilhante e botão fechar vermelho luminoso" },
            { id: "aero-glass",      label: "Aero Glass (Translúcido)",        category: "Retrô & Clássicos",  icon: "🪟",  desc: "Vidro translúcido, reflexos luminosos e botões com brilho" },
            { id: "next-dark",       label: "Next Dark (Step Style)",          category: "Retrô & Clássicos",  icon: "⬛",  desc: "Tons de cinza puro e preto com relevos chanfrados profundos" },
            { id: "workbench-boing", label: "Workbench Boing (Retro Cores)",   category: "Retrô & Clássicos",  icon: "💾",  desc: "Azul royal, listras pinstripe e acentos âmbar retrô" },
            { id: "platinum-classic",label: "Platinum Classic (Monocromático)",category: "Retrô & Clássicos",  icon: "🍏",  desc: "Pinstripes horizontais, botão fechar quadrado à esquerda" },
            { id: "brushed-metal",label: "Brushed Metal (Classic)",category: "Retrô & Clássicos",  icon: "💿",  desc: "Estilo Metal escovado clássico e iTunes" },
            { id: "brushed-metal-2",label: "Brushed Metal 2 (Sophisticated)",category: "Retrô & Clássicos",  icon: "💿",  desc: "Versão moderna e refinada do Metal escovado" },
            { id: "warp-enterprise", label: "Warp Enterprise (Cobalt)",        category: "Retrô & Clássicos",  icon: "🟦",  desc: "Estética corporativa azul-acinzentada com chanfros sólidos" },

            // Desktops Abertos & Compositors
            { id: "aubergine-orange",label: "Aubergine Orange (Humanist)",     category: "Unix Abertos",       icon: "🟠",  desc: "Barra grafite com acentos em laranja e botões circulares" },
            { id: "pantheon-pure",   label: "Pantheon Pure (Light Minimal)",   category: "Unix Abertos",       icon: "🕊️", desc: "Fechar à esquerda, maximizar à direita, título centralizado" },
            { id: "cosmic-teal",     label: "Cosmic Teal (Modern Desktop)",    category: "Unix Abertos",       icon: "🚀",  desc: "Tema escuro moderno com acentos em Teal/Ciano e Laranja Solar" },
            { id: "tiling-grid",     label: "Tiling Grid (Minimal Tiling)",    category: "Unix Abertos",       icon: "🪟",  desc: "Borda ativa fina de 1px, barra monoespacada e cantos 0px" },
            { id: "greybird-lite",   label: "Greybird Lite (Lightweight)",     category: "Unix Abertos",       icon: "🐭",  desc: "Gradiente suave azul-acinzentado, botões leves e cantos de 4px" },
            { id: "e-fusion",        label: "E-Fusion (Glow Style)",           category: "Unix Abertos",       icon: "🌌",  desc: "Visual futurista em titânio escuro, relevos luminosos" },
            { id: "x11-box",         label: "X11 Dark Box (NeXT-Style)",       category: "Unix Abertos",       icon: "⬛",  desc: "Gradiente diagonal clássico chanfrado preto/cinza" },
            { id: "motif-panel",     label: "Motif Panel (UNIX CDE)",          category: "Unix Abertos",       icon: "🟣",  desc: "Workstation UNIX dos anos 90 com relevos sólidos" },
            { id: "adwaita-slate",   label: "Adwaita Slate (Clean Flat)",      category: "Unix Abertos",       icon: "🐧",  desc: "Headerbar alta de 42px e botão fechar circular minimalista" },
            { id: "breeze-plasma",   label: "Breeze Plasma (Glass Glow)",      category: "Unix Abertos",       icon: "⚙️", desc: "Linhas nítidas, acentos vetoriais e cantos de 4px" },

            // TUI & Sci-Fi
            { id: "turbo-tui",       label: "Turbo TUI (DOS Console)",         category: "TUI & Sci-Fi",       icon: "📟",  desc: "Visual de modo texto azul DOS com bordas em caracteres duplos" },
            { id: "cyberpunk-neon",  label: "Cyberpunk Neon (Matrix HUD)",     category: "TUI & Sci-Fi",       icon: "⚡",  desc: "Bordas chanfradas 45º, linhas de grade e acentos neon" },

            // Ilustração & Doodles
            { id: "comic-doodle",    label: "Comic Doodle (Pastel Sketch)",    category: "Ilustração & Cartoon",icon: "✏️",  desc: "Design doodle com traços pretos marcantes, tons pastéis suaves e botões tipo pílula" }
        ];
    },

    // --- Sistema de Roteamento e Registro de Telas (Screen Registry) ---
    registerScreen(id, loaderOrConfig) {
        this.screens[id] = loaderOrConfig;
    },

    registerScreens(screensMap = {}) {
        Object.assign(this.screens, screensMap);
    },

    async openScreen(idOrConfig, initialProps = {}) {
        let config = null;
        let screenId = null;

        if (typeof idOrConfig === 'string') {
            screenId = idOrConfig;
            const registered = this.screens[screenId];
            if (!registered) {
                this.notify(`Tela "${screenId}" não foi registrada no Desktop.`, "danger");
                console.error(`Desktop.openScreen: Tela "${screenId}" não encontrada no registro.`);
                return null;
            }

            if (typeof registered === 'function') {
                try {
                    const res = await registered(initialProps);
                    config = res.default || res;
                } catch (err) {
                    this.notify(`Erro ao carregar módulo da tela "${screenId}".`, "danger");
                    console.error(`Erro no carregamento dinâmico da tela "${screenId}":`, err);
                    return null;
                }
            } else {
                config = registered;
            }
        } else if (typeof idOrConfig === 'object') {
            config = idOrConfig;
            screenId = config.id || `win_${Date.now()}`;
        }

        if (!config) return null;

        // Se singleInstance = true e a janela já existe aberta:
        if (config.singleInstance && this.windows[screenId]) {
            const existingInstance = this.windows[screenId];
            if (existingInstance.windowEl && document.body.contains(existingInstance.windowEl)) {
                this.focusWindow(existingInstance.windowEl);
                if (existingInstance.windowEl.classList.contains("minimized")) {
                    this.restoreWindow(existingInstance.windowEl);
                }
                if (initialProps && Object.keys(initialProps).length > 0) {
                    Object.assign(existingInstance.state, initialProps);
                    if (existingInstance.update) existingInstance.update();
                }
                return existingInstance;
            } else {
                delete this.windows[screenId];
            }
        }

        // Clona a configuração e mescla initialProps no state
        const instanceConfig = {
            ...config,
            state: { ...(config.state || {}), ...(initialProps || {}) }
        };

        const instanceId = config.singleInstance ? screenId : `${screenId}_${this.nextId}`;
        const windowInstance = Framework.createWindow(instanceConfig, instanceId, this);
        this.open(windowInstance);
        return windowInstance;
    },

    async openDialog(idOrConfig, parentInstance, initialProps = {}) {
        return new Promise(async (resolve) => {
            try {
                let config = null;
                let screenId = "dialog";

                if (typeof idOrConfig === 'string') {
                    screenId = idOrConfig;
                    const registered = this.screens[screenId];
                    if (!registered) {
                        this.notify(`Diálogo "${screenId}" não foi registrado no Desktop.`, "danger");
                        return resolve(null);
                    }

                    if (typeof registered === 'function') {
                        const res = await registered(initialProps);
                        config = res.default || res;
                    } else {
                        config = registered;
                    }
                } else if (typeof idOrConfig === 'object') {
                    config = idOrConfig;
                    screenId = config.id || `dialog_${Date.now()}`;
                }

                if (!config) return resolve(null);

                const instanceConfig = {
                    ...config,
                    singleInstance: false, // Diálogos são instâncias específicas
                    state: { ...(config.state || {}), ...(initialProps || {}) }
                };

                const instanceId = `${screenId}_dlg_${++this.nextId}`;
                const childInstance = Framework.createWindow(instanceConfig, instanceId, this);

                // Vincula o resolver da Promise ao fechamento
                childInstance._dialogResolver = resolve;
                childInstance.parentInstance = parentInstance;
                childInstance.isDialog = true;

                // Abre a janela filha
                const childWinEl = this.createWindow(childInstance);
                if (childWinEl) {
                    childWinEl.classList.add("is-child-dialog");

                    // Se foi informado parentInstance, centraliza sobre o pai e anexa overlay de bloqueio
                    if (parentInstance && parentInstance.windowEl && document.body.contains(parentInstance.windowEl)) {
                        const pEl = parentInstance.windowEl;

                        const isContained = (config.contained || config.insideParent || config.containedInParent);

                        if (!isContained) {
                            // Posiciona centralizado sobre a janela pai no Desktop
                            const childW = config.width || 440;
                            const childH = config.height || 320;
                            const left = Math.max(10, pEl.offsetLeft + (pEl.offsetWidth - childW) / 2);
                            const top = Math.max(10, pEl.offsetTop + (pEl.offsetHeight - childH) / 2);
                            childWinEl.style.left = left + "px";
                            childWinEl.style.top = top + "px";
                        }

                        // Cria overlay de bloqueio na janela pai
                        const overlay = document.createElement("div");
                        overlay.className = "window-modal-overlay";
                        overlay.title = "Janela bloqueada pelo diálogo aberto.";
                        overlay.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.focusWindow(childWinEl);
                            this.blinkWindow(childWinEl);
                        });

                        if (isContained && childWinEl.parentElement === pEl) {
                            pEl.insertBefore(overlay, childWinEl);
                            childWinEl.style.zIndex = "250";
                        } else {
                            pEl.appendChild(overlay);
                        }

                        pEl.classList.add("has-modal-child");
                        childWinEl.classList.add("is-child-dialog");
                        parentInstance._modalChildWindow = childInstance;
                        childInstance._modalParentOverlay = overlay;
                    }

                    this.focusWindow(childWinEl);
                }
            } catch (err) {
                console.error("Erro ao abrir janela modal filha (openDialog):", err);
                resolve(null);
            }
        });
    },

    // --- Getters e Acessores de Estrutura do Desktop ---
    getRoot() {
        return document.getElementById("app") || document.body;
    },

    getSurface() {
        return document.getElementById(this.options?.desktopContainerId || "desktop") || this.windowsEl || document.body;
    },

    getTaskbar() {
        return document.getElementById("taskbar") || this.tasksEl?.closest('.taskbar') || document.querySelector('.taskbar');
    },

    getClock() {
        const id = this.options?.clockContainerId || "clock";
        return document.getElementById(id);
    },

    // --- Métodos Programáticos do Ambiente Desktop ---
    setContextMenu(items, containerId = "desktop") {
        const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!target) return null;
        if (this._contextMenuController && typeof this._contextMenuController.destroy === 'function') {
            this._contextMenuController.destroy();
            this._contextMenuController = null;
        }
        if (items) {
            this._contextMenuController = bindContextMenu(target, items);
        }
        return this._contextMenuController;
    },

    setMenuBar(menus, position) {
        if (!menus) return null;
        const pos = position || this.options?.menubarPosition || "top";
        return MenuBar({ containerId: "menubar", menus, position: pos });
    },

    setStartMenu(menus, buttonId = "startBtn") {
        if (!menus) return null;
        return StartMenu({ buttonId: this.options?.startButtonId || buttonId, menus });
    },

    setClock(options = true) {
        this.stopClock();
        if (options === false) {
            const clockEl = this.getClock();
            if (clockEl) clockEl.style.display = "none";
            return;
        }

        const clockConfig = typeof options === 'object' ? options : {};
        const containerId = clockConfig.containerId || this.options?.clockContainerId || "clock";
        const format = clockConfig.format || "pt-BR";
        const showSeconds = clockConfig.showSeconds !== false;
        const interval = clockConfig.interval || 1000;

        const updateClock = () => {
            const clockEl = document.getElementById(containerId);
            if (!clockEl) return;
            clockEl.style.display = "";
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString(format, {
                hour: '2-digit',
                minute: '2-digit',
                second: showSeconds ? '2-digit' : undefined
            });
            if (clockConfig.tooltip !== false) {
                clockEl.title = now.toLocaleDateString(format, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        };

        updateClock();
        this._clockTimer = setInterval(updateClock, interval);
    },

    startClock(options) {
        this.setClock(options || true);
    },

    stopClock() {
        if (this._clockTimer) {
            clearInterval(this._clockTimer);
            this._clockTimer = null;
        }
    },

    openModal(options = {}) {
        return Modal({ ...options, global: true });
    },

    // --- Helpers Programáticos de Widgets Globais ---
    createDockWidget(options = {}) {
        return DockWidget(options);
    },

    createFloatButton(options = {}) {
        return FloatButton(options);
    },

    // --- Exportação e Importação de Configuração (System & Windows) ---
    exportConfig({ format = "object" } = {}) {
        // 1. Extrai configurações globais do sistema
        const system = {
            lookAndFeel: this.getLookAndFeel ? this.getLookAndFeel() : this.currentLaF,
            taskbarPosition: this.getTaskbarPosition ? this.getTaskbarPosition() : (this.options?.taskbarPosition || "bottom"),
            globalMenuBarPosition: this.getMenuBarPosition ? this.getMenuBarPosition() : (this.options?.menubarPosition || "top"),
            globalMenuBarMode: this.getMenuBarMode ? this.getMenuBarMode() : "separate",
            responsiveMode: this.options?.responsiveMode || "auto"
        };

        // 2. Extrai configurações e estados de cada janela ativa
        const windows = {};
        if (this.windows && typeof this.windows === 'object') {
            for (const [id, inst] of Object.entries(this.windows)) {
                if (!inst) continue;
                const winEl = inst.windowEl;
                const winData = {
                    id: inst.id || id,
                    screenId: inst.screenId || inst.config?.screenId || null,
                    title: inst.config?.title || (winEl ? winEl.querySelector(".titleText")?.textContent : null),
                    menubarPosition: inst.getMenuBar?.()?.dataset?.position || inst.config?.menubarPosition || "top",
                    actionToolbarPosition: inst.getActionToolbar?.()?.dataset?.position || inst.config?.actionToolbarPosition || "top",
                    isMaximized: inst.isMaximized ? inst.isMaximized() : false,
                    isMinimized: inst.isMinimized ? inst.isMinimized() : false,
                    isFocused: inst.isFocused ? inst.isFocused() : false,
                    state: inst.state ? JSON.parse(JSON.stringify(inst.state)) : {}
                };

                if (winEl) {
                    winData.bounds = {
                        left: winEl.style.left || null,
                        top: winEl.style.top || null,
                        width: winEl.style.width || null,
                        height: winEl.style.height || null
                    };
                }

                windows[id] = winData;
            }
        }

        const configData = {
            version: "1.5",
            exportedAt: new Date().toISOString(),
            system,
            windows
        };

        return format === "json" || format === "string" ? JSON.stringify(configData, null, 2) : configData;
    },

    importConfig(configData, { applyImmediately = true, persist = true } = {}) {
        try {
            const data = typeof configData === 'string' ? JSON.parse(configData) : configData;
            if (!data || typeof data !== 'object') {
                throw new Error("Formato de configuração JSON inválido.");
            }

            // 1. Aplica e restaura as configurações do Sistema (system)
            if (data.system && typeof data.system === 'object') {
                const sys = data.system;
                if (sys.lookAndFeel) this.setLookAndFeel(sys.lookAndFeel, persist);
                if (sys.taskbarPosition) this.setTaskbarPosition(sys.taskbarPosition, persist);
                if (sys.globalMenuBarPosition) this.setMenuBarPosition(sys.globalMenuBarPosition, persist);
                if (sys.globalMenuBarMode) this.setMenuBarMode(sys.globalMenuBarMode, persist);
                if (sys.responsiveMode) this.setMobileMode(sys.responsiveMode, persist);
            }

            // 2. Aplica e restaura as configurações das Janelas (windows)
            if (applyImmediately && data.windows && typeof data.windows === 'object') {
                for (const [id, winConfig] of Object.entries(data.windows)) {
                    // Tenta encontrar uma janela aberta pelo id ou pelo screenId
                    let inst = this.windows[id] || Object.values(this.windows).find(w => w.screenId === winConfig.screenId);
                    
                    if (inst) {
                        const winEl = inst.windowEl;

                        // Restaura posições dos menus e toolbars
                        if (winConfig.menubarPosition && typeof inst.setMenuBar === 'function') {
                            inst.setMenuBar(inst.config?.menubar, winConfig.menubarPosition);
                        }
                        if (winConfig.actionToolbarPosition && typeof inst.setActionToolbar === 'function') {
                            inst.setActionToolbar(inst.config?.actionToolbar, winConfig.actionToolbarPosition);
                        }

                        // Restaura estado reativo
                        if (winConfig.state && inst.state && typeof inst.state === 'object') {
                            Object.assign(inst.state, winConfig.state);
                        }

                        // Restaura coordenadas e dimensões
                        if (winEl && winConfig.bounds) {
                            if (winConfig.bounds.left) winEl.style.left = winConfig.bounds.left;
                            if (winConfig.bounds.top) winEl.style.top = winConfig.bounds.top;
                            if (winConfig.bounds.width) winEl.style.width = winConfig.bounds.width;
                            if (winConfig.bounds.height) winEl.style.height = winConfig.bounds.height;
                        }

                        // Restaura estado de maximização / minimização
                        if (winConfig.isMaximized) {
                            inst.maximize();
                        } else if (inst.isMaximized?.()) {
                            inst.restore();
                        }

                        if (winConfig.isMinimized) {
                            inst.minimize();
                        }
                    }
                }
            }

            EventBus.emit("desktop:configimported", data);
            return { success: true, data };
        } catch (err) {
            console.error("Erro ao importar configuração do desktop:", err);
            return { success: false, error: err.message };
        }
    },

    downloadConfigFile(filename = "desktop-config.json") {
        const jsonStr = this.exportConfig({ format: "json" });
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    },

    loadConfigFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.style.display = "none";
            input.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return resolve(null);
                try {
                    const text = await file.text();
                    const result = this.importConfig(text);
                    resolve(result);
                } catch (err) {
                    reject(err);
                } finally {
                    input.remove();
                }
            };
            document.body.appendChild(input);
            input.click();
        });
    }
};

if (typeof window !== 'undefined') {
    window.Desktop = Desktop;
}
