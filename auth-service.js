// auth-service.js
// AuthService genérico com provedores de autenticação registráveis.
// A aplicação registra provedores (email/senha, SSO, LDAP, etc.) e o
// framework gerencia a sessão, persistência e eventos de autenticação.

import { EventBus } from './core.js';

export const AuthService = {
    _providers: new Map(),
    _session: null,

    /**
     * Registra um provedor de autenticação.
     * @param {string} name - Nome do provedor (ex: 'email', 'sso', 'ldap')
     * @param {Object} provider - Provedor com métodos login, logout, handleCallback
     * @returns {Object} AuthService (para encadeamento)
     */
    registerProvider(name, provider) {
        if (!name || !provider) {
            throw new Error('Nome e provedor são obrigatórios');
        }
        this._providers.set(name, {
            login: provider.login,
            logout: provider.logout,
            handleCallback: provider.handleCallback,
            ...provider
        });
        return this;
    },

    /**
     * Remove um provedor de autenticação.
     * @param {string} name - Nome do provedor
     * @returns {Object} AuthService (para encadeamento)
     */
    removeProvider(name) {
        this._providers.delete(name);
        return this;
    },

    /**
     * Retorna um provedor registrado.
     * @param {string} name - Nome do provedor
     * @returns {Object|null} Provedor ou null se não encontrado
     */
    getProvider(name) {
        return this._providers.get(name) || null;
    },

    /**
     * Lista todos os provedores registrados.
     * @returns {string[]} Nomes dos provedores
     */
    listProviders() {
        return Array.from(this._providers.keys());
    },

    /**
     * Login com um provedor específico.
     * @param {string} providerName - Nome do provedor
     * @param {...any} args - Argumentos específicos do provedor
     * @returns {Promise<Object>} Resultado do login ({ user, token, ... })
     */
    async login(providerName, ...args) {
        const provider = this._providers.get(providerName);
        if (!provider) {
            throw new Error(`Provedor '${providerName}' não registrado`);
        }

        const result = await provider.login(...args);
        // Provedores de redirect (OAuth/SSO) retornam null: a página navega
        // para o IdP e a sessão será criada via handleCallback().
        if (!result) return null;

        this._session = {
            user: result.user,
            token: result.token,
            provider: providerName,
            ...result
        };

        this._persist();
        EventBus.emit('auth:login', result.user);

        return result;
    },

    /**
     * Processa o callback de um provedor (ex.: retorno do OAuth/SSO com
     * ?code= ou ?token= na URL). Diferente de login(), emite 'auth:login'
     * e persiste a sessão só se o provedor devolver um resultado — se
     * não houver parâmetros de callback, retorna null sem alterar nada.
     * @param {string} providerName - Nome do provedor
     * @param {...any} args - Argumentos específicos (ex: window.location.search)
     * @returns {Promise<Object|null>} Sessão criada ou null
     */
    async handleCallback(providerName, ...args) {
        const provider = this._providers.get(providerName);
        if (!provider) {
            throw new Error(`Provedor '${providerName}' não registrado`);
        }
        if (typeof provider.handleCallback !== 'function') {
            throw new Error(`Provedor '${providerName}' não suporta handleCallback`);
        }

        const result = await provider.handleCallback(...args);
        if (!result) return null;

        this._session = {
            user: result.user,
            token: result.token,
            provider: providerName,
            ...result
        };
        this._persist();
        EventBus.emit('auth:login', result.user);

        return result;
    },

    /**
     * Logout com o provedor atual.
     * @returns {Promise<void>}
     */
    async logout() {
        if (this._session?.provider) {
            const provider = this._providers.get(this._session.provider);
            if (provider?.logout) {
                // Recebe a sessão para poder revogar token no IdP/backend
                await provider.logout(this._session);
            }
        }
        this._session = null;
        localStorage.removeItem('auth_session');
        EventBus.emit('auth:logout');
    },

    /**
     * Define a sessão diretamente (sem passar por login()).
     * Útil para provedores que restauram sessão de forma própria ou para
     * reaproveitar o token obtido fora do fluxo do AuthService.
     * `null` encerra a sessão silenciosamente (sem emitir eventos).
     * @param {Object|null} session - Sessão ({ user, token, provider, ... }) ou null
     * @returns {Object|null} Sessão resultante
     */
    setSession(session) {
        if (session) {
            this._session = { ...session };
            this._persist();
        } else {
            this._session = null;
            localStorage.removeItem('auth_session');
        }
        return this.getSession();
    },

    /**
     * Verifica se está autenticado.
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this._session;
    },

    /**
     * Retorna usuário atual.
     * @returns {Object|null}
     */
    getCurrentUser() {
        return this._session?.user || null;
    },

    /**
     * Retorna token de acesso.
     * @returns {string|null}
     */
    getToken() {
        return this._session?.token || null;
    },

    /**
     * Retorna provedor atual.
     * @returns {string|null}
     */
    getCurrentProvider() {
        return this._session?.provider || null;
    },

    /**
     * Retorna sessão completa.
     * @returns {Object|null}
     */
    getSession() {
        return this._session ? { ...this._session } : null;
    },

    /**
     * Inicializa sessão (restaura do localStorage).
     * @returns {Promise<Object|null>} Usuário restaurado ou null
     */
    async init() {
        const saved = localStorage.getItem('auth_session');
        if (saved) {
            try {
                this._session = JSON.parse(saved);
                return this._session.user;
            } catch {
                localStorage.removeItem('auth_session');
            }
        }
        return null;
    },

    /**
     * Atualiza sessão (após refresh de token, por exemplo).
     * @param {Object} updates - Atualizações da sessão
     * @returns {Object} Sessão atualizada
     */
    updateSession(updates) {
        if (!this._session) {
            throw new Error('Não há sessão ativa');
        }
        this._session = { ...this._session, ...updates };
        this._persist();
        return this.getSession();
    },

    /**
     * Persiste sessão no localStorage.
     * @private
     */
    _persist() {
        if (this._session) {
            localStorage.setItem('auth_session', JSON.stringify(this._session));
        }
    }
};
