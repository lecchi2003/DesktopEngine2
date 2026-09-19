// screens/PainelFinanceiroRestritoScreen.js
// Tela de teste para validação de Guard de Permissão (Requer 'financeiro:view')
import { ElementBuilder } from '../ElementBuilder.js';
import { SecurityService } from '../core.js';

export default {
    id: "painel_financeiro_restrito",
    title: "Painel Financeiro Restrito",
    icon: "💰",
    permission: "financeiro:view", // <-- Exige a permissão para abrir!
    width: 620,
    height: 420,
    singleInstance: true,

    view() {
        return new ElementBuilder('div')
            .style({
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'var(--bg-card, #ffffff)',
                height: '100%',
                boxSizing: 'border-box'
            })
            .children([
                new ElementBuilder('div')
                    .style({
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                        color: '#166534'
                    })
                    .children([
                        new ElementBuilder('h3').style({ margin: '0 0 6px 0' }).text('🔓 Acesso Autorizado ao Módulo Financeiro'),
                        new ElementBuilder('p').style({ margin: 0, fontSize: '0.85rem' }).text('Esta janela só pode ser instanciada e visualizada por usuários que possuem a permissão "financeiro:view" ou papel "ADMIN".')
                    ]),
                new ElementBuilder('div')
                    .style({
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px'
                    })
                    .children([
                        new ElementBuilder('div').class('ui-card').style({ padding: '12px', textAlign: 'center', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px' }).children([
                            new ElementBuilder('div').style({ fontSize: '0.75rem', color: 'gray' }).text('RECEITA MENSAL'),
                            new ElementBuilder('div').style({ fontSize: '1.2rem', fontWeight: 'bold', color: '#16a34a' }).text('R$ 148.950,00')
                        ]),
                        new ElementBuilder('div').class('ui-card').style({ padding: '12px', textAlign: 'center', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px' }).children([
                            new ElementBuilder('div').style({ fontSize: '0.75rem', color: 'gray' }).text('DESPESAS OPERACIONAIS'),
                            new ElementBuilder('div').style({ fontSize: '1.2rem', fontWeight: 'bold', color: '#dc2626' }).text('R$ 42.310,00')
                        ]),
                        new ElementBuilder('div').class('ui-card').style({ padding: '12px', textAlign: 'center', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '6px' }).children([
                            new ElementBuilder('div').style({ fontSize: '0.75rem', color: 'gray' }).text('SALDO EM CONTA'),
                            new ElementBuilder('div').style({ fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb' }).text('R$ 106.640,00')
                        ])
                    ]),
                new ElementBuilder('p')
                    .style({ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' })
                    .text('Tentativas de forçar a abertura desta tela sem autorização via DevTools console são interceptadas e impedidas pelo Guard antes de qualquer montagem no DOM.')
            ])
            .el;
    }
};
