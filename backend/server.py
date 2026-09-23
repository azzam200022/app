import os
import re
import hmac
import secrets
import uuid
import json
import io
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import jwt
import bcrypt
import httpx
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form, Query
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr
from pypdf import PdfReader
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials as firebase_credentials
from firebase_admin import firestore
from firebase_admin import storage as firebase_storage
from firestore_store import FirestoreDatabase

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SESSION_SECRET", "development-only-change-me")
APP_NAME = "souq-market"
CATALOG_VERSION = 2
MANAGER_EMAILS = {"zzam8160@gmail.com"}
PREVIEW_MODE = os.environ.get(
    "PREVIEW_MODE",
    "true" if os.environ.get("NODE_ENV") != "production" else "false",
).lower() in {"1", "true", "yes"}

try:
    DEFAULT_DELIVERY_FEE_IQD = max(0.0, round(float(os.environ.get("DEFAULT_DELIVERY_FEE_IQD", "1000")), 2))
except (TypeError, ValueError):
    DEFAULT_DELIVERY_FEE_IQD = 1000.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

FIREBASE_APP = None
FIRESTORE_CLIENT = None
FIREBASE_BUCKET = None
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
if FIREBASE_SERVICE_ACCOUNT_JSON:
    try:
        service_account = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
        FIREBASE_APP = firebase_admin.initialize_app(firebase_credentials.Certificate(service_account))
        FIRESTORE_CLIENT = firestore.client(app=FIREBASE_APP)
        storage_bucket = (
            os.environ.get("FIREBASE_STORAGE_BUCKET")
            or f"{service_account.get('project_id')}.firebasestorage.app"
        )
        FIREBASE_BUCKET = firebase_storage.bucket(storage_bucket, app=FIREBASE_APP)
    except Exception as exc:
        logger.warning("Firebase Admin initialization failed: %s", exc)
else:
    logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON is missing; Firestore API is not configured")

db = FirestoreDatabase(FIRESTORE_CLIENT)


app = FastAPI()
api = APIRouter(prefix="/api")

CATEGORY_IMAGES = {
    "غذائية": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80",
    "عصائر": "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80",
    "منظفات": "https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&q=80",
    "مواد منزليه": "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80",
    "كوزمتك": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80",
    "حفاظات": "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&q=80",
    "العاب": "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=400&q=80",
    "الكترونيات": "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
    "بقوليات": "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=400&q=80",
    "ورقيات": "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&q=80",
    "قرطاسية": "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=400&q=80",
    "ميزان": "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400&q=80",
    "جكاير": "https://images.unsplash.com/photo-1567761160290-e0d8b1de9a0f?w=400&q=80",
    "كارتات": "https://images.unsplash.com/photo-1580048915913-4f8f5cb481c4?w=400&q=80",
    "أخرى": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=400&q=80",
}
DEFAULT_IMG = CATEGORY_IMAGES["أخرى"]
CATALOG_ITEMS_CACHE = None
EXISTING_PRODUCT_BARCODES_CACHE = None

# Keep list/cart payloads small. Product descriptions are only needed by the
# product detail endpoint, not by the home grid or cart.
PRODUCT_LIST_PROJECTION = {
    "id": 1,
    "name": 1,
    "category": 1,
    "price": 1,
    "old_price": 1,
    "image_url": 1,
    "stock": 1,
    "is_published": 1,
    "coming_soon": 1,
    "created_at": 1,
    "deleted_at": 1,
}
CART_PRODUCT_PROJECTION = {
    "id": 1,
    "name": 1,
    "price": 1,
    "image_url": 1,
    "stock": 1,
    "coming_soon": 1,
    "deleted_at": 1,
}


def now_utc():
    return datetime.now(timezone.utc)


def local_catalog_items():
    global CATALOG_ITEMS_CACHE
    if CATALOG_ITEMS_CACHE is None:
        path = ROOT_DIR / "data" / "catalog.json"
        try:
            CATALOG_ITEMS_CACHE = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        except Exception as exc:
            logger.warning("local catalog load failed: %s", exc)
            CATALOG_ITEMS_CACHE = []
    return CATALOG_ITEMS_CACHE


def normalize_barcode(value) -> str:
    return re.sub(r"[^0-9]", "", str(value or "").translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")))


async def existing_product_barcodes():
    global EXISTING_PRODUCT_BARCODES_CACHE
    if EXISTING_PRODUCT_BARCODES_CACHE is not None:
        return EXISTING_PRODUCT_BARCODES_CACHE
    try:
        docs = await db.products.find({"deleted_at": None}, {"_id": 0, "barcode": 1}).to_list(10000)
        EXISTING_PRODUCT_BARCODES_CACHE = {doc.get("barcode") for doc in docs if doc.get("barcode")}
    except Exception as exc:
        logger.warning("existing product check skipped: %s", exc)
        EXISTING_PRODUCT_BARCODES_CACHE = set()
    return EXISTING_PRODUCT_BARCODES_CACHE


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionIn(BaseModel):
    session_id: str


class ProductIn(BaseModel):
    barcode: Optional[str] = ""
    name: str
    category: str = "أخرى"
    price: float
    old_price: Optional[float] = None
    image_url: Optional[str] = None
    description: Optional[str] = ""
    stock: int = 100
    is_published: bool = True
    coming_soon: bool = False


class ProductUpdate(BaseModel):
    barcode: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    old_price: Optional[float] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    stock: Optional[int] = None
    is_published: Optional[bool] = None
    coming_soon: Optional[bool] = None


class BannerIn(BaseModel):
    title: str = ""
    subtitle: str = ""
    image_url: str
    sort_order: int = 0
    is_active: bool = True


class BannerUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CartItemIn(BaseModel):
    product_id: str
    # Zero is allowed for set_cart_item so the client can clear a line item.
    quantity: int = Field(1, ge=0, le=1000)


class OrderIn(BaseModel):
    name: str
    phone: str
    address: str
    notes: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    area: Optional[str] = None
    delivery_area_id: Optional[str] = None
    coupon_code: Optional[str] = None
    client_request_id: Optional[str] = Field(None, min_length=8, max_length=100)


class StatusUpdateIn(BaseModel):
    status: str
    reason: Optional[str] = Field(None, max_length=200)
    otp: Optional[str] = None


class AssignIn(BaseModel):
    agent_id: str


class AgentUpdateIn(BaseModel):
    phone: Optional[str] = Field(None, max_length=30)


class ReturnItemIn(BaseModel):
    product_id: str
    quantity: int = Field(..., ge=1)


class ReturnIn(BaseModel):
    items: List[ReturnItemIn]
    reason: Optional[str] = ""


class ReturnStatusUpdateIn(BaseModel):
    status: str


class RoleIn(BaseModel):
    user_id: str
    role: str


class CouponValidateIn(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)


class CouponIn(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)
    description: str = Field("", max_length=160)
    discount_type: str = "percent"
    discount_value: Optional[float] = Field(None, gt=0)
    # Kept for backwards compatibility with the first coupon implementation.
    discount_percent: Optional[float] = Field(None, gt=0, le=100)
    applies_to: str = "subtotal"
    max_uses: Optional[int] = Field(None, ge=1)
    max_uses_per_user: int = Field(1, ge=1)
    minimum_subtotal: float = Field(0, ge=0)
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: bool = True


class CouponUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=160)
    discount_type: Optional[str] = None
    discount_value: Optional[float] = Field(None, gt=0)
    discount_percent: Optional[float] = Field(None, gt=0, le=100)
    applies_to: Optional[str] = None
    max_uses: Optional[int] = Field(None, ge=1)
    max_uses_per_user: Optional[int] = Field(None, ge=1)
    minimum_subtotal: Optional[float] = Field(None, ge=0)
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None


class DeliveryAreaIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    fee: float = Field(DEFAULT_DELIVERY_FEE_IQD, ge=0, le=1000000)
    center_lat: float = Field(..., ge=-90, le=90)
    center_lng: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(..., gt=0, le=100)
    is_active: bool = True


class DeliveryAreaUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    fee: Optional[float] = Field(None, ge=0, le=1000000)
    center_lat: Optional[float] = Field(None, ge=-90, le=90)
    center_lng: Optional[float] = Field(None, ge=-180, le=180)
    radius_km: Optional[float] = Field(None, gt=0, le=100)
    is_active: Optional[bool] = None


class DeliveryQuoteIn(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


# ---------------- Auth ----------------
async def get_user_by_token(authorization: Optional[str]):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()

    # Firebase ID tokens are the primary authentication mechanism.
    if FIREBASE_APP:
        try:
            decoded = await asyncio.to_thread(
                firebase_auth.verify_id_token, token, app=FIREBASE_APP
            )
            firebase_uid = decoded.get("uid")
            email = (decoded.get("email") or "").lower()
            firebase_phone = decoded.get("phone_number") or decoded.get("phone")
            forced_role = "manager" if email in MANAGER_EMAILS else None
            user = await db.users.find_one({"firebase_uid": firebase_uid}, {"_id": 0})
            if not user and email:
                user = await db.users.find_one({"email": email}, {"_id": 0})
                if user:
                    updates = {
                        "firebase_uid": firebase_uid,
                        "picture": decoded.get("picture"),
                    }
                    if firebase_phone:
                        updates["phone"] = firebase_phone
                    if forced_role and user.get("role") != forced_role:
                        updates["role"] = forced_role
                    await db.users.update_one(
                        {"user_id": user["user_id"]},
                        {"$set": updates},
                    )
                    user["firebase_uid"] = firebase_uid
                    user["picture"] = decoded.get("picture")
                    if firebase_phone:
                        user["phone"] = firebase_phone
                    if forced_role:
                        user["role"] = forced_role
            if not user:
                user = {
                    "user_id": "usr_" + uuid.uuid4().hex[:12],
                    "firebase_uid": firebase_uid,
                    "name": decoded.get("name") or (email.split("@")[0] if email else "مستخدم"),
                    "email": email,
                    "role": forced_role or "customer",
                    "picture": decoded.get("picture"),
                    "phone": firebase_phone,
                    "created_at": now_utc().isoformat(),
                }
                await db.users.insert_one(user.copy())
            return user
        except Exception as exc:
            verified_email = locals().get("email", "")
            verified_uid = locals().get("firebase_uid")
            if verified_email in MANAGER_EMAILS and verified_uid:
                logger.warning("Firebase manager fallback active: %s", exc)
                return {
                    "user_id": verified_uid,
                    "firebase_uid": verified_uid,
                    "name": decoded.get("name") or verified_email.split("@")[0],
                    "email": verified_email,
                    "role": "manager",
                    "picture": decoded.get("picture"),
                    "phone": decoded.get("phone_number") or decoded.get("phone"),
                }
            pass

    # Keep legacy JWT/session tokens working during migration.
    user_id = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
    except Exception:
        sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if sess:
            exp = sess.get("expires_at")
            if isinstance(exp, str):
                try:
                    exp = datetime.fromisoformat(exp)
                except Exception:
                    exp = None
            if exp is not None:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp > now_utc():
                    user_id = sess.get("user_id")
    if not user_id:
        return None
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})

async def require_user(authorization: Optional[str] = Header(None)):
    user = await get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="غير مصرح")
    return user


async def require_manager(user=Depends(require_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="مخصص للمدير فقط")
    return user


async def require_delivery(user=Depends(require_user)):
    if user.get("role") not in ("delivery", "manager"):
        raise HTTPException(status_code=403, detail="مخصص لمندوب التوصيل")
    return user


def public_user(u):
    return {k: u.get(k) for k in ("user_id", "name", "email", "role", "picture", "phone")}


@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم مسبقاً")
    uid = "user_" + uuid.uuid4().hex[:12]
    doc = {
        "user_id": uid,
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": hash_pw(body.password),
        "role": "customer",
        "picture": None,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    return {"token": make_jwt(uid), "user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("password_hash") or not verify_pw(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="البريد أو كلمة المرور غير صحيحة")
    return {"token": make_jwt(u["user_id"]), "user": public_user(u)}


@api.post("/auth/preview/{role}")
async def preview_login(role: str):
    """Development-only role shortcuts for previewing the three app experiences."""
    if not PREVIEW_MODE:
        raise HTTPException(status_code=404, detail="غير متاح")
    preview_accounts = {
        "manager": "manager@souq.iq",
        "delivery": "mandoob@souq.iq",
        "customer": "zboon@souq.iq",
    }
    email = preview_accounts.get(role)
    if not email:
        raise HTTPException(status_code=400, detail="دور غير صالح")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=503, detail="حساب المعاينة غير جاهز")
    return {"token": make_jwt(user["user_id"]), "user": public_user(user)}


@api.post("/auth/session")
async def google_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="جلسة غير صالحة")
    data = r.json()
    email = (data.get("email") or "").lower()
    forced_role = "manager" if email in MANAGER_EMAILS else None
    u = await db.users.find_one({"email": email})
    if not u:
        uid = "user_" + uuid.uuid4().hex[:12]
        u = {
            "user_id": uid,
            "name": data.get("name") or email.split("@")[0],
            "email": email,
            "password_hash": None,
            "role": forced_role or "customer",
            "picture": data.get("picture"),
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(u)
    elif forced_role and u.get("role") != forced_role:
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"role": forced_role}})
        u["role"] = forced_role
    session_token = data.get("session_token")
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": u["user_id"],
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    return {"session_token": session_token, "user": public_user(u)}


@api.get("/auth/me")
async def me(user=Depends(require_user)):
    return {"user": public_user(user)}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


async def send_push(recipients, data, idempotency_key=None):
    recipients = [r for r in (recipients or []) if r]
    if not recipients:
        return
    payload = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    resp.raise_for_status()


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def manager_ids():
    docs = await db.users.find({"role": "manager"}, {"_id": 0, "user_id": 1}).to_list(50)
    return [d["user_id"] for d in docs]


@api.get("/catalog/search")
async def catalog_search(q: str = Query(""), user=Depends(require_manager)):
    q = (q or "").strip()
    if len(q) < 2:
        return []
    local_items = local_catalog_items()
    docs = [
        item for item in local_items
        if q.casefold() in str(item.get("name") or "").casefold()
    ][:30]
    if not local_items:
        docs = await db.catalog.find({"name": {"$regex": re.escape(q), "$options": "i"}}, {"_id": 0}).limit(30).to_list(30)
    existing_barcodes = await existing_product_barcodes()
    out = []
    for it in docs:
        price = it.get("price") or 0
        special = it.get("special") or None
        old_price = None
        if special and special > 0 and price and special < price:
            old_price = price
            price = special
        out.append({
            "barcode": it["barcode"], "name": it["name"], "category": it["category"],
            "price": price, "old_price": old_price, "already_added": it["barcode"] in existing_barcodes,
            "suggested_image": CATEGORY_IMAGES.get(it["category"], DEFAULT_IMG),
        })
    return out


class SyncItem(BaseModel):
    barcode: str
    quantity: Optional[int] = None
    price: Optional[float] = None


class SyncIn(BaseModel):
    items: List[SyncItem]


@api.post("/inventory/sync")
async def inventory_sync(body: SyncIn, x_sync_key: Optional[str] = Header(None)):
    if x_sync_key != os.environ.get("SYNC_KEY"):
        raise HTTPException(status_code=401, detail="مفتاح المزامنة غير صالح")
    updated = 0
    not_found = []
    duplicate_barcodes = []
    for it in body.items:
        setd = {}
        if it.quantity is not None:
            quantity = max(0, int(it.quantity))
            setd["stock"] = quantity
            setd["coming_soon"] = quantity == 1
        if it.price is not None and it.price > 0:
            setd["price"] = float(it.price)
        if not setd:
            continue
        matches = await db.products.find({"barcode": it.barcode, "deleted_at": None}, {"_id": 0, "id": 1}).to_list(2)
        if not matches:
            not_found.append(it.barcode)
            continue
        if len(matches) > 1:
            duplicate_barcodes.append(it.barcode)
            continue
        # also update reference catalog price
        if "price" in setd:
            await db.catalog.update_many({"barcode": it.barcode}, {"$set": {"price": setd["price"]}})
        await db.products.update_one({"id": matches[0]["id"], "deleted_at": None}, {"$set": setd})
        updated += 1
    return {"updated": updated, "not_found": sorted(set(not_found)), "duplicate_barcodes": sorted(set(duplicate_barcodes)), "count": len(body.items)}


ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def parse_pdf_number(value):
    normalized = str(value).replace("٬", ",").replace("٫", ".").replace(",", "").strip()
    return float(normalized)


def parse_inventory_pdf(content: bytes):
    reader = PdfReader(io.BytesIO(content))
    rows = []
    invalid_rows = []
    barcode_pattern = re.compile(r"(?<!\d)(\d{8,14})(?!\d)")
    number_pattern = re.compile(r"(?<!\d)\d+(?:[.,]\d+)?(?!\d)")
    price_pattern = re.compile(r"(?:السعر|سعر|price)\s*[:：-]?\s*([\d٠-٩][\d٠-٩,٬]*(?:[.٫][\d٠-٩]+)?)", re.I)
    quantity_pattern = re.compile(r"(?:الكمية|كمية|quantity|qty|المخزون|stock)\s*[:：-]?\s*([\d٠-٩]+)", re.I)

    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        for line_number, raw_line in enumerate(text.splitlines(), 1):
            line = raw_line.translate(ARABIC_DIGITS).replace("٬", ",").replace("٫", ".").strip()
            barcode_match = barcode_pattern.search(line)
            if not barcode_match:
                continue
            barcode = normalize_barcode(barcode_match.group(1))
            remainder = line[:barcode_match.start()] + " " + line[barcode_match.end():]
            price_match = price_pattern.search(remainder)
            quantity_match = quantity_pattern.search(remainder)
            numbers = [parse_pdf_number(token) for token in number_pattern.findall(remainder)]
            price = parse_pdf_number(price_match.group(1)) if price_match else None
            quantity = int(parse_pdf_number(quantity_match.group(1))) if quantity_match else None
            if price is None or quantity is None:
                integers = [int(value) for value in numbers if value.is_integer() and value >= 0]
                if price is None and numbers:
                    price = max(numbers)
                if quantity is None and integers:
                    quantity = min(integers)
            if price is None or price <= 0 or quantity is None or quantity < 0:
                invalid_rows.append({"page": page_number, "line": line_number, "barcode": barcode})
                continue
            rows.append({"barcode": barcode, "price": round(price, 2), "quantity": quantity, "page": page_number, "line": line_number})

    by_barcode = {}
    duplicate_barcodes = set()
    for row in rows:
        if row["barcode"] in by_barcode:
            duplicate_barcodes.add(row["barcode"])
        else:
            by_barcode[row["barcode"]] = row
    unique_rows = [row for barcode, row in by_barcode.items() if barcode not in duplicate_barcodes]
    return unique_rows, sorted(duplicate_barcodes), invalid_rows


@api.post("/admin/inventory/pdf")
async def inventory_pdf(file: UploadFile = File(...), user=Depends(require_manager)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="يرجى رفع ملف PDF فقط")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="حجم ملف PDF يتجاوز 15 ميغابايت")
    try:
        rows, duplicate_barcodes, invalid_rows = parse_inventory_pdf(content)
    except Exception:
        logger.exception("Inventory PDF parsing failed")
        raise HTTPException(status_code=400, detail="تعذر قراءة ملف PDF. تأكد أنه يحتوي على نص واضح وبيانات الباركود والسعر والكمية")

    updated = 0
    not_found = []
    duplicate_products = []
    for row in rows:
        products = await db.products.find({"barcode": row["barcode"], "deleted_at": None}, {"_id": 0}).to_list(2)
        if not products:
            not_found.append(row["barcode"])
            continue
        if len(products) > 1:
            duplicate_products.append(row["barcode"])
            continue
        setd = {"price": row["price"], "stock": row["quantity"], "coming_soon": row["quantity"] == 1}
        await db.products.update_one({"id": products[0]["id"], "deleted_at": None}, {"$set": setd})
        await db.catalog.update_many({"barcode": row["barcode"]}, {"$set": {"price": row["price"]}})
        updated += 1
    return {"updated": updated, "count": len(rows), "not_found": sorted(set(not_found)), "duplicate_barcodes": sorted(set(duplicate_barcodes + duplicate_products)), "invalid_rows": invalid_rows}


# ---------------- Catalog ----------------
@api.get("/catalog/lookup/{barcode}")
async def catalog_lookup(barcode: str, user=Depends(require_manager)):
    local_items = local_catalog_items()
    item = next((entry for entry in local_items if entry.get("barcode") == barcode), None)
    if item is None and not local_items:
        item = await db.catalog.find_one({"barcode": barcode}, {"_id": 0})
    existing = barcode in await existing_product_barcodes()
    if not item:
        return {"found": False, "already_added": existing}
    price = item.get("price") or 0
    special = item.get("special") or None
    old_price = None
    if special and special > 0 and price and special < price:
        old_price = price
        price = special
    return {
        "found": True,
        "already_added": existing,
        "name": item["name"],
        "category": item["category"],
        "barcode": barcode,
        "price": price,
        "old_price": old_price,
        "suggested_image": CATEGORY_IMAGES.get(item["category"], DEFAULT_IMG),
    }


# ---------------- Banners ----------------
@api.get("/banners")
async def public_banners():
    return await db.banners.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(50)


@api.get("/admin/banners")
async def admin_banners(user=Depends(require_manager)):
    return await db.banners.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)


@api.post("/admin/banners")
async def create_banner(body: BannerIn, user=Depends(require_manager)):
    if not body.image_url.strip():
        raise HTTPException(status_code=400, detail="صورة البانوراما مطلوبة")
    bid = "banner_" + uuid.uuid4().hex[:12]
    doc = {
        "id": bid,
        "title": body.title.strip(),
        "subtitle": body.subtitle.strip(),
        "image_url": body.image_url.strip(),
        "sort_order": body.sort_order,
        "is_active": body.is_active,
        "created_at": now_utc().isoformat(),
    }
    await db.banners.insert_one(doc)
    return doc


@api.put("/admin/banners/{bid}")
async def update_banner(bid: str, body: BannerUpdate, user=Depends(require_manager)):
    updates = body.model_dump(exclude_none=True)
    if "image_url" in updates and not updates["image_url"].strip():
        raise HTTPException(status_code=400, detail="صورة البانوراما مطلوبة")
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "subtitle" in updates:
        updates["subtitle"] = updates["subtitle"].strip()
    if "image_url" in updates:
        updates["image_url"] = updates["image_url"].strip()
    if not updates:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير")
    result = await db.banners.update_one({"id": bid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="البانوراما غير موجودة")
    return await db.banners.find_one({"id": bid}, {"_id": 0})


@api.delete("/admin/banners/{bid}")
async def delete_banner(bid: str, user=Depends(require_manager)):
    result = await db.banners.delete_one({"id": bid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="البانوراما غير موجودة")
    return {"ok": True}


# ---------------- Delivery areas ----------------
def normalize_delivery_area(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    name = " ".join(str(value).strip().split())
    if not name:
        raise HTTPException(status_code=400, detail="اسم منطقة التوصيل مطلوب")
    return name


def default_delivery_area_view():
    return {
        "id": "default_delivery",
        "name": "التوصيل الأساسي",
        "fee": DEFAULT_DELIVERY_FEE_IQD,
        "distance_km": None,
    }


def delivery_area_public_view(area):
    view = dict(area)
    view.pop("_id", None)
    view["fee"] = round(float(view.get("fee", DEFAULT_DELIVERY_FEE_IQD) or DEFAULT_DELIVERY_FEE_IQD), 2)
    return view


def distance_between_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import asin, cos, radians, sin, sqrt
    first_lat, second_lat = radians(lat1), radians(lat2)
    dlat = second_lat - first_lat
    dlng = radians(lng2) - radians(lng1)
    value = sin(dlat / 2) ** 2 + cos(first_lat) * cos(second_lat) * sin(dlng / 2) ** 2
    return 6371 * 2 * asin(sqrt(min(1, max(0, value))))


async def resolve_delivery_area_for_location(lat: Optional[float], lng: Optional[float]):
    areas = await db.delivery_areas.find({"is_active": True}, {"_id": 0}).to_list(200)
    geo_areas = [area for area in areas if area.get("center_lat") is not None and area.get("center_lng") is not None and area.get("radius_km") is not None]
    if not geo_areas:
        return default_delivery_area_view()
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="حدد موقع التوصيل على الخريطة أولاً")
    matches = []
    for area in geo_areas:
        distance = distance_between_km(float(area["center_lat"]), float(area["center_lng"]), float(lat), float(lng))
        if distance <= float(area["radius_km"]):
            matches.append((distance, area))
    if not matches:
        raise HTTPException(status_code=400, detail="موقعك خارج مناطق التوصيل الحالية")
    distance, area = min(matches, key=lambda item: (item[0], float(item[1].get("radius_km", 0))))
    view = delivery_area_public_view(area)
    view["distance_km"] = round(distance, 2)
    return view


# ---------------- Coupons administration ----------------
@api.get("/admin/coupons")
async def admin_coupons(user=Depends(require_manager)):
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [coupon_public_view(coupon) for coupon in coupons]


@api.post("/admin/coupons")
async def create_coupon(body: CouponIn, user=Depends(require_manager)):
    code = normalize_coupon_code(body.code)
    if await db.coupons.find_one({"id": code}):
        raise HTTPException(status_code=409, detail="كود الخصم موجود مسبقاً")
    settings = normalized_coupon_settings(body.model_dump(), require_value=True)
    doc = {
        "id": code,
        "code": code,
        **settings,
        "usage_count": 0,
        "redeemed_by": [],
        "usage_by_user": {},
        "created_at": now_utc().isoformat(),
    }
    await db.coupons.insert_one(doc)
    return coupon_public_view(doc)


@api.put("/admin/coupons/{code}")
async def update_coupon(code: str, body: CouponUpdate, user=Depends(require_manager)):
    code = normalize_coupon_code(code)
    current = await db.coupons.find_one({"id": code}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="كود الخصم غير موجود")
    incoming = body.model_dump(exclude_none=True)
    if not incoming:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير")
    updates = normalized_coupon_settings(incoming, current, require_value=True)
    result = await db.coupons.update_one({"id": code}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="كود الخصم غير موجود")
    return coupon_public_view(await db.coupons.find_one({"id": code}, {"_id": 0}))


@api.delete("/admin/coupons/{code}")
async def delete_coupon(code: str, user=Depends(require_manager)):
    code = normalize_coupon_code(code)
    result = await db.coupons.delete_one({"id": code})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="كود الخصم غير موجود")
    return {"ok": True}


# ---------------- Delivery area administration ----------------
@api.get("/delivery/areas")
async def public_delivery_areas():
    areas = await db.delivery_areas.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(100)
    return [delivery_area_public_view(area) for area in areas]


@api.post("/delivery/quote")
async def delivery_quote(body: DeliveryQuoteIn, user=Depends(require_user)):
    area = await resolve_delivery_area_for_location(body.lat, body.lng)
    if not area:
        return {"area_id": "default_delivery", "area_name": "التوصيل الأساسي", "fee": DEFAULT_DELIVERY_FEE_IQD, "distance_km": None}
    return {"area_id": area["id"], "area_name": area["name"], "fee": area["fee"], "distance_km": area["distance_km"]}


@api.get("/admin/delivery-areas")
async def admin_delivery_areas(user=Depends(require_manager)):
    areas = await db.delivery_areas.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return [delivery_area_public_view(area) for area in areas]


@api.post("/admin/delivery-areas")
async def create_delivery_area(body: DeliveryAreaIn, user=Depends(require_manager)):
    name = normalize_delivery_area(body.name)
    if await db.delivery_areas.find_one({"name": name}):
        raise HTTPException(status_code=409, detail="منطقة التوصيل موجودة مسبقاً")
    doc = {
        "id": "area_" + uuid.uuid4().hex[:12],
        "name": name,
        "fee": round(float(body.fee), 2),
        "center_lat": float(body.center_lat),
        "center_lng": float(body.center_lng),
        "radius_km": round(float(body.radius_km), 3),
        "is_active": body.is_active,
        "created_at": now_utc().isoformat(),
    }
    await db.delivery_areas.insert_one(doc)
    return delivery_area_public_view(doc)


@api.put("/admin/delivery-areas/{area_id}")
async def update_delivery_area(area_id: str, body: DeliveryAreaUpdate, user=Depends(require_manager)):
    updates = body.model_dump(exclude_none=True)
    if "name" in updates:
        updates["name"] = normalize_delivery_area(updates["name"])
        duplicate = await db.delivery_areas.find_one({"name": updates["name"], "id": {"$ne": area_id}})
        if duplicate:
            raise HTTPException(status_code=409, detail="منطقة التوصيل موجودة مسبقاً")
    if "fee" in updates:
        updates["fee"] = round(float(updates["fee"]), 2)
    if "radius_km" in updates:
        updates["radius_km"] = round(float(updates["radius_km"]), 3)
    if not updates:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير")
    result = await db.delivery_areas.update_one({"id": area_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="منطقة التوصيل غير موجودة")
    return delivery_area_public_view(await db.delivery_areas.find_one({"id": area_id}, {"_id": 0}))


@api.delete("/admin/delivery-areas/{area_id}")
async def delete_delivery_area(area_id: str, user=Depends(require_manager)):
    result = await db.delivery_areas.delete_one({"id": area_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="منطقة التوصيل غير موجودة")
    return {"ok": True}


# ---------------- Products ----------------
def clean_product(p, favorites=None, availability_alerted=None):
    p = dict(p)
    p.pop("deleted_at", None)
    p.pop("_id", None)
    stock = p.get("stock", 0) or 0
    coming = bool(p.get("coming_soon"))
    p["coming_soon"] = coming
    p["stock"] = stock
    p["available"] = (stock > 0) and (not coming)
    p["stock_status"] = "coming_soon" if coming else ("out" if stock <= 0 else "in")
    if favorites is not None:
        p["is_favorite"] = p["id"] in favorites
    if availability_alerted is not None:
        p["availability_alerted"] = availability_alerted
    return p


@api.get("/products")
async def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    offers: Optional[bool] = False,
    authorization: Optional[str] = Header(None),
):
    q = {"deleted_at": None, "is_published": True}
    if category and category != "الكل":
        q["category"] = category
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    if offers:
        q["old_price"] = {"$ne": None, "$gt": 0}
    docs_task = db.products.find(q, PRODUCT_LIST_PROJECTION).sort("created_at", -1).to_list(500)
    user_task = get_user_by_token(authorization)
    docs, user = await asyncio.gather(docs_task, user_task)
    fav = set()
    if user:
        favs = await db.favorites.find({"user_id": user["user_id"]}, {"_id": 0, "product_id": 1}).to_list(1000)
        fav = {f["product_id"] for f in favs}
    return [clean_product(d, fav) for d in docs]


@api.get("/products/bestsellers")
async def bestsellers(authorization: Optional[str] = Header(None)):
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "qty": {"$sum": "$items.quantity"}}},
        {"$sort": {"qty": -1}},
        {"$limit": 10},
    ]
    res = await db.orders.aggregate(pipeline).to_list(10)
    ids = [r["_id"] for r in res]
    docs = await db.products.find({"id": {"$in": ids}, "deleted_at": None, "is_published": True}, {"_id": 0}).to_list(20)
    by_id = {d["id"]: d for d in docs}
    ordered = [by_id[i] for i in ids if i in by_id]
    if len(ordered) < 8:
        have = {d["id"] for d in ordered}
        extra = await db.products.find({"deleted_at": None, "is_published": True, "id": {"$nin": list(have)}}, {"_id": 0}).sort("created_at", -1).to_list(12)
        ordered += extra
    ordered = ordered[:10]
    fav = set()
    user = await get_user_by_token(authorization)
    if user:
        favs = await db.favorites.find({"user_id": user["user_id"]}, {"_id": 0, "product_id": 1}).to_list(1000)
        fav = {f["product_id"] for f in favs}
    return [clean_product(d, fav) for d in ordered]


@api.get("/products/{pid}")
async def get_product(pid: str, authorization: Optional[str] = Header(None)):
    product_task = db.products.find_one({"id": pid, "deleted_at": None}, {"_id": 0})
    user_task = get_user_by_token(authorization)
    d, user = await asyncio.gather(product_task, user_task)
    if not d:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    fav = set()
    availability_alerted = False
    if user:
        f = await db.favorites.find_one({"user_id": user["user_id"], "product_id": pid})
        if f:
            fav = {pid}
        alert = await db.product_availability_alerts.find_one({"user_id": user["user_id"], "product_id": pid})
        availability_alerted = bool(alert)
    return clean_product(d, fav, availability_alerted)


@api.post("/products/{pid}/availability-alert", status_code=201)
async def subscribe_availability_alert(pid: str, user=Depends(require_user)):
    product = await db.products.find_one(
        {"id": pid, "deleted_at": None},
        {"_id": 0, "id": 1, "stock": 1, "coming_soon": 1},
    )
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    available = (int(product.get("stock", 0) or 0) > 0) and not bool(product.get("coming_soon"))
    if available:
        return {"subscribed": False, "available": True}
    alert_id = f"{user['user_id']}:{pid}"
    await db.product_availability_alerts.update_one(
        {"id": alert_id},
        {"$set": {
            "id": alert_id,
            "user_id": user["user_id"],
            "product_id": pid,
            "created_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"subscribed": True, "available": False}


@api.delete("/products/{pid}/availability-alert")
async def unsubscribe_availability_alert(pid: str, user=Depends(require_user)):
    alert_id = f"{user['user_id']}:{pid}"
    await db.product_availability_alerts.delete_one({"id": alert_id})
    return {"subscribed": False}


@api.get("/categories")
async def categories():
    docs = await db.products.find(
        {"deleted_at": None, "is_published": True},
        {"_id": 0, "category": 1},
    ).to_list(5000)
    counts = {}
    for doc in docs:
        category = doc.get("category") or "أخرى"
        counts[category] = counts.get(category, 0) + 1
    return [
        {
            "name": category,
            "count": count,
            "image": CATEGORY_IMAGES.get(category, DEFAULT_IMG),
        }
        for category, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
    ]


@api.post("/products")
async def create_product(body: ProductIn, user=Depends(require_manager)):
    barcode = normalize_barcode(body.barcode)
    if not barcode:
        raise HTTPException(status_code=400, detail="الباركود مطلوب لكل منتج")
    if not re.fullmatch(r"\d{8,14}", barcode):
        raise HTTPException(status_code=400, detail="الباركود يجب أن يتكون من 8 إلى 14 رقماً")
    duplicate = await db.products.find_one({"barcode": barcode, "deleted_at": None}, {"_id": 0, "id": 1})
    if duplicate:
        raise HTTPException(status_code=409, detail="هذا الباركود مستخدم لمنتج آخر")
    pid = "prod_" + uuid.uuid4().hex[:12]
    doc = {
        "id": pid,
        "barcode": barcode,
        "name": body.name,
        "category": body.category or "أخرى",
        "price": body.price,
        "old_price": body.old_price,
        "image_url": body.image_url or CATEGORY_IMAGES.get(body.category, DEFAULT_IMG),
        "description": body.description or "",
        "stock": body.stock,
        "is_published": body.is_published,
        "coming_soon": body.coming_soon,
        "created_at": now_utc().isoformat(),
        "deleted_at": None,
    }
    await db.products.insert_one(doc)
    if body.barcode and EXISTING_PRODUCT_BARCODES_CACHE is not None:
        EXISTING_PRODUCT_BARCODES_CACHE.add(body.barcode)
    return clean_product(doc)


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductUpdate, user=Depends(require_manager)):
    upd = {k: v for k, v in body.dict().items() if v is not None}
    if body.barcode is not None:
        barcode = normalize_barcode(body.barcode)
        if not re.fullmatch(r"\d{8,14}", barcode):
            raise HTTPException(status_code=400, detail="الباركود يجب أن يتكون من 8 إلى 14 رقماً")
        duplicate = await db.products.find_one({"barcode": barcode, "id": {"$ne": pid}, "deleted_at": None}, {"_id": 0, "id": 1})
        if duplicate:
            raise HTTPException(status_code=409, detail="هذا الباركود مستخدم لمنتج آخر")
        upd["barcode"] = barcode
    if not upd:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير")
    existing = await db.products.find_one({"id": pid, "deleted_at": None}, {"_id": 0, "coming_soon": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    was_coming_soon = bool(existing.get("coming_soon"))
    r = await db.products.update_one({"id": pid, "deleted_at": None}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    d = await db.products.find_one({"id": pid}, {"_id": 0})
    product_is_available = int(d.get("stock", 0) or 0) > 0 and not bool(d.get("coming_soon"))
    if was_coming_soon and body.coming_soon is False and product_is_available:
        alert_docs = await db.product_availability_alerts.find({"product_id": pid}, {"_id": 0, "user_id": 1}).to_list(1000)
        recipients = list(dict.fromkeys(item.get("user_id") for item in alert_docs if item.get("user_id")))
        try:
            for start in range(0, len(recipients), 100):
                await send_push(
                    recipients[start:start + 100],
                    {
                        "title": "المنتج متوفر الآن 🎉",
                        "message": f"عاد {d.get('name', 'المنتج')} متاحاً للشراء",
                        "action_url": f"/product/{pid}",
                    },
                    idempotency_key=f"product-available:{pid}:{now_utc().isoformat()}:{start}",
                )
        except Exception as exc:
            logger.warning("availability notification failed for %s: %s", pid, exc)
        else:
            if recipients:
                await db.product_availability_alerts.delete_many({"product_id": pid})
    return clean_product(d)


@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_manager)):
    await db.products.update_one({"id": pid}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}


# ---------------- Favorites ----------------
@api.get("/favorites")
async def get_favorites(user=Depends(require_user)):
    favs = await db.favorites.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    ids = [f["product_id"] for f in favs]
    docs = await db.products.find({"id": {"$in": ids}, "deleted_at": None}, {"_id": 0}).to_list(1000)
    return [clean_product(d, set(ids)) for d in docs]


@api.post("/favorites/{pid}")
async def toggle_favorite(pid: str, user=Depends(require_user)):
    existing = await db.favorites.find_one({"user_id": user["user_id"], "product_id": pid})
    if existing:
        await db.favorites.delete_one({"user_id": user["user_id"], "product_id": pid})
        return {"is_favorite": False}
    await db.favorites.insert_one({"user_id": user["user_id"], "product_id": pid, "created_at": now_utc().isoformat()})
    return {"is_favorite": True}


# ---------------- Coupons ----------------
COUPON_CODE_RE = re.compile(r"^[A-Z0-9_-]{3,32}$")


def normalize_coupon_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    code = str(value).strip().upper()
    if not code:
        return None
    if not COUPON_CODE_RE.fullmatch(code):
        raise HTTPException(status_code=400, detail="كود الخصم غير صالح أو يحتوي أكثر من كود")
    return code


def coupon_public_view(coupon):
    view = dict(coupon)
    view.pop("redeemed_by", None)
    view.pop("usage_by_user", None)
    view.pop("_id", None)
    max_uses = view.get("max_uses")
    view["usage_remaining"] = (
        max(0, int(max_uses) - int(view.get("usage_count", 0) or 0))
        if max_uses is not None
        else None
    )
    return view


def coupon_datetime(value, end_of_day=False):
    if value in (None, ""):
        return None
    raw = str(value).strip()
    if len(raw) == 10:
        raw += "T23:59:59+00:00" if end_of_day else "T00:00:00+00:00"
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def normalized_coupon_settings(values, existing=None, require_value=True):
    merged = dict(existing or {})
    merged.update({key: value for key, value in values.items() if value is not None})
    discount_type = str(merged.get("discount_type") or "percent").strip().lower()
    applies_to = str(merged.get("applies_to") or "subtotal").strip().lower()
    if discount_type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="نوع الخصم يجب أن يكون نسبة أو مبلغاً ثابتاً")
    if applies_to not in ("subtotal", "delivery"):
        raise HTTPException(status_code=400, detail="مكان تطبيق الخصم غير صالح")

    raw_value = merged.get("discount_value")
    if raw_value is None:
        raw_value = merged.get("discount_percent")
    if raw_value is None and require_value:
        raise HTTPException(status_code=400, detail="قيمة الخصم مطلوبة")
    if raw_value is not None:
        raw_value = round(float(raw_value), 2)
        if raw_value <= 0 or (discount_type == "percent" and raw_value > 100):
            raise HTTPException(status_code=400, detail="قيمة الخصم غير صالحة")

    starts_at = coupon_datetime(merged.get("starts_at"))
    expires_at = coupon_datetime(merged.get("expires_at"), end_of_day=True)
    if starts_at and expires_at and datetime.fromisoformat(starts_at) >= datetime.fromisoformat(expires_at):
        raise HTTPException(status_code=400, detail="تاريخ البداية يجب أن يسبق تاريخ الانتهاء")
    if expires_at and datetime.fromisoformat(expires_at) <= now_utc():
        raise HTTPException(status_code=400, detail="تاريخ انتهاء الكود يجب أن يكون في المستقبل")

    return {
        "description": str(merged.get("description") or "").strip(),
        "discount_type": discount_type,
        "discount_value": raw_value,
        # Preserve this field for older clients and existing documents.
        "discount_percent": raw_value if discount_type == "percent" else 0,
        "applies_to": applies_to,
        "max_uses": merged.get("max_uses"),
        "max_uses_per_user": int(merged.get("max_uses_per_user", 1) or 1),
        "minimum_subtotal": round(float(merged.get("minimum_subtotal", 0) or 0), 2),
        "starts_at": starts_at,
        "expires_at": expires_at,
        "is_active": bool(merged.get("is_active", True)),
    }


def coupon_expired(coupon) -> bool:
    expires_at = coupon.get("expires_at")
    if not expires_at:
        return False
    try:
        parsed = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed <= now_utc()
    except (TypeError, ValueError):
        return True


def coupon_not_started(coupon) -> bool:
    starts_at = coupon.get("starts_at")
    if not starts_at:
        return False
    try:
        parsed = datetime.fromisoformat(str(starts_at).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed > now_utc()
    except (TypeError, ValueError):
        return True


def ensure_coupon_available(coupon, user_id: str):
    if not coupon or not coupon.get("is_active", False):
        raise HTTPException(status_code=400, detail="كود الخصم غير موجود أو غير فعال")
    if coupon_not_started(coupon):
        raise HTTPException(status_code=400, detail="لم تبدأ صلاحية كود الخصم بعد")
    if coupon_expired(coupon):
        raise HTTPException(status_code=400, detail="انتهت صلاحية كود الخصم")
    redeemed_by = coupon.get("redeemed_by") or []
    usage_by_user = coupon.get("usage_by_user") or {}
    user_uses = int(usage_by_user.get(user_id, 0) or 0)
    max_uses_per_user = int(coupon.get("max_uses_per_user", 1) or 1)
    if (not usage_by_user and user_id in redeemed_by) or user_uses >= max_uses_per_user:
        raise HTTPException(status_code=409, detail="تجاوزت عدد مرات استخدام كود الخصم المسموحة لك")
    max_uses = coupon.get("max_uses")
    if max_uses is not None and int(coupon.get("usage_count", 0) or 0) >= int(max_uses):
        raise HTTPException(status_code=400, detail="اكتمل عدد مرات استخدام كود الخصم")


def coupon_discount(amount: float, coupon) -> float:
    discount_type = coupon.get("discount_type") or "percent"
    value = coupon.get("discount_value")
    if value is None:
        value = coupon.get("discount_percent", 0)
    raw_discount = float(value or 0)
    discount = amount * raw_discount / 100 if discount_type == "percent" else raw_discount
    return round(min(max(discount, 0), max(amount, 0)), 2)


async def reserve_coupon(code: str, user_id: str):
    coupon = await db.coupons.find_one({"id": code})
    ensure_coupon_available(coupon, user_id)
    usage_count = int(coupon.get("usage_count", 0) or 0)
    usage_by_user = coupon.get("usage_by_user") or {}
    user_uses = int(usage_by_user.get(user_id, 0) or 0)
    max_uses_per_user = int(coupon.get("max_uses_per_user", 1) or 1)
    query = {"id": code, "is_active": True, "usage_count": usage_count}
    # A missing nested usage field does not match Firestore's numeric
    # comparison, so the first use is claimed through the redeemed_by list.
    if user_uses == 0:
        query["redeemed_by"] = {"$nin": [user_id]}
    else:
        query[f"usage_by_user.{user_id}"] = {"$lt": max_uses_per_user}
    if coupon.get("expires_at"):
        query["expires_at"] = coupon["expires_at"]
    reserved = await db.coupons.find_one_and_update(
        query,
        {"$set": {"usage_count": usage_count + 1, f"usage_by_user.{user_id}": user_uses + 1}, "$push": {"redeemed_by": user_id}},
    )
    if not reserved:
        raise HTTPException(status_code=409, detail="تعذر تطبيق كود الخصم؛ حاول مرة أخرى")
    return coupon


@api.post("/coupons/validate")
async def validate_coupon(body: CouponValidateIn, user=Depends(require_user)):
    code = normalize_coupon_code(body.code)
    cart = await build_cart(user["user_id"])
    if not cart["items"]:
        raise HTTPException(status_code=400, detail="السلة فارغة")
    coupon = await db.coupons.find_one({"id": code})
    ensure_coupon_available(coupon, user["user_id"])
    subtotal = round(float(cart["total"]), 2)
    if subtotal < float(coupon.get("minimum_subtotal", 0) or 0):
        raise HTTPException(status_code=400, detail="قيمة السلة أقل من الحد الأدنى لهذا الكود")
    delivery_fee = 0.0
    delivery_area = None
    if body.lat is not None and body.lng is not None:
        delivery_area = await resolve_delivery_area_for_location(body.lat, body.lng)
        delivery_fee = float(delivery_area.get("fee", 0) if delivery_area else 0)
    elif coupon.get("applies_to") == "delivery":
        raise HTTPException(status_code=400, detail="حدد موقع التوصيل قبل استخدام هذا الكود")
    discount_base = delivery_fee if coupon.get("applies_to") == "delivery" else subtotal
    discount = coupon_discount(discount_base, coupon)
    return {
        "coupon_code": code,
        "discount_type": coupon.get("discount_type", "percent"),
        "discount_value": float(coupon.get("discount_value", coupon.get("discount_percent", 0)) or 0),
        "applies_to": coupon.get("applies_to", "subtotal"),
        "discount_percent": float(coupon.get("discount_percent", 0) or 0),
        "subtotal": subtotal,
        "delivery_fee": round(delivery_fee, 2),
        "discount_amount": discount,
        "total": round(subtotal + delivery_fee - discount, 2),
    }


# ---------------- Cart ----------------
async def load_cart_products(items, seed=None):
    seed = dict(seed or {})
    ids = [str(item.get("product_id")) for item in items if item.get("product_id")]
    missing_ids = [product_id for product_id in ids if product_id not in seed]
    if missing_ids:
        products = await db.products.find(
            {"id": {"$in": list(dict.fromkeys(missing_ids))}, "deleted_at": None},
            CART_PRODUCT_PROJECTION,
        ).to_list(len(missing_ids))
        seed.update({product["id"]: product for product in products})
    return seed


def cart_from_items(items, products_by_id):
    out = []
    total = 0.0
    for item in items:
        product = products_by_id.get(str(item.get("product_id")))
        quantity = max(int(item.get("quantity", 0) or 0), 0)
        if not product or quantity <= 0:
            continue
        line_total = float(product.get("price", 0) or 0) * quantity
        total += line_total
        out.append(
            {
                "product_id": product["id"],
                "name": product.get("name", ""),
                "price": product.get("price", 0),
                "image_url": product.get("image_url", ""),
                "quantity": quantity,
                "stock": max(int(product.get("stock", 0) or 0), 0),
                "line_total": line_total,
            }
        )
    return {"items": out, "total": total, "count": sum(item["quantity"] for item in out)}


async def build_cart(user_id, cart_doc=None, items=None, products_by_id=None):
    if cart_doc is None:
        cart_doc = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    cart_items = list(items if items is not None else (cart_doc or {}).get("items", []))
    products = products_by_id or await load_cart_products(cart_items)
    return cart_from_items(cart_items, products)


@api.get("/cart")
async def get_cart(user=Depends(require_user)):
    return await build_cart(user["user_id"])


@api.post("/cart/items")
async def add_to_cart(body: CartItemIn, user=Depends(require_user)):
    cart_task = db.carts.find_one({"user_id": user["user_id"]}, {"_id": 0})
    product_task = db.products.find_one(
        {"id": body.product_id, "deleted_at": None},
        CART_PRODUCT_PROJECTION,
    )
    cart, prod = await asyncio.gather(cart_task, product_task)
    if not prod:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    if prod.get("coming_soon"):
        raise HTTPException(status_code=400, detail="هذا المنتج يتوفر قريباً")
    available_stock = max(int(prod.get("stock", 0) or 0), 0)
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="يجب أن تكون الكمية أكبر من صفر")
    if available_stock <= 0:
        raise HTTPException(status_code=400, detail="نفدت الكمية")
    items = list((cart or {}).get("items", []))
    found = False
    for it in items:
        if it["product_id"] == body.product_id:
            current_quantity = max(int(it.get("quantity", 0) or 0), 0)
            if current_quantity + body.quantity > available_stock:
                raise HTTPException(status_code=400, detail=f"الكمية المتاحة فقط: {available_stock}")
            it["quantity"] = current_quantity + body.quantity
            found = True
            break
    if not found:
        if body.quantity > available_stock:
            raise HTTPException(status_code=400, detail=f"الكمية المتاحة فقط: {available_stock}")
        items.append({"product_id": body.product_id, "quantity": body.quantity})
    items = [i for i in items if i["quantity"] > 0]
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": items}}, upsert=True)
    products = await load_cart_products(items, {prod["id"]: prod})
    return cart_from_items(items, products)


@api.put("/cart/items")
async def set_cart_item(body: CartItemIn, user=Depends(require_user)):
    cart_task = db.carts.find_one({"user_id": user["user_id"]}, {"_id": 0})
    product_task = db.products.find_one(
        {"id": body.product_id, "deleted_at": None},
        CART_PRODUCT_PROJECTION,
    )
    cart, prod = await asyncio.gather(cart_task, product_task)
    if not prod:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    if prod.get("coming_soon") and body.quantity > 0:
        raise HTTPException(status_code=400, detail="هذا المنتج يتوفر قريباً")
    available_stock = max(int(prod.get("stock", 0) or 0), 0)
    if body.quantity > available_stock:
        raise HTTPException(status_code=400, detail=f"الكمية المتاحة فقط: {available_stock}")
    items = list((cart or {}).get("items", []))
    items = [i for i in items if i["product_id"] != body.product_id]
    if body.quantity > 0:
        items.append({"product_id": body.product_id, "quantity": body.quantity})
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": items}}, upsert=True)
    products = await load_cart_products(items)
    return cart_from_items(items, products)


@api.delete("/cart/items/{pid}")
async def remove_cart_item(pid: str, user=Depends(require_user)):
    cart = await db.carts.find_one({"user_id": user["user_id"]})
    items = [item for item in (cart or {}).get("items", []) if item["product_id"] != pid]
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": items}}, upsert=True)
    products = await load_cart_products(items)
    return cart_from_items(items, products)


# ---------------- Orders ----------------
async def reserve_order_stock(items):
    """Atomically reserve every item, rolling back partial reservations on failure."""
    reserved = []
    try:
        for item in items:
            quantity = max(int(item.get("quantity", 0) or 0), 0)
            if quantity <= 0:
                continue
            product_id = item["product_id"]
            updated = await db.products.find_one_and_update(
                {"id": product_id, "deleted_at": None, "stock": {"$gte": quantity}},
                {"$inc": {"stock": -quantity}},
            )
            if not updated:
                raise HTTPException(status_code=409, detail=f"المخزون غير كافٍ للمنتج: {item.get('name', '')}")
            reserved.append({"product_id": product_id, "quantity": quantity})
    except Exception:
        try:
            await release_order_stock(reserved)
        except Exception as rollback_error:
            logger.error("stock reservation rollback failed: %s", rollback_error)
        raise
    return reserved


async def release_order_stock(items):
    for item in items:
        quantity = max(int(item.get("quantity", 0) or 0), 0)
        if quantity <= 0:
            continue
        await db.products.find_one_and_update(
            {"id": item["product_id"]},
            {"$inc": {"stock": quantity}},
        )


STATUS_FLOW = ["pending", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered"]
STATUS_LABEL = {
    "pending": "قيد المراجعة",
    "confirmed": "تم التأكيد",
    "preparing": "قيد التجهيز",
    "ready_for_delivery": "جاهز للتوصيل",
    "out_for_delivery": "في الطريق",
    "delivered": "تم التوصيل",
    "delivery_failed": "تعذر التسليم",
    "cancelled": "ملغي",
}
ORDER_STATUS_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"preparing", "cancelled"},
    "preparing": {"ready_for_delivery", "cancelled"},
    "ready_for_delivery": {"cancelled"},
    "out_for_delivery": {"delivered", "delivery_failed"},
    "delivered": set(),
    "delivery_failed": set(),
    "cancelled": set(),
}


DELIVERY_AVAILABLE_STATUSES = ("ready_for_delivery",)
try:
    STORE_LAT = float(os.environ.get("STORE_LAT", "33.3152"))
    STORE_LNG = float(os.environ.get("STORE_LNG", "44.3661"))
except (TypeError, ValueError):
    STORE_LAT, STORE_LNG = 33.3152, 44.3661


def infer_order_area(address: str) -> str:
    return re.split(r"[،,\n]", address or "", maxsplit=1)[0].strip() or "غير محددة"


def approximate_distance_km(location):
    if not location or location.get("lat") is None or location.get("lng") is None:
        return None
    try:
        from math import asin, cos, radians, sin, sqrt
        lat = radians(float(location["lat"]))
        lng = radians(float(location["lng"]))
        store_lat = radians(STORE_LAT)
        store_lng = radians(STORE_LNG)
        dlat = lat - store_lat
        dlng = lng - store_lng
        haversine = sin(dlat / 2) ** 2 + cos(store_lat) * cos(lat) * sin(dlng / 2) ** 2
        return round(6371 * 2 * asin(sqrt(haversine)), 1)
    except (KeyError, TypeError, ValueError):
        return None


def delivery_order_view(order, delivery_state: str):
    items = order.get("items", [])
    item_count = sum(max(int(item.get("quantity", 1) or 1), 0) for item in items)
    location = order.get("location")
    return {
        "id": order.get("id"),
        "customer_name": order.get("customer_name", ""),
        "phone": order.get("phone") or order.get("phone_number"),
        "address": order.get("address", ""),
        "location": location,
        "area": order.get("area") or infer_order_area(order.get("address", "")),
        "distance_km": approximate_distance_km(location),
        "items": [
            {key: item.get(key) for key in ("product_id", "name", "image_url", "price", "quantity", "line_total")}
            for item in items
        ],
        "item_count": item_count,
        "total": order.get("total", 0),
        "status": order.get("status"),
        "delivery_state": delivery_state,
        "return_status": order.get("return_status"),
        "returned_total": order.get("returned_total", 0),
        "amount_due": order.get("total", 0),
        "created_at": order.get("created_at"),
        "delivered_at": order.get("delivered_at"),
        "agent_phone": order.get("agent_phone"),
    }


@api.post("/orders")
async def create_order(body: OrderIn, user=Depends(require_user)):
    if body.client_request_id:
        existing = await db.orders.find_one(
            {"user_id": user["user_id"], "client_request_id": body.client_request_id},
            {"_id": 0},
        )
        if existing:
            return existing
    cart = await build_cart(user["user_id"])
    if not cart["items"]:
        raise HTTPException(status_code=400, detail="السلة فارغة")
    for item in cart["items"]:
        available_stock = max(int(item.get("stock", 0) or 0), 0)
        if int(item.get("quantity", 0) or 0) > available_stock:
            raise HTTPException(status_code=409, detail=f"المخزون غير كافٍ للمنتج: {item.get('name', '')}")
    if body.lat is None or body.lng is None:
        raise HTTPException(status_code=400, detail="حدد موقع التوصيل على الخريطة")
    delivery_area = await resolve_delivery_area_for_location(body.lat, body.lng)
    if not delivery_area:
        raise HTTPException(status_code=400, detail="الموقع خارج نطاق التوصيل")
    delivery_fee = float(delivery_area["fee"])
    subtotal = round(float(cart["total"]), 2)
    coupon_code = normalize_coupon_code(body.coupon_code)
    coupon = None
    discount_amount = 0.0
    if coupon_code:
        candidate = await db.coupons.find_one({"id": coupon_code})
        ensure_coupon_available(candidate, user["user_id"])
        if subtotal < float(candidate.get("minimum_subtotal", 0) or 0):
            raise HTTPException(status_code=400, detail="قيمة السلة أقل من الحد الأدنى لهذا الكود")
        coupon = await reserve_coupon(coupon_code, user["user_id"])
        discount_base = delivery_fee if coupon.get("applies_to") == "delivery" else subtotal
        discount_amount = coupon_discount(discount_base, coupon)
    total = round(subtotal - discount_amount + delivery_fee, 2)
    oid = "ORD" + uuid.uuid4().hex[:8].upper()
    doc = {
        "id": oid,
        "user_id": user["user_id"],
        "customer_name": body.name,
        "phone": body.phone,
        "address": body.address,
        "area": delivery_area["name"] if delivery_area else (body.area or infer_order_area(body.address)),
        "delivery_area_id": delivery_area["id"] if delivery_area else None,
        "delivery_fee": round(delivery_fee, 2),
        "notes": body.notes or "",
        "location": ({"lat": body.lat, "lng": body.lng} if (body.lat is not None and body.lng is not None) else None),
        "items": [
            {key: value for key, value in item.items() if key != "stock"}
            for item in cart["items"]
        ],
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "coupon_code": coupon_code,
        "coupon_discount_type": coupon.get("discount_type", "percent") if coupon else None,
        "coupon_discount_value": float(coupon.get("discount_value", coupon.get("discount_percent", 0)) or 0) if coupon else 0.0,
        "coupon_applies_to": coupon.get("applies_to", "subtotal") if coupon else None,
        "coupon_discount_percent": float(coupon["discount_percent"]) if coupon else 0.0,
        "client_request_id": body.client_request_id,
        "total": total,
        "status": "pending",
        "payment": "cod",
        "delivery_otp": f"{secrets.randbelow(1000000):06d}",
        "agent_id": None,
        "agent_name": None,
        "agent_phone": None,
        "timeline": [{"status": "pending", "at": now_utc().isoformat()}],
        "created_at": now_utc().isoformat(),
    }
    reserved_stock = await reserve_order_stock(doc["items"])
    doc["stock_reserved"] = bool(reserved_stock)
    doc["stock_released"] = False
    try:
        await db.orders.insert_one(doc)
    except Exception:
        await release_order_stock(reserved_stock)
        raise HTTPException(status_code=503, detail="تعذر إنشاء الطلب؛ حاول مرة أخرى")
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": []}})
    doc.pop("_id", None)
    try:
        await send_push(await manager_ids(), {"title": "طلب جديد 🛒", "message": f"طلب جديد من {body.name} بقيمة {int(total)} د.ع", "action_url": f"/order/{oid}"})
    except Exception as e:
        logger.warning(f"push failed: {e}")
    return doc


@api.post("/orders/{oid}/reorder")
async def reorder_order(oid: str, user=Depends(require_user)):
    order = await db.orders.find_one({"id": oid, "user_id": user["user_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    source_items = list(order.get("items") or [])
    if not source_items:
        raise HTTPException(status_code=400, detail="لا توجد منتجات في هذا الطلب")

    current_cart = await db.carts.find_one({"user_id": user["user_id"]}, {"_id": 0})
    merged_items = []
    positions = {}
    for item in list((current_cart or {}).get("items", [])):
        product_id = str(item.get("product_id") or "")
        quantity = max(int(item.get("quantity", 0) or 0), 0)
        if not product_id or quantity <= 0:
            continue
        if product_id in positions:
            merged_items[positions[product_id]]["quantity"] += quantity
        else:
            positions[product_id] = len(merged_items)
            merged_items.append({"product_id": product_id, "quantity": quantity})

    products = await load_cart_products(source_items + merged_items)
    added_items = []
    unavailable_items = []
    for item in source_items:
        product_id = str(item.get("product_id") or "")
        requested = max(int(item.get("quantity", 0) or 0), 0)
        if not product_id or requested <= 0:
            continue
        product = products.get(product_id)
        name = (product or {}).get("name") or item.get("name") or "منتج"
        if not product:
            unavailable_items.append({"product_id": product_id, "name": name, "requested_quantity": requested, "added_quantity": 0, "reason": "المنتج غير متاح حالياً"})
            continue
        if product.get("coming_soon"):
            unavailable_items.append({"product_id": product_id, "name": name, "requested_quantity": requested, "added_quantity": 0, "reason": "يتوفر قريباً"})
            continue
        stock = max(int(product.get("stock", 0) or 0), 0)
        current_quantity = merged_items[positions[product_id]]["quantity"] if product_id in positions else 0
        capacity = max(stock - current_quantity, 0)
        added_quantity = min(requested, capacity)
        if product_id in positions:
            merged_items[positions[product_id]]["quantity"] += added_quantity
        elif added_quantity > 0:
            positions[product_id] = len(merged_items)
            merged_items.append({"product_id": product_id, "quantity": added_quantity})
        if added_quantity > 0:
            added_items.append({"product_id": product_id, "name": name, "quantity": added_quantity})
        if added_quantity < requested:
            reason = "نفدت الكمية" if stock <= 0 else "المتاح حالياً: " + str(capacity)
            unavailable_items.append({"product_id": product_id, "name": name, "requested_quantity": requested, "added_quantity": added_quantity, "reason": reason})

    merged_items = [item for item in merged_items if item["quantity"] > 0]
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": merged_items}}, upsert=True)
    final_products = await load_cart_products(merged_items, products)
    return {
        "cart": cart_from_items(merged_items, final_products),
        "added_items": added_items,
        "unavailable_items": unavailable_items,
        "added_count": sum(item["quantity"] for item in added_items),
        "unavailable_count": len(unavailable_items),
    }


@api.get("/orders")
async def my_orders(user=Depends(require_user)):
    docs = await db.orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api.get("/orders/{oid}")
async def get_order(oid: str, user=Depends(require_user)):
    d = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if user["role"] == "customer" and d["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    if user["role"] != "customer":
        d.pop("delivery_otp", None)
    return d


@api.post("/orders/{oid}/cancel")
async def cancel_order(oid: str, user=Depends(require_user)):
    d = await db.orders.find_one({"id": oid})
    if not d or d["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if d["status"] not in ("pending", "confirmed"):
        raise HTTPException(status_code=400, detail="لا يمكن إلغاء الطلب في هذه المرحلة")
    cancelled = await db.orders.find_one_and_update(
        {"id": oid, "user_id": user["user_id"], "status": {"$in": ["pending", "confirmed"]}},
        {
            "$set": {
                "status": "cancelled",
                "stock_release_pending": bool(d.get("stock_reserved") and not d.get("stock_released")),
            },
            "$push": {"timeline": {"status": "cancelled", "at": now_utc().isoformat()}},
        },
    )
    if not cancelled:
        raise HTTPException(status_code=409, detail="تم تغيير حالة الطلب؛ حاول تحديث الصفحة")
    if cancelled.get("stock_reserved") and not cancelled.get("stock_released"):
        await release_order_stock(cancelled.get("items") or [])
        await db.orders.update_one(
            {"id": oid, "status": "cancelled"},
            {"$set": {"stock_released": True, "stock_release_pending": False}},
        )
    return {"ok": True}


@api.post("/delivery/orders/{oid}/returns")
async def create_delivery_return(oid: str, body: ReturnIn, user=Depends(require_delivery)):
    if not body.items:
        raise HTTPException(status_code=400, detail="حدد منتجاً واحداً على الأقل")
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order or order.get("agent_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    if order.get("status") != "out_for_delivery":
        raise HTTPException(status_code=400, detail="يجب تسجيل المرتجع قبل تأكيد التسليم")

    previous_returns = await db.returns.find({"order_id": oid}, {"_id": 0}).to_list(200)
    returned_by_product = {}
    for previous in previous_returns:
        for item in previous.get("items", []):
            pid = str(item.get("product_id"))
            returned_by_product[pid] = returned_by_product.get(pid, 0) + int(item.get("quantity", 0) or 0)

    order_items = {str(item.get("product_id")): item for item in order.get("items", [])}
    requested_by_product = {}
    return_items = []
    for requested in body.items:
        pid = str(requested.product_id)
        if pid in requested_by_product:
            raise HTTPException(status_code=400, detail="لا يمكن تكرار المنتج في نفس المرتجع")
        source = order_items.get(pid)
        if not source:
            raise HTTPException(status_code=400, detail="المنتج غير موجود في هذا الطلب")
        ordered_qty = int(source.get("quantity", 0) or 0)
        available_qty = ordered_qty - returned_by_product.get(pid, 0)
        if requested.quantity > available_qty:
            raise HTTPException(status_code=400, detail=f"الكمية المتاحة للإرجاع من {source.get('name', 'المنتج')} هي {max(available_qty, 0)}")
        requested_by_product[pid] = requested.quantity
        return_items.append({
            "product_id": pid,
            "name": source.get("name", ""),
            "image_url": source.get("image_url"),
            "price": float(source.get("price", 0) or 0),
            "quantity": requested.quantity,
            "line_total": float(source.get("price", 0) or 0) * requested.quantity,
        })

    if not return_items:
        raise HTTPException(status_code=400, detail="حدد كمية الإرجاع")
    total = sum(item["line_total"] for item in return_items)
    is_full = all(
        returned_by_product.get(pid, 0) + requested_by_product.get(pid, 0) >= int(source.get("quantity", 0) or 0)
        for pid, source in order_items.items()
    )
    created_at = now_utc().isoformat()
    return_id = "RET" + uuid.uuid4().hex[:8].upper()
    doc = {
        "id": return_id,
        "order_id": oid,
        "customer_name": order.get("customer_name", ""),
        "customer_phone": order.get("phone", ""),
        "agent_id": user["user_id"],
        "agent_name": user.get("name", order.get("agent_name", "")),
        "items": return_items,
        "total": total,
        "return_type": "full" if is_full else "partial",
        "reason": body.reason or "",
        "status": "pending_review",
        "created_at": created_at,
    }
    # Claim the order while it is still out for delivery. The Firestore
    # transaction makes the status check atomic with the return bookkeeping,
    # so a return cannot race with delivery confirmation.
    updated_order = await db.orders.find_one_and_update(
        {"id": oid, "agent_id": user["user_id"], "status": "out_for_delivery"},
        {
            "$set": {
                "return_status": "full" if is_full else "partial",
                "returned_total": float(order.get("returned_total", 0) or 0) + total,
            },
            "$push": {"timeline": {"status": "returned", "at": created_at, "return_id": return_id}},
        },
    )
    if not updated_order:
        raise HTTPException(status_code=409, detail="لا يمكن تسجيل المرتجع بعد تأكيد التسليم")
    await db.returns.insert_one(doc)
    try:
        await send_push(await manager_ids(), {"title": "مرتجع جديد ↩️", "message": f"تم تسجيل مرتجع للطلب {oid} بواسطة {doc['agent_name']}", "action_url": f"/returns/{return_id}"})
    except Exception as e:
        logger.warning(f"return push failed: {e}")
    return doc


# ---------------- Manager ops ----------------
@api.get("/admin/returns")
async def admin_returns(user=Depends(require_manager)):
    return await db.returns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


RETURN_STATUS_LABEL = {
    "registered": "مسجل",
    "pending_review": "قيد مراجعة الإدارة",
    "approved": "مقبول",
    "rejected": "مرفوض",
}


@api.post("/admin/returns/{return_id}/status")
async def admin_update_return_status(
    return_id: str,
    body: ReturnStatusUpdateIn,
    user=Depends(require_manager),
):
    if body.status not in ("pending_review", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="حالة المرتجع غير صالحة")
    record = await db.returns.find_one({"id": return_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="المرتجع غير موجود")
    if record.get("status") == body.status:
        return record
    updated = await db.returns.find_one_and_update(
        {"id": return_id, "status": {"$in": ["registered", "pending_review", "approved", "rejected"]}},
        {
            "$set": {
                "status": body.status,
                "status_updated_at": now_utc().isoformat(),
                "status_updated_by": user.get("user_id"),
            },
            "$push": {
                "timeline": {
                    "status": body.status,
                    "at": now_utc().isoformat(),
                    "by": user.get("user_id"),
                }
            },
        },
    )
    if not updated:
        raise HTTPException(status_code=409, detail="تم تحديث حالة المرتجع من مدير آخر")
    return await db.returns.find_one({"id": return_id}, {"_id": 0}) or updated


@api.get("/admin/stats")
async def admin_stats(user=Depends(require_manager)):
    total_products = await db.products.count_documents({"deleted_at": None})
    total_orders = await db.orders.count_documents({})
    total_returns = await db.returns.count_documents({})
    total_banners = await db.banners.count_documents({"is_active": True})
    total_coupons = await db.coupons.count_documents({})
    pending = await db.orders.count_documents({"status": {"$in": ["pending", "confirmed", "preparing"]}})
    delivered = await db.orders.count_documents({"status": "delivered"})
    agg = await db.orders.aggregate([{"$match": {"status": "delivered"}}, {"$group": {"_id": None, "sum": {"$sum": "$total"}}}]).to_list(1)
    revenue = agg[0]["sum"] if agg else 0
    return {
        "products": total_products,
        "orders": total_orders,
        "active_orders": pending,
        "delivered": delivered,
        "returns": total_returns,
        "banners": total_banners,
        "coupons": total_coupons,
        "revenue": revenue,
    }


@api.get("/admin/orders")
async def admin_orders(status: Optional[str] = None, user=Depends(require_manager)):
    q = {}
    if status and status != "all":
        q["status"] = status
    docs = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    for doc in docs:
        doc.pop("delivery_otp", None)
    return docs


async def notify_customer_status(oid, status):
    o = await db.orders.find_one({"id": oid}, {"_id": 0, "user_id": 1})
    if not o:
        return
    try:
        await send_push([o["user_id"]], {"title": "تحديث طلبك 📦", "message": f"حالة طلبك الآن: {STATUS_LABEL.get(status, status)}", "action_url": f"/order/{oid}"})
    except Exception as e:
        logger.warning(f"push failed: {e}")


@api.post("/admin/orders/{oid}/status")
async def admin_update_status(oid: str, body: StatusUpdateIn, user=Depends(require_manager)):
    if body.status not in STATUS_LABEL:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    order = await db.orders.find_one({"id": oid}, {"_id": 0, "status": 1})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    current_status = order.get("status")
    if body.status == current_status:
        return {"ok": True}
    if body.status not in ORDER_STATUS_TRANSITIONS.get(current_status, set()):
        raise HTTPException(status_code=400, detail=f"لا يمكن نقل الطلب من {STATUS_LABEL.get(current_status, current_status)} إلى {STATUS_LABEL[body.status]}")
    status_update = {"status": body.status}
    if body.status == "delivered":
        status_update["delivered_at"] = now_utc().isoformat()
    if body.status == "delivery_failed":
        failure_reason = (body.reason or "").strip()
        if not failure_reason:
            raise HTTPException(status_code=400, detail="سبب تعذر التسليم مطلوب")
        status_update["delivery_failed_reason"] = failure_reason
        status_update["delivery_failed_at"] = now_utc().isoformat()
    updated = await db.orders.find_one_and_update(
        {"id": oid, "status": current_status},
        {"$set": status_update, "$push": {"timeline": {"status": body.status, "at": now_utc().isoformat()} }},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="تم تغيير حالة الطلب؛ حاول تحديث الصفحة")
    await notify_customer_status(oid, body.status)
    return {"ok": True}


@api.post("/admin/orders/{oid}/assign")
async def admin_assign(oid: str, body: AssignIn, user=Depends(require_manager)):
    agent = await db.users.find_one({"user_id": body.agent_id, "role": "delivery"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="المندوب غير موجود")
    assigned_at = now_utc().isoformat()
    assigned = await db.orders.find_one_and_update(
        {"id": oid, "agent_id": None, "status": "ready_for_delivery"},
        {
            "$set": {
                "agent_id": agent["user_id"],
                "agent_name": agent["name"],
                "agent_phone": agent.get("phone") or agent.get("phone_number"),
                "status": "out_for_delivery",
                "claimed_at": assigned_at,
            },
            "$push": {"timeline": {"status": "out_for_delivery", "at": assigned_at}},
        },
    )
    if not assigned:
        raise HTTPException(status_code=409, detail="الطلب ليس جاهزاً أو تم استلامه من مندوب آخر")
    assigned = await db.orders.find_one({"id": oid}, {"_id": 0}) or assigned
    await notify_customer_status(oid, "out_for_delivery")
    return delivery_order_view(assigned, "assigned")


@api.get("/admin/users")
async def admin_users(user=Depends(require_manager)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return docs


@api.get("/admin/agents")
async def admin_agents(user=Depends(require_manager)):
    docs = await db.users.find({"role": "delivery"}, {"_id": 0, "password_hash": 0}).to_list(200)
    return docs


@api.put("/admin/agents/{user_id}")
async def admin_update_agent(user_id: str, body: AgentUpdateIn, user=Depends(require_manager)):
    agent = await db.users.find_one({"user_id": user_id, "role": "delivery"}, {"_id": 0, "password_hash": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="المندوب غير موجود")
    phone = (body.phone or "").strip() or None
    await db.users.update_one({"user_id": user_id}, {"$set": {"phone": phone}})
    agent["phone"] = phone
    return agent


@api.get("/admin/sync-config")
async def admin_sync_config(user=Depends(require_manager)):
    """POS/cashier integration config: endpoint path + sync key + sample payload."""
    return {
        "path": "/api/inventory/sync",
        "method": "POST",
        "header_name": "X-Sync-Key",
        "sync_key": os.environ.get("SYNC_KEY", ""),
        "sample": {
            "items": [
                {"barcode": "8699449876882", "quantity": 25, "price": 1500},
                {"barcode": "1234567890123", "quantity": 0},
            ]
        },
    }


@api.post("/admin/set-role")
async def admin_set_role(body: RoleIn, user=Depends(require_manager)):
    if body.role not in ("customer", "delivery", "manager"):
        raise HTTPException(status_code=400, detail="دور غير صالح")
    await db.users.update_one({"user_id": body.user_id}, {"$set": {"role": body.role}})
    return {"ok": True}


# ---------------- Delivery ops ----------------
@api.get("/delivery/summary")
async def delivery_summary(
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    tz_offset_minutes: int = Query(0, ge=-840, le=840),
    user=Depends(require_delivery),
):
    target_date_text = date or now_utc().date().isoformat()
    try:
        target_date = datetime.strptime(target_date_text, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="التاريخ غير صالح")

    orders = await db.orders.find(
        {"agent_id": user["user_id"], "status": "delivered"},
        {"_id": 0, "id": 1, "total": 1, "delivery_fee": 1, "agent_fee": 1, "delivered_at": 1},
    ).to_list(1000)
    returns = await db.returns.find(
        {"agent_id": user["user_id"]},
        {"_id": 0, "total": 1, "created_at": 1},
    ).to_list(1000)
    invoices_total = 0.0
    earnings = 0.0
    returns_total = 0.0
    delivered_orders = 0
    for order in orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            delivered_dt = datetime.fromisoformat(str(delivered_at).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if delivered_dt.tzinfo is None:
            delivered_dt = delivered_dt.replace(tzinfo=timezone.utc)
        local_dt = delivered_dt.astimezone(timezone(timedelta(minutes=-tz_offset_minutes)))
        if local_dt.date() != target_date:
            continue
        try:
            invoices_total += float(order.get("total", 0) or 0)
        except (TypeError, ValueError):
            pass
        try:
            earnings += float(order.get("agent_fee", order.get("delivery_fee", 0)) or 0)
        except (TypeError, ValueError):
            pass
        delivered_orders += 1

    returns_count = 0
    for record in returns:
        created_at = record.get("created_at")
        try:
            created_dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        local_dt = created_dt.astimezone(timezone(timedelta(minutes=-tz_offset_minutes)))
        if local_dt.date() != target_date:
            continue
        returns_count += 1
        try:
            returns_total += float(record.get("total", 0) or 0)
        except (TypeError, ValueError):
            pass

    cash_collected = max(invoices_total - returns_total, 0.0)
    amount_to_handover = max(cash_collected - earnings, 0.0)
    return {
        "date": target_date.isoformat(),
        "orders_count": delivered_orders,
        "invoices_total": round(invoices_total, 2),
        "returns_count": returns_count,
        "returns_total": round(returns_total, 2),
        "cash_collected": round(cash_collected, 2),
        "earnings": round(earnings, 2),
        "amount_to_handover": round(amount_to_handover, 2),
        "currency": "IQD",
    }

@api.get("/delivery/returns")
async def delivery_returns(user=Depends(require_delivery)):
    return await db.returns.find(
        {"agent_id": user["user_id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)

@api.get("/delivery/orders")
async def delivery_orders(user=Depends(require_delivery)):
    available = await db.orders.find(
        {"agent_id": None, "status": {"$in": DELIVERY_AVAILABLE_STATUSES}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    assigned = await db.orders.find(
        {"agent_id": user["user_id"], "status": {"$in": ["out_for_delivery", "delivered"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    orders = available + assigned
    orders.sort(key=lambda order: order.get("created_at", ""), reverse=True)
    return [
        delivery_order_view(order, "available" if order.get("agent_id") is None else "assigned")
        for order in orders
    ]


@api.post("/delivery/orders/{oid}/claim")
async def delivery_claim(oid: str, user=Depends(require_delivery)):
    claimed_at = now_utc().isoformat()
    claimed = await db.orders.find_one_and_update(
        {
            "id": oid,
            "agent_id": None,
            "status": {"$in": DELIVERY_AVAILABLE_STATUSES},
        },
        {
            "$set": {
                "agent_id": user["user_id"],
                "agent_name": user["name"],
                "agent_phone": user.get("phone") or user.get("phone_number"),
                "status": "out_for_delivery",
                "claimed_at": claimed_at,
            },
            "$push": {"timeline": {"status": "out_for_delivery", "at": claimed_at}},
        },
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="تم استلام الطلب من مندوب آخر أو لم يعد متاحاً")
    claimed = await db.orders.find_one({"id": oid}, {"_id": 0}) or claimed
    await notify_customer_status(oid, "out_for_delivery")
    return delivery_order_view(claimed, "assigned")


@api.post("/delivery/orders/{oid}/status")
async def delivery_update(oid: str, body: StatusUpdateIn, user=Depends(require_delivery)):
    d = await db.orders.find_one({"id": oid})
    if not d or (d.get("agent_id") != user["user_id"] and user["role"] != "manager"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if body.status not in ("out_for_delivery", "delivered", "delivery_failed"):
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    current_status = d.get("status")
    if body.status == current_status:
        return {"ok": True}
    if body.status not in ORDER_STATUS_TRANSITIONS.get(current_status, set()):
        raise HTTPException(status_code=400, detail=f"لا يمكن نقل الطلب من {STATUS_LABEL.get(current_status, current_status)} إلى {STATUS_LABEL[body.status]}")
    status_update = {"status": body.status}
    if body.status == "delivered":
        if d.get("delivery_otp"):
            entered_otp = (body.otp or "").strip()
            expected_otp = str(d.get("delivery_otp"))
            if len(entered_otp) != 6 or not entered_otp.isdigit() or not hmac.compare_digest(entered_otp, expected_otp):
                raise HTTPException(status_code=400, detail="رمز التسليم غير صحيح")
        status_update["delivered_at"] = now_utc().isoformat()
    updated = await db.orders.find_one_and_update(
        {"id": oid, "status": current_status},
        {"$set": status_update, "$push": {"timeline": {"status": body.status, "at": now_utc().isoformat()} }},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="تم تغيير حالة الطلب؛ حاول تحديث الصفحة")
    await notify_customer_status(oid, body.status)
    return {"ok": True}


class LocationIn(BaseModel):
    lat: float
    lng: float


@api.post("/delivery/orders/{oid}/location")
async def delivery_location(oid: str, body: LocationIn, user=Depends(require_delivery)):
    d = await db.orders.find_one({"id": oid}, {"_id": 0, "agent_id": 1, "status": 1})
    if not d or (d.get("agent_id") != user["user_id"] and user["role"] != "manager"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if d.get("status") != "out_for_delivery":
        raise HTTPException(status_code=409, detail="لا يمكن تحديث موقع طلب غير نشط")
    await db.orders.update_one({"id": oid}, {"$set": {"agent_location": {"lat": body.lat, "lng": body.lng, "at": now_utc().isoformat()}}})
    return {"ok": True}
def init_storage():
    if FIREBASE_BUCKET is None:
        raise RuntimeError("Firebase Storage is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON.")
    return FIREBASE_BUCKET


def put_object(path, data, content_type):
    blob = init_storage().blob(path)
    blob.upload_from_string(data, content_type=content_type)
    blob.cache_control = "public,max-age=86400"
    blob.patch()
    return {"path": path}


def get_object(path):
    blob = init_storage().blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    blob.reload()
    return blob.download_as_bytes(), blob.content_type or "application/octet-stream"


@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(require_manager)):
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    ct = file.content_type or "image/jpeg"
    try:
        await run_in_threadpool(put_object, path, data, ct)
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(status_code=502, detail="فشل رفع الصورة")
    await db.uploads.insert_one({"path": path, "owner_id": user["user_id"], "created_at": now_utc().isoformat()})
    return {"path": path, "url": f"/api/files/{path}"}


@api.get("/files/{path:path}")
async def files(path: str):
    try:
        content, ct = await run_in_threadpool(get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})


@api.get("/")
async def root():
    return {"message": "Souq Market API"}


@api.get("/healthz")
async def healthz():
    return {"ok": True, "firebase": FIREBASE_APP is not None, "firestore": FIRESTORE_CLIENT is not None}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


SAMPLE_PRODUCTS = [
    ("بهارات مشكلة فاخرة 250 غم", "غذائية", 3500, 4500, "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500&q=80"),
    ("زيت زيتون بكر ممتاز 1 لتر", "غذائية", 9000, None, "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&q=80"),
    ("عسل طبيعي جبلي 500 غم", "غذائية", 12000, 15000, "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500&q=80"),
    ("أرز بسمتي فاخر 5 كغم", "غذائية", 14000, None, "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&q=80"),
    ("قهوة عربية محمصة 250 غم", "غذائية", 6500, 8000, "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=500&q=80"),
    ("شاي أخضر بالنعناع 100 كيس", "غذائية", 4000, None, "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=500&q=80"),
    ("عصير برتقال طازج 1 لتر", "عصائر", 2500, 3000, "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500&q=80"),
    ("عصير رمان طبيعي 1 لتر", "عصائر", 3000, None, "https://images.unsplash.com/photo-1546173159-315724a31696?w=500&q=80"),
    ("مياه معدنية عبوة 12", "عصائر", 3500, 4000, "https://images.unsplash.com/photo-1560023907-5f339617ea30?w=500&q=80"),
    ("منظف أرضيات معطر 2 لتر", "منظفات", 3000, 4200, "https://images.unsplash.com/photo-1585421514738-01798e348b17?w=500&q=80"),
    ("سائل غسيل صحون 750 مل", "منظفات", 2200, None, "https://images.unsplash.com/photo-1615486511484-92e172cc4fe0?w=500&q=80"),
    ("مسحوق غسيل أوتوماتيك 3 كغم", "منظفات", 8500, 10000, "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500&q=80"),
    ("مناديل ورقية فاخرة 6 علب", "ورقيات", 2500, None, "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&q=80"),
    ("كريم مرطب للبشرة 200 مل", "كوزمتك", 5500, 7000, "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=500&q=80"),
    ("شامبو للشعر بالأرغان 400 مل", "كوزمتك", 4800, None, "https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=500&q=80"),
    ("حفاظات أطفال مقاس 4 عدد 40", "حفاظات", 11000, 13000, "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80"),
    ("لعبة تعليمية للأطفال", "العاب", 7500, 9500, "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=500&q=80"),
    ("عدس أحمر مجروش 1 كغم", "بقوليات", 2800, None, "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?w=500&q=80"),
    ("حمص حب فاخر 1 كغم", "بقوليات", 3200, 3800, "https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=500&q=80"),
    ("سماعات لاسلكية بلوتوث", "الكترونيات", 22000, 28000, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80"),
    ("دفتر ملاحظات فاخر", "قرطاسية", 1800, None, "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=500&q=80"),
    ("شوكولاتة بلجيكية فاخرة 200 غم", "غذائية", 6000, 7500, "https://images.unsplash.com/photo-1511381939415-e44015466834?w=500&q=80"),
    ("جبنة شيدر مبشورة 500 غم", "غذائية", 5500, None, "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=500&q=80"),
    ("مكسرات مشكلة فاخرة 500 غم", "غذائية", 13000, 16000, "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=500&q=80"),
]


async def seed():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.catalog.create_index("barcode")
    await db.products.create_index("barcode")

    # Reset catalog if version changed (v2 adds real selling prices)
    meta = await db.meta.find_one({"key": "catalog_version"})
    catalog_needs_seed = not meta or meta.get("value") != CATALOG_VERSION
    if catalog_needs_seed:
        await db.catalog.delete_many({})

    if catalog_needs_seed:
        path = ROOT_DIR / "data" / "catalog.json"
        if path.exists():
            items = json.loads(path.read_text(encoding="utf-8"))
            batch = []
            for it in items:
                batch.append({
                    "barcode": it["barcode"],
                    "name": it["name"],
                    "category": it.get("category", "أخرى"),
                    "price": it.get("price", 0),
                    "special": it.get("special"),
                })
                if len(batch) >= 2000:
                    await db.catalog.insert_many(batch)
                    batch = []
            if batch:
                await db.catalog.insert_many(batch)
            await db.meta.update_one({"key": "catalog_version"}, {"$set": {"value": CATALOG_VERSION}}, upsert=True)
            logger.info(f"Seeded catalog: {len(items)}")

    async def ensure_user(email, name, pw, role):
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "user_id": "user_" + uuid.uuid4().hex[:12],
                "name": name, "email": email, "password_hash": hash_pw(pw),
                "role": role, "picture": None, "created_at": now_utc().isoformat(),
            })
    await ensure_user("manager@souq.iq", "مدير المتجر", "Manager@123", "manager")
    await ensure_user("mandoob@souq.iq", "علي المندوب", "Delivery@123", "delivery")
    await ensure_user("zboon@souq.iq", "أحمد الزبون", "Customer@123", "customer")
    for em in MANAGER_EMAILS:
        await db.users.update_one({"email": em.lower()}, {"$set": {"role": "manager"}})

    if await db.products.count_documents({}) == 0:
        for name, cat, price, old, img in SAMPLE_PRODUCTS:
            await db.products.insert_one({
                "id": "prod_" + uuid.uuid4().hex[:12],
                "barcode": "", "name": name, "category": cat,
                "price": float(price), "old_price": float(old) if old else None,
                "image_url": img, "description": "منتج فاخر بجودة عالية من سوق ماركت.",
                "stock": 100, "is_published": True,
                "created_at": now_utc().isoformat(), "deleted_at": None,
            })
        logger.info("Seeded sample products")


@app.on_event("startup")
async def on_startup():
    try:
        await seed()
    except Exception as e:
        logger.error(f"seed error: {e}")
    if FIREBASE_BUCKET is None:
        logger.warning("Firebase Storage is not configured; image uploads are disabled")


@app.on_event("shutdown")
async def on_shutdown():
    if FIRESTORE_CLIENT:
        FIRESTORE_CLIENT.close()
