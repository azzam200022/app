# PRD — سوق ماركت (Souq Market)

## Problem statement
بناء تطبيق سوبر ماركت عربي (RTL) لبيع مختلف المنتجات، بتصميم فخم. ثلاثة أدوار: زبون، مدير، مندوب توصيل. الدفع عند الاستلام فقط. إضافة المنتجات عبر تصوير/إدخال الباركود (يملأ الاسم والتصنيف تلقائياً من كتالوج مستخرج من ملف PDF)، والمدير يرفع صور المنتجات.

## Architecture
- Frontend: Expo Router (RTL, Arabic-only), fonts Tajawal + Cairo, expo-image, linear-gradient, expo-camera, expo-image-picker, expo-print, expo-location.
- Backend: FastAPI + Firebase Admin, Firestore, Firebase Authentication, and Firebase Storage. Firebase ID tokens are verified server-side and product images are stored in the Firebase bucket.
- Data: catalog seeded from user's PDF = 12,688 items (barcode + name + category). PDF had NO prices → manager enters price manually. 24 sample published products seeded.

## User personas
- الزبون: يتصفح، يبحث، يضيف للسلة والمفضلة، يطلب (دفع عند الاستلام)، يحدد موقعه GPS، يتتبع الطلب.
- المدير: لوحة تحكم، إضافة منتج بالباركود + صورة + سعر، إدارة المنتجات والطلبات، تعيين المندوبين، طباعة الفواتير + طباعة تلقائية.
- المندوب: يرى الطلبات المسندة إليه، يفتح موقع الزبون على الخريطة للملاحة، يؤكد التوصيل.

## Core requirements (static)
- عربي RTL فقط، تصميم فخم (أخضر داكن + ذهبي).
- ثلاثة أدوار مع صلاحيات، حساب المدير جاهز والمدير يعيّن المندوبين.
- الدفع عند الاستلام فقط.
- إضافة منتجات عبر الباركود (auto-fill من الكتالوج) + رفع صورة.

## Implemented (2026-06)
- المصادقة: Firebase Authentication بالبريد/كلمة المرور وجوجل، مع مزامنة المستخدمين والأدوار في Firestore. `zzam8160@gmail.com` يُعيَّن مديراً تلقائياً.
- الزبون: الرئيسية (بانر عروض + تصنيفات أفقية + شبكة منتجات)، بحث، تفاصيل منتج، سلة، مفضلة، عروض، إتمام طلب مع تحديد موقع GPS + معاينة خريطة، تتبع الطلب بخط زمني.
- المدير: لوحة إحصاءات، إضافة منتج (مسح باركود/إدخال يدوي + نموذج + رفع صورة)، إدارة المنتجات (تعديل سعر/حذف)، إدارة الطلبات (فلترة + تحديث الحالة + تعيين مندوب)، إدارة المستخدمين/المندوبين.
- المندوب: قائمة الطلبات المسندة + معاينة خريطة + زر ملاحة (Google/Apple Maps) + تأكيد التوصيل.
- الطباعة: إيصال عربي عبر expo-print لكل طلب + مفتاح "طباعة تلقائية للطلبات الجديدة" + اختيار طابعة افتراضية (iOS).
- الموقع: الزبون يحدد GPS، يُخزَّن location {lat,lng} في الطلب، المندوب يفتح الملاحة دون الحاجة للاتصال بالزبون.
- الاختبار: 26/26 backend pytest ناجحة، جميع تدفقات الواجهة موثّقة بلقطات.

## Backlog / next
- P1: عرض موقع الزبون داخل بطاقة طلب المدير أيضاً.
- P1: خريطة تفاعلية داخل التطبيق (react-native-maps) في نسخة الـ build بدل الصورة الثابتة.
- P2: إشعارات للمدير عند وصول طلب جديد.
- P2: تقييمات المنتجات، برنامج نقاط ولاء.

## Notes / limitations
- مسح الباركود بالكاميرا والطباعة الصامتة تعملان في النسخة المبنية (Build) وليس داخل Expo Go؛ الإدخال اليدوي متاح كبديل.
- تباعد قاعدة بيانات المعاينة عن الإنتاج بعد أول نشر.

## Latest features (batch 2)
- Push notifications: notify manager on new order + customer on status change. Needs `google-services.json` + build for native push delivery.
- Live delivery tracking: agent broadcasts location every 20s for active orders (agent_location); customer sees live 2-pin map refreshing every 15s.
- Catalog name search: GET /api/catalog/search + UI in Add screen (30 priced results, tap to add).
- Bin Saleem logo on printed invoice (manager-only printing). Currency IQD (د.ع).
- Smooth logo entrance animation + gentle launch sound (expo-audio).
- Catalog updated from month-8 price file: 11,011 products with retail selling prices (IQD).

## Latest features (batch 3, 2026-06)
- POS/cashier integration UI: manager dashboard → "ربط نقطة البيع" card → sync-settings screen showing endpoint URL, POST method, X-Sync-Key header, masked sync key (eye toggle), copy buttons, and JSON sample. Backend: GET /api/admin/sync-config (manager-only). Sync endpoint: POST /api/inventory/sync with X-Sync-Key header (env SYNC_KEY).
- Colored bottom tab bar (customer + manager): dark teal (brandPrimary) background, gold active tint, cream-muted inactive; height unchanged. Delivery uses Stack (no tabs).
- Collapsing header on customer home: Animated.FlatList maps scrollY → logo shrinks (34→24) and top-bar padding compacts, giving more product space.
- Product image upload: expo-image-picker → POST /api/upload → Firebase Storage → image_url saved on the Firestore product → served via /api/files.
