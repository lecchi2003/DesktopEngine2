// screens/SecurityRbacScreen.js
// DesktopEngine V2.0 - Showcase de Segurança e Controle de Acesso Baseado em Papéis (RBAC)
import { SecurityService, EventBus, applySecurityPolicies } from '../core.js?v=3';
import { ElementBuilder } from '../ElementBuilder.js?v=3';
import { Desktop } from '../desktop.js?v=3';

export default {
    id: "security_rbac",
    title: "Central de Segurança & RBAC (Zero-Trust)",
    icon: "🛡️",
    width: 860,
    height: 620,
    singleInstance: true,

    state: {
        currentProfile: "visitante",
        serverLog: "Aguardando ação para simular requisição segura...",
        serverLogStatus: "info"
    },

    onMount() {
        // Escuta atualizações de autenticação para re-renderizar a tela automaticamente
        this._authListener = (data) => {
            if (this.windowEl && document.body.contains(this.windowEl)) {
                this.update();
            }
        };
        EventBus.on('auth:change', this._authListener);
    },

    onDestroy() {
        if (this._authListener) {
            EventBus.off('auth:change', this._authListener);
        }
    },

    actions: {
        setProfile: [async (ctx, next, payload) => {
            const state = ctx?.state || ctx?.instance?.state;
            const inst = ctx?.instance;
            const profileKey = (typeof payload === 'string' ? payload : (typeof ctx?.event === 'string' ? ctx.event : (typeof ctx === 'string' ? ctx : 'visitante')));

            if (state) state.currentProfile = profileKey;

            if (profileKey === 'admin') {
                SecurityService.init({
                    user: "admin",
                    name: "Administrador Geral",
                    roles: ["ADMIN"],
                    permissions: ["products:view", "products:create", "products:edit", "products:delete", "financeiro:view", "audit:view"]
                });
                Desktop.notify("Perfil alterado: Administrador Geral (Acesso Irrestrito)", "success");
            } else if (profileKey === 'operador') {
                SecurityService.init({
                    user: "operador",
                    name: "Operador de Estoque",
                    roles: ["OPERADOR"],
                    permissions: ["products:view", "products:create", "products:edit"]
                });
                Desktop.notify("Perfil alterado: Operador de Estoque (Leitura/Edição)", "info");
            } else {
                SecurityService.init({
                    user: "visitante",
                    name: "Visitante Convidado",
                    roles: ["VISITANTE"],
                    permissions: ["products:view"]
                });
                Desktop.notify("Perfil alterado: Visitante (Apenas Visualização)", "warning");
            }

            if (inst && typeof inst.update === 'function') {
                inst.update();
            }
        }],

        testRestrictedScreen: [async (ctx) => {
            const state = ctx?.state || ctx?.instance?.state;
            const inst = ctx?.instance;

            Desktop.notify("Tentando abrir janela restrita: 'painel_financeiro_restrito'...", "info");
            const win = await Desktop.openScreen('painel_financeiro_restrito');
            if (win) {
                if (state) {
                    state.serverLog = "Sucesso: Janela restrita autorizada e aberta com sucesso pelo Guard!";
                    state.serverLogStatus = "success";
                }
            } else {
                if (state) {
                    state.serverLog = "Bloqueio Guard: Desktop.openScreen barrou a criação no DOM por falta de permissão 'financeiro:view'.";
                    state.serverLogStatus = "danger";
                }
            }

            if (inst && typeof inst.update === 'function') {
                inst.update();
            }
        }],

        testBackendDelete: [async (ctx) => {
            const state = ctx?.state || ctx?.instance?.state;
            const inst = ctx?.instance;
            const currentUser = SecurityService.getUser() || "visitante";

            if (state) {
                state.serverLog = `Enviando DELETE /api/products/1 com identidade '${currentUser}'...`;
                state.serverLogStatus = "warning";
            }
            if (inst && typeof inst.update === 'function') inst.update();

            try {
                const res = await fetch("http://localhost:8080/api/products/1", {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Auth-User": currentUser
                    }
                });

                const data = await res.json();
                if (state) {
                    if (res.status === 403) {
                        state.serverLog = `🔴 Resposta do Servidor: HTTP 403 Forbidden!\n${JSON.stringify(data, null, 2)}\nTentativa de exclusão bloqueada com segurança pelo backend!`;
                        state.serverLogStatus = "danger";
                        Desktop.notify("Backend rejeitou a operação com HTTP 403 Forbidden!", "danger");
                    } else if (res.ok) {
                        state.serverLog = `🟢 Resposta do Servidor: HTTP 200 OK!\n${JSON.stringify(data, null, 2)}\nOperação autorizada e executada no banco SQLite!`;
                        state.serverLogStatus = "success";
                        Desktop.notify("Operação de exclusão autorizada pelo Backend!", "success");
                    } else {
                        state.serverLog = `🟡 Resposta do Servidor (${res.status}):\n${JSON.stringify(data, null, 2)}`;
                        state.serverLogStatus = "warning";
                    }
                }
            } catch (err) {
                if (state) {
                    state.serverLog = `⚠️ O servidor Python (api.py) não parece estar respondendo em http://localhost:8080.\nSimulação local: Perfil '${currentUser}' não possui 'products:delete' -> Rejeitado localmente com 403 Forbidden.`;
                    state.serverLogStatus = currentUser === 'admin' ? 'success' : 'danger';
                }
            }

            if (inst && typeof inst.update === 'function') {
                inst.update();
            }
        }]
    },

    view() {
        const currentUser = SecurityService.getUser() || "Não autenticado";
        const currentRoles = SecurityService.getRoles();
        const currentPerms = SecurityService.getPermissions();

        // 1. Container Principal com ElementBuilder
        const root = new ElementBuilder('div')
            .style({
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                minHeight: '100%',
                boxSizing: 'border-box'
            });

        // 2. Banner de Introdução
        new ElementBuilder('div')
            .style({
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(147,51,234,0.12))',
                border: '1px solid rgba(59,130,246,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
            })
            .children([
                new ElementBuilder('div')
                    .children([
                        new ElementBuilder('h3')
                            .style({ margin: '0 0 4px 0', fontSize: '1.1rem' })
                            .text('🛡️ Demonstração de Autorização e Defesa Zero-Trust (RBAC)'),
                        new ElementBuilder('p')
                            .style({ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' })
                            .text('Alterne entre os perfis e observe os botões e janelas sumindo do DOM em tempo real.')
                    ]),
                new ElementBuilder('div')
                    .style({ display: 'flex', gap: '6px', alignItems: 'center' })
                    .children([
                        new ElementBuilder('span').style({ fontSize: '0.8rem', fontWeight: 'bold' }).text('Usuário:'),
                        new ElementBuilder('span')
                            .class('ui-badge', currentUser === 'admin' ? 'ui-badge-success' : (currentUser === 'operador' ? 'ui-badge-info' : 'ui-badge-secondary'))
                            .text(currentUser)
                    ])
            ])
            .appendTo(root.el);

        // 3. Seletor de Perfis Rápidos (Cards Interativos)
        const profileSelectorRow = new ElementBuilder('div')
            .style({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' });

        const profiles = [
            {
                id: 'visitante',
                title: '👤 Visitante (Guest)',
                role: 'VISITANTE',
                desc: 'Apenas visualização. Sem permissão de criar, editar ou excluir.',
                perms: ['products:view'],
                active: currentUser === 'visitante'
            },
            {
                id: 'operador',
                title: '👔 Operador de Estoque',
                role: 'OPERADOR',
                desc: 'Pode cadastrar e alterar produtos. Proibido excluir e ver financeiro.',
                perms: ['products:view', 'products:create', 'products:edit'],
                active: currentUser === 'operador'
            },
            {
                id: 'admin',
                title: '🛡️ Administrador Geral',
                role: 'ADMIN',
                desc: 'Acesso total e irrestrito a todas as telas e endpoints de negócio.',
                perms: ['* (Universal)'],
                active: currentUser === 'admin'
            }
        ];

        profiles.forEach(p => {
            new ElementBuilder('div')
                .style({
                    padding: '12px',
                    borderRadius: '8px',
                    border: p.active ? '2px solid #2563eb' : '1px solid var(--border-color, #e2e8f0)',
                    background: p.active ? 'rgba(37,99,235,0.06)' : 'var(--bg-card, #ffffff)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: p.active ? '0 4px 12px rgba(37,99,235,0.15)' : 'none'
                })
                .click(() => this.runAction('setProfile', p.id))
                .children([
                    new ElementBuilder('div').style({ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '4px' }).text(p.title),
                    new ElementBuilder('p').style({ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0 0 8px 0', minHeight: '34px' }).text(p.desc),
                    new ElementBuilder('div')
                        .style({ display: 'flex', gap: '4px', flexWrap: 'wrap' })
                        .children(p.perms.map(perm => new ElementBuilder('span').class('ui-badge', 'ui-badge-secondary').style({ fontSize: '0.7rem' }).text(perm)))
                ])
                .appendTo(profileSelectorRow.el);
        });

        profileSelectorRow.appendTo(root.el);

        // 4. Seção Híbrida: ElementBuilder vs Declarativa
        const demoSection = new ElementBuilder('div')
            .style({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' });

        // Coluna 1: Programática (ElementBuilder.requirePermission)
        const progCard = new ElementBuilder('div')
            .style({
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-card, #ffffff)'
            })
            .children([
                new ElementBuilder('h4')
                    .style({ margin: '0 0 8px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' })
                    .text('⚡ Programática (ElementBuilder.js)'),
                new ElementBuilder('p')
                    .style({ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0 0 12px 0' })
                    .text('Botões com .requirePermission() aplicam remoção definitiva do DOM ou desativação acessível:'),
                new ElementBuilder('div')
                    .style({ display: 'flex', flexDirection: 'column', gap: '8px' })
                    .children([
                        new ElementBuilder('button')
                            .class('ui-btn', 'ui-btn-primary')
                            .text('📝 Editar Dados (Requer products:edit)')
                            .requirePermission('products:edit', { behavior: 'disable', title: 'Requer permissão products:edit' })
                            .click(() => Desktop.notify("Ação 'Editar' disparada com sucesso!", "success")),

                        new ElementBuilder('button')
                            .class('ui-btn', 'ui-btn-danger')
                            .text('🗑️ Excluir Registro (Requer products:delete)')
                            .requirePermission('products:delete', { behavior: 'remove' }) // Some do DOM se não for permitido!
                            .click(() => Desktop.notify("Ação 'Excluir' disparada com sucesso!", "success")),

                        new ElementBuilder('button')
                            .class('ui-btn', 'ui-btn-secondary')
                            .text('📊 Relatório Fiscal (Requer audit:view)')
                            .requirePermission('audit:view', { behavior: 'disable', title: 'Requer permissão audit:view' })
                            .click(() => Desktop.notify("Relatório Fiscal aberto!", "info"))
                    ])
            ]);

        // Coluna 2: Declarativa (data-permission / data-auth-behavior)
        const declCard = new ElementBuilder('div')
            .style({
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-card, #ffffff)'
            });

        declCard.children([
            new ElementBuilder('h4')
                .style({ margin: '0 0 8px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' })
                .text('📋 Declarativa (HTML Attributes)'),
            new ElementBuilder('p')
                .style({ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', margin: '0 0 12px 0' })
                .text('Tags com [data-permission] e [data-auth-behavior] processadas automaticamente na janela:')
        ]);

        const declButtonsContainer = new ElementBuilder('div')
            .style({ display: 'flex', flexDirection: 'column', gap: '8px' })
            .html(`
                <button class="ui-btn ui-btn-success" data-permission="products:create">
                    ➕ Novo Produto (Requer products:create)
                </button>
                <button class="ui-btn ui-btn-danger" data-permission="products:delete" data-auth-behavior="remove">
                    ❌ Excluir Definitivo (Requer products:delete)
                </button>
                <button class="ui-btn ui-btn-warning" data-permission="financeiro:view" data-auth-behavior="disable">
                    💰 Módulo Tesouraria (Requer financeiro:view)
                </button>
            `);

        const btnCreate = declButtonsContainer.el.querySelector('[data-permission="products:create"]');
        if (btnCreate) btnCreate.onclick = () => Desktop.notify('Declarativo: Produto cadastrado!', 'success');

        const btnDelete = declButtonsContainer.el.querySelector('[data-permission="products:delete"]');
        if (btnDelete) btnDelete.onclick = () => Desktop.notify('Declarativo: Exclusão executada!', 'success');

        const btnFinance = declButtonsContainer.el.querySelector('[data-permission="financeiro:view"]');
        if (btnFinance) btnFinance.onclick = () => Desktop.notify('Declarativo: Tesouraria aberta!', 'info');

        declCard.children([declButtonsContainer]);

        progCard.appendTo(demoSection.el);
        declCard.appendTo(demoSection.el);
        demoSection.appendTo(root.el);

        // 5. Seção de Testes de Tentativas de Burla (F12 / DevTools)
        const testSection = new ElementBuilder('div')
            .style({
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-card, #ffffff)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            })
            .children([
                new ElementBuilder('h4')
                    .style({ margin: 0, fontSize: '0.95rem' })
                    .text('🧪 Laboratório de Defesa: Tentativas de Burla no DevTools'),
                new ElementBuilder('div')
                    .style({ display: 'flex', gap: '10px', flexWrap: 'wrap' })
                    .children([
                        new ElementBuilder('button')
                            .class('ui-btn', 'ui-btn-secondary')
                            .text('🚪 Forçar Abertura de Tela Restrita (Guard)')
                            .click(() => this.runAction('testRestrictedScreen')),

                        new ElementBuilder('button')
                            .class('ui-btn', 'ui-btn-danger')
                            .text('📡 Simular DELETE /api/products/1 no Backend')
                            .click(() => this.runAction('testBackendDelete'))
                    ]),
                new ElementBuilder('div')
                    .style({
                        padding: '10px',
                        borderRadius: '6px',
                        background: this.state.serverLogStatus === 'danger' ? '#fef2f2' : (this.state.serverLogStatus === 'success' ? '#f0fdf4' : '#f8fafc'),
                        border: `1px solid ${this.state.serverLogStatus === 'danger' ? '#fecaca' : (this.state.serverLogStatus === 'success' ? '#bbf7d0' : '#e2e8f0')}`,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        color: this.state.serverLogStatus === 'danger' ? '#991b1b' : (this.state.serverLogStatus === 'success' ? '#166534' : '#334155')
                    })
                    .text(this.state.serverLog)
            ]);

        testSection.appendTo(root.el);

        applySecurityPolicies(root.el);

        return root.el;
    }
};
