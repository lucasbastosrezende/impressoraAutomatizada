import os
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

from printer_service import PrinterService

# Carrega variáveis do .env
load_dotenv()

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configurações do ambiente
DEFAULT_PRINTER = os.getenv("DEFAULT_PRINTER", "HP LaserJet Professional M1132 MFP")
SUMATRA_PATH_ENV = os.getenv("SUMATRA_PATH", "")

# Se o caminho não foi definido no .env, tenta inferir a partir da pasta do projeto
if not SUMATRA_PATH_ENV:
    SUMATRA_PATH = os.path.join(app.root_path, "SumatraPDF", "SumatraPDF.exe")
else:
    SUMATRA_PATH = SUMATRA_PATH_ENV

# Inicializa o serviço de impressão
printer_service = PrinterService(SUMATRA_PATH, DEFAULT_PRINTER)

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "Nenhum arquivo enviado."}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "Nenhum arquivo selecionado."}), 400

    if not allowed_file(file.filename):
        return jsonify({"status": "error", "message": "Tipo de arquivo não permitido."}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)
    abs_file_path = os.path.abspath(file_path)

    # Coleta configurações enviadas pelo frontend
    print_type = request.form.get('printType', 'normal')
    paper_size = request.form.get('paperSize', 'a4')
    orientation = request.form.get('orientation', 'portrait')
    
    # Monta as settings do SumatraPDF
    settings = []
    if print_type == 'duplex':
        settings.append("duplex")
        
    if paper_size == 'a4':
        settings.append("paper=A4")
    elif paper_size == 'letter':
        settings.append("paper=letter")
        
    if orientation == 'landscape':
        settings.append("landscape")
        
    print_settings_str = ",".join(settings) if settings else None

    try:
        success, message = printer_service.print_file(abs_file_path, print_settings=print_settings_str)
        return jsonify({"status": "success", "message": "Arquivo enviado para impressão com sucesso!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Servidor Flask rodando na porta {port} (Impressora: {DEFAULT_PRINTER})!")
    app.run(host=host, port=port, debug=True)