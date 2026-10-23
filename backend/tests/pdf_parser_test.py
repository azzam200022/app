import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import inventory_stock_fields, parse_inventory_pdf


class FakePage:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class FakeReader:
    def __init__(self, pages):
        self.pages = pages


def test_parse_inventory_pdf_extracts_barcode_price_quantity():
    fake = FakeReader([FakePage("الباركود السعر الكمية\n8699449876882 1500 1\n1234567890123 السعر: 2500 الكمية: 8")])
    with patch("server.PdfReader", return_value=fake):
        rows, duplicates, invalid = parse_inventory_pdf(b"pdf")

    assert duplicates == []
    assert invalid == []
    assert rows == [
        {"identifier": "8699449876882", "barcode": "8699449876882", "product_id": None, "price": 1500.0, "quantity": 1, "page": 1, "line": 2},
        {"identifier": "1234567890123", "barcode": "1234567890123", "product_id": None, "price": 2500.0, "quantity": 8, "page": 1, "line": 3},
    ]


def test_parse_inventory_pdf_rejects_duplicate_barcodes():
    fake = FakeReader([FakePage("8699449876882 1500 1\n8699449876882 1700 4")])
    with patch("server.PdfReader", return_value=fake):
        rows, duplicates, invalid = parse_inventory_pdf(b"pdf")

    assert rows == []
    assert duplicates == ["8699449876882"]
    assert invalid == []


def test_parse_inventory_pdf_matches_explicit_internal_product_id():
    fake = FakeReader([FakePage("ID: prod_abc123 السعر: 2500 الكمية: 2")])
    with patch("server.PdfReader", return_value=fake):
        rows, duplicates, invalid = parse_inventory_pdf(b"pdf")

    assert duplicates == []
    assert invalid == []
    assert rows == [
        {
            "identifier": "prod_abc123",
            "barcode": None,
            "product_id": "prod_abc123",
            "price": 2500.0,
            "quantity": 2,
            "page": 1,
            "line": 1,
        }
    ]


def test_inventory_availability_threshold_includes_zero_through_two():
    assert inventory_stock_fields(0) == {"stock": 0, "coming_soon": True}
    assert inventory_stock_fields(1) == {"stock": 1, "coming_soon": True}
    assert inventory_stock_fields(2) == {"stock": 2, "coming_soon": True}
    assert inventory_stock_fields(3) == {"stock": 3, "coming_soon": False}
