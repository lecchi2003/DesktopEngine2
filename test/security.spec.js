// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityService, applySecurityPolicies } from '../core.js';

describe('SecurityService', () => {
    beforeEach(() => {
        SecurityService.init({ user: null, roles: [], permissions: [] }, false);
    });

    it('nega tudo sem sessão', () => {
        expect(SecurityService.getUser()).toBeNull();
        expect(SecurityService.can('chamados:view')).toBe(false);
        expect(SecurityService.hasRole('ADMIN')).toBe(false);
    });

    it('ADMIN tem autorização universal', () => {
        SecurityService.init({ user: { id: '1' }, roles: ['ADMIN'], permissions: [] }, false);
        expect(SecurityService.can('qualquer:coisa')).toBe(true);
        expect(SecurityService.hasPermission('x')).toBe(true);
    });

    it('hasPermission é alias de can', () => {
        SecurityService.init({ user: { id: '1' }, roles: ['TECNICO'], permissions: ['a:b'] }, false);
        expect(SecurityService.hasPermission('a:b')).toBe(true);
        expect(SecurityService.hasPermission('c:d')).toBe(false);
    });
});

describe('applySecurityPolicies', () => {
    beforeEach(() => {
        SecurityService.init({ user: { id: '1' }, roles: ['TECNICO'], permissions: ['doc:read'] }, false);
    });

    it('remove nós sem permissão (remove é o padrão)', () => {
        const root = document.createElement('div');
        root.innerHTML = '<button id="ok" data-permission="doc:read">Ler</button><button id="no" data-permission="doc:delete">Apagar</button>';
        applySecurityPolicies(root);
        expect(root.querySelector('#ok')).not.toBeNull();
        expect(root.querySelector('#no')).toBeNull();
    });

    it('desabilita em vez de remover com data-auth-behavior="disable"', () => {
        const root = document.createElement('div');
        root.innerHTML = '<button id="b" data-permission="doc:delete" data-auth-behavior="disable">Apagar</button>';
        applySecurityPolicies(root);
        const btn = root.querySelector('#b');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('disabled')).toBe('true');
        expect(btn.style.pointerEvents).toBe('none');
    });

    it('remove nós com role insuficiente', () => {
        const root = document.createElement('div');
        root.innerHTML = '<span id="a" data-role="ADMIN">x</span>';
        applySecurityPolicies(root);
        expect(root.querySelector('#a')).toBeNull();
    });
});
