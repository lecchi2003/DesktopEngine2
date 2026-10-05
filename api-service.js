// api-service.js
// ApiService genérico com transportes registráveis.
// A aplicação registra transportes (HTTP, WebSocket, SSE, gRPC, etc.) e o
// framework gerencia interceptors, transporte padrão e métodos de conveniência.
// Inclui o transporte HTTP pronto (createHttpTransport) — a aplicação só
// configura baseUrl + como obter o token.

/**
 * Erro de requisição com status HTTP e corpo da resposta.
 * Mantido no framework para os transportes e para a aplicação compartilharem
 * o mesmo contrato ({ message, status, data }).
 */
export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

/**
 * Cria um transporte HTTP pronto (fetch) para o ApiService.
 * Concentra o que toda aplicação precisa: base URL, headers JSON, token
 * Bearer, query string, 204 No Content e erros padronizados em ApiError.
 * Respostas binárias/texto via `options.responseType` ('json' padrão |
 * 'blob' | 'arrayBuffer' | 'text') — ex: download autenticado de PDF.
 *
 * @param {Object} [config]
 * @param {string} [config.baseUrl=''] - Prefixo das URLs relativas (ex: 'http://host:3001')
 * @param {Function|string|null} [config.getToken] - Função que devolve o token atual (ou o token fixo)
 * @param {Object} [config.headers] - Headers padrão extras (sobrescrevem os defaults)
 * @param {Function} [config.fetch] - Implementação de fetch alternativa (testes)
 * @returns {Object} Transporte { request } pronto para registerTransport
 */
export function createHttpTransport({
    baseUrl = '',
    getToken = null,
    headers: defaultHeaders = {},
    fetch: fetchImpl = null,
} = {}) {
    const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));

    return {
        async request(endpoint, options = {}) {
            const url = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`;
            const responseType = options.responseType || 'json';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...defaultHeaders,
                ...(options.headers || {})
            };

            // Resposta não-JSON: Accept genérico (o chamador pode sobrescrever via headers)
            if (responseType !== 'json' && !defaultHeaders.Accept && !(options.headers || {}).Accept) {
                headers['Accept'] = '*/*';
            }

            const token = typeof getToken === 'function' ? getToken() : getToken;
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const config = {
                method: options.method || 'GET',
                headers
            };

            if (options.body) {
                config.body = JSON.stringify(options.body);
            }

            let finalUrl = url;
            if (options.params) {
                const queryString = new URLSearchParams(
                    Object.entries(options.params).filter(([, v]) => v !== undefined && v !== null && v !== '')
                ).toString();
                if (queryString) finalUrl = `${url}?${queryString}`;
            }

            try {
                const response = await doFetch(finalUrl, config);

                // 204 No Content
                if (response.status === 204) {
                    return null;
                }

                const data = responseType === 'blob' ? await response.blob()
                    : responseType === 'arrayBuffer' ? await response.arrayBuffer()
                    : responseType === 'text' ? await response.text()
                    : await response.json().catch(() => null);

                if (!response.ok) {
                    const message = (data && (data.message || data.error)) ||
                        `Erro HTTP ${response.status}: ${response.statusText}`;
                    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, response.status, data);
                }

                return data;
            } catch (error) {
                if (error instanceof ApiError) throw error;
                throw new ApiError(error.message || 'Falha de conexão com o servidor.', 0, null);
            }
        }
    };
}

export const ApiService = {
    _transports: new Map(),
    _defaultTransport: null,
    _interceptors: { request: [], response: [], error: [] },

    /**
     * Registra um transporte.
     * @param {string} name - Nome do transporte (ex: 'http', 'websocket', 'sse')
     * @param {Object} transport - Transporte com método request
     * @returns {Object} ApiService (para encadeamento)
     */
    registerTransport(name, transport) {
        if (!name || !transport) {
            throw new Error('Nome e transporte são obrigatórios');
        }
        if (typeof transport.request !== 'function') {
            throw new Error('Transporte deve implementar o método request');
        }
        this._transports.set(name, {
            request: transport.request,
            ...transport
        });
        return this;
    },

    /**
     * Remove um transporte.
     * @param {string} name - Nome do transporte
     * @returns {Object} ApiService (para encadeamento)
     */
    removeTransport(name) {
        this._transports.delete(name);
        if (this._defaultTransport === name) {
            this._defaultTransport = null;
        }
        return this;
    },

    /**
     * Retorna um transporte registrado.
     * @param {string} name - Nome do transporte
     * @returns {Object|null} Transporte ou null se não encontrado
     */
    getTransport(name) {
        return this._transports.get(name) || null;
    },

    /**
     * Lista todos os transportes registrados.
     * @returns {string[]} Nomes dos transportes
     */
    listTransports() {
        return Array.from(this._transports.keys());
    },

    /**
     * Define o transporte padrão.
     * @param {string} name - Nome do transporte
     * @returns {Object} ApiService (para encadeamento)
     */
    setDefaultTransport(name) {
        if (!this._transports.has(name)) {
            throw new Error(`Transporte '${name}' não registrado`);
        }
        this._defaultTransport = name;
        return this;
    },

    /**
     * Retorna o transporte padrão.
     * @returns {string|null}
     */
    getDefaultTransport() {
        return this._defaultTransport;
    },

    /**
     * Adiciona um interceptor de requisição.
     * @param {Function} fn - Interceptor (config) => config
     * @returns {Object} ApiService (para encadeamento)
     */
    onRequest(fn) {
        if (typeof fn === 'function') {
            this._interceptors.request.push(fn);
        }
        return this;
    },

    /**
     * Adiciona um interceptor de resposta.
     * @param {Function} fn - Interceptor (result) => result
     * @returns {Object} ApiService (para encadeamento)
     */
    onResponse(fn) {
        if (typeof fn === 'function') {
            this._interceptors.response.push(fn);
        }
        return this;
    },

    /**
     * Adiciona um interceptor de erro.
     * @param {Function} fn - Interceptor (error) => void
     * @returns {Object} ApiService (para encadeamento)
     */
    onError(fn) {
        if (typeof fn === 'function') {
            this._interceptors.error.push(fn);
        }
        return this;
    },

    /**
     * Remove todos os interceptors.
     * @returns {Object} ApiService (para encadeamento)
     */
    clearInterceptors() {
        this._interceptors = { request: [], response: [], error: [] };
        return this;
    },

    /**
     * Faz uma requisição usando o transporte especificado ou o padrão.
     * @param {string} endpoint - Endpoint
     * @param {Object} options - Opções da requisição
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>} Resultado da requisição
     */
    async request(endpoint, options = {}, transportName = null) {
        const transport = this._transports.get(transportName || this._defaultTransport);
        if (!transport) {
            throw new Error(`Transporte '${transportName || this._defaultTransport}' não registrado`);
        }

        // Aplica interceptors de requisição
        let config = { endpoint, options };
        for (const interceptor of this._interceptors.request) {
            config = interceptor(config) || config;
        }

        try {
            const result = await transport.request(config.endpoint, config.options);

            // Aplica interceptors de resposta
            let transformed = result;
            for (const interceptor of this._interceptors.response) {
                transformed = interceptor(transformed) || transformed;
            }

            return transformed;
        } catch (error) {
            // Aplica interceptors de erro
            for (const interceptor of this._interceptors.error) {
                interceptor(error);
            }
            throw error;
        }
    },

    /**
     * Requisição GET.
     * @param {string} endpoint - Endpoint
     * @param {Object} params - Parâmetros da query string
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>}
     */
    get(endpoint, params = {}, transportName = null) {
        return this.request(endpoint, { method: 'GET', params }, transportName);
    },

    /**
     * Requisição POST.
     * @param {string} endpoint - Endpoint
     * @param {Object} body - Corpo da requisição
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>}
     */
    post(endpoint, body = {}, transportName = null) {
        return this.request(endpoint, { method: 'POST', body }, transportName);
    },

    /**
     * Requisição PUT.
     * @param {string} endpoint - Endpoint
     * @param {Object} body - Corpo da requisição
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>}
     */
    put(endpoint, body = {}, transportName = null) {
        return this.request(endpoint, { method: 'PUT', body }, transportName);
    },

    /**
     * Requisição PATCH.
     * @param {string} endpoint - Endpoint
     * @param {Object} body - Corpo da requisição
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>}
     */
    patch(endpoint, body = {}, transportName = null) {
        return this.request(endpoint, { method: 'PATCH', body }, transportName);
    },

    /**
     * Requisição DELETE.
     * @param {string} endpoint - Endpoint
     * @param {string} transportName - Nome do transporte (opcional)
     * @returns {Promise<any>}
     */
    delete(endpoint, transportName = null) {
        return this.request(endpoint, { method: 'DELETE' }, transportName);
    }
};
