/* 開店前置清單：AI 助手（自備金鑰 BYOK）。
 * 原則：要辦哪些項目、門檻、期限一律由 data.js 規則引擎決定，AI 只做「聽懂使用者的話」「個案說明」「寫文件」。
 * 沒有金鑰也能用：每個功能都有規則式結果或「複製提示詞」。金鑰只存在這台瀏覽器（localStorage soc.ai）。 */
(function(){
'use strict';
var A = window.SOC_APP, D = window.SOC;
if(!A || !D) return;
var $ = function(id){ return document.getElementById(id); };
var esc = A.esc;

/* ---------- 服務商（沿用 skill-prompt-studio 的寫法） ---------- */
function geminiModelFix(m){ var r = {'gemini-2.5-flash':'gemini-3.6-flash', 'gemini-2.5-flash-lite':'gemini-3.5-flash-lite', 'gemini-2.5-pro':'gemini-3.8-flash', 'gemini-2.0-flash':'gemini-3.6-flash', 'gemini-2.0-flash-001':'gemini-3.6-flash', 'gemini-2.0-flash-lite':'gemini-3.1-flash-lite', 'gemini-1.5-flash':'gemini-3.6-flash', 'gemini-1.5-pro':'gemini-3.1-pro-preview', 'gemini-3-pro':'gemini-3.1-pro-preview', 'gemini-3-pro-preview':'gemini-3.1-pro-preview', 'gemini-3.5-pro':'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview':'gemini-3.1-flash-lite'}; m = String(m || '').trim().replace(/^models\//, ''); return r[m] || m; }
var PROVIDERS = {
  gemini: {label:'Gemini（Google AI Studio）', vision:true, models:[['gemini-3.5-flash', 'Gemini 3.5 Flash（均衡，推薦）'], ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro 預覽版（最強）'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite（快速省錢）']]},
  openai: {label:'OpenAI', vision:true, url:'https://api.openai.com/v1/chat/completions', models:[['gpt-5-mini', 'GPT-5 mini（均衡，推薦）'], ['gpt-5', 'GPT-5（最強）'], ['gpt-4o-mini', 'GPT-4o mini（快速省錢）']]},
  claude: {label:'Claude（Anthropic）', vision:true, models:[['claude-sonnet-5-5', 'Claude Sonnet 5.5（均衡，推薦）'], ['claude-opus-5-5', 'Claude Opus 5.5（最強）'], ['claude-haiku-5-5', 'Claude Haiku 5.5（快速省錢）']]},
  openrouter: {label:'OpenRouter', vision:true, url:'https://openrouter.ai/api/v1/chat/completions', models:[['openai/gpt-4o-mini', 'OpenAI GPT-4o mini（推薦）'], ['google/gemini-2.5-flash', 'Google Gemini 2.5 Flash'], ['anthropic/claude-sonnet-4.5', 'Anthropic Claude Sonnet 4.5']]},
  xai: {label:'xAI Grok', vision:true, url:'https://api.x.ai/v1/chat/completions', models:[['grok-4', 'Grok 4'], ['grok-3-mini', 'Grok 3 mini（不支援看圖）']]},
  deepseek: {label:'DeepSeek（只支援文字）', vision:false, url:'https://api.deepseek.com/chat/completions', models:[['deepseek-chat', 'DeepSeek Chat（推薦）'], ['deepseek-reasoner', 'DeepSeek Reasoner（推理）']]},
  custom: {label:'自訂（OpenAI 相容端點，例如 Ollama、LM Studio）', vision:true, models:[]}
};
function cfg(){ var c = A.lsJson('ai', {}); if(!PROVIDERS[c.provider]) c.provider = 'gemini'; return c; }
function aiModel(c){ c = c || cfg(); return (c.modelCustom || '').trim() || c.model || ((PROVIDERS[c.provider].models[0]) || [''])[0]; }
function customUrl(base){ base = (base || '').trim().replace(/\/+$/, ''); return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'; }
function ready(){ var c = cfg(); return c.provider === 'custom' ? !!(c.base || '').trim() && !!aiModel(c) : !!c.key; }
function status(){ var c = cfg(); return ready() ? PROVIDERS[c.provider].label.replace(/（.*/, '') + '・' + aiModel(c) : '未設定'; }

async function callLLM(prompt, images, wantJson, onStatus){
  var c = cfg(), provider = c.provider, model = aiModel(c), key = c.key, url, headers, body, extract;
  images = PROVIDERS[provider].vision === false ? [] : (images || []);
  if(provider === 'claude'){
    url = 'https://api.anthropic.com/v1/messages';
    headers = {'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'};
    var content = images.map(function(im){ return {type:'image', source:{type:'base64', media_type:im.mime, data:im.b64}}; });
    content.push({type:'text', text:prompt});
    body = {model:model, max_tokens:4000, messages:[{role:'user', content:content}]};
    extract = function(d){ return (d.content || []).filter(function(b){ return b.type === 'text'; }).map(function(b){ return b.text; }).join(''); };
  } else if(provider !== 'gemini'){
    url = provider === 'custom' ? customUrl(c.base) : PROVIDERS[provider].url;
    headers = {'content-type':'application/json'};
    if(key) headers.authorization = 'Bearer ' + key;
    var msg = images.length ? [{type:'text', text:prompt}].concat(images.map(function(im){ return {type:'image_url', image_url:{url:im.dataUrl}}; })) : prompt;
    body = {model:model, messages:[{role:'user', content:msg}]};
    extract = function(d){ return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content; };
  } else {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModelFix(model)) + ':generateContent';
    headers = {'content-type':'application/json', 'x-goog-api-key':key};
    var parts = images.map(function(im){ return {inline_data:{mime_type:im.mime, data:im.b64}}; });
    parts.push({text:prompt});
    body = {contents:[{parts:parts}]};
    if(wantJson) body.generationConfig = {responseMimeType:'application/json'};
    extract = function(d){ var ps = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []; return ps.map(function(p){ return p.text || ''; }).join(''); };
  }
  for(var attempt = 1; attempt <= 3; attempt++){
    var resp = await fetch(url, {method:'POST', headers:headers, body:JSON.stringify(body), signal:AbortSignal.timeout(150000)});
    var raw = await resp.text();
    if(resp.ok){ var t = extract(JSON.parse(raw)); if(!t) throw new Error('回應中沒有文字內容'); return t; }
    var em = raw.slice(0, 200);
    try{ var e = JSON.parse(raw); em = (e.error && e.error.message) || e.message || em; }catch(x){}
    if({429:1, 500:1, 503:1, 529:1}[resp.status] && attempt < 3){ if(onStatus) onStatus('服務忙碌（' + resp.status + '），' + attempt * 6 + ' 秒後重試…'); await new Promise(function(r){ setTimeout(r, attempt * 6000); }); continue; }
    throw new Error('HTTP ' + resp.status + '：' + em);
  }
}
function parseJson(txt){ var s = txt.indexOf('{'), e = txt.lastIndexOf('}'); if(s < 0 || e < s) throw new Error('AI 回傳的不是 JSON'); return JSON.parse(txt.slice(s, e + 1)); }
function arr(v){ return Array.isArray(v) ? v.map(function(x){ return typeof x === 'string' ? x : JSON.stringify(x); }).filter(Boolean) : (v ? [String(v)] : []); }
function str(v, n){ return typeof v === 'string' ? v.slice(0, n || 4000) : ''; }

/* ---------- 共用的事實與規則 ---------- */
var RULES = '你是協助台灣小店創業者的開店顧問。請遵守：\n' +
  '1. 一律使用繁體中文（台灣用語），口吻親切、具體、短句。\n' +
  '2. 依台灣現行規定回答；不確定的事要直說「不確定」，並指出該向哪個機關或專業人士確認。\n' +
  '3. 不得編造法條條號、金額、期限、電話、網址或機關名稱；不知道的數字用【請查證】標示。\n' +
  '4. 涉及法律、稅務、勞動、建築、消防、食安的判斷，最後提醒以主管機關最新公告為準。\n' +
  '5. 要辦哪些項目、期限，以下方「開店前置清單」規則引擎的結果為準，不要自行增刪必辦項目。\n';
function facts(){
  var S = A.S, c = S.ctx, ts = A.allTasks(), st = A.stats(ts), bt = A.budgetTotals();
  return '【開店條件】' + A.ctxLine(c) + '；店名：' + (c.name || '未定') + '；預計開幕：' + c.open + '（今天 ' + A.today() + '）' +
    (c.reno ? '；要裝潢' : '') + (c.sign ? '；要掛招牌' : '') + (c.music ? '；店內放音樂' : '') + (c.member ? '；收集會員資料' : '') + (c.food ? '；有賣吃的喝的' : '') + (c.delivery ? '；上外送平台' : '') + '\n' +
    '【進度】完成 ' + st.done + '/' + st.total + '，逾期 ' + st.late + ' 項，必辦未完成 ' + st.mustLeft + ' 項\n' +
    (bt.total ? '【開辦預算】總共需要 ' + A.money(bt.total) + ' 元（含周轉金 ' + A.money(bt.reserve) + ' 元），自有資金＋貸款 ' + A.money(bt.fund) + ' 元\n' : '');
}
function taskLine(t){ return '- ' + t.title + '（' + A.TAGN[t.tag] + '，建議 ' + A.md(t.start) + '～' + A.md(t.end) + '，' + {done:'已完成', late:'已逾期', now:'現在該辦', later:'還沒到'}[A.status(t)] + '）'; }

/* ---------- 狀態（輸入與結果存本機，換頁不會不見） ---------- */
var F = A.lsJson('aiform', {}), O = A.lsJson('aiout', {});
function saveF(){ A.lsSet('aiform', JSON.stringify(F)); }
function saveO(){ A.lsSet('aiout', JSON.stringify(O)); }
var busy = {};
function setMsg(id, m, err){ var e = $(id); if(e){ e.textContent = m || ''; e.style.color = err ? 'var(--must)' : ''; } }
async function run(key, msgId, fn){
  if(busy[key]) return;
  if(!ready()){ A.toast('請先在「⚙ 常用設定 → 🤖 AI 設定」填入金鑰；沒有金鑰可以按「複製提示詞」'); A.openSettings(); openSec('ai'); return; }
  busy[key] = true; setMsg(msgId, 'AI 思考中…（約 10～40 秒）');
  try{ await fn(function(m){ setMsg(msgId, m); }); setMsg(msgId, '完成。AI 內容僅供參考，請自行查證。'); }
  catch(e){ setMsg(msgId, '失敗：' + (e && e.message || e), true); }
  busy[key] = false;
}
function copyPrompt(p, extra){ A.copyText(p); if(extra) setTimeout(function(){ A.toast(extra); }, 1800); }
function openSec(id){ setTimeout(function(){ var d = document.querySelector('.set-sec[data-sec="' + id + '"]'); if(d){ d.open = true; d.scrollIntoView({block:'start'}); } }, 30); }

/* ================= 1. 一句話設定 ================= */
var nl = {text:'', found:''};
function setupBox(){
  return '<div class="aibox"><b>💬 用一句話描述你的店（可選）</b>' +
    '<textarea id="nlText" rows="2" placeholder="例如：我想在新北租店面開手搖飲，請 2 個工讀生，月營業額大概 15 萬，明年 3 月開幕，要上外送">' + esc(nl.text) + '</textarea>' +
    '<div class="go" style="margin-top:.4rem"><button type="button" class="btn alt" data-ai-nl="rule">🔍 幫我填（免金鑰）</button><button type="button" class="btn alt" data-ai-nl="ai">✨ AI 幫我填</button></div>' +
    '<p class="small" id="nlFound">' + nl.found + '</p><p class="small">填好後請檢查下面每一格，有錯直接點選修改。</p></div>';
}
function nlPrompt(text){
  return RULES + '\n請把使用者描述的開店計畫轉成 JSON，只輸出 JSON。沒提到或無法判斷的欄位填 null，不要猜。\n' +
    '今天是 ' + A.today() + '。\n格式：{"name":店名或null,"type":"food|retail|online|beauty|service|stall","org":"small|sole|partner|ltd|corp","sales":每月營業額（萬元，數字）,' +
    '"staff":"0|1-4|5-29|30+","place":"rent|own|home|none|spot","open":"YYYY-MM-DD","reno":布林,"sign":布林,"music":布林,"member":布林,"delivery":布林,"food":布林,"unsure":["描述裡沒說清楚、建議使用者再確認的事"]}\n' +
    'type 說明：food 餐飲飲料店、retail 零售實體店、online 網路商店、beauty 美容美髮美甲、service 工作室或服務業、stall 攤販市集。org：small 小規模只辦稅籍、sole 獨資行號、partner 合夥、ltd 有限公司、corp 股份有限公司。place：rent 租店面、own 自有店面、home 住家、none 沒有實體店、spot 攤位市集。food 指非餐飲店型但也賣吃的喝的。\n\n使用者描述：' + text;
}
function applyNl(set, found, extra){
  var n = Object.keys(set).length;
  nl.found = n ? '✓ 抓到：' + found.map(esc).join('、') + (extra || '') : '沒有抓到可以填的內容，請再多寫一點（店型、員工、營業額、開幕月份）。';
  A.applyDraft(set);
}
function cleanAiCtx(j){
  var o = {}, f = [];
  if(typeof j.name === 'string' && j.name.trim()){ o.name = j.name.trim().slice(0, 30); f.push('店名：' + o.name); }
  [['type', D.TYPES, '店型'], ['org', D.ORGS, '登記型態'], ['staff', D.STAFF, '員工'], ['place', D.PLACES, '場地']].forEach(function(k){
    var v = j[k[0]]; if(v != null && Object.prototype.hasOwnProperty.call(k[1], v)){ o[k[0]] = v; var m = k[1][v]; f.push(k[2] + '：' + (typeof m === 'string' ? m : m.n)); }
  });
  if(typeof j.sales === 'number' && j.sales >= 0 && j.sales < 100000){ o.sales = Math.round(j.sales * 10) / 10; f.push('月營業額：約 ' + o.sales + ' 萬'); }
  if(D.parseDate(j.open)){ o.open = j.open; f.push('開幕日：' + j.open); }
  ['reno', 'sign', 'music', 'member', 'delivery', 'food'].forEach(function(k){ if(typeof j[k] === 'boolean'){ o[k] = j[k]; } });
  return {set:o, found:f, unsure:arr(j.unsure).slice(0, 5)};
}

/* ================= 2. 每一項問 AI ================= */
var ASK_CHIPS = ['以我的狀況，這一項一定要辦嗎？', '要準備哪些文件？大概多久辦好？', '大概要花多少錢？', '如果沒辦或晚辦會怎樣？', '可以委託別人代辦嗎？'];
function agencyQs(t){   // 規則式：打電話問承辦人的問題（免金鑰）
  var c = A.S.ctx;
  return ['我是' + D.TYPES[c.type].n + '，' + D.ORGS[c.org].n + '，' + D.PLACES[c.place] + (D.staffN(c) ? '，要請 ' + D.STAFF[c.staff] : '') + '，請問「' + t.title + '」我需要辦嗎？',
    '要準備哪些文件？可以線上申請，還是要臨櫃？',
    '從送件到核准大約要多久？有沒有規費？',
    t.tag === 'maybe' ? '有沒有面積、人數或用途上的門檻，讓我可以先自己判斷？' : '辦好之後，有沒有每年要更新或申報的事？'];
}
function askPrompt(t, q){
  return RULES + '\n' + facts() + '\n【這一項】' + t.title + '（' + A.TAGN[t.tag] + '）\n說明：' + t.why + '\n去哪辦：' + t.where +
    (t.prep.length ? '\n要準備：' + t.prep.join('、') : '') + (t.src ? '\n依據：' + t.src : '') +
    '\n\n【使用者的問題】' + q + '\n\n請只輸出 JSON：{"answer":"針對使用者狀況的回答，300 字內","ask":["打電話問承辦人時可以問的 3 個具體問題"],"docs":["可能要準備的文件"],"caution":"一句提醒"}';
}
function openAsk(id){
  var t = A.allTasks().filter(function(x){ return x.id === id; })[0]; if(!t) return;
  var prev = O['ask_' + id];
  A.openModal('<h2>🤖 問 AI：' + esc(t.title) + '</h2>' +
    '<p class="small">AI 會參考你的開店條件和這一項的說明來回答，內容僅供參考，最後仍以承辦機關說法為準。' + (ready() ? '' : '<b>還沒設定金鑰</b>：可以按「複製提示詞」貼到 ChatGPT 或 Gemini。') + '</p>' +
    '<div class="chips" style="margin:.4rem 0">' + ASK_CHIPS.map(function(c){ return '<button class="chip" data-ai-chip="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
    '<div class="mini"><textarea id="askQ" rows="2" placeholder="例如：我的店在住家一樓，要申請室內裝修審查嗎？">' + esc(prev ? prev.q : '') + '</textarea></div>' +
    '<div class="stack" style="grid-template-columns:1fr 1fr"><button class="btn" data-ai-askgo="' + id + '">✨ 問 AI</button><button class="btn alt" data-ai-askcopy="' + id + '">📋 複製提示詞</button></div>' +
    '<p class="small" id="askMsg"></p><div id="askOut">' + (prev ? askOutHtml(prev.r) : '') + '</div>' +
    '<div class="aiout"><b>☎ 打電話問承辦人可以這樣問（免金鑰）</b><ol>' + agencyQs(t).map(function(q){ return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></div>' +
    '<div class="stack"><button class="btn alt" data-act="close">關閉</button></div>');
}
function askOutHtml(r){
  return '<div class="aiout"><p>' + esc(r.answer).replace(/\n/g, '<br>') + '</p>' +
    (r.ask.length ? '<b>☎ 可以問承辦人</b><ol>' + r.ask.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
    (r.docs.length ? '<b>📎 可能要準備</b><ul>' + r.docs.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    (r.caution ? '<p class="small">⚠ ' + esc(r.caution) + '</p>' : '') + '<button class="ibtn" data-ai-tonote="1">📝 把重點存到這一項的備註</button></div>';
}
var askCur = null;

/* ================= 3～8. AI 助手分頁 ================= */
var DOCS = [
  {k:'landlord', n:'給房東的確認清單（可登記、可裝修、招牌、免租期）', when:function(c){ return c.place === 'rent'; }},
  {k:'refund', n:'網路賣場退換貨與七日解除權說明', when:function(c){ return c.type === 'online'; }},
  {k:'privacy', n:'會員個資蒐集告知事項', when:function(c){ return c.member || c.type === 'online'; }},
  {k:'labor', n:'勞動契約重點清單（給員工簽約前對照）', when:function(c){ return D.staffN(c) > 0; }},
  {k:'partner', n:'合夥協議大綱', when:function(c){ return c.org === 'partner'; }},
  {k:'rules', n:'工作規則大綱（30 人以上要報核備）', when:function(c){ return D.staffN(c) >= 30; }},
  {k:'notice', n:'店內公告（營業時間、付款方式、注意事項）', when:function(c){ return c.place !== 'none'; }},
  {k:'calls', n:'打電話給各承辦單位的問句稿', when:function(){ return true; }}
];
function docPrompt(k, extra){
  var d = DOCS.filter(function(x){ return x.k === k; })[0];
  return RULES + '\n' + facts() + '\n請幫我寫一份「' + d.n + '」草稿。\n要求：直接輸出文件內容（純文字，可用條列與小標），不要開場白；我需要自己填的地方用【】標示（例如【店名】【日期】）；' +
    '涉及法律效力的條款要寫得保守，不要承諾法律沒有要求的事；最後一行寫「本草稿僅供參考，正式使用前請由律師、會計師或主管機關確認」。' +
    (k === 'calls' ? '\n請依下面這些還沒完成的項目，按機關分組，每個機關寫 3～5 句要問的話：\n' + A.allTasks().filter(function(t){ return A.status(t) !== 'done' && t.tag !== 'tip'; }).map(function(t){ return '- ' + t.title + '（' + t.where + '）'; }).join('\n') : '') +
    (extra ? '\n\n補充說明：' + extra : '');
}
var PLAN_FIELDS = [
  ['productService', '產品或服務內容'], ['businessHours', '營業時間與營運方式'], ['customerSource', '客源與行銷方式'],
  ['targetMarketAnalysis', '目標市場與競爭分析'], ['marketOutlook', '市場潛力與未來規劃']
];
function planPrompt(){
  return RULES + '\n' + facts() + '\n請依下面資料，寫「微型創業鳳凰貸款」創業貸款計畫書的五個段落。要求：第一人稱、口語但專業、每段 120～250 字；' +
    '不得捏造數字、店址、證照或客戶名稱，資料不足處用【請補充：…】標示；不要寫貸款金額與還款試算（另有工具計算）。\n' +
    '主要產品或服務：' + (F.product || '【未填】') + '\n營業時間：' + (F.hours || '【未填】') + '\n目標客群：' + (F.customer || '【未填】') + '\n我的優勢或經驗：' + (F.edge || '【未填】') + '\n其他補充：' + (F.planNote || '無') +
    '\n\n只輸出 JSON：{' + PLAN_FIELDS.map(function(f){ return '"' + f[0] + '":"' + f[1] + '"'; }).join(',') + '}';
}
function priorityRule(){
  var ts = A.allTasks().filter(function(t){ return A.status(t) !== 'done'; });
  var late = ts.filter(function(t){ return A.status(t) === 'late'; }).sort(function(a, b){ return (a.tag === 'must' ? 0 : 1) - (b.tag === 'must' ? 0 : 1) || (a.end < b.end ? -1 : 1); });
  var now = ts.filter(function(t){ return A.status(t) === 'now'; }).sort(function(a, b){ return a.end < b.end ? -1 : 1; });
  return {late:late, now:now, rest:ts.length - late.length - now.length};
}
function priorityPrompt(){
  var r = priorityRule();
  return RULES + '\n' + facts() + '\n下面是還沒完成的項目。請幫我排出接下來兩週的優先順序，說明哪些可以同時辦（例如同一天跑同一個機關）、哪些有先後關係、開幕日是否太趕。\n' +
    '已逾期：\n' + (r.late.map(taskLine).join('\n') || '（無）') + '\n現在該辦：\n' + (r.now.map(taskLine).join('\n') || '（無）') +
    '\n\n只輸出 JSON：{"summary":"一段總評，100 字內","steps":[{"when":"第幾天或哪一週","todo":"要做什麼","why":"為什麼排這裡"}],"parallel":["可以一起辦的組合"],"delay":"如果來不及，開幕日要不要延後的建議"}';
}
function progressText(){
  var S = A.S, c = S.ctx, ts = A.allTasks(), st = A.stats(ts), dd = D.dayDiff(A.today(), c.open), wk = D.fmt(D.addDays(new Date(), -7));
  var recent = ts.filter(function(t){ return S.done[t.id] && S.done[t.id] >= wk; });
  var r = priorityRule(), next = r.late.concat(r.now).slice(0, 5);
  return '【' + (c.name || '我的店') + '】開店進度（' + A.today() + '）\n' +
    '距離開幕 ' + (dd >= 0 ? dd + ' 天' : '已開幕') + '，完成 ' + st.done + '/' + st.total + ' 項' + (st.late ? '，有 ' + st.late + ' 項逾期' : '') + '。\n' +
    (recent.length ? '\n✅ 這週完成：\n' + recent.map(function(t){ return '・' + t.title; }).join('\n') + '\n' : '') +
    (next.length ? '\n📌 接下來要做：\n' + next.map(function(t){ return '・' + t.title + '（' + (A.status(t) === 'late' ? '已逾期' : '截止 ' + A.md(t.end)) + '）'; }).join('\n') + '\n' : '') +
    (r.late.length ? '\n需要幫忙的地方：' + r.late.slice(0, 2).map(function(t){ return t.title; }).join('、') + ' 已經超過建議時間。' : '');
}
function progressPrompt(){ return RULES + '\n請把下面的開店進度改寫成適合傳 LINE 給合夥人或記帳士的訊息：親切、分段清楚、200 字內、可以用少量 emoji，不要增加原文沒有的事實。只輸出訊息本身。\n\n' + (F.progress || progressText()); }
function photoPrompt(){
  return RULES + '\n' + facts() + '\n使用者上傳一張照片（可能是租約、建物使用執照、建物謄本或房屋稅單）。請辨識內容並檢查跟開店有關的風險。照片看不清楚的地方寫「看不清楚」，不要猜。\n' +
    '只輸出 JSON：{"docType":"文件種類","fields":{"地址":"","用途":"使用執照或謄本上的用途","面積":"","樓層":"","租期":"","租金":"","其他":""},' +
    '"register":"可以|不行|沒寫|不適用（租約是否允許作為營業登記地址）","renovation":"可以|不行|沒寫|不適用（是否允許裝修）","sign":"可以|不行|沒寫|不適用（是否允許掛招牌）",' +
    '"risks":["跟開店有關的風險，例如用途不符、沒寫可登記"],"askLandlord":["簽約前要跟房東確認的事"]}';
}
function promoPrompt(){
  var c = A.S.ctx;
  return RULES + '\n' + facts() + '\n請幫這家店想開幕宣傳。' + (c.name ? '店名已定為「' + c.name + '」，不用再取名。' : '店名還沒定，請先提 5 個好記、跟店型有關的店名（並提醒要到經濟部智慧財產局查商標）。') +
    '\n店的特色：' + (F.feature || '【未填】') + '\n開幕優惠：' + (F.offer || '【未填】') +
    '\n不要使用誇大不實或保證療效、保證收益的字眼；不要寫原文沒有的價格。\n只輸出 JSON：{"names":[{"name":"","why":""}],"slogans":["3 句標語"],"posts":[{"platform":"Facebook|Instagram|LINE 官方帳號|Google 商家","text":"貼文內容"}],"tips":["開幕前兩週可以做的 3 件宣傳小事"]}';
}

function card(id, title, desc, body){ return '<section class="aicard" id="card_' + id + '"><h3>' + title + '</h3>' + (desc ? '<p class="small">' + desc + '</p>' : '') + body + '</section>'; }
function btns(key, aiLabel){ return '<div class="go"><button class="btn" data-ai-go="' + key + '">✨ ' + aiLabel + '</button><button class="btn alt" data-ai-copy="' + key + '">📋 複製提示詞</button></div><p class="small" id="msg_' + key + '"></p>'; }
function field(k, label, ph, rows){ return '<label class="fld">' + label + (rows ? '<textarea data-ai-f="' + k + '" rows="' + rows + '" placeholder="' + esc(ph) + '">' + esc(F[k] || '') + '</textarea>' : '<input data-ai-f="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(F[k] || '') + '">') + '</label>'; }
function panel(){
  var c = A.S.ctx, docs = DOCS.filter(function(d){ return d.when(c); });
  if(!F.doc || !docs.some(function(d){ return d.k === F.doc; })) F.doc = docs[0].k;
  var r = priorityRule(), plan = A.lsJson('aiplan', {});
  var h = '<div class="aihead"><p><b>AI 狀態：</b>' + (ready() ? '✓ ' + esc(status()) : '還沒設定金鑰') + '　<button class="ibtn" data-ai-settings="1">⚙ AI 設定</button></p>' +
    '<p class="small">要辦哪些項目、期限，仍以清單的規則為準；AI 只幫你說明與寫文件，內容僅供參考。按「✨」時，你的開店條件與這張卡片填的內容會送到你選的 AI 服務商。沒有金鑰也可以按「📋 複製提示詞」，貼到 ChatGPT 或 Gemini 使用。</p></div>';
  // 文件草稿
  h += card('doc', '📄 文件草稿', '依你的開店條件，只列出用得到的文件。', '<div class="mini"><select data-ai-f="doc">' + docs.map(function(d){ return '<option value="' + d.k + '"' + (d.k === F.doc ? ' selected' : '') + '>' + esc(d.n) + '</option>'; }).join('') + '</select></div>' +
    field('docNote', '補充說明（選填）', '例如：只接受轉帳、週一公休', 2) + btns('doc', '產生草稿') + outText('doc'));
  // 營運計畫書＋鳳凰貸款
  h += card('plan', '🏦 營運計畫書段落 → 鳳凰貸款申請書', '寫好的段落可以一鍵帶到「微型創業鳳凰貸款申請書產生器」，連同登記型態、開辦預算、資金用途一起帶過去。',
    '<div class="row2">' + field('product', '主要產品或服務', '例如：早午餐、手沖咖啡') + field('hours', '營業時間', '例如：週二到週日 7:00–14:00') + '</div>' +
    '<div class="row2">' + field('customer', '目標客群', '例如：附近上班族、學生') + field('edge', '我的優勢或經驗', '例如：做過 5 年咖啡師') + '</div>' +
    field('planNote', '其他補充（選填）', '', 2) + btns('plan', '寫成計畫書段落') +
    PLAN_FIELDS.map(function(f){ return '<label class="fld">' + f[1] + '<textarea data-ai-plan="' + f[0] + '" rows="4">' + esc(plan[f[0]] || '') + '</textarea></label>'; }).join('') +
    '<div class="go"><button class="btn" data-ai-phoenix="1">➡ 帶到鳳凰貸款申請書產生器</button></div><p class="small" id="phoenixMsg">' + phoenixSummary() + '</p>');
  // 優先順序
  h += card('prio', '🧭 接下來先做什麼', '下面的清單是規則排的（逾期的必辦排最前面）；AI 會再幫你看哪些可以同一天辦、開幕日會不會太趕。',
    '<div class="aiout"><b>規則排序（免金鑰）</b>' + (r.late.length + r.now.length ? '<ol>' + r.late.concat(r.now).slice(0, 8).map(function(t){ return '<li>' + esc(t.title) + '　<span class="small">' + (A.status(t) === 'late' ? '⚠ 已逾期' : '截止 ' + A.md(t.end)) + '・' + A.TAGN[t.tag] + '</span></li>'; }).join('') + '</ol>' : '<p class="small">目前沒有逾期或該辦的項目 👍</p>') + '</div>' +
    btns('prio', 'AI 幫我排兩週計畫') + '<div id="out_prio">' + (O.prio ? prioHtml(O.prio) : '') + '</div>');
  // 進度摘要
  h += card('prog', '💬 進度摘要（傳 LINE 給合夥人或記帳士）', '先用規則整理，可以直接改；想要口吻自然一點再按 AI 改寫。',
    '<div class="mini"><textarea data-ai-f="progress" rows="8">' + esc(F.progress || progressText()) + '</textarea></div>' +
    '<div class="go"><button class="btn alt" data-ai-progreset="1">↻ 重新整理成最新進度</button><button class="btn alt" data-ai-copyfield="progress">📋 複製</button></div>' + btns('prog', 'AI 改寫成 LINE 口吻'));
  // 拍照辨識
  h += card('photo', '📷 拍照檢查租約或使用執照', '上傳租約、建物使用執照或謄本的照片，AI 會抓出用途、地址，並檢查能不能登記、能不能裝修。<b>照片會送到你選的 AI 服務商，不會存在本工具；照片裡有個資請先遮住身分證字號等資料。</b>',
    '<div class="mini"><input type="file" id="aiPhoto" accept="image/*"></div><div id="photoPrev"></div>' + btns('photo', 'AI 辨識照片') + '<div id="out_photo">' + (O.photo ? photoHtml(O.photo) : '') + '</div>');
  // 宣傳
  h += card('promo', '📣 ' + (c.name ? '開幕宣傳文案' : '店名發想與開幕宣傳'), '產生標語與各平台貼文。想再細修，可以用「社群貼文產生器」或「社群貼文健診站」。',
    field('feature', '店的特色', '例如：自家烘焙豆、寵物友善', 2) + field('offer', '開幕優惠（選填）', '例如：開幕首週飲品第二杯半價') + btns('promo', '產生宣傳內容') + '<div id="out_promo">' + (O.promo ? promoHtml(O.promo) : '') + '</div>');
  return h;
}
function outText(k){ return '<div class="mini"><textarea id="out_' + k + '" rows="10" placeholder="產生的內容會出現在這裡，可以直接修改">' + esc(O[k] || '') + '</textarea></div><div class="go"><button class="btn alt" data-ai-copyout="' + k + '">📋 複製</button><button class="btn alt" data-ai-dl="' + k + '">⬇ 下載 .txt</button></div>'; }
function prioHtml(r){
  return '<div class="aiout">' + (r.summary ? '<p>' + esc(r.summary) + '</p>' : '') +
    (r.steps.length ? '<ol>' + r.steps.map(function(s){ return '<li><b>' + esc(s.when || '') + '</b> ' + esc(s.todo || '') + (s.why ? '<br><span class="small">' + esc(s.why) + '</span>' : '') + '</li>'; }).join('') + '</ol>' : '') +
    (r.parallel.length ? '<b>可以一起辦</b><ul>' + r.parallel.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    (r.delay ? '<p class="small">📅 ' + esc(r.delay) + '</p>' : '') + '</div>';
}
var YN = {'可以':'✅ 可以', '不行':'⛔ 不行', '沒寫':'❓ 沒寫', '不適用':'—'};
function photoHtml(r){
  var f = r.fields || {};
  return '<div class="aiout"><p><b>' + esc(r.docType || '文件') + '</b></p><dl class="kv">' + Object.keys(f).filter(function(k){ return f[k]; }).map(function(k){ return '<dt>' + esc(k) + '</dt><dd>' + esc(f[k]) + '</dd>'; }).join('') + '</dl>' +
    '<p>可當營業登記地址：' + esc(YN[r.register] || r.register || '—') + '　可裝修：' + esc(YN[r.renovation] || r.renovation || '—') + '　可掛招牌：' + esc(YN[r.sign] || r.sign || '—') + '</p>' +
    (r.risks.length ? '<b>⚠ 要注意</b><ul>' + r.risks.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    (r.askLandlord.length ? '<b>簽約前問房東</b><ul>' + r.askLandlord.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    '<p class="small">AI 辨識可能看錯，請對照原件；建物用途是否符合請以建管單位為準。</p></div>';
}
function promoHtml(r){
  return '<div class="aiout">' + (r.names.length ? '<b>店名提案</b><ul>' + r.names.map(function(n){ return '<li><b>' + esc(n.name || '') + '</b>　<span class="small">' + esc(n.why || '') + '</span></li>'; }).join('') + '</ul><p class="small">喜歡的店名請先到經濟部智慧財產局查商標，並辦名稱預查。</p>' : '') +
    (r.slogans.length ? '<b>標語</b><ul>' + r.slogans.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
    r.posts.map(function(p, i){ return '<b>' + esc(p.platform || '貼文') + '</b><textarea class="posttxt" rows="5" id="post_' + i + '">' + esc(p.text || '') + '</textarea><button class="ibtn" data-ai-copypost="' + i + '">📋 複製這則</button>'; }).join('') +
    (r.tips.length ? '<b>宣傳小事</b><ul>' + r.tips.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
}

/* ---------- 鳳凰貸款申請書產生器接力 ---------- */
var PHOENIX_URL = 'https://m255525.github.io/phoenix-loan-generator/';
var REG = {small:'small', sole:'business', partner:'business', ltd:'company', corp:'company'};
function phoenixPayload(){
  var c = A.S.ctx, b = A.S.budget, bt = A.budgetTotals(), plan = A.lsJson('aiplan', {});
  var use = D.DEFAULT_BUDGET.filter(function(x){ return b.items[x.k] > 0; }).map(function(x){ return {item:x.n, amount:b.items[x.k]}; });
  if(bt.reserve > 0) use.push({item:'周轉金（每月固定開銷 ' + A.money(b.monthly) + ' 元 × ' + b.months + ' 個月）', amount:bt.reserve});
  var p = {v:1, from:'shop-opening-checklist', at:A.today(), business:{regType:REG[c.org]}, finance:{}, plan:{}};
  if(c.name) p.business.name = c.name;
  if(c.staff === '0') p.business.employeeCount = 0;
  if(F.product) p.business.mainProducts = F.product;
  if(bt.total){ p.finance.totalFunding = bt.total; p.finance.fundUse = use; }
  if(b.own) p.finance.selfFunding = b.own;
  if(b.loan) p.finance.requestedLoanAmount = b.loan;
  PLAN_FIELDS.forEach(function(f){ if((plan[f[0]] || '').trim()) p.plan[f[0]] = plan[f[0]].trim(); });
  return p;
}
function phoenixSummary(){
  var p = phoenixPayload(), parts = ['登記型態'];
  if(p.business.name) parts.push('事業名稱');
  if(p.business.mainProducts) parts.push('主要產品');
  if(p.finance.totalFunding) parts.push('資金總額與 ' + p.finance.fundUse.length + ' 項資金用途');
  if(p.finance.selfFunding) parts.push('自備金額');
  if(p.finance.requestedLoanAmount) parts.push('申請貸款金額');
  var n = Object.keys(p.plan).length; if(n) parts.push(n + ' 段計畫書');
  return '會帶過去：' + parts.join('、') + '。資金數字來自「💰 開辦預算」分頁；資金用途帶過去的是整份開辦預算，到申請書要刪減成「用貸款支付」的項目（加總要等於尚需資金）。對方會先詢問、並備份原本的內容才套用。';
}
function b64u(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function toPhoenix(){
  var url = PHOENIX_URL + '#shopImport=' + b64u(JSON.stringify(phoenixPayload()));
  var w = window.open(url, '_blank', 'noopener');
  if(!w) location.href = url;
}

/* ---------- 事件 ---------- */
function readPlan(){ var o = {}; document.querySelectorAll('[data-ai-plan]').forEach(function(t){ o[t.dataset.aiPlan] = t.value; }); A.lsSet('aiplan', JSON.stringify(o)); }
function curPrompt(k){
  if(k === 'doc') return docPrompt(F.doc, F.docNote);
  if(k === 'plan') return planPrompt();
  if(k === 'prio') return priorityPrompt();
  if(k === 'prog') return progressPrompt();
  if(k === 'photo') return photoPrompt();
  if(k === 'promo') return promoPrompt();
}
var photo = null;
async function goCard(k){
  await run(k, 'msg_' + k, async function(st){
    if(k === 'photo' && !photo) throw new Error('請先選一張照片');
    if(k === 'photo' && PROVIDERS[cfg().provider].vision === false) throw new Error('這個 AI 服務商不能看圖，請在 AI 設定改用 Gemini、OpenAI 或 Claude');
    var json = {doc:false, prog:false}[k] !== false;
    var t = await callLLM(curPrompt(k), k === 'photo' ? [photo] : null, json, st);
    if(k === 'doc'){ O.doc = t.trim(); $('out_doc').value = O.doc; }
    else if(k === 'prog'){ F.progress = t.trim(); saveF(); document.querySelector('[data-ai-f="progress"]').value = F.progress; }
    else {
      var j = parseJson(t);
      if(k === 'plan'){ var o = {}; PLAN_FIELDS.forEach(function(f){ o[f[0]] = str(j[f[0]], 1500); var el = document.querySelector('[data-ai-plan="' + f[0] + '"]'); if(el) el.value = o[f[0]]; }); A.lsSet('aiplan', JSON.stringify(o)); setMsg('phoenixMsg', phoenixSummary()); }
      if(k === 'prio'){ O.prio = {summary:str(j.summary, 600), steps:(Array.isArray(j.steps) ? j.steps : []).slice(0, 14).map(function(s){ return {when:str(s && s.when, 40), todo:str(s && s.todo, 200), why:str(s && s.why, 300)}; }), parallel:arr(j.parallel).slice(0, 8), delay:str(j.delay, 400)}; $('out_prio').innerHTML = prioHtml(O.prio); }
      if(k === 'photo'){ var f = {}; if(j.fields && typeof j.fields === 'object') Object.keys(j.fields).slice(0, 10).forEach(function(x){ f[String(x).slice(0, 12)] = str(j.fields[x], 200); });
        O.photo = {docType:str(j.docType, 40), fields:f, register:str(j.register, 20), renovation:str(j.renovation, 20), sign:str(j.sign, 20), risks:arr(j.risks).slice(0, 8), askLandlord:arr(j.askLandlord).slice(0, 8)}; $('out_photo').innerHTML = photoHtml(O.photo); }
      if(k === 'promo'){ O.promo = {names:(Array.isArray(j.names) ? j.names : []).slice(0, 6).map(function(n){ return {name:str(n && n.name, 30), why:str(n && n.why, 120)}; }), slogans:arr(j.slogans).slice(0, 5), posts:(Array.isArray(j.posts) ? j.posts : []).slice(0, 5).map(function(p){ return {platform:str(p && p.platform, 30), text:str(p && p.text, 1500)}; }), tips:arr(j.tips).slice(0, 5)}; $('out_promo').innerHTML = promoHtml(O.promo); }
    }
    saveO();
  });
}
document.addEventListener('click', function(e){
  var el = e.target.closest('[data-ai-ask],[data-ai-chip],[data-ai-askgo],[data-ai-askcopy],[data-ai-tonote],[data-ai-nl],[data-ai-go],[data-ai-copy],[data-ai-copyout],[data-ai-dl],[data-ai-copyfield],[data-ai-progreset],[data-ai-phoenix],[data-ai-copypost],[data-ai-settings],[data-ai-save],[data-ai-test],[data-ai-eye],[data-ai-clear]');
  if(!el) return;
  var ds = el.dataset;
  if(ds.aiAsk){ openAsk(ds.aiAsk); return; }
  if(ds.aiChip){ $('askQ').value = ds.aiChip; return; }
  if(ds.aiAskgo || ds.aiAskcopy){
    var id = ds.aiAskgo || ds.aiAskcopy, t = A.allTasks().filter(function(x){ return x.id === id; })[0], q = ($('askQ').value || '').trim() || ASK_CHIPS[0];
    if(ds.aiAskcopy){ copyPrompt(askPrompt(t, q)); return; }
    askCur = {id:id};
    run('ask', 'askMsg', async function(st){
      var j = parseJson(await callLLM(askPrompt(t, q), null, true, st));
      var r = {answer:str(j.answer, 2000), ask:arr(j.ask).slice(0, 5), docs:arr(j.docs).slice(0, 8), caution:str(j.caution, 300)};
      O['ask_' + id] = {q:q, r:r}; saveO(); $('askOut').innerHTML = askOutHtml(r);
    });
    return;
  }
  if(ds.aiTonote){
    var cur = askCur || {}, tid = cur.id || (document.querySelector('[data-ai-askgo]') || {}).dataset.aiAskgo, rec = O['ask_' + tid];
    if(!rec) return;
    var S = A.S, add = 'AI：' + rec.r.answer.slice(0, 200) + (rec.r.ask.length ? '\n問承辦：' + rec.r.ask.join('／') : '');
    S.notes[tid] = ((S.notes[tid] ? S.notes[tid] + '\n' : '') + add).slice(0, 1000); A.save(); A.closeModal(); A.render(); A.toast('已存到備註'); return;
  }
  if(ds.aiNl){
    var txt = ($('nlText').value || '').trim(); nl.text = txt;
    if(!txt){ A.toast('先寫一句描述'); return; }
    if(ds.aiNl === 'rule'){ var r0 = D.parseShopText(txt); applyNl(r0.set, r0.found); return; }
    if(!ready()){ A.toast('AI 版需要金鑰；可以先用「幫我填（免金鑰）」'); return; }
    setMsg('nlFound', 'AI 判讀中…');
    callLLM(nlPrompt(txt), null, true).then(function(t){ var r = cleanAiCtx(parseJson(t)); applyNl(r.set, r.found, r.unsure.length ? '<br>❓ 建議再確認：' + r.unsure.map(esc).join('；') : ''); },
      function(err){ setMsg('nlFound', 'AI 失敗：' + err.message + '（可以改用免金鑰版）', true); });
    return;
  }
  if(ds.aiGo){ if(ds.aiGo === 'plan') readPlan(); goCard(ds.aiGo); return; }
  if(ds.aiCopy){ copyPrompt(curPrompt(ds.aiCopy), ds.aiCopy === 'photo' ? '貼到 ChatGPT 或 Gemini 時，記得一起附上照片' : ''); return; }
  if(ds.aiCopyout){ A.copyText($('out_' + ds.aiCopyout).value); return; }
  if(ds.aiDl){ A.download(((A.S.ctx.name || '開店') + '-' + (DOCS.filter(function(d){ return d.k === F.doc; })[0] || {n:'草稿'}).n).replace(/[\\/:*?"<>|（）、]/g, '') + '.txt', $('out_' + ds.aiDl).value, 'text/plain'); return; }
  if(ds.aiCopyfield){ A.copyText(document.querySelector('[data-ai-f="' + ds.aiCopyfield + '"]').value); return; }
  if(ds.aiProgreset){ F.progress = progressText(); saveF(); document.querySelector('[data-ai-f="progress"]').value = F.progress; return; }
  if(ds.aiPhoenix){ readPlan(); toPhoenix(); return; }
  if(ds.aiCopypost){ A.copyText($('post_' + ds.aiCopypost).value); return; }
  if(ds.aiSettings){ A.openSettings(); openSec('ai'); return; }
  if(ds.aiEye){ var k = $('aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; return; }
  if(ds.aiSave){ saveSettings(); A.toast('AI 設定已儲存'); A.closeModal(); A.render(); return; }
  if(ds.aiClear){ A.lsSet('ai', '{}'); A.toast('已清除金鑰'); A.openSettings(); openSec('ai'); return; }
  if(ds.aiTest){
    saveSettings(); setMsg('aiTestMsg', '測試中…');
    callLLM('請只回覆「OK」兩個字。', null, false).then(function(t){ setMsg('aiTestMsg', '✓ 連線成功：' + String(t).trim().slice(0, 20)); }, function(err){ setMsg('aiTestMsg', '✗ ' + err.message, true); });
  }
});
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.dataset.aiF){ F[t.dataset.aiF] = t.value; saveF(); if(t.dataset.aiF === 'product') setMsg('phoenixMsg', phoenixSummary()); return; }
  if(t.dataset.aiPlan){ readPlan(); setMsg('phoenixMsg', phoenixSummary()); return; }
  if(t.id === 'out_doc'){ O.doc = t.value; saveO(); return; }
  if(t.id === 'nlText'){ nl.text = t.value; }
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.id === 'aiProvider'){ renderModels(t.value); return; }
  if(t.id === 'aiPhoto'){
    var f = t.files[0]; photo = null; $('photoPrev').innerHTML = '';
    if(!f) return;
    if(!/^image\//.test(f.type)){ A.toast('請選擇圖片檔'); return; }
    shrink(f).then(function(im){ photo = im; $('photoPrev').innerHTML = '<img src="' + im.dataUrl + '" alt="上傳的照片預覽" style="max-height:160px;border-radius:.5rem;margin:.3rem 0">'; });
  }
});
function shrink(file){   // 壓到長邊 1600px 的 JPEG，省流量也符合各家上限
  return new Promise(function(ok, no){
    var r = new FileReader(); r.onerror = no;
    r.onload = function(){ var im = new Image(); im.onerror = no; im.onload = function(){
      var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); var url = c.toDataURL('image/jpeg', .85); ok({mime:'image/jpeg', dataUrl:url, b64:url.split(',')[1]}); }; im.src = r.result; };
    r.readAsDataURL(file);
  });
}

/* ---------- 設定 ---------- */
function settingsBody(){
  var c = cfg();
  return '<p class="small">選一家 AI 服務商並填入你自己的金鑰（Gemini 可到 Google AI Studio 免費申請）。<b>金鑰只存在這台裝置的瀏覽器</b>，不會上傳到本工具；使用 AI 時，你的開店條件與輸入內容會送到該服務商。共用電腦請用完按「清除金鑰」。</p>' +
    '<div class="mini"><label class="fld">服務商<select id="aiProvider">' + Object.keys(PROVIDERS).map(function(k){ return '<option value="' + k + '"' + (k === c.provider ? ' selected' : '') + '>' + PROVIDERS[k].label + '</option>'; }).join('') + '</select></label>' +
    '<label class="fld">模型<select id="aiModel"></select></label>' +
    '<label class="fld">或自己填模型名稱（選填）<input id="aiModelCustom" value="' + esc(c.modelCustom || '') + '"></label>' +
    '<label class="fld" id="aiBaseWrap">端點網址（自訂才需要）<input id="aiBase" placeholder="http://localhost:11434/v1" value="' + esc(c.base || '') + '"></label>' +
    '<label class="fld">API 金鑰<span style="display:flex;gap:.3rem"><input id="aiKey" type="password" autocomplete="off" value="' + esc(c.key || '') + '" style="flex:1"><button type="button" class="ibtn" data-ai-eye="1">👁</button></span></label></div>' +
    '<p class="small" id="aiVision"></p><div class="stack"><button class="btn" data-ai-save="1">儲存</button><button class="btn alt" data-ai-test="1">測試連線</button><button class="btn red" data-ai-clear="1">清除金鑰</button></div><p class="small" id="aiTestMsg"></p>';
}
function renderModels(p){
  var c = cfg(), pv = PROVIDERS[p] || PROVIDERS.gemini, cur = c.provider === p ? c.model : '';
  $('aiModel').innerHTML = pv.models.map(function(m){ return '<option value="' + m[0] + '"' + (m[0] === cur ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') || '<option value="">（請在下方填模型名稱）</option>';
  $('aiBaseWrap').hidden = p !== 'custom';
  $('aiVision').textContent = pv.vision ? '✓ 支援看圖（可用「拍照檢查租約」）' : '⚠ 只支援文字，「拍照檢查租約」不能用';
}
function bindSettings(){ if($('aiProvider')) renderModels($('aiProvider').value); }
function saveSettings(){
  A.lsSet('ai', JSON.stringify({provider:$('aiProvider').value, model:$('aiModel').value, modelCustom:$('aiModelCustom').value.trim(), base:$('aiBase').value.trim(), key:$('aiKey').value.trim()}));
}

window.SOC_AI = {panel:panel, setupBox:setupBox, settingsBody:settingsBody, bindSettings:bindSettings, status:status, ready:ready,
  _t:{nlPrompt:nlPrompt, askPrompt:askPrompt, docPrompt:docPrompt, planPrompt:planPrompt, priorityPrompt:priorityPrompt, photoPrompt:photoPrompt, promoPrompt:promoPrompt, progressText:progressText, phoenixPayload:phoenixPayload, cleanAiCtx:cleanAiCtx, callLLM:callLLM, PROVIDERS:PROVIDERS}};
A.render();
})();
