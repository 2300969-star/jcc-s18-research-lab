// 解析 jcc.qq.com 怪兽入侵(mode8 S18) 官方阵容数据 → notes/阵容全量明细.md + 聚合统计
const fs = require('fs');
const path = require('path');
const D = p => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', p), 'utf8'));

const chess = D('chess.js').data;
const equip = D('equip.js').data;
const hex = D('hex.js').data;
const race = D('race.js').data;
const job = D('job.js').data;
const monster = D('monster.js').data;
const { lineup_list } = D('lineup_detail_total.json');

const heroName = id => chess[id] ? `${chess[id].name}(${chess[id].price}费)` : `?${id}`;
const equipName = id => equip[id] ? equip[id].name : `?${id}`;
const hexName = id => hex[id] ? `${hex[id].name}[${hex[id].level}级]` : `?${id}`;
const monsterName = id => monster[id] ? monster[id].name : `?${id}`;
const traitName = c => {
  const t = job[c.id] || race[c.id];
  if (!t) return null;
  const min = Number(String(t.numList || '').split('|')[0]) || 1;
  return `${c.num}${t.name}${c.num >= min ? '' : '(未激活,需' + min + ')'}`;
};
const csv = (s, fn) => (s || '').split(',').filter(Boolean).map(fn);

const Q = { S: 0, A: 1, B: 2 };
const list = lineup_list
  .filter(l => l.simulator_edition === '17.17.6')
  .sort((a, b) => (Q[a.quality] - Q[b.quality]) || (Number(b.sortID) - Number(a.sortID)));

const hexCount = {}, itemCount = {}, monsterCount = {}, carryItemCount = {};
let md = `# 怪兽入侵（S18 铲铲市危机）官方全量阵容明细\n\n> 数据源：jcc.qq.com 阵容库 lineup_detail_total.json，模拟器版本 17.17.6（2026-06-24 生效），共 ${list.length} 套。S 级 ${list.filter(l => l.quality === 'S').length} 套。\n`;

for (const l of list) {
  const d = JSON.parse(l.detail);
  md += `\n---\n\n## [${l.quality}级] ${d.line_name}\n`;
  md += `- 作者：${l.lineupauthor_data?.name || '?'} ｜ 更新：${l.rel_time}\n`;
  const traits = (d.contact || []).map(traitName).filter(Boolean);
  if (traits.length) md += `- 羁绊：${traits.join(' / ')}\n`;
  const heroes = d.hero_location || [];
  md += `- 成型棋子：\n`;
  for (const h of heroes) {
    const items = csv(h.equipment_id, equipName);
    md += `  - ${h.is_carry_hero ? '⭐主C ' : ''}${heroName(h.hero_id)}${items.length ? '：' + items.join('+') : ''}\n`;
    if (l.quality === 'S') items.forEach(i => { itemCount[i] = (itemCount[i] || 0) + 1; if (h.is_carry_hero) carryItemCount[i] = (carryItemCount[i] || 0) + 1; });
  }
  if (d.hexbuff?.recomm) {
    const rec = csv(d.hexbuff.recomm, hexName), rep = csv(d.hexbuff.replace, hexName);
    md += `- 推荐强化符文：${rec.join('、')}\n`;
    if (rep.length) md += `- 替补符文：${rep.join('、')}\n`;
    if (l.quality === 'S') [...csv(d.hexbuff.recomm, x => x), ...csv(d.hexbuff.replace, x => x)].forEach(i => { const n = hexName(i); hexCount[n] = (hexCount[n] || 0) + 1; });
  }
  if (d.hex_info) md += `- 符文思路：${d.hex_info}\n`;
  if (d.monster?.recomm) {
    md += `- 推荐怪兽：${csv(d.monster.recomm, monsterName).join('、')}（替补：${csv(d.monster.replace, monsterName).join('、')}）\n`;
    if (l.quality === 'S') csv(d.monster.recomm, x => x).forEach(i => { const n = monsterName(i); monsterCount[n] = (monsterCount[n] || 0) + 1; });
  }
  if (d.monster_info) md += `- 怪兽思路：${d.monster_info}\n`;
  if (d.equipment_order) md += `- 散件优先级：${csv(d.equipment_order, equipName).join(' > ')}\n`;
  if (d.equipment_info) md += `- 装备思路：${d.equipment_info}\n`;
  if (d.early_info) md += `- 运营思路：${d.early_info}\n`;
  if (d.enemy_info) md += `- 克制关系：${d.enemy_info}\n`;
}

fs.writeFileSync(path.join(__dirname, 'notes', '阵容全量明细.md'), md);
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} x${v}`).join('\n');
console.log('S级阵容数:', list.filter(l => l.quality === 'S').length, '/ 总数:', list.length);
console.log('\n== S级阵容符文出现榜(含替补) ==\n' + top(hexCount, 25));
console.log('\n== S级阵容成装出现榜 ==\n' + top(itemCount, 20));
console.log('\n== S级主C装备榜 ==\n' + top(carryItemCount, 15));
console.log('\n== S级推荐怪兽榜 ==\n' + top(monsterCount, 10));
console.log('\n== S级阵容清单 ==');
list.filter(l => l.quality === 'S').forEach(l => console.log('-', JSON.parse(l.detail).line_name));
