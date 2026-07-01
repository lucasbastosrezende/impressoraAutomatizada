// Configura o arquivo auxiliar do PDF.js. Sem isso, a biblioteca não renderiza PDFs corretamente.
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// Valor cobrado por cópia. A banca pode alterar este número para simular outros preços.
const VALOR_POR_COPIA = 0.50;

// Variáveis principais que guardam o estado atual da tela.
let etapaAtual = 1;
let arquivoSelecionado = null;
let documentoPdf = null;
let dadosPaginas = [];
let bytesPdfOriginal = null;
let imagemAtual = null;
let intervaloVerificacaoPix = null;
let idPagamentoAtual = null;

// Quando a página termina de carregar, registramos os eventos da interface.
document.addEventListener("DOMContentLoaded", function () {
    configurarEnvioArquivo();

    // Sempre que orientação ou cor mudam, a prévia precisa ser redesenhada.
    document.querySelectorAll('input[name="orientacao"], input[name="modoCor"]').forEach((opcao) => {
        opcao.addEventListener("change", () => {
            if (arquivoSelecionado && arquivoSelecionado.type === "application/pdf") {
                renderizarPaginasPdf();
            } else if (arquivoSelecionado && arquivoSelecionado.type.includes("image")) {
                atualizarVisualizacaoImagem();
            }
        });
    });
});

function obterValorSelecionado(nomeCampo, valorPadrao) {
    // Lê o valor marcado em um grupo de radio. Se nada estiver marcado, usa o padrão.
    return document.querySelector(`input[name="${nomeCampo}"]:checked`)?.value || valorPadrao;
}

function configurarEnvioArquivo() {
    // Prepara clique, arrastar e soltar para o campo de arquivo.
    const areaEnvio = document.getElementById("areaEnvio");
    const campoArquivo = document.getElementById("campoArquivo");

    areaEnvio.addEventListener("dragover", (evento) => {
        evento.preventDefault();
        areaEnvio.classList.add("arrastando-arquivo");
    });

    areaEnvio.addEventListener("dragleave", () => {
        areaEnvio.classList.remove("arrastando-arquivo");
    });

    areaEnvio.addEventListener("drop", (evento) => {
        evento.preventDefault();
        areaEnvio.classList.remove("arrastando-arquivo");

        const arquivos = evento.dataTransfer.files;
        if (arquivos.length > 0) {
            campoArquivo.files = arquivos;
            lidarComArquivoSelecionado(arquivos[0]);
        }
    });

    campoArquivo.addEventListener("change", (evento) => {
        if (evento.target.files.length > 0) {
            lidarComArquivoSelecionado(evento.target.files[0]);
        }
    });
}

async function lidarComArquivoSelecionado(arquivo) {
    // Guarda o arquivo escolhido e atualiza a primeira etapa da interface.
    arquivoSelecionado = arquivo;
    documentoPdf = null;
    dadosPaginas = [];
    bytesPdfOriginal = null;
    imagemAtual = null;

    const tamanhoEmMb = (arquivo.size / 1024 / 1024).toFixed(2);

    document.getElementById("textoArquivoPendente").style.display = "none";
    document.getElementById("nomeArquivo").textContent = arquivo.name;
    document.getElementById("tamanhoArquivo").textContent = `${tamanhoEmMb} MB`;
    document.getElementById("previsualizacaoArquivo").style.display = "block";
    document.getElementById("botaoContinuarEtapa1").classList.remove("oculto");

    document.getElementById("conteinerPaginas").style.display = "grid";
    document.getElementById("conteinerVisualizacaoImagem").style.display = "none";
    document.getElementById("copiasGlobais").value = "1";

    if (arquivo.type === "application/pdf") {
        await carregarPdf(arquivo);
    } else if (arquivo.type.includes("image")) {
        carregarVisualizacaoImagem(arquivo);
    } else {
        // DOC, DOCX e TXT são enviados para impressão, mas não possuem prévia visual no navegador.
        document.getElementById("conteinerVisualizacao").style.display = "block";
        document.getElementById("conteinerPaginas").innerHTML = `
            <div class="mensagem-sem-previa">
                Visualização não disponível para este tipo de arquivo.<br>
                As opções escolhidas serão aplicadas normalmente.
            </div>
        `;
        atualizarTotais(1, 1);
    }
}

function removerArquivo() {
    // Limpa tudo que depende do arquivo escolhido.
    arquivoSelecionado = null;
    documentoPdf = null;
    dadosPaginas = [];
    bytesPdfOriginal = null;
    imagemAtual = null;

    document.getElementById("campoArquivo").value = "";
    document.getElementById("previsualizacaoArquivo").style.display = "none";
    document.getElementById("botaoContinuarEtapa1").classList.add("oculto");
    document.getElementById("textoArquivoPendente").style.display = "block";
    document.getElementById("conteinerVisualizacao").style.display = "none";
    document.getElementById("conteinerPaginas").innerHTML = "";
    document.getElementById("conteinerVisualizacaoImagem").style.display = "none";
    document.getElementById("copiasGlobais").value = "1";
    document.getElementById("situacaoImpressao").innerHTML = "";
}

function carregarVisualizacaoImagem(arquivo) {
    // FileReader transforma a imagem local em uma URL temporária para desenhar no canvas.
    const leitor = new FileReader();

    leitor.onload = function (evento) {
        const imagem = new Image();

        imagem.onload = function () {
            imagemAtual = imagem;
            document.getElementById("conteinerPaginas").style.display = "none";
            document.getElementById("conteinerVisualizacaoImagem").style.display = "block";
            atualizarVisualizacaoImagem();
            atualizarTotais(1, 1);
        };

        imagem.src = evento.target.result;
    };

    leitor.readAsDataURL(arquivo);
}

function atualizarVisualizacaoImagem() {
    // Redesenha a imagem conforme a orientação e o modo de cor escolhidos.
    if (!imagemAtual) return;

    const quadro = document.getElementById("quadroVisualizacaoImagem");
    const contexto = quadro.getContext("2d");
    const orientacao = obterValorSelecionado("orientacao", "retrato");
    const modoCor = obterValorSelecionado("modoCor", "preto_e_branco");

    const tamanhoMaximo = 1200;
    let largura = imagemAtual.width;
    let altura = imagemAtual.height;

    // Reduz a prévia para não pesar em imagens muito grandes.
    if (largura > tamanhoMaximo || altura > tamanhoMaximo) {
        const proporcao = Math.min(tamanhoMaximo / largura, tamanhoMaximo / altura);
        largura *= proporcao;
        altura *= proporcao;
    }

    contexto.clearRect(0, 0, quadro.width, quadro.height);
    contexto.filter = modoCor === "preto_e_branco" ? "grayscale(100%)" : "none";

    if (orientacao === "paisagem") {
        quadro.width = altura;
        quadro.height = largura;
        contexto.translate(altura / 2, largura / 2);
        contexto.rotate(-90 * Math.PI / 180);
        contexto.drawImage(imagemAtual, -largura / 2, -altura / 2, largura, altura);
    } else {
        quadro.width = largura;
        quadro.height = altura;
        contexto.drawImage(imagemAtual, 0, 0, largura, altura);
    }
}

async function carregarPdf(arquivo) {
    try {
        // Guardamos os bytes originais para criar um novo PDF se o usuário mudar páginas ou cópias.
        const bytes = await arquivo.arrayBuffer();
        bytesPdfOriginal = bytes;

        const bytesTipados = new Uint8Array(bytes);
        documentoPdf = await pdfjsLib.getDocument(bytesTipados).promise;

        // Este teste avisa se o PDF não puder ser editado pelo pdf-lib.
        try {
            await PDFLib.PDFDocument.load(bytesPdfOriginal);
            console.log("Compatibilidade com pdf-lib: OK");
        } catch (erroPdfLib) {
            console.warn("PDF com possível limitação de edição:", erroPdfLib);
            mostrarMensagem("Aviso: algumas funções de edição podem não funcionar com este PDF.", "aviso");
        }

        dadosPaginas = [];
        for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
            dadosPaginas.push({
                numeroPagina,
                selecionada: true,
                copias: 1,
            });
        }

        console.log(`PDF carregado com ${documentoPdf.numPages} páginas.`);
    } catch (erro) {
        console.error("Erro ao carregar PDF:", erro);
        mostrarMensagem("Erro ao carregar o PDF para pré-visualização.", "erro");
    }
}

async function criarPdfModificado() {
    // Cria um novo PDF contendo somente as páginas e cópias selecionadas.
    if (!bytesPdfOriginal || !documentoPdf) return null;

    try {
        const paginasSelecionadas = [];

        for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
            const caixaSelecao = document.getElementById(`pagina-${numeroPagina}`);
            const campoCopias = document.getElementById(`copias-${numeroPagina}`);

            if (caixaSelecao && caixaSelecao.checked) {
                const copias = parseInt(campoCopias.value, 10) || 0;
                for (let copia = 0; copia < copias; copia++) {
                    paginasSelecionadas.push(numeroPagina - 1);
                }
            }
        }

        if (paginasSelecionadas.length === 0) {
            throw new Error("Nenhuma página selecionada.");
        }

        let pdfOriginal;
        try {
            pdfOriginal = await PDFLib.PDFDocument.load(bytesPdfOriginal);
        } catch (primeiroErro) {
            console.warn("Primeira tentativa de abrir PDF falhou:", primeiroErro);
            const bytesNovos = await arquivoSelecionado.arrayBuffer();
            pdfOriginal = await PDFLib.PDFDocument.load(bytesNovos);
        }

        const novoPdf = await PDFLib.PDFDocument.create();
        const orientacao = obterValorSelecionado("orientacao", "retrato");
        const paginasCopiadas = await novoPdf.copyPages(pdfOriginal, paginasSelecionadas);

        paginasCopiadas.forEach((pagina) => {
            if (orientacao === "paisagem") {
                pagina.setRotation(PDFLib.degrees(90));
            }
            novoPdf.addPage(pagina);
        });

        const bytesNovoPdf = await novoPdf.save();
        const arquivoBlob = new Blob([bytesNovoPdf], { type: "application/pdf" });
        const nomeNovoArquivo = arquivoSelecionado.name.replace(/\.pdf$/i, "_modificado.pdf");

        return new File([arquivoBlob], nomeNovoArquivo, { type: "application/pdf" });
    } catch (erro) {
        console.error("Erro ao criar PDF modificado:", erro);
        throw new Error(`Erro ao processar PDF: ${erro.message}`);
    }
}

async function renderizarPaginasPdf() {
    // Desenha cada página do PDF em um canvas próprio.
    if (!documentoPdf) return;

    const conteinerPaginas = document.getElementById("conteinerPaginas");
    conteinerPaginas.innerHTML = "";

    const orientacao = obterValorSelecionado("orientacao", "retrato");
    const rotacao = orientacao === "paisagem" ? 270 : 0;
    const modoCor = obterValorSelecionado("modoCor", "preto_e_branco");
    const filtroCss = modoCor === "preto_e_branco" ? "filter: grayscale(100%);" : "";

    for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
        const itemPagina = document.createElement("article");
        itemPagina.className = "item-pagina";

        const rotuloPagina = document.createElement("div");
        rotuloPagina.className = "rotulo-pagina";
        rotuloPagina.textContent = `Página ${numeroPagina}`;

        const quadroPagina = document.createElement("canvas");
        quadroPagina.style.cssText = `
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto 10px auto;
            ${filtroCss}
        `;

        const controlesPagina = document.createElement("div");
        controlesPagina.className = "opcoes-pagina";

        const areaSelecao = document.createElement("div");
        const caixaSelecao = document.createElement("input");
        const rotuloSelecao = document.createElement("label");

        const areaQuantidade = document.createElement("div");
        const rotuloCopias = document.createElement("label");
        const campoCopias = document.createElement("input");

        const dadosExistentes = dadosPaginas.find((pagina) => pagina.numeroPagina === numeroPagina);

        caixaSelecao.type = "checkbox";
        caixaSelecao.id = `pagina-${numeroPagina}`;
        caixaSelecao.checked = dadosExistentes ? dadosExistentes.selecionada : true;
        caixaSelecao.addEventListener("change", () => {
            atualizarTotais();
            atualizarAparenciaPagina(itemPagina, caixaSelecao.checked);

            const dados = dadosPaginas.find((pagina) => pagina.numeroPagina === numeroPagina);
            if (dados) dados.selecionada = caixaSelecao.checked;
        });

        rotuloSelecao.htmlFor = `pagina-${numeroPagina}`;
        rotuloSelecao.textContent = "Imprimir";

        rotuloCopias.htmlFor = `copias-${numeroPagina}`;
        rotuloCopias.textContent = "Cópias:";

        campoCopias.type = "number";
        campoCopias.min = "0";
        campoCopias.max = "99";
        campoCopias.value = dadosExistentes ? dadosExistentes.copias : "1";
        campoCopias.id = `copias-${numeroPagina}`;
        campoCopias.addEventListener("change", () => {
            atualizarTotais();

            const dados = dadosPaginas.find((pagina) => pagina.numeroPagina === numeroPagina);
            if (dados) dados.copias = parseInt(campoCopias.value, 10) || 0;
        });

        itemPagina.appendChild(rotuloPagina);
        itemPagina.appendChild(quadroPagina);
        itemPagina.appendChild(controlesPagina);

        controlesPagina.appendChild(areaSelecao);
        controlesPagina.appendChild(areaQuantidade);
        areaSelecao.appendChild(caixaSelecao);
        areaSelecao.appendChild(rotuloSelecao);
        areaQuantidade.appendChild(rotuloCopias);
        areaQuantidade.appendChild(campoCopias);

        conteinerPaginas.appendChild(itemPagina);
        atualizarAparenciaPagina(itemPagina, caixaSelecao.checked);

        try {
            const paginaPdf = await documentoPdf.getPage(numeroPagina);
            const escala = 0.5;
            const viewport = paginaPdf.getViewport({ scale: escala, rotation: rotacao });

            quadroPagina.width = viewport.width;
            quadroPagina.height = viewport.height;

            await paginaPdf.render({
                canvasContext: quadroPagina.getContext("2d"),
                viewport,
            }).promise;
        } catch (erro) {
            console.error(`Erro ao renderizar página ${numeroPagina}:`, erro);
            quadroPagina.style.display = "none";

            const mensagemErro = document.createElement("div");
            mensagemErro.className = "erro-pagina";
            mensagemErro.textContent = "Erro ao carregar esta página.";
            itemPagina.appendChild(mensagemErro);
        }
    }

    atualizarTotais();
}

function atualizarAparenciaPagina(itemPagina, selecionada) {
    // Dá um retorno visual para mostrar se a página entra ou não na impressão.
    if (selecionada) {
        itemPagina.style.opacity = "1";
        itemPagina.style.borderColor = "#1e3a8a";
        itemPagina.style.transform = "scale(1)";
    } else {
        itemPagina.style.opacity = "0.7";
        itemPagina.style.borderColor = "#cbd5e1";
        itemPagina.style.transform = "scale(0.97)";
    }
}

function selecionarTodasPaginas() {
    // Marca ou desmarca todas as páginas de uma vez.
    if (!documentoPdf) return;

    const deveSelecionar = document.getElementById("marcarTodasPaginas").checked;

    for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
        const caixaSelecao = document.getElementById(`pagina-${numeroPagina}`);
        if (!caixaSelecao) continue;

        caixaSelecao.checked = deveSelecionar;

        const itemPagina = caixaSelecao.closest(".item-pagina");
        if (itemPagina) atualizarAparenciaPagina(itemPagina, deveSelecionar);

        const dados = dadosPaginas.find((pagina) => pagina.numeroPagina === numeroPagina);
        if (dados) dados.selecionada = deveSelecionar;
    }

    atualizarTotais();
}

function definirCopiasParaTodas() {
    // Aplica a mesma quantidade de cópias para todas as páginas.
    const copiasGlobais = parseInt(document.getElementById("copiasGlobais").value, 10) || 0;

    if (!documentoPdf) {
        atualizarTotais(1, copiasGlobais || 1);
        return;
    }

    for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
        const campoCopias = document.getElementById(`copias-${numeroPagina}`);
        if (campoCopias) campoCopias.value = String(copiasGlobais);

        const dados = dadosPaginas.find((pagina) => pagina.numeroPagina === numeroPagina);
        if (dados) dados.copias = copiasGlobais;
    }

    atualizarTotais();
}

function atualizarTotais(totalPaginasManual = null, totalCopiasManual = null) {
    // Atualiza os números exibidos na parte inferior da pré-visualização.
    if (totalPaginasManual !== null) {
        document.getElementById("totalPaginasSelecionadas").textContent = totalPaginasManual;
        document.getElementById("totalCopias").textContent = totalCopiasManual;
        return;
    }

    if (!documentoPdf) return;

    let totalPaginasSelecionadas = 0;
    let totalCopias = 0;

    for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
        const caixaSelecao = document.getElementById(`pagina-${numeroPagina}`);
        const campoCopias = document.getElementById(`copias-${numeroPagina}`);

        if (caixaSelecao && caixaSelecao.checked) {
            totalPaginasSelecionadas++;
            totalCopias += parseInt(campoCopias.value, 10) || 0;
        }
    }

    document.getElementById("totalPaginasSelecionadas").textContent = totalPaginasSelecionadas;
    document.getElementById("totalCopias").textContent = totalCopias;
}

function irParaEtapa(numeroEtapa) {
    // Esconde a etapa atual e mostra a etapa solicitada.
    document.getElementById(`etapa${etapaAtual}`).classList.add("oculto");

    setTimeout(async () => {
        document.getElementById(`etapa${numeroEtapa}`).classList.remove("oculto");

        if (numeroEtapa === 2 && arquivoSelecionado) {
            document.getElementById("conteinerVisualizacao").style.display = "block";
            if (documentoPdf) await renderizarPaginasPdf();
        }

        if (numeroEtapa === 3) {
            atualizarResumo();
        }

        if (numeroEtapa === 4) {
            limparInterfacePix();
            setTimeout(() => gerarQrPix(), 300);
        }

        etapaAtual = numeroEtapa;
        document.getElementById(`etapa${numeroEtapa}`).scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }, 250);
}

function atualizarResumo() {
    // Copia as escolhas do usuário para a tela de resumo.
    const tipoImpressao = obterValorSelecionado("tipoImpressao", "normal");
    const modoCor = obterValorSelecionado("modoCor", "preto_e_branco");
    const ajustePagina = obterValorSelecionado("ajustePagina", "ajustar");

    const textoTipo = tipoImpressao === "frente_e_verso" ? "Frente e verso" : "Impressão normal";
    const textoCor = modoCor === "preto_e_branco" ? "Preto e branco" : "Colorido";

    let textoAjuste = "Ajustar à folha";
    if (ajustePagina === "reduzir") textoAjuste = "Reduzir para caber";
    if (ajustePagina === "tamanho_real") textoAjuste = "Tamanho real";

    const totalPaginas = document.getElementById("totalPaginasSelecionadas").textContent;
    const totalCopias = parseInt(document.getElementById("totalCopias").textContent, 10) || 0;
    const valorPagar = totalCopias * VALOR_POR_COPIA;
    const valorFormatado = `R$${valorPagar.toFixed(2).replace(".", ",")}`;

    document.getElementById("resumoNomeArquivo").textContent = arquivoSelecionado ? arquivoSelecionado.name : "-";
    document.getElementById("resumoPaginasSelecionadas").textContent = totalPaginas;
    document.getElementById("resumoTotalCopias").textContent = totalCopias;
    document.getElementById("resumoTipoImpressao").textContent = textoTipo;
    document.getElementById("resumoModoCor").textContent = textoCor;
    document.getElementById("resumoAjuste").textContent = textoAjuste;
    document.getElementById("resumoValorTotal").textContent = valorFormatado;
    document.querySelector(".preco").textContent = valorFormatado;
}

async function enviarParaImpressao() {
    // Envia o arquivo final para o backend depois que o pagamento é liberado.
    if (!arquivoSelecionado) {
        mostrarMensagem("Nenhum arquivo selecionado.", "erro");
        return;
    }

    const botaoImprimir = document.getElementById("botaoImprimir");
    const textoBotao = document.getElementById("textoBotaoImprimir");

    botaoImprimir.disabled = true;
    textoBotao.innerHTML = '<span class="carregando"></span>Processando arquivo...';

    try {
        let arquivoParaEnviar = arquivoSelecionado;
        let pdfModificado = false;

        if (arquivoSelecionado.type === "application/pdf" && documentoPdf) {
            let precisaModificar = obterValorSelecionado("orientacao", "retrato") === "paisagem";

            if (!precisaModificar) {
                for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
                    const caixaSelecao = document.getElementById(`pagina-${numeroPagina}`);
                    const campoCopias = document.getElementById(`copias-${numeroPagina}`);
                    if (!caixaSelecao || !caixaSelecao.checked || parseInt(campoCopias.value, 10) !== 1) {
                        precisaModificar = true;
                        break;
                    }
                }
            }

            if (precisaModificar) {
                textoBotao.innerHTML = '<span class="carregando"></span>Criando PDF final...';
                arquivoParaEnviar = await criarPdfModificado();
                pdfModificado = true;
            }
        }

        textoBotao.innerHTML = '<span class="carregando"></span>Enviando para impressão...';

        const dadosFormulario = new FormData();
        dadosFormulario.append("arquivo", arquivoParaEnviar);
        dadosFormulario.append("tipoImpressao", obterValorSelecionado("tipoImpressao", "normal"));
        dadosFormulario.append("tamanhoPapel", obterValorSelecionado("tamanhoPapel", "a4"));
        dadosFormulario.append("orientacao", obterValorSelecionado("orientacao", "retrato"));
        dadosFormulario.append("modoCor", obterValorSelecionado("modoCor", "preto_e_branco"));
        dadosFormulario.append("ajustePagina", obterValorSelecionado("ajustePagina", "ajustar"));

        let copiasParaEnviar = 1;
        if (!pdfModificado && (!documentoPdf || arquivoSelecionado.type.includes("image"))) {
            copiasParaEnviar = parseInt(document.getElementById("totalCopias").textContent, 10) || 1;
        }
        dadosFormulario.append("quantidadeCopias", copiasParaEnviar);
        dadosFormulario.append("pdfModificadoNoNavegador", String(pdfModificado));

        const resposta = await fetch("/imprimir", {
            method: "POST",
            body: dadosFormulario,
        });
        const resultado = await resposta.json();

        if (!resposta.ok || resultado.situacao !== "sucesso") {
            throw new Error(resultado.mensagem || "Erro desconhecido.");
        }

        mostrarMensagem(
            pdfModificado ? "PDF final enviado com sucesso." : "Arquivo enviado com sucesso.",
            "sucesso",
        );

        setTimeout(() => finalizarPedido(), 1800);
    } catch (erro) {
        console.error("Erro ao imprimir:", erro);
        mostrarMensagem(`Erro ao imprimir: ${erro.message}`, "erro");
    } finally {
        botaoImprimir.disabled = false;
        textoBotao.innerHTML = "Enviar para impressão";
    }
}

function mostrarMensagem(mensagem, tipo) {
    // Mostra mensagens amigáveis de sucesso, aviso ou erro.
    const areaSituacao = document.getElementById("situacaoImpressao");
    let classe = "mensagem-erro";

    if (tipo === "sucesso") classe = "mensagem-sucesso";
    if (tipo === "aviso") classe = "mensagem-aviso";

    areaSituacao.innerHTML = `<div class="${classe}">${mensagem}</div>`;

    if (tipo === "sucesso") {
        setTimeout(() => { areaSituacao.innerHTML = ""; }, 5000);
    } else if (tipo === "aviso") {
        setTimeout(() => { areaSituacao.innerHTML = ""; }, 10000);
    }
}

async function gerarQrPix() {
    // Gera o QR Code Pix real ou o QR demonstrativo do TCC.
    const textoPreco = document.querySelector(".preco").textContent;
    const valor = parseFloat(textoPreco.replace("R$", "").replace(",", ".").trim());

    if (!valor || valor <= 0) {
        mostrarMensagem("Valor inválido para gerar o Pix.", "erro");
        return;
    }

    const modoDemonstracao = document.getElementById("modoDemonstracao").checked;

    if (modoDemonstracao) {
        document.getElementById("carregamentoPix").style.display = "none";

        document.getElementById("qrPixImagem").src =
            "https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=1e3a8a&data=ModoDemonstracaoTCC";
        document.getElementById("codigoPixCopiaCola").value = "00020101021226...[MODO_DEMONSTRACAO_TCC]...0000";
        document.getElementById("conteinerQrPix").style.display = "block";

        const areaSituacao = document.getElementById("situacaoPagamentoPix");
        areaSituacao.style.display = "block";
        areaSituacao.className = "situacao-pix demonstracao";
        areaSituacao.innerHTML = `
            <div><strong>Modo de demonstração ativo</strong></div>
            <button type="button" onclick="simularPagamentoDemonstracao()" class="botao-demonstracao">
                Simular aprovação do pagamento
            </button>
        `;

        document.getElementById("confirmacaoManualPix").style.display = "none";
        return;
    }

    document.getElementById("carregamentoPix").style.display = "block";

    try {
        const resposta = await fetch("/gerar-pix", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ valor }),
        });
        const resultado = await resposta.json();

        if (!resposta.ok || resultado.situacao !== "sucesso") {
            throw new Error(resultado.mensagem || "Erro ao gerar Pix.");
        }

        document.getElementById("qrPixImagem").src = resultado.qr_base64;
        document.getElementById("codigoPixCopiaCola").value = resultado.codigo_copia_cola;
        document.getElementById("conteinerQrPix").style.display = "block";
        document.getElementById("carregamentoPix").style.display = "none";

        const areaSituacao = document.getElementById("situacaoPagamentoPix");

        if (resultado.modo === "mercadopago") {
            idPagamentoAtual = resultado.id_pagamento;
            areaSituacao.style.display = "block";
            areaSituacao.className = "situacao-pix aguardando";
            areaSituacao.textContent = "Aguardando pagamento...";
            document.getElementById("confirmacaoManualPix").style.display = "none";
            iniciarVerificacaoPagamento(idPagamentoAtual);
        } else {
            areaSituacao.style.display = "none";
            document.getElementById("confirmacaoManualPix").style.display = "block";
        }
    } catch (erro) {
        console.error("Erro ao gerar Pix:", erro);
        document.getElementById("carregamentoPix").style.display = "none";
        mostrarMensagem(erro.message, "erro");
    }
}

function iniciarVerificacaoPagamento(idPagamento) {
    // Consulta o backend a cada três segundos até o Mercado Pago responder.
    if (intervaloVerificacaoPix) clearInterval(intervaloVerificacaoPix);

    intervaloVerificacaoPix = setInterval(async () => {
        try {
            const resposta = await fetch(`/verificar-pagamento/${idPagamento}`);
            const resultado = await resposta.json();

            if (!resposta.ok || resultado.situacao !== "sucesso") {
                console.warn("Erro ao verificar pagamento:", resultado.mensagem);
                return;
            }

            const areaSituacao = document.getElementById("situacaoPagamentoPix");

            if (resultado.situacao_pagamento === "approved") {
                clearInterval(intervaloVerificacaoPix);
                intervaloVerificacaoPix = null;
                areaSituacao.className = "situacao-pix aprovado";
                areaSituacao.textContent = "Pagamento aprovado. Enviando para impressão...";
                setTimeout(() => enviarParaImpressao(), 1500);
            }

            if (resultado.situacao_pagamento === "rejected" || resultado.situacao_pagamento === "cancelled") {
                clearInterval(intervaloVerificacaoPix);
                intervaloVerificacaoPix = null;
                areaSituacao.className = "situacao-pix recusado";
                areaSituacao.textContent = "Pagamento recusado ou cancelado. Tente novamente.";
                setTimeout(() => gerarQrPix(), 2000);
            }
        } catch (erro) {
            console.error("Erro na verificação do Pix:", erro);
        }
    }, 3000);
}

function copiarCodigoPix() {
    // Copia o código Pix copia e cola para a área de transferência.
    const campoCodigo = document.getElementById("codigoPixCopiaCola");
    campoCodigo.select();

    navigator.clipboard.writeText(campoCodigo.value).then(() => {
        const botao = document.getElementById("botaoCopiarPix");
        botao.textContent = "Copiado!";
        botao.style.background = "#16a34a";

        setTimeout(() => {
            botao.textContent = "Copiar";
            botao.style.background = "#1e3a8a";
        }, 2000);
    }).catch(() => {
        document.execCommand("copy");
        mostrarMensagem("Código Pix copiado.", "sucesso");
    });
}

function confirmarPagamentoManual() {
    // Usado quando o QR Code é estático e não existe confirmação automática.
    document.getElementById("confirmacaoManualPix").style.display = "none";

    const areaSituacao = document.getElementById("situacaoPagamentoPix");
    areaSituacao.style.display = "block";
    areaSituacao.className = "situacao-pix aprovado";
    areaSituacao.textContent = "Pagamento confirmado manualmente. Enviando para impressão...";

    setTimeout(() => enviarParaImpressao(), 1500);
}

function simularPagamentoDemonstracao() {
    // Botão usado em apresentação do TCC para demonstrar o fluxo sem pagamento real.
    const areaSituacao = document.getElementById("situacaoPagamentoPix");
    areaSituacao.className = "situacao-pix aprovado";
    areaSituacao.innerHTML = "Pagamento de teste aprovado. Enviando para impressão...";

    const botao = areaSituacao.querySelector("button");
    if (botao) botao.style.display = "none";

    setTimeout(() => enviarParaImpressao(), 1500);
}

function limparInterfacePix() {
    // Limpa o estado visual do Pix ao entrar novamente na etapa de pagamento.
    if (intervaloVerificacaoPix) {
        clearInterval(intervaloVerificacaoPix);
        intervaloVerificacaoPix = null;
    }

    idPagamentoAtual = null;
    document.getElementById("conteinerQrPix").style.display = "none";
    document.getElementById("confirmacaoManualPix").style.display = "none";
    document.getElementById("carregamentoPix").style.display = "none";
    document.getElementById("botaoImprimir").classList.add("oculto");
    document.getElementById("situacaoPagamentoPix").className = "";
    document.getElementById("situacaoPagamentoPix").innerHTML = "";
}

function limparFormulario() {
    // Deixa o sistema pronto para uma nova impressão.
    const formulario = document.getElementById("formularioEnvio");
    if (formulario) formulario.reset();

    document.getElementById("previsualizacaoArquivo").style.display = "none";
    document.getElementById("botaoContinuarEtapa1").classList.add("oculto");
    document.getElementById("situacaoImpressao").innerHTML = "";
    document.getElementById("conteinerVisualizacao").style.display = "none";
    document.getElementById("textoArquivoPendente").style.display = "block";

    document.querySelector('input[name="tipoImpressao"][value="normal"]').checked = true;
    document.querySelector('input[name="modoCor"][value="preto_e_branco"]').checked = true;
    document.querySelector('input[name="ajustePagina"][value="ajustar"]').checked = true;
    document.querySelector('input[name="tamanhoPapel"][value="a4"]').checked = true;
    document.querySelector('input[name="orientacao"][value="retrato"]').checked = true;

    arquivoSelecionado = null;
    documentoPdf = null;
    dadosPaginas = [];
    bytesPdfOriginal = null;
    imagemAtual = null;

    limparInterfacePix();
    irParaEtapa(1);
}

function finalizarPedido() {
    // Mostra uma tela final simples confirmando que o pedido foi enviado.
    document.body.innerHTML = `
        <main class="tela-pedido-finalizado">
            <section class="cartao-pedido-finalizado">
                <div class="icone-sucesso">✓</div>
                <h2>Pedido confirmado</h2>
                <p>Seu arquivo foi enviado para a fila de impressão com sucesso.</p>
                <button onclick="location.reload()">Fazer novo pedido</button>
            </section>
        </main>
    `;
}
