// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let currentStep = 1;
let uploadedFile = null;
let pdfDocument = null;
let pageData = [];
let originalPdfBytes = null;

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    setupFileUpload();
    
    // Re-render preview when orientation or color mode changes
    document.querySelectorAll('input[name="orientation"], input[name="colorMode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (uploadedFile && uploadedFile.type === 'application/pdf') {
                renderPDFPages();
            } else if (uploadedFile && uploadedFile.type.includes('image')) {
                updateImageOrientation();
                applyImageColorMode();
            }
        });
    });
});

function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileUpload(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

async function handleFileUpload(file) {
    uploadedFile = file;
    const fileName = file.name;
    const fileSize = (file.size / 1024 / 1024).toFixed(2);

    if (uploadedFile) {
        document.getElementById("HideFilled").style.display = "none";
    }

    // Determine file icon based on type
    let fileIcon = '📄';
    if (file.type.includes('pdf')) fileIcon = '📋';
    else if (file.type.includes('image')) fileIcon = '🖼️';
    else if (file.type.includes('word')) fileIcon = '📝';

    document.getElementById('fileName').textContent = `${fileIcon} ${fileName}`;
    document.getElementById('fileSize').textContent = `📊 ${fileSize} MB`;
    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('nextStep1').classList.remove('hidden');

    // Reset visibility
    document.getElementById('pagesContainer').style.display = 'grid';
    document.getElementById('imagePreviewContainer').style.display = 'none';

    // If it's a PDF, load it for preview
    if (file.type === 'application/pdf') {
        await loadPDF(file);
    } else if (file.type.includes('image')) {
        // If it's an image, use basic preview
        loadImagePreview(file);
    } else {
        // Documents that cannot be visually previewed (doc, docx, txt)
        document.getElementById('pdfPreviewContainer').style.display = 'block';
        document.getElementById('pagesContainer').innerHTML = '<div style="padding: 40px; text-align: center; color: #4b5563;">Visualização não disponível para este tipo de arquivo.<br>Suas opções de impressão serão aplicadas normalmente.</div>';
        updateTotals(1, 1);
    }
}

// Function to remove selected file
function removeFile() {
    uploadedFile = null;
    pdfDocument = null;
    pageData = [];
    originalPdfBytes = null;
    window.currentImageObj = null;

    // Reset UI elements
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('nextStep1').classList.add('hidden');
    document.getElementById("HideFilled").style.display = "block";
    document.getElementById('pdfPreviewContainer').style.display = 'none';
    document.getElementById('pagesContainer').innerHTML = '';
    document.getElementById('imagePreviewContainer').style.display = 'none';
    
    // Clear status
    document.getElementById('printStatus').innerHTML = '';
}

function loadImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            window.currentImageObj = img;
            document.getElementById('pagesContainer').style.display = 'none';
            document.getElementById('imagePreviewContainer').style.display = 'block';
            updateImageOrientation();
            updateTotals(1, 1);
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

function updateImageOrientation() {
    if (!window.currentImageObj) return;
    const img = window.currentImageObj;
    const canvas = document.getElementById('imagePreviewCanvas');
    const ctx = canvas.getContext('2d');
    
    const orientation = document.querySelector('input[name="orientation"]:checked').value;
    const colorMode = document.querySelector('input[name="colorMode"]:checked')?.value || 'color';
    
    // Limit max dimensions for performance while keeping preview quality
    const MAX_SIZE = 1200;
    let width = img.width;
    let height = img.height;
    
    if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = width * ratio;
        height = height * ratio;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (orientation === 'landscape') {
        canvas.width = height;
        canvas.height = width;
        ctx.translate(height / 2, width / 2);
        ctx.rotate(-90 * Math.PI / 180);
        if (colorMode === 'monochrome') ctx.filter = 'grayscale(100%)';
        else ctx.filter = 'none';
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
        canvas.width = width;
        canvas.height = height;
        if (colorMode === 'monochrome') ctx.filter = 'grayscale(100%)';
        else ctx.filter = 'none';
        ctx.drawImage(img, 0, 0, width, height);
    }
}

function applyImageColorMode() {
    updateImageOrientation(); // Canvas redraws apply the color instantly
}

async function loadPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        originalPdfBytes = arrayBuffer; // Store as ArrayBuffer for PDF-lib
        const typedArray = new Uint8Array(arrayBuffer);
        pdfDocument = await pdfjsLib.getDocument(typedArray).promise;

        // Test if PDF-lib can also load this PDF
        try {
            await PDFLib.PDFDocument.load(originalPdfBytes);
            console.log('PDF-lib compatibility: OK');
        } catch (pdfLibError) {
            console.warn('PDF-lib compatibility issue:', pdfLibError);
            showMessage('⚠️ Aviso: Algumas funcionalidades de edição podem não funcionar com este PDF', 'warning');
        }

        // Initialize page data
        pageData = [];
        for (let i = 1; i <= pdfDocument.numPages; i++) {
            pageData.push({
                pageNum: i,
                selected: true,
                copies: 1
            });
        }

        console.log(`PDF loaded with ${pdfDocument.numPages} pages`);
    } catch (error) {
        console.error('Error loading PDF:', error);
        showMessage('Erro ao carregar PDF para preview', 'error');
    }
}

async function createModifiedPDF() {
    if (!originalPdfBytes || !pdfDocument) {
        return null;
    }

    try {
        // Get selected pages and their copy counts
        const selectedPages = [];
        const pageMap = new Map(); // Track which pages and how many copies

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const checkbox = document.getElementById(`page-${i}`);
            const copiesInput = document.getElementById(`copies-${i}`);

            if (checkbox && checkbox.checked) {
                const copies = parseInt(copiesInput.value) || 1;
                if (copies > 0) {
                    pageMap.set(i - 1, copies); // PDF-lib uses 0-based indexing
                    for (let copy = 0; copy < copies; copy++) {
                        selectedPages.push(i - 1);
                    }
                }
            }
        }

        if (selectedPages.length === 0) {
            throw new Error('Nenhuma página selecionada');
        }

        console.log('Selected pages for processing:', selectedPages);

        // Load original PDF with PDF-lib - try different approaches
        let pdfDoc;
        try {
            // First attempt: direct load
            pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
        } catch (firstError) {
            console.warn('First load attempt failed:', firstError);

            try {
                // Second attempt: create Uint8Array
                const uint8Array = new Uint8Array(originalPdfBytes);
                pdfDoc = await PDFLib.PDFDocument.load(uint8Array);
            } catch (secondError) {
                console.warn('Second load attempt failed:', secondError);

                try {
                    // Third attempt: re-read file
                    const newArrayBuffer = await uploadedFile.arrayBuffer();
                    pdfDoc = await PDFLib.PDFDocument.load(newArrayBuffer);
                } catch (thirdError) {
                    console.error('All load attempts failed:', thirdError);
                    throw new Error('PDF não é compatível com edição. Arquivo será enviado sem modificações.');
                }
            }
        }

        // Create new PDF document
        const newPdfDoc = await PDFLib.PDFDocument.create();
        
        // Get orientation setting
        const orientation = document.querySelector('input[name="orientation"]:checked')?.value || 'portrait';

        // Copy selected pages to new document
        console.log('Copying pages to new document...');
        const copiedPages = await newPdfDoc.copyPages(pdfDoc, selectedPages);

        // Add pages to new document
        copiedPages.forEach((page, index) => {
            // Apply rotation if landscape
            if (orientation === 'landscape') {
                page.setRotation(PDFLib.degrees(90));
            }
            
            newPdfDoc.addPage(page);
            console.log(`Added page ${selectedPages[index] + 1} to new document`);
        });

        // Serialize the new PDF
        console.log('Saving new PDF...');
        const pdfBytes = await newPdfDoc.save();

        // Create blob and file
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const modifiedFileName = uploadedFile.name.replace(/\.pdf$/i, '_modified.pdf');

        console.log(`Created modified PDF: ${modifiedFileName} (${blob.size} bytes)`);
        return new File([blob], modifiedFileName, { type: 'application/pdf' });

    } catch (error) {
        console.error('Error creating modified PDF:', error);

        // If it's a compatibility error, allow fallback
        if (error.message.includes('não é compatível')) {
            throw error;
        }

        throw new Error(`Erro ao processar PDF: ${error.message}`);
    }
}

async function renderPDFPages() {
    if (!pdfDocument) return;

    const container = document.getElementById('pagesContainer');
    container.innerHTML = '';
    
    // Check orientation to apply visual rotation
    const orientation = document.querySelector('input[name="orientation"]:checked')?.value || 'portrait';
    const rotationDegree = orientation === 'landscape' ? 270 : 0; // Rotate 90deg left for landscape

    // Check color mode to apply visual filter
    const colorMode = document.querySelector('input[name="colorMode"]:checked')?.value || 'color';
    const filterCss = colorMode === 'monochrome' ? 'filter: grayscale(100%);' : '';

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-item';
        
        // Create canvas for PDF page
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
        max-width: 100%;
        height: auto;
        border: 1px solid #ddd;
        display: block;
        margin: 0 auto 10px auto;
        ${filterCss}
    `;

        // Page number label
        const pageLabelName = document.createElement('div');
        pageLabelName.textContent = `Página ${pageNum}`;
        pageLabelName.style.cssText = `
        font-weight: bold;
        margin-bottom: 10px;
        color: #333;
    `;

        // Checkbox for selection
        const pageOptions = document.createElement('div');
        const pageCheckbox = document.createElement('div');
        const pageQuantity = document.createElement('div');
        pageOptions.className = "page-options";
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        // Preserve previous selection state if possible
        const exisitngData = pageData.find(p => p.pageNum === pageNum);
        checkbox.checked = exisitngData ? exisitngData.selected : true;
        checkbox.id = `page-${pageNum}`;
        checkbox.addEventListener('change', () => {
            updateTotals();
            updatePageVisualState(pageDiv, checkbox.checked);
            const pd = pageData.find(p => p.pageNum === pageNum);
            if(pd) pd.selected = checkbox.checked;
        });

        const checkboxLabel = document.createElement('label');
        checkboxLabel.htmlFor = `page-${pageNum}`;
        checkboxLabel.textContent = 'Imprimir';

        // Copies input
        const copiesLabel = document.createElement('label');
        copiesLabel.textContent = 'Cópias:';
        copiesLabel.style.cssText = `
        display: block;
        margin: 5px 0;
        font-size: 12px;
    `;

        const copiesInput = document.createElement('input');
        copiesInput.type = 'number';
        copiesInput.min = '0';
        copiesInput.max = '99';
        copiesInput.value = exisitngData ? exisitngData.copies : '1';
        copiesInput.id = `copies-${pageNum}`;
        copiesInput.style.cssText = `
        width: 50px;
        padding: 2px;
        text-align: center;
    `;
        copiesInput.addEventListener('change', () => {
            updateTotals();
            const pd = pageData.find(p => p.pageNum === pageNum);
            if(pd) pd.copies = parseInt(copiesInput.value) || 0;
        });

        // Assemble page div
        pageDiv.appendChild(pageLabelName);
        pageDiv.appendChild(canvas);
        pageDiv.appendChild(pageOptions);
        pageOptions.appendChild(pageCheckbox);
        pageOptions.appendChild(pageQuantity);
        pageCheckbox.appendChild(checkbox);
        pageCheckbox.appendChild(checkboxLabel);
        pageQuantity.appendChild(copiesLabel);
        pageQuantity.appendChild(copiesInput);

        container.appendChild(pageDiv);

        // Render PDF page
        try {
            const page = await pdfDocument.getPage(pageNum);
            const scale = 0.5; // Scale down for preview
            const viewport = page.getViewport({ scale, rotation: rotationDegree });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
            canvas.style.display = 'none';
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Erro ao carregar página';
            errorMsg.style.cssText = `
            color: red;
            font-size: 12px;
            margin: 10px 0;
        `;
            pageDiv.appendChild(errorMsg);
        }
    }

    updateTotals();
}

function updatePageVisualState(pageDiv, isSelected) {
    if (isSelected) {
        pageDiv.style.opacity = '1';
        pageDiv.style.borderColor = '#1e3a8a';
        pageDiv.style.transform = 'scale(1)';
    } else {
        pageDiv.style.opacity = '0.7';
        pageDiv.style.borderColor = '#ddd';
        pageDiv.style.transform = 'scale(0.95)';
    }
}

function selectAllPages() {
    const master = document.getElementById('checkado');
    const shouldSelect = master.checked;

    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const checkbox = document.getElementById(`page-${i}`);
        if (!checkbox) continue;

        checkbox.checked = shouldSelect;

        const pageDiv = checkbox.closest('.page-item');
        if (pageDiv) updatePageVisualState(pageDiv, shouldSelect);
        
        const pd = pageData.find(p => p.pageNum === i);
        if(pd) pd.selected = shouldSelect;
    }

    updateTotals();
}

function setAllCopies() {
    const globalCopies = document.getElementById('globalCopies').value;
    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const copiesInput = document.getElementById(`copies-${i}`);
        if (copiesInput) copiesInput.value = globalCopies;
        const pd = pageData.find(p => p.pageNum === i);
        if(pd) pd.copies = parseInt(globalCopies) || 0;
    }
    updateTotals();
}

function updateTotals(overridePages = null, overrideCopies = null) {
    if (overridePages !== null) {
        document.getElementById('totalSelectedPages').textContent = overridePages;
        document.getElementById('totalCopies').textContent = overrideCopies;
        return;
    }

    if (!pdfDocument) return;

    let selectedPagesCount = 0;
    let totalCopiesCount = 0;

    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const checkbox = document.getElementById(`page-${i}`);
        const copiesInput = document.getElementById(`copies-${i}`);

        if (checkbox && checkbox.checked) {
            selectedPagesCount++;
            if (copiesInput) {
                totalCopiesCount += parseInt(copiesInput.value) || 0;
            }
        }
    }

    document.getElementById('totalSelectedPages').textContent = selectedPagesCount;
    document.getElementById('totalCopies').textContent = totalCopiesCount;
}

function goToStep(stepNum) {
    document.getElementById(`step${currentStep}`).classList.add('hidden');

    setTimeout(async () => {
        document.getElementById(`step${stepNum}`).classList.remove('hidden');

        if (stepNum === 2 && uploadedFile) {
            document.getElementById('pdfPreviewContainer').style.display = 'block';
            if (pdfDocument) {
                await renderPDFPages();
            }
        }

        if (stepNum === 3) {
            updateSummary();
        }

        if (stepNum === 4) {
            resetPixUI();
            // Auto-generate QR code when entering payment step
            setTimeout(() => generatePixQR(), 300);
        }

        currentStep = stepNum;

        document.getElementById(`step${stepNum}`).scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 300);
}

function updateSummary() {
    const printType = document.querySelector('input[name="printType"]:checked')?.value || 'normal';
    const colorMode = document.querySelector('input[name="colorMode"]:checked')?.value || 'color';
    const pageFit = document.querySelector('input[name="pageFit"]:checked')?.value || 'fit';

    document.getElementById('summaryFileName').textContent = uploadedFile ? uploadedFile.name : '-';
    document.getElementById('summaryPrintType').textContent = printType === 'duplex' ? 'Frente e Verso' : 'Impressão Normal';
    document.getElementById('summaryColor').textContent = colorMode === 'monochrome' ? 'Preto e Branco' : 'Colorido';
    
    let fitText = 'Ajustar à folha';
    if (pageFit === 'shrink') fitText = 'Reduzir para caber';
    if (pageFit === 'noscale') fitText = 'Tamanho Real';
    document.getElementById('summaryFit').textContent = fitText;

    const selectedPages = document.getElementById('totalSelectedPages').textContent;
    const totalCopies = document.getElementById('totalCopies').textContent;

    document.getElementById('summarySelectedPages').textContent = selectedPages;
    document.getElementById('summaryTotalCopies').textContent = totalCopies;

    let valorPagar = totalCopies * 0.50;
    let decimalNumber = valorPagar.toFixed(2);

    document.getElementById('summaryValue').textContent = "R$" + decimalNumber;
    document.querySelector('.price').textContent = "R$" + decimalNumber;
}

async function sendToPrint() {
    if (!uploadedFile) {
        showMessage('Nenhum arquivo selecionado!', 'error');
        return;
    }

    const printBtn = document.getElementById('printBtn');
    const printBtnText = document.getElementById('printBtnText');

    printBtn.disabled = true;
    printBtnText.innerHTML = '<span class="loading"></span>Processando arquivo...';

    try {
        let fileToSend = uploadedFile;
        let usedModification = false;

        if (uploadedFile.type === 'application/pdf' && pdfDocument) {
            let needsModification = false;
            const orientation = document.querySelector('input[name="orientation"]:checked')?.value || 'portrait';
            if (orientation === 'landscape') needsModification = true;

            if (!needsModification) {
                for (let i = 1; i <= pdfDocument.numPages; i++) {
                    const checkbox = document.getElementById(`page-${i}`);
                    const copiesInput = document.getElementById(`copies-${i}`);
                    if (!checkbox || !checkbox.checked || parseInt(copiesInput.value) !== 1) {
                        needsModification = true;
                        break;
                    }
                }
            }

            if (needsModification) {
                try {
                    printBtnText.innerHTML = '<span class="loading"></span>Criando PDF modificado...';
                    const modifiedFile = await createModifiedPDF();
                    if (modifiedFile) {
                        fileToSend = modifiedFile;
                        usedModification = true;
                    }
                } catch (modificationError) {
                    console.warn('PDF modification failed, using original:', modificationError);
                    if (modificationError.message.includes('não é compatível')) {
                        showMessage('⚠️ PDF será enviado sem modificações (páginas não suportadas para edição)', 'warning');
                    } else {
                        showMessage(`⚠️ Erro na modificação, enviando arquivo original: ${modificationError.message}`, 'warning');
                    }
                    fileToSend = uploadedFile;
                }
            }
        }

        printBtnText.innerHTML = '<span class="loading"></span>Enviando para impressão...';

        const formData = new FormData();
        formData.append('file', fileToSend);

        const printType = document.querySelector('input[name="printType"]:checked')?.value || 'normal';
        const paperSize = document.querySelector('input[name="paperSize"]:checked')?.value || 'a4';
        const orientation = document.querySelector('input[name="orientation"]:checked')?.value || 'portrait';
        const colorMode = document.querySelector('input[name="colorMode"]:checked')?.value || 'color';
        const pageFit = document.querySelector('input[name="pageFit"]:checked')?.value || 'fit';

        formData.append('printType', printType);
        formData.append('paperSize', paperSize);
        formData.append('orientation', orientation);
        formData.append('colorMode', colorMode);
        formData.append('pageFit', pageFit);
        
        let copiesToSend = 1;
        if (!usedModification && uploadedFile && uploadedFile.type.includes('image')) {
            const totalCopies = document.getElementById('totalCopies').textContent;
            copiesToSend = parseInt(totalCopies) || 1;
        }
        formData.append('copies', copiesToSend);
        formData.append('wasModified', usedModification.toString());

        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();

        if (response.ok) {
            showMessage(usedModification ? '✅ PDF enviado com sucesso!' : '✅ Arquivo enviado com sucesso!', 'success');
            setTimeout(() => { finalizePurchase(); }, 2000);
            setTimeout(() => { resetForm(); }, 3000);
        } else {
            throw new Error(result.message || 'Erro desconhecido');
        }

    } catch (error) {
        console.error('Erro:', error);
        showMessage(`❌ Erro ao imprimir: ${error.message}`, 'error');
    } finally {
        printBtn.disabled = false;
        printBtnText.innerHTML = '🖨️ Enviar para Impressão';
    }
}

function showMessage(message, type) {
    const statusDiv = document.getElementById('printStatus');
    let className, styles;

    switch (type) {
        case 'success':
            className = 'success-message';
            styles = 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;';
            break;
        case 'warning':
            className = 'warning-message';
            styles = 'background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;';
            break;
        case 'error':
        default:
            className = 'error-message';
            styles = 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;';
            break;
    }

    statusDiv.innerHTML = `<div class="${className}" style="padding: 15px; margin: 10px 0; border-radius: 5px; ${styles}">${message}</div>`;

    if (type === 'success') {
        setTimeout(() => { statusDiv.innerHTML = ''; }, 5000);
    } else if (type === 'warning') {
        setTimeout(() => { statusDiv.innerHTML = ''; }, 10000);
    }
}



// ==========================================
// PIX PAYMENT FLOW
// ==========================================

let pixPollingInterval = null;
let currentPaymentId = null;

async function generatePixQR() {
    const priceText = document.querySelector('.price').textContent;
    const amount = parseFloat(priceText.replace('R$', '').replace(',', '.').trim());

    if (!amount || amount <= 0) {
        showMessage('Valor inválido para gerar o Pix.', 'error');
        return;
    }

    // Show loading
    document.getElementById('pixLoading').style.display = 'block';

    try {
        const response = await fetch('/generate-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        });

        const result = await response.json();

        if (!response.ok || result.status !== 'success') {
            throw new Error(result.message || 'Erro ao gerar Pix');
        }

        // Display QR Code
        const qrContainer = document.getElementById('pixQrContainer');
        const qrImg = document.getElementById('pixQrImg');
        const copiaCola = document.getElementById('pixCopiaCola');
        const statusDiv = document.getElementById('pixPaymentStatus');

        qrImg.src = result.qr_base64;
        copiaCola.value = result.copia_cola;
        qrContainer.style.display = 'block';

        // Hide loading
        document.getElementById('pixLoading').style.display = 'none';

        if (result.mode === 'mercadopago') {
            // Dynamic QR — start polling
            currentPaymentId = result.payment_id;
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#fef3c7';
            statusDiv.style.color = '#92400e';
            statusDiv.textContent = '⏳ Aguardando pagamento...';
            document.getElementById('pixManualConfirm').style.display = 'none';
            startPaymentPolling(result.payment_id);
        } else {
            // Static QR — show manual confirm
            statusDiv.style.display = 'none';
            document.getElementById('pixManualConfirm').style.display = 'block';
        }

    } catch (error) {
        console.error('Erro ao gerar Pix:', error);
        document.getElementById('pixLoading').style.display = 'none';
        showMessage(`❌ ${error.message}`, 'error');
    }
}

function startPaymentPolling(paymentId) {
    // Clear any existing polling
    if (pixPollingInterval) clearInterval(pixPollingInterval);

    pixPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/check-payment/${paymentId}`);
            const result = await response.json();

            if (!response.ok || result.status !== 'success') {
                console.warn('Erro ao verificar pagamento:', result.message);
                return;
            }

            const statusDiv = document.getElementById('pixPaymentStatus');

            if (result.payment_status === 'approved') {
                clearInterval(pixPollingInterval);
                pixPollingInterval = null;
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.textContent = '✅ Pagamento aprovado! Enviando para impressão...';
                // Auto-trigger print
                setTimeout(() => sendToPrint(), 1500);
            } else if (result.payment_status === 'rejected' || result.payment_status === 'cancelled') {
                clearInterval(pixPollingInterval);
                pixPollingInterval = null;
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.textContent = `❌ Pagamento ${result.payment_status === 'rejected' ? 'rejeitado' : 'cancelado'}. Tente novamente.`;
                // Re-try generating
                setTimeout(() => generatePixQR(), 2000);
            }
            // If still 'pending', keep polling
        } catch (error) {
            console.error('Erro no polling:', error);
        }
    }, 3000); // Poll every 3 seconds
}

function copyPixCode() {
    const copiaCola = document.getElementById('pixCopiaCola');
    copiaCola.select();
    navigator.clipboard.writeText(copiaCola.value).then(() => {
        const btn = document.getElementById('copyPixBtn');
        btn.textContent = '✅ Copiado!';
        btn.style.background = '#16a34a';
        setTimeout(() => {
            btn.textContent = '📋 Copiar';
            btn.style.background = '#1e3a8a';
        }, 2000);
    }).catch(() => {
        document.execCommand('copy');
        showMessage('Código copiado!', 'success');
    });
}

function confirmManualPayment() {
    document.getElementById('pixManualConfirm').style.display = 'none';
    const statusDiv = document.getElementById('pixPaymentStatus');
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#d4edda';
    statusDiv.style.color = '#155724';
    statusDiv.textContent = '✅ Pagamento confirmado manualmente! Enviando para impressão...';
    setTimeout(() => sendToPrint(), 1500);
}

function resetPixUI() {
    // Reset Pix UI elements when navigating to step 4
    if (pixPollingInterval) {
        clearInterval(pixPollingInterval);
        pixPollingInterval = null;
    }
    currentPaymentId = null;
    document.getElementById('pixQrContainer').style.display = 'none';
    document.getElementById('pixManualConfirm').style.display = 'none';
    document.getElementById('pixLoading').style.display = 'none';
    document.getElementById('printBtn').classList.add('hidden');
}

function resetForm() {
    const form = document.getElementById('uploadForm');
    if (form) form.reset();
    
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('nextStep1').classList.add('hidden');
    document.getElementById('printStatus').innerHTML = '';
    document.getElementById('pdfPreviewContainer').style.display = 'none';

    document.querySelector('input[name="printType"][value="normal"]').checked = true;
    document.querySelector('input[name="colorMode"][value="color"]').checked = true;
    document.querySelector('input[name="pageFit"][value="fit"]').checked = true;
    document.querySelector('input[name="paperSize"][value="a4"]').checked = true;
    document.querySelector('input[name="orientation"][value="portrait"]').checked = true;

    pdfDocument = null;
    pageData = [];
    originalPdfBytes = null;
    uploadedFile = null;
    window.currentImageObj = null;
    
    resetPixUI();
    goToStep(1);
}

function finalizePurchase() {

    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
            <div style="background: white; padding: 50px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); animation: fadeInUp 0.8s ease-out;">
                <div style="font-size: 4em; color: #16a34a; margin-bottom: 20px;">✅</div>
                <h2 style="color: #1e3a8a; margin-bottom: 20px;">Pedido Confirmado!</h2>
                <p style="color: #64748b; font-size: 1.2em;">Seu pedido foi enviado com sucesso. Você receberá as instruções de pagamento em breve.</p>
                <button onclick="location.reload()" style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; border: none; padding: 15px 30px; border-radius: 25px; margin-top: 30px; cursor: pointer; font-size: 1.1em;">Fazer Novo Pedido</button>
            </div>
        </div>
    `;
}

