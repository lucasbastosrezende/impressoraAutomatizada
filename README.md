# Servidor Flask de Impressão Automatizada 🖨️♻️

> **Objetivo do Projeto: Dar uma nova vida a milhares de impressoras esquecidas.**
>
> Você já parou para pensar em quantas impressoras antigas, incrivelmente robustas e perfeitamente funcionais, estão pegando poeira ou sendo descartadas neste exato momento? O único "defeito" da grande maioria delas é não possuírem conectividade Wi-Fi, integração na nuvem ou a capacidade de receber arquivos diretamente de um smartphone.
>
> Este projeto nasceu para mudar essa realidade e **salvar da obsolescência milhares de equipamentos**. Nosso objetivo é democratizar a impressão moderna, transformando qualquer máquina em um impressora moderna. Com esta aplicação, damos funções novas a impressoras legadas: a capacidade de imprimir de qualquer lugar da sua rede a partir de qualquer dispositivo.

---

### Sobre o Projeto

Este é um projeto em Python utilizando o microframework **Flask** para criar um servidor web local que recebe arquivos via upload e os envia automaticamente para uma impressora configurada no sistema. 

O sistema foi desenhado para rodar em ambiente **Windows** e utiliza o **SumatraPDF** para a impressão silenciosa de arquivos PDF, além de bibliotecas nativas do Windows para a impressão de imagens.

### Sobre o Projeto

Este é um projeto em Python utilizando o microframework **Flask** para criar um servidor web local que recebe arquivos via upload e os envia automaticamente para uma impressora configurada no sistema. 

O sistema foi desenhado para rodar em ambiente **Windows** e utiliza o **SumatraPDF** para a impressão silenciosa de arquivos PDF, além de bibliotecas nativas do Windows para a impressão de imagens.

##  Funcionalidades

* Interface web simples para upload de arquivos.
* Suporte automatizado para impressão de arquivos **PDF** (via SumatraPDF).
* Suporte automatizado para impressão de **Imagens** (via `rundll32.exe`).

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
