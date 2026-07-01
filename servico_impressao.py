"""
Serviço de impressão do sistema.

Este arquivo concentra tudo que conversa diretamente com a impressora.
O restante do projeto só precisa chamar a classe `ServicoImpressao`, sem saber
como o SumatraPDF é executado ou como uma imagem vira PDF antes de imprimir.
"""

import os
import subprocess

from PIL import Image


class ServicoImpressao:
    """
    Controla o envio de arquivos para a impressora configurada no Windows.

    O SumatraPDF é usado porque ele consegue imprimir arquivos pela linha de
    comando de forma silenciosa, ou seja, sem abrir uma janela para o usuário.
    """

    def __init__(self, caminho_sumatra, impressora_padrao):
        # Caminho completo do executável SumatraPDF.exe.
        self.caminho_sumatra = caminho_sumatra

        # Nome da impressora exatamente como aparece no Windows.
        self.impressora_padrao = impressora_padrao

    def imprimir_arquivo(self, caminho_arquivo, nome_impressora=None, configuracoes_impressao=None):
        """
        Imprime um arquivo recebido pelo site.

        Parâmetros:
        - caminho_arquivo: caminho completo do arquivo salvo temporariamente.
        - nome_impressora: impressora escolhida; se vier vazio, usa a padrão.
        - configuracoes_impressao: texto no formato entendido pelo SumatraPDF,
          por exemplo: "duplex,paper=A4,monochrome,fit".
        """

        # Se nenhuma impressora específica foi enviada, usamos a impressora padrão.
        impressora = nome_impressora or self.impressora_padrao
        if not impressora:
            raise ValueError("Nome da impressora não configurado.")

        # Antes de mandar imprimir, garantimos que o arquivo realmente existe.
        if not os.path.exists(caminho_arquivo):
            raise FileNotFoundError(f"Arquivo não encontrado: {caminho_arquivo}")

        # Descobre a extensão para saber se precisa de tratamento especial.
        extensao = caminho_arquivo.rsplit(".", 1)[-1].lower()

        # Imagens são convertidas para PDF porque o SumatraPDF imprime PDF de forma
        # mais previsível, respeitando melhor orientação, escala e modo de cor.
        if extensao in ["jpg", "jpeg", "png", "bmp", "tiff"]:
            caminho_pdf_temporario = caminho_arquivo.rsplit(".", 1)[0] + ".pdf"

            try:
                imagem = Image.open(caminho_arquivo)

                # Quando o usuário escolhe preto e branco, a imagem vira 1 bit.
                # Isso reduz bastante o tamanho do arquivo enviado para a fila.
                modo_preto_e_branco = (
                    configuracoes_impressao
                    and "monochrome" in configuracoes_impressao.lower()
                )

                if modo_preto_e_branco:
                    imagem = imagem.convert("1")
                elif imagem.mode != "RGB":
                    imagem = imagem.convert("RGB")

                # Se o usuário escolheu paisagem, giramos a imagem antes de salvar.
                modo_paisagem = (
                    configuracoes_impressao
                    and "landscape" in configuracoes_impressao.lower()
                )
                if modo_paisagem:
                    if hasattr(Image, "Transpose"):
                        imagem = imagem.transpose(Image.Transpose.ROTATE_90)
                    else:
                        imagem = imagem.transpose(Image.ROTATE_90)

                imagem.save(caminho_pdf_temporario, "PDF", resolution=100.0)
                caminho_arquivo = caminho_pdf_temporario

            except Exception as erro:
                raise Exception(f"Erro ao converter imagem para PDF: {erro}") from erro

        # Montamos o comando como lista para evitar problemas com espaços em nomes
        # de arquivos, nomes de impressoras e caminhos do Windows.
        comando = [
            self.caminho_sumatra,
            "-print-to",
            impressora,
            "-silent",
        ]

        if configuracoes_impressao:
            comando.extend(["-print-settings", configuracoes_impressao])

        comando.append(caminho_arquivo)

        print(f"Executando impressão: {comando}")

        try:
            resultado = subprocess.run(
                comando,
                shell=False,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if resultado.returncode != 0:
                raise Exception(f"Ocorreu um erro na impressão: {resultado.stderr}")

            return True, "Enviado com sucesso"

        except subprocess.TimeoutExpired as erro:
            raise Exception(
                "Tempo esgotado na impressão. A impressora demorou muito para responder."
            ) from erro
