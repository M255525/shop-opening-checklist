# shop-opening-checklist — 開店前置清單

選店型（餐飲／零售／網店／美容美髮／工作室／攤販）、登記型態、月營業額、員工數、場地與其他狀況（裝潢、招牌、音樂、會員資料、賣食品、外送），自動排出從規劃、登記、店面、人事食安、開幕準備到開幕後的倒數清單（最多 42 項），每項寫為什麼、去哪辦、要準備、法規依據與官方連結。勾一項鐵捲門就拉高一點，全部完成亮「營業中」。

- 純靜態：`index.html`（CSS）＋`data.js`（任務資料＋規則引擎，node 也能 require）＋`app.js`（畫面）＋`manual.html`＋PWA。
- 本機預覽 port **8874**（`.claude/launch.json` 的 `shop-opening-checklist`）。visitor-badge `m255525.shopopeningchecklist`。
- 部署：`.github/workflows/pages.yml`（push master 自動部署 GitHub Pages）：<https://m255525.github.io/shop-opening-checklist/>（2026-11-13 上線；repo 由使用者自己 `gh repo create`）。

## 規則（2026-11 查證，改規定要同步三處：`data.js`、`tools/manual_body.html` 的數字表、`app.js` 的 `WARN_HTML`）
- 營業稅起徵點（財政部，2025-01-01 起）：銷售貨物業 10 萬／月（food／retail／online／stall），勞務業 5 萬（beauty／service）。`threshold()`。
- 商業登記法第 5 條：未達起徵點等可免辦商業登記，**仍要辦稅籍**（`taxreg` 對所有組合都出現）。
- 免用統一發票門檻 20 萬（`NO_INVOICE`），影響 `invoice`、`vatfile` 文字。
- 勞保 5 人以上強制、未滿 5 人可自願（`ins_li` tag must/maybe）；就保＋職災 1 人以上（`ins_ei`）；勞退 6%；工作規則 30 人（`rules`）。
- 食品業者登錄（食安法 §8）：`sellsFood` = 店型 food 或勾「也有賣吃的」。產品責任險（衛福部 110-09-28 公告）只對有商業／公司登記者（`org !== 'small'`）。
- 「視情況」項目（室內裝修審查、消防、招牌、廚師證照、美容營業衛生、公共意外險）各縣市不同，文案一律寫「以承辦機關認定為準」，不可寫成確定必辦。
- 法規連結用全國法規資料庫 pcode（已驗證：J0080001 公司法、J0080004 商業登記法、J0080006 資本額查核辦法、G0340080 營業稅法、G0340003 所得稅法、N0030001 勞基法、N0050001 勞保條例、N0050021 就保法、L0060001 健保法、N0030020 勞退條例、L0040001 食安法、J0170001 消保法、I0050021 個資法、J0070017 著作權法、D0070109 建築法）。職災保護法 pcode 未確認，改連勞保局 FAQ。
- 改 `data.js` 後跑 `node tools/test_engine.mjs`（窮舉 3000 種組合＋各條規則）。

## 架構
- 任務 `{id, ph, tag, o:[開始, 截止]（相對開幕日天數）, title, why, where, prep, links, src, when(ctx)}`，文字欄可為 `function(ctx)`；`buildTasks(ctx)` 解析成字串＋日期。日期全用本地時間 `fmt()`，不要用 toISOString。
- localStorage 前綴 `soc.`：`ctx`、`done{id:完成日}`、`notes`、`custom[]`、`budget`、`tab`、`group`、`fs`、`fold`、`warnSeen`、`marquee`。改開店設定時 done／notes 依 id 保留。
- **`<html>` 有 `data-fs` 屬性**，事件委派的 `closest()` 會一路找到 html——按鈕屬性不可再用 `data-fs`（曾因此點任何空白處都打開設定），字體鈕用 `data-fontsize`。
- 範例模式（2026-11-13 起頁面上方 `exStrip()` 橫條常駐三家範例按鈕，主畫面與開店設定頁都有；範例中變深色並顯示「離開範例」，取代舊的 demo-bar；⚙ 看範例仍保留）：`S` 換成記憶體資料、`save()` 不寫入；開幕日＝今天＋40 天，最晚到期的一項必辦留著示範「逾期」。
- 分享連結 `#s=`（base64url 的 ctx，不帶勾選／備註／預算）；已有設定時跳確認；有 `hashchange` 監聽。
- **下載 PDF**（2026-11-13 使用者要求，要有浮水印）：`downloadPdf()` 點擊時才從 cdnjs 載入 html2pdf.js 0.10.1，`reportEl()` 另組一份 A4 報告 DOM（進度、各項說明、備註、預算），`pagebreak.avoid` 讓任務卡不跨頁；產生後逐頁 `addImage` 浮水印（`watermark.js` 的 `SOC_WATERMARK`＝馬克老師去背圖，先用 canvas 畫成 11% 透明 PNG，不依賴 jsPDF 透明度 API）＋頁尾網址與頁碼（jsPDF 內建字型不支援中文，頁尾只能用英數）。依報告高度調 html2canvas scale（上限 2，畫布高不超過 30000px）。`#pdfReport` 要 `box-sizing:border-box;width:100%`，否則右邊框被裁。驗證：Playwright 改寫 `html2pdf.Worker.prototype.save` 取 datauri，再用 PyMuPDF 逐頁轉圖看（範例早午餐 6 頁、約 2.6MB、約 6 秒）。離線時 cdnjs 載不到會提示改用列印。
- 列印也有同一張浮水印（`#pdfWatermark`，`@media print` 固定置中，每頁重複）。
- 匯出：列印（`@media print` 只印清單＋去哪辦＋要準備＋備註）、`.ics`（未完成項目放截止日，依 75 位元組折行）、複製文字、備份 JSON（`app:'shop-opening-checklist'`，還原過 `cleanState`）。
- 鐵捲門 `storefront(p)` 是內嵌 SVG，`#shutter` 用 CSS transform 上移 `p×138`。
- 測試掛鉤 `window._soc`。

## AI 助手（2026-11-13，BYOK）
- `ai.js`（`window.SOC_AI`），透過 `app.js` 開出的 `window.SOC_APP` 介面操作狀態；服務商與 `callLLM`/`geminiModelFix` 沿用 `行銷內容工具/skill-prompt-studio`（7 家，含看圖）。設定存 `soc.ai`，輸入存 `soc.aiform`、結果存 `soc.aiout`、計畫書段落存 `soc.aiplan`（都不在備份檔裡）。
- **原則：必辦項目、門檻、期限只由 data.js 規則決定**，prompt 開頭的 `RULES` 明令不得增刪項目、不得編造條號金額電話。每個功能都有免金鑰路徑：一句話設定有規則式 `D.parseShopText()`（在 data.js，node 測試覆蓋）、問承辦人問題 `agencyQs()`、優先順序 `priorityRule()`、進度摘要 `progressText()`，其餘可「複製提示詞」。
- 入口：開店設定頁 `setupBox()`、任務卡「🤖 問 AI 這一項」（`openAsk`，可存到備註）、第 4 個分頁「🤖 AI 助手」6 張卡（文件草稿／營運計畫書→鳳凰貸款／優先順序／進度摘要／拍照辨識租約／店名與宣傳）、⚙ 的 AI 設定。
- **鳳凰貸款接力**：`phoenixPayload()` → 開 `https://m255525.github.io/phoenix-loan-generator/#shopImport=<base64url>`（一律線上版）。對應：org small→small、sole/partner→business、ltd/corp→company；只有「只有自己」時帶 employeeCount=0；fundUse＝開辦預算非零項＋周轉金。接收端邏輯在 phoenix-loan-generator 的 `offerShopImport()`。鳳凰貸款的資金用途要等於「尚需資金」，整份預算一定對不起來，兩邊都有提示請使用者刪減。
- 驗證方式：Playwright 改寫 `window.fetch` 模擬 Gemini 回應，測請求格式（金鑰在 header、JSON 模式、照片有 inline_data）與每張卡的解析呈現；真實金鑰未實測。

## 標準配備
跑馬燈（工作區公告 GAS，滑鼠移入暫停，不可關）、⚙ 常用設定（收合式＋關於本工具）、首訪警語＋頁面入口、`manual.html#creator` 完整版（`tools/build_manual.py` 組，改手冊改 `tools/manual_body.html` 再重跑）、PWA（`tools/make_icons.py` 產圖示；上線改版升 `service-worker.js` 的 `CACHE_NAME`）、訪客計數器。

## 未驗證
手機真機的 .ics 匯入、iPhone 主畫面資料保留只在桌面 Chrome 模擬過。
