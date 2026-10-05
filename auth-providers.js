// auth-providers.js
// Provedores prontos ("meio caminho andado") para o AuthService.
// O desenvolvedor só registra com as credenciais/endpoints da sua
// aplicação — o fluxo (navegação, callback, troca de token, sessão)
// já vem resolvido:
//
//   AuthService.registerProvider('oidc', createOAuthProvider({
//       issuer: 'https://accounts.google.com',   // ou endpoints: {...}
//       clientId: '...',
//       mapUser: (profile) => ({ id: profile.sub, nome: profile.name }),
//   }));
//
//   AuthService.registerProvider('sso', createSsoProvider({ loginUrl, fetchUser }));
//   AuthService.registerProvider('ldap', createLdapProvider({ endpoint }));
//
// No boot: `await AuthService.handleCallback('oidc', location.search)` —
// retorna null quando a URL não é um callback (não interrompe o app).

// ---------------------------------------------------------------- helpers

/** Converte '?a=1' (ou 'a=1') em URLSearchParams; aceita string vazia. */
export function parseSearch(search = '') {
    const s = String(search || '');
    return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

/** String aleatória criptográfica (fallback para ambientes sem crypto). */
function randomString(bytes = 32) {
    const buf = new Uint8Array(bytes);
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.getRandomValues) {
        cryptoObj.getRandomValues(buf);
    } else {
        for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** base64url sem padding (para PKCE e JWT). */
function base64Url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * code_challenge do PKCE: S256 quando há WebCrypto (todo navegador real);
 * fallback "plain" (RFC 7636) em ambientes sem crypto.subtle (ex: jsdom).
 */
async function pkceChallenge(verifier) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return { challenge: base64Url(new Uint8Array(digest)), method: 'S256' };
    }
    return { challenge: verifier, method: 'plain' };
}

/** Decodifica o payload de um JWT (sem validar assinatura — use userinfo quando houver). */
function decodeJwtPayload(jwt) {
    try {
        const part = String(jwt).split('.')[1] || '';
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = typeof atob === 'function'
            ? atob(b64)
            : Buffer.from(b64, 'base64').toString('utf8');
        // atob devolve binário: corrige UTF-8
        return JSON.parse(typeof atob === 'function'
            ? decodeURIComponent(escape(json))
            : json);
    } catch {
        return null;
    }
}

/** Navegação padrão (redireciona a aba atual para o IdP). */
function defaultNavigate(url) {
    if (typeof window !== 'undefined' && window.location?.assign) {
        window.location.assign(url);
    }
}

/** Monta URL com query extra, preservando querystring já existente. */
function withParams(url, params) {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!entries.length) return url;
    const [base, hash = ''] = String(url).split('#');
    const sep = base.includes('?') ? '&' : '?';
    const qs = new URLSearchParams(entries).toString();
    return `${base}${sep}${qs}${hash ? `#${hash}` : ''}`;
}

// ------------------------------------------------- OAuth2 / OIDC (PKCE)

const OAUTH_PREFIX = 'desktop_engine_oauth';
const OIDC_DISCOVERY = new Map(); // issuer -> document (cache)

/** Resolve os endpoints: explícitos ou via OIDC Discovery (.well-known). */
async function resolveOAuthEndpoints(cfg, doFetch) {
    const explicit = cfg.endpoints || {};
    if (explicit.authorization && explicit.token) {
        return { authorization: explicit.authorization, token: explicit.token, userinfo: explicit.userinfo || null };
    }
    if (!cfg.issuer) {
        throw new Error('OAuth: informe endpoints {authorization, token} ou um issuer (OIDC Discovery)');
    }
    const issuer = String(cfg.issuer).replace(/\/$/, '');
    if (!OIDC_DISCOVERY.has(issuer)) {
        const res = await doFetch(`${issuer}/.well-known/openid-configuration`);
        if (!res.ok) {
            throw new Error(`OAuth: falha no OIDC Discovery (${res.status}) para ${issuer}`);
        }
        OIDC_DISCOVERY.set(issuer, await res.json());
    }
    const doc = OIDC_DISCOVERY.get(issuer);
    return {
        authorization: explicit.authorization || doc.authorization_endpoint,
        token: explicit.token || doc.token_endpoint,
        userinfo: explicit.userinfo || doc.userinfo_endpoint || null,
    };
}

/**
 * Cria um provedor OAuth2/OIDC (Authorization Code + PKCE).
 * login() monta a URL de autorização e navega; handleCallback() troca o
 * code pelo token, busca o perfil e devolve { user, token }.
 *
 * @param {Object} cfg
 * @param {string} cfg.clientId - Client ID (obrigatório)
 * @param {string} [cfg.issuer] - Issuer OIDC (discovery automático)
 * @param {Object} [cfg.endpoints] - { authorization, token, userinfo } explícitos
 * @param {string} [cfg.redirectUri] - Default: URL atual (sem ?code=)
 * @param {string[]} [cfg.scopes] - Default: ['openid','profile','email']
 * @param {string} [cfg.clientSecret] - Só para flows confidenciais (evite no browser)
 * @param {Object} [cfg.extraAuthParams] - Params extras na URL de autorização
 * @param {Function} [cfg.mapUser] - (profile) => user da aplicação
 * @param {Function} [cfg.fetch] - fetch alternativo (testes)
 * @param {Function} [cfg.navigate] - Navegação alternativa (testes/popup)
 * @param {string} [cfg.storagePrefix] - Chave do state/verifier no sessionStorage
 */
export function createOAuthProvider(cfg = {}) {
    if (!cfg.clientId) {
        throw new Error('OAuth: clientId é obrigatório');
    }
    const doFetch = cfg.fetch || ((...args) => globalThis.fetch(...args));
    const navigate = cfg.navigate || defaultNavigate;
    const prefix = cfg.storagePrefix || OAUTH_PREFIX;
    const scopes = cfg.scopes || ['openid', 'profile', 'email'];
    const usePKCE = cfg.usePKCE !== false;
    const redirectUri = cfg.redirectUri ||
        (typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '');
    const mapUser = cfg.mapUser || ((profile) => ({ id: profile?.sub ?? profile?.id, ...profile }));

    const readStorage = (key) => {
        try { return sessionStorage.getItem(`${prefix}.${key}`); } catch { return null; }
    };
    const writeStorage = (key, value) => {
        try { sessionStorage.setItem(`${prefix}.${key}`, value); } catch { /* sem storage */ }
    };
    const clearStorage = () => {
        try {
            sessionStorage.removeItem(`${prefix}.state`);
            sessionStorage.removeItem(`${prefix}.verifier`);
        } catch { /* sem storage */ }
    };
    /** Remove ?code=&state= da URL sem recarregar a página. */
    const cleanUrl = () => {
        if (typeof window === 'undefined' || !window.history?.replaceState) return;
        try {
            const url = new URL(window.location.href);
            ['code', 'state', 'iss', 'session_state'].forEach((p) => url.searchParams.delete(p));
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch { /* ambiente sem URL */ }
    };

    return {
        /** Redireciona para o IdP (a sessão vem do handleCallback). */
        async login() {
            const endpoints = await resolveOAuthEndpoints(cfg, doFetch);
            const state = randomString(32);
            const verifier = usePKCE ? randomString(64) : null;

            writeStorage('state', state);
            if (verifier) writeStorage('verifier', verifier);

            let params = {
                response_type: 'code',
                client_id: cfg.clientId,
                redirect_uri: redirectUri,
                scope: scopes.join(' '),
                state,
                ...(cfg.extraAuthParams || {}),
            };
            if (verifier) {
                const { challenge, method } = await pkceChallenge(verifier);
                params.code_challenge = challenge;
                params.code_challenge_method = method;
            }

            navigate(withParams(endpoints.authorization, params));
            return null; // a página sai: o resultado vem no callback
        },

        /**
         * Trata o retorno do IdP: valida state, troca code por token e
         * monta a sessão. Retorna null se a URL não for um callback.
         */
        async handleCallback(search = (typeof window !== 'undefined' ? window.location.search : '')) {
            const params = parseSearch(search);

            if (params.get('error')) {
                clearStorage();
                throw new Error(params.get('error_description') || `Erro do provedor: ${params.get('error')}`);
            }

            const code = params.get('code');
            if (!code) return null;

            const state = params.get('state');
            const savedState = readStorage('state');
            if (!savedState || state !== savedState) {
                clearStorage();
                throw new Error('OAuth: estado do callback inválido (possível CSRF) — faça login novamente');
            }
            const verifier = readStorage('verifier');
            clearStorage();

            const endpoints = await resolveOAuthEndpoints(cfg, doFetch);

            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: cfg.clientId,
            });
            if (verifier) body.set('code_verifier', verifier);
            if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);

            const res = await doFetch(endpoints.token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: String(body),
            });
            const tokens = await res.json().catch(() => null);
            if (!res.ok || !tokens?.access_token) {
                throw new Error(
                    tokens?.error_description || tokens?.error ||
                    `OAuth: falha ao trocar o código (HTTP ${res.status})`
                );
            }

            // Perfil: userinfo (preferido, assinado pelo IdP) ou payload do id_token
            let profile = null;
            if (endpoints.userinfo) {
                const r = await doFetch(endpoints.userinfo, {
                    headers: { Authorization: `Bearer ${tokens.access_token}` },
                });
                if (r.ok) profile = await r.json().catch(() => null);
            }
            if (!profile && tokens.id_token) profile = decodeJwtPayload(tokens.id_token);
            if (!profile) profile = { sub: 'unknown' };

            cleanUrl();

            return {
                user: mapUser(profile),
                token: tokens.access_token,
                refreshToken: tokens.refresh_token || null,
                idToken: tokens.id_token || null,
                expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
            };
        },

        /**
         * Revoga o access token no IdP (melhor esforço) quando um
         * revocationEndpoint é configurado — recebe a sessão do AuthService.
         */
        async logout(session) {
            if (!cfg.revocationEndpoint || !session?.token) return;
            try {
                await doFetch(cfg.revocationEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `token=${encodeURIComponent(session.token)}`,
                });
            } catch { /* revogação é melhor esforço */ }
        },
    };
}

// ------------------------------------------- SSO via redirect do backend

/**
 * Cria um provedor SSO corporativo: o backend redireciona para o IdP e
 * devolve para a app com ?token= (ou outro parâmetro configurável).
 *
 * @param {Object} cfg
 * @param {string} cfg.loginUrl - Endpoint que inicia o SSO (ex: '/auth/sso/start')
 * @param {string} [cfg.callbackParam='token'] - Paramêtro do token no retorno
 * @param {Function} cfg.fetchUser - (token, params) => profile do usuário
 * @param {Object} [cfg.extraParams] - Query extra na URL de login
 * @param {string} [cfg.logoutUrl] - Endpoint de logout (POST)
 * @param {Function} [cfg.mapUser] - (profile) => user da aplicação
 * @param {Function} [cfg.navigate] - Navegação alternativa (testes)
 */
export function createSsoProvider(cfg = {}) {
    if (!cfg.loginUrl) {
        throw new Error('SSO: loginUrl é obrigatório');
    }
    const navigate = cfg.navigate || defaultNavigate;
    const doFetch = cfg.fetch || ((...args) => globalThis.fetch(...args));
    const mapUser = cfg.mapUser || ((profile) => profile);

    return {
        /** Redireciona para o backend iniciar o SSO. */
        async login() {
            navigate(withParams(cfg.loginUrl, cfg.extraParams));
            return null; // a página sai: o resultado vem no callback
        },

        /** Lê ?token= no retorno e monta a sessão (null se não for callback). */
        async handleCallback(search = (typeof window !== 'undefined' ? window.location.search : '')) {
            const params = parseSearch(search);
            const token = params.get(cfg.callbackParam || 'token');
            if (!token) return null;

            if (typeof cfg.fetchUser !== 'function') {
                throw new Error('SSO: informe fetchUser(token) para obter o usuário no retorno');
            }
            const profile = await cfg.fetchUser(token, params);
            return { user: mapUser(profile), token };
        },

        /** Logout no backend (melhor esforço). */
        async logout() {
            if (!cfg.logoutUrl) return;
            try {
                await doFetch(cfg.logoutUrl, { method: 'POST' });
            } catch { /* sem backend: segue o logout local */ }
        },
    };
}

// -------------------------------------------------------- LDAP (endpoint)

/** Extrai token/usuário do payload típico de login (accessToken/user). */
function defaultLdapExtract(data) {
    return {
        token: data?.accessToken ?? data?.access_token ?? data?.token ?? null,
        user: data?.user ?? null,
    };
}

/**
 * Cria um provedor LDAP: o bind é validado pelo backend (o browser nunca
 * fala LDAP diretamente). login(bind, senha) → POST JSON no endpoint.
 *
 * @param {Object} cfg
 * @param {string} cfg.endpoint - Endpoint de login (ex: '/auth/ldap')
 * @param {Function} [cfg.extract] - (data) => { token, user } — default: accessToken/user
 * @param {Object} [cfg.headers] - Headers extras
 * @param {Function} [cfg.mapUser] - (user) => user da aplicação
 * @param {Function} [cfg.fetch] - fetch alternativo (testes)
 */
export function createLdapProvider(cfg = {}) {
    if (!cfg.endpoint) {
        throw new Error('LDAP: endpoint é obrigatório');
    }
    const doFetch = cfg.fetch || ((...args) => globalThis.fetch(...args));
    const extract = cfg.extract || defaultLdapExtract;
    const mapUser = cfg.mapUser || ((user) => user);

    return {
        async login(bind, senha) {
            if (!bind || !senha) {
                throw new Error('LDAP: informe usuário/bind e senha');
            }

            const res = await doFetch(cfg.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
                body: JSON.stringify({ bind, senha }),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const message = (data && (data.message || data.error)) ||
                    `Falha no login LDAP (HTTP ${res.status})`;
                throw new Error(Array.isArray(message) ? message.join(', ') : message);
            }

            const { token, user } = extract(data || {});
            if (!token) {
                throw new Error('LDAP: resposta do servidor sem token');
            }
            return { user: user ? mapUser(user) : null, token };
        },

        async logout() {
            // O backend invalida o token no logout da sessão (se houver endpoint).
            if (!cfg.logoutUrl) return;
            try {
                await doFetch(cfg.logoutUrl, { method: 'POST' });
            } catch { /* melhor esforço */ }
        },
    };
}
