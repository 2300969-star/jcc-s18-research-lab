// 官方阵容再发明：从属性闭环反推官方阵容变体
const fs = require('fs');
const path = require('path');
const { simulate, itemStats, chess, equip } = require('./model.js');
const { currentVersion, currentLineups } = require('./version-context.js');

const ROOT = __dirname;
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const data = {
  hex: read('data/hex.js').data,
  race: read('data/race.js').data,
  job: read('data/job.js').data,
  lineups: read('data/lineup_detail_total.json').lineup_list,
};
const version = currentVersion(ROOT);

const itemByName = {};
Object.values(equip).forEach(e => { if (e && e.name && !itemByName[e.name]) itemByName[e.name] = e.id; });
const itemId = name => itemByName[name];
const itemIds = names => names.map(itemId).filter(Boolean);
const traitName = id => (data.race[id] || data.job[id] || {}).name || id;
const fmtPct = x => Math.round(x * 10) / 10;

function hero(name, star = 1, shown = true) {
  const prefix = String(star);
  return Object.values(chess).find(h => h.name === name && String(h.id).startsWith(prefix) && (!shown || h.showHeroTag === '1'))
    || Object.values(chess).find(h => h.name === name && (!shown || h.showHeroTag === '1'));
}

function itemBundle(names) {
  return names.map(name => ({ name, id: itemId(name), stats: itemStats(itemId(name)) })).filter(x => x.id);
}

function statSum(items, key) {
  return items.reduce((s, x) => s + (x.stats[key] || 0), 0);
}

function physicalEhp(hp, armor, dr = 0) {
  return hp * (1 + armor / 100) / (1 - dr);
}

function mixedEhp(hp, armor, mr, dr = 0) {
  const mit = 2 / (100 / (100 + armor) + 100 / (100 + mr));
  return hp * mit / (1 - dr);
}

function defensiveStack({ name, star = 2, items = [], augArmor = 0, augMr = 0, traitArmor = 0, traitMr = 0, dr = 0, skillShield = 0, extraShieldPct = 0, dawn = false }) {
  const h = hero(name, star);
  const bundle = itemBundle(items);
  const hp = Number(h.initHP) + statSum(bundle, 'hp');
  const armor = Number(h.armor) + statSum(bundle, 'armor') + augArmor + traitArmor;
  const mr = Number(h.magicResist) + statSum(bundle, 'mr') + augMr + traitMr;
  const ap = statSum(bundle, 'ap');
  const shieldPct = (items.includes('汲取剑') ? 0.25 : 0) + (items.includes('圣盾使的誓约') ? 0.2 : 0) + extraShieldPct;
  const shield = hp * shieldPct + skillShield * (1 + ap / 100);
  const dawnHeal = dawn ? Math.round(armor * 0.15 * 6) : 0;
  const base = mixedEhp(Number(h.initHP), Number(h.armor), Number(h.magicResist));
  const hpLayer = mixedEhp(hp, armor, mr, dr);
  const shieldLayer = mixedEhp(shield, armor, mr, dr);
  const sustainLayer = mixedEhp(dawnHeal, armor, mr, dr);
  return {
    hp: Math.round(hp),
    armor: Math.round(armor),
    mr: Math.round(mr),
    shield: Math.round(shield),
    sustain: Math.round(dawnHeal),
    baseEhp: Math.round(base),
    ehp: Math.round(hpLayer + shieldLayer + sustainLayer),
    physicalEhp: Math.round(physicalEhp(hp + shield + dawnHeal, armor, dr)),
    gainX: Math.round((hpLayer + shieldLayer + sustainLayer) / base * 100) / 100,
  };
}

function dpsStack({ name, star = 2, items = [], bonus = {} }) {
  const h = hero(name, 1);
  const ids = itemIds(items);
  const bare = simulate(h.id, [], star, 30, {});
  const full = simulate(h.id, ids, star, 30, bonus);
  return {
    baseDps: Math.round(bare.dps),
    dps: Math.round(full.dps),
    gainX: Math.round(full.dps / bare.dps * 100) / 100,
    auto: Math.round(full.auto),
    spell: Math.round(full.spell),
    proc: Math.round(full.proc),
  };
}

const official = currentLineups(data.lineups, ROOT)
  .map(l => {
    const d = JSON.parse(l.detail || '{}');
    const heroes = (d.hero_location || []).map(h => (chess[h.hero_id] || {}).name).filter(Boolean);
    const traits = (d.contact || []).map(c => `${c.num}${traitName(c.id)}`);
    const text = [d.line_name, d.early_info, d.equipment_info, d.hex_info, d.enemy_info, heroes.join(' '), traits.join(' ')].join(' ');
    return { id: String(l.id), name: d.line_name, quality: l.quality, sortID: Number(l.sortID || 0), heroes, traits, text };
  });

function seed(pattern, limit = 5) {
  const q = { S: 3, A: 2, B: 1 };
  return official
    .filter(o => pattern.test(o.text))
    .sort((a, b) => (q[b.quality] || 0) - (q[a.quality] || 0) || b.sortID - a.sortID)
    .slice(0, limit)
    .map(o => ({ name: o.name, quality: o.quality, keep: o.heroes.slice(0, 8), traits: o.traits.slice(0, 5) }));
}

const poppy = defensiveStack({
  name: '波比',
  star: 2,
  items: ['黎明圣盾', '汲取剑', '棘刺背心'],
  augArmor: 180,
  traitArmor: 75,
  dr: 0.06,
  skillShield: 350,
  dawn: true,
});
const malphite = defensiveStack({
  name: '墨菲特',
  star: 3,
  items: ['黎明圣盾', '石像鬼石板甲', '离子火花'],
  augArmor: 150,
  traitArmor: 75,
  skillShield: 0,
  dawn: true,
});
const lee = defensiveStack({
  name: '李青',
  star: 3,
  items: ['圣盾使的誓约', '黎明核心', '狂徒铠甲'],
  traitMr: 80,
  skillShield: 540,
  extraShieldPct: 0.15,
});
const sett = defensiveStack({
  name: '瑟提',
  star: 2,
  items: ['圣盾使的誓约', '石像鬼石板甲', '狂徒铠甲'],
  augArmor: 40,
  augMr: 40,
  traitArmor: 75,
  skillShield: 425 * 1.4,
  extraShieldPct: 0.2,
});

const jax = dpsStack({
  name: '贾克斯',
  star: 3,
  items: ['鬼索的狂暴之刃', '疾射火炮', '泰坦的坚决'],
  bonus: { asPct: 84, ap: 60, ampPct: 9 },
});
const kaisa = dpsStack({
  name: '卡莎',
  star: 3,
  items: ['鬼索的狂暴之刃', '斯塔缇克电刃', '珠光护手'],
  bonus: { critPct: 40, ap: 10, onHitMagic: 27 },
});
const yuumi = dpsStack({
  name: '悠米',
  star: 3,
  items: ['蓝霸符', '珠光护手', '班克斯的魔法帽'],
  bonus: { ap: 5, critPct: 75, ampPct: 9 },
});
const samira = dpsStack({
  name: '莎弥拉',
  star: 2,
  items: ['最后的轻语', '卢安娜的飓风', '锐利之刃'],
  bonus: { adPct: 30, manaMult: 1.3 },
});

const loops = [
  {
    id: 'armor-poppy',
    tier: 'S',
    title: '大盾波比：护甲闭环',
    hero: '波比',
    attribute: '护甲',
    type: '属性闭环型',
    trigger: ['更大更好的圆盾', '黎明圣盾', '汲取剑', '2护卫/3小天才'],
    formula: '护甲 -> 物理减伤 + 技能伤害；护盾/回血再被护甲放大',
    metric: `混合EHP ${poppy.ehp}，物理口径 ${poppy.physicalEhp}，约 ${poppy.gainX}x 裸2星`,
    score: 96,
    calc: poppy,
    seeds: seed(/波比|小天才|护卫/, 6),
    swap: {
      from: '官方小天才/护卫壳里波比常被当挂件',
      to: '有大盾强化和护甲神器时，把波比升为主坦/半核，安妮或牛头让位给高护卫/秘术补抗性',
      items: ['黎明圣盾', '汲取剑', '棘刺背心/石像鬼'],
    },
    risk: ['怕法系爆发/真伤', '怕重伤压回血', '怕轻语破甲', '后期没三星会掉上限'],
  },
  {
    id: 'armor-malphite',
    tier: 'A+',
    title: '磐石墨菲特：护甲转法强',
    hero: '墨菲特',
    attribute: '护甲',
    type: '属性转化型',
    trigger: ['坚如磐石', '护卫护甲', '黎明圣盾/石像鬼', '超英/吉祥物底座'],
    formula: '护甲 -> 法强；法强提升技能伤害，护甲继续提升站场和黎明回复',
    metric: `混合EHP ${malphite.ehp}，约 ${malphite.gainX}x 裸3星`,
    score: 88,
    calc: malphite,
    seeds: seed(/墨菲特|超级英雄|吉祥物|悠米|伊泽瑞尔/, 6),
    swap: {
      from: '官方超英体系多把墨菲特当三星前排',
      to: '拿到坚如磐石后，装备从纯肉转为“护甲+功能”，墨菲特变成能打的前排法核',
      items: ['黎明圣盾', '石像鬼石板甲', '离子火花/日炎'],
    },
    risk: ['怕高魔抗前排拖住', '需要三星密度', '没有护甲装时闭环断掉'],
  },
  {
    id: 'tempo-lee',
    tier: 'A',
    title: '金钟罩李青：低蓝自净循环',
    hero: '李青',
    attribute: '蓝量/已损治疗',
    type: '启动循环型',
    trigger: ['净化之金钟罩', '圣盾使的誓约', '黎明核心', '爱心/秘术'],
    formula: '减30法力消耗 + 圣盾启动蓝 + 黎明核心减蓝 -> 高频盾/自净/已损治疗',
    metric: `混合EHP ${lee.ehp}，约 ${lee.gainX}x 裸3星`,
    score: 82,
    calc: lee,
    seeds: seed(/李青|爱心使者|秘术卫士|超级英雄/, 6),
    swap: {
      from: '官方金钟罩线偏保护后排',
      to: '装备改为启动件，把李青当可自净的中期主坦，后排转悠米/佐伊/莎弥拉',
      items: ['圣盾使的誓约', '黎明核心', '狂徒铠甲/救赎类肉装'],
    },
    risk: ['怕沉默/高爆秒杀', '需要技能目标合理', '后期伤害不足时只能当桥'],
  },
  {
    id: 'shield-sett',
    tier: 'A',
    title: '再生瑟提：护盾阈值重充',
    hero: '瑟提',
    attribute: '护盾/双抗',
    type: '阈值叠加型',
    trigger: ['再生护盾', '圣盾使的誓约', '石像鬼', '战斗机甲/护卫'],
    formula: '技能护盾 + 圣盾40%阈值盾 + 护盾破裂后再充能，双抗放大每一层盾',
    metric: `混合EHP ${sett.ehp}，约 ${sett.gainX}x 裸2星`,
    score: 80,
    calc: sett,
    seeds: seed(/瑟提|战斗机甲|护卫|贾克斯/, 6),
    swap: {
      from: '官方机甲线多把瑟提当普通前排',
      to: '拿再生护盾后优先给圣盾/石像鬼，瑟提负责拖时间，让贾克斯或五费启动',
      items: ['圣盾使的誓约', '石像鬼石板甲', '狂徒铠甲'],
    },
    risk: ['怕破盾/持续法伤', '需要对面集火他才值', '输出仍要靠后排'],
  },
  {
    id: 'as-jax',
    tier: 'S',
    title: '无情贾克斯：攻速三击闭环',
    hero: '贾克斯',
    attribute: '攻速',
    type: '输出闭环型',
    trigger: ['无情连打', '鬼索', '火炮', '泰坦/机甲'],
    formula: '攻速 -> 更多三击；三击叠法伤；鬼索和无情继续抬攻速',
    metric: `30秒DPS ${jax.dps}，约 ${jax.gainX}x 裸3星`,
    score: 92,
    calc: jax,
    seeds: seed(/贾克斯|战斗机甲|斗士|决斗/, 6),
    swap: {
      from: '官方贾克斯线默认追三终局',
      to: '模型更建议中期吃分桥：胡无情/双攻速再追，否则上8转蕾欧娜/五费控制',
      items: ['鬼索的狂暴之刃', '疾射火炮', '泰坦的坚决/汲取剑'],
    },
    risk: ['怕控制和重伤', '三星失败会被九五超车', '后排绕开前排时启动慢'],
  },
  {
    id: 'as-kaisa',
    tier: 'A+',
    title: '暴击卡莎：攻速电浆闭环',
    hero: '卡莎',
    attribute: '攻速/暴击',
    type: '输出闭环型',
    trigger: ['侦察小队', '鬼索', '电刃', '珠光护手'],
    formula: '攻速 -> 更多电浆；主动继续叠攻速；技能暴击把每次电浆变成爆点',
    metric: `30秒DPS ${kaisa.dps}，约 ${kaisa.gainX}x 裸3星`,
    score: 86,
    calc: kaisa,
    seeds: seed(/卡莎|情报特工|源计划|怪兽/, 6),
    swap: {
      from: '官方情报卡莎偏常规攻速法系装',
      to: '有侦察小队时优先电刃/法爆，少一点纯AD，多吃电浆和技能暴击',
      items: ['鬼索的狂暴之刃', '斯塔缇克电刃', '珠光护手'],
    },
    risk: ['怕秘术高魔抗', '怕刺客切后', '装备偏物理时不该硬转'],
  },
  {
    id: 'crit-yuumi',
    tier: 'A+',
    title: '精准猫咪：低蓝技能暴击',
    hero: '悠米',
    attribute: '法强/暴击/蓝量',
    type: '爆发闭环型',
    trigger: ['猫之精准', '蓝霸符', '珠光护手', '超英三星密度'],
    formula: '低蓝频率 + 技能暴击 + 超英增伤；法强同时抬飞弹和护盾/治疗体系价值',
    metric: `30秒DPS ${yuumi.dps}，约 ${yuumi.gainX}x 裸3星`,
    score: 84,
    calc: yuumi,
    seeds: seed(/悠米|猫咪|超级英雄|爱心使者|吉祥物/, 6),
    swap: {
      from: '官方猫咪线依赖低费全三星',
      to: '模型建议只在猫之精准+蓝法爆成型时硬赌；否则转佐伊/九五法系',
      items: ['蓝霸符', '珠光护手', '班克斯的魔法帽/巨杀'],
    },
    risk: ['怕龙牙/秘术', '三星慢会掉血', '站位被切直接崩'],
  },
  {
    id: 'reset-samira',
    tier: 'A',
    title: '评级莎弥拉：破甲回蓝收割',
    hero: '莎弥拉',
    attribute: '破甲/击杀回蓝',
    type: '收割循环型',
    trigger: ['评级与交火', '最后的轻语', '飓风', '强袭枪手/平民'],
    formula: '轻语打开前排 -> 参与击杀回蓝 -> 再放技能；飓风扩大压血面',
    metric: `30秒DPS ${samira.dps}，约 ${samira.gainX}x 裸2星`,
    score: 78,
    calc: samira,
    seeds: seed(/莎弥拉|枪手|平民英雄|厄斐琉斯/, 6),
    swap: {
      from: '官方枪手线常把轻语当必备但不解释链条',
      to: '评级强化出现时，轻语优先级高于第三件纯输出，因为它决定能不能触发回蓝收割',
      items: ['最后的轻语', '卢安娜的飓风', '锐利之刃/巨人捕手'],
    },
    risk: ['第一轮击杀慢会断循环', '怕控制', '前排太薄时输出时间不够'],
  },
].sort((a, b) => b.score - a.score);

const variants = loops.map((l, i) => ({
  rank: i + 1,
  id: l.id,
  title: l.title,
  tier: l.tier,
  hero: l.hero,
  score: l.score,
  type: l.type,
  attribute: l.attribute,
  trigger: l.trigger,
  formula: l.formula,
  metric: l.metric,
  calc: l.calc,
  seeds: l.seeds,
  swap: l.swap,
  risk: l.risk,
}));

const matrix = [
  { attr: '护甲', heroes: ['波比', '墨菲特'], items: ['黎明圣盾', '棘刺背心', '石像鬼石板甲'], augments: ['更大更好的圆盾', '坚如磐石'], verdict: '最值得挖，能同时喂承伤/伤害/回复' },
  { attr: '攻速', heroes: ['贾克斯', '卡莎'], items: ['鬼索的狂暴之刃', '疾射火炮', '电刃'], augments: ['无情连打', '侦察小队'], verdict: '强但怕控制，适合二阶段装备定线' },
  { attr: '蓝量', heroes: ['李青', '悠米', '佐伊'], items: ['蓝霸符', '圣盾使的誓约', '黎明核心'], augments: ['净化之金钟罩', '猫之精准'], verdict: '启动快就是质变，断蓝则废' },
  { attr: '护盾', heroes: ['瑟提', '安妮', '李青'], items: ['圣盾使的誓约', '光盾徽章', '永恒契约'], augments: ['再生护盾', '嗜火'], verdict: '要看阈值是否重叠，不是所有盾都强' },
  { attr: '破甲', heroes: ['莎弥拉', '赛娜', '薇恩'], items: ['最后的轻语', '飓风'], augments: ['评级与交火', '特工编队'], verdict: '不是单件输出装，而是收割循环入口' },
];

const out = {
  version: version.label,
  generated: new Date().toISOString().slice(0, 10),
  summary: {
    title: '官方阵容再发明：从数值闭环重组阵容',
    claim: '官方阵容只作为种子；模型优先寻找“同一属性被输出、防御、回复、护盾重复利用”的闭环，再反推装备和阵容替换。',
    best: variants[0],
    counts: {
      loops: variants.length,
      officialSeeds: new Set(variants.flatMap(v => v.seeds.map(s => s.name))).size,
      sTierLoops: variants.filter(v => v.tier === 'S').length,
    },
  },
  variants,
  matrix,
  nextExperiments: [
    '把对局截图里的承伤/治疗/护盾数字录入，校准 EHP 模型。',
    '对每个官方阵容生成 3 个替代装备包：线性装、闭环装、补短板装。',
    '加入敌方画像：物理多、法系多、控制多、后排切入，自动切换变体。',
    '把英雄强化作为第一等信号：没有核心强化时，闭环权重自动降级。',
  ],
};

fs.writeFileSync(path.join(ROOT, 'reinvent_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(ROOT, '可视化', 'reinvent-data.js'), 'window.REINVENT=' + JSON.stringify(out) + ';');

console.log('官方阵容再发明数据生成完成');
console.log(`闭环候选 ${out.summary.counts.loops} 条，映射官方种子 ${out.summary.counts.officialSeeds} 套`);
variants.slice(0, 5).forEach(v => console.log(`#${v.rank} ${v.title} ${v.score}分 ${v.metric}`));
