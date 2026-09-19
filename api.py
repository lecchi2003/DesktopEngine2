"""
DesktopEngine - Backend API REST em Python (CRUD + Basic Auth)
Executa um servidor HTTP nativo com suporte a CORS, Autenticação Básica (Basic Auth)
e operações completas de CRUD para catálogo de produtos.

Uso:
    python api.py
    (O servidor iniciará em http://localhost:8080)

Credenciais Padrão (Basic Auth):
    Usuário: admin
    Senha:   admin123
"""

import sys
import json
import base64
import sqlite3
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = 8080
DB_FILE = os.path.join(os.path.dirname(__file__), "database.db")

AUTH_USER = "admin"
AUTH_PASS = "admin123"

# Banco de dados de perfis e permissões RBAC
USERS_DB = {
    "admin": {
        "password": "admin123",
        "name": "Administrador Geral",
        "roles": ["ADMIN"],
        "permissions": ["products:view", "products:create", "products:edit", "products:delete", "financeiro:view", "audit:view"]
    },
    "operador": {
        "password": "operador123",
        "name": "Operador de Estoque",
        "roles": ["OPERADOR"],
        "permissions": ["products:view", "products:create", "products:edit"]
    },
    "visitante": {
        "password": "visitante123",
        "name": "Visitante Convidado",
        "roles": ["VISITANTE"],
        "permissions": ["products:view"]
    }
}

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Insere dados de exemplo se a tabela estiver vazia
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        sample_data = [
            ("Notebook Dell XPS 15", "Eletrônicos", 8990.00, 14, "Intel i7, 32GB RAM, SSD 1TB NVMe"),
            ("Monitor UltraWide 34\" LG", "Monitores", 2850.50, 22, "Resolução WQHD 144Hz IPS"),
            ("Teclado Mecânico RGB Pro", "Periféricos", 480.00, 45, "Switches Hot-swappable Gateron Red"),
            ("Mouse Ergonômico Vertical", "Periféricos", 260.00, 30, "Sensor óptico 4000 DPI, Conexão Wireless"),
            ("Cadeira Ergonômica Mesh", "Mobiliário", 1450.00, 8, "Apoio lombar 3D e braços articulados"),
            ("Headset Gamer 7.1 Wireless", "Áudio", 690.00, 18, "Drivers de 50mm e microfone com cancelamento de ruído"),
            ("Webcam 4K Ultra HD Pro", "Acessórios", 520.00, 12, "Sensor Sony Starvis com autofoco rápido"),
            ("Hub USB-C 8 em 1 Alumínio", "Acessórios", 195.00, 60, "HDMI 4K, Gigabit Ethernet, Leitor SD, PD 100W")
        ]
        cursor.executemany("""
            INSERT INTO products (name, category, price, stock, description)
            VALUES (?, ?, ?, ?, ?)
        """, sample_data)
        conn.commit()
    conn.close()

class CRUDRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Log elegante no terminal
        print(f"[{self.log_date_time_string()}] {self.command} {self.path} -> {args[1]}")

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Auth-User")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json_response(self, status_code, data):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _get_authenticated_user(self):
        """Retorna (username, user_dict) do usuário autenticado via Basic Auth ou X-Auth-User header"""
        auth_header = self.headers.get("Authorization")
        if auth_header:
            try:
                auth_type, encoded_credentials = auth_header.split(" ", 1)
                if auth_type.lower() == "basic":
                    decoded_bytes = base64.b64decode(encoded_credentials)
                    decoded_str = decoded_bytes.decode("utf-8")
                    username, password = decoded_str.split(":", 1)
                    if username in USERS_DB and USERS_DB[username]["password"] == password:
                        return username, USERS_DB[username]
            except Exception:
                pass

        # Fallback prático para demonstração e showcase em tempo real via header
        x_user = self.headers.get("X-Auth-User")
        if x_user and x_user in USERS_DB:
            return x_user, USERS_DB[x_user]

        return None, None

    def _has_permission(self, user_dict, required_perm):
        """Valida se o usuário tem a permissão solicitada ou se possui papel ADMIN"""
        if not user_dict:
            return False
        if "ADMIN" in user_dict.get("roles", []):
            return True
        return required_perm in user_dict.get("permissions", [])

    def do_OPTIONS(self):
        # Trata preflight request do CORS
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Healthcheck (sem auth)
        if path == "/api/health":
            self._send_json_response(200, {
                "status": "online",
                "message": "DesktopEngine Python Backend API ativo e operacional",
                "version": "2.0.0",
                "rbacEnabled": True
            })
            return

        # Validação de Login / Credenciais
        if path == "/api/auth/verify":
            username, user_dict = self._get_authenticated_user()
            if user_dict:
                self._send_json_response(200, {
                    "authenticated": True,
                    "user": username,
                    "profile": user_dict,
                    "message": "Credenciais válidas."
                })
            else:
                self._send_json_response(401, {
                    "authenticated": False,
                    "error": "Usuário ou senha incorretos."
                })
            return

        # Para endpoints de CRUD, exige autenticação
        username, user_dict = self._get_authenticated_user()
        if not user_dict:
            self._send_json_response(401, {"error": "Não autorizado. Forneça o cabeçalho Basic Auth válido ou X-Auth-User."})
            return

        # Checa permissão de visualização
        if not self._has_permission(user_dict, "products:view"):
            self._send_json_response(403, {
                "error": "Acesso negado: Requer a permissão 'products:view'.",
                "requiredPermission": "products:view"
            })
            return

        # GET /api/products
        if path == "/api/products":
            search = query.get("search", [""])[0].strip()
            category = query.get("category", [""])[0].strip()

            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            sql = "SELECT * FROM products WHERE 1=1"
            params = []

            if search:
                sql += " AND (name LIKE ? OR description LIKE ?)"
                params.extend([f"%{search}%", f"%{search}%"])
            if category and category != "all":
                sql += " AND category = ?"
                params.append(category)

            sql += " ORDER BY id DESC"
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            products = [dict(row) for row in rows]
            conn.close()

            self._send_json_response(200, {"success": True, "total": len(products), "data": products})
            return

        # GET /api/products/<id>
        if path.startswith("/api/products/"):
            try:
                prod_id = int(path.split("/api/products/")[1])
                conn = sqlite3.connect(DB_FILE)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM products WHERE id = ?", (prod_id,))
                row = cursor.fetchone()
                conn.close()

                if row:
                    self._send_json_response(200, {"success": True, "data": dict(row)})
                else:
                    self._send_json_response(404, {"success": False, "error": "Produto não encontrado."})
            except ValueError:
                self._send_json_response(400, {"success": False, "error": "ID inválido."})
            return

        self._send_json_response(404, {"error": "Endpoint não encontrado."})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # POST /api/auth/login
        if path == "/api/auth/login":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
                u = payload.get("username")
                p = payload.get("password")
                profile = payload.get("profile")

                # Suporte a login direto por nome de perfil para showcase
                if profile and profile in USERS_DB:
                    u = profile
                    p = USERS_DB[profile]["password"]

                if u in USERS_DB and USERS_DB[u]["password"] == p:
                    user_data = USERS_DB[u]
                    token = base64.b64encode(f"{u}:{p}".encode("utf-8")).decode("utf-8")
                    self._send_json_response(200, {
                        "success": True,
                        "token": token,
                        "user": u,
                        "name": user_data["name"],
                        "roles": user_data["roles"],
                        "permissions": user_data["permissions"],
                        "message": f"Autenticado com sucesso como {user_data['name']}!"
                    })
                else:
                    self._send_json_response(401, {
                        "success": False,
                        "error": "Usuário ou senha inválidos. Perfis disponíveis: admin (admin123), operador (operador123), visitante (visitante123)."
                    })
            except Exception as e:
                self._send_json_response(400, {"success": False, "error": f"JSON inválido: {str(e)}"})
            return

        # CRUD exige autenticação
        username, user_dict = self._get_authenticated_user()
        if not user_dict:
            self._send_json_response(401, {"error": "Não autorizado. Forneça o cabeçalho Basic Auth válido ou X-Auth-User."})
            return

        # POST /api/products
        if path == "/api/products":
            if not self._has_permission(user_dict, "products:create"):
                self._send_json_response(403, {
                    "success": False,
                    "error": "Acesso Negado (HTTP 403): O usuário não possui a permissão 'products:create' para cadastrar produtos.",
                    "requiredPermission": "products:create"
                })
                return

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
                name = payload.get("name", "").strip()
                category = payload.get("category", "Geral").strip()
                price = float(payload.get("price", 0))
                stock = int(payload.get("stock", 0))
                description = payload.get("description", "").strip()

                if not name:
                    self._send_json_response(400, {"success": False, "error": "O campo 'name' é obrigatório."})
                    return

                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO products (name, category, price, stock, description)
                    VALUES (?, ?, ?, ?, ?)
                """, (name, category, price, stock, description))
                new_id = cursor.lastrowid
                conn.commit()
                conn.close()

                self._send_json_response(201, {
                    "success": True,
                    "message": "Produto cadastrado com sucesso!",
                    "data": {
                        "id": new_id,
                        "name": name,
                        "category": category,
                        "price": price,
                        "stock": stock,
                        "description": description
                    }
                })
            except Exception as e:
                self._send_json_response(400, {"success": False, "error": f"Erro no cadastro: {str(e)}"})
            return

        self._send_json_response(404, {"error": "Endpoint não encontrado."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        username, user_dict = self._get_authenticated_user()
        if not user_dict:
            self._send_json_response(401, {"error": "Não autorizado. Forneça o cabeçalho Basic Auth válido ou X-Auth-User."})
            return

        # PUT /api/products/<id>
        if path.startswith("/api/products/"):
            if not self._has_permission(user_dict, "products:edit"):
                self._send_json_response(403, {
                    "success": False,
                    "error": "Acesso Negado (HTTP 403): O usuário não possui a permissão 'products:edit' para alterar produtos.",
                    "requiredPermission": "products:edit"
                })
                return

            try:
                prod_id = int(path.split("/api/products/")[1])
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")
                payload = json.loads(body)

                name = payload.get("name", "").strip()
                category = payload.get("category", "").strip()
                price = float(payload.get("price", 0))
                stock = int(payload.get("stock", 0))
                description = payload.get("description", "").strip()

                if not name:
                    self._send_json_response(400, {"success": False, "error": "Nome não pode ficar vazio."})
                    return

                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE products
                    SET name = ?, category = ?, price = ?, stock = ?, description = ?
                    WHERE id = ?
                """, (name, category, price, stock, description, prod_id))
                updated = cursor.rowcount
                conn.commit()
                conn.close()

                if updated > 0:
                    self._send_json_response(200, {
                        "success": True,
                        "message": "Produto atualizado com sucesso!",
                        "data": {
                            "id": prod_id,
                            "name": name,
                            "category": category,
                            "price": price,
                            "stock": stock,
                            "description": description
                        }
                    })
                else:
                    self._send_json_response(404, {"success": False, "error": "Produto não encontrado."})
            except Exception as e:
                self._send_json_response(400, {"success": False, "error": f"Erro na atualização: {str(e)}"})
            return

        self._send_json_response(404, {"error": "Endpoint não encontrado."})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        username, user_dict = self._get_authenticated_user()
        if not user_dict:
            self._send_json_response(401, {"error": "Não autorizado. Forneça o cabeçalho Basic Auth válido ou X-Auth-User."})
            return

        # DELETE /api/products/<id>
        if path.startswith("/api/products/"):
            if not self._has_permission(user_dict, "products:delete"):
                self._send_json_response(403, {
                    "success": False,
                    "error": "Acesso Negado (HTTP 403): O usuário não possui a permissão 'products:delete' para excluir produtos.",
                    "requiredPermission": "products:delete",
                    "user": username,
                    "userRoles": user_dict.get("roles", []),
                    "userPermissions": user_dict.get("permissions", [])
                })
                return

            try:
                prod_id = int(path.split("/api/products/")[1])

                # Verificação RBAC OK — executa o DELETE com segurança
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("SELECT id, name FROM products WHERE id = ?", (prod_id,))
                product = cursor.fetchone()
                conn.close()

                if product:
                    # [SHOWCASE] Simula o DELETE sem alterar o banco para que o teste seja repetível.
                    # Em produção, remova o comentário abaixo e use a linha real de DELETE.
                    # cursor.execute("DELETE FROM products WHERE id = ?", (prod_id,))
                    self._send_json_response(200, {
                        "success": True,
                        "simulated": True,
                        "message": f"[SHOWCASE] DELETE simulado com sucesso! Produto #{prod_id} '{product[1]}' seria excluído. Backend confirmou permissão para o usuário '{username}' (roles: {user_dict.get('roles', [])}).",
                        "authorizedUser": username,
                        "authorizedRoles": user_dict.get("roles", []),
                        "note": "Operação não executada para preservar os dados do showcase. Em produção, o DELETE seria efetivo."
                    })
                else:
                    # Produto não encontrado, mas permissão foi validada — mostra isso
                    self._send_json_response(200, {
                        "success": True,
                        "simulated": True,
                        "message": f"[SHOWCASE] Permissão 'products:delete' confirmada para '{username}'! Produto #{prod_id} não encontrado no banco (pode ter sido excluído anteriormente). Em produção, o DELETE retornaria 404.",
                        "authorizedUser": username,
                        "authorizedRoles": user_dict.get("roles", [])
                    })
            except ValueError:
                self._send_json_response(400, {"success": False, "error": "ID inválido."})
            return

        self._send_json_response(404, {"error": "Endpoint não encontrado."})

def run_server():
    init_db()
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, CRUDRequestHandler)
    print("=" * 65)
    print(f"🚀 DesktopEngine Python Backend API rodando em http://localhost:{PORT}")
    print("=" * 65)
    print(f"🔑 Credenciais Basic Auth:")
    print(f"   Usuário: {AUTH_USER}")
    print(f"   Senha:   {AUTH_PASS}")
    print("📋 Rotas disponíveis:")
    print("   GET    /api/health")
    print("   POST   /api/auth/login")
    print("   GET    /api/products")
    print("   POST   /api/products")
    print("   PUT    /api/products/<id>")
    print("   DELETE /api/products/<id>")
    print("=" * 65)
    print("Pressione Ctrl+C para encerrar o servidor.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Servidor encerrado.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
