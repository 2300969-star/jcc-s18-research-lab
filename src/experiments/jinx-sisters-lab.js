// 17.6b“姐妹”机制实验：补足通用木桩模型看不到的永久击杀成长、蓝霸回蓝与导弹进化。
const fs = require('fs');
const { simulate, tankEHP, chess, equip } = require('../core/model.js');
const { currentVersion } = require('../core/version-context.js');
const { ROOT, dataPath, resultPath, reportPath, ensureOutputDirs } = require('../lib/project-paths');

const version = currentVersion(ROOT);
const read = file => JSON.parse(fs.readFileSync(dataPath(file), 'utf8')).data;
const race = read('race.js');
const job = read('job.js');
const hex = read('hex.js');

// 官方17.6b公告给出的确定数值。导弹“增加”的具体伤害分配未公开，因此按每20次击杀+1枚、最多3枚做保守总伤口径。
const SISTERS = {
  augment: '姐妹',
  jinxApPerKill: 2,
  viHpPerKill: 2,
  evolutionKills: 20,
  maxMissiles: 3,
  blueKillMana: 10,
};
const ITEM_POOL = ['蓝霸符', '朔极之矛', '珠光护手', '巨人捕手', '班克斯的魔法帽', '海克斯科技枪刃', '斯塔缇克电刃'];
const BLUE = '蓝霸符';
const JINX_STAR = 3;

function hero(name) {
  return Object.values(chess).find(h => h.name === name && h.showHeroTag === '1');
}

function item(name) {
  return Object.values(equip).find(e => e.name === name);
}

function combinations(values, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) { out.push(prefix); return out; }
  for (let i = start; i < values.length; i++) combinations(values, size, i + 1, [...prefix, values[i]], out);
  return out;
}

function missileCount(kills) {
  return Math.min(SISTERS.maxMissiles, 1 + Math.floor(Math.max(0, kills) / SISTERS.evolutionKills));
}

function sistersDps(items, kills, boardBonus = {}) {
  const jinx = hero('金克丝');
  const ids = items.map(name => item(name)?.id).filter(Boolean);
  const bonus = {
    ap: Number(boardBonus.ap || 0) + kills * SISTERS.jinxApPerKill,
    adPct: Number(boardBonus.adPct || 0),
    ampPct: Number(boardBonus.ampPct || 0),
  };
  const raw = simulate(jinx.id, ids, JINX_STAR, 30, bonus);
  const missiles = missileCount(kills);
  // 蓝霸在技能后3秒内参与击败返10蓝。假设成长金克丝每轮技能至少完成一次参与击败，按有效法力缺口折算施法频率。
  const blueRefundRatio = items.includes(BLUE) ? (65 - 10) / Math.max(1, 65 - 10 - SISTERS.blueKillMana) : 1;
  const spell = raw.spell * missiles * blueRefundRatio;
  return {
    kills,
    missiles,
    items,
    dps: Math.round((raw.auto + raw.proc + spell) * 10) / 10,
    auto: Math.round(raw.auto * 10) / 10,
    spell: Math.round(spell * 10) / 10,
    casts: Math.round(raw.casts * blueRefundRatio * 10) / 10,
    blueRefundRatio: Math.round(blueRefundRatio * 100) / 100,
  };
}

function unitTraits(name) {
  const h = hero(name);
  return [...String(h?.species || '').split('|'), ...String(h?.class || '').split('|')].filter(id => id && id !== '-1');
}

function activeTraits(team) {
  const counts = {};
  team.forEach(name => unitTraits(name).forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
  return Object.entries(counts).map(([id, count]) => {
    const t = race[id] || job[id];
    const tiers = String(t?.numList || '').split('|').map(Number).filter(Boolean);
    const active = tiers.filter(n => count >= n).pop();
    return active ? { id, name: t.name, count, active, label: `${active}${t.name}` } : null;
  }).filter(Boolean).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function boardBonus(traits, superStars = 0) {
  const has = name => traits.find(t => t.name === name);
  const anima = has('幻灵战队')?.active || 0;
  const animaPower = anima >= 7 ? 60 : anima >= 5 ? 35 : anima >= 3 ? 10 : 0;
  const supers = has('超级英雄') ? 20 + 5 * superStars : 0;
  return { ap: animaPower, adPct: animaPower, ampPct: supers };
}

function frontEhp(team) {
  const front = team.filter(name => name !== '金克丝');
  return Math.round(front.reduce((sum, name) => {
    const h = hero(name);
    if (!h) return sum;
    const star = Number(h.price) <= 2 ? 3 : 2;
    return sum + (tankEHP(h.id, [], star)?.ehp || 0);
  }, 0));
}

const BOARD_CANDIDATES = [
  {
    key: 'supers-anima',
    name: '超英幻灵姐妹',
    team: ['金克丝', '蔚', '普朗克', '李青', '墨菲特', '塞拉斯', '内瑟斯', '艾克'],
    superStars: 3,
    note: '6级先成3超英+金克丝蔚，7级补内瑟斯开3幻灵/2吉祥物，8级艾克开淘气包和秘卫。',
  },
  {
    key: 'supers-aegis',
    name: '超英秘卫姐妹',
    team: ['金克丝', '蔚', '普朗克', '李青', '墨菲特', '阿利斯塔', '艾克', '拉莫斯'],
    superStars: 3,
    note: '牺牲3幻灵，换更厚秘卫、淘气包和怪兽前排，适合法系环境。',
  },
  {
    key: 'anima-five',
    name: '五幻灵姐妹',
    team: ['金克丝', '蔚', '内瑟斯', '塞拉斯', '锐雯', '厄运小姐', '阿利斯塔', '艾克'],
    superStars: 0,
    note: '不追超英全员，靠5幻灵35双强和四费副C提高后期上限。',
  },
];

const boardRows = BOARD_CANDIDATES.map(board => {
  const traits = activeTraits(board.team);
  const bonus = boardBonus(traits, board.superStars);
  const probeItems = [BLUE, '珠光护手', '巨人捕手'];
  const dps20 = sistersDps(probeItems, 20, bonus).dps;
  const ehp = frontEhp(board.team);
  return { ...board, traits, bonus, dps20, frontEhp: ehp, score: Math.round(dps20 + ehp / 35) };
}).sort((a, b) => b.score - a.score);

const bestBoard = boardRows[0];
const itemRank = combinations(ITEM_POOL, 3).map(items => ({
  items,
  zero: sistersDps(items, 0, bestBoard.bonus),
  ten: sistersDps(items, 10, bestBoard.bonus),
  twenty: sistersDps(items, 20, bestBoard.bonus),
})).sort((a, b) => b.twenty.dps - a.twenty.dps);
const bestItems = itemRank[0].items;
const growth = [0, 5, 10, 15, 20, 30, 40].map(kills => sistersDps(bestItems, kills, bestBoard.bonus));
const growthRatio = growth.find(x => x.kills === 20).dps / growth[0].dps;
const matchBonus = Math.min(36, Math.max(18, Math.round(18 * Math.log2(growthRatio))));
const sistersHex = Object.values(hex).find(h => h.name === SISTERS.augment);

const board = [
  { name: '蔚', row: 1, col: 2, role: '主坦/姐妹核心' },
  { name: '墨菲特', row: 1, col: 4, role: '超英主坦' },
  { name: '李青', row: 1, col: 6, role: '斗士前排' },
  { name: '艾克', row: 2, col: 1, role: '淘气包/秘卫' },
  { name: '塞拉斯', row: 2, col: 4, role: '幻灵前排' },
  { name: '内瑟斯', row: 2, col: 7, role: '幻灵/吉祥物' },
  { name: '普朗克', row: 3, col: 4, role: '超级英雄' },
  { name: '金克丝', row: 4, col: 4, carry: true, role: '主C', items: bestItems },
];

const route = {
  id: 'research-sisters-jinx',
  source: 'research',
  quality: 'S',
  name: '姐妹无限技能金克丝',
  family: '超英幻灵金克丝',
  goal: '姐妹限定；20层后进入导弹进化期',
  earlyUnits: ['金克丝', '蔚', '塞拉斯', '内瑟斯'],
  midUnits: ['金克丝', '蔚', '普朗克', '李青', '墨菲特', '塞拉斯'],
  coreUnits: board.map(x => x.name),
  earlyTraits: ['3超级英雄', '2斗士', '3幻灵战队'],
  componentPrefs: ['女神之泪', '无用大棒', '拳套', '暴风之剑', '反曲之弓'],
  completedPrefs: bestItems,
  augmentPrefs: ['姐妹', '公理圆弧II', '羽量级选手 II', 'DD街区', '团队建设'],
  augmentCats: ['英雄强化', '战力', '经济'],
  monsterPrefs: ['装备商人（经济）', '魄罗粉丝（战力）'],
  route: ['金克丝+蔚拿姐妹', '6级3超英慢D金克丝三星', '7级补3幻灵/2吉祥物', '8级艾克开淘气包/秘卫'],
  boardNote: '金克丝沉底避开第一轮集火；蔚和超英前排分散站。20层前靠前排和控制保叠层，20层后利用额外导弹加速清场。',
  board,
  officialText: {
    early: '只有拿到【姐妹】才定线；2阶段用幻灵/斗士保血，金克丝和蔚都留。',
    equipment: `金克丝优先${bestItems.join('、')}；蓝霸的击杀回蓝是技能循环入口，不可按普通法系装估值。`,
    hex: '【姐妹】是硬门槛；公理圆弧进一步压缩击杀后的第二次施法间隔。',
    enemy: '第一炮无法参与击杀、金克丝被切或前排过薄都会让成长断档；不是无条件强玩。',
  },
  actions: {
    keep: ['金克丝', '蔚', '普朗克', '李青', '墨菲特', '塞拉斯', '内瑟斯', '艾克'],
    item: `先做${bestItems[0]}和${bestItems[1]}，保证首炮与击杀回蓝；第三件按模型优先${bestItems[2]}。`,
    checkpoint: '有姐妹+金克丝蔚才启动；6级慢D金克丝三星，20次击杀前以保血和让金克丝收尾为第一目标。',
    stopLoss: '没有姐妹、金克丝无法两星或蓝装完全断档时，立即转幻灵女枪/超英法系。',
  },
  role: '法系',
  strengthPrior: Math.round((growthRatio - 1) * 100) / 100,
  mechanic: {
    type: 'sisters-growth',
    requiredAugment: '姐妹',
    requiredUnits: ['金克丝', '蔚'],
    matchBonus,
    missingPenalty: 60,
    threshold: SISTERS.evolutionKills,
    text: `金克丝每次击杀永久+${SISTERS.jinxApPerKill}%法强；${SISTERS.evolutionKills}次后增加导弹`,
  },
};

const out = {
  version: version.label,
  generated: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  source: {
    officialAugment: sistersHex,
    patch: '17.6b：金克丝击杀1%→2%法强，蔚击杀1%→2%最大生命，导弹与护盾增加阈值100→20次。',
  },
  mechanics: SISTERS,
  assumptions: [
    '官方数据文件只写“互相鼓励成长”，具体数值来自17.6b更新公告。',
    '导弹进化按每20次击杀增加1枚、最多3枚的保守总伤模型；它代表清场能力，不等同于单体同目标伤害。',
    '蓝霸符按技能后参与击败返10法力折算施法频率；通用model.js此前没有目标死亡，因此看不到这段收益。',
    '击杀层数跨回合累计，实验展示0/10/20/30/40层状态，不把20层强度伪装成开局强度。',
  ],
  blindSpot: [
    '通用搜索使用不死亡的单体木桩，没有击杀事件。',
    'hex.js没有姐妹的成长数值，普通文本解析无法恢复机制。',
    '蓝霸符的击杀回蓝此前未建模，导致技能循环装备被低估。',
    '官方44套阵容没有姐妹金克丝模板，所以stage2没有任何路线可匹配。',
  ],
  boards: boardRows,
  itemRank: itemRank.slice(0, 10),
  growth,
  growthRatio: Math.round(growthRatio * 100) / 100,
  route,
};

function report(data) {
  const lines = [
    '# 17.6b 姐妹无限技能金克丝实验', '',
    `数据版本：${data.version}`, '',
    '## 为什么旧模型算不出来',
    ...data.blindSpot.map(x => `- ${x}`), '',
    '## 成长曲线', '',
    '| 永久击杀 | 导弹数 | 30秒DPS | 技能DPS | 折算施法次数 |',
    '|---:|---:|---:|---:|---:|',
    ...data.growth.map(x => `| ${x.kills} | ${x.missiles} | ${x.dps} | ${x.spell} | ${x.casts} |`), '',
    '## 三件套排名（20层）', '',
    '| 排名 | 装备 | 0层DPS | 10层DPS | 20层DPS |',
    '|---:|---|---:|---:|---:|',
    ...data.itemRank.map((x, i) => `| ${i + 1} | ${x.items.join('+')} | ${x.zero.dps} | ${x.ten.dps} | ${x.twenty.dps} |`), '',
    '## 棋盘壳比较', '',
    '| 排名 | 棋盘 | 关键羁绊 | 20层DPS | 前排EHP | 总分 |',
    '|---:|---|---|---:|---:|---:|',
    ...data.boards.map((x, i) => `| ${i + 1} | ${x.name} | ${x.traits.map(t => t.label).join('/')} | ${x.dps20} | ${x.frontEhp} | ${x.score} |`), '',
    '## 结论', '',
    `- 最优实验壳：${data.boards[0].name}，${data.boards[0].team.join('、')}。`,
    `- 最优三件套：${data.route.completedPrefs.join('、')}。`,
    `- 20层相对0层DPS倍率：${data.growthRatio}x；这套是“先满足姐妹，再经营击杀层数”的条件阵容，不是裸金克丝强度。`,
    '- 20层前的任务是让金克丝参与收尾并保住血量；20层后才进入视频中的多导弹清屏阶段。', '',
    '## 假设边界',
    ...data.assumptions.map(x => `- ${x}`),
  ];
  ensureOutputDirs();
  fs.writeFileSync(reportPath('姐妹无限金克丝实验.md'), lines.join('\n'));
}

fs.writeFileSync(resultPath('jinx_sisters_results.json'), JSON.stringify(out, null, 1));
report(out);

if (require.main === module) {
  if (!sistersHex) throw new Error('未找到姐妹英雄强化');
  if (growth.find(x => x.kills === 20).missiles <= growth[0].missiles) throw new Error('20层未触发导弹进化');
  if (!bestItems.includes(BLUE)) throw new Error('成长模型未识别蓝霸击杀回蓝价值');
  console.log(`姐妹金克丝实验完成: ${version.label}`);
  console.log(`最优棋盘: ${bestBoard.name} ${bestBoard.score}分`);
  console.log(`最优装备: ${bestItems.join('+')}`);
  growth.forEach(x => console.log(`${x.kills}层: ${x.dps} DPS / ${x.missiles}导弹 / ${x.casts}次施法`));
}

module.exports = { sistersDps, missileCount, activeTraits, out };
