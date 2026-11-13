// 規則引擎測試：node tools/test_engine.mjs（改 data.js 後要跑）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../data.js');
let fail = 0, n = 0;
const ok = (c, m) => { n++; if(!c){ fail++; console.log('FAIL ' + m); } };
const base = {name:'', type:'food', org:'ltd', sales:45, staff:'1-4', place:'rent', reno:true, sign:true, music:true, member:true, delivery:true, food:false, open:'2027-03-01'};
const ids = c => D.buildTasks(Object.assign({}, base, c)).map(t => t.id);
const has = (c, id) => ids(c).includes(id);

// 每個任務欄位完整
const seen = new Set();
D.TASKS.forEach(t => {
  ok(!seen.has(t.id), 'id 重複 ' + t.id); seen.add(t.id);
  ok(/^[a-z_]+$/.test(t.id), 'id 格式 ' + t.id);
  ok(D.PHASES.some(p => p.id === t.ph), '階段 ' + t.id);
  ok(Array.isArray(t.o) && t.o[0] <= t.o[1], '期間 ' + t.id);
  ok(typeof t.when === 'function', 'when ' + t.id);
});
// 所有組合都能產生、文字都是字串、連結都是 https
const keys = o => Object.keys(o);
let combos = 0;
keys(D.TYPES).forEach(type => keys(D.ORGS).forEach(org => keys(D.STAFF).forEach(staff => keys(D.PLACES).forEach(place => [0, 3, 8, 15, 30].forEach(sales => {
  const ts = D.buildTasks(Object.assign({}, base, {type, org, staff, place, sales})); combos++;
  ts.forEach(t => {
    ok(['must', 'maybe', 'tip'].includes(t.tag), 'tag ' + t.id);
    ['title', 'why', 'where'].forEach(f => ok(typeof t[f] === 'string' && t[f].length > 1, f + ' ' + t.id));
    t.links.forEach(l => ok(/^https:\/\//.test(l.u) && l.t, 'link ' + t.id));
    ok(t.start <= t.end, '日期 ' + t.id);
  });
})))));

// 起徵點
ok(D.threshold({type:'food'}) === 10 && D.threshold({type:'retail'}) === 10 && D.threshold({type:'online'}) === 10, '貨物業 10 萬');
ok(D.threshold({type:'beauty'}) === 5 && D.threshold({type:'service'}) === 5, '勞務業 5 萬');
// 登記
ok(has({org:'ltd'}, 'coreg') && !has({org:'ltd'}, 'bizreg'), '公司辦公司登記');
ok(has({org:'sole'}, 'bizreg') && !has({org:'sole'}, 'coreg'), '行號辦商業登記');
ok(!has({org:'small'}, 'prename') && has({org:'small'}, 'taxreg'), '小規模只辦稅籍');
// 勞健保
ok(!has({staff:'0'}, 'ins_ei') && has({staff:'1-4'}, 'ins_ei'), '就保 1 人');
const li = s => D.buildTasks(Object.assign({}, base, {staff:s})).find(t => t.id === 'ins_li');
ok(li('1-4').tag === 'maybe' && li('5-29').tag === 'must', '勞保 5 人');
ok(!has({staff:'5-29'}, 'rules') && has({staff:'30+'}, 'rules'), '工作規則 30 人');
// 食安
ok(has({type:'food'}, 'foodreg') && !has({type:'retail', food:false}, 'foodreg') && has({type:'retail', food:true}, 'foodreg'), '食品登錄');
ok(has({type:'food', org:'ltd'}, 'foodins') && !has({type:'food', org:'small'}, 'foodins'), '產品責任險限有登記');
ok(!has({type:'retail', delivery:true, food:false}, 'delivery'), '非餐飲不出現外送');
// 場地
ok(has({place:'rent'}, 'lease') && !has({place:'own'}, 'lease'), '租約');
ok(!has({place:'none', type:'online'}, 'fire') && !has({place:'none', type:'online'}, 'music'), '網店無消防音樂');
ok(has({type:'online', member:false}, 'online') && has({type:'online', member:false}, 'privacy'), '網店消保個資');
ok(has({type:'stall', place:'spot'}, 'stall'), '攤販許可');
// 發票
const inv = s => D.buildTasks(Object.assign({}, base, {sales:s})).find(t => t.id === 'invoice').title;
ok(/使用統一發票/.test(inv(25)) && /免用/.test(inv(12)), '20 萬發票門檻');
// 建議文字
ok(D.orgAdvice({type:'online', org:'small', sales:6, staff:'0', place:'home'}).join('').includes('免辦商業登記'), '未達起徵點建議');
ok(D.orgAdvice({type:'online', org:'small', sales:12, staff:'0', place:'home'}).join('').includes('⚠'), '小規模超過起徵點警告');
// 日期
const t0 = D.buildTasks(base).find(t => t.id === 'budget');
ok(t0.start === '2026-11-01' && t0.end === '2026-12-01', '日期推算 ' + t0.start + ' ' + t0.end);
ok(D.dayDiff('2027-02-27', '2027-03-01') === 2, 'dayDiff');
// 範例
D.EXAMPLES.forEach(e => ok(D.buildTasks(Object.assign({open:'2027-03-01'}, e.ctx)).length > 10, '範例 ' + e.key));

console.log((fail ? '❌ ' : '✅ ') + (n - fail) + '/' + n + ' 通過（' + combos + ' 種組合）');
process.exit(fail ? 1 : 0);
