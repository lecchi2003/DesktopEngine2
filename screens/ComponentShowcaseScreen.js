// screens/ComponentShowcaseScreen.js
import { Desktop } from '../desktop.js';
import {
    createElement, Row, Col, Card, Grid, Button, Modal, Drawer,
    Breadcrumbs, Stepper, Slider, RadioGroup, Autocomplete, Alert, Spinner,
    Toast, Tooltip, Avatar, Carousel, Skeleton, Accordion, Select
} from '../ui.js';

export default {
    title: "Showcase de Componentes UI",
    icon: "✨",
    width: 880,
    height: 640,
    singleInstance: true,
    state: {
        step: 0,
        volume: 50,
        laf: Desktop.getLookAndFeel ? Desktop.getLookAndFeel() : "default",
        pais: ["Brasil"],
        menuLateral: false
    },
    actions: {
        nextStep: [async (ctx) => {
            if (ctx.state.step < 3) ctx.state.step++;
            Toast({ message: "Avançou para o passo " + (ctx.state.step + 1), type: "info" });
        }],
        prevStep: [async (ctx) => {
            if (ctx.state.step > 0) ctx.state.step--;
        }],
        toggleDrawer: [async (ctx) => {
            ctx.state.menuLateral = !ctx.state.menuLateral;
        }],
        salvarTudo: [async (ctx) => {
            Toast({ message: "Dados do showcase salvos no sistema!", type: "success" });
        }],
        abrirModalLocal: [async (ctx) => {
            const modal = (ctx.instance && typeof ctx.instance.openModal === 'function')
                ? ctx.instance.openModal({
                    title: "Modal Local",
                    children: (m) => [
                        createElement("p", "", ["Este modal está restrito aos limites da janela."]),
                        Button({ text: "Fechar", onClick: () => m.close() })
                    ]
                })
                : Modal({
                    title: "Modal Local",
                    instance: ctx.instance,
                    children: (m) => [
                        createElement("p", "", ["Este modal está restrito aos limites da janela."]),
                        Button({ text: "Fechar", onClick: () => m.close() })
                    ]
                });
        }],
        abrirModalGlobal: [async (ctx) => {
            const modal = Desktop.openModal({
                title: "Modal Global",
                children: (m) => [
                    createElement("p", "", ["Este modal se sobrepõe a TODAS as janelas e ao Desktop."]),
                    Button({ text: "Fechar", onClick: () => m.close() })
                ]
            });
        }]
    },
    view() {
        return createElement("div", "", [
            Drawer({
                bind: "menuLateral", side: "left" content: [
                    createElement("h3", "", ["Menu do Showcase"]),
                    createElement("p", "", ["Este é um painel off-canvas integrado ao state."])
                ]
            }),
            Breadcrumbs({
                items: [
                    { label: "Módulos", action: () => Toast({ message: "Você clicou no breadcrumb", type: "info" }) },
                    { label: "Showcase UI" }
                ]
            }),

            Row({
                children: [
                    Col({
                        style: "flex: 1;", children: [
                            createElement("h2", "", ["Painel de Elementos Visuais"]),
                        ]
                    }),
                    Row({
                        style: "gap: 8px;", children: [
                            Button({ text: "Modal Local", onClick: "abrirModalLocal" }),
                            Button({ text: "Modal Global", onClick: "abrirModalGlobal" variant: "danger" }),
                            Button({ text: "Abrir Drawer Esq.", onClick: "toggleDrawer" })
                        ]
                    })
                ]
            }),

            Stepper({ steps: ["Configuração", "Preferências", "Visual", "Confirmação"], currentStep: this.state.step }),

            Row({
                children: [
                    // Coluna Esquerda
                    Col({
                        style: "flex: 1; margin-right: 16px;", children: [
                            Card({
                                title: "Formulários & Temas do Sistema", children: [
                                    Select({
                                        label: "Look and Feel do Sistema",
                                        bind: "laf"
                                        options: (() => {
                                            const all = Desktop.getAvailableLookAndFeels ? Desktop.getAvailableLookAndFeels() : [];
                                            const categories = {};
                                            all.forEach(l => {
                                                if (!categories[l.category]) categories[l.category] = [];
                                                categories[l.category].push(l);
                                            });
                                            const result = [];
                                            Object.entries(categories).forEach(([cat, items]) => {
                                                result.push({ label: `─── ${cat} ───`, value: "__sep__", disabled: true });
                                                items.forEach(l => result.push({ label: `${l.icon} ${l.label}`, value: l.id }));
                                            });
                                            return result;
                                        })(),
                                        onChange: (val) => {
                                            if (val === "__sep__") return;
                                            if (Desktop.setLookAndFeel) Desktop.setLookAndFeel(val);
                                            Toast({ message: `LaF alterado: ${val}`, type: "info" });
                                        }
                                    }),
                                    Slider({ label: "Nível de Intensidade", bind: "volume", min: 0, max: 100 }),
                                    Autocomplete({ label: "Países de Atuação", bind: "pais", multiple: true, options: ["Brasil", "Estados Unidos", "Alemanha", "França", "Itália", "Japão"] })
                                ]
                            }),

                            createElement("br", "", []),

                            Card({
                                title: "Feedback e Notificações", children: [
                                    Alert({ text: "Esta é uma demonstração de todos os novos componentes reunidos.", variant: "success" }),
                                    Row({
                                        style: "align-items: center; gap: 12px;", children: [
                                             Spinner({ size: "20px", color: "var(--btn-primary)" }),
                                             createElement("span", "", ["Carregando recursos em segundo plano..."])
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),

                    // Coluna Direita
                    Col({
                        style: "flex: 1;", children: [
                            Card({
                                title: "Componentes Visuais", children: [
                                    Row({
                                        style: "align-items: center; gap: 16px; margin-bottom: 16px;", children: [
                                            Tooltip({
                                                position: "top", content: "Administrador Online", children:
                                                    Avatar({ initials: "AD", status: "online", size: 48 })
                                            }),
                                            Col({
                                                children: [
                                                    createElement("strong", "", ["Admin System"]),
                                                    createElement("span", "text-secondary", ["Nível: Acesso Total"])
                                                ]
                                            })
                                        ]
                                    }),

                                    createElement("label", "", ["Destaques Recentes (Carousel)"]),
                                    Carousel({
                                        height: "120px",
                                        controlsPosition: "bottom-center",
                                        prevControl: Button({ text: "◀" }),
                                        nextControl: Button({ text: "▶" }),
                                        items: [
                                            createElement("div", "p-3 text-center", ["Destaque 1"]),
                                            createElement("div", "p-3 text-center", ["Destaque 2"]),
                                            createElement("div", "p-3 text-center", ["Destaque 3"]),
                                            createElement("div", "p-3 text-center", ["Destaque 4"])
                                        ]
                                    }),

                                    createElement("br", "", []),
                                    createElement("label", "", ["Carregamento Simulado (Skeleton)"]),
                                    Skeleton({ width: "100%", height: "40px", shape: "rect" })
                                ]
                            }),

                            createElement("br", "", []),

                            Card({
                                title: "Seções Dinâmicas", children: [
                                    Accordion({ items: [
                                            { title: "Mais Opções", content: "Aqui poderiam existir sub-configurações." },
                                            { title: "Ajuda do Sistema", content: "Entre em contato com o suporte para mais informações." }
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),

            createElement("br", "", []),
            Row({
                style: "justify-content: space-between;", children: [
                    Button({ text: "Passo Anterior", onClick: "prevStep" }),
                    Row({
                        style: "gap: 8px;", children: [
                            Button({ text: "Avançar Passo", onClick: "nextStep" }),
                            Button({ text: "Concluir Setup", onClick: "salvarTudo" variant: "primary" })
                        ]
                    })
                ]
            })
        ]);
    }
};
