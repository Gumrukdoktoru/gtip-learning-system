"""Import a sealed private bundle using an owner-held code, without a download."""
import base64
import binascii
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from private_import import import_bundle

MAGIC=b'GKPK1'
AAD=b'gumruk-private-bootstrap-v1'
PACKAGE=Path(__file__).resolve().parent/'assets/private-bootstrap.enc'
MAX_SIZE=24*1024*1024+64


def open_bundle(code,path=None):
    if not isinstance(code,str) or len(code)>128:raise ValueError('Geçersiz aktarım kodu')
    try:key=base64.b64decode(code.strip(),altchars=b'-_',validate=True)
    except (ValueError,binascii.Error):raise ValueError('Geçersiz aktarım kodu') from None
    if len(key)!=32:raise ValueError('Geçersiz aktarım kodu')
    path=Path(path or PACKAGE)
    if path.stat().st_size>MAX_SIZE:raise ValueError('Aktarım paketi boyut sınırını aşıyor')
    sealed=path.read_bytes()
    if not sealed.startswith(MAGIC) or len(sealed)<len(MAGIC)+12+16:
        raise ValueError('Şifreli aktarım paketi doğrulanamadı')
    offset=len(MAGIC)
    try:return AESGCM(key).decrypt(sealed[offset:offset+12],sealed[offset+12:],AAD)
    except InvalidTag:raise ValueError('Aktarım kodu veya paket doğrulanamadı') from None


def import_with_code(database,code,path=None):
    return {**import_bundle(database,open_bundle(code,path)),'method':'private_code'}
