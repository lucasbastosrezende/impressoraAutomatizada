"""
Serviço de pagamento Pix.

Este arquivo tem duas responsabilidades:
1. Criar cobrança Pix dinâmica pelo Mercado Pago, quando houver token no `.env`.
2. Gerar QR Code Pix estático, quando o projeto estiver sem Mercado Pago.
"""

import base64
import io
import unicodedata

import mercadopago  # pyre-ignore[21]
import qrcode  # pyre-ignore[21]


class ServicoPix:
    """
    Gera cobranças Pix e consulta pagamentos.

    O modo Mercado Pago é o mais completo, porque permite verificar se o
    pagamento foi aprovado. O modo estático serve como alternativa simples para
    demonstração ou uso manual.
    """

    def __init__(self, token_acesso="", chave_pix="", nome_recebedor="", cidade_recebedor=""):
        # Dados lidos do arquivo .env.
        self.token_acesso = token_acesso
        self.chave_pix = chave_pix
        self.nome_recebedor = self._limpar_texto_pix(nome_recebedor, 25)
        self.cidade_recebedor = self._limpar_texto_pix(cidade_recebedor, 15)

        # O SDK só é criado quando existe token. Sem token, usamos o Pix estático.
        self.sdk = mercadopago.SDK(token_acesso) if token_acesso else None

    @property
    def tem_mercado_pago(self):
        """Informa se o Mercado Pago está configurado para cobrança dinâmica."""
        return self.sdk is not None

    def criar_pagamento(self, valor, descricao="Impressão - Capital Papelaria", email_pagador="cliente@email.com"):
        """
        Cria uma cobrança Pix dinâmica no Mercado Pago.

        Retorna os dados que o frontend precisa para mostrar o QR Code e começar
        a verificar o pagamento.
        """

        if not self.sdk:
            raise RuntimeError("Token de acesso do Mercado Pago não configurado no .env.")

        dados_pagamento = {
            "transaction_amount": float(valor),
            "description": descricao,
            "payment_method_id": "pix",
            "payer": {"email": email_pagador},
        }

        resultado = self.sdk.payment().create(dados_pagamento)

        if resultado["status"] not in [200, 201]:
            mensagem = resultado.get("response", {}).get(
                "message",
                "Erro desconhecido ao criar pagamento.",
            )
            raise RuntimeError(f"Erro do Mercado Pago: {mensagem}")

        resposta = resultado["response"]
        dados_transacao = resposta.get("point_of_interaction", {}).get("transaction_data", {})

        qr_base64 = dados_transacao.get("qr_code_base64", "")
        codigo_copia_cola = dados_transacao.get("qr_code", "")

        if qr_base64:
            qr_base64 = f"data:image/png;base64,{qr_base64}"

        return {
            "id_pagamento": resposta["id"],
            "qr_base64": qr_base64,
            "codigo_copia_cola": codigo_copia_cola,
            "situacao": resposta["status"],
            "valor": f"{valor:.2f}",
        }

    def consultar_pagamento(self, id_pagamento):
        """
        Consulta no Mercado Pago se a cobrança foi aprovada, recusada ou continua pendente.
        """

        if not self.sdk:
            raise RuntimeError("Token de acesso do Mercado Pago não configurado.")

        resultado = self.sdk.payment().get(id_pagamento)

        if resultado["status"] != 200:
            mensagem = resultado.get("response", {}).get("message", "desconhecido")
            raise RuntimeError(f"Erro ao consultar pagamento: {mensagem}")

        resposta = resultado["response"]
        return {
            "id_pagamento": resposta["id"],
            "situacao": resposta["status"],
            "detalhe_situacao": resposta.get("status_detail", ""),
        }

    @staticmethod
    def _limpar_texto_pix(texto, tamanho_maximo):
        """
        Remove acentos e corta o texto no tamanho aceito pelo padrão Pix.

        O BR Code usa campos pequenos e mais seguros em ASCII, por isso essa
        limpeza evita QR Code inválido por causa de caracteres especiais.
        """

        normalizado = unicodedata.normalize("NFKD", texto)
        texto_ascii = normalizado.encode("ASCII", "ignore").decode("ASCII")
        return texto_ascii[:tamanho_maximo]

    @staticmethod
    def _montar_campo_emv(codigo, valor):
        """
        Monta um campo no formato EMV: código + tamanho + valor.

        Exemplo: código "00" e valor "01" viram "000201".
        """

        tamanho = str(len(valor)).zfill(2)
        return f"{codigo}{tamanho}{valor}"

    @staticmethod
    def _calcular_crc16(conteudo):
        """
        Calcula o CRC16 exigido no final do Pix copia e cola.

        Esse cálculo funciona como um dígito verificador: ajuda o app do banco a
        saber se o código foi copiado sem erro.
        """

        crc = 0xFFFF
        for byte in conteudo.encode("utf-8"):
            crc ^= byte << 8
            for _ in range(8):
                if crc & 0x8000:
                    crc = (crc << 1) ^ 0x1021
                else:
                    crc = crc << 1
                crc &= 0xFFFF
        return format(crc, "04X")

    def gerar_codigo_estatico(self, valor, txid="***"):
        """Gera o texto Pix copia e cola no padrão BR Code EMV."""

        conteudo = self._montar_campo_emv("00", "01")
        conteudo += self._montar_campo_emv("01", "12")

        conta_pix = self._montar_campo_emv("00", "br.gov.bcb.pix")
        conta_pix += self._montar_campo_emv("01", self.chave_pix)
        conteudo += self._montar_campo_emv("26", conta_pix)

        conteudo += self._montar_campo_emv("52", "0000")
        conteudo += self._montar_campo_emv("53", "986")

        if valor > 0:
            conteudo += self._montar_campo_emv("54", f"{valor:.2f}")

        conteudo += self._montar_campo_emv("58", "BR")
        conteudo += self._montar_campo_emv("59", self.nome_recebedor)
        conteudo += self._montar_campo_emv("60", self.cidade_recebedor)

        identificador = self._montar_campo_emv("05", self._limpar_texto_pix(txid, 25))
        conteudo += self._montar_campo_emv("62", identificador)

        conteudo += "6304"
        conteudo += self._calcular_crc16(conteudo)
        return conteudo

    def gerar_qr_estatico(self, valor, txid="***"):
        """
        Gera um QR Code estático em imagem base64.

        Esse modo não confirma pagamento automaticamente; por isso a interface
        mostra um botão de confirmação manual.
        """

        codigo_pix = self.gerar_codigo_estatico(valor, txid)

        qr_code = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr_code.add_data(codigo_pix)
        qr_code.make(fit=True)

        imagem = qr_code.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        imagem.save(buffer, format="PNG")
        buffer.seek(0)

        imagem_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        return {
            "id_pagamento": None,
            "qr_base64": f"data:image/png;base64,{imagem_base64}",
            "codigo_copia_cola": codigo_pix,
            "situacao": "estatico",
            "valor": f"{valor:.2f}",
        }
