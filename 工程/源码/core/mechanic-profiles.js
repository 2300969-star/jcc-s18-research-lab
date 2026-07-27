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

function classifyAugmentSemantics(desc, hero, events = []) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim();
  const teamWide = /你的弈子们|己方[^.。；]*弈子|你的队伍/.test(text);
  const allyAura = /(?:同一排|相距最近|邻格|附近|携带了[^.。；]*)[^.。；]{0,24}(?:友军|友方英雄)|(?:为|给)相距最近的?\d*名?友军|友军们?(?:会|获得|提供|免疫)/.test(text);
  const economy = /金币|利息|商店|刷新|免费|宝藏|小小英雄|掉落/.test(text);
  const item = /装备|组件|散件|成装|纹章|石像鬼石板甲|夜之锋刃|圣盾使的誓约/.test(text);
  const personalDamage = /技能伤害提升|多造成|造成[^.。；]{0,20}(?:额外|魔法|真实|物理)?伤害|技能[^.。；]{0,30}(?:造成|弹射|发射|额外施放|更大|更广)|攻击[^.。；]{0,30}(?:造成|发射|附带)|普攻变为|强化圆盾|额外的?攻击|发射[^.。；]{0,16}额外|额外[^.。；]{0,12}(?:弹体|无人机|魔印|暗之禁锢|光束|流星)|真实伤害|真伤|强化版星星/.test(text);
  const offense = personalDamage || /攻击速度|攻速|物理加成|法术加成|攻击力|伤害增幅|造成的伤害提升|技能可以暴击|技能会暴击|攻击距离|射程|全能汲取|斩杀|吞噬|法力值消耗降低|技能消耗降低/.test(text)
    || events.some(event => ['spell-multiplier', 'spell-echo', 'nth-attack-stat', 'nth-attack', 'cast-max-hp-damage', 'spell-crit'].includes(event.type));
  const defenseText = text.replace(/(?:护甲|魔抗|魔法抗性)击碎/g, '');
  const defense = /额外生命值|最大生命值|护甲|魔法抗性|魔抗|护盾|治疗自身|回复生命|伤害减免|所受的?\d+%?伤害/.test(defenseText);
  const control = /眩晕|晕眩|击飞|冰冷|破法|击退|摧毁|免疫控制|投掷到敌方后排|攻击速度降低/.test(text);

  if (teamWide || (allyAura && !personalDamage)) {
    return { strategicRole: 'support', coreDefining: false, preferredRole: 'support', teamWide: true };
  }
  if (economy && !offense && !defense) {
    return { strategicRole: 'economy', coreDefining: false, preferredRole: 'utility', teamWide: false };
  }
  if ((item || control) && !offense && !defense) {
    return { strategicRole: 'utility', coreDefining: false, preferredRole: 'utility', teamWide: false };
  }
  if (defense && !offense) {
    return { strategicRole: 'frontline', coreDefining: true, preferredRole: 'frontline', teamWide: false };
  }
  if (offense) {
    return { strategicRole: 'carry', coreDefining: true, preferredRole: 'mainCarry', teamWide: false };
  }
  return { strategicRole: 'utility', coreDefining: false, preferredRole: 'utility', teamWide: false };
}

function genericProfile(augment) {
  const desc = String(augment.desc || '').replace(/\s+/g, ' ');
  const heroes = bracketHeroes(desc);
  const granted = (desc.match(/提供1个【([^】]+)】/) || [])[1];
  const targets = granted && heroNames.has(granted) ? [granted] : heroes.slice(0, 1);
  const compiled = compileAugmentEvents(desc);
  const carryBonus = bonusFromEvents(compiled.events, ['target', 'team']);
  const semantics = classifyAugmentSemantics(desc, granted, compiled.events);
  return {
    id: `augment-${augment.id}`,
    augment: augment.name,
    augmentId: augment.id,
    targets,
    requiredUnits: targets,
    carryBonus,
    teamBonus: bonusFromEvents(compiled.events, ['team']),
    ...semantics,
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
    strategicRole: 'carry',
    coreDefining: true,
    preferredRole: 'mainCarry',
    teamWide: false,
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
  const grandmaster = profiles.find(profile => profile.augment === '宗师训练');
  const relentless = profiles.find(profile => profile.augment === '无情连打');
  const sleep = profiles.find(profile => profile.augment === '睡眠时间');
  const tip = profiles.find(profile => profile.augment === '送餐小费');
  const poppy = profiles.find(profile => profile.augment === '更大更好的圆盾');
  if (!grandmaster || grandmaster.strategicRole !== 'support' || grandmaster.coreDefining) throw new Error('团队增益英雄强化不得自动定义主C');
  if (!relentless || relentless.strategicRole !== 'carry' || !relentless.coreDefining) throw new Error('输出型英雄强化必须标记为主C承接');
  if (!sleep || sleep.strategicRole !== 'utility' || sleep.coreDefining) throw new Error('纯控制英雄强化不得强行定主C');
  if (!tip || tip.strategicRole !== 'economy' || tip.coreDefining) throw new Error('纯经济英雄强化不得强行定主C');
  if (!poppy || poppy.strategicRole !== 'frontline' || poppy.preferredRole !== 'frontline') throw new Error('纯防御英雄强化应定义前排核心而非输出主C');
  console.log(`mechanic-profiles assertions passed (${profiles.filter(x => x.supported).length}/${profiles.length} supported)`);
}

module.exports = { profiles, buildProfiles, inferStaticBonus, bracketHeroes, classifyAugmentSemantics };
