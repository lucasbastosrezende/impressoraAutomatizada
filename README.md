# Servidor de Impressão Automatizada

Este projeto é um sistema web feito para transformar uma impressora comum, principalmente uma impressora USB antiga, em uma impressora acessível pelo navegador. A ideia é simples: o cliente envia o arquivo, escolhe as opções de impressão, paga via Pix e o servidor manda o documento para a impressora instalada no Windows.

O projeto foi organizado com nomes em português brasileiro para facilitar a apresentação no TCC e a leitura pela banca.

---

## Objetivo do Projeto

O objetivo é reduzir a dependência de processos manuais em papelarias, bibliotecas, lan houses e pequenos comércios. Em vez de receber arquivo por pendrive, WhatsApp ou e-mail, o atendente pode deixar o sistema aberto na rede local. O usuário acessa pelo celular ou computador, envia o documento e acompanha as etapas até a impressão.

Também existe um objetivo sustentável: reaproveitar impressoras antigas que ainda funcionam bem, mas não possuem Wi-Fi, aplicativo próprio ou integração moderna com pagamentos.

---

## Funcionalidades

- Envio de arquivos PDF, DOC, DOCX, TXT e imagens.
- Arrastar e soltar arquivo na tela.
- Pré-visualização de PDFs página por página.
- Pré-visualização de imagens com rotação e preto e branco.
- Escolha de páginas específicas do PDF.
- Quantidade de cópias por página.
- Impressão normal ou frente e verso, quando a impressora permitir.
- Tamanho de papel A4, Carta ou Ofício.
- Orientação retrato ou paisagem.
- Modo colorido ou preto e branco.
- Pagamento Pix dinâmico via Mercado Pago.
- Pix estático como alternativa quando o Mercado Pago não estiver configurado.
- Modo de demonstração para apresentação do TCC sem cobrança real.
- Exclusão automática do arquivo enviado depois da tentativa de impressão.

---

## Tecnologias Usadas

| Tecnologia | Para que serve |
|---|---|
| Python | Linguagem principal do backend |
| Flask | Cria o servidor web e as rotas da API |
| SumatraPDF | Envia arquivos para impressão silenciosa no Windows |
| Pillow | Converte imagens em PDF antes da impressão |
| Mercado Pago SDK | Cria e consulta cobranças Pix dinâmicas |
| qrcode | Gera QR Code Pix estático |
| HTML, CSS e JavaScript | Criam a interface do usuário |
| pdf.js | Mostra a prévia das páginas do PDF no navegador |
| pdf-lib | Cria um novo PDF com páginas e cópias selecionadas |

---

## Arquitetura

```text
Navegador do usuário
        |
        | Arquivo, opções e pagamento
        v
servidor.py
        |
        | usa
        v
servico_pix.py              servico_impressao.py
        |                           |
        | Mercado Pago / QR Pix      | SumatraPDF + Pillow
        v                           v
Pagamento aprovado          Impressora instalada no Windows
```

### Principais arquivos

| Arquivo | Responsabilidade |
|---|---|
| `servidor.py` | Cria o servidor Flask, recebe arquivos, gera Pix e chama a impressão |
| `servico_impressao.py` | Converte imagens em PDF e manda o arquivo para o SumatraPDF imprimir |
| `servico_pix.py` | Cria Pix dinâmico pelo Mercado Pago ou Pix estático local |
| `templates/index.html` | Estrutura da tela em etapas |
| `static/js/index.js` | Controla upload, prévia, resumo, pagamento e envio para impressão |
| `static/css/index.css` | Define a aparência visual do sistema |
| `SumatraPDF/SumatraPDF.exe` | Programa usado para impressão silenciosa no Windows |

---

## Fluxo de Uso

1. O usuário escolhe ou arrasta um arquivo.
2. O sistema mostra a prévia quando possível.
3. O usuário escolhe páginas, cópias, cor, orientação e tamanho do papel.
4. O sistema calcula o valor total.
5. O sistema gera o Pix.
6. Depois do pagamento aprovado, o arquivo é enviado para impressão.
7. O arquivo temporário é apagado do computador.

---

## Instalação

### 1. Criar e ativar o ambiente virtual

```powershell
python -m venv venv
.\venv\Scripts\activate
```

### 2. Instalar dependências

```powershell
pip install -r requirements.txt
```

### 3. Criar o arquivo `.env`

Copie o `.env.example` para `.env` e ajuste os valores:

```powershell
Copy-Item .env.example .env
```

Exemplo:

```env
FLASK_APP=servidor:aplicacao
FLASK_ENV=development
PORTA=5000
ENDERECO_SERVIDOR=0.0.0.0

IMPRESSORA_PADRAO="HP LaserJet Professional M1132 MFP"
CAMINHO_SUMATRA=

TOKEN_MERCADO_PAGO=
CHAVE_PIX=sua-chave-pix-aqui
NOME_RECEBEDOR_PIX=Capital Papelaria
CIDADE_RECEBEDOR_PIX=Brasilia
```

### 4. Descobrir o nome da impressora no Windows

```powershell
Get-Printer | Select-Object Name
```

Copie o nome exatamente como aparece e coloque em `IMPRESSORA_PADRAO`.

### 5. Executar o servidor

```powershell
python servidor.py
```

Abra no navegador:

```text
http://localhost:5000
```

Se outro aparelho estiver na mesma rede, ele pode acessar usando o IP do computador que está rodando o servidor.

---

## Configuração do Pix

### Pix dinâmico com Mercado Pago

Se `TOKEN_MERCADO_PAGO` estiver preenchido, o sistema cria uma cobrança Pix real pelo Mercado Pago. Depois disso, o frontend consulta a rota `/verificar-pagamento/<id>` a cada três segundos. Quando o Mercado Pago responde `approved`, a impressão é liberada automaticamente.

### Pix estático

Se o Mercado Pago não estiver configurado, mas `CHAVE_PIX` estiver preenchida, o sistema gera um QR Code Pix estático. Nesse modo, não existe confirmação automática. Por isso a tela mostra o botão "Confirmar pagamento".

### Modo de demonstração do TCC

Na tela de resumo existe a opção "Ativar modo de demonstração do TCC". Esse modo mostra um QR Code de teste e um botão para simular pagamento aprovado. Ele serve para apresentação, sem gerar cobrança real.

---

## Rotas da API

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/` | Mostra a tela principal |
| `POST` | `/gerar-pix` | Recebe `{ "valor": 1.50 }` e retorna QR Code Pix |
| `GET` | `/verificar-pagamento/<id_pagamento>` | Consulta pagamento no Mercado Pago |
| `POST` | `/imprimir` | Recebe o arquivo final e manda imprimir |

### Campos aceitos em `/imprimir`

| Campo | Valores |
|---|---|
| `arquivo` | Arquivo enviado pelo navegador |
| `tipoImpressao` | `normal` ou `frente_e_verso` |
| `tamanhoPapel` | `a4`, `carta` ou `oficio` |
| `orientacao` | `retrato` ou `paisagem` |
| `modoCor` | `colorido` ou `preto_e_branco` |
| `ajustePagina` | `ajustar`, `reduzir` ou `tamanho_real` |
| `quantidadeCopias` | Número inteiro |

---

## Estrutura de Pastas

```text
impressaoAutomatizadaHTML/
├── servidor.py
├── servico_impressao.py
├── servico_pix.py
├── requirements.txt
├── .env.example
├── README.md
├── SumatraPDF/
│   ├── SumatraPDF.exe
│   └── SumatraPDF-settings.txt
├── templates/
│   └── index.html
├── static/
│   ├── css/
│   │   └── index.css
│   ├── js/
│   │   └── index.js
│   └── logo/
│       ├── logo.png
│       └── logo-removebg-preview.png
└── uploads/
```

---

## Observações de Segurança

- O arquivo enviado fica salvo apenas temporariamente na pasta `uploads`.
- Depois da tentativa de impressão, o backend apaga o arquivo no bloco `finally`.
- O modo `debug=True` é útil para desenvolvimento e TCC, mas não deve ser usado em produção exposta à internet.
- Para uso real em produção, o ideal é colocar autenticação, HTTPS e regras de firewall.

---

## Solução de Problemas

| Problema | Possível causa | Como resolver |
|---|---|---|
| SumatraPDF não encontrado | `CAMINHO_SUMATRA` está errado | Deixe vazio para usar `./SumatraPDF/SumatraPDF.exe` ou informe o caminho correto |
| Impressão não sai | Nome da impressora diferente do Windows | Rode `Get-Printer` e copie o nome exato para `IMPRESSORA_PADRAO` |
| Pix não gera | Token e chave Pix vazios | Configure `TOKEN_MERCADO_PAGO` ou `CHAVE_PIX` |
| Pagamento não confirma sozinho | O sistema está em Pix estático | Use Mercado Pago ou confirme manualmente na tela |
| PDF não muda páginas | PDF pode ter proteção ou estrutura incompatível | O navegador pode não conseguir editar alguns PDFs específicos |
| Outro celular não acessa | Firewall bloqueando a porta | Libere a porta configurada em `PORTA` no Windows |

---

## Possíveis Melhorias Futuras

- Criar painel administrativo com histórico de impressões.
- Colocar preço por cópia no `.env`.
- Adicionar autenticação para atendentes.
- Usar webhook do Mercado Pago em vez de consulta por intervalo.
- Adicionar fila com múltiplas impressoras.
- Criar instalador para Windows.
- Preparar versão Linux com CUPS.
