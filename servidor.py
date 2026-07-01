"""
Servidor principal da aplicação de impressão automatizada.

Este arquivo cria o site Flask, recebe os arquivos enviados pelo usuário,
controla a cobrança Pix e chama o serviço responsável por imprimir.
"""

import os
import uuid

from dotenv import load_dotenv  # pyre-ignore[21]
from flask import Flask, jsonify, render_template, request  # pyre-ignore[21]
from werkzeug.utils import secure_filename  # pyre-ignore[21]

from servico_impressao import ServicoImpressao
from servico_pix import ServicoPix


# Carrega o arquivo .env para que o sistema consiga ler as configurações locais.
load_dotenv()

# Cria a aplicação Flask. É ela que registra as rotas do site e da API.
aplicacao = Flask(__name__)

# Pasta temporária onde os arquivos ficam enquanto aguardam a impressão.
PASTA_UPLOADS = "uploads"
os.makedirs(PASTA_UPLOADS, exist_ok=True)

# Extensões aceitas pelo sistema. Qualquer arquivo fora desta lista é recusado.
EXTENSOES_PERMITIDAS = {"pdf", "doc", "docx", "txt", "jpg", "jpeg", "png", "bmp", "tiff"}

# As variáveis em português são o padrão do projeto.
# As variáveis antigas em inglês continuam funcionando para não quebrar .env já existente.
IMPRESSORA_PADRAO = os.getenv(
    "IMPRESSORA_PADRAO",
    os.getenv("DEFAULT_PRINTER", "HP LaserJet Professional M1132 MFP"),
)
CAMINHO_SUMATRA_ENV = os.getenv("CAMINHO_SUMATRA", os.getenv("SUMATRA_PATH", ""))

if CAMINHO_SUMATRA_ENV:
    CAMINHO_SUMATRA = CAMINHO_SUMATRA_ENV
else:
    CAMINHO_SUMATRA = os.path.join(aplicacao.root_path, "SumatraPDF", "SumatraPDF.exe")

# Inicializa os serviços uma vez só, quando o servidor sobe.
servico_impressao = ServicoImpressao(CAMINHO_SUMATRA, IMPRESSORA_PADRAO)

TOKEN_MERCADO_PAGO = os.getenv(
    "TOKEN_MERCADO_PAGO",
    os.getenv("MERCADO_PAGO_ACCESS_TOKEN", ""),
)
CHAVE_PIX = os.getenv("CHAVE_PIX", os.getenv("PIX_KEY", ""))
NOME_RECEBEDOR_PIX = os.getenv(
    "NOME_RECEBEDOR_PIX",
    os.getenv("PIX_MERCHANT_NAME", "Capital Papelaria"),
)
CIDADE_RECEBEDOR_PIX = os.getenv(
    "CIDADE_RECEBEDOR_PIX",
    os.getenv("PIX_MERCHANT_CITY", "Brasilia"),
)

servico_pix = ServicoPix(
    token_acesso=TOKEN_MERCADO_PAGO,
    chave_pix=CHAVE_PIX,
    nome_recebedor=NOME_RECEBEDOR_PIX,
    cidade_recebedor=CIDADE_RECEBEDOR_PIX,
)

if servico_pix.tem_mercado_pago:
    print("Mercado Pago configurado. Verificação automática de Pix ativada.")
elif CHAVE_PIX:
    print("Mercado Pago não configurado. Usando QR Code Pix estático.")
else:
    print("Nenhuma chave Pix configurada no .env.")


def arquivo_permitido(nome_arquivo):
    """Confere se o arquivo tem uma extensão aceita pelo sistema."""

    return "." in nome_arquivo and nome_arquivo.rsplit(".", 1)[1].lower() in EXTENSOES_PERMITIDAS


@aplicacao.route("/")
def pagina_inicial():
    """Mostra a tela principal do sistema."""

    return render_template("index.html")


@aplicacao.route("/gerar-pix", methods=["POST"])
def gerar_pix():
    """Gera o QR Code Pix para o valor calculado no resumo da impressão."""

    dados = request.get_json()
    if not dados or "valor" not in dados:
        return jsonify({"situacao": "erro", "mensagem": "Valor não informado."}), 400

    try:
        valor = float(dados["valor"])
        if valor <= 0:
            return jsonify({"situacao": "erro", "mensagem": "Valor deve ser maior que zero."}), 400
    except (ValueError, TypeError):
        return jsonify({"situacao": "erro", "mensagem": "Valor inválido."}), 400

    try:
        if servico_pix.tem_mercado_pago:
            resultado = servico_pix.criar_pagamento(valor)
            return jsonify({
                "situacao": "sucesso",
                "modo": "mercadopago",
                "id_pagamento": resultado["id_pagamento"],
                "qr_base64": resultado["qr_base64"],
                "codigo_copia_cola": resultado["codigo_copia_cola"],
                "situacao_pagamento": resultado["situacao"],
                "valor": resultado["valor"],
            }), 200

        if servico_pix.chave_pix:
            identificador = uuid.uuid4().hex[:25]
            resultado = servico_pix.gerar_qr_estatico(valor, identificador)
            return jsonify({
                "situacao": "sucesso",
                "modo": "estatico",
                "id_pagamento": None,
                "qr_base64": resultado["qr_base64"],
                "codigo_copia_cola": resultado["codigo_copia_cola"],
                "situacao_pagamento": "estatico",
                "valor": resultado["valor"],
            }), 200

        return jsonify({"situacao": "erro", "mensagem": "Nenhuma chave Pix configurada no .env."}), 500

    except Exception as erro:
        return jsonify({"situacao": "erro", "mensagem": f"Erro ao gerar Pix: {erro}"}), 500


@aplicacao.route("/verificar-pagamento/<int:id_pagamento>", methods=["GET"])
def verificar_pagamento(id_pagamento):
    """Consulta se um pagamento do Mercado Pago já foi aprovado."""

    if not servico_pix.tem_mercado_pago:
        return jsonify({"situacao": "erro", "mensagem": "Mercado Pago não configurado."}), 500

    try:
        resultado = servico_pix.consultar_pagamento(id_pagamento)
        return jsonify({
            "situacao": "sucesso",
            "situacao_pagamento": resultado["situacao"],
            "detalhe_situacao": resultado["detalhe_situacao"],
        }), 200
    except Exception as erro:
        return jsonify({"situacao": "erro", "mensagem": str(erro)}), 500


@aplicacao.route("/imprimir", methods=["POST"])
def imprimir():
    """
    Recebe o arquivo final do navegador e manda para a impressora.

    O arquivo pode ser o original ou um PDF novo criado no próprio navegador,
    já com páginas removidas, páginas repetidas e rotação aplicada.
    """

    if "arquivo" not in request.files:
        return jsonify({"situacao": "erro", "mensagem": "Nenhum arquivo enviado."}), 400

    arquivo = request.files["arquivo"]
    if arquivo.filename == "":
        return jsonify({"situacao": "erro", "mensagem": "Nenhum arquivo selecionado."}), 400

    if not arquivo_permitido(arquivo.filename):
        return jsonify({"situacao": "erro", "mensagem": "Tipo de arquivo não permitido."}), 400

    nome_seguro = secure_filename(arquivo.filename)
    caminho_relativo = os.path.join(PASTA_UPLOADS, nome_seguro)
    arquivo.save(caminho_relativo)
    caminho_absoluto = os.path.abspath(caminho_relativo)

    # Opções escolhidas na interface. Os nomes vêm em português para combinar
    # com o restante do código e deixar o TCC mais fácil de explicar.
    tipo_impressao = request.form.get("tipoImpressao", "normal")
    tamanho_papel = request.form.get("tamanhoPapel", "a4")
    orientacao = request.form.get("orientacao", "retrato")
    modo_cor = request.form.get("modoCor", "preto_e_branco")
    ajuste_pagina = request.form.get("ajustePagina", "ajustar")
    quantidade_copias = request.form.get("quantidadeCopias", "1")

    # O SumatraPDF espera palavras específicas em inglês. Por isso o sistema
    # recebe nomes amigáveis em português e traduz somente nesta parte.
    configuracoes = []

    if tipo_impressao == "frente_e_verso":
        configuracoes.append("duplex")

    if tamanho_papel == "a4":
        configuracoes.append("paper=A4")
    elif tamanho_papel == "carta":
        configuracoes.append("paper=letter")
    elif tamanho_papel == "oficio":
        configuracoes.append("paper=legal")

    if orientacao == "paisagem":
        configuracoes.append("landscape")

    if modo_cor == "preto_e_branco":
        configuracoes.append("monochrome")
    else:
        configuracoes.append("color")

    mapa_ajuste = {
        "ajustar": "fit",
        "reduzir": "shrink",
        "tamanho_real": "noscale",
    }
    if ajuste_pagina in mapa_ajuste:
        configuracoes.append(mapa_ajuste[ajuste_pagina])

    try:
        numero_copias = int(quantidade_copias)
        if numero_copias > 1:
            configuracoes.append(f"{numero_copias}x")
    except ValueError:
        pass

    texto_configuracoes = ",".join(configuracoes) if configuracoes else None

    try:
        servico_impressao.imprimir_arquivo(
            caminho_absoluto,
            configuracoes_impressao=texto_configuracoes,
        )
        return jsonify({
            "situacao": "sucesso",
            "mensagem": "Arquivo enviado para impressão com sucesso!",
        }), 200

    except Exception as erro:
        return jsonify({"situacao": "erro", "mensagem": str(erro)}), 500

    finally:
        # O arquivo é apagado mesmo se a impressão falhar. Isso protege documentos
        # pessoais do usuário e evita acumular lixo na pasta uploads.
        try:
            if os.path.exists(caminho_absoluto):
                os.remove(caminho_absoluto)
                print(f"Arquivo temporário apagado por segurança: {caminho_absoluto}")
        except Exception as erro_limpeza:
            print(f"Erro ao apagar arquivo temporário {caminho_absoluto}: {erro_limpeza}")


if __name__ == "__main__":
    porta = int(os.getenv("PORTA", os.getenv("PORT", 5000)))
    endereco = os.getenv("ENDERECO_SERVIDOR", os.getenv("HOST", "0.0.0.0"))

    print(f"Servidor Flask rodando na porta {porta}. Impressora: {IMPRESSORA_PADRAO}")
    aplicacao.run(host=endereco, port=porta, debug=True)
