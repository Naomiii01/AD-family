# 三罐零用金（AD family）

全家一起學習零用金規劃的手機網頁 App。每個人有三個罐子：

- **自由罐**：這個月可以自由花的錢，花了就記帳。
- **夢想罐**：為一個想要的東西存錢，存到一半爸媽加碼，換夢想要冷靜 7 天。
- **長期罐**：只進不出，每月由家庭銀行發利息，體驗複利。

功能：月初規劃、每日記帳、每週提醒、月底檢討與星星、年度計畫、理財約定（雙方簽名）、罐子使用原則、家長設定、Apple 捷徑快速記帳。

## 誰看得到什麼

| | 孩子 | 家長 |
|---|---|---|
| 自己的罐子與紀錄 | ✓ | ✓ |
| 其他家人的罐子與紀錄 | ✗ | ✓ |
| 發獎勵、夢想加碼、調整零用金 | ✗ | ✓ |

權限設在資料庫（Supabase Row Level Security）。孩子的手機就算改網址或直接呼叫 API，也讀不到其他家人的資料。

## 部署到 Vercel

1. 到 [vercel.com/new](https://vercel.com/new)，選 **Import Git Repository**，選這個 repo。
2. Framework 會自動偵測為 **Next.js**，其他設定都不用改，按 **Deploy**。
3. 部署完成後打開網址，選「建立家庭」，用 Email 建立第一位家長帳號。

不需要設定環境變數：Supabase 網址和 publishable key 已寫在 `lib/supabase.ts`（這把 key 本來就是公開用的，資料靠資料庫權限保護）。如果之後換 Supabase 專案，在 Vercel 設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://<專案>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## 第一次使用

1. 家長用 Email 建立家庭，畫面會顯示 **6 碼家庭代碼**。
2. 到「更多 → 家長設定 → 新增家人」，加入爸爸（家長，密碼 6–8 位數字）和孩子（孩子，密碼 4–8 位數字），並設定每月零用金。
3. 家人在自己的手機打開網址，選「家人登入」，輸入家庭代碼、點自己的名字、輸入密碼。
4. 建議在手機 Safari 按「分享 → 加入主畫面」，用起來就像 App。

## Apple 捷徑快速記帳

在 App 的「更多 → 快速記帳與每週提醒」產生個人記帳碼，照畫面上的步驟建立捷徑。捷徑會 POST 到：

```
POST https://diptjdacftuhlvpmjpyf.supabase.co/functions/v1/quick
{ "token": "<記帳碼>", "amount": 60, "item": "手搖飲", "type": "想要" }
```

回傳 `{ ok, message }`，`message` 可以直接顯示成通知。

## 專案結構

```
app/               Next.js 頁面（/ 主程式、/quick 快速記帳頁）
components/        各個畫面：罐子、本月、檢討、年度、更多、理財約定、使用原則、家長設定
lib/               Supabase 連線、共用工具
supabase/
  migrations/      資料表、權限、所有寫入函式
  functions/       Edge functions：signup、pin-login、members、quick
```

所有寫入都經過資料庫函式（`supabase/migrations/0002_functions.sql`），金額規則（自由罐不夠不能花、結算利息、夢想加碼、冷靜期）都在伺服器端檢查。
