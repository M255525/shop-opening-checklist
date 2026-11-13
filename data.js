/* 開店前置清單：任務資料＋規則引擎（瀏覽器與 node 測試共用，不可用 DOM）
 * 任務欄位：id, ph(階段), tag(must 必辦／maybe 視情況／tip 建議), o:[開始, 截止]（相對開幕日的天數，負數＝開幕前）,
 *   title, why, where, prep[], links[{t,u}], src（依據）, when(ctx)→是否適用。文字欄位可以是 function(ctx)。
 * 規定以 2026-11 查證為準；改規定時同步 tools/manual_body.html 與 CLAUDE.md。 */
(function(root){
'use strict';

var LAW = function(p){ return 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=' + p; };
var L = {
  company: {t:'公司法', u:LAW('J0080001')},
  biz: {t:'商業登記法', u:LAW('J0080004')},
  capital: {t:'公司行號申請登記資本額查核辦法', u:LAW('J0080006')},
  vat: {t:'加值型及非加值型營業稅法', u:LAW('G0340080')},
  income: {t:'所得稅法', u:LAW('G0340003')},
  threshold: {t:'小規模營業人營業稅起徵點（財政部）', u:'https://law-out.mof.gov.tw/LawContent.aspx?id=FL006090'},
  lsa: {t:'勞動基準法', u:LAW('N0030001')},
  li: {t:'勞工保險條例', u:LAW('N0050001')},
  ei: {t:'就業保險法', u:LAW('N0050021')},
  bliFaq: {t:'勞保局：未滿 5 人要不要加保', u:'https://www.bli.gov.tw/0017585.html'},
  nhi: {t:'全民健康保險法', u:LAW('L0060001')},
  pension: {t:'勞工退休金條例', u:LAW('N0030020')},
  food: {t:'食品安全衛生管理法', u:LAW('L0040001')},
  fadenbook: {t:'食品業者登錄平台（非登不可）', u:'https://fadenbook.fda.gov.tw/pub/index.aspx'},
  liability: {t:'食品業者投保產品責任保險公告（臺中市食安處轉知）', u:'https://www.fds.taichung.gov.tw/1210187/1210224/1210225/1210229/1269942'},
  cpa: {t:'消費者保護法', u:LAW('J0170001')},
  pdpa: {t:'個人資料保護法', u:LAW('I0050021')},
  copyright: {t:'著作權法', u:LAW('J0070017')},
  building: {t:'建築法', u:LAW('D0070109')},
  onestop: {t:'公司與商業及有限合夥一站式線上申請', u:'https://onestop.nat.gov.tw/'},
  etax: {t:'財政部稅務入口網', u:'https://www.etax.nat.gov.tw/'},
  tipo: {t:'經濟部智慧財產局', u:'https://www.tipo.gov.tw/'},
  loan: {t:'創業貸款資格核對（本站姊妹工具）', u:'https://m255525.github.io/loan-eligibility-checker/'},
  feas: {t:'餐飲店經營評估試算（本站姊妹工具）', u:'https://m255525.github.io/restaurant-feasibility-calculator/'},
  cal: {t:'全年度行銷行事曆產生器（本站姊妹工具）', u:'https://m255525.github.io/annual-marketing-calendar/'}
};

var TYPES = {
  food:   {n:'餐飲／飲料店', ic:'🍜', goods:true},
  retail: {n:'零售實體店', ic:'🛍', goods:true},
  online: {n:'網路商店', ic:'📦', goods:true},
  beauty: {n:'美容美髮美甲', ic:'💇', goods:false},
  service:{n:'工作室／服務業', ic:'🛠', goods:false},
  stall:  {n:'攤販／市集', ic:'⛺', goods:true}
};
var ORGS = {
  small:  {n:'小規模，先只辦稅籍', s:'未達起徵點可免辦商業登記'},
  sole:   {n:'獨資行號', s:'一個人出資，縣市政府登記'},
  partner:{n:'合夥行號', s:'兩人以上合夥，縣市政府登記'},
  ltd:    {n:'有限公司', s:'股東有限責任，需會計師資本查核'},
  corp:   {n:'股份有限公司', s:'規模較大或要募資'}
};
var STAFF = {'0':'只有自己', '1-4':'1～4 人', '5-29':'5～29 人', '30+':'30 人以上'};
var PLACES = {rent:'租店面', own:'自有店面', home:'住家／工作室', none:'沒有實體店（網路）', spot:'攤位／市集'};
var PHASES = [
  {id:'plan', n:'規劃', s:'開幕前 4～3 個月'},
  {id:'reg',  n:'登記', s:'開幕前 3 個月～1 個月半'},
  {id:'shop', n:'店面', s:'開幕前 2 個月半～3 週'},
  {id:'team', n:'人事與食安', s:'開幕前 1 個月半～1 週'},
  {id:'open', n:'開幕準備', s:'開幕前 3 週～開幕'},
  {id:'after',n:'開幕後', s:'開幕後持續要做'}
];

/* 營業稅起徵點（每月銷售額，萬元）：2025-01-01 起 銷售貨物業 10 萬、銷售勞務業 5 萬 */
function threshold(ctx){ return TYPES[ctx.type] && TYPES[ctx.type].goods ? 10 : 5; }
var NO_INVOICE = 20; // 平均每月銷售額未達 20 萬可申請核定免用統一發票（查定課徵 1%）
function staffN(ctx){ return {'0':0, '1-4':1, '5-29':5, '30+':30}[ctx.staff] || 0; }
function physical(ctx){ return ctx.place === 'rent' || ctx.place === 'own'; }
function sellsFood(ctx){ return ctx.type === 'food' || !!ctx.food; }
function registered(ctx){ return ctx.org !== 'small'; }
function isCompany(ctx){ return ctx.org === 'ltd' || ctx.org === 'corp'; }
function isFirm(ctx){ return ctx.org === 'sole' || ctx.org === 'partner'; }
function under(ctx){ return +ctx.sales > 0 && +ctx.sales < threshold(ctx); }

/* 依店型與營業額給登記型態建議（純規則，不構成法律或稅務意見） */
function orgAdvice(ctx){
  var th = threshold(ctx), s = +ctx.sales || 0, out = [];
  out.push('您的業別起徵點是每月銷售額 ' + th + ' 萬元（' + (th === 10 ? '銷售貨物類' : '銷售勞務類') + '）。');
  if(s && s < th){
    out.push('預估月營業額 ' + s + ' 萬元未達起徵點：依商業登記法第 5 條可以免辦商業登記，但仍要向國稅局辦稅籍登記，營業稅免繳。');
    if(staffN(ctx) > 0 || physical(ctx)) out.push('不過您要請員工或有實體店面，辦行號或公司比較方便投保、開戶與申請貸款。');
  } else if(s && s < NO_INVOICE){
    out.push('預估月營業額 ' + s + ' 萬元已達起徵點，必須辦商業或公司登記。未達 20 萬元可以申請免用統一發票，由國稅局查定、稅率 1%。');
  } else if(s >= NO_INVOICE){
    out.push('預估月營業額 ' + s + ' 萬元達 20 萬元以上，要使用統一發票（多半用電子發票），每兩個月自行申報營業稅。');
  }
  if(ctx.org === 'small' && s >= th) out.push('⚠ 您選了「小規模，先只辦稅籍」，但營業額已達起徵點，建議改成行號或公司。');
  if(staffN(ctx) >= 5 && ctx.org === 'small') out.push('⚠ 要請 5 人以上，建議至少辦行號。');
  return out;
}

function T(a){ return a; }
var TASKS = [
  /* ---------- 規劃 ---------- */
  T({id:'budget', ph:'plan', tag:'tip', o:[-120, -90], title:'算開店預算與周轉金',
    why:'裝潢、押金、設備、首批進貨之外，要留至少 6 個月的固定開銷當周轉金。很多店不是生意不好，是錢先用完。',
    where:'自己＋會計師或記帳士', prep:['租金、人事、水電的每月固定開銷', '設備與裝潢報價', '本工具「開辦預算」分頁可以直接算'],
    links:function(ctx){ return ctx.type === 'food' ? [L.feas] : []; }, when:function(){ return true; }}),
  T({id:'loan', ph:'plan', tag:'tip', o:[-120, -75], title:'看看能不能申請創業貸款',
    why:'鳳凰貸款、青年創業貸款等多半要在設立前後一定期間內申請，越早了解越好。',
    where:'勞動部、經濟部創業貸款窗口與往來銀行', prep:['身分證明', '營運計畫書草稿'], links:[L.loan], when:function(){ return true; }}),
  T({id:'zoning', ph:'plan', tag:'must', o:[-110, -80], title:'簽約前確認這個地點可以做這一行',
    why:'土地使用分區與建物使用執照的用途不符，可能登記不過、無法營業，甚至裝潢完才被要求停業。',
    where:'縣市政府都市發展局／建築管理處，或請房東提供使用執照',
    prep:['地址與地號', '建物使用執照（看「用途」欄）', '想做的營業項目'], links:[L.building], src:'建築法、各縣市土地使用分區管制規定',
    when:physical}),
  T({id:'name', ph:'plan', tag:'tip', o:[-110, -80], title:'店名與品牌名稱先查商標',
    why:'招牌、包裝、粉專做好才發現撞名被告，損失很大。登記名稱不等於商標權，品牌要另外申請商標。',
    where:'經濟部智慧財產局商標檢索系統', prep:['2～3 個備選店名', '想用的 Logo'], links:[L.tipo], when:function(){ return true; }}),
  T({id:'org', ph:'plan', tag:'must', o:[-100, -85], title:'決定登記型態：小規模、行號或公司',
    why:function(ctx){ return orgAdvice(ctx).join(''); },
    where:'自己決定，可以先問會計師或記帳士', prep:['預估每月營業額', '有沒有合夥人', '要不要請員工'],
    links:[L.biz, L.threshold], src:'商業登記法第 5 條、小規模營業人營業稅起徵點（2025-01-01 起）', when:function(){ return true; }}),

  /* ---------- 登記 ---------- */
  T({id:'prename', ph:'reg', tag:'must', o:[-90, -75], title:'名稱及所營事業登記預查',
    why:'同一縣市（行號）或全國（公司）不能有相同名稱，要先預查核准才能辦登記。',
    where:function(ctx){ return isCompany(ctx) ? '經濟部商業發展署（可走一站式線上申請）' : '所在地縣市政府（可走一站式線上申請）'; },
    prep:['5 個以內的備選名稱（依優先順序）', '營業項目代碼', '負責人身分證'], links:[L.onestop], src:'公司法、商業登記法',
    when:registered}),
  T({id:'capital', ph:'reg', tag:function(ctx){ return isCompany(ctx) ? 'must' : 'maybe'; }, o:[-80, -65], title:'資本額存入並由會計師查核',
    why:function(ctx){ return isCompany(ctx) ? '公司設立登記要附會計師查核簽證的資本額證明。先以籌備處名義開戶存入股款。' : '行號資本額達一定金額才需要會計師查核，金額門檻以登記機關規定為準，辦登記前先問清楚。'; },
    where:'銀行（籌備處帳戶）＋會計師', prep:['預查核准函', '股東身分證明', '存款證明'], links:[L.capital], src:'公司行號申請登記資本額查核辦法',
    when:registered}),
  T({id:'coreg', ph:'reg', tag:'must', o:[-70, -50], title:'公司設立登記',
    why:'公司要完成設立登記才算成立，拿到統一編號後才能開戶、投保、簽約。可以和稅籍登記一起申請。',
    where:'經濟部商業發展署或直轄市政府（可走一站式線上申請）',
    prep:['預查核准函', '章程', '股東同意書或股東會議事錄', '會計師資本額查核報告', '營業地址的建物所有權狀影本與房屋使用同意書'],
    links:[L.onestop, L.company], src:'公司法', when:isCompany}),
  T({id:'bizreg', ph:'reg', tag:'must', o:[-70, -50], title:'商業登記（行號）',
    why:'不符合免登記條件的獨資、合夥事業，開業前要辦商業登記，否則可能被處罰。可以和稅籍登記一起申請。',
    where:'所在地縣市政府（可走一站式線上申請）',
    prep:['預查核准函', '負責人（合夥人）身分證', '營業地址的建物所有權狀影本與房屋使用同意書', '合夥契約（合夥時）'],
    links:[L.onestop, L.biz], src:'商業登記法第 4、5、31 條', when:isFirm}),
  T({id:'taxreg', ph:'reg', tag:'must', o:[-60, -45], title:'稅籍登記',
    why:function(ctx){ return ctx.org === 'small' ? '就算免辦商業登記，只要有營業事實，開始營業前仍要向國稅局辦稅籍登記；月營業額未達起徵點免繳營業稅。' : '開始營業前要辦稅籍登記；公司或行號登記時可以一起申請，辦好就不必另外跑國稅局。'; },
    where:'所在地國稅局分局或稽徵所', prep:['負責人身分證', '營業地址證明', '公司或行號登記核准函（有登記時）'],
    links:[L.etax, L.vat], src:'加值型及非加值型營業稅法第 28 條', when:function(){ return true; }}),
  T({id:'invoice', ph:'reg', tag:'must', o:[-55, -40], title:function(ctx){ return +ctx.sales >= NO_INVOICE ? '申請使用統一發票（電子發票）' : '確認發票方式：免用統一發票或開立發票'; },
    why:function(ctx){ var s = +ctx.sales || 0;
      if(s >= NO_INVOICE) return '平均每月銷售額 20 萬元以上要使用統一發票，現在多半用電子發票。要先跟國稅局領用或設定好字軌，再接 POS。';
      return '平均每月銷售額未達 20 萬元，可由國稅局核定為免用統一發票的小規模營業人，每季依查定銷售額課 1%；未達起徵點免繳。但客人如果是公司要報帳，您可能需要開發票，先想好。'; },
    where:'所在地國稅局分局或稽徵所', prep:['稅籍登記資料', '預估銷售額'], links:[L.etax, L.threshold], src:'營業稅法第 23、32 條；小規模營業人起徵點', when:function(){ return true; }}),
  T({id:'bank', ph:'reg', tag:function(ctx){ return registered(ctx) ? 'must' : 'tip'; }, o:[-45, -35], title:function(ctx){ return registered(ctx) ? '開立公司或行號的銀行帳戶' : '另開一個營業專用帳戶'; },
    why:function(ctx){ return registered(ctx) ? '統一編號下來後開戶，收款、薪資轉帳與刷卡金流都要用。公私帳分開，記帳和報稅才不會亂。' : '雖然是用個人名義，營業收支和生活費分開，報稅與申請貸款都比較好整理。'; },
    where:'往來銀行', prep:['登記核准函', '負責人身分證與第二證件', '公司或行號大小章'], when:function(){ return true; }}),

  /* ---------- 店面 ---------- */
  T({id:'lease', ph:'shop', tag:'must', o:[-85, -70], title:'簽租約（先確認能登記、能裝修）',
    why:'租約要寫明可以當營業登記地址、可以裝修與掛招牌，並爭取裝修期免租。房東不同意登記就辦不了。',
    where:'房東或仲介', prep:['房屋使用同意書（房東簽）', '建物所有權狀影本', '裝修與招牌的書面同意'], when:function(ctx){ return ctx.place === 'rent'; }}),
  T({id:'reno', ph:'shop', tag:'maybe', o:[-70, -30], title:'室內裝修審查許可',
    why:'供公眾使用的建築物（例如一定面積以上的餐廳、店面）或變更隔間、防火避難設施時，裝修前要申請室內裝修審查，完工後再申請竣工查驗。要不要申請請先問建管單位或合格室內裝修業者。',
    where:'縣市政府建築管理處，或委託合格室內裝修業者代辦', prep:['平面圖與裝修圖說', '使用執照', '房東同意書'], links:[L.building], src:'建築法第 77-2 條',
    when:function(ctx){ return physical(ctx) && ctx.reno; }}),
  T({id:'fire', ph:'shop', tag:'maybe', o:[-50, -25], title:'消防設備與防火管理',
    why:'依場所類型與面積，要設滅火器、緊急照明、出口標示、偵煙器等；達一定規模還要設防火管理人。用瓦斯的餐飲店要特別注意。',
    where:'縣市政府消防局', prep:['平面圖', '營業面積與樓層', '用火用電設備清單'], src:'消防法、各類場所消防安全設備設置標準',
    when:physical}),
  T({id:'sign', ph:'shop', tag:'maybe', o:[-45, -25], title:'招牌廣告物申請',
    why:'招牌超過縣市規定的尺寸、或突出建築物、設在屋頂時，要先申請許可；違規招牌可能被要求拆除。',
    where:'縣市政府建築管理處（各縣市規定不同）', prep:['招牌設計圖與尺寸', '設置位置照片', '房東同意書'], src:'招牌廣告及樹立廣告管理辦法、各縣市自治法規',
    when:function(ctx){ return ctx.sign && ctx.place !== 'none'; }}),
  T({id:'utility', ph:'shop', tag:'tip', o:[-45, -25], title:'水電、瓦斯、網路、電話',
    why:'營業用電可能需要增設容量，申請要時間；網路與電話影響 POS、刷卡與外送接單。',
    where:'台電、自來水公司、瓦斯公司、電信業者', prep:['租約或所有權狀', '設備用電量'], when:function(ctx){ return ctx.place !== 'none' && ctx.place !== 'spot'; }}),
  T({id:'equip', ph:'shop', tag:'tip', o:[-40, -14], title:'設備採購與首批進貨',
    why:'設備交期可能很長，供應商要比價並談好付款條件；首批進貨量別一次壓太多現金。',
    where:'設備商、供應商', prep:['品項清單', '報價單', '交貨日期'], when:function(){ return true; }}),

  /* ---------- 人事與食安 ---------- */
  T({id:'hire', ph:'team', tag:'must', o:[-45, -14], title:'招募員工並簽勞動契約',
    why:'工時、工資（不得低於基本工資）、休假、試用期都寫清楚，可以減少日後爭議。',
    where:'自己＋勞動部台灣就業通或人力銀行', prep:['職缺說明', '勞動契約範本', '排班表'], links:[L.lsa], src:'勞動基準法',
    when:function(ctx){ return staffN(ctx) > 0; }}),
  T({id:'ins_ei', ph:'team', tag:'must', o:[-14, 0], title:'就業保險＋職災保險（到職當天加保）',
    why:'只要僱用 1 人以上，就是就業保險與勞工職業災害保險的強制投保單位，員工到職當天就要加保。',
    where:'勞動部勞工保險局', prep:['投保單位成立申請（第一次）', '員工身分證與到職日', '投保薪資'], links:[L.bliFaq, L.ei],
    src:'就業保險法第 5 條、勞工職業災害保險及保護法第 6 條', when:function(ctx){ return staffN(ctx) > 0; }}),
  T({id:'ins_li', ph:'team', tag:function(ctx){ return staffN(ctx) >= 5 ? 'must' : 'maybe'; }, o:[-14, 0], title:'勞工保險',
    why:function(ctx){ return staffN(ctx) >= 5 ? '僱用 5 人以上是勞保強制投保單位，全部員工到職當天要加保。' : '未滿 5 人不是勞保強制投保單位，但可以自願加保；一旦自願成立投保單位，就要幫全部員工加保。'; },
    where:'勞動部勞工保險局', prep:['員工身分證與到職日', '投保薪資'], links:[L.bliFaq, L.li], src:'勞工保險條例第 6、8 條',
    when:function(ctx){ return staffN(ctx) > 0; }}),
  T({id:'nhi', ph:'team', tag:function(ctx){ return registered(ctx) ? 'must' : 'maybe'; }, o:[-14, 0], title:function(ctx){ return staffN(ctx) > 0 ? '負責人與員工的健保投保' : '負責人健保投保身分'; },
    why:function(ctx){ var a = registered(ctx) ? '公司或行號負責人要以雇主或自營業主身分，由自己的事業單位投保健保。' : '只辦稅籍的小規模營業人，負責人健保身分（例如原本在職業工會或眷屬加保）請先問健保署確認要不要轉出。';
      return a + (staffN(ctx) > 0 ? '員工不論人數，到職就要加保。' : ''); },
    where:'衛生福利部中央健康保險署各分區業務組', prep:['投保單位成立申請', '負責人與員工身分證'], links:[L.nhi], src:'全民健康保險法第 10、15 條',
    when:function(){ return true; }}),
  T({id:'pension', ph:'team', tag:'must', o:[-14, 0], title:'勞工退休金提繳（每月至少 6%）',
    why:'適用勞基法的員工，雇主每月要依提繳工資提繳至少 6% 到員工的勞退個人專戶，和勞保一起向勞保局申報。',
    where:'勞動部勞工保險局', prep:['員工到職資料', '月提繳工資'], links:[L.pension], src:'勞工退休金條例第 6、14 條',
    when:function(ctx){ return staffN(ctx) > 0; }}),
  T({id:'rules', ph:'team', tag:'must', o:[-40, -7], title:'訂定工作規則並報主管機關核備',
    why:'僱用 30 人以上要訂工作規則，報當地主管機關核備後公開揭示。',
    where:'縣市政府勞動局（處）', prep:['工作規則草案', '員工人數證明'], links:[L.lsa], src:'勞動基準法第 70 條',
    when:function(ctx){ return staffN(ctx) >= 30; }}),
  T({id:'foodreg', ph:'team', tag:'must', o:[-40, -10], title:'食品業者登錄（非登不可）',
    why:'做餐飲、販售、製造加工食品的業者要先登錄才能營業。有商工登記用工商憑證登入，沒有商工登記可以用自然人憑證或健保卡。之後每年要上網確認一次，資料變更 30 天內要更新。',
    where:'食品業者登錄平台，或所在地衛生局', prep:['登記核准資料或稅籍資料', '工商憑證或自然人憑證', '營業地址與負責人資料'],
    links:[L.fadenbook, L.food], src:'食品安全衛生管理法第 8 條第 3 項', when:sellsFood}),
  T({id:'foodcheck', ph:'team', tag:'must', o:[-30, -7], title:'食品從業人員健康檢查',
    why:'接觸食品的人員（包括老闆自己）新進時要做健康檢查，之後每年檢查一次，合格才能上工。',
    where:'衛生局或醫療院所', prep:['身分證', '檢查項目依衛生局公告'], links:[L.food], src:'食品良好衛生規範準則',
    when:sellsFood}),
  T({id:'foodins', ph:'team', tag:'must', o:[-30, -7], title:'投保產品責任保險',
    why:'依衛福部 110 年 9 月 28 日公告，具商業、公司或工廠登記的餐飲業（以及製造加工、輸入業）要投保產品責任保險，並把保單上傳到食品業者登錄平台。最低保額：每人身體傷害 100 萬元、每一事故身體傷害 400 萬元、保險期間累計 1,000 萬元。',
    where:'產物保險公司', prep:['登記資料', '營業項目與營業額'], links:[L.liability, L.fadenbook], src:'食品安全衛生管理法第 13 條；衛授食字第 1101302156 號公告',
    when:function(ctx){ return sellsFood(ctx) && registered(ctx); }}),
  T({id:'chef', ph:'team', tag:'maybe', o:[-40, -10], title:'廚師證照比例與衛生講習',
    why:'部分餐飲業別要有一定比例的人員持有烹調技術士證，持證人員每年要上衛生講習。是否適用以衛生局認定為準。',
    where:'所在地衛生局', prep:['員工證照影本'], links:[L.food], src:'食品安全衛生管理法第 12 條及相關公告',
    when:function(ctx){ return ctx.type === 'food'; }}),
  T({id:'beauty', ph:'team', tag:'maybe', o:[-40, -10], title:'營業衛生規定（美容美髮）',
    why:'部分縣市的營業衛生自治條例要求美容美髮從業人員健康檢查、衛生講習，並規定器材消毒方式。',
    where:'所在地衛生局', prep:['從業人員名單', '消毒設備'], src:'各縣市營業衛生管理自治條例',
    when:function(ctx){ return ctx.type === 'beauty'; }}),
  T({id:'stall', ph:'team', tag:'must', o:[-45, -14], title:'攤販許可或市集報名',
    why:'固定地點擺攤要向縣市政府申請攤販許可（各縣市主管單位不同）；參加市集依主辦單位規定，常要附食品業者登錄字號與產品責任險。',
    where:'縣市政府市場處、經發局或警察局（依縣市而定），或市集主辦單位', prep:['身分證', '攤位位置', '販售品項'], src:'各縣市攤販管理自治法規',
    when:function(ctx){ return ctx.type === 'stall' || ctx.place === 'spot'; }}),

  /* ---------- 開幕準備 ---------- */
  T({id:'pos', ph:'open', tag:'tip', o:[-25, -10], title:'POS 收銀與發票設定',
    why:'菜單或商品、價格、稅別先建好，電子發票要和 POS 串接測試。',
    where:'POS 廠商', prep:['商品與價格表', '發票字軌或免用統一發票核定'], when:function(ctx){ return ctx.place !== 'none'; }}),
  T({id:'pay', ph:'open', tag:'tip', o:[-35, -14], title:'刷卡、行動支付與金流申請',
    why:'刷卡機、行動支付、網店金流審核要 1～3 週，越晚申請越可能開幕時收不了。',
    where:'收單銀行、行動支付或金流業者', prep:['登記資料', '銀行帳戶', '商品頁或店面照片'], when:function(){ return true; }}),
  T({id:'online', ph:'open', tag:'must', o:[-25, -7], title:'網路賣場必寫：退貨、七日解除權、聯絡資訊',
    why:'網路與通訊交易，消費者原則上可以在收到商品後 7 日內無理由解除契約，例外情形要事先清楚告知。也要寫清楚業者名稱、聯絡方式、退換貨流程。',
    where:'自己寫好放在賣場頁面', prep:['退換貨規則', '運費與付款方式', '聯絡資訊'], links:[L.cpa], src:'消費者保護法第 18、19 條',
    when:function(ctx){ return ctx.type === 'online'; }}),
  T({id:'privacy', ph:'open', tag:'must', o:[-25, -7], title:'會員個資告知與保管',
    why:'收集客人姓名、電話、生日等資料時，要告知蒐集目的、用途、保存期間與客人的權利；資料要妥善保管，外洩要負責。',
    where:'自己寫好放在加入會員或結帳頁', prep:['個資告知事項', '誰能看會員資料'], links:[L.pdpa], src:'個人資料保護法第 8 條',
    when:function(ctx){ return ctx.member || ctx.type === 'online'; }}),
  T({id:'music', ph:'open', tag:'must', o:[-21, -3], title:'店內播放音樂的授權',
    why:'在店裡用音響或電視播音樂給客人聽屬於「公開演出」，要取得著作權授權（例如向音樂著作權集體管理團體付費），或改用已授權給商業場所的音樂服務。',
    where:'音樂著作權集體管理團體、商用音樂服務業者', prep:['營業面積', '播放方式'], links:[L.copyright], src:'著作權法第 26、37 條',
    when:function(ctx){ return ctx.music && ctx.place !== 'none'; }}),
  T({id:'publicins', ph:'open', tag:'maybe', o:[-21, -7], title:'公共意外責任險',
    why:'客人在店內跌倒、受傷時的賠償。部分縣市對特定營業場所規定要投保，其他也強烈建議。',
    where:'產物保險公司', prep:['營業面積', '場所類型'], src:'各縣市自治法規',
    when:function(ctx){ return physical(ctx) || ctx.place === 'spot'; }}),
  T({id:'delivery', ph:'open', tag:'tip', o:[-25, -7], title:'外送平台上架',
    why:'平台審核與菜單上架需要時間；抽成比例要算進定價。多半會要求食品業者登錄字號。',
    where:'各外送平台', prep:['菜單與照片', '登記資料', '食品業者登錄字號'], when:function(ctx){ return ctx.delivery && sellsFood(ctx); }}),
  T({id:'promo', ph:'open', tag:'tip', o:[-30, -3], title:'開幕宣傳與社群經營',
    why:'Google 商家、粉專、LINE 官方帳號先開好，開幕前兩週開始預告，比開幕當天才宣傳有效。',
    where:'自己', prep:['店家照片', '開幕優惠', '營業時間'], links:[L.cal], when:function(){ return true; }}),
  T({id:'soft', ph:'open', tag:'tip', o:[-7, -2], title:'試營運',
    why:'邀親友試吃、試買，找出動線、出餐速度、收銀流程的問題，正式開幕才不會手忙腳亂。',
    where:'自己', prep:['試營運名單', '回饋表'], when:function(){ return true; }}),

  /* ---------- 開幕後 ---------- */
  T({id:'vatfile', ph:'after', tag:'must', o:[0, 75], title:function(ctx){ return +ctx.sales >= NO_INVOICE ? '每兩個月申報營業稅' : '留意國稅局寄來的營業稅繳款書'; },
    why:function(ctx){ return +ctx.sales >= NO_INVOICE ? '使用統一發票的營業人，每兩個月為一期，在單月 15 日前申報繳納上一期營業稅。沒有銷售也要申報。' : '小規模營業人由國稅局按季查定銷售額寄繳款書，稅率 1%；查定銷售額未達起徵點免繳。'; },
    where:'國稅局（可網路申報）', prep:['發票與進項憑證', '帳簿'], links:[L.etax, L.vat], src:'營業稅法第 35、40 條', when:function(){ return true; }}),
  T({id:'books', ph:'after', tag:'must', o:[0, 30], title:'記帳與每年 5 月所得稅結算',
    why:function(ctx){ return ctx.org === 'small' ? '小規模營利事業免辦營利事業所得稅結算申報，營業所得併入負責人綜合所得稅；收支還是要記清楚。' : '公司與行號每年 5 月辦營利事業所得稅結算申報（獨資、合夥的盈餘併入負責人綜合所得稅）。平時就要記帳、保留憑證，或委託記帳士。'; },
    where:'國稅局；可委託記帳士或會計師', prep:['收入與支出憑證', '進貨發票'], links:[L.income], src:'所得稅法第 71 條', when:function(){ return true; }}),
  T({id:'foodyear', ph:'after', tag:'must', o:[30, 365], title:'每年確認食品業者登錄資料',
    why:'每年 1 月 1 日到 12 月 31 日之間要上平台確認一次登錄內容；地址、負責人等資料變更 30 天內要更新。',
    where:'食品業者登錄平台', prep:['工商憑證或自然人憑證'], links:[L.fadenbook], src:'食品安全衛生管理法第 8 條', when:sellsFood}),
  T({id:'staffchg', ph:'after', tag:'must', o:[0, 365], title:'員工到職、離職當天辦加退保',
    why:'勞保、就保、職災、健保、勞退都要在到職當天加保、離職當天退保，晚加保要補繳並可能被罰。',
    where:'勞保局、健保署（可網路申報）', prep:['員工異動資料'], links:[L.bliFaq], when:function(ctx){ return staffN(ctx) > 0; }})
];

function val(v, ctx){ return typeof v === 'function' ? v(ctx) : v; }

/* 依開店設定產生任務清單（已解析文字，日期為 YYYY-MM-DD） */
function buildTasks(ctx){
  var open = parseDate(ctx.open);
  return TASKS.filter(function(t){ return t.when(ctx); }).map(function(t){
    return {id:t.id, ph:t.ph, tag:val(t.tag, ctx), title:val(t.title, ctx), why:val(t.why, ctx), where:val(t.where, ctx),
      prep:val(t.prep, ctx) || [], links:val(t.links, ctx) || [], src:val(t.src, ctx) || '',
      start:fmt(addDays(open, t.o[0])), end:fmt(addDays(open, t.o[1])), o:t.o.slice()};
  });
}
function parseDate(s){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if(!m) return null;
  var d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}
function addDays(d, n){ var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function fmt(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayDiff(a, b){ return Math.round((parseDate(b) - parseDate(a)) / 864e5); }

/* 範例（全部虛構） */
var EXAMPLES = [
  {key:'brunch', label:'巷口早午餐（有限公司、3 位員工）', ctx:{name:'晨光巷早午餐', type:'food', org:'ltd', sales:45, staff:'1-4', place:'rent', reno:true, sign:true, music:true, member:true, delivery:true, food:false}},
  {key:'craft', label:'手作飾品網店（小規模、只有自己）', ctx:{name:'小島手作', type:'online', org:'small', sales:6, staff:'0', place:'home', reno:false, sign:false, music:false, member:true, delivery:false, food:false}},
  {key:'salon', label:'社區髮廊（獨資行號、2 位員工）', ctx:{name:'剪剪髮藝', type:'beauty', org:'sole', sales:15, staff:'1-4', place:'rent', reno:true, sign:true, music:true, member:false, delivery:false, food:false}}
];

var DEFAULT_BUDGET = [
  {k:'deposit', n:'押金與第一個月租金', v:0},
  {k:'reno', n:'裝潢與招牌', v:0},
  {k:'equip', n:'設備與生財器具', v:0},
  {k:'stock', n:'首批進貨', v:0},
  {k:'fees', n:'登記規費、代辦與會計師', v:0},
  {k:'promo', n:'開幕宣傳', v:0}
];

/* 一句話描述 → 開店設定（規則式，不需 AI；AI 版在 ai.js）。回傳 {set:{…}, found:[說明]}，沒提到的欄位不放進 set */
var CN_NUM = {'一':1, '二':2, '兩':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10};
function cnInt(s){
  if(/^\d+$/.test(s)) return +s;
  if(s === '十') return 10;
  var m = /^([一二兩三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if(m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return CN_NUM[s] || null;
}
function staffBand(n){ return n <= 0 ? '0' : n < 5 ? '1-4' : n < 30 ? '5-29' : '30+'; }
function parseShopText(text, now){
  var s = String(text || '').replace(/\s+/g, ''), set = {}, found = [];
  if(!s) return {set:set, found:found};
  var FOOD = /餐|飲料|手搖|咖啡|早午餐|早餐|小吃|麵|便當|甜點|烘焙|麵包|蛋糕|火鍋|燒烤|酒吧|茶飲|飯糰|滷味|鹹酥雞|冰品|豆花|餅乾|點心|零食|果醬|果汁|飲品|食品|吃的|喝的/;
  var rules = [
    ['stall', /擺攤|攤位|攤販|市集|夜市|快閃|餐車/],
    ['online', /網店|網拍|網路商店|網路賣|網路上賣|線上賣|電商|蝦皮|官網|IG賣|團購|網購/],
    ['beauty', /美髮|髮廊|理髮|剪髮|美甲|美睫|美容|紋繡|做臉/],
    ['food', FOOD],
    ['service', /工作室|設計|攝影|維修|修理|清潔|顧問|接案|教室|家教|寵物美容|洗衣/],
    ['retail', /店|賣|販售|零售|雜貨|選物|服飾|花店|書店|文具/]
  ];
  for(var i = 0; i < rules.length; i++) if(rules[i][1].test(s)){ set.type = rules[i][0]; found.push('店型：' + TYPES[set.type].n); break; }
  if(set.type && set.type !== 'food' && FOOD.test(s)){ set.food = true; found.push('有賣吃的、喝的'); }
  // 員工
  if(/自己一個人|一個人做|一人|獨自|只有我|不請人|沒請人|不請員工|沒有員工/.test(s)){ set.staff = '0'; found.push('員工：只有自己'); }
  else {
    var re = /(\d+|[一二兩三四五六七八九十]{1,3})(?:個|位|名)?(?:正職|兼職|全職)?(?:員工|工讀生|店員|夥伴|人手|師傅|助理|設計師|廚師|服務生|員)/g, m, tot = 0, any = false;
    while((m = re.exec(s))){ var n = cnInt(m[1]); if(n != null){ tot += n; any = true; } }
    if(any){ set.staff = staffBand(tot); found.push('員工：約 ' + tot + ' 人（' + STAFF[set.staff] + '）'); }
  }
  // 營業額（換算成萬元）
  var sm = /(?:月營業額|月營收|營業額|營收|一個月|每個月|每月|月賣|月收入)(?:大概|大約|約|預估|預計|可以|能|有|是|做到|目標)*(\d+(?:\.\d+)?|[一二兩三四五六七八九十]{1,3})(萬|千|元)?/.exec(s);
  if(sm){
    var v = /^\d/.test(sm[1]) ? +sm[1] : cnInt(sm[1]), u = sm[2] || '萬';
    if(v != null){ var w = u === '萬' ? v : u === '千' ? v / 10 : v / 10000; set.sales = Math.round(w * 10) / 10; found.push('月營業額：約 ' + set.sales + ' 萬元'); }
  }
  // 場地
  if(set.type === 'online' && !/店面/.test(s)) set.place = /住家|家裡|在家|自宅/.test(s) ? 'home' : 'none';
  else if(set.type === 'stall') set.place = 'spot';
  else if(/自有|自己的店面|買的店面|家裡的店面|自家店面/.test(s)) set.place = 'own';
  else if(/租/.test(s)) set.place = 'rent';
  else if(/住家|家裡|在家|自宅/.test(s)) set.place = 'home';
  else if(/店面|開一家|開一間|開店/.test(s)) set.place = 'rent';
  if(set.place) found.push('場地：' + PLACES[set.place]);
  // 登記型態
  if(/股份有限公司/.test(s)) set.org = 'corp';
  else if(/有限公司|開公司|成立公司|公司/.test(s)) set.org = 'ltd';
  else if(/合夥|跟朋友一起|和朋友一起|跟朋友合開|和朋友合開|合開/.test(s)) set.org = 'partner';
  else if(/獨資|行號|商號/.test(s)) set.org = 'sole';
  else if(/小規模/.test(s)) set.org = 'small';
  if(set.org) found.push('登記型態：' + ORGS[set.org].n);
  // 其他狀況
  [['reno', /裝潢|裝修|隔間|改格局/, '要裝潢'], ['sign', /招牌/, '要掛招牌'], ['music', /音樂|放歌|背景音樂/, '店裡放音樂'],
   ['member', /會員|集點|客人資料|顧客資料/, '收集會員資料'], ['delivery', /外送|ubereats|uber|foodpanda|熊貓/i, '上外送平台']].forEach(function(f){ if(f[1].test(s)){ set[f[0]] = true; found.push(f[2]); } });
  // 店名
  var nm = /[「『“"]([^」』”"]{1,20})[」』”"]/.exec(s) || /(?:店名叫|店名是|店名|叫做|取名)[：:]?([^，,。；;！!？?、\s]{2,14})/.exec(s);
  if(nm){ set.name = nm[1]; found.push('店名：' + set.name); }
  // 開幕日
  now = now || new Date();
  var dm = /(\d{4})年(\d{1,2})月(?:(\d{1,2})[日號])?/.exec(s) || /(?:^|[^\d])(\d{1,2})月(?:(\d{1,2})[日號])?/.exec(s), od = null;
  var after = /(\d+|[一二兩三四五六七八九十]{1,3})個月後/.exec(s);
  if(after && cnInt(after[1])) od = addDays(now, cnInt(after[1]) * 30);
  else if(dm && dm.length === 4 && dm[0].indexOf('年') > 0) od = new Date(+dm[1], +dm[2] - 1, +(dm[3] || 1));
  else if(dm){ var mo = +dm[1], dy = +(dm[2] || 1); if(mo >= 1 && mo <= 12){ od = new Date(now.getFullYear(), mo - 1, dy); if(od < now) od = new Date(now.getFullYear() + 1, mo - 1, dy); } }
  if(od && !isNaN(od)){ set.open = fmt(od); found.push('開幕日：' + set.open); }
  return {set:set, found:found};
}

var api = {parseShopText:parseShopText, cnInt:cnInt,
  L:L, TYPES:TYPES, ORGS:ORGS, STAFF:STAFF, PLACES:PLACES, PHASES:PHASES, TASKS:TASKS, EXAMPLES:EXAMPLES, DEFAULT_BUDGET:DEFAULT_BUDGET,
  threshold:threshold, NO_INVOICE:NO_INVOICE, staffN:staffN, sellsFood:sellsFood, orgAdvice:orgAdvice, buildTasks:buildTasks,
  parseDate:parseDate, addDays:addDays, fmt:fmt, dayDiff:dayDiff, under:under};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.SOC = api;
})(this);
