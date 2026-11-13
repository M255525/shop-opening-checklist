/* 開店前置清單：畫面與互動。任務規則在 data.js（window.SOC）。localStorage 前綴 soc. */
(function(){
'use strict';
var D = window.SOC;
var $ = function(id){ return document.getElementById(id); };
var PFX = 'soc.';
function lsGet(k){ try{ return localStorage.getItem(PFX + k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(PFX + k); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k)); return v == null ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
function today(){ return D.fmt(new Date()); }
function md(s){ var d = D.parseDate(s); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; }
function money(n){ return Math.round(n || 0).toLocaleString('zh-TW'); }
var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone;

/* ---------- 狀態 ---------- */
var CTX_KEYS = {type:D.TYPES, org:D.ORGS, staff:D.STAFF, place:D.PLACES};
var FLAGS = ['reno', 'sign', 'music', 'member', 'delivery', 'food'];
function cleanCtx(c){
  if(!c || typeof c !== 'object') return null;
  var o = {name:typeof c.name === 'string' ? c.name.slice(0, 30) : ''};
  for(var k in CTX_KEYS){ if(!Object.prototype.hasOwnProperty.call(CTX_KEYS[k], c[k])) return null; o[k] = c[k]; }
  var s = +c.sales; o.sales = isFinite(s) && s >= 0 && s < 100000 ? Math.round(s * 10) / 10 : 0;
  o.open = D.parseDate(c.open) ? c.open : D.fmt(D.addDays(new Date(), 90));
  FLAGS.forEach(function(f){ o[f] = !!c[f]; });
  return o;
}
function blankBudget(){ var it = {}; D.DEFAULT_BUDGET.forEach(function(b){ it[b.k] = 0; }); return {items:it, monthly:0, months:6, own:0, loan:0}; }
function cleanBudget(b){
  var o = blankBudget(); if(!b || typeof b !== 'object') return o;
  var n = function(v, max){ v = +v; return isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0; };
  D.DEFAULT_BUDGET.forEach(function(x){ o.items[x.k] = n(b.items && b.items[x.k], 1e10); });
  o.monthly = n(b.monthly, 1e10); o.months = n(b.months, 60) || 6; o.own = n(b.own, 1e11); o.loan = n(b.loan, 1e11);
  return o;
}
function cleanState(d){
  var o = {ctx:cleanCtx(d && d.ctx), done:{}, notes:{}, custom:[], budget:cleanBudget(d && d.budget)};
  if(d && d.done && typeof d.done === 'object') for(var k in d.done){ if(/^[\w-]{1,40}$/.test(k) && D.parseDate(d.done[k])) o.done[k] = d.done[k]; }
  if(d && d.notes && typeof d.notes === 'object') for(var j in d.notes){ if(/^[\w-]{1,40}$/.test(j) && typeof d.notes[j] === 'string') o.notes[j] = d.notes[j].slice(0, 1000); }
  if(d && Array.isArray(d.custom)) d.custom.slice(0, 80).forEach(function(c){
    if(c && /^c[\w]{1,20}$/.test(c.id) && typeof c.title === 'string' && D.parseDate(c.end) && D.PHASES.some(function(p){ return p.id === c.ph; }))
      o.custom.push({id:c.id, ph:c.ph, title:c.title.slice(0, 60), end:c.end});
  });
  return o;
}
function load(){ return cleanState({ctx:lsJson('ctx', null), done:lsJson('done', {}), notes:lsJson('notes', {}), custom:lsJson('custom', []), budget:lsJson('budget', null)}); }
var S = load(), demo = false, saved = null;
function save(){
  if(demo) return;
  if(S.ctx) lsSet('ctx', JSON.stringify(S.ctx)); else lsDel('ctx');
  lsSet('done', JSON.stringify(S.done)); lsSet('notes', JSON.stringify(S.notes));
  lsSet('custom', JSON.stringify(S.custom)); lsSet('budget', JSON.stringify(S.budget));
}
var V = {tab:lsGet('tab') || 'list', group:lsGet('group') || 'phase', filter:'all', editing:false, open:{}, draft:null};

/* ---------- 任務 ---------- */
function allTasks(){
  if(!S.ctx) return [];
  var a = D.buildTasks(S.ctx);
  S.custom.forEach(function(c){ a.push({id:c.id, ph:c.ph, tag:'custom', title:c.title, why:'', where:'自己', prep:[], links:[], src:'', start:c.end, end:c.end, custom:true}); });
  var order = {}; D.PHASES.forEach(function(p, i){ order[p.id] = i; });
  return a.sort(function(x, y){ return order[x.ph] - order[y.ph] || (x.end < y.end ? -1 : x.end > y.end ? 1 : 0); });
}
function status(t){
  if(S.done[t.id]) return 'done';
  var td = today();
  if(t.end < td) return 'late';
  if(t.start <= td) return 'now';
  return 'later';
}
var TAGN = {must:'必辦', maybe:'視情況', tip:'建議', custom:'自訂'};
var GROUPS = [
  ['onestop', '一站式線上申請（經濟部／縣市政府）', /一站式/],
  ['tax', '國稅局', /國稅局|稽徵所/],
  ['bli', '勞保局／健保署', /健康保險署|健保署|勞工保險局|勞保局/],
  ['health', '衛生局／食品業者登錄平台', /衛生局|食品業者登錄/],
  ['gov', '縣市政府各局處', /縣市政府|消防局|建築管理|都市發展|勞動局/],
  ['ins', '保險公司', /保險公司/],
  ['bank', '銀行與金流', /銀行|金流/],
  ['self', '自己與廠商', /./]
];
function groupOf(t){ for(var i = 0; i < GROUPS.length; i++) if(GROUPS[i][2].test(t.where || '')) return GROUPS[i][0]; return 'self'; }
function stats(ts){
  var done = 0, late = 0, mustLeft = 0, next = null;
  ts.forEach(function(t){
    var s = status(t);
    if(s === 'done'){ done++; return; }
    if(s === 'late') late++;
    if(t.tag === 'must'){ mustLeft++; if(!next || t.end < next.end) next = t; }
  });
  return {done:done, total:ts.length, late:late, mustLeft:mustLeft, next:next};
}

/* ---------- 店面（鐵捲門） ---------- */
function storefront(p, name, openDate){
  var full = p >= 1, lift = Math.round(Math.min(p, 1) * 138);
  var nm = (name || '我的小店').slice(0, 12), fs = Math.min(30, Math.floor(330 / Math.max(nm.length, 1)));
  var s = '<svg viewBox="0 0 640 330" role="img" aria-label="店面鐵捲門，已拉起 ' + Math.round(p * 100) + '%">' +
    '<defs><clipPath id="op"><rect x="80" y="142" width="480" height="150"/></clipPath>' +
    '<pattern id="brick" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="#E8D9BE"/><path d="M0 19.5H40M20 0V10M0 10H40M0 10V20M40 10V20" stroke="#D8C5A3" stroke-width="1"/></pattern></defs>' +
    '<rect x="30" y="18" width="580" height="290" fill="url(#brick)"/>' +
    '<rect x="132" y="28" width="376" height="60" rx="7" fill="#3B2B20"/><rect x="139" y="35" width="362" height="46" rx="4" fill="none" stroke="#C9A66B" stroke-width="1.5"/>' +
    '<text x="320" y="' + (58 + fs * .36) + '" text-anchor="middle" font-family="Noto Serif TC,PMingLiU,serif" font-weight="900" font-size="' + fs + '" fill="#F7EEDB" letter-spacing="3">' + esc(nm) + '</text>' +
    '<g fill="#3B2B20"><rect x="170" y="18" width="4" height="12"/><rect x="466" y="18" width="4" height="12"/></g>' +
    '<g fill="#FFE7A3" opacity="' + (full ? '.95' : '.35') + '"><circle cx="172" cy="30" r="5"/><circle cx="468" cy="30" r="5"/></g>';
  // 遮雨棚
  for(var i = 0; i < 13; i++){
    var x = 60 + i * 40, c = i % 2 ? '#F7EEDB' : '#B8432B';
    s += '<rect x="' + x + '" y="98" width="40" height="26" fill="' + c + '"/><path d="M' + x + ' 124a20 13 0 0 0 40 0Z" fill="' + c + '"/>';
  }
  s += '<rect x="56" y="94" width="528" height="6" rx="3" fill="#7E2C1C"/>' +
    '<g fill="#CDB491"><rect x="58" y="138" width="22" height="162"/><rect x="560" y="138" width="22" height="162"/></g>' +
    // 店內
    '<g clip-path="url(#op)"><rect x="80" y="142" width="480" height="150" fill="#F6E6C6"/>' +
    '<rect x="80" y="262" width="480" height="30" fill="#C49A6C"/><path d="M80 262H560" stroke="#A97F55" stroke-width="2"/>' +
    '<g fill="#8B5E3C"><rect x="96" y="176" width="110" height="5"/><rect x="96" y="214" width="110" height="5"/></g>' +
    '<g><rect x="102" y="158" width="16" height="18" fill="#2E6B4C"/><rect x="122" y="162" width="14" height="14" fill="#E0A43A"/><rect x="140" y="156" width="18" height="20" fill="#B8432B"/><rect x="162" y="161" width="16" height="15" fill="#2E5A87"/><rect x="182" y="158" width="18" height="18" fill="#E0A43A"/>' +
    '<rect x="102" y="198" width="22" height="16" fill="#2E5A87"/><rect x="128" y="194" width="16" height="20" fill="#B8432B"/><rect x="148" y="199" width="20" height="15" fill="#2E6B4C"/><rect x="172" y="196" width="26" height="18" fill="#E0A43A"/></g>' +
    '<g stroke="#5A4434" stroke-width="1.5"><path d="M280 142V160M360 142V160M440 142V160"/></g>' +
    '<g fill="#FFE7A3" stroke="#5A4434" stroke-width="1.5"><path d="M268 160h24l-4 10h-16z"/><path d="M348 160h24l-4 10h-16z"/><path d="M428 160h24l-4 10h-16z"/></g>' +
    '<rect x="330" y="222" width="180" height="40" fill="#8B5E3C"/><rect x="324" y="216" width="192" height="8" rx="2" fill="#A8774E"/>' +
    '<rect x="350" y="198" width="34" height="18" rx="3" fill="#3B2B20"/><rect x="354" y="201" width="26" height="9" fill="#9FD4B4"/>' +
    '<rect x="470" y="200" width="18" height="16" rx="2" fill="#F7EEDB" stroke="#8B5E3C"/>' +
    '<g transform="translate(528 232)"><rect x="-12" y="14" width="24" height="18" fill="#B8432B"/><circle cx="0" cy="4" r="14" fill="#2E6B4C"/><circle cx="-9" cy="-6" r="9" fill="#3E8A62"/><circle cx="9" cy="-8" r="8" fill="#3E8A62"/></g>' +
    '<g transform="translate(232 196)"><path d="M14 -22L0 0M14 -22L28 0" stroke="#5A4434" stroke-width="1.5" fill="none"/><rect x="-22" y="0" width="72" height="30" rx="5" fill="' + (full ? '#2C6A4A' : '#9A5800') + '"/>' +
    '<text x="14" y="21" text-anchor="middle" font-family="Noto Sans TC,sans-serif" font-weight="900" font-size="16" fill="#fff">' + (full ? '營業中' : '籌備中') + '</text></g>' +
    // 鐵捲門
    '<g id="shutter" style="transform:translateY(-' + lift + 'px)">';
  for(var y = 142; y < 292; y += 10) s += '<rect x="80" y="' + y + '" width="480" height="10" fill="' + ((y / 10) % 2 ? '#959FA5' : '#A7B0B5') + '"/><path d="M80 ' + (y + 9.5) + 'H560" stroke="#6F797E" stroke-width="1"/>';
  s += '<rect x="80" y="284" width="480" height="8" fill="#5F686D"/><rect x="304" y="276" width="32" height="6" rx="3" fill="#3E4549"/>' +
    '<g transform="rotate(-3 200 215)"><rect x="150" y="178" width="110" height="74" fill="#FFFDF5" stroke="#D8CDB6"/><rect x="190" y="172" width="30" height="10" fill="#E8C66A" opacity=".85"/>' +
    '<text x="205" y="208" text-anchor="middle" font-family="LXGW WenKai TC,Kaiti TC,serif" font-size="20" fill="#2A221C">籌備中</text>' +
    '<text x="205" y="234" text-anchor="middle" font-family="LXGW WenKai TC,Kaiti TC,serif" font-size="13" fill="#6A5B4D">' + (openDate ? md(openDate) + ' 開幕' : '敬請期待') + '</text></g></g></g>' +
    '<rect x="74" y="132" width="492" height="12" rx="3" fill="#5F686D"/>' +
    '<rect x="0" y="300" width="640" height="30" fill="#CFC2AC"/><path d="M0 300H640M80 300V330M200 300V330M320 300V330M440 300V330M560 300V330" stroke="#B6A88F" stroke-width="1.5"/>' +
    '</svg>';
  return s;
}
function confetti(){
  var box = document.querySelector('.front'); if(!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var c = document.createElement('div'); c.className = 'confetti';
  var col = ['#B8432B', '#E0A43A', '#2C6A4A', '#2E5A87', '#F7EEDB'];
  for(var i = 0; i < 46; i++){ var e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.background = col[i % 5]; e.style.animationDelay = Math.random() * .7 + 's'; c.appendChild(e); }
  box.appendChild(c); setTimeout(function(){ c.remove(); }, 3600);
}

/* ---------- 主畫面 ---------- */
function ctxLine(c){
  return D.TYPES[c.type].ic + ' ' + D.TYPES[c.type].n + '・' + D.ORGS[c.org].n + '・員工 ' + D.STAFF[c.staff] + '・' + D.PLACES[c.place] + (c.sales ? '・月營業額約 ' + c.sales + ' 萬' : '');
}
function render(){
  if(!S.ctx || V.editing) return renderSetup();
  var ts = allTasks(), st = stats(ts), c = S.ctx, p = st.total ? st.done / st.total : 0;
  var dd = D.dayDiff(today(), c.open);
  var h = '<div class="bar"><h1>' + esc(c.name || '開店前置清單') + '<small>開店前置清單・' + c.open.replace(/-/g, '/') + ' 開幕</small></h1>' +
    '<button class="ibtn" data-act="edit">✏ 開店設定</button><a class="ibtn" href="manual.html">📖 操作手冊</a><button class="ibtn" data-act="settings">⚙ 常用設定</button></div>' +
    exStrip() +
    '<p class="warn-line">本清單是一般性整理，不是法律或稅務意見；各縣市規定不同，以主管機關最新公告為準。<button data-act="warn">⚠ 使用警語</button></p>' +
    '<section class="hero"><div class="front">' + storefront(p, c.name, c.open) + '</div>' +
    '<div class="stats"><div class="count"><b>' + st.done + '</b><span>/ ' + st.total + ' 項完成</span><span style="margin-left:auto">鐵捲門拉起 ' + Math.round(p * 100) + '%</span></div>' +
    '<div class="meter" aria-hidden="true"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div>' +
    '<div class="kpis"><div class="kpi"><b>' + (dd >= 0 ? dd : -dd) + '</b><span>' + (dd > 0 ? '天後開幕' : dd === 0 ? '今天開幕！' : '天前已開幕') + '</span></div>' +
    '<div class="kpi' + (st.late ? ' red' : '') + '"><b>' + st.late + '</b><span>項已逾期</span></div>' +
    '<div class="kpi' + (st.mustLeft ? ' red' : '') + '"><b>' + st.mustLeft + '</b><span>項必辦未完成</span></div></div>' +
    (st.next ? '<p class="next">下一件必辦：<b>' + esc(st.next.title) + '</b>（' + (status(st.next) === 'late' ? '已逾期，原訂 ' : '截止 ') + md(st.next.end) + '）</p>' : '<p class="next">必辦事項都完成了，加油！</p>') +
    '<p class="ctxline">' + esc(ctxLine(c)) + '</p></div></section>' +
    '<div class="tabs" role="tablist">' + [['list', '📋 清單'], ['tl', '📅 時間軸'], ['budget', '💰 開辦預算'], ['ai', '🤖 AI 助手']].map(function(t){ return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (V.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="print-head"><h1>' + esc(c.name || '開店前置清單') + '・開店前置清單</h1><p>預計 ' + c.open + ' 開幕｜' + esc(ctxLine(c)) + '｜完成 ' + st.done + '/' + st.total + '｜列印日期 ' + today() + '</p><p style="font-size:.85em">本清單為一般性整理，規定以主管機關最新公告為準。</p></div>' +
    '<section id="panel">' + (V.tab === 'tl' ? viewTimeline(ts) : V.tab === 'budget' ? viewBudget() : V.tab === 'ai' ? (window.SOC_AI ? window.SOC_AI.panel() : '<div class="empty">AI 助手載入中…</div>') : viewList(ts)) + '</section>' +
    '<footer class="foot">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="#" data-act="warn">⚠ 使用警語</a>' + (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopopeningchecklist" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
  $('app').innerHTML = h;
}
/* 頁面上方的範例店橫條（主畫面與開店設定頁都有） */
function exStrip(){
  var btns = D.EXAMPLES.map(function(e){
    var m = /^(.*?)（(.*)）$/.exec(e.label) || [0, e.label, ''];
    return '<button class="exbtn" data-demo="' + e.key + '" aria-pressed="' + (demo && V.demoKey === e.key) + '"><span class="exic">' + D.TYPES[e.ctx.type].ic + '</span><span><b>' + esc(m[1]) + '</b><small>' + esc(m[2]) + '</small></span></button>';
  }).join('');
  return '<div class="exbar noprint' + (demo ? ' on' : '') + '"><div class="exlab">' + (demo ? '👀 正在看範例店<small>資料是虛構的，勾選不會存下來</small>' : (S.ctx ? '👀 看看範例店' : '👀 還沒想好？先看範例店') + '<small>三家虛構的店，點了就能看完整清單</small>') + '</div>' +
    '<div class="exbtns">' + btns + '</div>' + (demo ? '<button class="exleave" data-act="leaveDemo">離開範例，回到' + (saved && saved.ctx ? '我的清單' : '開店設定') + '</button>' : '') + '</div>';
}
function seg(name, cur, opts){ return '<div class="seg" role="group">' + opts.map(function(o){ return '<button data-' + name + '="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
function viewList(ts){
  var h = '<div class="tools noprint">' + seg('group', V.group, [['phase', '依階段'], ['where', '依去哪辦']]) +
    seg('filter', V.filter, [['all', '全部'], ['todo', '未完成'], ['late', '逾期'], ['must', '必辦']]) +
    '<span class="grow"></span><button class="ibtn" data-act="addCustom">＋ 自訂項目</button><button class="ibtn" data-act="pdf">⬇ 下載 PDF</button><button class="ibtn" data-act="print">🖨 列印</button>' +
    '<button class="ibtn" data-act="ics">📅 加到行事曆</button><button class="ibtn" data-act="copy">💬 複製文字</button><button class="ibtn" data-act="share">🔗 分享設定</button></div>';
  var f = ts.filter(function(t){
    var s = status(t);
    return V.filter === 'all' || (V.filter === 'todo' && s !== 'done') || (V.filter === 'late' && s === 'late') || (V.filter === 'must' && t.tag === 'must' && s !== 'done');
  });
  if(!f.length) return h + '<div class="empty">' + (V.filter === 'late' ? '沒有逾期的項目 👍' : '這個篩選沒有項目。') + '</div>';
  var groups = V.group === 'where' ? GROUPS.map(function(g){ return {id:g[0], n:g[1], s:'', items:f.filter(function(t){ return groupOf(t) === g[0]; })}; })
    : D.PHASES.map(function(p){ return {id:p.id, n:p.n, s:p.s, items:f.filter(function(t){ return t.ph === p.id; })}; });
  groups.forEach(function(g){
    if(!g.items.length) return;
    var dn = g.items.filter(function(t){ return S.done[t.id]; }).length;
    h += '<div class="phase"><h2>' + esc(g.n) + (g.s ? '<small>' + g.s + '</small>' : '') + '<span class="pn">' + dn + '/' + g.items.length + '</span></h2>' + g.items.map(taskHtml).join('') + '</div>';
  });
  return h;
}
function dueText(t){
  var s = status(t), td = today();
  if(s === 'done') return '<span class="due now">✓ ' + md(S.done[t.id]) + ' 完成</span>';
  var range = t.start === t.end ? md(t.end) : md(t.start) + '～' + md(t.end);
  if(s === 'late') return '<span class="due late">' + range + '・逾期 ' + D.dayDiff(t.end, td) + ' 天</span>';
  if(s === 'now') return '<span class="due now">' + range + '・剩 ' + D.dayDiff(td, t.end) + ' 天</span>';
  return '<span class="due">' + range + '</span>';
}
function taskHtml(t){
  var dn = !!S.done[t.id], open = !!V.open[t.id], note = S.notes[t.id] || '';
  var h = '<article class="task t-' + t.tag + (dn ? ' done' : '') + '" data-id="' + t.id + '">' +
    '<button class="chk" data-check="' + t.id + '" aria-pressed="' + dn + '" aria-label="' + (dn ? '取消完成' : '標記完成') + '：' + esc(t.title) + '">✓</button>' +
    '<div class="tb"><button class="ttl" data-toggle="' + t.id + '" aria-expanded="' + open + '">' + esc(t.title) + '</button>' +
    '<div class="meta"><span class="tag ' + t.tag + '">' + TAGN[t.tag] + '</span>' + dueText(t) + (t.custom ? '' : '<span class="where-s">' + esc(t.where) + '</span>') + '</div>' +
    '<div class="detail"' + (open ? '' : ' hidden') + '>';
  if(t.why) h += '<p class="why">' + esc(t.why) + '</p>';
  if(!t.custom){
    h += '<dl><dt>去哪辦</dt><dd>' + esc(t.where) + '</dd>' + (t.prep.length ? '<dt>要準備</dt><dd><ul>' + t.prep.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></dd>' : '') +
      (t.src ? '<dt class="src">依據</dt><dd class="src">' + esc(t.src) + '</dd>' : '') + '</dl>';
    if(t.links.length) h += '<div class="links">🔗 ' + t.links.map(function(l){ return '<a href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.t) + '</a>'; }).join('') + '</div>';
  }
  if(window.SOC_AI && !t.custom) h += '<div class="noprint" style="margin-top:.4rem"><button class="ibtn" data-ai-ask="' + t.id + '">🤖 問 AI 這一項</button></div>';
  h += '<textarea class="note noprint" data-note="' + t.id + '" placeholder="寫個備註：承辦人、電話、還缺什麼…" aria-label="備註">' + esc(note) + '</textarea>' +
    (note ? '<div class="note-print">備註：' + esc(note) + '</div>' : '') +
    (t.custom ? '<button class="del noprint" data-delcustom="' + t.id + '">刪除這個自訂項目</button>' : '') + '</div></div></article>';
  return h;
}
function viewTimeline(ts){
  var open = D.parseDate(S.ctx.open), a = D.addDays(open, -125), b = D.addDays(open, 60), span = (b - a) / 864e5;
  var pos = function(s){ var d = D.parseDate(s); return Math.max(0, Math.min(100, (d - a) / 864e5 / span * 100)); };
  var axis = '', d = new Date(a.getFullYear(), a.getMonth() + 1, 1);
  while(d < b){ axis += '<span style="left:' + pos(D.fmt(d)).toFixed(2) + '%">' + (d.getMonth() === 0 ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '月</span>'; d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  var td = today(), lines = '', marks = '';
  if(D.parseDate(td) >= a && D.parseDate(td) <= b){ lines += '<div class="tl-line today" style="left:' + pos(td) + '%"></div>'; marks += '<div class="tl-line today" style="left:' + pos(td) + '%"><b>今天</b></div>'; }
  lines += '<div class="tl-line open" style="left:' + pos(S.ctx.open) + '%"></div>'; marks += '<div class="tl-line open" style="left:' + pos(S.ctx.open) + '%"><b>開幕</b></div>';
  var h = '<p class="small noprint" style="margin:.7rem 0 0">橫條是每件事建議的辦理期間（紅＝必辦、橘＝視情況、藍＝建議、綠＝已完成）。手機可以左右滑動。</p><div class="tl-wrap"><div class="tl"><div class="tl-axis">' + axis + '</div><div class="tl-marks">' + marks + '</div>';
  D.PHASES.forEach(function(p){
    var items = ts.filter(function(t){ return t.ph === p.id; }); if(!items.length) return;
    h += '<div class="tl-ph">' + p.n + '</div>';
    items.forEach(function(t){
      var dn = !!S.done[t.id], l = pos(t.start), r = pos(t.end);
      h += '<div class="tl-row' + (dn ? ' done' : '') + '"><span class="nm" title="' + esc(t.title) + '">' + esc(t.title) + '</span><div class="tl-track">' + lines +
        '<div class="tl-bar ' + (dn ? 'done' : t.tag) + '" style="left:' + l.toFixed(2) + '%;width:' + Math.max(r - l, .8).toFixed(2) + '%" title="' + md(t.start) + '～' + md(t.end) + '"></div></div></div>';
    });
  });
  return h + '</div></div>';
}
function budgetTotals(){
  var b = S.budget, items = 0; D.DEFAULT_BUDGET.forEach(function(x){ items += b.items[x.k] || 0; });
  var reserve = b.monthly * b.months, total = items + reserve, fund = b.own + b.loan;
  return {items:items, reserve:reserve, total:total, fund:fund, gap:fund - total};
}
function viewBudget(){
  var b = S.budget, t = budgetTotals();
  var row = function(k, n, v, unit){ return '<div class="brow"><label for="b_' + k + '">' + n + '</label><input id="b_' + k + '" data-budget="' + k + '" inputmode="numeric" value="' + (v ? money(v) : '') + '" placeholder="0"><span class="unit">' + (unit || '元') + '</span></div>'; };
  var h = '<div class="budget"><h2 style="font-family:var(--sign);font-size:1.15rem">一次性的開辦費用</h2>';
  D.DEFAULT_BUDGET.forEach(function(x){ h += row(x.k, x.n, b.items[x.k]); });
  h += '<h2 style="font-family:var(--sign);font-size:1.15rem;margin-top:1rem">周轉金</h2>' + row('monthly', '每月固定開銷（租金＋人事＋水電＋其他）', b.monthly) +
    row('months', '準備幾個月', b.months, '個月') +
    '<p class="bnote">常見建議是準備 6 個月，開店前幾個月營收通常還不穩定。</p>' +
    '<h2 style="font-family:var(--sign);font-size:1.15rem;margin-top:1rem">資金來源</h2>' + row('own', '自有資金', b.own) + row('loan', '貸款或親友借款', b.loan) +
    '<div class="brow total"><span>開辦費用</span><b id="bItems">' + money(t.items) + ' 元</b></div>' +
    '<div class="brow total"><span>周轉金</span><b id="bReserve">' + money(t.reserve) + ' 元</b></div>' +
    '<div class="brow total"><span>總共需要</span><b id="bTotal">' + money(t.total) + ' 元</b></div>' +
    '<div class="brow total"><span>資金' + '</span><b id="bGap">' + gapText(t) + '</b></div>' +
    '<div class="go noprint"><button class="btn alt" data-act="pdf">⬇ 下載 PDF（清單＋預算）</button></div>' +
    '<p class="bnote">金額只存在您這台裝置。要評估餐飲店每月損益，可以用<a href="https://m255525.github.io/restaurant-feasibility-calculator/" target="_blank" rel="noopener">餐飲店經營評估試算</a>。</p></div>';
  return h;
}
function gapText(t){ if(!t.total) return '—'; return t.gap >= 0 ? '<span class="gap-ok">足夠，多 ' + money(t.gap) + ' 元</span>' : '<span class="gap-bad">還差 ' + money(-t.gap) + ' 元</span>'; }

/* ---------- 開店設定 ---------- */
function defaultDraft(){ return {name:'', open:D.fmt(D.addDays(new Date(), 90)), type:'', org:'', sales:'', staff:'0', place:'', reno:false, sign:false, music:false, member:false, delivery:false, food:false}; }
function suggestOrg(d){
  var th = d.type ? D.threshold(d) : 10, s = +d.sales || 0, n = D.staffN(d);
  if(s && s < th && n === 0 && (d.place === 'home' || d.place === 'none' || d.place === 'spot')) return 'small';
  if(n >= 5 || s >= 100) return 'ltd';
  return 'sole';
}
function chips(field, map, cur, sub){
  return '<div class="chips">' + Object.keys(map).map(function(k){ var v = map[k], n = typeof v === 'string' ? v : (v.ic ? v.ic + ' ' : '') + v.n;
    return '<button type="button" class="chip" data-set="' + field + '" data-val="' + k + '" aria-pressed="' + (cur === k) + '">' + esc(n) + (sub && v.s ? '<small>' + esc(v.s) + '</small>' : '') + '</button>'; }).join('') + '</div>';
}
function adviceHtml(d){
  if(!d.type) return '<p>先選店型，這裡會告訴您起徵點和登記建議。</p>';
  var c = {type:d.type, org:d.org || 'sole', sales:+d.sales || 0, staff:d.staff, place:d.place};
  return D.orgAdvice(c).map(function(x){ return '<p>' + esc(x) + '</p>'; }).join('') + (d.org ? '' : '<p>建議型態：<b>' + D.ORGS[suggestOrg(d)].n + '</b>（可按「幫我選」）</p>');
}
function renderSetup(){
  var d = V.draft || (V.draft = S.ctx ? JSON.parse(JSON.stringify(S.ctx)) : defaultDraft());
  var foodish = d.type === 'food' || d.food;
  var h = '<div class="bar"><h1>開店前置清單<small>選好條件，自動排出從登記到開幕的倒數清單</small></h1>' +
    (S.ctx ? '' : '<button class="ibtn" data-act="settings">⚙ 常用設定</button>') + '<a class="ibtn" href="manual.html">📖 操作手冊</a></div>' +
    '<p class="warn-line">本清單是一般性整理，不是法律或稅務意見；各縣市規定不同，以主管機關最新公告為準。<button data-act="warn">⚠ 使用警語</button></p>' +
    exStrip() +
    '<form class="setup" id="setupForm"><h2>' + (S.ctx ? '✏ 修改開店設定' : '🏪 先告訴我您要開什麼店') + '</h2>' +

    (window.SOC_AI ? window.SOC_AI.setupBox() : '') +
    '<div class="row2 q"><label class="fld">店名（可以先空著）<input id="fName" maxlength="30" value="' + esc(d.name) + '" placeholder="例如：巷口小食堂"></label>' +
    '<label class="fld">預計開幕日<input id="fOpen" type="date" value="' + esc(d.open) + '" required></label></div>' +
    '<div class="q"><b>店型</b>' + chips('type', D.TYPES, d.type) + '</div>' +
    '<div class="q"><label class="fld">預估每月營業額<small style="font-weight:500;color:var(--sub);margin-left:.4rem">萬元，大概就好</small><input id="fSales" inputmode="decimal" value="' + esc(d.sales) + '" placeholder="例如 15"></label></div>' +
    '<div class="q"><b>要請員工嗎</b>' + chips('staff', D.STAFF, d.staff) + '</div>' +
    '<div class="q"><b>營業場地</b>' + chips('place', D.PLACES, d.place) + '</div>' +
    '<div class="q"><b>登記型態<small>不確定可以按「幫我選」</small></b>' + chips('org', D.ORGS, d.org, true) +
    '<div class="go" style="margin-top:.5rem"><button type="button" class="btn alt" data-act="suggest">🤔 幫我選</button></div><div class="advice" id="advice">' + adviceHtml(d) + '</div></div>' +
    '<div class="q"><b>其他狀況<small>有勾的才會出現相關項目</small></b><div class="checks">' +
    [['reno', '要裝潢或改隔間'], ['sign', '要掛招牌'], ['music', '店裡會放音樂'], ['member', '會收集會員資料']].concat(d.type === 'food' ? [] : [['food', '也有賣吃的、喝的']]).concat(foodish ? [['delivery', '要上外送平台']] : [])
      .map(function(x){ return '<label><input type="checkbox" data-flag="' + x[0] + '"' + (d[x[0]] ? ' checked' : '') + '>' + x[1] + '</label>'; }).join('') + '</div></div>' +
    '<p class="err" id="setupErr" style="color:var(--must);font-weight:900"></p>' +
    '<div class="go"><button class="btn" type="submit">' + (S.ctx ? '更新我的清單' : '產生我的開店清單') + '</button>' + (S.ctx ? '<button type="button" class="btn alt" data-act="cancelEdit">取消</button>' : '') + '</div></form>' +
    '<footer class="foot">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="#" data-act="warn">⚠ 使用警語</a>' + (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopopeningchecklist" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
  $('app').innerHTML = h;
}
function readDraftText(){ var d = V.draft; if(!d) return; var n = $('fName'), o = $('fOpen'), s = $('fSales'); if(n) d.name = n.value; if(o) d.open = o.value; if(s) d.sales = s.value; }
function submitSetup(e){
  e.preventDefault(); readDraftText();
  var d = V.draft, err = !d.type ? '請選店型' : !d.place ? '請選營業場地' : !d.org ? '請選登記型態（或按「幫我選」）' : !D.parseDate(d.open) ? '請填預計開幕日' : (d.sales !== '' && !(+d.sales >= 0)) ? '營業額請填數字' : '';
  if(err){ $('setupErr').textContent = err; return; }
  var c = cleanCtx(Object.assign({}, d, {sales:+d.sales || 0}));
  if(c.type === 'food') c.food = false;
  if(!(c.type === 'food' || c.food)) c.delivery = false;
  var first = !S.ctx; S.ctx = c; V.editing = false; V.draft = null; save(); render(); window.scrollTo(0, 0);
  toast(first ? '清單排好了，共 ' + allTasks().length + ' 項' : '清單已依新設定更新，勾選紀錄都保留');
}

/* ---------- 彈窗、提示 ---------- */
function openModal(h){ $('modalBox').innerHTML = h; $('modal').classList.add('show'); $('modalBox').scrollTop = 0; }
function closeModal(){ $('modal').classList.remove('show'); }
var toastT;
function toast(m){ var o = document.querySelector('.toast'); if(o) o.remove(); var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = m; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function(){ t.remove(); }, 3200); }
var WARN_HTML = '<h2>⚠ 使用警語</h2>' +
  '<p><b>這份清單是一般性的整理，不是法律、稅務或會計意見。</b></p><ul>' +
  '<li>規定以中央與各縣市主管機關<b>最新公告</b>為準；同一件事在不同縣市可能有不同要求（例如招牌、攤販、營業衛生、消防）。</li>' +
  '<li>金額門檻（起徵點每月 10 萬／5 萬元、免用統一發票 20 萬元、勞保 5 人、產品責任險保額等）依 2026 年 11 月查證，之後可能修正。</li>' +
  '<li>「視情況」的項目要不要辦，請直接問承辦機關或會計師、記帳士；本工具無法替您判斷個案。</li>' +
  '<li>建議辦理期間只是常見的安排，實際所需時間依機關與個案而定，請預留緩衝。</li>' +
  '<li>您填的資料、勾選與備註<b>只存在這台裝置的瀏覽器</b>，不會上傳。清除瀏覽器資料就會不見，重要內容請用「⚙ 常用設定 → 資料備份」。</li>' +
  '<li>「🤖 AI 助手」要自備金鑰，金鑰只存在這台裝置。按「✨」時，你的開店條件與輸入內容（拍照功能則是照片）會送到你選的 AI 服務商；AI 回答可能出錯，只能當參考。</li>' +
  '<li>範例店家與人物全部是虛構的。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button class="btn" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(){
  var c = S.ctx;
  var h = '<div class="bar"><h2 style="flex:1 1 0">⚙ 常用設定</h2><button class="ibtn" data-act="foldall">全部展開／收合</button></div>' +
    sec('shop', '開店資料', c ? (c.name || D.TYPES[c.type].n) + '・' + md(c.open) + ' 開幕' : '還沒設定',
      (c ? '<p class="small">' + esc(ctxLine(c)) + '</p>' : '<p class="small">還沒有設定。</p>') + '<div class="stack"><button class="btn" data-act="edit">✏ 修改開店設定</button></div>') +
    sec('view', '顯示', lsGet('fs') === 'xl' ? '大字' : '標準字', '<div class="stack"><button class="btn' + (lsGet('fs') === 'xl' ? ' alt' : '') + '" data-fontsize="m">標準字</button><button class="btn' + (lsGet('fs') === 'xl' ? '' : ' alt') + '" data-fontsize="xl">大字</button></div>') +
    sec('data', '資料備份', Object.keys(S.done).length + ' 項已勾選', '<p class="small">資料只存在這台裝置。換電腦或手機前先下載備份檔，再到新裝置還原。</p><div class="stack">' +
      '<button class="btn" data-act="backup">下載備份檔</button><button class="btn alt" data-act="restore">從備份檔還原</button><button class="btn red" data-act="wipe">清除全部資料</button></div><input type="file" id="restoreFile" accept=".json,application/json" hidden>') +
    sec('demo', '看範例', demo ? '範例模式中' : '', '<p class="small">用虛構的店家看看成果，您自己的資料不受影響。</p><div class="stack">' +
      D.EXAMPLES.map(function(e){ return '<button class="btn alt" data-demo="' + e.key + '">' + esc(e.label) + '</button>'; }).join('') + (demo ? '<button class="btn" data-act="leaveDemo">離開範例</button>' : '') + '</div>') +
    (window.SOC_AI ? sec('ai', '🤖 AI 設定（自備金鑰）', window.SOC_AI.status(), window.SOC_AI.settingsBody()) : '') +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn alt" href="manual.html">📖 操作手冊</a><button class="btn alt" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button class="btn alt" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopopeningchecklist" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<div class="stack"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
  $('restoreFile').addEventListener('change', restoreFile);
  if(window.SOC_AI) window.SOC_AI.bindSettings();
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView(){ document.documentElement.dataset.fs = lsGet('fs') === 'xl' ? 'xl' : 'm'; }

/* ---------- 匯出 ---------- */
function download(name, text, type){
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:type}));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function icsText(){
  var e = function(s){ return String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, function(m){ return '\\' + m; }).replace(/\n/g, '\\n'); };
  var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//m255525//shop-opening-checklist//ZH-TW', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + e((S.ctx.name || '開店') + '前置清單')];
  allTasks().forEach(function(t){
    if(S.done[t.id]) return;
    var d = D.parseDate(t.end), n = D.addDays(d, 1), f = function(x){ return D.fmt(x).replace(/-/g, ''); };
    L.push('BEGIN:VEVENT', 'UID:' + t.id + '-' + f(d) + '@shop-opening-checklist', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + f(d), 'DTEND;VALUE=DATE:' + f(n),
      'SUMMARY:' + e('【開店】' + t.title + '（' + TAGN[t.tag] + '）'), 'DESCRIPTION:' + e('去哪辦：' + t.where + (t.prep.length ? '\n要準備：' + t.prep.join('、') : '')), 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  // 依 RFC 5545 每行不超過 75 位元組（中文一字 3 位元組），續行以空白開頭
  var enc = new TextEncoder();
  return L.map(function(l){ var o = [], cur = '', n = 0; Array.from(l).forEach(function(ch){ var b = enc.encode(ch).length; if(n + b > 73){ o.push(cur); cur = ' '; n = 1; } cur += ch; n += b; }); o.push(cur); return o.join('\r\n'); }).join('\r\n') + '\r\n';
}
function plainText(){
  var c = S.ctx, ts = allTasks(), out = ['【' + (c.name || '我的店') + '】開店前置清單（' + c.open + ' 開幕）'];
  D.PHASES.forEach(function(p){
    var it = ts.filter(function(t){ return t.ph === p.id; }); if(!it.length) return;
    out.push('', '■ ' + p.n);
    it.forEach(function(t){ out.push((S.done[t.id] ? '☑ ' : '☐ ') + t.title + '（' + TAGN[t.tag] + '，' + (t.start === t.end ? '' : md(t.start) + '～') + md(t.end) + '）'); });
  });
  out.push('', '※ 一般性整理，規定以主管機關最新公告為準');
  return out.join('\n');
}
function copyText(s){
  if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function(){ toast('已複製，可以貼到 LINE 或筆記'); }, function(){ fallbackCopy(s); });
  fallbackCopy(s);
}
function fallbackCopy(s){ var t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); toast('已複製'); }catch(e){ toast('無法自動複製'); } t.remove(); }
function b64e(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function shareUrl(){ return location.origin + location.pathname + '#s=' + b64e(JSON.stringify(S.ctx)); }
function restoreFile(e){
  var f = e.target.files[0]; if(!f) return;
  f.text().then(function(s){
    var d = JSON.parse(s); if(!d || d.app !== 'shop-opening-checklist') throw 0;
    var n = cleanState(d); if(!n.ctx) throw 0;
    if(demo){ demo = false; saved = null; }
    S = n; save(); closeModal(); render(); toast('已還原備份');
  }).catch(function(){ toast('這個檔案不是開店前置清單的備份檔'); });
}

/* ---------- 下載 PDF（html2pdf.js 點擊時才載入；每頁疊馬克老師浮水印） ---------- */
var H2P_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
function loadH2P(){
  if(window.html2pdf) return Promise.resolve();
  return new Promise(function(ok, no){ var s = document.createElement('script'); s.src = H2P_URL; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}
function fadedWatermark(alpha){   // 先把浮水印畫成半透明 PNG，不依賴 jsPDF 的透明度 API
  return new Promise(function(ok, no){
    var im = new Image(); im.onload = function(){ var c = document.createElement('canvas'); c.width = im.width; c.height = im.height; var x = c.getContext('2d'); x.globalAlpha = alpha; x.drawImage(im, 0, 0); ok({url:c.toDataURL('image/png'), w:im.width, h:im.height}); };
    im.onerror = no; im.src = window.SOC_WATERMARK;
  });
}
function reportEl(){
  var c = S.ctx, ts = allTasks(), st = stats(ts), dd = D.dayDiff(today(), c.open), bt = budgetTotals();
  var h = '<style>' +
    '#pdfReport,#pdfReport *{box-sizing:border-box}#pdfReport{width:100%;padding:2px 8px 2px 2px;background:#fff;color:#222;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;font-size:13px;line-height:1.55}' +
    '#pdfReport h1{font-family:"Noto Serif TC",serif;font-size:24px;margin:0 0 4px;color:#3B2B20}' +
    '#pdfReport .meta{color:#555;font-size:12px;margin:0}' +
    '#pdfReport .warn{font-size:11px;color:#8a2a1f;margin:6px 0 10px;border:1px solid #e3c4bd;border-radius:6px;padding:4px 8px;background:#fdf5f3}' +
    '#pdfReport .kp{display:flex;gap:8px;margin:8px 0 6px}#pdfReport .kp div{flex:1;border:1px solid #d6c6ad;border-radius:8px;padding:5px 9px;background:#faf6ee}' +
    '#pdfReport .kp b{display:block;font-size:20px;line-height:1.2}#pdfReport .kp span{font-size:11px;color:#6a5b4d}' +
    '#pdfReport h2{font-family:"Noto Serif TC",serif;font-size:17px;color:#3B2B20;border-bottom:2px solid #3B2B20;margin:14px 0 6px;padding-bottom:2px}' +
    '#pdfReport h2 small{font-family:"Noto Sans TC",sans-serif;font-size:11px;color:#6a5b4d;font-weight:500;margin-left:8px}' +
    '#pdfReport .r-task{border:1px solid #ccc;border-left:5px solid #2E5A87;border-radius:6px;padding:5px 9px;margin:5px 0}' +
    '#pdfReport .r-task.must{border-left-color:#B3261E}#pdfReport .r-task.maybe{border-left-color:#9A5800}#pdfReport .r-task.done{border-left-color:#2C6A4A;background:#f6faf7}' +
    '#pdfReport .tt{font-weight:900;font-size:14px}#pdfReport .bx{font-size:16px;margin-right:4px}' +
    '#pdfReport .tg{display:inline-block;font-size:10.5px;font-weight:900;color:#fff;border-radius:3px;padding:0 5px;margin-left:6px;vertical-align:2px;background:#2E5A87}' +
    '#pdfReport .tg.must{background:#B3261E}#pdfReport .tg.maybe{background:#9A5800}#pdfReport .tg.custom{background:#6a5b4d}' +
    '#pdfReport .dt{float:right;font-size:11.5px;color:#555;font-weight:700}#pdfReport .dt.late{color:#B3261E}#pdfReport .dt.ok{color:#2C6A4A}' +
    '#pdfReport .why{margin:2px 0;color:#333;font-size:12px}#pdfReport .ln{margin:1px 0;font-size:12px}#pdfReport .ln b{color:#6a5b4d;margin-right:4px}' +
    '#pdfReport .nt{margin:3px 0 0;font-size:12.5px;font-family:"LXGW WenKai TC","Kaiti TC",serif;background:#fffbea;border-radius:4px;padding:1px 6px}' +
    '#pdfReport table{width:100%;border-collapse:collapse;font-size:12.5px}#pdfReport td{border:1px solid #d6c6ad;padding:3px 8px}#pdfReport td.n{text-align:right;font-variant-numeric:tabular-nums}' +
    '#pdfReport .src{font-size:10.5px;color:#666;margin-top:12px}' +
    '</style><div id="pdfReport">' +
    '<h1>' + esc(c.name || '我的店') + '・開店前置清單</h1>' +
    '<p class="meta">預計開幕 ' + c.open + '｜' + esc(ctxLine(c)) + '｜產出日期 ' + today() + '</p>' +
    '<div class="kp"><div><b>' + st.done + ' / ' + st.total + '</b><span>項已完成</span></div><div><b>' + (dd >= 0 ? dd + ' 天' : '已開幕') + '</b><span>距離開幕</span></div>' +
    '<div><b>' + st.late + '</b><span>項已逾期</span></div><div><b>' + st.mustLeft + '</b><span>項必辦未完成</span></div></div>' +
    '<p class="warn">本清單是一般性整理，不是法律、稅務或會計意見；各縣市規定不同，辦理前請以主管機關最新公告為準。日期為建議辦理期間。</p>';
  D.PHASES.forEach(function(p){
    var items = ts.filter(function(t){ return t.ph === p.id; }); if(!items.length) return;
    h += '<h2>' + p.n + '<small>' + p.s + '・完成 ' + items.filter(function(t){ return S.done[t.id]; }).length + '/' + items.length + '</small></h2>';
    items.forEach(function(t){
      var s = status(t), dn = s === 'done', range = t.start === t.end ? md(t.end) : md(t.start) + '～' + md(t.end);
      var dtx = dn ? '✓ ' + md(S.done[t.id]) + ' 完成' : s === 'late' ? range + '・逾期 ' + D.dayDiff(t.end, today()) + ' 天' : range;
      h += '<div class="r-task ' + (dn ? 'done' : t.tag) + '"><span class="dt' + (dn ? ' ok' : s === 'late' ? ' late' : '') + '">' + dtx + '</span>' +
        '<span class="bx">' + (dn ? '☑' : '☐') + '</span><span class="tt">' + esc(t.title) + '</span><span class="tg ' + t.tag + '">' + TAGN[t.tag] + '</span>' +
        (t.why ? '<p class="why">' + esc(t.why) + '</p>' : '') +
        (t.custom ? '' : '<p class="ln"><b>去哪辦</b>' + esc(t.where) + '</p>' + (t.prep.length ? '<p class="ln"><b>要準備</b>' + esc(t.prep.join('、')) + '</p>' : '') + (t.src ? '<p class="ln"><b>依據</b>' + esc(t.src) + '</p>' : '')) +
        (S.notes[t.id] ? '<p class="nt">備註：' + esc(S.notes[t.id]) + '</p>' : '') + '</div>';
    });
  });
  if(bt.total || bt.fund){
    var b = S.budget, rows = D.DEFAULT_BUDGET.map(function(x){ return '<tr><td>' + x.n + '</td><td class="n">' + money(b.items[x.k]) + ' 元</td></tr>'; }).join('');
    h += '<div class="r-task" style="border-left-color:#3B2B20"><h2 style="margin-top:2px">開辦預算</h2><table>' + rows +
      '<tr><td>周轉金（每月 ' + money(b.monthly) + ' 元 × ' + b.months + ' 個月）</td><td class="n">' + money(bt.reserve) + ' 元</td></tr>' +
      '<tr><td><b>總共需要</b></td><td class="n"><b>' + money(bt.total) + ' 元</b></td></tr>' +
      '<tr><td>自有資金＋貸款</td><td class="n">' + money(bt.fund) + ' 元</td></tr>' +
      '<tr><td><b>' + (bt.gap >= 0 ? '資金足夠，多出' : '資金缺口') + '</b></td><td class="n"><b>' + money(Math.abs(bt.gap)) + ' 元</b></td></tr></table></div>';
  }
  h += '<p class="src">法規數字依 2026 年 11 月查證：營業稅起徵點、商業登記法第 5 條、勞工保險條例、就業保險法、勞工職業災害保險及保護法、勞工退休金條例、勞動基準法、食品安全衛生管理法、衛福部食品業者投保產品責任保險公告等。完整清單與連結請見線上版操作手冊。創作者 Mark Tsai（蔡豐全）｜m255525.github.io/shop-opening-checklist</p></div>';
  var el = document.createElement('div'); el.innerHTML = h; return el;
}
var pdfBusy = false;
function downloadPdf(){
  if(pdfBusy) return; pdfBusy = true; toast('正在產生 PDF，請稍候…');
  var name = (S.ctx.name || '開店') + '前置清單-' + today() + '.pdf', el = reportEl();
  Promise.all([loadH2P(), fadedWatermark(.11), document.fonts ? document.fonts.ready : null]).then(function(r){
    var wm = r[1];
    // 量高度決定解析度，避免畫布超過瀏覽器上限
    var probe = el.cloneNode(true); probe.style.cssText = 'position:absolute;left:-9999px;top:0'; document.body.appendChild(probe);
    var hgt = probe.querySelector('#pdfReport').offsetHeight; probe.remove();
    var scale = Math.max(1, Math.min(2, 30000 / Math.max(hgt, 1)));
    return html2pdf().set({
      margin:[12, 10, 14, 10], filename:name, image:{type:'jpeg', quality:.92},
      html2canvas:{scale:scale, backgroundColor:'#ffffff', useCORS:true},
      jsPDF:{unit:'mm', format:'a4', orientation:'portrait'},
      pagebreak:{mode:['css', 'legacy'], avoid:['.r-task', 'h2', 'tr', '.kp']}
    }).from(el).toPdf().get('pdf').then(function(pdf){
      var n = pdf.internal.getNumberOfPages(), W = 210, H = 297, w = W * .42, hh = w * wm.h / wm.w;
      for(var i = 1; i <= n; i++){
        pdf.setPage(i);
        pdf.addImage(wm.url, 'PNG', (W - w) / 2, (H - hh) / 2, w, hh, 'socwm', 'FAST');
        pdf.setFontSize(8); pdf.setTextColor(140);
        pdf.text('m255525.github.io/shop-opening-checklist', 10, H - 6);
        pdf.text(i + ' / ' + n, W - 10, H - 6, {align:'right'});
      }
    }).save();
  }).then(function(){ toast('PDF 已下載'); }, function(){ toast('PDF 產生失敗（可能沒有網路），請改用「🖨 列印」另存 PDF'); })
    .then(function(){ pdfBusy = false; });
}

/* ---------- 範例模式 ---------- */
function enterDemo(key){
  var ex = D.EXAMPLES.filter(function(e){ return e.key === key; })[0]; if(!ex) return;
  if(!demo) saved = S;
  var ctx = Object.assign({}, ex.ctx, {open:D.fmt(D.addDays(new Date(), 40))});
  var st = cleanState({ctx:ctx}), ts = D.buildTasks(st.ctx), td = today(), skip = null;
  ts.forEach(function(t){ if(t.end < td && t.tag === 'must' && (!skip || t.end > skip.end)) skip = t; }); // 留最晚到期的一項當「逾期」示範
  ts.forEach(function(t){ if(t.end < td && t !== skip) st.done[t.id] = D.fmt(D.addDays(D.parseDate(t.end), -3)); });
  st.notes[ts[0].id] = '這是範例備註：記帳士王小姐（虛構）說開幕前一個月再對一次預算。';
  st.budget = cleanBudget({items:{deposit:120000, reno:450000, equip:380000, stock:80000, fees:30000, promo:40000}, monthly:150000, months:6, own:900000, loan:600000});
  S = st; demo = true; V.demoKey = key; V.editing = false; V.draft = null; closeModal(); render(); window.scrollTo(0, 0); toast('範例：' + ex.label);
}
function leaveDemo(){ demo = false; S = saved || load(); saved = null; closeModal(); render(); toast('已回到您自己的清單'); }

/* ---------- 事件 ---------- */
var ACT = {
  close:closeModal, warn:showWarn, settings:openSettings,
  edit:function(){ closeModal(); V.editing = true; V.draft = null; render(); window.scrollTo(0, 0); },
  cancelEdit:function(){ V.editing = false; V.draft = null; render(); },
  suggest:function(){ readDraftText(); if(!V.draft.type){ $('setupErr').textContent = '請先選店型'; return; } V.draft.org = suggestOrg(V.draft); render(); },
  leaveDemo:leaveDemo,
  foldall:function(){ var all = document.querySelectorAll('.set-sec'), any = [].some.call(all, function(d){ return !d.open; }); all.forEach(function(d){ d.open = any; }); },
  addCustom:function(){
    openModal('<h2>＋ 自訂項目</h2><p class="small">清單沒列到、但您要做的事，例如「跟房東約交屋」。</p><div class="mini">' +
      '<label class="fld">要做什麼<input id="cTitle" maxlength="60"></label><label class="fld">放在哪個階段<select id="cPh">' + D.PHASES.map(function(p){ return '<option value="' + p.id + '">' + p.n + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld">截止日<input id="cEnd" type="date" value="' + S.ctx.open + '"></label></div><p id="cErr" style="color:var(--must);font-weight:900"></p><div class="stack"><button class="btn" data-act="saveCustom">加入清單</button><button class="btn alt" data-act="close">取消</button></div>');
    $('cTitle').focus();
  },
  saveCustom:function(){
    var t = $('cTitle').value.trim(), e = $('cEnd').value;
    if(!t || !D.parseDate(e)){ $('cErr').textContent = '請填要做什麼和截止日'; return; }
    S.custom.push({id:'c' + Date.now().toString(36), ph:$('cPh').value, title:t.slice(0, 60), end:e}); save(); closeModal(); render(); toast('已加入');
  },
  print:function(){ if(V.tab !== 'list'){ V.tab = 'list'; render(); } setTimeout(function(){ window.print(); }, 50); },
  ics:function(){ download((S.ctx.name || '開店') + '前置清單.ics', icsText(), 'text/calendar'); toast('已下載，用 Google 日曆或手機行事曆「匯入」就好'); },
  pdf:downloadPdf,
  copy:function(){ copyText(plainText()); },
  share:function(){
    openModal('<h2>🔗 分享開店設定</h2><p>這個連結只帶開店條件（店型、型態、員工、場地、開幕日），<b>不會帶您的勾選、備註和預算</b>。適合傳給合夥人或記帳士，對方打開就看到同一份清單。</p>' +
      '<div class="mini"><input id="shareUrl" readonly value="' + esc(shareUrl()) + '"></div><div class="stack"><button class="btn" data-act="copyShare">複製連結</button><button class="btn alt" data-act="close">關閉</button></div>');
  },
  copyShare:function(){ copyText($('shareUrl').value); },
  backup:function(){ download('開店前置清單備份-' + today() + '.json', JSON.stringify({app:'shop-opening-checklist', v:1, saved:new Date().toISOString(), ctx:S.ctx, done:S.done, notes:S.notes, custom:S.custom, budget:S.budget}, null, 1), 'application/json'); },
  restore:function(){ $('restoreFile').click(); },
  wipe:function(){
    openModal('<h2>清除全部資料？</h2><p>開店設定、勾選、備註、自訂項目和預算都會刪掉，無法復原。建議先下載備份檔。</p><div class="stack"><button class="btn red" data-act="wipeYes">確定清除</button><button class="btn alt" data-act="close">取消</button></div>');
  },
  wipeYes:function(){ ['ctx', 'done', 'notes', 'custom', 'budget'].forEach(lsDel); demo = false; saved = null; S = load(); V.draft = null; V.editing = false; closeModal(); render(); toast('已清除'); },
  install:function(){
    var m = ios ? '請按 Safari 下方的「分享」圖示，選「加入主畫面」。' : '請按瀏覽器網址列右側的安裝圖示，或右上角選單的「安裝應用程式／加到主畫面」。';
    if(window._dp){ window._dp.prompt(); window._dp.userChoice.then(function(){ window._dp = null; }); }
    else openModal('<h2>📲 加入主畫面</h2><p>' + m + '</p><div class="stack"><button class="btn" data-act="close">知道了</button></div>');
  },
  useShared:function(){ var c = V.pendingShare; V.pendingShare = null; if(demo) leaveDemo(); S.ctx = c; save(); closeModal(); render(); toast('已套用連結裡的開店設定'); }
};
document.addEventListener('click', function(e){
  var el = e.target.closest('[data-act],[data-check],[data-toggle],[data-tab],[data-group],[data-filter],[data-set],[data-fontsize],[data-demo],[data-delcustom]');
  if(!el){ if(e.target.id === 'modal') closeModal(); return; }
  var ds = el.dataset;
  if(ds.act){ if(el.tagName === 'A') e.preventDefault(); if(ACT[ds.act]) ACT[ds.act](); return; }
  if(ds.check){
    var id = ds.check, before = stats(allTasks());
    if(S.done[id]) delete S.done[id]; else S.done[id] = today();
    save(); render();
    var after = stats(allTasks()); if(after.total && after.done === after.total && before.done < before.total){ confetti(); toast('🎉 全部完成，鐵捲門拉起來了，開張大吉！'); }
    return;
  }
  if(ds.toggle){ V.open[ds.toggle] = !V.open[ds.toggle]; var art = el.closest('.task'); art.querySelector('.detail').hidden = !V.open[ds.toggle]; el.setAttribute('aria-expanded', !!V.open[ds.toggle]); return; }
  if(ds.tab){ V.tab = ds.tab; lsSet('tab', V.tab); render(); return; }
  if(ds.group){ V.group = ds.group; lsSet('group', V.group); render(); return; }
  if(ds.filter){ V.filter = ds.filter; render(); return; }
  if(ds.set){
    readDraftText(); var d = V.draft; d[ds.set] = ds.val;
    if(ds.set === 'type' && !d.place) d.place = ds.val === 'online' ? 'none' : ds.val === 'stall' ? 'spot' : 'rent';
    renderSetup(); return;
  }
  if(ds.fontsize){ lsSet('fs', ds.fontsize); applyView(); openSettings(); return; }
  if(ds.demo){ enterDemo(ds.demo); return; }
  if(ds.delcustom){ S.custom = S.custom.filter(function(c){ return c.id !== ds.delcustom; }); delete S.done[ds.delcustom]; delete S.notes[ds.delcustom]; save(); render(); toast('已刪除'); }
});
var noteT;
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.dataset.note){ var id = t.dataset.note; clearTimeout(noteT); noteT = setTimeout(function(){ if(t.value.trim()) S.notes[id] = t.value.slice(0, 1000); else delete S.notes[id]; save(); }, 400); return; }
  if(t.dataset.budget){
    var k = t.dataset.budget, v = Math.max(0, parseInt(t.value.replace(/[^\d]/g, ''), 10) || 0);
    if(k === 'months') S.budget.months = Math.min(v, 60) || 0; else if(S.budget.items.hasOwnProperty(k)) S.budget.items[k] = v; else S.budget[k] = v;
    save(); var tt = budgetTotals();
    $('bItems').textContent = money(tt.items) + ' 元'; $('bReserve').textContent = money(tt.reserve) + ' 元'; $('bTotal').textContent = money(tt.total) + ' 元'; $('bGap').innerHTML = gapText(tt);
    return;
  }
  if(t.dataset.flag && V.draft){ readDraftText(); V.draft[t.dataset.flag] = t.checked; if(t.dataset.flag === 'food') renderSetup(); return; }
  if(t.id === 'fSales' && V.draft){ V.draft.sales = t.value; $('advice').innerHTML = adviceHtml(V.draft); }
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.dataset.budget){ var k = t.dataset.budget, v = k === 'months' ? S.budget.months : S.budget.items.hasOwnProperty(k) ? S.budget.items[k] : S.budget[k]; t.value = v ? money(v) : ''; }
});
document.addEventListener('submit', function(e){ if(e.target.id === 'setupForm') submitSetup(e); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && $('modal').classList.contains('show')) closeModal(); });

/* ---------- 分享連結 ---------- */
function readHash(){
  var m = /#s=([\w-]+)/.exec(location.hash); if(!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  var c; try{ c = cleanCtx(JSON.parse(b64d(m[1]))); }catch(e){ c = null; }
  if(!c){ toast('分享連結格式不對，已略過'); return; }
  if(!S.ctx){ S.ctx = c; save(); toast('已套用連結裡的開店設定'); return; }
  if(JSON.stringify(S.ctx) === JSON.stringify(c)) return;
  V.pendingShare = c;
  setTimeout(function(){ openModal('<h2>🔗 要套用連結裡的開店設定嗎？</h2><p class="small">' + esc(ctxLine(c)) + '・' + c.open + ' 開幕</p><p>您目前已經有自己的開店設定。套用後清單會依新條件重排，<b>勾選、備註和預算都會保留</b>。</p><div class="stack"><button class="btn" data-act="useShared">套用</button><button class="btn alt" data-act="close">不要，維持我的設定</button></div>'); }, 0);
}

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});
(function(){ if(!window.SOC_WATERMARK) return; var w = document.createElement('div'); w.id = 'pdfWatermark'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<img alt="" src="' + window.SOC_WATERMARK + '">'; document.body.appendChild(w); })();   // 列印時每頁疊浮水印
applyView(); readHash(); render(); initMarquee();
window.addEventListener('hashchange', function(){ if(/#s=/.test(location.hash)){ readHash(); render(); } });
if(!lsGet('warnSeen')){ lsSet('warnSeen', '1'); showWarn(); }
/* 給 ai.js 用的介面 */
window.SOC_APP = {
  get S(){ return S; }, get V(){ return V; }, get demo(){ return demo; },
  openModal:openModal, closeModal:closeModal, toast:toast, esc:esc, md:md, today:today, money:money, TAGN:TAGN,
  allTasks:allTasks, status:status, stats:stats, ctxLine:ctxLine, budgetTotals:budgetTotals, copyText:copyText, download:download,
  render:render, renderSetup:renderSetup, readDraftText:readDraftText, save:save, lsGet:lsGet, lsSet:lsSet, lsJson:lsJson, openSettings:openSettings,
  applyDraft:function(o){ readDraftText(); if(!V.draft) V.draft = defaultDraft(); for(var k in o) V.draft[k] = o[k]; renderSetup(); }
};
window._soc = {render:render, reportEl:reportEl, downloadPdf:downloadPdf, allTasks:allTasks, stats:stats, enterDemo:enterDemo, leaveDemo:leaveDemo, icsText:icsText, plainText:plainText, shareUrl:shareUrl, groupOf:groupOf,
  get S(){ return S; }, get V(){ return V; }};
})();
