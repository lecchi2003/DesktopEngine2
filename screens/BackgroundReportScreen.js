// screens/BackgroundReportScreen.js
import { Desktop } from '../desktop.js';
import {
    createElement, Row, Col, Card, Button, Input, Select, ProgressBar, Badge, Toast, Table, Modal
} from '../ui.js';

export default {
    title: "Central de Relatórios & Tarefas em Segundo Plano",
    icon: "📊",
    width: 820,
    height: 580,
    singleInstance: false,
    state: {
        tipoRelatorio: "Vendas e Faturamento Consolidado",
        volumeRegistros: 50000,
        metodoExecucao: "worker", // 'worker' ou 'async'
        isProcessando: false,
        isPausado: false,
        progresso: 0,
        statusTexto: "Aguardando início...",
        registrosProcessados: 0,
        tempoDecorrido: 0,
        relatoriosGerados: [],
        workerRef: null
    },

    onMount() {
        this.setStatus("Pronto para gerar tarefas em segundo plano.");
    },

    onDestroy() {
        this.interromperWorker();
    },

    interromperWorker() {
        if (this.state.workerRef) {
            this.state.workerRef.terminate();
            this.state.workerRef = null;
        }
    },

    // 1. INICIAR PROCESSAMENTO (Web Worker ou Async Chunking)
    iniciarGeracao() {
        if (this.state.isProcessando) return;

        this.state.isProcessando = true;
        this.state.isPausado = false;
        this.state.progresso = 0;
        this.state.registrosProcessados = 0;
        this.state.tempoDecorrido = 0;
        this.state.statusTexto = "Iniciando motor de cálculo...";

        const startTime = Date.now();
        const total = parseInt(this.state.volumeRegistros) || 50000;
        const metodo = this.state.metodoExecucao || "worker";

        if (metodo === "worker") {
            // MODO A: WEB WORKER (Thread de CPU Dedicada em Segundo Plano)
            this.executarViaWebWorker(total, startTime);
        } else {
            // MODO B: ASYNC ETAPAS / CHUNKING (Simulação I/O de API)
            this.executarViaAsyncChunking(total, startTime);
        }

        Toast({
            message: `Processamento em segundo plano iniciado (${metodo === 'worker' ? 'Web Worker' : 'Async Stream'})!`,
            type: "info"
        });
    },

    // EXECUÇÃO VIA WEB WORKER
    executarViaWebWorker(total, startTime) {
        const workerCode = `
            self.onmessage = function(e) {
                const { total } = e.data;
                const batchSize = Math.max(50, Math.floor(total / 100));
                let processed = 0;
                let checksum = 0;

                for (let i = 0; i < total; i++) {
                    // Cálculo matemático intencional para simular análise de dados pesada
                    checksum += Math.sqrt(i * 1.5) * Math.sin(i);
                    processed++;

                    if (processed % batchSize === 0 || processed === total) {
                        const progress = Math.min(100, Math.floor((processed / total) * 100));
                        self.postMessage({
                            type: 'progress',
                            processed: processed,
                            progress: progress
                        });
                    }
                }

                self.postMessage({
                    type: 'complete',
                    processed: processed,
                    checksum: checksum.toFixed(2)
                });
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        // [SEC-005] Revogar a URL imediatamente após criar o Worker para evitar memory leak
        const _workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(_workerUrl);
        URL.revokeObjectURL(_workerUrl);
        this.state.workerRef = worker;

        worker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'progress') {
                this.state.progresso = data.progress;
                this.state.registrosProcessados = data.processed;
                this.state.tempoDecorrido = ((Date.now() - startTime) / 1000).toFixed(1);
                this.state.statusTexto = `Processando com Web Worker (${data.progress}% - ${data.processed.toLocaleString('pt-BR')} registros)`;
                this.setStatus(`Worker: ${data.progress}% processado...`);
            } else if (data.type === 'complete') {
                this.concluirRelatorio(total, startTime, "Web Worker (Thread Isolada)");
            }
        };

        worker.postMessage({ total });
    },

    // EXECUÇÃO VIA ASYNC CHUNKING
    async executarViaAsyncChunking(total, startTime) {
        const lotes = 25;
        const registrosPorLote = Math.floor(total / lotes);

        for (let i = 1; i <= lotes; i++) {
            if (!this.state.isProcessando) break; // Cancelado

            while (this.state.isPausado) {
                await new Promise(r => setTimeout(r, 200));
            }

            await new Promise(r => setTimeout(r, 120)); // Delay fluido para simular rede
            
            const processados = Math.min(total, i * registrosPorLote);
            const progress = Math.min(100, Math.floor((i / lotes) * 100));

            this.state.progresso = progress;
            this.state.registrosProcessados = processados;
            this.state.tempoDecorrido = ((Date.now() - startTime) / 1000).toFixed(1);
            this.state.statusTexto = `Transferindo lote ${i} de ${lotes} da API (${processados.toLocaleString('pt-BR')} registros)`;
            this.setStatus(`Async: ${progress}% concluído...`);
        }

        if (this.state.isProcessando) {
            this.concluirRelatorio(total, startTime, "Async Stream / API");
        }
    },

    concluirRelatorio(total, startTime, metodo) {
        this.state.isProcessando = false;
        this.state.progresso = 100;
        this.state.registrosProcessados = total;
        const tempoFinal = ((Date.now() - startTime) / 1000).toFixed(1);
        this.state.statusTexto = `Concluído em ${tempoFinal}s (${total.toLocaleString('pt-BR')} registros)`;
        this.setStatus(`Relatório concluído com sucesso.`);

        const novoRelatorio = {
            id: `#REL-${Math.floor(1000 + Math.random() * 9000)}`,
            titulo: this.state.tipoRelatorio,
            registros: total.toLocaleString('pt-BR'),
            duracao: `${tempoFinal}s`,
            metodo: metodo,
            dataHora: new Date().toLocaleTimeString()
        };

        this.state.relatoriosGerados = [novoRelatorio, ...this.state.relatoriosGerados];

        Desktop.notify(`📊 ${this.state.tipoRelatorio} finalizado com sucesso em ${tempoFinal}s!`, "success");
    },

    cancelarProcessamento() {
        this.interromperWorker();
        this.state.isProcessando = false;
        this.state.isPausado = false;
        this.state.statusTexto = "Geração cancelada pelo usuário.";
        this.setStatus("Tarefa cancelada.");
        Toast({ message: "Processamento em segundo plano cancelado.", type: "warning" });
    },

    view() {
        const tiposDisponiveis = [
            "Vendas e Faturamento Consolidado",
            "Auditoria de Logs do Sistema",
            "Simulação de Risco de Crédito (Monte Carlo)",
            "Exportação Massiva de Produtos e Estoque"
        ];

        const volumesDisponiveis = [
            { label: "10.000 linhas", valor: 10000 },
            { label: "50.000 linhas", valor: 50000 },
            { label: "200.000 linhas", valor: 200000 },
            { label: "1.000.000 linhas (Big Data)", valor: 1000000 }
        ];

        const metodosDisponiveis = [
            { label: "⚡ Web Worker (Thread Separada)", valor: "worker" },
            { label: "🌐 Async Chunking (Simulação API)", valor: "async" }
        ];

        return createElement("div", "flex-col", [
            // Painel de Configuração da Tarefa
            Card({
                title: "⚙️ Parâmetros da Tarefa em Segundo Plano",
                children: [
                    Row({
                        style: "gap: 12px; align-items: flex-end; flex-wrap: wrap;",
                        children: [
                            // 1. Tipo de Relatório
                            createElement("div", { style: "flex: 2; min-width: 200px;" }, [
                                createElement("label", ["Tipo de Relatório / ETL:"]),
                                createElement("select", {
                                    className: "filter-input",
                                    disabled: this.state.isProcessando,
                                    onchange: (e) => { this.state.tipoRelatorio = e.target.value; }
                                }, tiposDisponiveis.map(tipo => {
                                    return createElement("option", {
                                        value: tipo,
                                        selected: this.state.tipoRelatorio === tipo
                                    }, [tipo]);
                                }))
                            ]),

                            // 2. Volume de Registros
                            createElement("div", { style: "flex: 1; min-width: 140px;" }, [
                                createElement("label", ["Volume de Registros:"]),
                                createElement("select", {
                                    className: "filter-input",
                                    disabled: this.state.isProcessando,
                                    onchange: (e) => { this.state.volumeRegistros = parseInt(e.target.value); }
                                }, volumesDisponiveis.map(v => {
                                    return createElement("option", {
                                        value: String(v.valor),
                                        selected: this.state.volumeRegistros === v.valor
                                    }, [v.label]);
                                }))
                            ]),

                            // 3. Método de Execução
                            createElement("div", { style: "flex: 1.2; min-width: 160px;" }, [
                                createElement("label", ["Modo de Concorrência:"]),
                                createElement("select", {
                                    className: "filter-input",
                                    disabled: this.state.isProcessando,
                                    onchange: (e) => { this.state.metodoExecucao = e.target.value; }
                                }, metodosDisponiveis.map(m => {
                                    return createElement("option", {
                                        value: m.valor,
                                        selected: this.state.metodoExecucao === m.valor
                                    }, [m.label]);
                                }))
                            ]),

                            // 4. Botões de Ação
                            Row({
                                style: "gap: 6px; margin-bottom: 2px;",
                                children: [
                                    Button({
                                        text: this.state.isProcessando ? "Executando..." : "▶️ Iniciar Geração",
                                        variant: "primary",
                                        disabled: this.state.isProcessando,
                                        onClick: () => this.iniciarGeracao()
                                    }),
                                    this.state.isProcessando ? Button({
                                        text: "⏹️ Cancelar",
                                        variant: "danger",
                                        onClick: () => this.cancelarProcessamento()
                                    }) : null
                                ]
                            })
                        ]
                    })
                ]
            }),

            // Painel de Monitoramento em Tempo Real
            Card({
                title: "📈 Monitor de Execução em Segundo Plano",
                style: "margin-top: 10px;",
                children: [
                    Row({
                        style: "justify-content: space-between; align-items: center; margin-bottom: 8px;",
                        children: [
                            createElement("div", [
                                createElement("b", [this.state.statusTexto])
                            ]),
                            Row({
                                style: "gap: 8px; align-items: center;",
                                children: [
                                    Badge({
                                        text: this.state.isProcessando ? "Em Execução" : (this.state.progresso === 100 ? "Concluído" : "Pronto"),
                                        variant: this.state.isProcessando ? "warning" : (this.state.progresso === 100 ? "success" : "primary")
                                    }),
                                    createElement("span", "text-secondary", [
                                        `Tempo: ${this.state.tempoDecorrido}s | Registros: ${this.state.registrosProcessados.toLocaleString('pt-BR')}`
                                    ])
                                ]
                            })
                        ]
                    }),
                    ProgressBar({
                        value: this.state.progresso,
                        max: 100
                    })
                ]
            }),

            // Histórico de Relatórios Gerados
            createElement("div", { style: "flex: 1; display: flex; flex-direction: column; overflow: hidden; margin-top: 10px;" }, [
                createElement("h4", { style: "margin: 0 0 6px 0;" }, ["📁 Relatórios Prontos para Download / Visualização:"]),
                createElement("div", { style: "flex: 1; overflow-y: auto; border: 1px solid var(--win-border, #cbd5e1); border-radius: 6px; background: rgba(0,0,0,0.02);" }, [
                    this.state.relatoriosGerados.length === 0 ? createElement("div", { style: "padding: 20px; text-align: center; color: var(--text-muted, #64748b);" }, [
                        "Nenhum relatório gerado ainda nesta sessão. Clique em 'Iniciar Geração' acima para testar o processamento em background!"
                    ]) : createElement("table", "ui-table", [
                        createElement("thead", [
                            createElement("tr", [
                                createElement("th", ["Código"]),
                                createElement("th", ["Título do Relatório"]),
                                createElement("th", ["Volume"]),
                                createElement("th", ["Duração"]),
                                createElement("th", ["Motor de Execução"]),
                                createElement("th", ["Hora"]),
                                createElement("th", ["Ações"])
                            ])
                        ]),
                        createElement("tbody", this.state.relatoriosGerados.map(rel => {
                            return createElement("tr", [
                                createElement("td", [createElement("b", [rel.id])]),
                                createElement("td", [rel.titulo]),
                                createElement("td", [`${rel.registros} linhas`]),
                                createElement("td", [rel.duracao]),
                                createElement("td", [createElement("span", "badge", [rel.metodo])]),
                                createElement("td", [rel.dataHora]),
                                createElement("td", [
                                    Button({
                                        text: "Visualizar",
                                        variant: "default",
                                        onClick: () => {
                                            Modal({
                                                title: `Visualizador: ${rel.titulo} (${rel.id})`,
                                                instance: this,
                                                children: [
                                                    createElement("p", [
                                                        `Relatório processado com sucesso em `, createElement("b", [rel.duracao]),
                                                        ` com total de `, createElement("b", [rel.registros]), ` registros processados via `,
                                                        createElement("code", [rel.metodo]), `.`
                                                    ]),
                                                    createElement("div", "ui-card", [
                                                        createElement("p", { style: "font-family: monospace; font-size: 11px;" }, [
                                                            `STATUS: OK | CODE: 200 | CHECKSUM: 0x89F4B | ARQUIVO: ${rel.id.toLowerCase().replace('#', '')}.csv | ENCODE: UTF-8`
                                                        ])
                                                    ])
                                                ]
                                            });
                                        }
                                    })
                                ])
                            ]);
                        }))
                    ])
                ])
            ])
        ]);
    }
};
