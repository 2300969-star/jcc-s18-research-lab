// 至尊机甲分配实验：验证各阶段至尊持有者与交接触发条件
// 口径：复用 model.js 的 30 秒木桩 simulate()，通过 bonus 注入战斗机甲数值。
const fs = require('fs');
const path = require('path');
const { simulate, chess, equip } = require('./model.js');

const ROOT = __dirname;
const OUT_JSON = path.join(ROOT, 'mecha_prime_results.json');
const OUT_REPORT = path.join(ROOT, 'reports', '至尊机甲实验.md');

const MECHA_TRAIT_ID = '166';
const SOURCE_ROUTE_NAME = '战斗机甲：德莱文 -> 贾克斯 -> 蕾欧娜';
const SIDE_OUTPUT_FACTOR = 0.35;
const SECONDS = 30;

const ITEM_PACKAGES = {
  德莱文: ['锐利之刃', '鬼索的狂暴之刃', '卢安娜的飓风'],
  贾克斯: ['泰坦的坚决', '水银', '鬼索的狂暴之刃'],
  蕾欧娜: ['朔极之矛', '水银', '鬼索的狂暴之刃'],
  蕾欧娜青龙刀: ['朔极之矛'],
  瑟提: ['巨龙之爪', '狂徒铠甲'],
  佛耶戈: ['珠光护手', '班克斯的魔法帽', '汲取剑'],
  艾克: ['离子火花', '巨龙之爪', '狂徒铠甲'],
};

function read(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function round(n) {
  return Math.round(Number(n || 0));
}

function pct(n) {
  return `${Math.round(Number(n || 0) * 10) / 10}%`;
}

function containsTrait(hero, traitId) {
  return String(hero.species || '').split('|').includes(String(traitId))
    || String(hero.race || '').split('|').includes(String(traitId))
    || String(hero.class || '').split('|').includes(String(traitId))
    || String(hero.job || '').split('|').includes(String(traitId));
}

function heroRowsByName() {
  const rows = {};
  Object.values(chess)
    .filter(h => h && h.name && String(h.showHeroTag) === '1' && String(h.setid) === '8')
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach(h => {
      if (!rows[h.name]) rows[h.name] = h;
    });
  return rows;
}

const heroByName = heroRowsByName();
const itemIdByName = Object.fromEntries(Object.values(equip).filter(e => e && e.name).map(e => [e.name, e.id]));

function heroId(name) {
  if (!heroByName[name]) throw new Error(`未知英雄：${name}`);
  return heroByName[name].id;
}

function itemIds(names) {
  return (names || []).map(name => {
    if (!itemIdByName[name]) throw new Error(`未知装备：${name}`);
    return itemIdByName[name];
  });
}

function priceOf(name) {
  return Number((heroByName[name] || {}).price || 3);
}

function defaultStar(name, stage) {
  if (stage && stage.carry === name) return Number(stage.carryStar) || 2;
  const price = priceOf(name);
  if (price <= 3) return 2;
  return 1;
}

function mechaMembers() {
  return Object.values(heroByName)
    .filter(h => containsTrait(h, MECHA_TRAIT_ID))
    .sort((a, b) => Number(a.price) - Number(b.price) || Number(a.id) - Number(b.id))
    .map(h => ({ name: h.name, price: Number(h.price), id: h.id }));
}

const MECHA_NAMES = new Set(mechaMembers().map(x => x.name));

function mechaTier(count) {
  if (count >= 8) return 8;
  if (count >= 5) return 5;
  if (count >= 3) return 3;
  return 0;
}

function mechaBonus(unitName, primeName, count) {
  const tier = mechaTier(count);
  if (!MECHA_NAMES.has(unitName)) return {};
  if (tier >= 5) {
    const v = unitName === primeName ? 110 : 55;
    return { adPct: v, ap: v };
  }
  if (tier >= 3 && unitName === primeName) return { adPct: 60, ap: 60 };
  return {};
}

function simUnit(name, star, items, bonus) {
  const r = simulate(heroId(name), itemIds(items || []), star, SECONDS, bonus || {});
  return {
    name,
    star,
    items: items || [],
    dps: Math.round((r ? r.dps : 0) * 10) / 10,
    auto: Math.round((r ? r.auto : 0) * 10) / 10,
    spell: Math.round((r ? r.spell : 0) * 10) / 10,
    proc: Math.round((r ? r.proc : 0) * 10) / 10,
  };
}

function stageSource() {
  const transitions = read('transition_results.json');
  const route = (transitions.routes || []).find(r => r.name === SOURCE_ROUTE_NAME);
  if (!route || !route.stages) throw new Error(`未找到阶段路线：${SOURCE_ROUTE_NAME}`);
  return route;
}

function normalizeStage(stage) {
  return {
    key: stage.key,
    label: stage.label,
    note: stage.note,
    carry: stage.carry,
    carryStar: Number(stage.carryStar) || 2,
    items: stage.items || [],
    team: (stage.team || []).map(x => x.name || x).filter(Boolean),
    traits: stage.traits || [],
  };
}

function contribution(stage, primeName, unitName, items) {
  const mechaCount = stage.team.filter(x => MECHA_NAMES.has(x)).length;
  const star = defaultStar(unitName, stage);
  return simUnit(unitName, star, items || [], mechaBonus(unitName, primeName, mechaCount));
}

function evaluatePrime(stage, primeName) {
  const primeItems = primeName === stage.carry ? stage.items : [];
  const prime = contribution(stage, primeName, primeName, primeItems);
  const main = primeName === stage.carry ? null : contribution(stage, primeName, stage.carry, stage.items);
  const sideRows = stage.team
    .filter(name => name !== primeName && name !== stage.carry)
    .map(name => contribution(stage, primeName, name, []));
  const sideRaw = sideRows.reduce((sum, r) => sum + r.dps, 0);
  const sideOutput = sideRaw * SIDE_OUTPUT_FACTOR;
  const teamOutput = prime.dps + (main ? main.dps : 0) + sideOutput;
  return {
    holder: primeName,
    legalPrime: true,
    star: prime.star,
    items: prime.items,
    primeDps: round(prime.dps),
    mainCarry: main ? stage.carry : primeName,
    mainCarryDps: main ? round(main.dps) : 0,
    sideOutput: round(sideOutput),
    teamOutput: round(teamOutput),
    note: primeName === stage.carry
      ? '至尊与阶段装备主C同人'
      : `至尊给${primeName}，${stage.carry}继续带阶段主C装备`,
  };
}

function evaluateStage(stage) {
  const mechaCount = stage.team.filter(x => MECHA_NAMES.has(x)).length;
  const candidates = stage.team.filter(x => MECHA_NAMES.has(x));
  const ranking = candidates.map(name => evaluatePrime(stage, name))
    .sort((a, b) => b.teamOutput - a.teamOutput || b.primeDps - a.primeDps || a.holder.localeCompare(b.holder, 'zh-Hans-CN'));
  const frontControl = ranking.find(x => x.holder === '瑟提')
    || ranking.find(x => ['孙悟空', '瑟提', '蕾欧娜'].includes(x.holder))
    || null;
  return {
    key: stage.key,
    label: stage.label,
    team: stage.team,
    traits: stage.traits,
    mechaCount,
    mechaTier: mechaTier(mechaCount),
    carry: stage.carry,
    carryStar: stage.carryStar,
    carryItems: stage.items,
    ranking,
    winner: ranking[0],
    frontControl,
  };
}

function specialTeamOutput(label, holder, star, items, team, traits) {
  const stage = {
    key: 'late-special',
    label: '终局专项',
    carry: holder,
    carryStar: star,
    items,
    team,
    traits,
  };
  const mechaCount = team.filter(x => MECHA_NAMES.has(x)).length;
  const primary = simUnit(holder, star, items, mechaBonus(holder, holder, mechaCount));
  const sideRows = team
    .filter(name => name !== holder)
    .map(name => simUnit(name, defaultStar(name, null), [], mechaBonus(name, holder, mechaCount)));
  const sideOutput = sideRows.reduce((sum, r) => sum + r.dps, 0) * SIDE_OUTPUT_FACTOR;
  return {
    label,
    holder,
    star,
    items,
    legalPrime: MECHA_NAMES.has(holder),
    primaryDps: round(primary.dps),
    sideOutput: round(sideOutput),
    teamOutput: round(primary.dps + sideOutput),
  };
}

function offTraitChecks(lateStage) {
  return ['佛耶戈', '艾克'].map(name => {
    const inBoard = lateStage.team.includes(name);
    const items = ITEM_PACKAGES[name] || [];
    const row = simUnit(name, defaultStar(name, null), items, { adPct: 110, ap: 110 });
    return {
      name,
      inBoard,
      legalPrime: MECHA_NAMES.has(name),
      whatIfDpsWithPrimeBonus: round(row.dps),
      items,
      conclusion: MECHA_NAMES.has(name)
        ? '可作为至尊候选'
        : `${name}不是战斗机甲，不能抢至尊；表内仅作等量进攻加成的非法对照。`,
    };
  });
}

function inferPrimePlan(stageResults, specials) {
  const early = stageResults.early.winner;
  const mid = stageResults.mid.winner;
  const late = stageResults.late.winner;
  const byLabel = Object.fromEntries(specials.map(x => [x.label, x]));
  const jax2 = byLabel['贾克斯2星至尊三件'];
  const jax3 = byLabel['贾克斯3星至尊三件'];
  const leona1 = byLabel['蕾欧娜1星至尊+青龙刀'];
  const leona2 = byLabel['蕾欧娜2星至尊+青龙刀'];
  const leona2Full = byLabel['蕾欧娜2星至尊三件'];
  const chain = [
    {
      stage: '前期',
      holder: early.holder,
      condition: `${stageResults.early.label}棋盘中${early.holder}至尊总输出${early.teamOutput}，为本档第一。`,
      evidence: `${early.holder}${early.star}星 ${early.teamOutput} vs #2 ${stageResults.early.ranking[1].holder} ${stageResults.early.ranking[1].teamOutput}`,
    },
    {
      stage: '中期',
      holder: mid.holder,
      condition: `${stageResults.mid.label}棋盘中${mid.holder}至尊总输出${mid.teamOutput}，优先承接。`,
      evidence: `${mid.holder}${mid.star}星 ${mid.teamOutput} vs #2 ${stageResults.mid.ranking[1].holder} ${stageResults.mid.ranking[1].teamOutput}`,
    },
    {
      stage: '终局',
      holder: late.holder,
      condition: `${stageResults.late.label}棋盘中${late.holder}至尊总输出${late.teamOutput}，但需结合专项星级触发。`,
      evidence: `${late.holder}${late.star}星 ${late.teamOutput} vs #2 ${stageResults.late.ranking[1].holder} ${stageResults.late.ranking[1].teamOutput}`,
    },
  ];
  const rules = [];
  if (early && early.holder) {
    rules.push({
      id: 'stage-start',
      priority: 10,
      holder: early.holder,
      text: `至尊给${early.holder}`,
      when: { hasUnits: [early.holder] },
      evidence: chain[0].evidence,
    });
  }
  if (mid && mid.holder && jax2 && (!leona1 || jax2.teamOutput > leona1.teamOutput)) {
    rules.push({
      id: 'mid-carry-online',
      priority: 30,
      holder: mid.holder,
      text: `至尊转${mid.holder}`,
      when: { unitStars: { [mid.holder]: 2 } },
      evidence: `${mid.holder}2星三件专项 ${jax2.teamOutput}，高于蕾欧娜1星青龙刀 ${leona1 ? leona1.teamOutput : '未测'}`,
    });
  }
  if (late && late.holder && leona2Full && jax3 && leona2Full.teamOutput > jax3.teamOutput) {
    const shojinOnly = leona2 && jax2
      ? `；仅青龙刀时 ${leona2.teamOutput} vs 贾克斯2星三件 ${jax2.teamOutput}，不建议裸转`
      : '';
    rules.push({
      id: 'late-leona-two-star',
      priority: 50,
      holder: late.holder,
      text: `至尊转${late.holder}`,
      when: { levelGte: 9, unitStars: { [late.holder]: 2 } },
      evidence: `蕾欧娜2星三件 ${leona2Full.teamOutput} > 贾克斯3星三件 ${jax3.teamOutput}${shojinOnly}`,
    });
  }
  return {
    source: 'mecha_prime_results.json',
    sideOutputFactor: SIDE_OUTPUT_FACTOR,
    chain,
    rules,
    conclusion: [
      `${early.holder}负责前期，${mid.holder}二星后接管中期。`,
      leona2Full && jax3 && leona2Full.teamOutput > jax3.teamOutput
        ? `${late.holder}至少二星且上9后接至尊，但只有青龙刀时仍弱于贾克斯二星三件，交接后要补输出装。`
        : `${late.holder}未稳定超过中期核心，不建议无条件交接。`,
      jax3 && leona2Full && leona2Full.teamOutput > jax3.teamOutput
        ? `完全成型时蕾欧娜2星三件高于贾克斯3星三件，后期可以转上限。`
        : `贾克斯三星仍是强保底，蕾欧娜交接要看二星/装备。`,
    ],
  };
}

function writeReport(out) {
  const lines = [
    '# 至尊机甲分配实验',
    '',
    `生成时间：${out.generated}`,
    '',
    '## 口径',
    '- 战斗模拟：复用 `model.js simulate()` 的 30 秒木桩口径，通过 bonus 注入至尊机甲加成。',
    `- 机甲成员由 chess.js 反查 species 含 166 得到：${out.mechaMembers.map(x => `${x.name}(${x.price}费)`).join('、')}。`,
    '- 3机甲：至尊 +60 法术加成 / +60% 物理加成。',
    '- 5机甲：所有机甲 +55/+55，至尊双倍为 +110/+110。',
    '- 8机甲召唤体本实验不建模。',
    `- 全队输出 = 至尊持有者DPS + 阶段主C DPS（若不同人） + 其他单位裸装DPS×${pct(SIDE_OUTPUT_FACTOR * 100)}。`,
    `- 阶段棋盘来自现有机甲分叉/过渡产物 \`transition_results.json\` 的「${SOURCE_ROUTE_NAME}」。`,
    '',
  ];
  Object.values(out.stages).forEach(stage => {
    lines.push(`## ${stage.label}：${stage.team.join('、')}`);
    lines.push('');
    lines.push('| 排名 | 至尊持有者 | 装备是否同人 | 至尊DPS | 阶段主CDPS | 副输出折算 | 全队输出 |');
    lines.push('|---:|---|---|---:|---:|---:|---:|');
    stage.ranking.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${r.holder}${r.star}星 | ${r.note} | ${r.primeDps} | ${r.mainCarryDps} | ${r.sideOutput} | ${r.teamOutput} |`);
    });
    if (stage.frontControl) {
      const diff = stage.winner.teamOutput - stage.frontControl.teamOutput;
      lines.push('');
      lines.push(`前排对照：至尊给 ${stage.frontControl.holder} 的全队输出 ${stage.frontControl.teamOutput}，比本档最优 ${stage.winner.holder} 低 ${diff}。`);
    }
    lines.push('');
  });

  lines.push('## 终局交接专项');
  lines.push('');
  lines.push('| 场景 | 主体DPS | 副输出折算 | 全队输出 | 结论 |');
  lines.push('|---|---:|---:|---:|---|');
  out.triggerComparisons.forEach(r => {
    lines.push(`| ${r.label} | ${r.primaryDps} | ${r.sideOutput} | ${r.teamOutput} | ${r.legalPrime ? '合法至尊候选' : '非法对照'} |`);
  });
  const byLabel = Object.fromEntries(out.triggerComparisons.map(x => [x.label, x]));
  const jax3 = byLabel['贾克斯3星至尊三件'];
  const leona2Full = byLabel['蕾欧娜2星至尊三件'];
  const leona1 = byLabel['蕾欧娜1星至尊+青龙刀'];
  const jax2 = byLabel['贾克斯2星至尊三件'];
  if (leona2Full && jax3) {
    lines.push('');
    lines.push(`推导：蕾欧娜2星三件 ${leona2Full.teamOutput} vs 贾克斯3星三件 ${jax3.teamOutput}，分差 ${leona2Full.teamOutput - jax3.teamOutput}。`);
  }
  if (leona1 && jax2) {
    lines.push(`推导：蕾欧娜1星+青龙刀 ${leona1.teamOutput} vs 贾克斯2星三件 ${jax2.teamOutput}，分差 ${leona1.teamOutput - jax2.teamOutput}。`);
  }
  lines.push('');

  lines.push('## 副C/前排对照');
  lines.push('');
  lines.push('| 单位 | 是否在终局棋盘 | 是否可持有至尊 | 等量进攻加成DPS | 结论 |');
  lines.push('|---|---|---|---:|---|');
  out.offTraitChecks.forEach(r => {
    lines.push(`| ${r.name} | ${r.inBoard ? '是' : '否'} | ${r.legalPrime ? '是' : '否'} | ${r.whatIfDpsWithPrimeBonus} | ${r.conclusion} |`);
  });
  lines.push('');

  lines.push('## primePlan 结论');
  lines.push('');
  out.primePlan.chain.forEach(x => lines.push(`- ${x.stage}：${x.holder}。${x.condition} 证据：${x.evidence}`));
  out.primePlan.conclusion.forEach(x => lines.push(`- ${x}`));
  lines.push('');
  lines.push('## 与机甲分叉实验一致性');
  lines.push('- 一致：装备主线仍是德莱文打工、贾克斯承接、蕾欧娜终局上限；佛耶戈不能抢至尊，只作为混沌副C/挂件贡献输出。');
  lines.push('- 修正：若只有一星蕾欧娜，不应为了“5费”自动拿走贾克斯的至尊；交接应等二星或明显上限条件成立。');
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });
  fs.writeFileSync(OUT_REPORT, lines.join('\n'));
}

function main() {
  const route = stageSource();
  const stages = Object.fromEntries(Object.entries(route.stages).map(([key, stage]) => [key, normalizeStage(stage)]));
  const stageResults = Object.fromEntries(Object.entries(stages).map(([key, stage]) => [key, evaluateStage(stage)]));
  const late = stages.late;
  const specials = [
    specialTeamOutput('蕾欧娜1星至尊+青龙刀', '蕾欧娜', 1, ITEM_PACKAGES.蕾欧娜青龙刀, late.team, late.traits),
    specialTeamOutput('蕾欧娜2星至尊+青龙刀', '蕾欧娜', 2, ITEM_PACKAGES.蕾欧娜青龙刀, late.team, late.traits),
    specialTeamOutput('蕾欧娜2星至尊三件', '蕾欧娜', 2, ITEM_PACKAGES.蕾欧娜, late.team, late.traits),
    specialTeamOutput('贾克斯2星至尊三件', '贾克斯', 2, ITEM_PACKAGES.贾克斯, late.team, late.traits),
    specialTeamOutput('贾克斯3星至尊三件', '贾克斯', 3, ITEM_PACKAGES.贾克斯, late.team, late.traits),
    specialTeamOutput('瑟提1星至尊肉装', '瑟提', 1, ITEM_PACKAGES.瑟提, late.team, late.traits),
  ].sort((a, b) => b.teamOutput - a.teamOutput || a.label.localeCompare(b.label, 'zh-Hans-CN'));

  const out = {
    version: '17.17.6-S18',
    generated: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
    source: {
      route: SOURCE_ROUTE_NAME,
      stages: 'transition_results.json.routes[].stages（由机甲分叉/过渡脚本产出）',
      simulator: 'model.js simulate(heroId, itemIds, star, 30, bonus)',
      traitText: 'race.js id166 战斗机甲：3机甲至尊+60/60；5机甲全员+55/55、至尊双倍；8机甲召唤体未建模',
    },
    constants: {
      sideOutputFactor: SIDE_OUTPUT_FACTOR,
      seconds: SECONDS,
      mechaTraitId: MECHA_TRAIT_ID,
    },
    mechaMembers: mechaMembers(),
    stages: stageResults,
    triggerComparisons: specials,
    offTraitChecks: offTraitChecks(late),
  };
  out.primePlan = inferPrimePlan(stageResults, specials);

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
  writeReport(out);
  console.log('至尊机甲分配实验完成');
  Object.values(out.stages).forEach(s => {
    console.log(`${s.label}: ${s.ranking.map(r => `${r.holder}${r.teamOutput}`).join(' / ')}`);
  });
  console.log('专项:', out.triggerComparisons.map(r => `${r.label}${r.teamOutput}`).join(' / '));
  console.log(`输出: ${path.basename(OUT_JSON)}, reports/至尊机甲实验.md`);
}

if (require.main === module) main();
