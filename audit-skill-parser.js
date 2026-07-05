const {
  data,
  detailOf,
  officialLineups,
  uniqueHeroes,
} = require('./audit-shared');

const CURRENT_EXCLUDE = /时长|几率|次数|抗性|双抗|减少|衰减/;
const HIT_OVERRIDE = { 厄运小姐: { 1: 7 }, 乐芙兰: { 0: 6 }, 德莱文: { 1: 2 } };

const TAGS = [
  ['shield', /护盾/],
  ['heal', /治疗|回复|吸血|汲取/],
  ['hpScaling', /生命上限|最大生命/],
  ['resistScaling', /护甲|魔法抗性|魔抗|双抗|抗性/],
  ['damageReduction', /伤害减免|减免|降低.*伤害|伤害降低/],
  ['control', /晕眩|眩晕|击飞|恐惧|缴械|控制|嘲讽|不可被选取|冰冷/],
  ['debuff', /重伤|灼烧|击碎|削减|降低|减少/],
  ['attackSpeed', /攻击速度|攻速/],
  ['mana', /法力|蓝量/],
  ['countOrChance', /次数|数量|几率|概率|每秒|持续/],
  ['summonOrBench', /召唤|备战席|带到棋盘/],
];

const TAG_LABEL = {
  shield: '护盾',
  heal: '治疗/回复',
  hpScaling: '生命缩放',
  resistScaling: '抗性缩放',
  damageReduction: '减伤',
  control: '控制',
  debuff: '负面效果',
  attackSpeed: '攻速',
  mana: '法力',
  countOrChance: '次数/概率',
  summonOrBench: '召唤/备战席',
};

function currentConsumesDamage(label, firstValue) {
  if (!/伤害/.test(label)) return false;
  if (CURRENT_EXCLUDE.test(label)) return false;
  if (/%/.test(firstValue || '')) return false;
  return true;
}

function tagsFor(text) {
  return TAGS.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

function officialUseSets() {
  const used = new Set();
  const sUsed = new Set();
  const carries = new Set();
  const sCarries = new Set();
  for (const lineup of officialLineups()) {
    const detail = detailOf(lineup);
    for (const h of detail.hero_location || []) {
      const name = (data.chess[h.hero_id] || {}).name;
      if (!name) continue;
      used.add(name);
      if (lineup.quality === 'S') sUsed.add(name);
      if (h.is_carry_hero) {
        carries.add(name);
        if (lineup.quality === 'S') sCarries.add(name);
      }
    }
  }
  return { used, sUsed, carries, sCarries };
}

function auditHeroSkill(hero, useSets) {
  const groups = String(hero.skillBriefValue || '').split('|').filter(Boolean).map(g => g.split('/'));
  const descs = String(hero.skillValueDesc || '').split('|');
  const groupRows = groups.map((g, i) => {
    const label = descs[i] || '';
    const first = g[0] || '';
    const text = `${label} ${first}`;
    const consumed = currentConsumesDamage(label, first);
    const utilityTags = tagsFor(text);
    const ignoredDamage = /伤害/.test(label) && !consumed;
    const damageType = consumed ? (/物理加成/.test(label) ? 'physical' : 'magic') : null;
    const hitOverride = (HIT_OVERRIDE[hero.name] || {})[i] || 1;
    return {
      index: i,
      label,
      values: g,
      consumed,
      ignoredDamage,
      damageType,
      hitOverride,
      utilityTags,
      reason: consumed
        ? 'current_model_damage'
        : !/伤害/.test(label)
          ? 'non_damage'
          : CURRENT_EXCLUDE.test(label)
            ? 'excluded_keyword'
            : /%/.test(first)
              ? 'percent_value'
              : 'unknown',
    };
  });

  const ignoredDamageGroups = groupRows.filter(g => g.ignoredDamage);
  const utilityTags = [...new Set(groupRows.flatMap(g => g.utilityTags))];
  const consumedDamageGroups = groupRows.filter(g => g.consumed);
  const mismatch = groups.length !== descs.filter(Boolean).length;
  const sCarry = useSets.sCarries.has(hero.name);
  const sUsed = useSets.sUsed.has(hero.name);

  const riskScore =
    ignoredDamageGroups.length * 4 +
    utilityTags.length * 2 +
    (mismatch ? 2 : 0) +
    (sCarry ? 6 : sUsed ? 3 : 0);

  return {
    id: hero.id,
    name: hero.name,
    price: Number(hero.price),
    skillName: hero.skillName,
    groupCount: groups.length,
    descCount: descs.filter(Boolean).length,
    mismatch,
    consumedDamageGroups: consumedDamageGroups.length,
    ignoredDamageGroups: ignoredDamageGroups.length,
    utilityTags,
    utilityLabels: utilityTags.map(t => TAG_LABEL[t] || t),
    official: {
      used: useSets.used.has(hero.name),
      sUsed,
      carry: useSets.carries.has(hero.name),
      sCarry,
    },
    riskScore,
    groups: groupRows,
  };
}

function runSkillParserAudit() {
  const useSets = officialUseSets();
  const heroes = uniqueHeroes();
  const heroAudits = heroes.map(h => auditHeroSkill(h, useSets));
  const tagCounts = {};
  for (const h of heroAudits) {
    for (const tag of h.utilityTags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  const highRiskHeroes = heroAudits
    .filter(h => h.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore || b.price - a.price)
    .slice(0, 40);

  const ignoredDamageHeroes = heroAudits
    .filter(h => h.ignoredDamageGroups > 0)
    .sort((a, b) => b.ignoredDamageGroups - a.ignoredDamageGroups || b.riskScore - a.riskScore);

  const zeroParsedDamageWithDamageText = heroAudits
    .filter(h => h.consumedDamageGroups === 0 && h.groups.some(g => /伤害/.test(g.label)))
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    summary: {
      heroes: heroAudits.length,
      highRiskHeroes: highRiskHeroes.length,
      ignoredDamageHeroes: ignoredDamageHeroes.length,
      zeroParsedDamageWithDamageText: zeroParsedDamageWithDamageText.length,
      utilityTagCounts: Object.fromEntries(Object.entries(tagCounts).sort((a, b) => b[1] - a[1])),
    },
    highRiskHeroes,
    ignoredDamageHeroes,
    zeroParsedDamageWithDamageText,
    heroAudits,
    tagLabels: TAG_LABEL,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runSkillParserAudit(), null, 2));
}

module.exports = { runSkillParserAudit };
