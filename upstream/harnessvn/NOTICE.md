# Ghi nhận nguồn gốc / Attribution

HarnessVN là bản phái sinh (fork) của **DeepSeek Harness**.

- Nguồn: https://github.com/deepseek-ai/deepseek-harness
- Phiên bản ghim: tag `dsh-v0.1.7-rc.2` — commit `477b4f420553e8a52c2fbccc464d7561b239c443`
- Giấy phép: **MIT** (xem `LICENSE` ở gốc repo — giữ nguyên của upstream)

## Thay đổi của HarnessVN so với upstream

1. **Tiếng Việt trở thành locale gốc**: `vi` nằm trong `LOCALE_IDS`; từ điển tiếng Việt cho 55 namespace
   (2.497 khoá) nằm tại `packages/client/locale/src/client/locales/vi/`; kiểu `register` được nới để
   `vi` có thể đến dần (khoá thiếu rơi về `en`).
2. **Shell desktop có tiếng Việt**: `apps/desktop/src/locale.ts` thêm từ điển `vi` (138 khoá) và
   nhận diện ngôn ngữ hệ điều hành `vi`.
3. **Kèm plugin**: `harnessvn/plugins/` chứa các plugin của bản đang dùng (trừ `dsh-mario`).
4. **Bộ dựng máy ảo**: `harnessvn/vm/` (cloud-init + launcher cho Windows/macOS/Linux) và
   `harnessvn/install/provision.sh` (cài đặt không cần root).
5. **Tài liệu & kế hoạch tiếng Việt**: `harnessvn/project/`.

## Thương hiệu

Tên và logo **DeepSeek** thuộc về DeepSeek. HarnessVN dùng thương hiệu riêng cho sản phẩm phái sinh
và chỉ nhắc tới DeepSeek Harness để ghi nguồn. Không dùng logo/tên DeepSeek để đặt tên hay quảng bá
bản phát hành này.
