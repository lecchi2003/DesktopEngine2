// element-permission-plugin.js
// Plugin nativo do framework para permissões de elementos de UI.
// A aplicação configura a fonte de permissões e o modo edição, e o framework
// aplica hide/disable nos elementos sem permissão e filtra itens de menu.

export const ElementPermissionPlugin = {
    /**
     * Instala o plugin no framework.
     * @param {Object} FW - Framework
     * @param {Object} options - Opções de configuração
     * @param {Function} options.loadPermissoes - Função que carrega permissões (async)
     * @param {Function} options.isEditMode - Função que verifica se está em modo edição
     * @param {boolean} options.fallbackAllowed - Se permite acesso quando não há permissão (default: true)
     */
    install(FW, options = {}) {
        const config = {
            loadPermissoes: options.loadPermissoes || (async () => []),
            isEditMode: options.isEditMode || (() => false),
            fallbackAllowed: options.fallbackAllowed ?? true,
            ...options
        };

        let _permissoes = new Map();
        let _loaded = false;

        /**
         * Carrega permissões da fonte configurada.
         * @param {boolean} force - Força recarregamento
         * @returns {Promise<void>}
         */
        async function load(force = false) {
            if (_loaded && !force) return;
            const rows = await config.loadPermissoes();
            _permissoes.clear();
            for (const r of rows) {
                if (r && r.screenId && r.key) {
                    _permissoes.set(`${r.screenId}:${r.key}`, r);
                }
            }
            _loaded = true;
        }

        /**
         * Limpa as permissões carregadas (ex.: ao encerrar a sessão).
         * Marca como não carregado para forçar recarga na próxima sessão.
         * @returns {void}
         */
        function clear() {
            _permissoes.clear();
            _loaded = false;
        }

        /**
         * Verifica se um elemento é permitido.
         * @param {string} screenId - ID da tela
         * @param {string} key - Chave do elemento
         * @returns {boolean}
         */
        function isAllowed(screenId, key) {
            if (config.isEditMode()) return true;
            const r = _permissoes.get(`${screenId}:${key}`);
            return r ? r.allowed !== false : config.fallbackAllowed;
        }

        /**
         * Aplica hide/disable nos elementos sem permissão.
         * @param {string} screenId - ID da tela
         * @param {Element} rootEl - Elemento raiz
         */
        function applyToContent(screenId, rootEl) {
            if (!screenId || !rootEl || !(rootEl instanceof Element)) return;

            // Limpa marcas/restrições anteriores para re-aplicação idempotente
            _revealAll(rootEl);

            if (config.isEditMode()) {
                _markCataloged(screenId, rootEl);
                return;
            }

            const denied = _getDenied(screenId);
            if (denied.length === 0) return;

            for (const r of denied) {
                const targets = new Set();

                // 1. Chave direta (telas que marcam data-eid estaticamente)
                if (r.key) {
                    if (rootEl.matches?.(`[data-eid="${r.key}"]`)) targets.add(rootEl);
                    rootEl.querySelectorAll?.(`[data-eid="${CSS.escape(r.key)}"]`).forEach((el) => targets.add(el));
                }

                // 2. Seletor CSS de fallback salvo pelo inspetor
                if (r.selector && ['field', 'button', 'other'].includes(r.kind)) {
                    try {
                        if (rootEl.matches?.(r.selector)) targets.add(rootEl);
                        rootEl.querySelectorAll?.(r.selector).forEach((el) => targets.add(el));
                    } catch { /* seletor inválido: ignora */ }
                }

                for (const el of targets) {
                    _deny(el, r);
                }
            }
        }

        /**
         * Verifica se um item de menu é permitido.
         * @param {string} screenId - ID da tela
         * @param {string} kind - Tipo do item ('menu' | 'toolbar' | 'context')
         * @param {string} labelPath - Caminho de rótulos ("Pai/Filho")
         * @returns {boolean}
         */
        function isMenuItemAllowed(screenId, kind, labelPath) {
            if (config.isEditMode()) return true;
            const sid = screenId || 'global';
            const path = (labelPath || '').trim();
            if (!path) return true;

            for (const r of _permissoes.values()) {
                if (r.screenId !== sid || r.kind !== kind) continue;
                if (r.allowed === false && (r.selector || '').trim() === path) {
                    return false;
                }
            }
            return true;
        }

        /**
         * Retorna as linhas do catálogo de uma tela (ou de todas, sem screenId).
         * Usado pelo inspetor para checar duplicidade/edição antes de salvar.
         * @param {string} [screenId] - ID da tela
         * @returns {Array} Linhas do catálogo ({ id, screenId, key, label, kind, effect, selector, allowed })
         */
        function rowsForScreen(screenId) {
            const all = Array.from(_permissoes.values());
            return screenId ? all.filter((r) => r.screenId === screenId) : all;
        }

        /**
         * Recarrega o catálogo da fonte e **reaplica** as restrições nas
         * janelas abertas — é o ponto de sincronização a chamar após uma
         * mutação no catálogo/permissões feita pela aplicação.
         * @param {boolean} [_force] - Ignorado (mantido por compatibilidade)
         * @returns {Promise<void>}
         */
        async function refresh(_force = true) {
            await load(_force);
            reapplyOpenWindows();
        }

        /**
         * Reaplica hide/disable e as marcas do modo edição em todas as
         * janelas abertas. O framework carimba `data-screen-id` em cada
         * janela (createWindow), então o plugin identifica a tela de cada
         * container sem depender da aplicação.
         * @returns {void}
         */
        function reapplyOpenWindows() {
            if (typeof document === 'undefined') return;
            document.querySelectorAll('.window[data-screen-id]').forEach((w) => {
                const body = w.querySelector('.windowBody');
                if (body) applyToContent(w.dataset.screenId, body);
            });
        }

        /**
         * Retorna permissões negadas para uma tela.
         * @param {string} screenId - ID da tela
         * @returns {Array} Permissões negadas
         */
        function _getDenied(screenId) {
            const denied = [];
            for (const r of _permissoes.values()) {
                if (r.screenId === screenId && r.allowed === false) {
                    denied.push(r);
                }
            }
            return denied;
        }

        /**
         * Aplica hide ou disable em um elemento.
         * @param {Element} el - Elemento
         * @param {Object} row - Permissão
         */
        function _deny(el, row) {
            if (row.effect === 'disable') {
                el.setAttribute('disabled', 'true');
                el.setAttribute('aria-disabled', 'true');
                el.classList.add('is-disabled');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
                if (!el.getAttribute('title')) el.setAttribute('title', 'Acesso restrito');
                el.dataset.elemDenied = row.key;
            } else {
                el.style.display = 'none';
                el.dataset.elemHidden = row.key;
            }
        }

        /**
         * Marca elementos catalogados no modo edição.
         * @param {string} screenId - ID da tela
         * @param {Element} rootEl - Elemento raiz
         */
        function _markCataloged(screenId, rootEl) {
            const rows = [];
            for (const r of _permissoes.values()) {
                if (r.screenId === screenId && ['field', 'button', 'other'].includes(r.kind)) {
                    rows.push(r);
                }
            }
            if (rows.length === 0) return;

            for (const r of rows) {
                const targets = new Set();

                if (r.key) {
                    if (rootEl.matches?.(`[data-eid="${r.key}"]`)) targets.add(rootEl);
                    try {
                        rootEl.querySelectorAll?.(`[data-eid="${CSS.escape(r.key)}"]`).forEach((el) => targets.add(el));
                    } catch { /* ignore */ }
                }

                if (r.selector) {
                    try {
                        if (rootEl.matches?.(r.selector)) targets.add(rootEl);
                        rootEl.querySelectorAll?.(r.selector).forEach((el) => targets.add(el));
                    } catch { /* seletor inválido: ignora */ }
                }

                for (const el of targets) {
                    if (el.dataset.elemCatalog) continue;
                    el.dataset.elemCatalog = r.key;
                    el.dataset.elemOrigOutline = el.style.outline || '';
                    el.dataset.elemOrigOffset = el.style.outlineOffset || '';
                    el.dataset.elemOrigTitle = el.getAttribute('title') || '';
                    el.style.outline = '2px dashed #7c3aed';
                    el.style.outlineOffset = '1px';
                    const suffix = `🔑 ${r.key} (${r.effect === 'disable' ? 'desabilita' : 'oculta'})`;
                    el.setAttribute('title', el.dataset.elemOrigTitle ? `${el.dataset.elemOrigTitle} · ${suffix}` : suffix);
                }
            }
        }

        /**
         * Remove todas as marcas e restrições.
         * @param {Element} rootEl - Elemento raiz
         */
        function _revealAll(rootEl) {
            const clearMark = (el) => {
                delete el.dataset.elemCatalog;
                el.style.outline = el.dataset.elemOrigOutline || '';
                el.style.outlineOffset = el.dataset.elemOrigOffset || '';
                if (el.dataset.elemOrigTitle) el.setAttribute('title', el.dataset.elemOrigTitle);
                else el.removeAttribute('title');
                delete el.dataset.elemOrigOutline;
                delete el.dataset.elemOrigOffset;
                delete el.dataset.elemOrigTitle;
            };

            if (rootEl.matches?.('[data-elem-hidden]')) {
                delete rootEl.dataset.elemHidden;
                rootEl.style.display = '';
            }
            if (rootEl.matches?.('[data-elem-catalog]')) clearMark(rootEl);
            rootEl.querySelectorAll?.('[data-elem-catalog]').forEach(clearMark);
            rootEl.querySelectorAll?.('[data-elem-hidden]').forEach((el) => {
                delete el.dataset.elemHidden;
                el.style.display = '';
            });
            rootEl.querySelectorAll?.('[data-elem-denied]').forEach((el) => {
                delete el.dataset.elemDenied;
                el.removeAttribute('disabled');
                el.removeAttribute('aria-disabled');
                el.classList.remove('is-disabled');
                el.style.pointerEvents = '';
                el.style.opacity = '';
            });
        }

        // Registra hooks no framework
        FW.registerContentHook(({ screenId, root }) => {
            applyToContent(screenId, root);
        });

        FW.registerMenuItemFilter(({ screenId, kind, labelPath }) => {
            return isMenuItemAllowed(screenId, kind, labelPath);
        });

        // Expõe API pública
        FW.elementPermissions = {
            load,
            clear,
            isAllowed,
            applyToContent,
            isMenuItemAllowed,
            rowsForScreen,
            reapplyOpenWindows,
            refresh,
            isLoaded: () => _loaded
        };
    }
};
