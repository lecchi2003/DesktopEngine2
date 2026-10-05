// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth-service.js';
import { ApiError, createHttpTransport } from '../api-service.js';
import { EventBus } from '../core.js';
import {
    createOAuthProvider,
    createSsoProvider,
    createLdapProvider,
    parseSearch,
} from '../auth-providers.js';

// ------------------------------------------------------- HttpTransport

describe('createHttpTransport (transporte HTTP pronto)', () => {
    const jsonRes = (data, init = {}) => ({
        ok: init.status ? init.status < 400 : true,
        status: init.status || 200,
        statusText: init.statusText || 'OK',
        json: async () => data,
    });

    it('monta URL com baseUrl, headers JSON e token Bearer', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ ok: true }));
        const transport = createHttpTransport({
            baseUrl: 'http://api.local:3001',
            getToken: () => 'tok-123',
            fetch: fetchMock,
        });

        const res = await transport.request('/chamados', { method: 'POST', body: { titulo: 'x' } });

        expect(res).toEqual({ ok: true });
        const [url, config] = fetchMock.mock.calls[0];
        expect(url).toBe('http://api.local:3001/chamados');
        expect(config.method).toBe('POST');
        expect(config.body).toBe(JSON.stringify({ titulo: 'x' }));
        expect(config.headers['Content-Type']).toBe('application/json');
        expect(config.headers['Authorization']).toBe('Bearer tok-123');
    });

    it('URL absoluta ignora baseUrl; params viram query string sem vazios', async () => {
        const fetchMock = vi.fn(async () => jsonRes([]));
        const transport = createHttpTransport({ baseUrl: 'http://api.local', fetch: fetchMock });

        await transport.request('https://outro.api/v1/x', {
            params: { status: 'ABERTO', page: 2, vazio: '', nulo: null, indef: undefined },
        });

        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe('https://outro.api/v1/x?status=ABERTO&page=2');
    });

    it('token nulo não envia Authorization; 204 devolve null', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 204, json: async () => { throw new Error('sem corpo'); } }));
        const transport = createHttpTransport({ baseUrl: 'http://api.local', getToken: () => null, fetch: fetchMock });

        expect(await transport.request('/x')).toBeNull();
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('erro HTTP vira ApiError com status, mensagem e data', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ message: 'Dados inválidos' }, { status: 400, statusText: 'Bad Request' }));
        const transport = createHttpTransport({ baseUrl: 'http://api.local', fetch: fetchMock });

        await expect(transport.request('/x')).rejects.toMatchObject({
            name: 'ApiError',
            status: 400,
            message: 'Dados inválidos',
        });

        // mensagem array vira string única; sem body, usa statusText
        fetchMock.mockImplementation(async () => jsonRes({ message: ['a', 'b'] }, { status: 422, statusText: 'Unprocessable' }));
        await expect(transport.request('/x')).rejects.toThrow('a, b');
        fetchMock.mockImplementation(async () => ({ ok: false, status: 500, statusText: 'Erro', json: async () => null }));
        await expect(transport.request('/x')).rejects.toThrow('Erro HTTP 500: Erro');
    });

    it('responseType blob/text devolve o corpo bruto com Accept genérico', async () => {
        const binario = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
        const fetchMock = vi.fn(async () => ({
            ok: true, status: 200, statusText: 'OK',
            json: async () => { throw new Error('não é JSON'); },
            blob: async () => binario,
            text: async () => '%PDF-1.4 fake',
        }));
        const transport = createHttpTransport({
            baseUrl: 'http://api.local', getToken: () => 'tok', fetch: fetchMock,
        });

        const blob = await transport.request('/relatorio.pdf', { responseType: 'blob' });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/pdf');
        const [, config] = fetchMock.mock.calls[0];
        expect(config.headers['Accept']).toBe('*/*');
        expect(config.headers['Authorization']).toBe('Bearer tok');

        expect(await transport.request('/relatorio.pdf', { responseType: 'text' }))
            .toBe('%PDF-1.4 fake');
    });

    it('erro com responseType blob usa o statusText', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: false, status: 404, statusText: 'Não encontrado',
            blob: async () => new Blob(['x']),
        }));
        const transport = createHttpTransport({ baseUrl: 'http://api.local', fetch: fetchMock });

        await expect(transport.request('/x.pdf', { responseType: 'blob' }))
            .rejects.toMatchObject({ name: 'ApiError', status: 404 });
    });

    it('falha de rede vira ApiError com status 0', async () => {
        const fetchMock = vi.fn(async () => { throw new Error('offline'); });
        const transport = createHttpTransport({ baseUrl: 'http://api.local', fetch: fetchMock });

        const err = await transport.request('/x').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(0);
        expect(err.message).toBe('offline');
    });
});

// --------------------------------------------- AuthService.handleCallback

describe('AuthService.handleCallback', () => {
    beforeEach(() => {
        localStorage.clear();
        AuthService._session = null;
        AuthService._providers.clear();
    });

    it('persiste sessão e emite auth:login quando o provedor devolve resultado', async () => {
        const events = [];
        const onLogin = (u) => events.push(u.id);
        EventBus.on('auth:login', onLogin);

        AuthService.registerProvider('oidc', {
            login: async () => null,
            handleCallback: async (search) =>
                search.includes('code=abc') ? { user: { id: 'u1' }, token: 'tk' } : null,
        });

        const res = await AuthService.handleCallback('oidc', '?code=abc&state=x');
        expect(res.token).toBe('tk');
        expect(AuthService.isAuthenticated()).toBe(true);
        expect(AuthService.getToken()).toBe('tk');
        expect(AuthService.getCurrentProvider()).toBe('oidc');
        expect(events).toEqual(['u1']);

        // URL sem parâmetros de callback: nada muda (devolve null)
        expect(await AuthService.handleCallback('oidc', '?tab=1')).toBeNull();
        expect(AuthService.getToken()).toBe('tk');

        EventBus.off('auth:login', onLogin);
    });

    it('login() que retorna null (redirect) não cria sessão', async () => {
        AuthService.registerProvider('redirect', { login: async () => null });
        expect(await AuthService.login('redirect')).toBeNull();
        expect(AuthService.isAuthenticated()).toBe(false);
    });

    it('lança para provedor inexistente ou sem handleCallback', async () => {
        AuthService.registerProvider('basico', { login: async () => ({ user: {}, token: 't' }) });

        await expect(AuthService.handleCallback('nao-existe')).rejects.toThrow("Provedor 'nao-existe' não registrado");
        await expect(AuthService.handleCallback('basico')).rejects.toThrow('não suporta handleCallback');
    });
});

// ------------------------------------------------- OAuth2/OIDC + PKCE

describe('createOAuthProvider (Authorization Code + PKCE)', () => {
    const endpoints = {
        authorization: 'https://idp.local/authorize',
        token: 'https://idp.local/token',
        userinfo: 'https://idp.local/userinfo',
    };

    const makeProvider = (overrides = {}) => {
        const navigate = vi.fn();
        const fetchMock = vi.fn(async (url) => {
            const u = String(url);
            if (u.includes('/token')) {
                return {
                    ok: true, status: 200,
                    json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 }),
                };
            }
            if (u.includes('/userinfo')) {
                return { ok: true, status: 200, json: async () => ({ sub: 'u42', name: 'Ana' }) };
            }
            return { ok: false, status: 404, json: async () => null };
        });
        const provider = createOAuthProvider({
            clientId: 'cli-1',
            endpoints,
            navigate,
            fetch: fetchMock,
            mapUser: (p) => ({ id: p.sub, nome: p.name }),
            ...overrides,
        });
        return { provider, navigate, fetchMock };
    };

    beforeEach(() => {
        try { sessionStorage.clear(); } catch { /* sem storage */ }
        vi.restoreAllMocks();
    });

    it('login navega para o IdP com state, PKCE e parâmetros OIDC', async () => {
        const { provider, navigate } = makeProvider({ extraAuthParams: { prompt: 'select_account' } });

        expect(await provider.login()).toBeNull();
        expect(navigate).toHaveBeenCalledTimes(1);

        const url = new URL(navigate.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe(endpoints.authorization);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('client_id')).toBe('cli-1');
        expect(url.searchParams.get('scope')).toContain('openid');
        expect(url.searchParams.get('prompt')).toBe('select_account');
        expect(url.searchParams.get('code_challenge')).toBeTruthy();
        expect(['S256', 'plain']).toContain(url.searchParams.get('code_challenge_method'));

        // state salvo bate com o enviado
        const state = url.searchParams.get('state');
        expect(sessionStorage.getItem('desktop_engine_oauth.state')).toBe(state);
    });

    it('handleCallback troca o code pelo token e devolve {user, token}', async () => {
        const { provider, navigate, fetchMock } = makeProvider();
        await provider.login();
        const state = new URL(navigate.mock.calls[0][0]).searchParams.get('state');

        const res = await provider.handleCallback(`?code=c-9&state=${state}`);

        expect(res).toMatchObject({ token: 'at-1', refreshToken: 'rt-1' });
        expect(res.user).toEqual({ id: 'u42', nome: 'Ana' });
        expect(res.expiresAt).toBeGreaterThan(Date.now());

        // requisição ao token endpoint (form-urlencoded com o code)
        const tokenCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/token'));
        expect(tokenCall[1].method).toBe('POST');
        expect(String(tokenCall[1].body)).toContain('grant_type=authorization_code');
        expect(String(tokenCall[1].body)).toContain('code=c-9');
        expect(String(tokenCall[1].body)).toContain('code_verifier=');

        // state/verifier consumidos
        expect(sessionStorage.getItem('desktop_engine_oauth.state')).toBeNull();
        expect(sessionStorage.getItem('desktop_engine_oauth.verifier')).toBeNull();
    });

    it('handleCallback sem code retorna null (não é callback)', async () => {
        const { provider } = makeProvider();
        expect(await provider.handleCallback('?tab=home')).toBeNull();
    });

    it('state divergente é rejeitado (proteção CSRF)', async () => {
        const { provider, navigate } = makeProvider();
        await provider.login();
        expect(navigate).toHaveBeenCalled(); // state/verifier salvos no login

        await expect(provider.handleCallback('?code=c-9&state=FORJADO'))
            .rejects.toThrow('estado do callback inválido');
        expect(sessionStorage.getItem('desktop_engine_oauth.state')).toBeNull();
    });

    it('error do IdP vira exceção com a descrição', async () => {
        const { provider } = makeProvider();
        await expect(provider.handleCallback('?error=access_denied&error_description=Usu%C3%A1rio+recusou'))
            .rejects.toThrow('Usuário recusou');
    });

    it('usa OIDC Discovery quando só o issuer é informado', async () => {
        const navigate = vi.fn();
        const fetchMock = vi.fn(async () => ({
            ok: true, status: 200,
            json: async () => ({
                authorization_endpoint: 'https://discovery.local/auth',
                token_endpoint: 'https://discovery.local/tok',
                userinfo_endpoint: 'https://discovery.local/info',
            }),
        }));
        const provider = createOAuthProvider({
            clientId: 'cli-2',
            issuer: 'https://issuer-distinto.local',
            navigate,
            fetch: fetchMock,
        });

        await provider.login();

        expect(String(fetchMock.mock.calls[0][0])).toContain('/.well-known/openid-configuration');
        expect(new URL(navigate.mock.calls[0][0]).origin).toBe('https://discovery.local');
    });

    it('sem userinfo_endpoint usa o payload do id_token', async () => {
        const navigate = vi.fn();
        const payload = btoa(JSON.stringify({ sub: 'u7', name: 'Bia' }));
        const fetchMock = vi.fn(async (url) => {
            if (String(url).includes('/token')) {
                return {
                    ok: true, status: 200,
                    json: async () => ({ access_token: 'at', id_token: `hdr.${payload}.sig` }),
                };
            }
            return { ok: false, status: 404, json: async () => null };
        });
        const provider = createOAuthProvider({
            clientId: 'cli-3',
            endpoints: { authorization: 'https://idp2.local/a', token: 'https://idp2.local/token' },
            navigate,
            fetch: fetchMock,
            mapUser: (p) => ({ id: p.sub, nome: p.name }),
        });

        await provider.login();
        const state = new URL(navigate.mock.calls[0][0]).searchParams.get('state');
        const res = await provider.handleCallback(`?code=c&state=${state}`);

        expect(res.user).toEqual({ id: 'u7', nome: 'Bia' });
        expect(res.token).toBe('at');
    });

    it('exige clientId', () => {
        expect(() => createOAuthProvider({})).toThrow('clientId é obrigatório');
    });
});

// ------------------------------------------------------ SSO redirect

describe('createSsoProvider (redirect do backend)', () => {
    const makeProvider = (overrides = {}) => {
        const navigate = vi.fn();
        const fetchUser = vi.fn(async (token) => ({ id: 'u9', nome: 'Sso', token }));
        const provider = createSsoProvider({
            loginUrl: '/auth/sso/start',
            fetchUser,
            navigate,
            ...overrides,
        });
        return { provider, navigate, fetchUser };
    };

    it('login redireciona para o endpoint do backend', async () => {
        const { provider, navigate } = makeProvider({ extraParams: { org: 'acme' } });

        expect(await provider.login()).toBeNull();
        expect(navigate).toHaveBeenCalledWith('/auth/sso/start?org=acme');
    });

    it('handleCallback lê ?token=, busca o usuário e monta a sessão', async () => {
        const { provider, fetchUser } = makeProvider();

        const res = await provider.handleCallback('?token=jwt-1&state=ok');
        expect(fetchUser).toHaveBeenCalledWith('jwt-1', expect.any(URLSearchParams));
        expect(res).toEqual({ user: { id: 'u9', nome: 'Sso', token: 'jwt-1' }, token: 'jwt-1' });

        expect(await provider.handleCallback('?tab=1')).toBeNull();
    });

    it('token presente sem fetchUser é erro de configuração', async () => {
        const { provider } = makeProvider({ fetchUser: undefined });
        await expect(provider.handleCallback('?token=x')).rejects.toThrow('fetchUser');
    });

    it('loginUrl é obrigatório', () => {
        expect(() => createSsoProvider({})).toThrow('loginUrl é obrigatório');
    });
});

// ---------------------------------------------------------- LDAP

describe('createLdapProvider (bind via endpoint)', () => {
    const jsonRes = (data, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => data,
    });

    it('login valida credenciais e extrai token/usuário', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ accessToken: 'tok-ld', user: { id: 'u1', nome: 'Léa' } }));
        const provider = createLdapProvider({ endpoint: '/auth/ldap', fetch: fetchMock });

        const res = await provider.login('ana', 'senha123');

        expect(res).toEqual({ token: 'tok-ld', user: { id: 'u1', nome: 'Léa' } });
        const [url, config] = fetchMock.mock.calls[0];
        expect(url).toBe('/auth/ldap');
        expect(config.method).toBe('POST');
        expect(JSON.parse(config.body)).toEqual({ bind: 'ana', senha: 'senha123' });

        await expect(provider.login('ana')).rejects.toThrow('usuário/bind e senha');
    });

    it('erro do backend vira exceção com a mensagem amigável', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ message: 'Credenciais inválidas' }, 401));
        const provider = createLdapProvider({ endpoint: '/auth/ldap', fetch: fetchMock });

        await expect(provider.login('ana', 'errada')).rejects.toThrow('Credenciais inválidas');
    });

    it('resposta sem token é erro', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ user: { id: 'u1' } }));
        const provider = createLdapProvider({ endpoint: '/auth/ldap', fetch: fetchMock });

        await expect(provider.login('ana', 's')).rejects.toThrow('sem token');
    });

    it('extract/mapUser customizados são aplicados', async () => {
        const fetchMock = vi.fn(async () => jsonRes({ data: { jwt: 'j1', dn: 'cn=ana' } }));
        const provider = createLdapProvider({
            endpoint: '/auth/ldap',
            fetch: fetchMock,
            extract: (d) => ({ token: d.data.jwt, user: { id: d.data.dn } }),
            mapUser: (u) => ({ ...u, ldap: true }),
        });

        const res = await provider.login('ana', 's');
        expect(res.token).toBe('j1');
        expect(res.user).toEqual({ id: 'cn=ana', ldap: true });
    });

    it('endpoint é obrigatório', () => {
        expect(() => createLdapProvider({})).toThrow('endpoint é obrigatório');
    });
});

describe('parseSearch', () => {
    it('aceita com ou sem "?" e string vazia', () => {
        expect(parseSearch('?a=1&b=2').get('a')).toBe('1');
        expect(parseSearch('a=1').get('a')).toBe('1');
        expect(parseSearch('').get('a')).toBeNull();
        expect(parseSearch(undefined).get('x')).toBeNull();
    });
});
