"""
Serviço de pagamento Pix via Mercado Pago.
Gera cobranças dinâmicas com QR Code e verifica pagamento automaticamente.
Mantém fallback para QR estático caso o Access Token não esteja configurado.
"""

import mercadopago  # pyre-ignore[21]
import qrcode  # pyre-ignore[21]
import io
import base64
import uuid


class PixService:
    """
    Gera cobranças Pix via Mercado Pago e consulta status de pagamento.
    Se o Access Token não estiver configurado, gera QR estático (BR Code EMV).
    """

    def __init__(self, access_token: str = "", pix_key: str = "", merchant_name: str = "", merchant_city: str = ""):
        self.access_token = access_token
        self.pix_key = pix_key
        self.merchant_name = self._sanitize(merchant_name, 25)
        self.merchant_city = self._sanitize(merchant_city, 15)
        
        # Inicializa SDK do Mercado Pago se tiver token
        self.sdk = None
        if access_token:
            self.sdk = mercadopago.SDK(access_token)

    @property
    def has_mp(self) -> bool:
        """Retorna True se o Mercado Pago está configurado."""
        return self.sdk is not None

    # ==========================================
    # MERCADO PAGO — Cobrança Dinâmica
    # ==========================================

    def create_payment(self, amount: float, description: str = "Impressão - Capital Papelaria", payer_email: str = "cliente@email.com") -> dict:
        """
        Cria uma cobrança Pix no Mercado Pago.
        
        Returns:
            dict com payment_id, qr_base64, copia_cola, status
        """
        sdk = self.sdk
        if not sdk:
            raise RuntimeError("Mercado Pago Access Token não configurado no .env")

        payment_data = {
            "transaction_amount": float(amount),
            "description": description,
            "payment_method_id": "pix",
            "payer": {
                "email": payer_email
            }
        }

        result = sdk.payment().create(payment_data)

        if result["status"] not in [200, 201]:
            error_msg = result.get("response", {}).get("message", "Erro desconhecido ao criar pagamento")
            raise RuntimeError(f"Erro do Mercado Pago: {error_msg}")

        response = result["response"]
        
        # Extrair dados do Pix
        transaction_data = response.get("point_of_interaction", {}).get("transaction_data", {})
        
        qr_code_base64 = transaction_data.get("qr_code_base64", "")
        qr_code_text = transaction_data.get("qr_code", "")  # Copia e Cola

        # Formatar o QR base64 como data URI se existir
        if qr_code_base64:
            qr_base64_uri = f"data:image/png;base64,{qr_code_base64}"
        else:
            qr_base64_uri = ""

        return {
            "payment_id": response["id"],
            "qr_base64": qr_base64_uri,
            "copia_cola": qr_code_text,
            "status": response["status"],  # "pending"
            "amount": f"{amount:.2f}"
        }

    def check_payment(self, payment_id: int) -> dict:
        """
        Consulta o status de um pagamento no Mercado Pago.
        
        Returns:
            dict com status ('pending', 'approved', 'rejected', etc.)
        """
        sdk = self.sdk
        if not sdk:
            raise RuntimeError("Mercado Pago Access Token não configurado")

        result = sdk.payment().get(payment_id)
        
        if result["status"] != 200:
            raise RuntimeError(f"Erro ao consultar pagamento: {result.get('response', {}).get('message', 'desconhecido')}")

        response = result["response"]
        return {
            "payment_id": response["id"],
            "status": response["status"],
            "status_detail": response.get("status_detail", ""),
        }

    # ==========================================
    # FALLBACK — QR Estático (BR Code EMV)
    # ==========================================

    @staticmethod
    def _sanitize(value: str, max_len: int) -> str:
        import unicodedata
        normalized = unicodedata.normalize('NFKD', value)
        ascii_str = normalized.encode('ASCII', 'ignore').decode('ASCII')
        return ascii_str[:max_len]  # pyre-ignore

    @staticmethod
    def _tlv(tag: str, value: str) -> str:
        length = str(len(value)).zfill(2)
        return f"{tag}{length}{value}"

    @staticmethod
    def _crc16(payload: str) -> str:
        crc = 0xFFFF
        for byte in payload.encode('utf-8'):
            crc ^= byte << 8
            for _ in range(8):
                if crc & 0x8000:
                    crc = (crc << 1) ^ 0x1021
                else:
                    crc = crc << 1
                crc &= 0xFFFF
        return format(crc, '04X')

    def generate_static_payload(self, amount: float, txid: str = "***") -> str:
        """Gera payload BR Code EMV para QR estático (fallback)."""
        payload = self._tlv("00", "01")
        payload += self._tlv("01", "12")
        mai = self._tlv("00", "br.gov.bcb.pix")
        mai += self._tlv("01", self.pix_key)
        payload += self._tlv("26", mai)
        payload += self._tlv("52", "0000")
        payload += self._tlv("53", "986")
        if amount > 0:
            payload += self._tlv("54", f"{amount:.2f}")
        payload += self._tlv("58", "BR")
        payload += self._tlv("59", self.merchant_name)
        payload += self._tlv("60", self.merchant_city)
        adf = self._tlv("05", self._sanitize(txid, 25))
        payload += self._tlv("62", adf)
        payload += "6304"
        payload += self._crc16(payload)
        return payload

    def generate_static_qr(self, amount: float, txid: str = "***") -> dict:
        """Gera QR Code estático (fallback quando MP não está configurado)."""
        payload = self.generate_static_payload(amount, txid)

        qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return {
            "payment_id": None,
            "qr_base64": f"data:image/png;base64,{img_base64}",
            "copia_cola": payload,
            "status": "static",
            "amount": f"{amount:.2f}"
        }
