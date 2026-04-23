# Servidor Flask de Impressão Automatizada 🖨️♻️

> **Objetivo do Projeto: dar uma nova vida a milhares de impressoras esquecidas.**
>
> Você já parou para pensar em quantas impressoras antigas, incrivelmente robustas e perfeitamente funcionais, estão pegando poeira ou sendo descartadas neste exato momento? O único "defeito" da grande maioria delas é não possuírem conectividade Wi-Fi, integração na nuvem ou a capacidade de receber arquivos diretamente de um smartphone.
>
> Este projeto nasceu para mudar essa realidade e **salvar da obsolescência milhares de equipamentos**. Nosso objetivo é democratizar a impressão moderna, transformando qualquer máquina em uma impressora conectada. Com esta aplicação, damos funções novas a impressoras legadas: a capacidade de imprimir de qualquer lugar da sua rede, a partir de qualquer dispositivo — com cobrança via Pix integrada para uso em papelarias e pontos de autoatendimento.

---

## 📑 Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Fluxo de Uso](#-fluxo-de-uso)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração do `.env`](#-configuração-do-env)
- [Executando o Servidor](#-executando-o-servidor)
- [Endpoints da API](#-endpoints-da-api)
- [Estrutura de Pastas](#-estrutura-de-pastas)
- [Pagamento via Pix](#-pagamento-via-pix)
- [Solução de Problemas](#-solução-de-problemas)
- [Roadmap](#-roadmap)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

---

## 📖 Sobre o Projeto

Aplicação em **Python + Flask** que expõe um servidor web local para impressão de documentos via navegador. Projetada para o ecossistema **Windows**, utiliza o **SumatraPDF** para impressão silenciosa de PDFs e o **Pillow** para conversão de imagens. O frontend é uma SPA em HTML + JavaScript puro que permite:

- Upload de arquivos por drag-and-drop
- Preview página-a-página de PDFs (via `pdf.js`)
- Seleção individual de páginas e quantidade de cópias
- Manipulação do PDF no navegador (via `pdf-lib`) antes do envio
- Pagamento via **Pix** com verificação automática (Mercado Pago) ou QR estático (fallback)

Ideal para: papelarias, copiadoras, bibliotecas, coworkings, lan-houses ou qualquer ambiente em que múltiplas pessoas precisem imprimir em uma impressora compartilhada.

---

## ✨ Funcionalidades

### Impressão
- ✅ Upload de **PDF**, **DOC/DOCX**, **TXT** e **imagens** (JPG, JPEG, PNG, BMP, TIFF)
- ✅ Impressão silenciosa de PDFs via SumatraPDF
- ✅ Conversão automática de imagens para PDF antes da impressão
- ✅ Suporte a **frente e verso** (duplex, se a impressora permitir)
- ✅ Escolha de **orientação** (retrato / paisagem)
- ✅ Escolha de **tamanho do papel** (A4 / Carta)
- ✅ Modo **colorido** ou **preto e branco**
- ✅ Ajuste de página: **preencher**, **reduzir para caber** ou **tamanho real**
- ✅ Seleção individual de páginas e quantidade de cópias por página
- ✅ Exclusão automática do arquivo após a impressão (privacidade)

### Pagamento
- ✅ Cobrança Pix **dinâmica** via Mercado Pago (com verificação automática de pagamento)
- ✅ Fallback para **QR Code Pix estático** (BR Code EMV) quando o Mercado Pago não está configurado
- ✅ Polling automático do status do pagamento
- ✅ Código "Copia e Cola" com botão de cópia rápida

### Interface
- ✅ Wizard de 4 passos (upload → preview → resumo → pagamento)
- ✅ Preview em tempo real da orientação e modo de cor
- ✅ Drag-and-drop de arquivos
- ✅ Responsivo (desktop e mobile)

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                      NAVEGADOR (Cliente)                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  index.html  +  index.js  +  index.css                 │  │
│  │  • pdf.js (preview)                                    │  │
│  │  • pdf-lib (edição/reordenação de PDF)                 │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTP (multipart/form-data + JSON)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                      SERVIDOR FLASK                          │
│  ┌────────────────┐   ┌────────────────┐  ┌──────────────┐   │
│  │   server.py    │──▶│printer_service │  │ pix_service  │   │
│  │  (rotas HTTP)  │   │   (SumatraPDF  │  │ (Mercado Pago│   │
│  │                │   │    + Pillow)   │  │  + BR Code)  │   │
│  └────────────────┘   └───────┬────────┘  └──────────────┘   │
└─────────────────────────────┬─┴──────────────────────────────┘
                              │ subprocess
                              ▼
                   ┌──────────────────────┐
                   │    SumatraPDF.exe    │
                   │  (impressão silent)  │
                   └──────────┬───────────┘
                              ▼
                     🖨️ Impressora Windows
```

### Componentes

| Arquivo | Responsabilidade |
|---------|------------------|
| [`server.py`](server.py) | Orquestração HTTP: rotas `/`, `/upload`, `/generate-pix`, `/check-payment/<id>` |
| [`printer_service.py`](printer_service.py) | Abstração da impressão; converte imagens para PDF; chama o SumatraPDF via `subprocess` |
| [`pix_service.py`](pix_service.py) | Gera cobranças Pix (dinâmicas via SDK do Mercado Pago) ou QR estático (BR Code EMV) |
| [`templates/index.html`](templates/index.html) | Wizard de 4 passos |
| [`static/js/index.js`](static/js/index.js) | Lógica do cliente: preview, edição de PDF, polling de pagamento |
| [`static/css/index.css`](static/css/index.css) | Estilização da interface |
| [`SumatraPDF/SumatraPDF.exe`](SumatraPDF/) | Binário para impressão silenciosa via CLI |

---

## 🔄 Fluxo de Uso

1. **Upload** — Usuário seleciona ou arrasta um arquivo. Nada é enviado ao servidor ainda.
2. **Preview e opções** — Para PDFs, cada página é renderizada via `pdf.js`. O usuário marca/desmarca páginas, define cópias individuais, escolhe orientação, cor, tamanho de papel, etc. Para imagens, o preview é desenhado em um canvas com rotação e grayscale aplicados em tempo real.
3. **Resumo** — Mostra o total de páginas selecionadas, cópias e valor a pagar (`R$ 0,50 × total de cópias`, configurável no código).
4. **Pagamento Pix** — Ao entrar nesta etapa, o frontend chama `/generate-pix`:
   - Se **Mercado Pago** estiver configurado → cria cobrança dinâmica e faz polling em `/check-payment/<id>` a cada 3s.
   - Caso contrário → gera um **QR Code estático** (BR Code EMV com CRC16) e exibe botão de confirmação manual.
5. **Impressão** — Com pagamento aprovado, o frontend:
   - Usa `pdf-lib` para montar um PDF só com as páginas/cópias selecionadas (se necessário)
   - Envia o arquivo + configurações para `POST /upload`
   - Backend salva temporariamente, monta comando do SumatraPDF e imprime
   - Arquivo é **apagado no `finally`** (privacidade)

---

## 📋 Pré-requisitos

- **Sistema Operacional:** Windows 10/11 (o código depende de `rundll32.exe` e do SumatraPDF Windows)
- **Python 3.10+**
- **SumatraPDF** — versão portátil já incluída em [`SumatraPDF/`](SumatraPDF/); pode ser baixada em <https://www.sumatrapdfreader.org/>
- Uma **impressora instalada e configurada** no Windows
- (Opcional) Conta no **Mercado Pago** com Access Token para cobrança dinâmica
- (Opcional) Chave **Pix** cadastrada para fallback estático

---

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/lucasbastosrezende/impressoraAutomatizada.git
cd impressoraAutomatizada
```

### 2. Crie um ambiente virtual (recomendado)

```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

> **Atenção:** além dos pacotes em `requirements.txt`, o projeto usa `mercadopago` e `qrcode[pil]`. Caso o `pip install` não os traga automaticamente, instale manualmente:
>
> ```bash
> pip install mercadopago qrcode[pil]
> ```

### 4. Confira o SumatraPDF

A pasta [`SumatraPDF/`](SumatraPDF/) já contém o binário portátil. Se você preferir outra localização, aponte-a via variável de ambiente `SUMATRA_PATH` (veja próxima seção).

---

## ⚙️ Configuração do `.env`

Crie um arquivo `.env` na raiz do projeto com o conteúdo abaixo (o arquivo está no `.gitignore` e **não** deve ser commitado):

```env
# ---- Servidor ----
HOST=0.0.0.0
PORT=5000

# ---- Impressora ----
DEFAULT_PRINTER=HP LaserJet Professional M1132 MFP
SUMATRA_PATH=               # Opcional. Se vazio, usa ./SumatraPDF/SumatraPDF.exe

# ---- Pix via Mercado Pago (cobrança dinâmica) ----
MERCADO_PAGO_ACCESS_TOKEN=  # Gere em https://www.mercadopago.com.br/developers/panel

# ---- Pix estático (fallback se MP não estiver configurado) ----
PIX_KEY=                    # CPF, e-mail, telefone ou chave aleatória
PIX_MERCHANT_NAME=Capital Papelaria
PIX_MERCHANT_CITY=Brasilia
```

### Como descobrir o nome da impressora no Windows

```powershell
Get-Printer | Select-Object Name
```

Copie o nome exato (com espaços) e cole em `DEFAULT_PRINTER`.

---

## ▶️ Executando o Servidor

```bash
python server.py
```

Saída esperada:

```
✅ Mercado Pago configurado — verificação automática de Pix ativada
Servidor Flask rodando na porta 5000 (Impressora: HP LaserJet Professional M1132 MFP)!
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://192.168.0.10:5000
```

Abra `http://localhost:5000` no navegador. Como o servidor escuta em `0.0.0.0`, qualquer dispositivo na mesma rede Wi-Fi consegue acessar pelo IP da máquina.

> ⚠️ **Aviso de segurança:** o Flask roda com `debug=True`. Isso é útil em desenvolvimento, mas **nunca** exponha esta aplicação diretamente à internet nesse modo — use um reverse proxy (nginx, Caddy) e desabilite o debug em produção.

---

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/` | Serve o wizard (`index.html`) |
| `POST` | `/upload` | Recebe `multipart/form-data` com o arquivo e configurações, imprime e deleta o arquivo |
| `POST` | `/generate-pix` | Body JSON `{ "amount": 1.50 }`. Retorna QR Code + copia-e-cola (dinâmico ou estático) |
| `GET`  | `/check-payment/<payment_id>` | Consulta status no Mercado Pago (apenas modo dinâmico) |

### Exemplo: gerar cobrança Pix

```bash
curl -X POST http://localhost:5000/generate-pix \
  -H "Content-Type: application/json" \
  -d '{"amount": 1.50}'
```

Resposta:

```json
{
  "status": "success",
  "mode": "mercadopago",
  "payment_id": 1234567890,
  "qr_base64": "data:image/png;base64,iVBORw0KGgo...",
  "copia_cola": "00020126...",
  "payment_status": "pending",
  "amount": "1.50"
}
```

### Parâmetros aceitos em `/upload`

| Campo | Valores | Default |
|-------|---------|---------|
| `file` | arquivo (binário) | — (obrigatório) |
| `printType` | `normal`, `duplex` | `normal` |
| `paperSize` | `a4`, `letter` | `a4` |
| `orientation` | `portrait`, `landscape` | `portrait` |
| `colorMode` | `color`, `monochrome` | `color` |
| `pageFit` | `fit`, `shrink`, `noscale` | `fit` |
| `copies` | inteiro ≥ 1 | `1` |

---

## Estrutura de Pastas

```
impressoraAutomatizada/
├── server.py                 # App Flask e rotas
├── printer_service.py        # Serviço de impressão (SumatraPDF + Pillow)
├── pix_service.py            # Serviço de pagamento Pix
├── requirements.txt
├── .env                      # (não versionado) configurações locais
├── .gitignore
├── README.md
├── SumatraPDF/
│   ├── SumatraPDF.exe
│   └── SumatraPDF-settings.txt
├── templates/
│   └── index.html            # Wizard de 4 passos
├── static/
│   ├── css/
│   │   └── index.css
│   ├── js/
│   │   └── index.js
│   └── logo/
│       ├── logo.png
│       └── logo-removebg-preview.png
└── uploads/                  # (criada em runtime, esvaziada após cada impressão)
```

---

## Pagamento via Pix

### Modo Dinâmico (Mercado Pago)

Ao configurar `MERCADO_PAGO_ACCESS_TOKEN`, o sistema usa o SDK oficial para criar uma cobrança Pix real. O frontend faz polling a cada 3 segundos no endpoint `/check-payment/<id>`. Quando o status muda para `approved`, a impressão é disparada automaticamente.

Para obter seu token:

1. Acesse <https://www.mercadopago.com.br/developers/panel>
2. Crie uma aplicação
3. Copie o **Access Token de produção** (para cobranças reais) ou de **teste** (para sandbox)

### Modo Estático (fallback)

Se apenas `PIX_KEY` estiver configurada, o sistema gera um **BR Code EMV** manualmente, com cálculo de **CRC16-CCITT**, obedecendo ao padrão do Banco Central. Como não há como verificar o pagamento automaticamente, o usuário precisa clicar em "Confirmar Pagamento" depois de pagar.

> O preço padrão é **R$ 0,50 por cópia**. Para alterar, edite a linha `let valorPagar = totalCopies * 0.50;` em [`static/js/index.js`](static/js/index.js).

---

## Solução de Problemas

| Problema | Causa provável | Solução |
|----------|----------------|---------|
| `Arquivo não encontrado: SumatraPDF.exe` | `SUMATRA_PATH` aponta para local errado | Deixe a variável vazia no `.env` ou corrija o caminho absoluto |
| `Ocorreu um erro na impressão: <vazio>` | Nome da impressora incorreto | Confira com `Get-Printer`; copie o nome exato para `DEFAULT_PRINTER` |
| `Timeout na impressão` | Impressora offline ou com fila travada | Abra "Fila de impressão" no Windows, limpe os jobs travados |
| PDF não imprime páginas corretas | PDF criptografado/assinado | O `pdf-lib` não consegue editar; o arquivo original será enviado inteiro |
| `Mercado Pago NÃO configurado` | `MERCADO_PAGO_ACCESS_TOKEN` ausente | Preencha o token no `.env` ou use o modo estático |
| Página 404 nos assets | Servidor rodando fora da raiz do projeto | Execute `python server.py` de dentro da pasta do projeto |
| Acesso negado pela rede | Firewall do Windows bloqueando a porta | Libere a porta 5000 (ou a definida em `PORT`) no firewall |

---

##  Roadmap

- [ ] Suporte a `paperSize=legal` no backend (hoje só A4 e Carta)
- [ ] Histórico de impressões com dashboard administrativo
- [ ] Fila de impressão com múltiplas impressoras
- [ ] Suporte a Linux/macOS (via CUPS)
- [ ] Autenticação e controle de usuários
- [ ] Webhooks do Mercado Pago (em vez de polling)
- [ ] Preço configurável via `.env`
- [ ] Testes automatizados

---

## Contribuindo

Contribuições são muito bem-vindas!

1. Faça um fork do projeto
2. Crie uma branch (`git checkout -b feature/minha-feature`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona minha feature'`)
4. Push para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

Para bugs ou sugestões, abra uma [issue](https://github.com/lucasbastosrezende/impressoraAutomatizada/issues).

---

## Licença

Este projeto é distribuído sob a licença **MIT**. Veja o arquivo `LICENSE` para mais detalhes.

---

<p align="center">
  Feito com ☕ e reciclagem de impressoras por <a href="https://github.com/lucasbastosrezende">Lucas Bastos Rezende</a>
</p>
