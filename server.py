import os
import uuid
from flask import Flask, render_template, request, jsonify  # pyre-ignore[21]
from werkzeug.utils import secure_filename  # pyre-ignore[21]
from dotenv import load_dotenv  # pyre-ignore[21]

from printer_service import PrinterService  # pyre-ignore[21]
from pix_service import PixService  # pyre-ignore[21]

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

# Inicializa o serviço de Pix
MP_ACCESS_TOKEN = os.getenv("MERCADO_PAGO_ACCESS_TOKEN", "")
PIX_KEY = os.getenv("PIX_KEY", "")
PIX_MERCHANT_NAME = os.getenv("PIX_MERCHANT_NAME", "Capital Papelaria")
PIX_MERCHANT_CITY = os.getenv("PIX_MERCHANT_CITY", "Brasilia")

pix_service = PixService(
    access_token=MP_ACCESS_TOKEN,
    pix_key=PIX_KEY,
    merchant_name=PIX_MERCHANT_NAME,
    merchant_city=PIX_MERCHANT_CITY
)

if pix_service.has_mp:
    print("✅ Mercado Pago configurado — verificação automática de Pix ativada")
elif PIX_KEY:
    print("⚠️  Mercado Pago NÃO configurado — usando QR Code estático (sem verificação automática)")
else:
    print("❌ Nenhuma chave Pix configurada no .env")

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate-pix', methods=['POST'])
def generate_pix():
    """Gera cobrança Pix (dinâmica via MP ou estática como fallback)."""
    data = request.get_json()
    if not data or 'amount' not in data:
        return jsonify({"status": "error", "message": "Valor não informado."}), 400

    try:
        amount = float(data['amount'])
        if amount <= 0:
            return jsonify({"status": "error", "message": "Valor deve ser maior que zero."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Valor inválido."}), 400

    try:
        if pix_service.has_mp:
            # Mercado Pago — cobrança dinâmica com verificação automática
            result = pix_service.create_payment(amount)
            return jsonify({
                "status": "success",
                "mode": "mercadopago",
                "payment_id": result["payment_id"],
                "qr_base64": result["qr_base64"],
                "copia_cola": result["copia_cola"],
                "payment_status": result["status"],
                "amount": result["amount"]
            }), 200
        elif pix_service.pix_key:
            # Fallback — QR estático
            txid = uuid.uuid4().hex[:25]  # pyre-ignore
            result = pix_service.generate_static_qr(amount, txid)
            return jsonify({
                "status": "success",
                "mode": "static",
                "payment_id": None,
                "qr_base64": result["qr_base64"],
                "copia_cola": result["copia_cola"],
                "payment_status": "static",
                "amount": result["amount"]
            }), 200
        else:
            return jsonify({"status": "error", "message": "Nenhuma chave Pix configurada no .env"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": f"Erro ao gerar Pix: {str(e)}"}), 500

@app.route('/check-payment/<int:payment_id>', methods=['GET'])
def check_payment(payment_id):
    """Consulta o status de um pagamento no Mercado Pago."""
    if not pix_service.has_mp:
        return jsonify({"status": "error", "message": "Mercado Pago não configurado"}), 500

    try:
        result = pix_service.check_payment(payment_id)
        return jsonify({
            "status": "success",
            "payment_status": result["status"],
            "status_detail": result["status_detail"]
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
    color_mode = request.form.get('colorMode', 'color')
    page_fit = request.form.get('pageFit', 'fit')
    copies = request.form.get('copies', '1')
    
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
        
    if color_mode == 'monochrome':
        settings.append("monochrome")
    else:
        settings.append("color")
        
    if page_fit in ['fit', 'shrink', 'noscale']:
        settings.append(page_fit)
        
    try:
        copies_num = int(copies)
        if copies_num > 1:
            settings.append(f"{copies_num}x")
    except ValueError:
        pass
        
    print_settings_str = ",".join(settings) if settings else None

    try:
        success, message = printer_service.print_file(abs_file_path, print_settings=print_settings_str)
        return jsonify({"status": "success", "message": "Arquivo enviado para impressão com sucesso!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        # Garante a exclusão do arquivo, seja após o sucesso ou em caso de erro.
        try:
            if os.path.exists(abs_file_path):
                os.remove(abs_file_path)
                print(f"🔒 Arquivo apagado por segurança: {abs_file_path}")
        except Exception as cleanup_error:
            print(f"⚠️ Erro ao apagar o arquivo {abs_file_path}: {cleanup_error}")

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Servidor Flask rodando na porta {port} (Impressora: {DEFAULT_PRINTER})!")
    app.run(host=host, port=port, debug=True)