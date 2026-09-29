# Danh sách nhà cung cấp API cho menu bước 1 (planning — D9)

> Bối cảnh: người dùng Việt **không chuyên IT**. Rào cản lớn nhất không phải chọn model, mà là **nạp tiền**.
> Tài liệu này chốt menu hiển thị trong wizard và nói rõ cái gì đã kiểm chứng, cái gì còn phải kiểm.

## 1. Menu đề xuất (thứ tự hiển thị)

```
(•) DeepSeek        — khuyến nghị: rẻ, nhanh, hiểu tiếng Việt tốt
( ) FPT AI Factory  — nhà cung cấp Việt Nam, dễ nạp tiền, tài liệu tiếng Việt
( ) OpenRouter      — một khoá dùng được nhiều model của nhiều hãng
( ) Anthropic       — Claude, chất lượng cao
( ) OpenAI          — GPT
( ) Google Gemini
( ) Khác            — tự nhập địa chỉ API + tên nhà cung cấp
```

Lý do xếp **FPT AI Factory lên thứ 2**: đây là điểm khác biệt cho người Việt — nhà cung cấp trong nước,
thanh toán nội địa, tài liệu tiếng Việt, và **endpoint tương thích chuẩn OpenAI** nên cắm vào Harness được ngay.

## 2. Bảng đối chiếu

| Nhà cung cấp | Việt Nam dùng được? | Thanh toán | Trạng thái kiểm chứng |
|---|---|---|---|
| **DeepSeek** | Có (tài khoản + API đã dùng phổ biến ở VN) | Thẻ quốc tế / ví điện tử — **thẻ Việt hay bị từ chối** | Rào cản thanh toán được nêu **đích danh Việt Nam** trong bài `dev.to/novaapi`: "thẻ bị từ chối, PayPal không có, nền tảng chính thức thiên về phương thức thanh toán Trung Quốc" |
| **FPT AI Factory** | Có — nhà cung cấp Việt Nam | Thanh toán nội địa (theo tài liệu FPT Cloud) | **Đã kiểm chứng**: tài liệu chính thức (`docs.fptcloud.com`, bản tiếng Việt) dùng `POST https://<serverless-gateway-domain>/v1/chat/completions` + `Authorization: Bearer <api-key>` → **chuẩn OpenAI** |
| **Anthropic (Claude)** | Có | Thẻ quốc tế | **Đã kiểm chứng**: trang `anthropic.com/supported-countries` có **Vietnam** trong danh sách được hỗ trợ |
| **OpenAI** | **Chưa xác minh** | Thẻ quốc tế | Cả trang tiếng Anh lẫn mirror tiếng Tây Ban Nha đều trả **HTTP 403** từ môi trường này → **bắt buộc kiểm lại trước khi đưa vào menu mặc định** |
| **Google Gemini** | **Có** | Thẻ quốc tế | **Đã kiểm chứng**: `ai.google.dev/gemini-api/docs/available-regions` có **Vietnam** trong danh sách vùng khả dụng |
| **OpenRouter** | Có (dịch vụ trung gian, không phân biệt quốc gia) | **Thẻ tín dụng phổ thông, AliPay, crypto USDC** (PayPal đang làm) | **Đã kiểm chứng** (`openrouter.ai/docs/faq.md`): không markup giá suy luận, **có phí khi nạp credit** (mức % render bằng JS nên chưa lấy được số); BYOK có hạn mức miễn phí theo gói |
| **Viettel AI** | Có (nhà cung cấp Việt Nam) | Nội địa | **Chưa kiểm chứng** được endpoint tương thích OpenAI → để ở mục "khảo sát thêm" |

## 3. Mục "Nạp tiền từ Việt Nam" trong phần hướng dẫn lấy khoá

Đây là phần **quan trọng nhất** với người dùng không chuyên (theo tài liệu + phản hồi cộng đồng):

1. **Thẻ quốc tế** (Visa/Mastercard debit hoặc credit) — cách chuẩn; nhiều ngân hàng VN phát hành, cần bật thanh toán quốc tế.
2. **Thẻ/ví ảo** — dùng được nhưng nhắc người dùng tự cân nhắc rủi ro; không khuyến khích nạp số lớn.
3. **Mua qua nhà cung cấp trong nước** (FPT AI Factory) — không phải lo thẻ quốc tế; đây là lý do xếp hạng 2.
4. **Nhờ người quen ở nước ngoài nạp hộ** — hợp lệ nhưng tuyệt đối **không chia sẻ khoá API**.
5. **Crypto** (một số dịch vụ trung gian nhận) — chỉ ghi chú, không hướng dẫn chi tiết.

**Cảnh báo bắt buộc hiển thị trong wizard:**
- "Khoá API giống như mật khẩu — không gửi cho ai, kể cả người bán khoá."
- "Chỉ nạp ít trước (khoảng 100–200k) để thử; hết mới nạp thêm."
- "Bạn trả tiền trực tiếp cho nhà cung cấp; HarnessVN không thu phí và không thấy số dư của bạn."
- "Dữ liệu bạn gửi sẽ đi tới máy chủ của nhà cung cấp. Nếu là dữ liệu nhạy cảm, cân nhắc tự chạy model nội bộ."

## 4. Hệ quả cho M3 (wizard)

- Menu S2 dùng đúng 7 mục ở trên; mục "Khác" mở `ProviderEditor` để nhập địa chỉ + tên.
- FPT AI Factory dùng **cùng đường OpenAI-compatible** → cần xác nhận Harness đã có sẵn provider kiểu "OpenAI-compatible + base URL" (đã có `CustomProviderCard`/`ProviderEditor`), chỉ cần điền sẵn mẫu.
- Trang "Cách lấy khoá" cho mỗi nhà cung cấp là **tài liệu tĩnh trong `docs/vi/`**, không nằm trong UI code.
- Trước khi phát hành: kiểm lại 3 ô còn ghi "chưa xác minh" (OpenAI, Gemini, OpenRouter phí; Viettel endpoint).

## 5. Việc cần làm để chốt D9

1. ~~Kiểm tra Gemini~~ **đã xong: có hỗ trợ Việt Nam**. Còn lại **OpenAI** (trang chính thức chặn 403) → cần kiểm từ mạng khác.
2. ~~Mức phí nạp OpenRouter~~ **đã rõ là có phí nhưng chưa lấy được con số** → trong UI chỉ ghi "có phí nạp", không hiện số.
3. Xác nhận FPT AI Factory có endpoint OpenAI-compatible công khai cho khách hàng cá nhân + cách tạo API key.
4. Chốt có đưa Viettel AI / nhà cung cấp nội địa khác vào menu hay không.

## 6. Đã kiểm chứng: Harness hỗ trợ nhà cung cấp tuỳ ý (không cần sửa code)

Gói `@deepseek-ai/dsh-llm-pi-ai` (có sẵn trong bản cài) là **adapter đa nhà cung cấp**: README của chính gói ghi
"routes model requests to multiple pi-ai providers, **OpenAI-compatible gateways**, or self-hosted servers from one configuration …
custom routes can declare those values without code changes".

Dạng cấu hình thật (trích từ README của gói):

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        baseURL: https://proxy.example.com:8443
      acme-gateway:                       # ← "Khác" trong menu của ta
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions           # ← chuẩn OpenAI, đúng kiểu FPT AI Factory / OpenRouter
        baseURL: https://gateway.acme.example/v1
        models:
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
```

Ba hệ quả quan trọng:

1. **"Khác (tự nhập địa chỉ + tên)" là đường có thật**: chỉ cần `api: openai-completions` + `baseURL` + tên route.
   → FPT AI Factory và OpenRouter cắm vào được ngay, không phải viết adapter.
2. **Khoá API không nằm trong file cấu hình**: `apiKeyEnv` là *tham chiếu credential*, được giải khi mỗi request chạy;
   README ghi rõ "no secret enters the configuration file". Wizard chỉ cần: ghi route vào cấu hình profile + lưu khoá vào credential store.
3. **Giao diện đã có sẵn chỗ khai báo**: `ui-settings-models` có `CustomProviderCard` + `ProviderEditor` và có kiểm tra
   `customBaseUrlInvalid` → wizard nên **tái dùng UI này** thay vì tự viết form.

→ Kết luận cho M3: không cần hạ tầng mới để phục vụ nhiều nhà cung cấp; việc của HarnessVN là **Việt hoá + điền sẵn mẫu cho từng nhà cung cấp + hướng dẫn nạp tiền**.

