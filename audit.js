const fs = require('fs');
const path = require('path');

const { ROOT, VERSION, EDITION, mdCell } = require('./audit-shared');
const { runDataAudit } = require('./audit-data');
const { runSkillParserAudit } = require('./audit-skill-parser');
const { runItemsAudit } = require('./audit-items');
const { runOutliersAudit } = require('./audit-outliers');

function table(headers, rows) {
  if (!rows.length) return '_无_\n';
  const h = `| ${headers.map(mdCell).join(' |')} |`;
  const sep = `| ${headers.map(() => '---').join(' |')} |`;
  const body = rows.map(row => `| ${row.map(mdCell).join(' |')} |`).join('\n');
  return `${h}\n${sep}\n${body}\n`;
}

function topRows(rows, n) {
  return rows.slice(0, n);
}

function buildReport(results) {
  const generated = new Date().toISOString();
  const { data, skills, items, outliers } = results;

  const report = [];
  report.push('# 金铲铲数值与 Bug 审计报告');
  report.push('');
  report.push(`> 生成时间：${generated}`);
  report.push(`> 数据版本：${VERSION}，阵容模拟器版本：${EDITION}`);
  report.push('');

  report.push('## 结论摘要');
  report.push('');
  report.push(`- 阵容羁绊字段异常：${data.summary.contactIssues} 套，其中 P1 空 ` +
    `contact 但可反推出有效羁绊的阵容 ${data.summary.p1ContactIssues} 套。`);
  report.push(`- 引用缺失：${data.summary.referenceIssues} 条。`);
  report.push(`- 同名英雄多记录：${data.summary.duplicateHeroNames} 组，需要在数值审计中明确规范 ID。`);
  report.push(`- 技能解析高风险英雄：${skills.summary.highRiskHeroes} 个；有伤害文本但当前模型完全未吃到伤害的英雄 ${skills.summary.zeroParsedDamageWithDamageText} 个。`);
  report.push(`- 装备基础属性漏解析：${items.summary.basicStatGaps} 处；高价值但未建模的装备特效 ${items.summary.unmodeledImportantEffects} 个。`);
  report.push(`- 异常组合搜索：${outliers.summary.heroes} 个英雄 x ${outliers.summary.offenseCombos} 套输出装；官方主C基准 ${outliers.summary.officialBestDps} DPS。`);
  report.push('');

  report.push('## 1. 数据一致性');
  report.push('');
  report.push('### 1.1 羁绊 contact 异常');
  report.push('');
  report.push(table(
    ['级别', '阵容', '质量', '官方 contact 数', '反推有效羁绊数', '问题摘要'],
    topRows(data.contactIssues, 20).map(x => [
      x.severity,
      x.line,
      x.quality,
      x.officialCount,
      x.inferredActiveCount,
      (x.problem || []).join(' / '),
    ]),
  ));

  report.push('### 1.2 引用缺失');
  report.push('');
  report.push(table(
    ['级别', '阵容', '类型', 'ID', '位置'],
    topRows(data.referenceIssues, 30).map(x => [x.severity, x.line, x.kind, x.id, x.where]),
  ));

  report.push('### 1.3 同名英雄多记录');
  report.push('');
  report.push('这些记录多数像是星级/形态分身，但 `showHeroTag=1` 会让朴素遍历重复看到同一个英雄。做精确数值审计时必须先归一化。');
  report.push('');
  report.push(table(
    ['英雄', '记录数', 'ID', '价格', '技能名', '基础面板变体数'],
    topRows(data.duplicateHeroNames, 20).map(x => [
      x.name,
      x.count,
      x.ids.join(', '),
      x.prices.join(', '),
      x.skillNames.join(' / '),
      x.statVariantCount,
    ]),
  ));

  report.push('## 2. 技能解析覆盖率');
  report.push('');
  report.push('当前 `model.js` 的 `parseSpell` 只吃“伤害”字段，并会跳过百分比、次数、抗性、时长、几率等关键词。因此护盾、治疗、控制、百分比伤害、护甲倍率、持续伤害都容易低估或漏算。');
  report.push('');
  report.push('### 2.1 高风险英雄');
  report.push('');
  report.push(table(
    ['风险分', '英雄', '费用', '技能', '吃到伤害组', '漏掉伤害组', '机制标签', 'S级主C/上场'],
    topRows(skills.highRiskHeroes, 25).map(x => [
      x.riskScore,
      x.name,
      x.price,
      x.skillName,
      x.consumedDamageGroups,
      x.ignoredDamageGroups,
      x.utilityLabels.join(' / '),
      `${x.official.sCarry ? 'S主C' : '-'} / ${x.official.sUsed ? 'S上场' : '-'}`,
    ]),
  ));

  report.push('### 2.2 有伤害文本但当前模型完全未解析伤害');
  report.push('');
  report.push(table(
    ['英雄', '费用', '技能', '漏掉原因片段', '机制标签'],
    topRows(skills.zeroParsedDamageWithDamageText, 25).map(x => [
      x.name,
      x.price,
      x.skillName,
      x.groups.filter(g => g.ignoredDamage).map(g => `${g.label}(${g.reason})`).join(' / '),
      x.utilityLabels.join(' / '),
    ]),
  ));

  report.push('## 3. 装备建模覆盖率');
  report.push('');
  report.push('### 3.1 基础属性漏解析');
  report.push('');
  report.push('这里的“漏解析”指装备 `basicDesc` 中有 `+数值属性`，但当前 `itemStats()` 正则不会计入模型。');
  report.push('');
  report.push(table(
    ['装备', '类型', '漏掉属性', 'S级出现次数', '主C出现次数'],
    topRows(items.basicStatGaps.sort((a, b) => b.usedInS - a.usedInS || b.carryUses - a.carryUses), 35)
      .map(x => [x.name, x.type, x.raw, x.usedInS, x.carryUses]),
  ));

  report.push('### 3.2 高价值但未建模的装备特效');
  report.push('');
  report.push(table(
    ['装备', '类型', '标签', 'S级出现次数', '主C出现次数', '效果摘要'],
    topRows(items.unmodeledImportantEffects, 35).map(x => [
      x.name,
      x.type,
      x.tagLabels.join(' / '),
      x.usedInS,
      x.carryUses,
      x.desc.slice(0, 90),
    ]),
  ));

  report.push('## 4. 异常组合搜索');
  report.push('');
  report.push('这部分沿用当前模型做暴力组合搜索，作用是找“值得进实战/录像复核”的候选，不等于真实强度定论。');
  report.push('');
  report.push('### 4.1 全局 DPS Top');
  report.push('');
  report.push(table(
    ['英雄', '星级', '装备', 'DPS', '平A', '技能', '特效', '标记'],
    topRows(outliers.topDps, 20).map(x => [
      x.hero,
      x.star,
      x.items.join(' + '),
      x.dps,
      x.auto,
      x.spell,
      x.proc,
      x.flag,
    ]),
  ));

  report.push('### 4.2 非官方主C高 DPS 候选');
  report.push('');
  report.push(table(
    ['英雄', '费用', '星级', '装备', 'DPS', '标记'],
    topRows(outliers.nonOfficialCarryOutliers, 20).map(x => [
      x.hero,
      x.price,
      x.star,
      x.items.join(' + '),
      x.dps,
      x.flag,
    ]),
  ));

  report.push('### 4.3 重复装备异常候选');
  report.push('');
  report.push(table(
    ['英雄', '星级', '装备', 'DPS', '标记'],
    topRows(outliers.duplicateItemOutliers, 20).map(x => [
      x.hero,
      x.star,
      x.items.join(' + '),
      x.dps,
      x.flag,
    ]),
  ));

  report.push('### 4.4 EHP Top');
  report.push('');
  report.push(table(
    ['英雄', '费用', '装备', 'EHP'],
    topRows(outliers.topTankByHero, 20).map(x => [
      x.hero,
      x.price,
      x.items.join(' + '),
      x.ehp,
    ]),
  ));

  report.push('## 5. 下一步优先级');
  report.push('');
  report.push('1. 先修 `itemStats()`：至少把 `法力回复`、`全能吸血`、`伤害减免` 识别出来，否则法系启动、续航和坦度都系统性偏差。');
  report.push('2. 给技能解析加“机制桶”：伤害、护盾、治疗、控制、百分比伤害、抗性缩放、召唤/备战席，不要只抽伤害。');
  report.push('3. 阵容羁绊不要依赖官方 `contact` 字段，统一从棋子和转职装备反推，再把官方字段作为可疑数据源。');
  report.push('4. 对 `outliers` 里的非官方主C和重复装备候选做录像/训练模式复核，确认是模型假阳性还是实际超模。');
  report.push('');

  return report.join('\n');
}

function main() {
  const results = {
    generated: new Date().toISOString(),
    version: VERSION,
    edition: EDITION,
    data: runDataAudit(),
    skills: runSkillParserAudit(),
    items: runItemsAudit(),
    outliers: runOutliersAudit(),
  };

  fs.writeFileSync(path.join(ROOT, 'audit_results.json'), JSON.stringify(results, null, 2));
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', '数值与Bug审计.md'), buildReport(results));
  fs.mkdirSync(path.join(ROOT, '审计可视化'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '审计可视化', 'data.js'), 'window.AUDIT=' + JSON.stringify(results) + ';');
  fs.mkdirSync(path.join(ROOT, '可视化'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '可视化', 'audit-data.js'), 'window.AUDIT=' + JSON.stringify(results) + ';');

  console.log('审计完成: audit_results.json');
  console.log('审计报告: reports/数值与Bug审计.md');
  console.log('审计前端数据: 审计可视化/data.js');
  console.log('摘要:', JSON.stringify({
    contactIssues: results.data.summary.contactIssues,
    skillHighRisk: results.skills.summary.highRiskHeroes,
    itemBasicGaps: results.items.summary.basicStatGaps,
    unmodeledItemEffects: results.items.summary.unmodeledImportantEffects,
    officialBestDps: results.outliers.summary.officialBestDps,
  }, null, 2));
}

if (require.main === module) main();

module.exports = { buildReport };
