// screens/ProductsCrudScreen.js
import { Desktop } from '../desktop.js';
import {
    createElement, Row, Col, Card, Button, Input, Textarea, Table, Toast, Modal
} from '../ui.js';

// Base mock inicial para quando o servidor Python não estiver ligado ainda
const MOCK_DATA = [
    { id: 1, name: "Notebook Dell XPS 15", category: "Eletrônicos", price: 8990.00, stock: 14, description: "Intel i7, 32GB RAM, SSD 1TB NVMe" },
    { id: 2, name: "Monitor UltraWide 34\" LG", category: "Monitores", price: 2850.50, stock: 22, description: "Resolução WQHD 144Hz IPS" },
    { id: 3, name: "Teclado Mecânico RGB Pro", category: "Periféricos", price: 480.00, stock: 45, description: "Switches Hot-swappable Gateron Red" },
    { id: 4, name: "Mouse Ergonômico Vertical", category: "Periféricos", price: 260.00, stock: 30, description: "Sensor óptico 4000 DPI, Conexão Wireless" },
    { id: 5, name: "Cadeira Ergonômica Mesh", category: "Mobiliário", price: 1450.00, stock: 8, description: "Apoio lombar 3D e braços articulados" }
];

export default {
    title: "Gerenciador de Produtos (API Python CRUD)",
    icon: "🛍️",
    width: 960,
    height: 640,
    singleInstance: false,
    status: "Conectando à API Python...",
    state: {
        apiUrl: "http://localhost:8080",
        username: "admin",
        password: "admin123",
        authHeader: "Basic " + btoa("admin:admin123"),
        isAuthenticated: true,
        isMockMode: false,
        serverStatus: "checking", // "online", "offline", "mock"
        products: [],
        searchQuery: "",
        selectedCategory: "all",
        isLoading: false
    },
    menubar: [
        {
            label: "Operações",
            icon: "📁",
            items: [
                {
                    label: "Novo Produto...",
                    icon: "➕",
                    shortcut: "Ctrl+N",
                    action: (inst) => inst.openProductModal()
                },
                {
                    label: "Atualizar Lista",
                    icon: "🔄",
                    shortcut: "Ctrl+R",
                    action: (inst) => inst.fetchProducts()
                },
                "separator",
                {
                    label: "Exportar Dados (JSON)",
                    icon: "💾",
                    action: (inst) => {
                        const blob = new Blob([JSON.stringify(inst.state.products, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `produtos_${Date.now()}.json`;
                        a.click();
                        Toast({ message: "Exportação concluída!", type: "success" });
                    }
                },
                "separator",
                {
                    label: "Fechar Janela",
                    icon: "❌",
                    action: (inst) => inst.close()
                }
            ]
        },
        {
            label: "API & Conexão",
            icon: "🌐",
            items: [
                {
                    label: "Testar Conexão (localhost:8080)",
                    icon: "🔌",
                    action: (inst) => inst.checkApiHealth(true)
                },
                {
                    label: "Alternar para Modo Mock Local",
                    icon: "🎭",
                    action: (inst) => {
                        inst.state.isMockMode = !inst.state.isMockMode;
                        if (inst.state.isMockMode) {
                            inst.state.serverStatus = "mock";
                            inst.state.products = [...MOCK_DATA];
                            inst.setStatus("Modo Mock Local ativado.");
                            Toast({ message: "Modo Mock ativado (sem backend).", type: "info" });
                        } else {
                            inst.checkApiHealth(true);
                        }
                    }
                },
                {
                    label: "Configurar URL da API...",
                    icon: "⚙️",
                    action: (inst) => inst.openSettingsModal()
                }
            ]
        },
        {
            label: "Autenticação",
            icon: "🔐",
            items: [
                {
                    label: "Alterar Credenciais Basic Auth...",
                    icon: "🔑",
                    action: (inst) => inst.openLoginModal()
                },
                {
                    label: "Desconectar (Logout)",
                    icon: "🚪",
                    action: (inst) => {
                        inst.state.isAuthenticated = false;
                        inst.state.authHeader = "";
                        inst.state.products = [];
                        inst.setStatus("Desconectado.");
                        Toast({ message: "Logout realizado com sucesso.", type: "warning" });
                    }
                }
            ]
        },
        {
            label: "Ajuda",
            icon: "❓",
            items: [
                {
                    label: "Como rodar a API Python",
                    icon: "🐍",
                    action: (inst) => inst.openHelpModal()
                },
                {
                    label: "Documentação da API REST",
                    icon: "📚",
                    action: () => window.open("docs.html#api-python", "_blank")
                }
            ]
        }
    ],

    onMount() {
        this.checkApiHealth();
    },

    async checkApiHealth(notify = false) {
        if (this.state.isMockMode) {
            this.state.serverStatus = "mock";
            this.setStatus("🟢 Modo Mock Local Ativo");
            return;
        }

        try {
            this.setStatus("Verificando servidor Python...");
            const res = await fetch(`${this.state.apiUrl}/api/health`, { method: "GET" });
            if (res.ok) {
                this.state.serverStatus = "online";
                this.setStatus("🟢 API Python Online (" + this.state.apiUrl + ")");
                if (notify) Toast({ message: "API Python está online e respondendo!", type: "success" });
                this.fetchProducts();
            } else {
                throw new Error("Status " + res.status);
            }
        } catch (err) {
            this.state.serverStatus = "offline";
            this.state.products = [...MOCK_DATA];
            this.setStatus("🟡 Backend Offline - Usando Dados Mock Locais");
            if (notify) {
                Toast({
                    message: "API Python offline. Execute 'python api.py' no terminal.",
                    type: "warning"
                });
            }
        }
    },

    async fetchProducts() {
        if (this.state.isMockMode || this.state.serverStatus === "offline") {
            let list = [...MOCK_DATA];
            if (this.state.searchQuery) {
                const q = this.state.searchQuery.toLowerCase();
                list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
            }
            if (this.state.selectedCategory !== "all") {
                list = list.filter(p => p.category === this.state.selectedCategory);
            }
            this.state.products = list;
            this.setStatus(`Exibindo ${list.length} produtos (Mock Local)`);
            return;
        }

        this.state.isLoading = true;
        this.setStatus("Buscando produtos na API...");

        try {
            const url = new URL(`${this.state.apiUrl}/api/products`);
            if (this.state.searchQuery) url.searchParams.append("search", this.state.searchQuery);
            if (this.state.selectedCategory && this.state.selectedCategory !== "all") {
                url.searchParams.append("category", this.state.selectedCategory);
            }

            const res = await fetch(url.toString(), {
                headers: {
                    "Authorization": this.state.authHeader,
                    "Content-Type": "application/json"
                }
            });

            if (res.status === 401) {
                this.state.isAuthenticated = false;
                this.setStatus("Autenticação necessária.");
                Toast({ message: "Sessão expirada ou credenciais inválidas.", type: "error" });
                this.openLoginModal();
                return;
            }

            const json = await res.json();
            if (json.success) {
                this.state.products = json.data || [];
                this.setStatus(`🟢 ${this.state.products.length} produtos carregados da API Python`);
            } else {
                Toast({ message: json.error || "Erro ao carregar dados.", type: "error" });
            }
        } catch (err) {
            console.error("Erro no fetchProducts:", err);
            this.state.serverStatus = "offline";
            this.state.products = [...MOCK_DATA];
            this.setStatus("🟡 Servidor inacessível. Modo Mock ativado.");
        } finally {
            this.state.isLoading = false;
        }
    },

    async saveProduct(formData, isEdit = false, prodId = null) {
        if (!formData.name) {
            Toast({ message: "Preencha o nome do produto.", type: "warning" });
            return false;
        }

        if (this.state.isMockMode || this.state.serverStatus === "offline") {
            if (isEdit) {
                const idx = MOCK_DATA.findIndex(p => p.id === prodId);
                if (idx >= 0) {
                    MOCK_DATA[idx] = { ...MOCK_DATA[idx], ...formData };
                }
                Toast({ message: "Produto atualizado (Mock)!", type: "success" });
            } else {
                const newId = (MOCK_DATA[MOCK_DATA.length - 1]?.id || 0) + 1;
                MOCK_DATA.unshift({ id: newId, ...formData });
                Toast({ message: "Produto criado com sucesso (Mock)!", type: "success" });
            }
            this.fetchProducts();
            return true;
        }

        try {
            const url = isEdit ? `${this.state.apiUrl}/api/products/${prodId}` : `${this.state.apiUrl}/api/products`;
            const method = isEdit ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    "Authorization": this.state.authHeader,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });

            const json = await res.json();
            if (res.ok && json.success) {
                Toast({ message: json.message || "Salvo com sucesso!", type: "success" });
                this.fetchProducts();
                return true;
            } else {
                Toast({ message: json.error || "Erro ao salvar na API.", type: "error" });
                return false;
            }
        } catch (err) {
            Toast({ message: "Falha na requisição: " + err.message, type: "error" });
            return false;
        }
    },

    deleteProduct(id) {
        this.openModal({
            title: "Confirmar Exclusão",
            children: (modal) => [
                createElement("p", "", [`Deseja realmente excluir o produto #${id}?`]),
                Row({
                    style: "justify-content: flex-end; gap: 8px; margin-top: 15px;",
                    children: [
                        Button({
                            text: "Cancelar",
                            onClick: () => modal.close()
                        }),
                        Button({
                            text: "Sim, Excluir",
                            variant: "danger",
                            onClick: async () => {
                                modal.close();

                                if (this.state.isMockMode || this.state.serverStatus === "offline") {
                                    const idx = MOCK_DATA.findIndex(p => p.id === id);
                                    if (idx >= 0) MOCK_DATA.splice(idx, 1);
                                    Toast({ message: `Produto #${id} removido (Mock)!`, type: "success" });
                                    this.fetchProducts();
                                    return;
                                }

                                try {
                                    const res = await fetch(`${this.state.apiUrl}/api/products/${id}`, {
                                        method: "DELETE",
                                        headers: { "Authorization": this.state.authHeader }
                                    });
                                    const json = await res.json();
                                    if (res.ok && json.success) {
                                        Toast({ message: json.message, type: "success" });
                                        this.fetchProducts();
                                    } else {
                                        Toast({ message: json.error || "Erro ao excluir.", type: "error" });
                                    }
                                } catch (e) {
                                    Toast({ message: "Erro: " + e.message, type: "error" });
                                }
                            }
                        })
                    ]
                })
            ]
        });
    },

    openProductModal(prod = null) {
        const isEdit = !!prod;

        // Refs dos campos — capturadas no closure, sem querySelector
        let inpName, inpCategory, inpPrice, inpStock, txtDesc;

        this.openModal({
            title: isEdit ? `Editar Produto #${prod.id}` : "Novo Produto",
            children: (modal) => [
                createElement("div", "flex-col", [
                    createElement("label", "", ["Nome do Produto:"]),
                    (inpName = createElement("input", "filter-input", [], {
                        value: prod ? prod.name : "",
                        placeholder: "Ex: Monitor Gamer 144Hz"
                    })),
                    Row({
                        style: "gap: 8px; margin-top: 8px;",
                        children: [
                            Col({
                                style: "flex: 1;",
                                children: [
                                    createElement("label", "", ["Categoria:"]),
                                    (inpCategory = createElement("select", "filter-input", [
                                        createElement("option", "", ["Eletrônicos"]),
                                        createElement("option", "", ["Monitores"]),
                                        createElement("option", "", ["Periféricos"]),
                                        createElement("option", "", ["Mobiliário"]),
                                        createElement("option", "", ["Áudio"]),
                                        createElement("option", "", ["Acessórios"]),
                                        createElement("option", "", ["Geral"])
                                    ]))
                                ]
                            }),
                            Col({
                                style: "flex: 1;",
                                children: [
                                    createElement("label", "", ["Preço (R$):"]),
                                    (inpPrice = createElement("input", "filter-input", [], {
                                        type: "number",
                                        step: "0.01",
                                        value: prod ? prod.price : 0
                                    }))
                                ]
                            }),
                            Col({
                                style: "flex: 1;",
                                children: [
                                    createElement("label", "", ["Estoque:"]),
                                    (inpStock = createElement("input", "filter-input", [], {
                                        type: "number",
                                        step: "1",
                                        value: prod ? prod.stock : 1
                                    }))
                                ]
                            })
                        ]
                    }),
                    createElement("label", "", ["Descrição / Especificações:", { style: "margin-top: 8px;" }]),
                    (txtDesc = createElement("textarea", "filter-input", [prod ? prod.description || "" : ""], {
                        rows: 3,
                        placeholder: "Detalhes do item..."
                    })),
                    Row({
                        style: "justify-content: flex-end; gap: 8px; margin-top: 16px;",
                        children: [
                            Button({
                                text: "Cancelar",
                                onClick: () => modal.close()
                            }),
                            Button({
                                text: isEdit ? "Atualizar Produto" : "Cadastrar Produto",
                                variant: "primary",
                                onClick: async () => {
                                    if (inpCategory) inpCategory.value = prod ? prod.category : "Eletrônicos";
                                    const success = await this.saveProduct({
                                        name: inpName.value.trim(),
                                        category: inpCategory.value,
                                        price: parseFloat(inpPrice.value) || 0,
                                        stock: parseInt(inpStock.value, 10) || 0,
                                        description: txtDesc.value.trim()
                                    }, isEdit, prod ? prod.id : null);

                                    if (success) modal.close();
                                }
                            })
                        ]
                    })
                ])
            ]
        });

        // Configura o valor do <select> de categoria após renderização
        setTimeout(() => {
            if (inpCategory && prod) inpCategory.value = prod.category;
        }, 30);
    },

    openLoginModal() {
        let inpUser, inpPass;

        this.openModal({
            title: "🔐 Autenticação Basic Auth (API Python)",
            children: (modal) => [
                createElement("div", "flex-col", [
                    createElement("p", "", ["Insira as credenciais configuradas no servidor Python (padrão: admin / admin123):"]),
                    createElement("label", "", ["Usuário:"]),
                    (inpUser = createElement("input", "filter-input", [], { value: this.state.username, placeholder: "admin" })),
                    createElement("label", "", ["Senha:", { style: "margin-top: 8px;" }]),
                    (inpPass = createElement("input", "filter-input", [], { type: "password", value: this.state.password, placeholder: "admin123" })),
                    Row({
                        style: "justify-content: flex-end; gap: 8px; margin-top: 16px;",
                        children: [
                            Button({
                                text: "Cancelar",
                                onClick: () => modal.close()
                            }),
                            Button({
                                text: "Conectar / Salvar",
                                variant: "primary",
                                onClick: async () => {
                                    const u = inpUser.value.trim();
                                    const p = inpPass.value.trim();

                                    this.state.username = u;
                                    this.state.password = p;
                                    this.state.authHeader = "Basic " + btoa(`${u}:${p}`);
                                    this.state.isAuthenticated = true;

                                    modal.close();
                                    Toast({ message: "Credenciais salvas!", type: "success" });
                                    this.fetchProducts();
                                }
                            })
                        ]
                    })
                ])
            ]
        });
    },

    openSettingsModal() {
        let inpUrl;

        this.openModal({
            title: "⚙️ Configuração da API Python",
            children: (modal) => [
                createElement("div", "flex-col", [
                    createElement("label", "", ["URL Base da API:"]),
                    (inpUrl = createElement("input", "filter-input", [], { value: this.state.apiUrl })),
                    createElement("small", "", ["Padrão: http://localhost:8080 (servidor api.py)", { style: "opacity: 0.7; margin-top: 4px;" }]),
                    Row({
                        style: "justify-content: flex-end; gap: 8px; margin-top: 16px;",
                        children: [
                            Button({ text: "Fechar", onClick: () => modal.close() }),
                            Button({
                                text: "Salvar e Testar",
                                variant: "primary",
                                onClick: () => {
                                    this.state.apiUrl = inpUrl.value.trim().replace(/\/$/, "");
                                    modal.close();
                                    Toast({ message: "URL atualizada!", type: "info" });
                                    this.checkApiHealth(true);
                                }
                            })
                        ]
                    })
                ])
            ]
        });
    },

    openHelpModal() {
        this.openModal({
            title: "🐍 Como Rodar o Servidor Python",
            children: (modal) => [
                createElement("div", "", [
                    createElement("h4", "", ["Passo a passo rápido:"]),
                    createElement("ol", "", [
                        createElement("li", "", ["Abra o terminal na pasta raiz do projeto."]),
                        createElement("li", "", ["Execute o comando: ", createElement("code", "", ["python api.py"])]),
                        createElement("li", "", ["O servidor iniciará em ", createElement("code", "", ["http://localhost:8080"])]),
                        createElement("li", "", ["Credenciais Basic Auth: usuário ", createElement("b", "", ["admin"]), " e senha ", createElement("b", "", ["admin123"])])
                    ]),
                    createElement("p", "", ["A API possui suporte nativo a CORS, persistência automática em SQLite (database.db) e rotas REST completas."])
                ]),
                Row({
                    style: "justify-content: flex-end; margin-top: 15px;",
                    children: [
                        Button({ text: "Entendido", onClick: () => modal.close() })
                    ]
                })
            ]
        });
    },

    view() {
        const isOnline = this.state.serverStatus === "online";
        const isMock = this.state.serverStatus === "mock" || this.state.isMockMode;
        
        let statusBadge = "🟡 Verificando...";
        let statusColor = "#f59e0b";
        if (isOnline) {
            statusBadge = `🟢 API Python Online (${this.state.apiUrl})`;
            statusColor = "#10b981";
        } else if (isMock) {
            statusBadge = "🎭 Modo Mock Local";
            statusColor = "#6366f1";
        } else {
            statusBadge = "🔴 API Offline (Mock Ativo)";
            statusColor = "#ef4444";
        }

        const columns = [
            { label: "ID", key: "id", render: (val) => `<b>#${val}</b>` },
            { 
                label: "Produto", 
                key: "name", 
                render: (val, row) => `
                    <div style="font-weight: 600;">${val}</div>
                    <div style="font-size: 11px; opacity: 0.7;">${row.description || ''}</div>
                ` 
            },
            { 
                label: "Categoria", 
                key: "category",
                render: (val) => `<span style="padding: 2px 8px; border-radius: 12px; background: rgba(0,0,0,0.07); font-size: 11px; font-weight: 500;">${val}</span>`
            },
            { 
                label: "Preço", 
                key: "price", 
                render: (val) => `<span style="font-weight: 600; color: var(--btn-primary, #2563eb);">R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>` 
            },
            { 
                label: "Estoque", 
                key: "stock", 
                render: (val) => {
                    const color = val > 15 ? '#10b981' : val > 5 ? '#f59e0b' : '#ef4444';
                    return `<span style="color: ${color}; font-weight: 600;">${val} un.</span>`;
                }
            },
            {
                label: "Ações",
                key: "id",
                render: (val, row) => {
                    return Row({
                        style: "gap: 4px;",
                        children: [
                            Button({
                                text: "✏️ Editar",
                                variant: "surface",
                                style: "padding: 3px 8px; font-size: 11px;",
                                onClick: () => this.openProductModal(row)
                            }),
                            Button({
                                text: "🗑️",
                                variant: "danger",
                                style: "padding: 3px 8px; font-size: 11px;",
                                onClick: () => this.deleteProduct(row.id)
                            })
                        ]
                    });
                }
            }
        ];

        return createElement("div", "flex-col", [
            // Barra Superior de Status e Ações Rápidas
            Row({
                style: "padding: 8px 12px; background: rgba(0,0,0,0.03); border-bottom: 1px solid var(--win-border); gap: 10px; align-items: center; flex-wrap: wrap;",
                children: [
                    Button({
                        text: "➕ Novo Produto",
                        variant: "primary",
                        onClick: () => this.openProductModal()
                    }),
                    Button({
                        text: "🔄 Atualizar",
                        onClick: () => this.fetchProducts()
                    }),
                    createElement("div", "", [
                        createElement("input", "filter-input", [], {
                            placeholder: "🔍 Buscar produto...",
                            style: "width: 180px;",
                            value: this.state.searchQuery,
                            oninput: (e) => {
                                if (typeof this._setSilentState === 'function') {
                                    this._setSilentState("searchQuery", e.target.value);
                                } else {
                                    this.state.searchQuery = e.target.value;
                                }
                            },
                            onkeydown: (e) => {
                                if (e.key === "Enter") this.fetchProducts();
                            }
                        })
                    ]),
                    createElement("div", "", [
                        createElement("select", "filter-input", [
                            createElement("option", "", ["Todas Categorias"], { value: "all" }),
                            createElement("option", "", ["Eletrônicos"], { value: "Eletrônicos" }),
                            createElement("option", "", ["Monitores"], { value: "Monitores" }),
                            createElement("option", "", ["Periféricos"], { value: "Periféricos" }),
                            createElement("option", "", ["Mobiliário"], { value: "Mobiliário" }),
                            createElement("option", "", ["Áudio"], { value: "Áudio" }),
                            createElement("option", "", ["Acessórios"], { value: "Acessórios" })
                        ], {
                            value: this.state.selectedCategory,
                            onchange: (e) => {
                                this.state.selectedCategory = e.target.value;
                                this.fetchProducts();
                            }
                        })
                    ]),
                    createElement("div", "", [
                        createElement("span", "", [statusBadge], {
                            style: `margin-left: auto; font-size: 11.5px; font-weight: 600; color: ${statusColor}; padding: 4px 8px; border-radius: 6px; background: rgba(0,0,0,0.05);`
                        })
                    ], { style: "margin-left: auto;" })
                ]
            }),

            // Corpo da Listagem / Tabela
            createElement("div", "", [
                Table({
                    columns: columns,
                    data: this.state.products
                })
            ], { style: "flex: 1; overflow-y: auto; background: var(--bg-primary, #fff); border-radius: 8px; border: 1px solid var(--win-border);" })
        ]);
    }
};
