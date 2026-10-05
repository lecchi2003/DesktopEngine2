// screens/ComicDoodleShowcaseScreen.js
import { Desktop } from '../desktop.js';
import { Button, Grid, Toast, createElement } from '../ui.js';

export default {
    id: "amazon_comic",
    title: "Amazon.com",
    icon: "",
    width: 350,
    height: 230,
    singleInstance: false,
    state: {
        cartCount: 0,
        selectedProduct: "Nenhum"
    },
    onMount() {
        this.setStatus("Clique em um produto para interagir");
    },
    actions: {
        selectProduct: [(ctx, next, prodName) => {
            ctx.state.selectedProduct = prodName;
            ctx.state.cartCount++;
            ctx.instance.setStatus(`🛍️ Carrinho: ${ctx.state.cartCount} item(ns) | Selecionado: ${prodName}`);
            Toast({ message: `Adicionado: ${prodName}! (Total: ${ctx.state.cartCount})`, type: "success" });
        }]
    },
    view() {
        return createElement("div", "flex-col", [
            // Grade 2x2 correspondente à imagem de referência
            Grid({
                columns: 2,
                gap: "16px",
                style: "flex: 1; align-content: stretch;",
                children: [
                    Button({
                        text: "Product A",
                        style: "height: 100%; min-height: 52px; font-size: 15px; font-weight: 700;",
                        onClick: () => this.runAction("selectProduct", "Product A")
                    }),
                    Button({
                        text: "Product B",
                        style: "height: 100%; min-height: 52px; font-size: 15px; font-weight: 700;",
                        onClick: () => this.runAction("selectProduct", "Product B")
                    }),
                    Button({
                        text: "Product C",
                        style: "height: 100%; min-height: 52px; font-size: 15px; font-weight: 700;",
                        onClick: () => this.runAction("selectProduct", "Product C")
                    }),
                    Button({
                        text: "Product D",
                        style: "height: 100%; min-height: 52px; font-size: 15px; font-weight: 700;",
                        onClick: () => this.runAction("selectProduct", "Product D")
                    })
                ]
            })
        ], "padding: 16px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center;");
    }
};
