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
    r = await db.products.update_one({"id": pid, "deleted_at": None}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    d = await db.products.find_one({"id": pid}, {"_id": 0})
    return clean_product(d)


