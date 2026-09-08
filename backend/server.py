import os
import re
import uuid
import json
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
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials as firebase_credentials
from firebase_admin import firestore
from firestore_store import FirestoreDatabase

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SESSION_SECRET", "development-only-change-me")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "souq-market"
CATALOG_VERSION = 2
MANAGER_EMAILS = {"zzam8160@gmail.com"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

FIREBASE_APP = None
FIRESTORE_CLIENT = None
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
if FIREBASE_SERVICE_ACCOUNT_JSON:
    try:
        service_account = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
        FIREBASE_APP = firebase_admin.initialize_app(firebase_credentials.Certificate(service_account))
        FIRESTORE_CLIENT = firestore.client(app=FIREBASE_APP)
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
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    old_price: Optional[float] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    stock: Optional[int] = None
    is_published: Optional[bool] = None
    coming_soon: Optional[bool] = None


class CartItemIn(BaseModel):
    product_id: str
    quantity: int = 1


class OrderIn(BaseModel):
    name: str
    phone: str
    address: str
    notes: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


class StatusUpdateIn(BaseModel):
    status: str


class AssignIn(BaseModel):
    agent_id: str


class RoleIn(BaseModel):
    user_id: str
    role: str


# ---------------- Auth ----------------
async def get_user_by_token(authorization: Optional[str]):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()

    # Firebase ID tokens are the primary authentication mechanism.
    if FIREBASE_APP:
        try:
            decoded = firebase_auth.verify_id_token(token, app=FIREBASE_APP)
            firebase_uid = decoded.get("uid")
            email = (decoded.get("email") or "").lower()
            forced_role = "manager" if email in MANAGER_EMAILS else None
            user = await db.users.find_one({"firebase_uid": firebase_uid}, {"_id": 0})
            if not user and email:
                user = await db.users.find_one({"email": email}, {"_id": 0})
                if user:
                    updates = {
                        "firebase_uid": firebase_uid,
                        "picture": decoded.get("picture"),
                    }
                    if forced_role and user.get("role") != forced_role:
                        updates["role"] = forced_role
                    await db.users.update_one(
                        {"user_id": user["user_id"]},
                        {"$set": updates},
                    )
                    user["firebase_uid"] = firebase_uid
                    user["picture"] = decoded.get("picture")
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
    return {k: u.get(k) for k in ("user_id", "name", "email", "role", "picture")}


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
    for it in body.items:
        setd = {}
        if it.quantity is not None:
            setd["stock"] = max(0, int(it.quantity))
        if it.price is not None and it.price > 0:
            setd["price"] = float(it.price)
        if not setd:
            continue
        # also update reference catalog price
        if "price" in setd:
            await db.catalog.update_many({"barcode": it.barcode}, {"$set": {"price": setd["price"]}})
        r = await db.products.update_many({"barcode": it.barcode, "deleted_at": None}, {"$set": setd})
        if r.matched_count:
            updated += r.matched_count
        else:
            not_found.append(it.barcode)
    return {"updated": updated, "not_found": not_found, "count": len(body.items)}


# ---------------- Catalog ----------------
@api.get("/catalog/lookup/{barcode}")
async def catalog_lookup(barcode: str, user=Depends(require_manager)):
    local_items = local_catalog_items()
    item = next((entry for entry in local_items if entry.get("barcode") == barcode), None)
    if item is None and not local_items:
        item = await db.catalog.find_one({"barcode": barcode}, {"_id": 0})
    existing = barcode in await existing_product_barcodes()
    if not item:
        return {"found": False, "already_added": existing is not None}
    price = item.get("price") or 0
    special = item.get("special") or None
    old_price = None
    if special and special > 0 and price and special < price:
        old_price = price
        price = special
    return {
        "found": True,
        "already_added": existing is not None,
        "name": item["name"],
        "category": item["category"],
        "barcode": barcode,
        "price": price,
        "old_price": old_price,
        "suggested_image": CATEGORY_IMAGES.get(item["category"], DEFAULT_IMG),
    }


# ---------------- Products ----------------
def clean_product(p, favorites=None):
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
    docs = await db.products.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    fav = set()
    user = await get_user_by_token(authorization)
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
        extra = await db.products.find({"deleted_at": None, "is_published": True, "id": {"$nin": list(have)}}).sort("created_at", -1).to_list(12)
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
    d = await db.products.find_one({"id": pid, "deleted_at": None}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    fav = set()
    user = await get_user_by_token(authorization)
    if user:
        f = await db.favorites.find_one({"user_id": user["user_id"], "product_id": pid})
        if f:
            fav = {pid}
    return clean_product(d, fav)


@api.get("/categories")
async def categories():
    pipeline = [
        {"$match": {"deleted_at": None, "is_published": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    res = await db.products.aggregate(pipeline).to_list(100)
    out = []
    for r in res:
        cat = r["_id"] or "أخرى"
        out.append({"name": cat, "count": r["count"], "image": CATEGORY_IMAGES.get(cat, DEFAULT_IMG)})
    return out


@api.post("/products")
async def create_product(body: ProductIn, user=Depends(require_manager)):
    pid = "prod_" + uuid.uuid4().hex[:12]
    doc = {
        "id": pid,
        "barcode": body.barcode or "",
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
    if not upd:
        raise HTTPException(status_code=400, detail="لا يوجد تغيير")
    r = await db.products.update_one({"id": pid, "deleted_at": None}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    d = await db.products.find_one({"id": pid}, {"_id": 0})
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


# ---------------- Cart ----------------
async def build_cart(user_id):
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    items = cart["items"] if cart else []
    out = []
    total = 0.0
    for it in items:
        p = await db.products.find_one({"id": it["product_id"], "deleted_at": None}, {"_id": 0})
        if not p:
            continue
        line = p["price"] * it["quantity"]
        total += line
        out.append({
            "product_id": p["id"],
            "name": p["name"],
            "price": p["price"],
            "image_url": p["image_url"],
            "quantity": it["quantity"],
            "line_total": line,
        })
    return {"items": out, "total": total, "count": sum(i["quantity"] for i in out)}


@api.get("/cart")
async def get_cart(user=Depends(require_user)):
    return await build_cart(user["user_id"])


@api.post("/cart/items")
async def add_to_cart(body: CartItemIn, user=Depends(require_user)):
    prod = await db.products.find_one({"id": body.product_id, "deleted_at": None}, {"_id": 0})
    if not prod:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    if prod.get("coming_soon"):
        raise HTTPException(status_code=400, detail="هذا المنتج يتوفر قريباً")
    if (prod.get("stock", 0) or 0) <= 0:
        raise HTTPException(status_code=400, detail="نفدت الكمية")
    cart = await db.carts.find_one({"user_id": user["user_id"]})
    items = cart["items"] if cart else []
    found = False
    for it in items:
        if it["product_id"] == body.product_id:
            it["quantity"] += body.quantity
            found = True
            break
    if not found:
        items.append({"product_id": body.product_id, "quantity": body.quantity})
    items = [i for i in items if i["quantity"] > 0]
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": items}}, upsert=True)
    return await build_cart(user["user_id"])


@api.put("/cart/items")
async def set_cart_item(body: CartItemIn, user=Depends(require_user)):
    cart = await db.carts.find_one({"user_id": user["user_id"]})
    items = cart["items"] if cart else []
    items = [i for i in items if i["product_id"] != body.product_id]
    if body.quantity > 0:
        items.append({"product_id": body.product_id, "quantity": body.quantity})
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": items}}, upsert=True)
    return await build_cart(user["user_id"])


@api.delete("/cart/items/{pid}")
async def remove_cart_item(pid: str, user=Depends(require_user)):
    await db.carts.update_one({"user_id": user["user_id"]}, {"$pull": {"items": {"product_id": pid}}})
    return await build_cart(user["user_id"])


# ---------------- Orders ----------------
STATUS_FLOW = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"]
STATUS_LABEL = {
    "pending": "قيد المراجعة",
    "confirmed": "تم التأكيد",
    "preparing": "قيد التجهيز",
    "out_for_delivery": "في الطريق",
    "delivered": "تم التوصيل",
    "cancelled": "ملغي",
}


@api.post("/orders")
async def create_order(body: OrderIn, user=Depends(require_user)):
    cart = await build_cart(user["user_id"])
    if not cart["items"]:
        raise HTTPException(status_code=400, detail="السلة فارغة")
    oid = "ORD" + uuid.uuid4().hex[:8].upper()
    doc = {
        "id": oid,
        "user_id": user["user_id"],
        "customer_name": body.name,
        "phone": body.phone,
        "address": body.address,
        "notes": body.notes or "",
        "location": ({"lat": body.lat, "lng": body.lng} if (body.lat is not None and body.lng is not None) else None),
        "items": cart["items"],
        "total": cart["total"],
        "status": "pending",
        "payment": "cod",
        "agent_id": None,
        "agent_name": None,
        "timeline": [{"status": "pending", "at": now_utc().isoformat()}],
        "created_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(doc)
    await db.carts.update_one({"user_id": user["user_id"]}, {"$set": {"items": []}})
    doc.pop("_id", None)
    try:
        await send_push(await manager_ids(), {"title": "طلب جديد 🛒", "message": f"طلب جديد من {body.name} بقيمة {int(cart['total'])} د.ع", "action_url": f"/order/{oid}"})
    except Exception as e:
        logger.warning(f"push failed: {e}")
    return doc


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
    return d


@api.post("/orders/{oid}/cancel")
async def cancel_order(oid: str, user=Depends(require_user)):
    d = await db.orders.find_one({"id": oid})
    if not d or d["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    if d["status"] not in ("pending", "confirmed"):
        raise HTTPException(status_code=400, detail="لا يمكن إلغاء الطلب في هذه المرحلة")
    await db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}, "$push": {"timeline": {"status": "cancelled", "at": now_utc().isoformat()}}})
    return {"ok": True}


# ---------------- Manager ops ----------------n@api.get("/admin/stats")
async def admin_stats(user=Depends(require_manager)):
    total_products = await db.products.count_documents({"deleted_at": None})
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": {"$in": ["pending", "confirmed", "preparing"]}})
    delivered = await db.orders.count_documents({"status": "delivered"})
    agg = await db.orders.aggregate([{"$match": {"status": "delivered"}}, {"$group": {"_id": None, "sum": {"$sum": "$total"}}}]).to_list(1)
    revenue = agg[0]["sum"] if agg else 0
    return {
        "products": total_products,
        "orders": total_orders,
        "active_orders": pending,
        "delivered": delivered,
        "revenue": revenue,
    }


@api.get("/admin/orders")
async def admin_orders(status: Optional[str] = None, user=Depends(require_manager)):
    q = {}
    if status and status != "all":
        q["status"] = status
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


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
    await db.orders.update_one({"id": oid}, {"$set": {"status": body.status}, "$push": {"timeline": {"status": body.status, "at": now_utc().isoformat()}}})
    await notify_customer_status(oid, body.status)
    return {"ok": True}


@api.post("/admin/orders/{oid}/assign")
async def admin_assign(oid: str, body: AssignIn, user=Depends(require_manager)):
    agent = await db.users.find_one({"user_id": body.agent_id, "role": "delivery"}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="المندوب غير موجود")
    await db.orders.update_one({"id": oid}, {"$set": {"agent_id": agent["user_id"], "agent_name": agent["name"], "status": "out_for_delivery"}, "$push": {"timeline": {"status": "out_for_delivery", "at": now_utc().isoformat()}}})
    await notify_customer_status(oid, "out_for_delivery")
    return {"ok": True}


@api.get("/admin/users")
async def admin_users(user=Depends(require_manager)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return docs


@api.get("/admin/agents")
async def admin_agents(user=Depends(require_manager)):
    docs = await db.users.find({"role": "delivery"}, {"_id": 0, "password_hash": 0}).to_list(200)
    return docs


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


# ---------------- Delivery ops ----------------n@api.get("/delivery/orders")
async def delivery_orders(user=Depends(require_delivery)):
    q = {"agent_id": user["user_id"]}
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/delivery/orders/{oid}/status")
async def delivery_update(oid: str, body: StatusUpdateIn, user=Depends(require_delivery)):
    d = await db.orders.find_one({"id": oid})
    if not d or (d.get("agent_id") != user["user_id"] and user["role"] != "manager"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if body.status not in ("out_for_delivery", "delivered"):
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    await db.orders.update_one({"id": oid}, {"$set": {"status": body.status}, "$push": {"timeline": {"status": body.status, "at": now_utc().isoformat()}}})
    await notify_customer_status(oid, body.status)
    return {"ok": True}


class LocationIn(BaseModel):
    lat: float
    lng: float


@api.post("/delivery/orders/{oid}/location")
async def delivery_location(oid: str, body: LocationIn, user=Depends(require_delivery)):
    d = await db.orders.find_one({"id": oid}, {"_id": 0, "agent_id": 1})
    if not d or (d.get("agent_id") != user["user_id"] and user["role"] != "manager"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.orders.update_one({"id": oid}, {"$set": {"agent_location": {"lat": body.lat, "lng": body.lng, "at": now_utc().isoformat()}}})
    return {"ok": True}


storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path, data, content_type):
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


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
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logger.warning(f"storage init skipped: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    if FIRESTORE_CLIENT:
        FIRESTORE_CLIENT.close()
