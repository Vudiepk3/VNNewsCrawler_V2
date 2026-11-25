# VNNewsCrawler — Ứng dụng Android Thu thập Tin tức Tiếng Việt

**VNNewsCrawler** là ứng dụng Android thuần viết bằng **Kotlin + Jetpack Compose (Material Design 3)** dùng để thu thập (crawl) bài viết và hình ảnh từ các trang báo điện tử tiếng Việt (**VNExpress**, **Dân Trí**, **VietNamNet**), lưu trữ ngoại tuyến có cấu trúc rõ ràng, hiển thị thời gian đăng bài & sắp xếp mới nhất, tải ảnh về Thư viện máy, sao chép nhanh nội dung và hỗ trợ đăng bài lên **TikTok**.

---

## Mục lục

1. [Thông tin kỹ thuật & Yêu cầu hệ thống](#1-thông-tin-kỹ-thuật--yêu-cầu-hệ-thống)
2. [Nguồn báo & Chuyên mục hỗ trợ](#2-nguồn-báo--chuyên-mục-hỗ-trợ)
3. [Kiến trúc & Công nghệ sử dụng](#3-kiến-trúc--công-nghệ-sử-dụng)
4. [Cơ chế hoạt động chi tiết (Pipeline thu thập & lưu trữ)](#4-cơ-chế-hoạt-động-chi-tiết-pipeline-thu-thập--lưu-trữ)
5. [Cấu trúc thư mục đầu ra (`result/`) & Định dạng tệp](#5-cấu-trúc-thư-mục-đầu-ra-result--định-dạng-tệp)
6. [Cơ sở dữ liệu cục bộ (Room Database)](#6-cơ-sở-dữ-liệu-cục-bộ-room-database)
7. [Hướng dẫn sử dụng từng màn hình & Tính năng tương tác](#7-hướng-dẫn-sử-dụng-từng-màn-hình--tính-năng-tương-tác)
8. [Quyền hệ thống & Tuân thủ Chính sách Google Play](#8-quyền-hệ-thống--tuân-thủ-chính-sách-google-play)
9. [Cấu trúc mã nguồn dự án](#9-cấu-trúc-mã-nguồn-dự-án)
10. [Hướng dẫn Build & Chạy kiểm thử (Unit Test)](#10-hướng-dẫn-build--chạy-kiểm-thử-unit-test)

---

## 1. Thông tin kỹ thuật & Yêu cầu hệ thống

| Thuộc tính | Giá trị |
| --- | --- |
| **Tên ứng dụng** | `VNNewsCrawler` |
| **Application ID** | `com.aistudio.vnnewscrawler.kxmpqz` |
| **Namespace** | `com.example` |
| **Ngôn ngữ** | Kotlin (100%) |
| **Giao diện** | Jetpack Compose + Material Design 3 (`Edge-to-Edge`, hỗ trợ màn hình nhỏ & tablet `NavigationRail`) |
| **Min SDK / Target SDK / Compile SDK** | Android 7.0 (`API 24`) / `API 36` / `API 36.1` |
| **Java Target** | JDK 11 |
| **Gradle / AGP / Kotlin** | AGP `9.1.1` • Kotlin `2.4.21` • KSP `2.3.5` |

### Yêu cầu thiết bị khi chạy ứng dụng
- Thiết bị Android hoặc trình giả lập chạy **Android 7.0 (API 24)** trở lên.
- Kết nối Internet để quét danh sách liên kết, tải HTML bài viết và hình ảnh.
- Đọc bài viết đã tải, xem ảnh cục bộ, copy văn bản và duyệt tệp trong `result/` hoạt động **hoàn toàn ngoại tuyến**.

---

## 2. Nguồn báo & Chuyên mục hỗ trợ

Ứng dụng sử dụng mô hình **Factory Pattern** (`CrawlerFactory`) cho 3 nguồn báo tiếng Việt. Ngoài các chuyên mục riêng, cả 3 nguồn đều hỗ trợ hai tùy chọn đặc biệt:
- `trang-chu` (**Trang chủ**): Quét toàn bộ liên kết bài viết hợp lệ ở trang chủ (chỉ quét 1 trang).
- `all` (**Tất cả chuyên mục**): Tự động lặp qua toàn bộ chuyên mục của nguồn báo đang chọn.

### 2.1. VNExpress (`vnexpress.net` — thư mục `VNExpress/`)
- **Định dạng URL phân trang**:
  - Trang 1: `https://vnexpress.net/<chuyen-muc>`
  - Trang `N` (`N > 1`): `https://vnexpress.net/<chuyen-muc>-p<N>`
- **Regex nhận diện bài viết**: `^https?://(?:www\.|m\.)?vnexpress\.net/.+\.html$` (loại bỏ `#fragment`).
- **11 chuyên mục**: `thoi-su`, `du-lich`, `the-gioi`, `kinh-doanh`, `khoa-hoc`, `giai-tri`, `the-thao`, `phap-luat`, `giao-duc`, `suc-khoe`, `doi-song`.
- **CSS Selectors bóc tách**:
  - **Tiêu đề**: `h1.title-detail` → fallback `h1.title-news, h1.title_news_detail, article h1, header h1, h1` → `meta[property=og:title]`.
  - **Sapo**: `p.description, .description` (giữ nguyên các thẻ con như `span.location-stamp`) → fallback `meta[property=og:description]`.
  - **Nội dung**: `article.fck_detail p.Normal` → fallback `p.Normal` → `p` trong `article.fck_detail, .fck_detail, article`.

### 2.2. Dân Trí (`dantri.com.vn` — thư mục `DanTri/`)
- **Định dạng URL phân trang**:
  - Trang 1: `https://dantri.com.vn/<chuyen-muc>.htm`
  - Trang `N` (`N > 1`): `https://dantri.com.vn/<chuyen-muc>/trang-<N>.htm`
- **Regex nhận diện bài viết**: Khớp `^https?://(?:www\.|m\.)?dantri\.com\.vn/.+-\d+\.htm$` và **loại trừ** link phân trang `.*/trang-\d+\.htm$`.
- **15 chuyên mục**: `thoi-su`, `xa-hoi`, `the-gioi`, `kinh-doanh`, `bat-dong-san`, `the-thao`, `lao-dong-viec-lam`, `tam-long-nhan-ai`, `suc-khoe`, `van-hoa`, `giai-tri`, `suc-manh-so`, `giao-duc`, `an-sinh`, `phap-luat`.
- **CSS Selectors bóc tách**:
  - **Tiêu đề**: `h1.title-page.detail` → fallback `h1.title-page, h1.e-magazine__title, h1.dt-news__title, article h1, main h1, h1` → `meta[property=og:title]`.
  - **Sapo**: `h2.singular-sapo, h2.e-magazine__sapo, .singular-sapo, .e-magazine__sapo, .dt-news__sapo` → fallback `meta[property=og:description]`.
  - **Nội dung**: `div.singular-content, div.e-magazine__body, div.dt-news__content, article.singular-container, article` (`p`).

### 2.3. VietNamNet (`vietnamnet.vn` — thư mục `VietNamNet/`)
- **Định dạng URL phân trang**:
  - Trang 1: `https://vietnamnet.vn/<chuyen-muc>`
  - Trang `N` (`N > 1`): `https://vietnamnet.vn/<chuyen-muc>-page<N>`
- **Regex nhận diện bài viết**: `^https?://(?:www\.|m\.)?vietnamnet\.vn/.+\.html$`.
- **14 chuyên mục**: `thoi-su`, `kinh-doanh`, `the-thao`, `van-hoa`, `giai-tri`, `the-gioi`, `doi-song`, `giao-duc`, `suc-khoe`, `thong-tin-truyen-thong`, `phap-luat`, `oto-xe-may`, `bat-dong-san`, `du-lich`.
- **CSS Selectors bóc tách**:
  - **Tiêu đề**: `h1.content-detail-title` → fallback `h1.title-detail, article h1, main h1, h1` → `meta[property=og:title]`.
  - **Sapo**: `h2.content-detail-sapo, h2.sm-sapo-mb-0, .content-detail-sapo` → fallback `meta[property=og:description]`.
  - **Nội dung**: `div.maincontent, div.main-content, .content-detail-body, article` (`p`).

### 2.4. Bộ trích xuất ảnh chung (`JsoupUtils.extractArticleImageUrls`)
Hoạt động thống nhất trên cả 3 báo:
- Quét trong khối nội dung chính (`contentRoot`, fallback `doc.body()`):
  - Container ưu tiên: `.vnn-content-image`, `figure.image`, `figure.tplCaption`, `figure`, `picture`.
  - Ưu tiên đọc `<source>` theo thứ tự thuộc tính `data-srcset` → `srcset` → `data-src` → `src` (tách URL đầu tiên nếu có nhiều kích thước).
  - Nếu không có `<source>`, đọc `<img>` theo thứ tự `data-src` → `data-original` → `data-lazy-src` → `src`.
  - Quét thêm các thẻ `<img>` đứng độc lập ngoài `<picture>` / `<figure>` / `.vnn-content-image`.
- Tự động chuẩn hóa URL tương đối sang tuyệt đối qua `baseUri`, bỏ qua `data:image/...`, `.svg`, `1x1`, `blank.gif`, và khử trùng lặp bằng `LinkedHashSet`.

### 2.5. Bộ trích xuất thời gian đăng bài (`JsoupUtils.extractPublishedTimestamp`)
Hỗ trợ lưu thời gian gốc của bài viết (`publishedAt`, epoch ms) để hiển thị và sắp xếp chính xác:
- **Selector theo từng báo**:
  - **VNExpress**: `span.date`, `.header-content .date`, `time[datetime]`.
  - **Dân Trí**: `time.author-time`, `time.e-magazine__meta-time`, `.author-wrap time`, `.author-time`, `time[datetime]`.
  - **VietNamNet**: `div.bread-crumb-detail__time`, `.bread-crumb-detail__time`, `.article-detail-time`, `time[datetime]`.
- **Fallback chuẩn hóa**: Meta tags (`article:published_time`, `pubdate`, `itemprop=datePublished`, `og:updated_time`), `<time datetime>`, và JSON-LD (`"datePublished"`).
- **Định dạng hỗ trợ**: Parse đồng bộ cả **ISO-8601** (UTC/offset) lẫn chuỗi **ngày giờ tiếng Việt GMT+7** (ví dụ: `"Thứ ba, 24/11/2026, 14:35 (GMT+7)"`, `"24/11/2026 - 12:30"`). Nếu bài viết không có mốc giờ xuất bản (`0L`), hệ thống tự dự phòng sang `crawledAt`.

---

## 3. Kiến trúc & Công nghệ sử dụng

Ứng dụng áp dụng kiến trúc **MVVM + Repository** với Dependency Injection thủ công qua `AppContainer`:

- **UI & Navigation**:
  - `androidx.compose.material3` (BOM `2024.09.00`)
  - `androidx.navigation:navigation-compose` (`2.8.9`) với type-safe `@Serializable` routes (`AppRoute`)
  - `io.coil-kt:coil-compose` (`2.7.0`) tải & hiển thị ảnh cục bộ (`File`) hoặc ảnh mạng
  - Font chữ tiếng Việt đóng gói nội bộ (`res/font/`): `Be Vietnam Pro`, `Merriweather`, `JetBrains Mono`
- **Mạng & Phân tích HTML**:
  - `com.squareup.okhttp3:okhttp` (`4.10.0`) với `CookieJar`, Chrome headers và fallback `HTTP/1.1`
  - `org.jsoup:jsoup` (`1.18.3`) để phân tích DOM và trích xuất nội dung/liên kết/ảnh
- **Xử lý bất đồng bộ & Đa luồng**:
  - `kotlinx-coroutines-android` / `kotlinx-coroutines-core` (`1.10.2`), `Dispatchers.IO`, `Semaphore` giới hạn concurrency
- **Lưu trữ & Cấu hình**:
  - `androidx.room` (`2.7.0` + KSP) lưu metadata bài viết, log và lịch sử phiên
  - `androidx.datastore:datastore-preferences` (`1.1.7`) lưu cấu hình thu thập (`crawler_config_prefs`)
  - `kotlinx-serialization-json` (`1.8.0`)

---

## 4. Cơ chế hoạt động chi tiết (Pipeline thu thập & lưu trữ)

### 4.1. Cấu hình đồng bộ (`MainViewModel` & `CrawlConfig`)
- Cấu hình mặc định gồm: nguồn báo (`webname`), chế độ (`task = type | url`), danh sách URL (`urlsText`), chuyên mục (`articleType`), số trang (`totalPages`: `1..20`), số luồng (`numWorkers`: `1..8`), bật/tắt tự nhận diện báo theo tên miền (`autoDetectSourceInUrlMode`).
- Mọi thao tác chỉnh sửa từ UI cập nhật đồng bộ ngay lập tức vào `_config: MutableStateFlow<CrawlConfig>` (tránh trễ bất đồng bộ khi vừa dán URL vừa bấm **Bắt đầu**) và lưu nền vào DataStore.
- Người dùng có thể xem nhanh cấu hình tương đương dạng **`crawler_config.yml`** ngay trên màn hình chính.

### 4.2. Hai chế độ thu thập (`CrawlOrchestrator`)
1. **Chế độ Theo chuyên mục (`CrawlTask.TYPE`)**:
   - Duyệt lần lượt 1 chuyên mục, `trang-chu`, hoặc toàn bộ chuyên mục (`all`).
   - Quét song song các trang `1..totalPages` (có `delay(650ms)` từ trang 2 trở đi để giảm rủi ro bị chặn/HTTP 429).
   - Khử trùng lặp URL theo thứ tự xuất hiện (`distinct()`) và ghi danh sách URL vào `result/urls/<categorySlug>.txt`.
2. **Chế độ Theo URL (`CrawlTask.URL`)**:
   - Phân tách nhiều URL (theo xuống dòng, khoảng trắng, dấu phẩy, dấu chấm phẩy), tự thêm `https://` nếu người dùng nhập tên miền thiếu giao thức.
   - Nếu bật **Tự nhận diện báo theo tên miền**, ứng dụng tự chọn đúng crawler (`VNExpress`, `Dân Trí`, `VietNamNet`) cho từng URL — hỗ trợ crawl trộn nhiều báo trong cùng 1 lần chạy.
   - Nếu URL nhập vào là **trang chủ hoặc trang chuyên mục** (ví dụ `https://vnexpress.net`, `https://dantri.com.vn/thoi-su.htm`), ứng dụng tự động quét toàn bộ link bài viết bên trong trang đó (`url_discovered.txt`) rồi mới tải từng bài.

### 4.3. Cơ chế tải HTML & Ảnh (`HttpFetcher`)
- **Cookie & Browser Headers**: Lưu cookie theo từng domain bằng `ConcurrentHashMap`, gửi đầy đủ header trình duyệt (`User-Agent` Chrome, `Accept-Language: vi-VN,vi;q=0.9,...`, `Sec-Fetch-*`).
- **Retry & HTTP/1.1 Fallback**: Lần thử đầu dùng `primaryClient` (HTTP/2 + HTTP/1.1); nếu gặp lỗi mạng hoặc mã `403` / `429` / `>= 500`, tự động chờ (`600ms * attempt` cho HTML, `400ms * attempt` cho ảnh) và chuyển sang `http1Client` (`Protocol.HTTP_1_1`) để vượt các rule WAF khắt khe.
- **Tải ảnh bài viết**: Với mỗi bài viết trích xuất thành công, tải song song tối đa **3 ảnh cùng lúc** (`Semaphore(3)`), đính kèm header `Referer` là URL bài viết gốc, tự suy luận phần mở rộng (`jpg`, `png`, `webp`, `gif`) từ `Content-Type` hoặc đường dẫn URL.

### 4.4. Kiểm tra trùng lặp (Tránh tải lại bài đã có sẵn)
Trước khi gửi request tải nội dung từng bài viết trong `crawlUrlTargets`:
1. Chuẩn hóa URL (`ResultFileManager.normalizeUrl` — bỏ phần `#fragment`).
2. Gọi `CrawlerRepository.isArticleAlreadyDownloaded(url, source)`:
   - Kiểm tra bảng `crawled_articles` trong Room DB theo `url`; nếu có và tệp `.txt` tương ứng vẫn tồn tại trên bộ nhớ → **đã có sẵn**.
   - Kiểm tra dự phòng trực tiếp trên đĩa tại `result/<SourceFolder>/<article_tag>/<article_tag>.txt`.
3. Nếu bài đã tồn tại:
   - Bỏ qua không tải lại HTML và ảnh.
   - Tăng bộ đếm `skippedCount` (**Có sẵn**), ghi log `INFO`, và hiển thị qua banner thông báo phía trên (`TopNotificationOverlay`).

### 4.5. Hệ thống Thông báo nổi phía trên (`TopNotificationOverlay`), Hủy tiến trình & Thử lại lỗi
- Toàn bộ thông báo trong ứng dụng (`uiMessage`, `toastEvents` từ `MainViewModel`/`CrawlOrchestrator`, và `AppNotificationBus` từ `ShareUtils`) đều được hiển thị qua **Banner nổi ở phía trên màn hình (`TopNotificationOverlay`)** thay vì Snackbar/Toast ở đáy màn hình, giúp **không che khuất thanh điều hướng và các nút thao tác phía dưới**:
  - Tôn trọng `WindowInsets.safeDrawing` (không bị tai thỏ/camera trước che).
  - Tự phân biệt màu sắc & biểu tượng theo ngữ cảnh (thành công, thông tin, lỗi), tự động ẩn sau `3.2 giây` và có nút đóng nhanh (`X`).
- Các sự kiện thông báo tiêu biểu:
  - Bài viết đã có sẵn (`"Bài viết đã có sẵn"` / `"Đã có sẵn N bài viết"`).
  - Tải xong bài mới (`"Tải xong! Đã lưu X bài viết và Y ảnh"`).
  - Kết hợp bài mới & bài có sẵn (`"Tải xong! Lưu X bài mới (Y ảnh), Z bài đã có sẵn"`).
  - Sao chép nội dung, tải hết ảnh, xóa bài viết, chuyển sang TikTok, dừng tiến trình (`"Đã dừng tiến trình thu thập"`), hoặc lỗi đầu vào/mạng.
- Các URL thất bại được gom lại kèm lý do lỗi (`404`, `403`, `429`, thiếu tiêu đề, timeout...) để người dùng bấm **Thử lại các URL bị lỗi**.

---

## 5. Cấu trúc thư mục đầu ra (`result/`) & Định dạng tệp

Toàn bộ kết quả thu thập được lưu an toàn trong bộ nhớ riêng của ứng dụng (`context.filesDir/result/`) theo cấu trúc phân cấp **Nguồn báo → Tag bài viết**:

```text
<filesDir>/result/
├── VNExpress/
│   └── quang-hai-ban-thang-rat-quan-trong-voi-toi-4520944/
│       ├── quang-hai-ban-thang-rat-quan-trong-voi-toi-4520944.txt
│       ├── img_01.jpg
│       └── img_02.jpg
├── DanTri/
│   └── tong-bi-thu-chu-tich-nuoc-neu-5-dinh-huong-lon-trong-phat-trien-van-hoa-20261124123024601/
│       ├── tong-bi-thu-chu-tich-nuoc-neu-5-dinh-huong-lon-trong-phat-trien-van-hoa-20261124123024601.txt
│       └── img_01.jpg
├── VietNamNet/
│   └── <article_tag>/
│       ├── <article_tag>.txt
│       └── img_01.webp
├── urls/
│   ├── khoa-hoc.txt
│   └── url_discovered.txt
└── info.log
```

### Quy tắc đặt tên `<article_tag>` (`ResultFileManager.buildArticleTag`)
- Lấy đoạn slug cuối của URL bài viết và bỏ phần mở rộng `.html`, `.htm`, `.aspx`, `.php`.
- Làm sạch ký tự đặc biệt thành dấu `-` (chuyển chữ tiếng Việt `đ`/`Đ` và bỏ dấu khi fallback từ tiêu đề).
- Nếu độ dài `<= 100` ký tự → giữ nguyên toàn bộ slug; nếu dài hơn 100 ký tự → giữ 62 ký tự đầu + `-` + 36 ký tự cuối (bảo toàn ID bài báo ở cuối URL để đảm bảo tính duy nhất và xác định).

### Định dạng tệp `.txt` (UTF-8)
```text
<Tiêu đề bài viết>
<Sapo (từng dòng)>
<Đoạn văn 1>
<Đoạn văn 2>
...

[IMAGE_URLS]
https://...
```

---

## 6. Cơ sở dữ liệu cục bộ (Room Database)

Tệp CSDL: `vn_news_crawler.db` — hiện tại ở **phiên bản 4** (`AppDatabase`, hỗ trợ nâng cấp an toàn qua `MIGRATION_1_2`, `MIGRATION_2_3`, `MIGRATION_3_4`):

1. **`crawled_articles`** (index `UNIQUE` trên cột `url`):
   - `id`, `url`, `sourceId`, `categorySlug`, `title`, `sapo`, `bodyText`, `txtFilePath`, `wordCount`, `imageUrls`, `localImagePaths`, `publishedAt`, `crawledAt`.
   - Truy vấn mặc định sắp xếp **mới nhất trước**: `ORDER BY CASE WHEN publishedAt > 0 THEN publishedAt ELSE crawledAt END DESC, crawledAt DESC, id DESC`.
2. **`crawl_logs`**:
   - `id`, `timestamp`, `level` (`INFO`, `DEBUG`, `WARN`, `ERROR`), `tag`, `message`.
   - Giới hạn truy vấn 500 dòng mới nhất; đồng bộ song song ra tệp `result/info.log`.
3. **`crawl_sessions`**:
   - `id`, `sourceId`, `taskMode`, `categorySlug`, `totalUrls`, `successCount`, `failedCount`, `durationMs`, `createdAt`.
   - Ghi nhận lịch sử mỗi đợt chạy để hiển thị trên màn hình chính.

---

## 7. Hướng dẫn sử dụng từng màn hình & Tính năng tương tác

Ứng dụng gồm **4 Tab chính** (Bottom NavigationBar trên điện thoại, NavigationRail trên màn hình `>= 600dp`) và **1 Màn hình Chi tiết bài viết**:

### 7.1. Tab 1: Thu thập (`CrawlerScreen`)
- **Bước 01**: Chọn nguồn báo (**VNExpress**, **Dân Trí**, **VietNamNet**).
- **Bước 02**: Chọn chế độ **Theo chuyên mục** (`type`) hoặc **Theo URL** (`url`).
- **Bước 03**:
  - Nếu chọn *Theo chuyên mục*: Chọn chip chuyên mục (`Trang chủ`, `Tất cả (all)`, hoặc từng mục cụ thể) và kéo/bấm `-`/`+` chọn số trang (`1..20`).
  - Nếu chọn *Theo URL*: Dán danh sách URL, nạp từ file `.txt` qua trình chọn tệp hệ thống, nạp URL mẫu, xóa nhanh, hoặc bật/tắt tự nhận diện báo theo tên miền.
- **Bước 04**: Điều chỉnh số luồng song song `num_workers` (`1..8`; hiển thị cảnh báo nếu `> 4`).
- Bấm **Bắt đầu thu thập** để chạy, **Dừng thu thập** để hủy bất cứ lúc nào, xem thẻ tiến trình trực tiếp (`Mới`, `Có sẵn`, `Ảnh`, `Lỗi`, `Luồng`), bấm **Thử lại các URL bị lỗi** nếu có lỗi, hoặc bấm **YAML** ở tiêu đề để xem/sao chép cấu hình `crawler_config.yml`.

### 7.2. Tab 2: Kho bài viết (`LibraryScreen`)
- **Hiển thị thời gian & Sắp xếp mới nhất**:
  - Mặc định sắp xếp theo **Mới nhất** (`ArticleSortOrder.NEWEST`, ưu tiên thời gian đăng bài `publishedAt` mới nhất, dự phòng `crawledAt`).
  - Có chip chuyển đổi nhanh thứ tự ngay trên hàng bộ lọc: **`Mới nhất`** → **`Mới tải`** → **`Cũ nhất`**.
  - Mỗi thẻ bài viết (`ArticleLibraryCard`) hiển thị rõ ngày giờ đăng/tải kèm thời gian tương đối (ví dụ: `Đăng 24/11/2026 14:35 • 2 giờ trước`).
- Tìm kiếm theo tiêu đề, sapo hoặc chuyên mục; lọc nhanh theo nguồn báo.
- Hiển thị ảnh thu nhỏ ưu tiên lấy từ bộ nhớ cục bộ (`localImagePaths`), số lượng ảnh, số từ và đường dẫn `result/...`.
- **Copy hết nội dung bài viết**: Bấm nút **Sao chép** ngay trên thẻ bài để sao chép toàn bộ nội dung (Tiêu đề + Sapo + Nội dung).
- **Chọn nhiều bài viết để xóa (thay cho Xóa tất cả)**:
  - **Nhấn giữ (Long-press)** vào một thẻ bài viết (hoặc bấm nút **Chọn xóa** ở góc trên phải) để bật chế độ chọn kèm rung phản hồi.
  - Chạm các bài viết khác để tích chọn/bỏ chọn, hoặc bấm **Chọn tất cả / Bỏ chọn** trên thanh thao tác.
  - Bấm **Xóa (N)** và xác nhận để xóa đúng các bài đã chọn (tự động xóa luôn tệp `.txt`, ảnh và thư mục `<article_tag>` rỗng trong `result/`). Bấm nút **Đóng** hoặc phím Back để thoát chế độ chọn.
- Hỗ trợ chia sẻ và xóa nhanh từng bài viết.

### 7.3. Màn hình Chi tiết bài viết (`ArticleDetailScreen`)
- **Thanh tiêu đề (`TopAppBar`) gọn gàng**: Gồm quay lại, tăng/giảm cỡ chữ (`0.85x` – `1.4x`), nút **Chia sẻ (`Share`)** và nút **Xóa bài viết** (icon thùng rác màu đỏ ở ngoài cùng bên phải).
- **Xóa bài viết trực tiếp từ màn hình đọc**:
  - Bấm nút **Xóa** trên `TopAppBar` → hiển thị hộp thoại **"Xác nhận xóa bài viết"** → xác nhận xóa bản ghi trong Room + xóa toàn bộ tệp `.txt` và ảnh trong `result/` → thông báo **"Đã xóa bài viết thành công"** ở phía trên → tự động thoát về màn hình danh sách trước đó (`popBackStack`).
- **Khối 3 nút thao tác chính ngay dưới tiêu đề & thời gian bài viết**:
  - Hàng trên gồm 2 nút chia đều 50/50: **`Copy nội dung`** (sao chép toàn bộ Tiêu đề + Sapo + Nội dung) và **`Tải ảnh (N)`** (nếu bài có ảnh).
  - Hàng dưới là nút hành động chính toàn chiều rộng: **`Đăng bài lên TikTok`**.
- **Đăng bài lên TikTok (`prepareAndPostToTikTok` & `launchTikTokPostIntent`)**:
  - Khi bấm **`Đăng bài lên TikTok`**, ứng dụng kiểm tra số lượng ảnh của bài viết:
    - **0 ảnh**: Không chuyển app, hiển thị thông báo *"Không đăng được lên TikTok do bài viết không có ảnh!"*.
    - **Chỉ có 1 ảnh**: Tự động tải ảnh đó (lưu vào `Pictures/VNNewsCrawler/` trên Android 10+ và tạo URI chia sẻ qua `FileProvider` trong `cacheDir/tiktok_share/`), sao chép toàn bộ nội dung bài viết vào Clipboard rồi chuyển Intent sang TikTok.
    - **Nhiều ảnh (> 1 ảnh)**: Hiển thị hộp thoại chọn **"Tải ảnh đầu tiên (#1)"** hoặc **"Tải hết (N ảnh)"**; sau khi tải xong lựa chọn tương ứng sẽ tự động sao chép nội dung và chuyển Intent sang TikTok.
  - Nếu tải ảnh thất bại sẽ dừng và báo lỗi (không chuyển sang TikTok).
  - Tự động nhận diện các gói TikTok cài trên máy (`com.zhiliaoapp.musically`, `com.ss.android.ugc.trill`, `com.zhiliaoapp.musically.go`), gửi qua `ACTION_SEND` / `ACTION_SEND_MULTIPLE` kèm fallback mở app hoặc bảng chia sẻ hệ thống nếu thiết bị chưa cài TikTok.
- **Copy hết nội dung & Nhấn giữ văn bản (`Long-press`)**:
  - Ngoài nút **Copy nội dung** đầu bài và **Copy hết** cuối bài, nhấn giữ vào **Tiêu đề**, **Tóm tắt (sapo)** hoặc **bất kỳ đoạn văn nào** → rung nhẹ (`HapticFeedback`) và mở hộp thoại **Tùy chọn sao chép**:
    - *Copy hết nội dung bài viết*.
    - *Chỉ copy phần này* (tiêu đề / tóm tắt / đoạn văn đang nhấn).
    - *Copy hết kèm URL ảnh (`.txt`)*.
- **Tải ảnh về Thư viện máy**:
  - Nút **`Tải ảnh #1`** nổi trên góc ảnh bìa (chỉ tải ảnh đầu tiên).
  - Nút **`Tải ảnh (N)`** đầu bài hoặc **`Tải tất cả`** tại mục Hình ảnh (tải toàn bộ `N` ảnh trên Android 10+ và thông báo `"Đã tải hết N/N ảnh vào Pictures/VNNewsCrawler"`).
  - Nút tải trên từng thẻ ảnh gallery và trên trình xem ảnh phóng to.
  - **Nhấn giữ vào bất kỳ ảnh nào** (ảnh bìa, ảnh gallery) → mở hộp thoại tùy chọn (*Tải ảnh về Thư viện máy*, *Xem ảnh phóng to*, *Sao chép URL ảnh*); nhấn giữ trong trình xem phóng to để tải ngay lập tức.
  - Trên **Android 10+ (API 29+)**: Lưu thẳng vào `Pictures/VNNewsCrawler/` qua `MediaStore`. Trên **Android 7–9**: Mở hộp thoại chọn vị trí lưu (`CreateDocument`).
- **Lưu `.txt` & Mở trình duyệt**: Xuất tệp UTF-8 ra bộ nhớ ngoài qua Storage Access Framework (`CreateDocument`) hoặc mở URL bài gốc trên trình duyệt.

### 7.4. Tab 3: Thư mục (`FilesScreen`)
- Liệt kê toàn bộ tệp trong `result/` gom nhóm theo thư mục (`result/<Nguồn>/<tag_bài_viết>/`, `result/urls/`, `result/`).
- Hiển thị thumbnail trực tiếp cho các tệp ảnh (`jpg`, `jpeg`, `png`, `webp`, `gif`).
- Chạm vào tệp `.txt`/`info.log` để xem nội dung hoặc chạm vào ảnh để xem ảnh lớn.
- **Nhấn giữ (Long-press)** trên thẻ tệp `.txt` hoặc nội dung xem trước để sao chép toàn bộ nội dung; **nhấn giữ** hoặc bấm nút tải trên tệp ảnh để lưu vào Thư viện máy; hỗ trợ chia sẻ qua `FileProvider` và xuất tệp ra ngoài.

### 7.5. Tab 4: Nhật ký (`LogsScreen`)
- Xem log thời gian thực theo mức độ (`Tất cả`, `INFO`, `DEBUG`, `WARN`, `ERROR`).
- **Nhấn giữ từng dòng log** để copy nhanh dòng đó; hỗ trợ sao chép toàn bộ `info.log`, xuất tệp `info.log` hoặc xóa log.

---

## 8. Quyền hệ thống & Tuân thủ Chính sách Google Play

Khai báo trong `app/src/main/AndroidManifest.xml`:
- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`

**Không yêu cầu bất kỳ quyền nguy hiểm nào** (`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`):
- Dữ liệu crawl nội bộ lưu trong `context.filesDir/result/`.
- Chọn tệp `.txt` và xuất tệp `.txt`/ảnh dùng **Storage Access Framework (SAF)** (`OpenDocument`, `CreateDocument`).
- Lưu ảnh về Thư viện trên Android 10+ dùng `MediaStore.Images.Media` với cờ `IS_PENDING` (zero-permission).
- Chia sẻ tệp và ảnh sang TikTok dùng `androidx.core.content.FileProvider` (`res/xml/file_paths.xml`, gồm `result/` và `cacheDir/tiktok_share/`).
- Khai báo `<queries>` tường minh trong `AndroidManifest.xml` cho 3 gói ứng dụng TikTok (`com.zhiliaoapp.musically`, `com.ss.android.ugc.trill`, `com.zhiliaoapp.musically.go`) để kiểm tra cài đặt trên Android 11+ mà **không** dùng `QUERY_ALL_PACKAGES`.

---

## 9. Cấu trúc mã nguồn dự án

```text
app/src/main/
├── AndroidManifest.xml
├── res/
│   ├── drawable/          # app_icon_news_crawler.jpg, img_empty_newsroom.jpg, ic_launcher_*
│   ├── font/              # be_vietnam_pro.ttf, merriweather.ttf, jetbrains_mono.ttf
│   ├── mipmap-*/          # Adaptive launcher icons (.png)
│   ├── values/            # strings.xml, colors.xml, themes.xml
│   └── xml/               # file_paths.xml, backup_rules.xml, data_extraction_rules.xml
└── java/com/example/
    ├── MainActivity.kt                  # Entry point, Edge-to-Edge, Scaffold/NavHost, TopNotificationOverlay
    ├── AppContainer.kt                  # Khởi tạo Database, Repository, HttpFetcher, Orchestrator
    ├── crawler/
    │   ├── NewsSource.kt                # Enum 3 báo, folderName, danh sách 40 chuyên mục
    │   ├── CrawlConfig.kt               # Cấu hình crawl, parser URL & xuất YAML preview
    │   ├── CrawlerModels.kt             # ExtractedArticle (gồm publishedAt), FailedUrlItem, CrawlProgressState
    │   ├── HttpFetcher.kt               # OkHttp + CookieJar + HTTP/1.1 fallback + downloadImage + JsoupUtils (ảnh & ngày đăng)
    │   ├── NewsCrawler.kt               # Interface crawler chuẩn
    │   ├── VNExpressCrawler.kt          # Crawler VNExpress
    │   ├── DanTriCrawler.kt             # Crawler Dân Trí
    │   ├── VietNamNetCrawler.kt         # Crawler VietNamNet
    │   ├── CrawlerFactory.kt            # Factory trả về crawler theo NewsSource
    │   └── CrawlOrchestrator.kt         # Điều phối đa luồng, check trùng, tải ảnh, phát thông báo
    ├── data/
    │   ├── CrawlerRepository.kt         # Trung gian Room + ResultFileManager + DataStore
    │   └── local/
    │       ├── Entities.kt              # CrawledArticleEntity (publishedAt + displayTimestamp), CrawlLogEntity, CrawlSessionEntity
    │       ├── CrawlerDao.kt            # Truy vấn SQLite (sắp xếp mới nhất trước, getArticleByUrl, deleteArticlesByIds)
    │       ├── AppDatabase.kt           # Room v4 (MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
    │       ├── ResultFileManager.kt     # Tạo thư mục Nguồn/tag, lưu .txt + ảnh, dọn tệp
    │       └── ConfigPreferencesRepository.kt # DataStore cấu hình
    ├── logger/
    │   └── CrawlerLogger.kt             # Ghi log song song vào Room & result/info.log
    └── ui/
        ├── MainViewModel.kt             # StateFlow quản lý UI, ArticleSortOrder, download ảnh, xóa/quay lại, luồng TikTok
        ├── navigation/Routes.kt         # Type-safe AppRoute
        ├── components/
        │   ├── ShareUtils.kt            # Clipboard, MediaStore, FileProvider, TikTok Intent launcher, formatRelativeTime
        │   ├── TopNotificationBanner.kt # AppNotificationBus & TopNotificationOverlay nổi ở cạnh trên màn hình
        │   └── SourceBadge.kt           # Huy hiệu nguồn báo & chuyên mục
        ├── screens/
        │   ├── CrawlerScreen.kt         # Tab Thu thập
        │   ├── LibraryScreen.kt         # Tab Kho bài viết (hiển thị thời gian, sắp xếp mới nhất, chọn nhiều xóa)
        │   ├── ArticleDetailScreen.kt   # Chi tiết bài viết, xóa/quay lại, đăng TikTok, copy/nhấn giữ, tải ảnh
        │   ├── FilesScreen.kt           # Tab Thư mục result/
        │   └── LogsScreen.kt            # Tab Nhật ký info.log
        └── theme/                       # Color.kt, Type.kt, Theme.kt
```

---

## 10. Hướng dẫn Build & Chạy kiểm thử (Unit Test)

### 10.1. Build APK
Yêu cầu biến môi trường `ANDROID_SDK_ROOT` đã được cấu hình (không dùng `local.properties` nếu chạy trên CI/cloud container; dùng lệnh `gradle` thay vì `./gradlew` nếu môi trường không hỗ trợ wrapper):

```bash
gradle :app:assembleDebug
```

### 10.2. Chạy Unit Test bộ parser & quy tắc đặt tên thư mục
Tệp kiểm thử `app/src/test/java/com/example/CrawlerParsingUnitTest.kt` kiểm tra:
- Nhận diện tên miền (`NewsSource.detectFromUrl`) và số lượng chuyên mục (`11`, `15`, `14`).
- Phân tách danh sách URL & sinh `crawler_config.yml` (`CrawlConfig`).
- Khám phá liên kết bài viết `VNExpressCrawler`, `DanTriCrawler` (loại bỏ trang phân trang `/trang-2.htm`).
- Trích xuất văn bản con (`location-stamp`) và URL ảnh từ `.vnn-content-image`, `<source data-srcset/srcset>`, `<img data-src>` (`JsoupUtils`).
- Trích xuất ngày giờ đăng bài (`JsoupUtils.extractPublishedTimestamp`) cho VNExpress, Dân Trí, VietNamNet và chuẩn ISO-8601; kiểm tra `CrawledArticleEntity.displayTimestamp()` và thứ tự sắp xếp mới nhất.
- Định dạng xuất UTF-8 `.txt` kèm `[IMAGE_URLS]` và chuẩn hóa đường dẫn `<article_tag>` (`ResultFileManager.buildArticleTag`, `normalizeUrl`).

Chạy kiểm thử JVM:

```bash
gradle :app:testDebugUnitTest --tests "com.example.CrawlerParsingUnitTest"
```

> **Lưu ý khi chạy `ExampleRobolectricTest` trong môi trường không có mạng (offline)**: Robolectric với `@Config(sdk = [36])` cần tải artifact framework SDK từ Maven nếu chưa có trong cache cục bộ. Các unit test thuần JVM (`CrawlerParsingUnitTest`) chạy hoàn toàn ngoại tuyến mà không cần tải SDK Robolectric.
