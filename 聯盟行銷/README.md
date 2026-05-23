# 出遊分帳小幫手

朋友出遊時用的分帳工具，可處理餐費、票券、Uber 分段下車、司機體力成本與隱藏成本。

## 功能

- 新增朋友名單
- 新增花費項目
- 平均分攤、依比例分攤
- Uber 分段下車費用分配
- 司機 / 隱藏成本分攤
- 收款資訊、LINE Pay 連結、銀行帳號
- QR Code 收款碼上傳
- 付款狀態追蹤
- 歷史紀錄儲存
- PWA 支援，可加入手機主畫面

## 使用方式

直接打開 `index.html` 即可使用。

如果想在區網分享給同一個 Wi-Fi 的朋友，可先安裝 Node.js，然後執行：

```powershell
node share-server.js
```

再讓朋友打開：

```text
http://你的電腦IP:8787/
```

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository。
2. 上傳本資料夾全部檔案。
3. 到 repository 的 `Settings` → `Pages`。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，資料夾選 `/root`。
6. 儲存後等待 GitHub 產生公開網址。

## 資料保存

目前資料會保存在使用者自己的瀏覽器 localStorage 裡。不同裝置不會自動同步。
