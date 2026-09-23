"""
Souq Market backend API tests.
Uses the public preview URL. Covers auth, RBAC, products/catalog, cart,
favorites, orders (with GPS location), lifecycle, and admin ops.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://grocery-hub-1117.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

MANAGER = {"email": "manager@souq.iq", "password": "Manager@123"}
DELIVERY = {"email": "mandoob@souq.iq", "password": "Delivery@123"}
CUSTOMER = {"email": "zboon@souq.iq", "password": "Customer@123"}
KNOWN_BARCODE = "8699449876882"
SYNC_KEY = "binsaleem_pos_sync_2026"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def manager_token(s):
    return _login(s, **MANAGER)


@pytest.fixture(scope="session")
def delivery_token(s):
    return _login(s, **DELIVERY)


@pytest.fixture(scope="session")
def customer_token(s):
    return _login(s, **CUSTOMER)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert "Souq" in r.json().get("message", "")

    def test_register_new_customer(self, s):
        email = f"test_user_{uuid.uuid4().hex[:8]}@souq.iq"
        r = s.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "password": "Test@1234"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "customer"
        # duplicate
        r2 = s.post(f"{API}/auth/register", json={"name": "x", "email": email, "password": "Test@1234"}, timeout=15)
        assert r2.status_code == 400

    def test_login_seeded_and_me(self, s):
        for creds, role in [(MANAGER, "manager"), (DELIVERY, "delivery"), (CUSTOMER, "customer")]:
            r = s.post(f"{API}/auth/login", json=creds, timeout=15)
            assert r.status_code == 200, f"{creds['email']} -> {r.text}"
            tok = r.json()["token"]
            me = s.get(f"{API}/auth/me", headers=H(tok), timeout=15)
            assert me.status_code == 200
            assert me.json()["user"]["role"] == role
            assert me.json()["user"]["email"] == creds["email"]

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": MANAGER["email"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_unauth(self, s):
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------------- RBAC ----------------
class TestRBAC:
    def test_customer_cannot_hit_admin(self, s, customer_token):
        r = s.get(f"{API}/admin/stats", headers=H(customer_token), timeout=15)
        assert r.status_code == 403

    def test_delivery_cannot_create_product(self, s, delivery_token):
        r = s.post(f"{API}/products", headers=H(delivery_token),
                   json={"name": "x", "price": 100}, timeout=15)
        assert r.status_code == 403

    def test_customer_cannot_lookup_catalog(self, s, customer_token):
        r = s.get(f"{API}/catalog/lookup/{KNOWN_BARCODE}", headers=H(customer_token), timeout=15)
        assert r.status_code == 403


# ---------------- Catalog & Products ----------------
class TestCatalog:
    def test_lookup_known_barcode(self, s, manager_token):
        r = s.get(f"{API}/catalog/lookup/{KNOWN_BARCODE}", headers=H(manager_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["found"] is True
        assert d.get("name") and d.get("category")

    def test_lookup_missing_barcode(self, s, manager_token):
        r = s.get(f"{API}/catalog/lookup/000000nonexistent", headers=H(manager_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["found"] is False


class TestProducts:
    def test_list_products(self, s):
        r = s.get(f"{API}/products", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_products_filter_offers(self, s):
        r = s.get(f"{API}/products", params={"offers": "true"}, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("old_price") and p["old_price"] > 0

    def test_products_search(self, s):
        r = s.get(f"{API}/products", params={"search": "زيت"}, timeout=15)
        assert r.status_code == 200
        for p in r.json():
            assert "زيت" in p["name"]

    def test_categories(self, s):
        r = s.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        assert "name" in data[0] and "count" in data[0]

    def test_get_product_by_id(self, s):
        lst = s.get(f"{API}/products", timeout=15).json()
        pid = lst[0]["id"]
        r = s.get(f"{API}/products/{pid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_manager_crud_full(self, s, manager_token):
        # Create
        payload = {"barcode": "", "name": f"TEST منتج {uuid.uuid4().hex[:6]}",
                   "category": "غذائية", "price": 1234.0, "stock": 5}
        r = s.post(f"{API}/products", headers=H(manager_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        prod = r.json()
        pid = prod["id"]
        assert prod["price"] == 1234.0
        # GET verifies persistence
        g = s.get(f"{API}/products/{pid}", timeout=15)
        assert g.status_code == 200 and g.json()["name"] == payload["name"]
        # Update price
        u = s.put(f"{API}/products/{pid}", headers=H(manager_token), json={"price": 4321.0}, timeout=15)
        assert u.status_code == 200 and u.json()["price"] == 4321.0
        # GET verify update persisted
        g2 = s.get(f"{API}/products/{pid}", timeout=15)
        assert g2.json()["price"] == 4321.0
        # Soft delete
        d = s.delete(f"{API}/products/{pid}", headers=H(manager_token), timeout=15)
        assert d.status_code == 200
        g3 = s.get(f"{API}/products/{pid}", timeout=15)
        assert g3.status_code == 404


# ---------------- Cart & Favorites ----------------
class TestCartFavorites:
    def test_cart_flow(self, s, customer_token):
        prods = s.get(f"{API}/products", timeout=15).json()
        pid = prods[0]["id"]
        # clear pre-existing cart
        s.put(f"{API}/cart/items", headers=H(customer_token),
              json={"product_id": pid, "quantity": 0}, timeout=15)
        # add 2
        r = s.post(f"{API}/cart/items", headers=H(customer_token),
                   json={"product_id": pid, "quantity": 2}, timeout=15)
        assert r.status_code == 200
        c = r.json()
        assert c["count"] >= 2
        # set to 3
        r2 = s.put(f"{API}/cart/items", headers=H(customer_token),
                   json={"product_id": pid, "quantity": 3}, timeout=15)
        assert r2.status_code == 200
        item = next(i for i in r2.json()["items"] if i["product_id"] == pid)
        assert item["quantity"] == 3
        # remove
        r3 = s.delete(f"{API}/cart/items/{pid}", headers=H(customer_token), timeout=15)
        assert r3.status_code == 200
        assert all(i["product_id"] != pid for i in r3.json()["items"])

    def test_rejects_cart_quantity_above_stock(self, s, customer_token):
        product = s.get(f"{API}/products", timeout=15).json()[0]
        pid = product["id"]
        stock = int(product.get("stock", 0) or 0)
        if stock <= 0:
            pytest.skip("test product has no stock")
        s.delete(f"{API}/cart/items/{pid}", headers=H(customer_token), timeout=15)
        too_many = stock + 1
        added = s.post(f"{API}/cart/items", headers=H(customer_token),
                       json={"product_id": pid, "quantity": too_many}, timeout=15)
        assert added.status_code == 400
        updated = s.put(f"{API}/cart/items", headers=H(customer_token),
                        json={"product_id": pid, "quantity": too_many}, timeout=15)
        assert updated.status_code == 400
        s.delete(f"{API}/cart/items/{pid}", headers=H(customer_token), timeout=15)


    def test_favorites_toggle(self, s, customer_token):
        prods = s.get(f"{API}/products", timeout=15).json()
        pid = prods[0]["id"]
        r1 = s.post(f"{API}/favorites/{pid}", headers=H(customer_token), timeout=15)
        assert r1.status_code == 200
        state1 = r1.json()["is_favorite"]
        r2 = s.post(f"{API}/favorites/{pid}", headers=H(customer_token), timeout=15)
        assert r2.json()["is_favorite"] != state1
        # GET favorites
        g = s.get(f"{API}/favorites", headers=H(customer_token), timeout=15)
        assert g.status_code == 200


# ---------------- Orders + lifecycle ----------------
@pytest.fixture
def placed_order(request):
    s = requests.Session()
    ctok = _login(s, **CUSTOMER)
    prods = s.get(f"{API}/products", timeout=15).json()
    pid = prods[0]["id"]
    s.post(f"{API}/cart/items", headers=H(ctok), json={"product_id": pid, "quantity": 2}, timeout=15)
    r = s.post(f"{API}/orders", headers=H(ctok),
               json={"name": "TEST زبون", "phone": "07701234567", "address": "بغداد - الكرادة",
                     "lat": 33.3152, "lng": 44.3661, "notes": "TEST"}, timeout=15)
    assert r.status_code == 200, r.text
    order = r.json()
    return {"session": s, "ctok": ctok, "order": order}


class TestOrders:
    def test_repeated_order_request_returns_same_order(self, s, customer_token):
        product = s.get(f"{API}/products", timeout=15).json()[0]
        pid = product["id"]
        s.delete(f"{API}/cart/items/{pid}", headers=H(customer_token), timeout=15)
        added = s.post(f"{API}/cart/items", headers=H(customer_token),
                       json={"product_id": pid, "quantity": 1}, timeout=15)
        assert added.status_code == 200
        payload = {"name": "TEST زبون", "phone": "07701234567", "address": "بغداد - الكرادة",
                   "lat": 33.3152, "lng": 44.3661, "notes": "TEST idempotency",
                   "client_request_id": f"test-request-{uuid.uuid4().hex}"}
        first = s.post(f"{API}/orders", headers=H(customer_token), json=payload, timeout=15)
        assert first.status_code == 200, first.text
        second = s.post(f"{API}/orders", headers=H(customer_token), json=payload, timeout=15)
        assert second.status_code == 200, second.text
        assert second.json()["id"] == first.json()["id"]


    def test_order_stores_location(self, placed_order):
        o = placed_order["order"]
        assert o["status"] == "pending"
        assert o["payment"] == "cod"
        assert o["location"] == {"lat": 33.3152, "lng": 44.3661}
        assert o["total"] > 0

    def test_my_orders_lists(self, placed_order):
        s = placed_order["session"]
        r = s.get(f"{API}/orders", headers=H(placed_order["ctok"]), timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == placed_order["order"]["id"] for x in r.json())

    def test_order_reserves_and_cancel_releases_stock_once(self, s, customer_token):
        product = s.get(f"{API}/products", timeout=15).json()[0]
        pid = product["id"]
        stock_before = int(product.get("stock", 0) or 0)
        if stock_before <= 0:
            pytest.skip("test product has no stock")
        s.delete(f"{API}/cart/items/{pid}", headers=H(customer_token), timeout=15)
        added = s.post(f"{API}/cart/items", headers=H(customer_token),
                       json={"product_id": pid, "quantity": 1}, timeout=15)
        assert added.status_code == 200
        created = s.post(
            f"{API}/orders",
            headers=H(customer_token),
            json={"name": "TEST زبون", "phone": "07701234567", "address": "بغداد - الكرادة",
                  "lat": 33.3152, "lng": 44.3661, "notes": "TEST stock reservation"},
            timeout=15,
        )
        assert created.status_code == 200, created.text
        oid = created.json()["id"]
        after_create = next(p for p in s.get(f"{API}/products", timeout=15).json() if p["id"] == pid)
        assert int(after_create.get("stock", 0)) == stock_before - 1
        cancelled = s.post(f"{API}/orders/{oid}/cancel", headers=H(customer_token), timeout=15)
        assert cancelled.status_code == 200, cancelled.text
        after_cancel = next(p for p in s.get(f"{API}/products", timeout=15).json() if p["id"] == pid)
        assert int(after_cancel.get("stock", 0)) == stock_before
        repeated = s.post(f"{API}/orders/{oid}/cancel", headers=H(customer_token), timeout=15)
        assert repeated.status_code == 400
        after_repeat = next(p for p in s.get(f"{API}/products", timeout=15).json() if p["id"] == pid)
        assert int(after_repeat.get("stock", 0)) == stock_before


    def test_get_order_by_id(self, placed_order):
        s = placed_order["session"]
        oid = placed_order["order"]["id"]
        r = s.get(f"{API}/orders/{oid}", headers=H(placed_order["ctok"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == oid

    def test_other_customer_cannot_see_order(self, placed_order, s):
        # register a fresh customer
        email = f"TEST_other_{uuid.uuid4().hex[:6]}@souq.iq"
        r = s.post(f"{API}/auth/register", json={"name": "TEST Other", "email": email, "password": "Test@1234"}, timeout=15)
        tok = r.json()["token"]
        oid = placed_order["order"]["id"]
        f = s.get(f"{API}/orders/{oid}", headers=H(tok), timeout=15)
        assert f.status_code == 403


class TestLifecycle:
    def test_rejects_invalid_status_transition(self, s, manager_token, placed_order):
        oid = placed_order["order"]["id"]
        invalid = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token),
                         json={"status": "delivered"}, timeout=15)
        assert invalid.status_code == 400


    def test_full_lifecycle_and_delivery_sees_location(self, s, manager_token, delivery_token, placed_order):
        oid = placed_order["order"]["id"]
        # manager -> confirmed
        r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token),
                   json={"status": "confirmed"}, timeout=15)
        assert r.status_code == 200
        # manager -> preparing
        r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token),
                   json={"status": "preparing"}, timeout=15)
        assert r.status_code == 200
        # The order only becomes eligible for delivery after preparation is completed.
        r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token),
                   json={"status": "ready_for_delivery"}, timeout=15)
        assert r.status_code == 200
        # Fetch delivery agent id
        agents = s.get(f"{API}/admin/agents", headers=H(manager_token), timeout=15).json()
        assert len(agents) >= 1
        agent_id = next(a["user_id"] for a in agents if a["email"] == DELIVERY["email"])
        # Save the courier phone so the customer receives both name and number.
        r = s.put(f"{API}/admin/agents/{agent_id}", headers=H(manager_token),
                  json={"phone": "07801112233"}, timeout=15)
        assert r.status_code == 200
        # Assign
        r = s.post(f"{API}/admin/orders/{oid}/assign", headers=H(manager_token),
                   json={"agent_id": agent_id}, timeout=15)
        assert r.status_code == 200
        # Delivery sees it, with location
        dord = s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15)
        assert dord.status_code == 200
        assigned = [o for o in dord.json() if o["id"] == oid]
        assert len(assigned) == 1
        assert assigned[0]["status"] == "out_for_delivery"
        assert assigned[0]["location"] == {"lat": 33.3152, "lng": 44.3661}
        assert assigned[0]["agent_phone"] == "07801112233"
        # Mark delivered
        r = s.post(f"{API}/delivery/orders/{oid}/status", headers=H(delivery_token),
                   json={"status": "delivered"}, timeout=15)
        assert r.status_code == 200
        # Verify final state
        final = s.get(f"{API}/orders/{oid}", headers=H(manager_token), timeout=15).json()
        assert final["status"] == "delivered"
        assert final["delivered_at"]
        statuses = [t["status"] for t in final["timeline"]]
        assert "delivered" in statuses and "out_for_delivery" in statuses

        stale_location = s.post(f"{API}/delivery/orders/{oid}/location", headers=H(delivery_token),
                                json={"lat": 33.3152, "lng": 44.3661}, timeout=15)
        assert stale_location.status_code == 409


    def test_delivery_failure_requires_reason_and_records_reason(self, s, manager_token, delivery_token, placed_order):
        oid = placed_order["order"]["id"]
        for status in ("confirmed", "preparing", "ready_for_delivery"):
            r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token), json={"status": status}, timeout=15)
            assert r.status_code == 200, r.text

        agents = s.get(f"{API}/admin/agents", headers=H(manager_token), timeout=15).json()
        agent_id = next(a["user_id"] for a in agents if a["email"] == DELIVERY["email"])
        assigned = s.post(f"{API}/admin/orders/{oid}/assign", headers=H(manager_token), json={"agent_id": agent_id}, timeout=15)
        assert assigned.status_code == 200, assigned.text

        missing_reason = s.post(f"{API}/delivery/orders/{oid}/status", headers=H(delivery_token),
                                json={"status": "delivery_failed"}, timeout=15)
        assert missing_reason.status_code == 400

        failed = s.post(f"{API}/delivery/orders/{oid}/status", headers=H(delivery_token),
                        json={"status": "delivery_failed", "reason": "customer_unavailable"}, timeout=15)
        assert failed.status_code == 200, failed.text

        final = s.get(f"{API}/orders/{oid}", headers=H(manager_token), timeout=15).json()
        assert final["status"] == "delivery_failed"
        assert final["delivery_failed_reason"] == "customer_unavailable"
        assert final["amount_due"] == 0
        failed_delivery = next(o for o in s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15).json() if o["id"] == oid)
        assert failed_delivery["status"] == "delivery_failed"
        assert failed_delivery["amount_due"] == 0
        assert failed_delivery["delivery_failed_at"]
        assert any(t["status"] == "delivery_failed" for t in final["timeline"])


    def test_partial_return_reduces_amount_and_full_return_closes_order(self, s, manager_token, delivery_token, placed_order):
        oid = placed_order["order"]["id"]
        order = placed_order["order"]
        first_item = next((item for item in order["items"] if int(item.get("quantity", 0) or 0) >= 2), None)
        if not first_item:
            pytest.skip("test order needs an item with quantity >= 2")

        for status in ("confirmed", "preparing", "ready_for_delivery"):
            r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token), json={"status": status}, timeout=15)
            assert r.status_code == 200, r.text
        agents = s.get(f"{API}/admin/agents", headers=H(manager_token), timeout=15).json()
        agent_id = next(a["user_id"] for a in agents if a["email"] == DELIVERY["email"])
        assigned = s.post(f"{API}/admin/orders/{oid}/assign", headers=H(manager_token), json={"agent_id": agent_id}, timeout=15)
        assert assigned.status_code == 200, assigned.text

        partial = s.post(
            f"{API}/delivery/orders/{oid}/returns",
            headers=H(delivery_token),
            json={"items": [{"product_id": first_item["product_id"], "quantity": 1}]},
            timeout=15,
        )
        assert partial.status_code == 200, partial.text
        partial_doc = partial.json()
        assert partial_doc["return_type"] == "partial"
        expected_due = round(float(order["total"]) - float(partial_doc["total"]), 2)

        customer_order = s.get(f"{API}/orders/{oid}", headers=H(placed_order["ctok"]), timeout=15).json()
        assert customer_order["amount_due"] == expected_due
        delivery_order = next(o for o in s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15).json() if o["id"] == oid)
        assert delivery_order["amount_due"] == expected_due

        remaining = []
        for item in order["items"]:
            quantity = int(item.get("quantity", 0) or 0) - (1 if item["product_id"] == first_item["product_id"] else 0)
            if quantity > 0:
                remaining.append({"product_id": item["product_id"], "quantity": quantity})
        full = s.post(
            f"{API}/delivery/orders/{oid}/returns",
            headers=H(delivery_token),
            json={"items": remaining},
            timeout=15,
        )
        assert full.status_code == 200, full.text
        assert full.json()["return_type"] == "full"

        final = s.get(f"{API}/orders/{oid}", headers=H(manager_token), timeout=15).json()
        assert final["status"] == "returned"
        assert final["return_status"] == "full"
        assert final["amount_due"] == 0
        assert any(t["status"] == "returned" for t in final["timeline"])
        closed = next(o for o in s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15).json() if o["id"] == oid)
        assert closed["status"] == "returned"
        assert closed["amount_due"] == 0

    def test_delivery_cannot_open_unassigned_order(self, s, delivery_token, placed_order):
        oid = placed_order["order"]["id"]
        r = s.get(f"{API}/orders/{oid}", headers=H(delivery_token), timeout=15)
        assert r.status_code == 403

    def test_delivery_can_claim_available_order(self, s, manager_token, delivery_token, placed_order):
        oid = placed_order["order"]["id"]
        for status in ("confirmed", "preparing", "ready_for_delivery"):
            r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token), json={"status": status}, timeout=15)
            assert r.status_code == 200, r.text

        available = s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15)
        assert available.status_code == 200
        assert not any(o["id"] == oid for o in available.json())

        r = s.post(f"{API}/admin/orders/{oid}/status", headers=H(manager_token), json={"status": "ready_for_delivery"}, timeout=15)
        assert r.status_code == 200
        available = s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15)
        assert available.status_code == 200
        order = next(o for o in available.json() if o["id"] == oid)
        assert order["delivery_state"] == "available"
        assert order["item_count"] == sum(item["quantity"] for item in order["items"])
        assert order["area"]
        assert order["phone"] is None
        assert order["location"] is None
        assert order["address"] == order["area"]

        claimed = s.post(f"{API}/delivery/orders/{oid}/claim", headers=H(delivery_token), timeout=15)
        assert claimed.status_code == 200, claimed.text
        assert claimed.json()["delivery_state"] == "assigned"
        assert claimed.json()["status"] == "out_for_delivery"
        assert claimed.json()["location"] == {"lat": 33.3152, "lng": 44.3661}
        assert claimed.json()["phone"] == "07701234567"

        assigned = s.get(f"{API}/delivery/orders", headers=H(delivery_token), timeout=15).json()
        final = next(o for o in assigned if o["id"] == oid)
        assert final["delivery_state"] == "assigned"
        assert final["agent_id"]


# ---------------- Admin ops ----------------
class TestAdmin:
    def test_stats(self, s, manager_token):
        r = s.get(f"{API}/admin/stats", headers=H(manager_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("products", "orders", "active_orders", "delivered", "revenue"):
            assert k in d

    def test_admin_orders_filter(self, s, manager_token):
        r = s.get(f"{API}/admin/orders", headers=H(manager_token), params={"status": "delivered"}, timeout=15)
        assert r.status_code == 200
        for o in r.json():
            assert o["status"] == "delivered"

    def test_agents_and_set_role(self, s, manager_token):
        # create a temp user via register
        email = f"TEST_promote_{uuid.uuid4().hex[:6]}@souq.iq"
        reg = s.post(f"{API}/auth/register", json={"name": "TEST Promote", "email": email, "password": "Test@1234"}, timeout=15)
        uid = reg.json()["user"]["user_id"]
        # promote to delivery
        r = s.post(f"{API}/admin/set-role", headers=H(manager_token),
                   json={"user_id": uid, "role": "delivery"}, timeout=15)
        assert r.status_code == 200
        # verify in agents list
        agents = s.get(f"{API}/admin/agents", headers=H(manager_token), timeout=15).json()
        assert any(a["user_id"] == uid for a in agents)
        # revert
        s.post(f"{API}/admin/set-role", headers=H(manager_token),
               json={"user_id": uid, "role": "customer"}, timeout=15)
