from flask import Flask, render_template, request
import os
import subprocess
from werkzeug.utils import secure_filename

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

NOME_IMPRESSORA = "HP LaserJet Professional M1132 MFP"
SUMATRA_PATH = r"C:\Projeto-extensao\impressaoAutomatizadaHTML\SumatraPDF\SumatraPDF.exe"  # Ajuste aqui para o caminho correto do SumatraPDF.exe

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return 'Nenhum arquivo enviado.', 400

    file = request.files['file']
    if file.filename == '':
        return 'Nenhum arquivo selecionado.', 400

    if not allowed_file(file.filename):
        return 'Tipo de arquivo não permitido.', 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    try:
        ext = filename.rsplit('.', 1)[1].lower()
        if ext == 'pdf':
            # Comando para imprimir PDF via SumatraPDF
            comando = f'"{SUMATRA_PATH}" -print-to "{NOME_IMPRESSORA}" -silent "{os.path.abspath(file_path)}"'
        else:
            # Comando para imprimir imagens via rundll32, método antigo para imprimir imagens 
            comando = f'rundll32.exe shimgvw.dll,ImageView_PrintTo "{os.path.abspath(file_path)}" "{NOME_IMPRESSORA}"'

        result = subprocess.run(comando, shell=True, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return f"Erro ao imprimir: {result.stderr}", 500

        return 'Arquivo enviado para impressão com sucesso!'
    except subprocess.TimeoutExpired:
        return "Erro: Timeout na impressão.", 500
    except Exception as e:
        return f"Erro ao imprimir: {e}", 500

if __name__ == '__main__':
    print("Servidor Flask rodando na porta 5000!")
    app.run(host='0.0.0.0', port=5000, debug=True)