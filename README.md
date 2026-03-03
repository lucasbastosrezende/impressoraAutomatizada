# Servidor Flask de Impressão Automatizada 

Este é um projeto em Python utilizando o microframework **Flask** para criar um servidor web local que recebe arquivos via upload e os envia automaticamente para uma impressora configurada no sistema. 

O sistema foi desenhado para rodar em ambiente **Windows** e utiliza o **SumatraPDF** para a impressão silenciosa de arquivos PDF, além de bibliotecas nativas do Windows para a impressão de imagens.

##  Funcionalidades

* Interface web simples para upload de arquivos.
* Suporte automatizado para impressão de arquivos **PDF** (via SumatraPDF).
* Suporte automatizado para impressão de **Imagens** (via `rundll32.exe`).
* Tratamento de erros de timeout e falhas no spooler de impressão.
* Acesso via rede local (rodando em `0.0.0.0:5000`).

## Pré-requisitos

Para rodar este projeto, você precisará ter instalado em sua máquina:

* **Sistema Operacional:** Windows (obrigatório devido ao uso do `rundll32.exe` e caminhos de diretório).
* **Python 3.x** instalado.
* **SumatraPDF**: Necessário para a impressão via linha de comando de arquivos PDF. Você pode baixar a versão portátil e colocá-la na pasta do projeto.
* Uma impressora instalada e configurada no Windows.

## Instalação e Configuração

**1. Clone ou baixe o repositório**
Salve os arquivos do projeto em um diretório de sua preferência.

**2. Instale as dependências do Python**
Abra o terminal na pasta do projeto e instale o Flask e o Werkzeug:
Terminal:
pip install flask werkzeug
