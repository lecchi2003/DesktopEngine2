// screens/ModernHybridShowcaseScreen.js
// Autor: Gildasio Lecchi Cravo
import { Framework, BaseComponent } from '../core.js?v=3';
import { Desktop } from '../desktop.js?v=3';
import { UI, ElementBuilder } from '../ElementBuilder.js?v=3';

/**
 * Exemplo de Extensibilidade: Criação de um Componente Customizado herdando de BaseComponent.
 * Possui estado reativo isolado, listeners de eventos e ciclo de vida próprio.
 */
class MetricCounterWidget extends BaseComponent {
    constructor(props = {}) {
        super(props);
        this.state = {
            count: props.initialValue || 100,
            color: props.color || '#3b82f6'
        };
    }

    increment() {
        this.setState(s => ({ count: s.count + 1 }));
        this.emit('change', this.state.count);
    }

    decrement() {
        this.setState(s => ({ count: Math.max(0, s.count - 1) }));
        this.emit('change', this.state.count);
    }

    render() {
        return UI.div()
            .class('metric-counter-card')
            .style({
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                margin: '6px 0'
            })
            .children([
                UI.div().children([
                    UI.div().text(this.props.title || 'Métrica Personalizada').style({ fontSize: '12px', opacity: '0.75' }),
                    UI.h2(this.state.count).style({ margin: '2px 0 0 0', color: this.state.color, fontSize: '24px' })
                ]),
                UI.div().style({ display: 'flex', gap: '6px' }).children([
                    UI.button('➖', () => this.decrement()).class('ui-btn ui-btn-secondary').style({ minWidth: '32px', padding: '4px 8px' }),
                    UI.button('➕', () => this.increment()).class('ui-btn ui-btn-primary').style({ minWidth: '32px', padding: '4px 8px' })
                ])
            ])
            .build();
    }
}

// Registra o componente no catálogo global do framework.
// Automaticamente o ElementBuilder disponibiliza o atalho UI.MetricCounter(...)!
Framework.defineComponent('MetricCounter', MetricCounterWidget);

export default {
    title: "Showcase: Framework Híbrido V2.0 (Signals + ElementBuilder)",
    icon: "⚡",
    width: 820,
    height: 620,
    minWidth: 420,
    minHeight: 380,
    status: "Framework V2.0 Ativo • Signals Nativos • CSS Modular",

    // Estado reativo da Janela
    state: {
        projetoNome: "Desktop Engine V2.0",
        categoria: "Framework Web",
        ativo: true,
        notificacoes: true,
        metaVendas: 250,
        volume: 75,
        prioridade: "Alta",
        feedbackMsg: "Pronto para produção."
    },

    // Ações assíncronas (middlewares)
    actions: {
        salvarDados: [async (ctx) => {
            ctx.instance.setStatus("Processando e salvando...");
            await new Promise(r => setTimeout(r, 400));
            Desktop.notify(`Configuração salva: "${ctx.state.projetoNome}" [${ctx.state.categoria}]`, "success");
            ctx.instance.setStatus("Salvo com sucesso!");
        }],
        resetar: [async (ctx) => {
            ctx.state.projetoNome = "Desktop Engine V2.0";
            ctx.state.categoria = "Framework Web";
            ctx.state.metaVendas = 250;
            ctx.state.volume = 75;
            Desktop.notify("Valores restaurados ao padrão!", "info");
        }],
        alternarModoMobile: [async (ctx) => {
            Desktop.toggleMobileMode();
        }]
    },

    // Construção Híbrida da View utilizando a nova API fluente UI / ElementBuilder
    // Notar que NENHUM componente abaixo exige { instance: this }!
    view() {
        return UI.div()
            .class('p-3 flex-col gap-3')
            .children([
                // Cabeçalho de Destaque da Funcionalidade
                UI.card({
                    title: "🚀 DesktopEngine V2.0 - The Next-Gen Architecture",
                    children: [
                        UI.p("Esta tela demonstra os pilares da V2.0: **Signals Nativos (TC39/Preact pattern)**, **API Fluente (`ElementBuilder.js`)**, **CSS Modular Sob Demanda** e **Desktop-First Touch**."),
                        UI.row([
                            UI.badge("Signals Atômicos", "success"),
                            UI.badge("CSS Modular (~45KB)", "primary"),
                            UI.badge("Desktop-First Touch", "info"),
                            UI.badge("Zero instance: this", "warning")
                        ]).style({ gap: '8px', marginTop: '6px' })
                    ]
                }),

                // Demonstração Atômica de Signals
                UI.card("⚡ Demonstração de Reatividade Atômica (Signals Nativos)", [
                    UI.p("Modificações em Signals atualizam cirurgicamente apenas o nó de texto correspondente no DOM, sem tocar no restante da janela e sem re-render:"),
                    UI.row([
                        UI.col([
                            UI.label("Valor do Signal em Tempo Real:"),
                            UI.div().children([
                                UI.span("Meta Atual: ").style({ opacity: "0.8" }),
                                UI.span().text(this.signals.metaVendas).style({ color: "#10b981", fontSize: "24px", fontWeight: "bold" })
                            ])
                        ]),
                        UI.col([
                            UI.label("Ações no Signal:"),
                            UI.row([
                                UI.button("➕ Adicionar 10", () => { this.signals.metaVendas.value += 10; }).class("ui-btn-primary"),
                                UI.button("➖ Reduzir 10", () => { this.signals.metaVendas.value = Math.max(0, this.signals.metaVendas.value - 10); }).class("ui-btn-secondary")
                            ]).style({ gap: '8px', marginTop: '4px' })
                        ])
                    ])
                ]),

                // Grid com Formulário Fluente e Widgets
                UI.grid(2, [
                    // Coluna 1: Formulário construído com UI Fluente sem passar instance
                    UI.card("📝 Formulário com Reatividade Implícita", [
                        UI.input("Nome do Projeto", "projetoNome"),
                        UI.select({
                            label: "Categoria do Sistema",
                            bind: "categoria",
                            options: [
                                { label: "Framework Web", value: "Framework Web" },
                                { label: "ERP Corporativo", value: "ERP Corporativo" },
                                { label: "Dashboard Analítico", value: "Dashboard Analítico" }
                            ]
                        }),
                        UI.row([
                            UI.col([UI.checkbox("Projeto Ativo", "ativo")]),
                            UI.col([UI.toggle("Notificações Push", "notificacoes")])
                        ]).style({ marginTop: '8px' }),
                        UI.slider({
                            label: "Nível de Otimização",
                            bind: "volume",
                            min: 0,
                            max: 100,
                            step: 5
                        }),
                        UI.row([
                            UI.button("Salvar Configurações", "salvarDados").class('ui-btn-primary'),
                            UI.button("Restaurar", "resetar").class('ui-btn-secondary')
                        ]).style({ gap: '8px', marginTop: '12px' })
                    ]),

                    // Coluna 2: Componente Customizado Extensível & Controle de Layout
                    UI.card("🧩 Componentes Estendidos & Visualização", [
                        UI.div().class('mb-2').text("Componente Customizado (BaseComponent):").style({ fontWeight: '600', fontSize: '13px' }),
                        
                        // Chamada direta do componente registrado via UI.custom / UI.MetricCounter!
                        UI.custom("MetricCounter", {
                            title: "Usuários Simultâneos Ativos",
                            initialValue: 1420,
                            color: "#10b981"
                        }),
                        UI.custom("MetricCounter", {
                            title: "Requisições por Segundo (RPS)",
                            initialValue: 88,
                            color: "#6366f1"
                        }),

                        UI.hr().style({ margin: '14px 0', opacity: '0.2' }),

                        UI.div().text("Visualização em Dispositivos Móveis:").style({ fontWeight: '600', fontSize: '13px', marginBottom: '6px' }),
                        UI.p("O DesktopEngine mantém a experiência autêntica de janelas de desktop mesmo em telas touch móveis:"),
                        UI.button("📱 / 🖥️ Alternar Modo Mobile/Desktop", "alternarModoMobile")
                            .class('ui-btn ui-btn-info')
                            .style({ width: '100%', marginTop: '6px' })
                    ])
                ]),

                // Rodapé de Resumo em Tempo Real
                UI.card("📊 Resumo Reativo em Tempo Real", [
                    UI.row([
                        UI.col([
                            UI.label("Status Geral:"),
                            UI.badge(this.state.ativo ? "Online & Operacional" : "Em Manutenção", this.state.ativo ? "success" : "danger")
                        ]),
                        UI.col([
                            UI.label("Otimização Atual:"),
                            UI.progressBar(this.state.volume, 100)
                        ])
                    ])
                ])
            ])
            .build();
    }
};
