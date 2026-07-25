// 英雄强化机制层：负责把官方强化文本转换为可模拟场景，不保存任何阵容答案。
const fs = require('fs');
const { dataPath } = require('../lib/project-paths');
const { compileAugmentEvents, bonusFromEvents, transformSimulation } = require('./event-model');

const read = file => JSON.parse(fs.readFileSync(dataPath(file), 'utf8')).data;
const chess = read('chess.js');
const hex = read('hex.js');
const equip = read('equip.js');
const heroNames = new Set(Object.values(chess).filter(x => x && x.name && x.showHeroTag === '1').map(x => x.name));
const itemNames = Object.fromEntries(Object.values(equip).filter(Boolean).map(x => [x.id, x.name]));

const EXPECTED_STACKS = 3;
const SISTERS_KILLS = 20;

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function bracketHeroes(text) {
  return uniq([...String(text || '').matchAll(/【([^】]+)】/g)].map(m => m[1]).filter(x => heroNames.has(x)));
}

function numbersFor(text, patterns) {
  const values = [];
  patterns.forEach(pattern => {
    for (const match of String(text || '').matchAll(pattern)) values.push(Number(match[1]) || 0);
  });
  return values;
}

function inferStaticBonus(desc) {
  const stackFactor = /叠加|每次施放|每第三次|每3次/.test(desc) ? EXPECTED_STACKS : 1;
  const max = values => values.length ? Math.max(...values) : 0;
  const asPct = max(numbersFor(desc, [/获得\+?(\d+(?:\.\d+)?)%攻击速度/g, /获得\+?(\d+(?:\.\d+)?)%攻速/g]));
  const ap = max(numbersFor(desc, [/获得[^。；]*?(\d+(?:\.\d+)?)%法术加成/g, /获得[^。；]*?(\d+(?:\.\d+)?)法术加成/g, /拥有\+?(\d+(?:\.\d+)?)%?法术加成/g]));
  const adPct = max(numbersFor(desc, [/获得\+?(\d+(?:\.\d+)?)%物理加成/g, /获得\+?(\d+(?:\.\d+)?)%攻击力/g]));
  const ampPct = max(numbersFor(desc, [/(\d+(?:\.\d+)?)%伤害增幅/g, /造成的伤害提升(\d+(?:\.\d+)?)%/g]));
  const bonus = {};
  if (asPct) bonus.asPct = asPct * stackFactor;
  if (ap) bonus.ap = ap * stackFactor;
  if (adPct) bonus.adPct = adPct * stackFactor;
  if (ampPct) bonus.ampPct = ampPct;
  return { bonus, stackFactor, supported: Object.keys(bonus).length > 0 };
}

function genericProfile(augment) {
  const desc = String(augment.desc || '').replace(/\s+/g, ' ');
  const heroes = bracketHeroes(desc);
  const granted = (desc.match(/提供1个【([^】]+)】/) || [])[1];
  const targets = granted && heroNames.has(granted) ? [granted] : heroes.slice(0, 1);
  const compiled = compileAugmentEvents(desc);
  const carryBonus = bonusFromEvents(compiled.events, ['target', 'team']);
  return {
    id: `augment-${augment.id}`,
    augment: augment.name,
    augmentId: augment.id,
    targets,
    requiredUnits: targets,
    carryBonus,
    teamBonus: bonusFromEvents(compiled.events, ['team']),
    events: compiled.events,
    supported: targets.length > 0 && compiled.supported,
    confidence: compiled.supported ? compiled.confidence : 0,
    basis: compiled.supported
      ? `官方文本事件算子：${compiled.events.map(event => event.type).join('、')}${compiled.notes.length ? `；部分覆盖：${compiled.notes.join('、')}` : ''}`
      : '官方文本没有可直接恢复的战斗事件',
    desc,
    transformCarry: compiled.events.length ? (sim, context) => transformSimulation(sim, compiled.events, context) : undefined,
  };
}

function sistersProfile(base) {
  return {
    ...base,
    id: 'augment-sisters-growth',
    targets: ['金克丝'],
    requiredUnits: ['金克丝', '蔚'],
    carryBonus: { ap: SISTERS_KILLS * 2 },
    supported: true,
    confidence: 0.72,
    basis: `17.6b公告、17.7保留：按${SISTERS_KILLS}次击杀、每次+2%法强并触发额外导弹的中位状态`,
    transformCarry(sim, context) {
      const names = (context.items.ids || []).map(id => itemNames[id]);
      const blueRatio = names.includes('蓝霸符') ? 55 / 45 : 1;
      return {
        ...sim,
        spell: sim.spell * 2 * blueRatio,
        casts: sim.casts * blueRatio,
        dps: sim.auto + sim.proc + sim.spell * 2 * blueRatio,
      };
    },
  };
}

function buildProfiles() {
  return Object.values(hex)
    .filter(x => x && x.name && Number(x.level) === 4)
    .map(genericProfile)
    .map(profile => profile.augment === '姐妹' ? sistersProfile(profile) : profile);
}

const profiles = buildProfiles();

if (require.main === module) {
  const sisters = profiles.find(x => x.augment === '姐妹');
  if (!sisters || !sisters.supported) throw new Error('姐妹机制未进入强化场景');
  if (sisters.requiredUnits.join(',') !== '金克丝,蔚') throw new Error('姐妹硬门槛错误');
  if (profiles.some(profile => Object.prototype.hasOwnProperty.call(profile, 'team'))) throw new Error('机制配置不得注入阵容答案');
  const parsed = inferStaticBonus('每次施放后获得20%攻击速度和25%法术加成，这个效果可以叠加。');
  if (parsed.bonus.asPct !== 60 || parsed.bonus.ap !== 75) throw new Error('叠层文本解析失败');
  console.log(`mechanic-profiles assertions passed (${profiles.filter(x => x.supported).length}/${profiles.length} supported)`);
}

module.exports = { profiles, buildProfiles, inferStaticBonus, bracketHeroes };
