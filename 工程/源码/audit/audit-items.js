const {
  data,
  splitCsv,
  detailOf,
  officialLineups,
} = require('./audit-shared');
const {
  MODEL_EFFECT_IDS,
  extractBasicTokens,
  searchableItemRecords,
  buildItemCatalog,
} = require('../core/item-catalog');

const EFFECT_TAGS = [
  ['offense', /伤害|攻击|法术加成|物理加成|攻击速度|暴击|击碎|灼烧|增幅|弹体/],
  ['defense', /护盾|治疗|回复|伤害减免|生命值|最大生命|控制免疫|不可被选取|全能吸血|汲取/],
  ['mana', /法力|施放|技能/],
  ['controlOrDebuff', /重伤|冰冷|晕眩|眩晕|削减|降低|击碎/],
  ['economyOrBoard', /金币|队伍规模|装备|复制|召唤/],
];

const TAG_LABEL = {
  offense: '输出',
  defense: '防御/续航',
  mana: '法力/施法',
  controlOrDebuff: '控制/负面效果',
  economyOrBoard: '经济/棋盘',
};

function officialItemUsage() {
  const usage = {};
  for (const lineup of officialLineups()) {
    const detail = detailOf(lineup);
    for (const h of detail.hero_location || []) {
      for (const id of splitCsv(h.equipment_id)) {
        const row = usage[id] = usage[id] || { id, total: 0, sTier: 0, carry: 0, lines: new Set() };
        row.total++;
        if (lineup.quality === 'S') row.sTier++;
        if (h.is_carry_hero) row.carry++;
        row.lines.add(detail.line_name);
      }
    }
  }
  for (const row of Object.values(usage)) row.lines = [...row.lines];
  return usage;
}

function tagsFor(desc) {
  return EFFECT_TAGS.filter(([, re]) => re.test(desc || '')).map(([tag]) => tag);
}

function runItemsAudit() {
  const usage = officialItemUsage();
  const items = searchableItemRecords(data.equip);
  const catalog = buildItemCatalog(data.equip);

  const basicStatGaps = [];
  const basicGapCounts = {};
  for (const item of items) {
    const tokens = extractBasicTokens(item.basicDesc);
    for (const t of tokens) {
      if (t.parsedByModel) continue;
      basicStatGaps.push({
        id: item.id,
        name: item.name,
        type: item.type,
        raw: t.raw,
        label: t.label,
        usedInS: (usage[item.id] || {}).sTier || 0,
        carryUses: (usage[item.id] || {}).carry || 0,
      });
      basicGapCounts[t.label] = (basicGapCounts[t.label] || 0) + 1;
    }
  }

  const effectRows = items
    .filter(item => item.type !== '基础装备' && item.type !== '转职纹章' && item.desc)
    .map(item => {
      const tags = tagsFor(item.desc);
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        modeled: MODEL_EFFECT_IDS.has(String(item.id)),
        tags,
        tagLabels: tags.map(t => TAG_LABEL[t] || t),
        usedInS: (usage[item.id] || {}).sTier || 0,
        carryUses: (usage[item.id] || {}).carry || 0,
        desc: String(item.desc || '').replace(/\s+/g, ' ').trim(),
      };
    });

  const unmodeledEffects = effectRows
    .filter(row => !row.modeled)
    .sort((a, b) => b.usedInS - a.usedInS || b.carryUses - a.carryUses || a.type.localeCompare(b.type, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  const unmodeledImportantEffects = effectRows
    .filter(r => !r.modeled && r.tags.length && (r.usedInS > 0 || r.carryUses > 0 || r.type === '成型装备'))
    .sort((a, b) => b.usedInS - a.usedInS || b.carryUses - a.carryUses || a.type.localeCompare(b.type, 'zh-Hans-CN'));

  const modeledEffects = effectRows.filter(r => r.modeled);
  const coverageByType = [...new Set(items.map(item => item.type))].map(type => {
    const typeItems = items.filter(item => item.type === type);
    const typeEffects = effectRows.filter(item => item.type === type);
    const statItems = typeItems.filter(item => extractBasicTokens(item.basicDesc).length);
    return {
      type,
      records: typeItems.length,
      names: new Set(typeItems.map(item => item.name)).size,
      staticStatItems: statItems.length,
      staticStatsComplete: statItems.filter(item => extractBasicTokens(item.basicDesc).every(token => token.parsedByModel)).length,
      effectItems: typeEffects.length,
      modeledEffects: typeEffects.filter(item => item.modeled).length,
      unmodeledEffects: typeEffects.filter(item => !item.modeled).length,
    };
  });
  const mittens = catalog.find(item => item.name === '连指手套');
  if (!mittens || mittens.effectCoverage !== 'unmodeled' || !mittens.staticStatsComplete) {
    throw new Error('装备审计必须识别连指手套的静态属性覆盖与主动特效缺口');
  }

  return {
    summary: {
      items: items.length,
      searchableItemNames: catalog.length,
      basicStatGaps: basicStatGaps.length,
      basicGapCounts: Object.fromEntries(Object.entries(basicGapCounts).sort((a, b) => b[1] - a[1])),
      effectRows: effectRows.length,
      modeledEffectItems: modeledEffects.length,
      unmodeledEffectItems: unmodeledEffects.length,
      unmodeledImportantEffects: unmodeledImportantEffects.length,
    },
    basicStatGaps,
    coverageByType,
    unmodeledEffects,
    unmodeledImportantEffects,
    modeledEffects,
    spotChecks: {
      mittens: {
        name: mittens.name,
        staticStatsComplete: mittens.staticStatsComplete,
        stats: mittens.stats,
        effectCoverage: mittens.effectCoverage,
        desc: mittens.desc,
      },
    },
    tagLabels: TAG_LABEL,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runItemsAudit(), null, 2));
}

module.exports = { runItemsAudit };
