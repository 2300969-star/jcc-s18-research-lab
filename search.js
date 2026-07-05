// 自由组合搜索：不受官方阵容约束，全英雄×全装备组合暴力模拟，找数值/机制异常组合
// 输出并入 model_results.json 的 combosearch 字段
const fs = require('fs');
const path = require('path');
const { simulate, tankEHP, chess, equip, comps } = require('./model.js');

const byName = {};
Object.values(equip).forEach(e => { if (!byName[e.name]) byName[e.name] = e.id; });
const id = n => byName[n];

// 输出装池（22件）与坦装池（12件）
const OFFENSE = ['无尽之刃', '海克斯科技枪刃', '朔极之矛', '夜之锋刃', '汲取剑', '泰坦的坚决', '班克斯的魔法帽', '大天使之杖', '最后的轻语', '珠光护手', '水银', '强袭者的链枷', '锐利之刃', '疾射火炮', '鬼索的狂暴之刃', '斯塔缇克电刃', '卢安娜的飓风', '蓝霸符', '巨人捕手', '莫雷洛秘典', '正义之手', '基克的先驱'].map(id).filter(Boolean);
const DEFENSE = ['狂徒铠甲', '日炎斗篷', '圣盾使的誓约', '石像鬼石板甲', '振奋盔甲', '棘刺背心', '巨龙之爪', '钢铁烈阳之匣', '离子火花', '夜之锋刃', '水银', '汲取剑'].map(id).filter(Boolean);
const UNIQUE = new Set([id('蓝霸符')].filter(Boolean)); // [唯一]装备至多1件

// 去重英雄（62个），星级规则与主模型一致：3费以下按3星、4/5费按2星
const seen = new Set();
const heroes = Object.values(chess).filter(u => u.showHeroTag === '1' && Number(u.price) >= 1 && Number(u.price) <= 5 && !seen.has(u.name) && seen.add(u.name));

// 官方对照：主C同款(英雄+装备完全一致)、官方主C池、官方任意上场英雄
const officialBuilds = new Set(), officialCarries = new Set(), officialUsed = new Set();
comps.forEach(c => {
  if (c.carry) { officialCarries.add(c.carry.hero); officialBuilds.add(c.carry.hero + '|' + c.carryItems.slice().sort().join()); }
  (c.detail.heroes || []).forEach(h => officialUsed.add(h.name));
});

// 允许重复装备的三件组合（官方就有2×飓风/3×基克先驱的用法）
function* combos(pool) {
  for (let i = 0; i < pool.length; i++)
    for (let j = i; j < pool.length; j++)
      for (let k = j; k < pool.length; k++) {
        if (UNIQUE.has(pool[i]) && i === j) continue;
        if (UNIQUE.has(pool[j]) && j === k) continue;
        yield [pool[i], pool[j], pool[k]];
      }
}

console.error('搜索空间：', heroes.length, '英雄 ×', [...combos(OFFENSE)].length, 'DPS组合 +', [...combos(DEFENSE)].length, 'EHP组合');

// —— DPS 搜索 ——
const t0 = Date.now();
let best = []; // 全局top
const bestPerHero = {};
for (const h of heroes) {
  const star = Number(h.price) <= 3 ? 3 : 2;
  for (const c of combos(OFFENSE)) {
    const r = simulate(h.id, c, star);
    if (!r) continue;
    const names = c.map(x => equip[x].name);
    const key = h.name + '|' + names.slice().sort().join();
    const flag = officialBuilds.has(key) ? '官方同款' : officialCarries.has(h.name) ? '同C换装' : officialUsed.has(h.name) ? '官方非C' : '野路子';
    const row = { hero: h.name, price: Number(h.price), star, items: names, dps: Math.round(r.dps), auto: Math.round(r.auto), spell: Math.round(r.spell), proc: Math.round(r.proc), flag };
    if (!bestPerHero[h.name] || row.dps > bestPerHero[h.name].dps) bestPerHero[h.name] = row;
    if (best.length < 400 || row.dps > best[best.length - 1].dps) {
      best.push(row); best.sort((a, b) => b.dps - a.dps); if (best.length > 400) best.length = 400;
    }
  }
}
console.error('DPS搜索完成', ((Date.now() - t0) / 1000).toFixed(1) + 's');

// —— EHP 搜索 ——
let bestTank = [];
for (const h of heroes) {
  const star = Number(h.price) >= 5 ? 2 : 2; // 统一2星（不吃追三假设，5费2星=大成）
  for (const c of combos(DEFENSE)) {
    const r = tankEHP(h.id, c, star);
    if (!r) continue;
    const row = { hero: h.name, price: Number(h.price), star, items: c.map(x => equip[x].name), ehp: Math.round(r.ehp) };
    if (bestTank.length < 200 || row.ehp > bestTank[bestTank.length - 1].ehp) {
      bestTank.push(row); bestTank.sort((a, b) => b.ehp - a.ehp); if (bestTank.length > 200) bestTank.length = 200;
    }
  }
}

// 汇总：全局Top20 / 每英雄最优里挑"非官方主C"的Top10（=候选bug组合） / 坦克Top10(去重英雄)
const top = best.slice(0, 20);
const perHeroTop = Object.values(bestPerHero).sort((a, b) => b.dps - a.dps).slice(0, 12);
const offMeta = Object.values(bestPerHero).filter(r => r.flag === '官方非C' || r.flag === '野路子').sort((a, b) => b.dps - a.dps).slice(0, 10);
const tankSeen = new Set();
const topTank = bestTank.filter(r => !tankSeen.has(r.hero) && tankSeen.add(r.hero)).slice(0, 10);
// 官方最优主C基准（对照用）
const officialBest = Math.max(...comps.filter(c => c.carry).map(c => c.carry.dps));

const out = JSON.parse(fs.readFileSync(path.join(__dirname, 'model_results.json'), 'utf8'));
out.combosearch = {
  space: { heroes: heroes.length, dpsCombos: [...combos(OFFENSE)].length, ehpCombos: [...combos(DEFENSE)].length },
  officialBestDps: Math.round(officialBest),
  top, perHeroTop, offMeta, topTank,
};
fs.writeFileSync(path.join(__dirname, 'model_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, '可视化', 'data.js'), 'window.MODEL=' + JSON.stringify(out) + ';');

console.log('官方最优主C基准DPS:', Math.round(officialBest));
console.log('\n== 全局Top20 ==');
top.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.hero}${r.star}星(${r.price}费) ${r.items.join('+')} = ${r.dps} [${r.flag}]`));
console.log('\n== 非官方主C的最强候选(bug组合候选) ==');
offMeta.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.hero}${r.star}星(${r.price}费) ${r.items.join('+')} = ${r.dps} [${r.flag}]`));
console.log('\n== 坦克EHP Top10 ==');
topTank.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.hero}2星(${r.price}费) ${r.items.join('+')} = ${r.ehp}`));
