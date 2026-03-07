import os
import subprocess
from io import BytesIO
from PIL import Image

class PrinterService:
    def __init__(self, sumatra_path, default_printer):
        self.sumatra_path = sumatra_path
        self.default_printer = default_printer

    def print_file(self, file_path, printer_name=None, print_settings=None):
        """
        Imprime um arquivo. Se for imagem, converte para PDF temporário antes de imprimir.
        :param file_path: Caminho absoluto para o arquivo.
        :param printer_name: Nome da impressora (opcional, usa a padrão configurada).
        :param print_settings: Configurações do SumatraPDF (ex: 'duplex,paper=A4').
        """
        printer = printer_name or self.default_printer
        if not printer:
            raise ValueError("Nome da impressora não configurado.")

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")

        ext = file_path.rsplit('.', 1)[-1].lower()
        
        # Se for imagem, converte para PDF
        if ext in ['jpg', 'jpeg', 'png', 'bmp', 'tiff']:
            pdf_path = file_path.rsplit('.', 1)[0] + '.pdf'
            try:
                image = Image.open(file_path)
                
                # Check if we should convert to black and white
                is_monochrome = print_settings and 'monochrome' in print_settings.lower()
                
                if is_monochrome:
                    image = image.convert('L') # Convert to grayscale
                elif image.mode != 'RGB':
                    image = image.convert('RGB')
                    
                # Física: rotacionar se for paisagem
                is_landscape = print_settings and 'landscape' in print_settings.lower()
                if is_landscape:
                    # Gira 90 graus para ficar deitado (paisagem física)
                    if hasattr(Image, 'Transpose'):
                        image = image.transpose(Image.Transpose.ROTATE_90)
                    else:
                        image = image.transpose(Image.ROTATE_90)
                    
                image.save(pdf_path, 'PDF', resolution=100.0)
                file_path = pdf_path # Atualiza para apontar para o novo PDF
            except Exception as e:
                raise Exception(f"Erro ao converter imagem para PDF: {e}")

        # Se não for PDF neste ponto (ex: doc, docx, txt), o SumatraPDF tenta imprimir nativamente
        # Monta o comando do SumatraPDF
        comando = [
            f'"{self.sumatra_path}"',
            '-print-to', f'"{printer}"',
            '-silent'
        ]
        
        if print_settings:
            comando.extend(['-print-settings', f'"{print_settings}"'])
            
        comando.append(f'"{file_path}"')
        
        comando_str = " ".join(comando)
        print(f"Executando comando: {comando_str}")

        try:
            result = subprocess.run(
                comando_str, 
                shell=True, 
                capture_output=True, 
                text=True, 
                timeout=30
            )
            
            if result.returncode != 0:
                raise Exception(f"Ocorreu um erro na impressão: {result.stderr}")
            
            return True, "Enviado com sucesso"
        except subprocess.TimeoutExpired:
            raise Exception("Timeout na impressão. A impressora demorou muito para responder.")
