// 二阶段阵容匹配器：用来牌/装备/符文信号实时重排路线
const fs = require('fs');
const path = require('path');
const { ROOT, resultPath, reportPath, publicPath, ensureOutputDirs } = require('../lib/project-paths');

const sourcePath = file => file.startsWith('data/') ? path.join(ROOT, file) : resultPath(file);
const read = file => JSON.parse(fs.readFileSync(sourcePath(file), 'utf8'));
const readOptional = file => {
  try {
    return JSON.parse(fs.readFileSync(sourcePath(file), 'utf8'));
  } catch (e) {
    return null;
  }
};
const data = {
  chess: read('data/chess.js').data,
  equip: read('data/equip.js').data,
  hex: read('data/hex.js').data,
  race: read('data/race.js').data,
  job: read('data/job.js').data,
  lineups: read('data/lineup_detail_total.json').lineup_list,
};

const nameOf = {
  hero: id => (data.chess[id] || {}).name || id,
  item: id => (data.equip[id] || {}).name || id,
  hex: id => (data.hex[id] || {}).name || id,
  trait: t => ((data.race[t.id] || data.job[t.id] || {}).name || t.id),
};
const csv = s => String(s || '').split(',').filter(Boolean);
const uniq = arr => [...new Set((arr || []).filter(Boolean))];
const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const modelResults = readOptional('model_results.json') || {};
const mechaPrimeResults = readOptional('mecha_prime_results.json') || null;
const metaDiscoveryResults = readOptional('meta_discovery_results.json') || null;
const augmentTransitionResults = readOptional('augment_transition_results.json') || null;
const strategyPolicyResults = readOptional('strategy_policy_results.json') || null;
const mechaPrimeNames = new Set(((mechaPrimeResults && mechaPrimeResults.mechaMembers) || []).map(x => x.name));

const COMPONENTS = [
  '暴风之剑', '反曲之弓', '无用大棒', '女神之泪', '锁子甲',
  '负极斗篷', '巨人腰带', '拳套', '金铲铲',
];
const ATTACK_ITEMS = ['鬼索的狂暴之刃', '疾射火炮', '卢安娜的飓风', '最后的轻语', '锐利之刃', '无尽之刃', '巨人捕手'];
const AP_ITEMS = ['蓝霸符', '珠光护手', '班克斯的魔法帽', '巨人捕手', '斯塔缇克电刃', '朔极之矛'];
const TANK_ITEMS = ['狂徒铠甲', '日炎斗篷', '石像鬼石板甲', '棘刺背心', '巨龙之爪', '圣盾使的誓约', '离子火花', '振奋盔甲'];
const JAX_ITEMS = ['泰坦的坚决', '水银', '鬼索的狂暴之刃', '疾射火炮', '海克斯科技枪刃', '汲取剑'];
const ITEM_ALIASES = {
  羊刀: '鬼索的狂暴之刃',
  鬼索: '鬼索的狂暴之刃',
  火炮: '疾射火炮',
  泰坦: '泰坦的坚决',
  法爆: '珠光护手',
  帽子: '班克斯的魔法帽',
  轻语: '最后的轻语',
  飓风: '卢安娜的飓风',
  巨杀: '巨人捕手',
  锐利: '锐利之刃',
  狂徒: '狂徒铠甲',
  离子: '离子火花',
};
const TANK_ITEM_SET = new Set(TANK_ITEMS);
const UNIT_ALIASES = {
  蔚: ['vi', '皮城执法官', '执法官'],
  雷克顿: ['鳄鱼', 'renekton', '怒之领域'],
  亚索: ['风男', '快乐风男', '托儿索', '疾风剑豪', 'yasuo'],
  普朗克: ['船长', '海洋之灾', 'gp', 'gangplank'],
  布里茨: ['机器人', '蒸汽机器人', 'blitz', 'blitzcrank'],
  璐璐: ['露露', 'lulu', '仙灵女巫'],
  凯尔: ['天使', '正义天使', 'kayle'],
  波比: ['poppy', '圣锤之毅'],
  李青: ['瞎子', '盲僧', 'lee', 'leesin', 'lee sin'],
  安妮: ['火女', '黑暗之女', 'annie'],
  艾希: ['寒冰', '冰弓', '冰霜射手', 'ashe'],
  加里奥: ['正义巨像', '巨像', 'galio'],
  悠米: ['猫咪', '猫', '魔法猫咪', 'yuumi'],
  菲奥娜: ['剑姬', '女剑', '无双剑姬', 'fiora'],
  伊泽瑞尔: ['ez', 'ezreal', '黄毛', '小黄毛', '探险家'],
  贾克斯: ['武器', '武器大师', 'jax', '拉面'],
  墨菲特: ['石头人', '石头', '熔岩巨兽', 'malphite'],
  希维尔: ['轮子妈', '战争女神', 'sivir'],
  泰隆: ['男刀', '刀锋', '刀锋之影', 'talon'],
  孙悟空: ['猴子', '悟空', '大圣', '齐天大圣', 'wukong'],
  内瑟斯: ['狗头', '沙漠死神', 'nasus'],
  佐伊: ['zoe', '暮光星灵'],
  德莱文: ['draven', '荣耀行刑官'],
  赛娜: ['senna', '涤魂圣枪'],
  芮尔: ['rell', '镕铁少女', '熔铁少女'],
  拉克丝: ['光女', '光辉', '光辉女郎', 'lux'],
  卡蜜尔: ['青钢影', '卡密尔', '卡米尔', 'camille'],
  塞拉斯: ['偷男', '解脱者', 'sylas'],
  亚托克斯: ['剑魔', '暗裔剑魔', 'aatrox'],
  娑娜: ['琴女', '琴瑟仙女', 'sona'],
  阿利斯塔: ['牛头', '老牛', '牛', '牛头酋长', 'alistar'],
  乐芙兰: ['妖姬', '诡术妖姬', 'leblanc', 'lb'],
  维克兹: ['大眼', '虚空之眼', 'velkoz', "vel'koz"],
  薇恩: ['vn', '维恩', '暗夜猎手', 'vayne'],
  锐雯: ['瑞文', '瑞雯', '放逐之刃', '锐萌萌', 'riven'],
  金克丝: ['金克斯', '暴走萝莉', 'jinx'],
  瑟庄妮: ['猪妹', '猪女', '瑟庄尼', '北地之怒', 'sejuani', 'sej'],
  瑟提: ['腕豪', 'sett'],
  蕾欧娜: ['日女', '曙光', '曙光女神', 'leona'],
  莎弥拉: ['莎米拉', '沙弥拉', 'samira'],
  厄斐琉斯: ['月男', '月亮男', '残月之肃', 'aphelios'],
  厄加特: ['螃蟹', '无畏战车', 'urgot'],
  费德提克: ['稻草人', 'fiddle', 'fiddlesticks'],
  迦娜: ['风女', '风暴之怒', 'janna'],
  拉莫斯: ['龙龟', '披甲龙龟', 'rammus'],
  卡莎: ['虚空之女', 'kaisa', "kai'sa"],
  尼菈: ['nilah'],
  劫: ['影流之主', 'zed'],
  索拉卡: ['奶妈', '众星之子', 'soraka'],
  艾克: ['时间刺客', 'ekko'],
  厄运小姐: ['女枪', '赏金', '赏金猎人', 'mf', 'missfortune', 'miss fortune'],
  塔莉垭: ['岩雀', 'taliyah'],
  扎克: ['生化魔人', 'zac'],
  科加斯: ['大虫子', '虫子', '虚空恐惧', 'chogath', "cho'gath"],
  卑尔维斯: ['女皇', '虚空女皇', 'belveth', "bel'veth"],
  努努和威朗普: ['努努', '雪人', '雪原双子', 'nunu', 'willump', 'nunu willump'],
  '奥瑞利安 · 索尔': ['奥瑞利安索尔', '龙王', 'asol', 'aurelion sol', 'aurelionsol'],
  佛耶戈: ['破败王', '破败之王', 'viego'],
  莫德凯撒: ['铁男', '金属大师', 'mordekaiser'],
};

function unitAliasesFor(name) {
  const paintAliases = Object.values(data.chess)
    .filter(h => h.name === name && h.heroPaint)
    .flatMap(h => {
      const raw = String(h.heroPaint).replace(/^s\d+_/, '').replace(/_/g, ' ');
      return [raw, raw.replace(/\s+/g, '')];
    });
  return uniq([...(UNIT_ALIASES[name] || []), ...paintAliases]);
}

function augmentAliasesFor(name) {
  const compact = String(name || '').replace(/[!！?？。,.，、\s]/g, '');
  const aliases = [compact];
  if (name === '升级咯！') aliases.push('升级咯', '升级咯!', '升级了', '升级');
  return uniq(aliases.filter(x => x && x !== name));
}

function classifyAug(hex) {
  const text = `${hex.name || ''} ${hex.description || hex.desc || ''}`;
  const cats = [];
  if (/高端购物|升级咯|对冲基金|利滚利|明智消费|DD街区|生日礼物|英勇福袋|团队建设|金币|商店|刷新|经验/.test(text)) cats.push('经济');
  if (/锻炉|百宝袋|潘朵拉|打捞桶|珍藏财宝|装备|重铸器|神器/.test(text)) cats.push('装备');
  if (/之徽|之心|之冕|纹章|转职/.test(text)) cats.push('羁绊');
  if (String(hex.level) === '4' || /提供1个【/.test(text)) cats.push('英雄强化');
  if (!cats.length) cats.push('战力');
  return cats;
}

function familyOf(name, detail) {
  const text = `${name} ${detail.early_info || ''} ${detail.hex_info || ''}`;
  if (/贾克斯|武器/.test(text)) return '机甲贾克斯';
  if (/小天才|佐伊|安妮/.test(text)) return '小天才法系';
  if (/决斗|薇恩|剑姬|天使/.test(text)) return '决斗';
  if (/枪手|莎弥拉|厄斐琉斯|平民/.test(text)) return '枪手九五';
  if (/魔盗/.test(text)) return '魔盗经济';
  if (/怪兽/.test(text)) return '怪兽九五';
  if (/猫咪|悠米|超级英雄/.test(text)) return '超英赌低费';
  return '通用过渡';
}

function compKey(name) {
  return String(name || '').replace(/[【】\s]/g, '');
}

const modelCompByName = new Map((modelResults.comps || [])
  .filter(x => x && x.name && x.detail && Array.isArray(x.detail.heroes))
  .map(x => [compKey(x.name), x]));

function modelCompForLine(name) {
  return modelCompByName.get(compKey(name)) || null;
}

function modelFinalUnits(lineName) {
  const comp = modelCompForLine(lineName);
  return uniq(comp && comp.detail && comp.detail.heroes ? comp.detail.heroes.map(h => h.name) : []);
}

function roleOf(template) {
  const joined = [...template.completedPrefs, ...template.componentPrefs, template.family, template.name].join(' ');
  if (/贾克斯|决斗|枪手|德莱文|薇恩|剑姬|天使|鬼索|火炮|飓风|轻语|锐利/.test(joined)) return '普攻';
  if (/小天才|佐伊|猫咪|伊泽瑞尔|法爆|蓝霸符|大棒|女神之泪|灵能|爱心/.test(joined)) return '法系';
  if (/怪兽|九五|高端购物|升级咯/.test(joined)) return '九五';
  return '混合';
}

function canonicalItem(name) {
  const raw = String(name || '').split('/')[0].trim();
  return ITEM_ALIASES[raw] || raw;
}

function itemRecipeMap() {
  const out = {};
  Object.values(data.equip).filter(e => e && e.name).forEach(e => {
    const parts = [e.synthesis1, e.synthesis2]
      .filter(id => id && id !== '0')
      .map(id => nameOf.item(id))
      .filter(Boolean);
    if (parts.length) out[e.name] = parts;
  });
  return out;
}

const ITEM_RECIPES = itemRecipeMap();

function heroByName(name) {
  return Object.values(data.chess)
    .filter(h => h.name === name && String(h.setid) === '8' && String(h.showHeroTag) === '1')
    .sort((a, b) => Number(a.price) - Number(b.price) || Number(a.id) - Number(b.id))[0] || null;
}

function priceOf(name) {
  const h = heroByName(name);
  return h ? Number(h.price) || null : null;
}

function starTargetFor(name) {
  const price = priceOf(name) || 3;
  return price <= 3 ? 3 : 2;
}

function traitsForHero(name) {
  const h = heroByName(name);
  if (!h) return [];
  return uniq([...(String(h.species || '').split('|')), ...(String(h.class || '').split('|'))]
    .filter(id => id && id !== '-1' && id !== '0')
    .map(id => (data.race[id] || data.job[id] || {}).name)
    .filter(Boolean));
}

function heroFromAugment(hex) {
  const text = String(hex && (hex.description || hex.desc) || '');
  const provided = text.match(/提供(?:1个|一个)【([^】]+)】/);
  const standardNames = { '奥瑞利安 索尔': '奥瑞利安 · 索尔', 努努: '努努和威朗普' };
  const providedName = provided && (standardNames[provided[1]] || provided[1]);
  if (providedName && heroByName(providedName)) return providedName;
  return Object.values(data.chess)
    .filter(h => h.name && String(h.setid) === '8' && String(h.showHeroTag) === '1' && text.includes(h.name))
    .sort((a, b) => String(b.name).length - String(a.name).length || Number(a.price) - Number(b.price))[0]?.name || '';
}

// 英雄强化只描述局面变化，不携带任何阵容答案。评分层据此做确定性归约。
function heroAugmentEffect(hex, hero) {
  const desc = String(hex && (hex.description || hex.desc) || '');
  const stun = desc.match(/(?:眩晕|晕眩)\s*(\d+(?:\.\d+)?)\s*秒/);
  const grant = desc.match(/提供\s*(?:1\s*个|一个)【([^】]+)】/);
  const tags = [];
  if (grant) tags.push('grant-unit');
  if (/范围更广|范围扩大|范围增加/.test(desc)) tags.push('area');
  if (stun) tags.push('crowd-control');
  if (/金币|利息|商店|刷新|经验/.test(desc)) tags.push('economy');
  if (/装备|组件|散件|成装/.test(desc)) tags.push('item');
  if (/护盾|治疗|回复生命|伤害减免/.test(desc)) tags.push('defense');
  if (/攻击速度|物理加成|法术加成|伤害增幅/.test(desc)) tags.push('combat-stat');
  return {
    grantedHero: grant ? hero : '',
    grantedCopies: grant ? 1 : 0,
    tags,
    stunSeconds: stun ? Number(stun[1]) : 0,
    areaExpanded: tags.includes('area'),
  };
}

function buildHeroAugmentCatalog() {
  return Object.values(data.hex)
    .filter(hex => hex && hex.name && String(hex.level) === '4')
    .map(hex => {
      const hero = heroFromAugment(hex);
      return {
        name: hex.name,
        hero,
        cost: priceOf(hero),
        traits: traitsForHero(hero),
        desc: hex.description || hex.desc || '',
        effect: heroAugmentEffect(hex, hero),
      };
    })
    .filter(row => row.hero && row.cost)
    .sort((a, b) => a.cost - b.cost || a.hero.localeCompare(b.hero, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

const heroAugmentCatalog = buildHeroAugmentCatalog();
const heroAugmentByName = new Map(heroAugmentCatalog.map(row => [row.name, row]));

function parseTraitLabel(label) {
  const m = String(label || '').match(/^(\d+)(.+)$/);
  if (!m) return null;
  return { count: Number(m[1]), name: m[2], label: `${Number(m[1])}${m[2]}` };
}

function activeTraitsFromTemplate(template, modelComp) {
  const rows = [];
  if (modelComp && modelComp.detail && Array.isArray(modelComp.detail.traits)) {
    modelComp.detail.traits
      .filter(t => t && t.active)
      .map(t => parseTraitLabel(t.label))
      .filter(Boolean)
      .forEach(t => rows.push(t));
  }
  [...(template.earlyTraits || []), template.name || ''].forEach(text => {
    for (const m of String(text).matchAll(/(\d+)(幻灵战队|平民英雄|小天才|星之守护者|超级英雄|福牛守护者|战斗机甲|战队机甲|怪兽|地下魔盗团|AI程序|源计划：激光特工|源计划|混沌战士|护卫|斗士|决斗大师|秘术卫士|秘书卫士|情报特工|强袭枪手|吉祥物|爱心使者|黑客|灵能使|精英战士|气象主播)/g)) {
      const normalized = m[2] === '战队机甲' ? '战斗机甲'
        : m[2] === '秘书卫士' ? '秘术卫士'
        : m[2] === '源计划' ? '源计划：激光特工'
        : m[2];
      rows.push({ count: Number(m[1]), name: normalized, label: `${Number(m[1])}${normalized}` });
    }
  });
  const best = new Map();
  rows.forEach(row => {
    if (!best.has(row.name) || best.get(row.name).count < row.count) best.set(row.name, row);
  });
  return [...best.values()];
}

function roleFromModelHero(hero, carryName) {
  if (!hero) return 'utility';
  if (hero.name === carryName || hero.carry) return 'mainCarry';
  const items = (hero.items || []).map(canonicalItem).filter(Boolean);
  const tankItems = items.filter(x => TANK_ITEM_SET.has(x)).length;
  if (items.length && tankItems < items.length) return 'subCarry';
  if (hero.row <= 2 || tankItems || Number(hero.price) >= 4) return 'frontline';
  return 'utility';
}

function roleFromBoardUnit(unit, carryName) {
  if (!unit) return 'utility';
  if (unit.name === carryName || unit.carry || /主C/.test(unit.role || '')) return 'mainCarry';
  const items = (unit.items || []).map(canonicalItem).filter(x => ITEM_RECIPES[x] || TANK_ITEM_SET.has(x));
  const tankItems = items.filter(x => TANK_ITEM_SET.has(x)).length;
  if (items.length && tankItems < items.length) return 'subCarry';
  if (unit.row <= 2 || /前排|坦|控制/.test(unit.role || '') || tankItems) return 'frontline';
  return 'utility';
}

function profileItems(items, holder, role) {
  return uniq((items || []).map(canonicalItem).filter(x => x && ITEM_RECIPES[x]))
    .map(name => ({ name, holder, role, components: ITEM_RECIPES[name] || [] }));
}

function profileFromModel(template, modelComp) {
  const heroes = modelComp && modelComp.detail && Array.isArray(modelComp.detail.heroes) ? modelComp.detail.heroes : [];
  const carryHero = heroes.find(h => h.carry) || heroes.find(h => h.name === (modelComp.carry && modelComp.carry.hero)) || heroes[0] || {};
  const carryName = carryHero.name || (modelComp.carry && modelComp.carry.hero) || (template.carryUnits || [])[0] || (template.coreUnits || [])[0];
  const mainItems = profileItems((carryHero.items && carryHero.items.length ? carryHero.items : modelComp.carryItems || template.completedPrefs || []).slice(0, 3), carryName, 'mainCarry');
  const units = heroes.map(h => {
    const role = roleFromModelHero(h, carryName);
    return {
      name: h.name,
      price: Number(h.price) || priceOf(h.name),
      role,
      starTarget: role === 'mainCarry' ? starTargetFor(h.name) : (Number(h.price) >= 4 ? 2 : 1),
      items: profileItems(h.items || [], h.name, role).map(x => x.name),
      traits: traitsForHero(h.name),
    };
  });
  return {
    source: 'model_results',
    mainCarry: { name: carryName, starTarget: starTargetFor(carryName), items: mainItems.map(x => x.name) },
    units,
    activeTraits: activeTraitsFromTemplate(template, modelComp),
    items: uniq([
      ...mainItems,
      ...heroes.flatMap(h => profileItems(h.items || [], h.name, roleFromModelHero(h, carryName))),
      ...profileItems(template.completedPrefs || [], carryName, 'route'),
    ].map(x => JSON.stringify(x))).map(x => JSON.parse(x)),
  };
}

function profileFromTemplate(template) {
  const board = Array.isArray(template.board) ? template.board : [];
  const carryUnit = board.find(x => x.carry) || board.find(x => /主C/.test(x.role || '')) || null;
  const carryName = (carryUnit && carryUnit.name) || (template.carryUnits || [])[0] || (template.coreUnits || [])[0];
  const carryItems = (carryUnit && carryUnit.items && carryUnit.items.length ? carryUnit.items : template.completedPrefs || []).slice(0, 3);
  const unitNames = uniq(board.length ? board.map(x => x.name) : (template.coreUnits || []));
  const units = unitNames.map(name => {
    const row = board.find(x => x.name === name);
    const role = roleFromBoardUnit(row || { name, row: 4, role: '' }, carryName);
    return {
      name,
      price: priceOf(name),
      role,
      starTarget: role === 'mainCarry' ? starTargetFor(name) : ((priceOf(name) || 1) >= 4 ? 2 : 1),
      items: profileItems(row && row.items || [], name, role).map(x => x.name),
      traits: traitsForHero(name),
    };
  });
  const items = uniq([
    ...profileItems(carryItems, carryName, 'mainCarry'),
    ...board.flatMap(u => profileItems(u.items || [], u.name, roleFromBoardUnit(u, carryName))),
    ...profileItems(template.completedPrefs || [], carryName, 'route'),
  ].map(x => JSON.stringify(x))).map(x => JSON.parse(x));
  return {
    source: 'template',
    mainCarry: { name: carryName, starTarget: starTargetFor(carryName), items: profileItems(carryItems, carryName, 'mainCarry').map(x => x.name) },
    units,
    activeTraits: activeTraitsFromTemplate(template, null),
    items,
  };
}

function attachRouteProfiles(templatesIn) {
  return templatesIn.map(t => {
    const comp = modelCompForLine(t.name);
    return { ...t, routeProfile: comp ? profileFromModel(t, comp) : profileFromTemplate(t) };
  });
}

function inheritMechanicGates(templatesIn) {
  const known = templatesIn.filter(template => template.mechanic && template.mechanic.requiredAugment);
  return templatesIn.map(template => {
    if (template.mechanic) return template;
    const text = [
      template.name,
      template.officialText && template.officialText.early,
      template.officialText && template.officialText.hex,
    ].filter(Boolean).join(' ');
    const source = known.find(candidate => {
      const gate = candidate.mechanic.requiredAugment;
      const requiredUnits = candidate.mechanic.requiredUnits || [];
      const declaredGate = String(template.name || '').includes(gate)
        || (text.includes(gate) && /(前提|刚需|必拿|必须|只有|限定)/.test(text));
      return declaredGate
        && (template.augmentPrefs || []).includes(gate)
        && requiredUnits.every(name => (template.coreUnits || []).includes(name));
    });
    return source ? {
      ...template,
      mechanic: { ...source.mechanic, inheritedFrom: source.id },
    } : template;
  });
}

function attachHeroAugmentPlans(templatesIn) {
  return templatesIn.map(template => {
    const mainCarry = template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name || '';
    const recommendedOptions = (template.augmentPrefs || [])
      .map(name => heroAugmentByName.get(name))
      .filter(Boolean);
    const carryOptions = heroAugmentCatalog.filter(row => row.hero === mainCarry);
    const options = uniq([...carryOptions, ...recommendedOptions]
      .map(row => JSON.stringify(row))).map(row => JSON.parse(row));
    if (!options.length) return template;
    const text = `${template.name || ''} ${template.officialText && template.officialText.hex || ''}`;
    const mechanicRequired = template.mechanic && template.mechanic.requiredAugment;
    const requiredNames = options
      .filter(row => row.name === mechanicRequired || String(template.name || '').includes(row.name)
        || (/(刚需|必拿|必须)/.test(text) && text.includes(row.name)))
      .map(row => row.name);
    return {
      ...template,
      heroAugmentPlan: {
        options,
        requiredNames: uniq(requiredNames),
        mainCarry,
      },
    };
  });
}

function attachAugmentTransitionPlans(templatesIn) {
  const compiledPlans = (strategyPolicyResults && strategyPolicyResults.plans) || [];
  if (compiledPlans.length) {
    return templatesIn.map(template => {
      const heroPlan = template.heroAugmentPlan || {};
      const mainCarry = template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name || '';
      const mechanicRequired = template.mechanic && template.mechanic.requiredAugment;
      const requiredNames = new Set([...(heroPlan.requiredNames || []), mechanicRequired].filter(Boolean));
      const plan = compiledPlans.find(row => row.strategicCarry === mainCarry && requiredNames.has(row.augment));
      return plan ? { ...template, augmentTransitionPlan: plan } : template;
    });
  }
  const decision = augmentTransitionResults && augmentTransitionResults.decision;
  if (!decision || !decision.augment || !decision.strategicCarry) return templatesIn;
  return templatesIn.map(template => {
    const heroPlan = template.heroAugmentPlan || {};
    const mainCarry = template.routeProfile && template.routeProfile.mainCarry && template.routeProfile.mainCarry.name || '';
    if (mainCarry !== decision.strategicCarry || !(heroPlan.requiredNames || []).includes(decision.augment)) return template;
    const oneStar = decision.stateInference && decision.stateInference.jaxOneImmediate || {};
    const handoff = decision.stateInference && decision.stateInference.jaxTwoBridge || {};
    return {
      ...template,
      augmentTransitionPlan: {
        source: 'augment_transition_results.json',
        experiment: augmentTransitionResults.experiment,
        augment: decision.augment,
        baselineCarry: decision.baselineCarry,
        strategicCarry: decision.strategicCarry,
        currentHolder: decision.currentHolder,
        currentSwitchCertified: !!decision.currentSwitchCertified,
        currentInference: oneStar,
        handoffCertified: !!decision.handoffCertified,
        handoff: decision.handoff,
        handoffText: decision.handoffText,
        terminalText: decision.terminalText,
        totalBattles: Number(augmentTransitionResults.battles) || 0,
        sampleSupport: Number(decision.sampleSupport) || 0,
        handoffInference: handoff,
        holderRules: [
          { when: { unit: decision.handoff && decision.handoff.unit, starGte: decision.handoff && decision.handoff.starGte }, holder: decision.strategicCarry, certified: !!decision.handoffCertified, inference: 'handoff' },
          { when: { hasUnit: decision.currentHolder }, holder: decision.currentHolder, certified: !!decision.currentSwitchCertified, inference: 'current' },
          { holder: decision.currentHolder, certified: !!decision.currentSwitchCertified, inference: 'current' },
        ],
      },
    };
  });
}

function templateHasMechaPrime(template) {
  if (!mechaPrimeResults || !mechaPrimeResults.primePlan) return false;
  const text = [
    template.name,
    template.family,
    ...(template.earlyTraits || []),
    ...(template.route || []),
  ].filter(Boolean).join(' ');
  const traitHit = [...text.matchAll(/([3-9])\s*(?:战斗机甲|战队机甲|机甲)/g)]
    .some(m => Number(m[1]) >= 3);
  const coreMecha = uniq([...(template.coreUnits || []), ...(template.midUnits || []), ...(template.earlyUnits || [])])
    .filter(name => mechaPrimeNames.has(name)).length;
  return traitHit || (coreMecha >= 3 && /机甲|贾克斯/.test(text));
}

function attachPrimePlans(templatesIn) {
  if (!mechaPrimeResults || !mechaPrimeResults.primePlan) return templatesIn;
  return templatesIn.map(t => templateHasMechaPrime(t)
    ? { ...t, primePlan: mechaPrimeResults.primePlan }
    : t);
}

function officialTemplates() {
  return data.lineups.map(lineup => {
    const detail = JSON.parse(lineup.detail || '{}');
    const lineName = detail.line_name || lineup.id;
    const earlyUnits = uniq((detail.y21_early_heros || []).map(h => nameOf.hero(h.hero_id)));
    const midUnits = uniq((detail.y21_metaphase_heros || []).map(h => nameOf.hero(h.hero_id)));
    const finalUnits = modelFinalUnits(lineName).length
      ? modelFinalUnits(lineName)
      : uniq((detail.hero_location || []).map(h => nameOf.hero(h.hero_id)));
    const coreUnits = finalUnits;
    const componentPrefs = csv(detail.equipment_order).map(nameOf.item);
    const completedPrefs = uniq((detail.hero_location || []).flatMap(h => csv(h.equipment_id).map(nameOf.item)));
    const augmentPrefs = uniq([...csv(detail.hexbuff && detail.hexbuff.recomm), ...csv(detail.hexbuff && detail.hexbuff.replace)].map(nameOf.hex));
    const augmentCats = uniq(csv(detail.hexbuff && detail.hexbuff.recomm)
      .map(id => data.hex[id])
      .filter(Boolean)
      .flatMap(classifyAug));
    const earlyTraits = uniq((detail.y21_early_heros_contact || []).map(t => `${t.num}${nameOf.trait(t)}`));
    const family = familyOf(lineName, detail);
    const modelComp = modelCompForLine(lineName);
    const template = {
      id: `official-${lineup.id}`,
      source: 'official',
      quality: lineup.quality,
      name: lineName.replace(/[【】]/g, ''),
      teamScore: modelComp ? modelComp.sortID : undefined,
      strengthPrior: modelComp ? Number(modelComp.score) || 0 : 0,
      carryUnits: modelComp && modelComp.carry ? [modelComp.carry.hero] : undefined,
      starTargets: modelComp && modelComp.carry ? [{
        name: modelComp.carry.hero,
        targetCopies: Number(modelComp.carryStar) >= 3 ? 9 : Number(modelComp.carryStar) >= 2 ? 3 : 1,
      }] : undefined,
      family,
      goal: /九五|高端购物|升级咯|对冲基金/.test(`${detail.line_name} ${detail.hex_info}`) ? '吃鸡上限' : lineup.quality === 'S' ? '吃分/争一' : '备选吃分',
      earlyUnits,
      midUnits,
      coreUnits,
      earlyTraits,
      componentPrefs,
      completedPrefs,
      augmentPrefs,
      augmentCats,
      monsterPrefs: uniq([...csv(detail.monster && detail.monster.recomm), ...csv(detail.monster && detail.monster.replace)].map(id => (read('data/monster.js').data[id] || {}).name || id)),
      route: [earlyUnits.slice(0, 3).join('、') || '通用打工', midUnits.slice(0, 3).join('、') || family, family].filter(Boolean),
      officialText: {
        early: detail.early_info || '',
        equipment: detail.equipment_info || '',
        hex: detail.hex_info || '',
        enemy: detail.enemy_info || '',
      },
      actions: {
        keep: uniq([...earlyUnits, ...midUnits, ...finalUnits].slice(0, 10)),
        item: detail.equipment_info || `优先按 ${componentPrefs.slice(0, 3).join('、')} 合可用装备。`,
        checkpoint: detail.d_time || detail.early_info || '2阶段看质量保血，3-2按核心牌和装备决定是否定线。',
        stopLoss: detail.enemy_info || '核心牌/核心装备都缺时，只当过渡，不要硬锁阵容。',
      },
    };
    template.role = roleOf(template);
    return template;
  });
}

const manualTemplates = [
  {
    id: 'manual-gadget-jax',
    source: 'research',
    quality: 'S',
    name: '小天才过渡 -> 贾克斯机甲',
    family: '机甲贾克斯',
    goal: '吃分强，胡牌可争一',
    earlyUnits: ['安妮', '波比', '璐璐', '佐伊'],
    midUnits: ['贾克斯', '德莱文', '孙悟空', '安妮', '波比'],
    coreUnits: ['贾克斯', '德莱文', '孙悟空', '瑟提', '蕾欧娜'],
    earlyTraits: ['3小天才', '2护卫', '3战斗机甲'],
    componentPrefs: ['反曲之弓', '负极斗篷', '暴风之剑', '锁子甲', '无用大棒'],
    completedPrefs: ['鬼索的狂暴之刃', '疾射火炮', '泰坦的坚决', '水银', '狂徒铠甲'],
    augmentPrefs: ['无情连打', 'DD街区', '便携锻炉', '明智消费', '部分飞升'],
    augmentCats: ['英雄强化', '装备', '战力'],
    monsterPrefs: ['胖胖龙（战力）', '迅捷蟹（经济）'],
    route: ['安妮/波比小天才壳', '贾克斯中期承接', '蕾欧娜/五费控制补上限'],
    boardNote: '模型建议站位草图：贾克斯第二排吃机甲前排保护，德莱文先当装备过渡位；遇到黑客/切后可把贾克斯和后排同侧换边。',
    board: [
      { name: '孙悟空', row: 1, col: 3, role: '机甲前排' },
      { name: '瑟提', row: 1, col: 4, role: '主坦' },
      { name: '蕾欧娜', row: 1, col: 5, role: '斩杀/副坦' },
      { name: '德莱文', row: 2, col: 2, role: '过渡C' },
      { name: '贾克斯', row: 2, col: 4, carry: true, role: '主C', items: ['羊刀', '火炮', '泰坦/水银'] },
      { name: '安妮', row: 2, col: 6, role: '护卫' },
      { name: '波比', row: 3, col: 6, role: '小天才' },
      { name: '璐璐', row: 4, col: 4, role: '挂件' },
    ],
    officialText: {
      early: '小天才牌能给前排和装备件数，但如果装备是羊刀/火炮/泰坦，输出方向更像贾克斯而不是佐伊。',
      equipment: '羊刀/火炮/泰坦/水银会把小天才壳转向普攻C。',
      hex: '无情连打、装备类、战力类会提高贾克斯线权重。',
      enemy: '没有三星/防控/前排时不要把贾克斯当无条件终局。',
    },
    actions: {
      keep: ['安妮', '波比', '璐璐', '孙悟空', '德莱文', '贾克斯', '瑟提', '蕾欧娜'],
      item: '羊刀/火炮可以先做，前期给德莱文或其他普攻打工，后面转贾克斯。',
      checkpoint: '3-2 看贾克斯/德莱文/孙悟空来牌；有二星苗子转机甲，否则保留小天才过渡。',
      stopLoss: '只有安妮波比但没有机甲牌时不要硬转；4-2 贾克斯没三星苗子就往蕾欧娜/五费控制转。',
    },
  },
  {
    id: 'manual-gadget-ap',
    source: 'research',
    quality: 'S',
    name: '小天才法系 -> 佐伊/九五',
    family: '小天才法系',
    goal: '经济好时吃鸡上限',
    earlyUnits: ['安妮', '波比', '璐璐', '悠米', '泰隆'],
    midUnits: ['佐伊', '乐芙兰', '安妮', '璐璐'],
    coreUnits: ['佐伊', '安妮', '努努和威朗普', '费德提克', '厄加特', '蕾欧娜'],
    earlyTraits: ['3小天才', '2爱心使者', '2福牛守护者'],
    componentPrefs: ['女神之泪', '无用大棒', '拳套', '暴风之剑', '负极斗篷'],
    completedPrefs: ['蓝霸符', '珠光护手', '班克斯的魔法帽', '狂徒铠甲', '离子火花'],
    augmentPrefs: ['对冲基金', '升级咯！', '高端购物', '公理圆弧II', '珠光莲花'],
    augmentCats: ['经济', '战力', '装备'],
    monsterPrefs: ['迅捷蟹（经济）', '装备商人（经济）'],
    route: ['安妮/波比/璐璐小天才', '佐伊法系承接', '小天才九五'],
    boardNote: '模型建议站位草图：安妮单顶吃肉装，佐伊沉底避开第一波集火；九五成型后用费德提克/厄加特补控制。',
    board: [
      { name: '安妮', row: 1, col: 4, role: '主坦', items: ['狂徒', '离子'] },
      { name: '蕾欧娜', row: 1, col: 5, role: '副坦' },
      { name: '努努和威朗普', row: 1, col: 3, role: '扰乱' },
      { name: '费德提克', row: 2, col: 3, role: '控制' },
      { name: '厄加特', row: 2, col: 5, role: '控制/经济' },
      { name: '璐璐', row: 4, col: 2, role: '小天才' },
      { name: '佐伊', row: 4, col: 4, carry: true, role: '主C', items: ['蓝霸符', '法爆', '帽子'] },
      { name: '悠米', row: 4, col: 6, role: '爱心' },
    ],
    officialText: {
      early: '官方小天才九五建议璐璐带装备过渡，小天才装备优先补佐伊、安妮、努努。',
      equipment: '眼泪/大棒/拳套越多，越偏法系佐伊/九五。',
      hex: '大经济符文会显著提高九五权重。',
      enemy: '装备偏羊刀火炮时，小天才更适合作为过渡壳而不是法系终局。',
    },
    actions: {
      keep: ['波比', '安妮', '璐璐', '悠米', '佐伊', '乐芙兰', '努努和威朗普'],
      item: '优先蓝霸符/法爆/帽子/安妮肉装；攻速装多则不要硬玩法系。',
      checkpoint: '3-2 有佐伊/安妮质量或经济符文时继续；经济好上8/9找五费。',
      stopLoss: '没眼泪大棒、没有经济/战力支撑时，只当临时前排壳。',
    },
  },
  {
    id: 'manual-mecha-draven-jax-leona',
    source: 'research',
    quality: 'S',
    name: '机甲德莱文 -> 贾克斯 -> 蕾欧娜',
    family: '机甲贾克斯',
    goal: '平滑吃分，经济好争一',
    earlyUnits: ['孙悟空', '德莱文', '波比', '布里茨', '贾克斯'],
    midUnits: ['贾克斯', '德莱文', '孙悟空', '安妮', '波比'],
    coreUnits: ['贾克斯', '德莱文', '孙悟空', '瑟提', '蕾欧娜', '费德提克'],
    earlyTraits: ['3战斗机甲', '2护卫', '2斗士'],
    componentPrefs: ['反曲之弓', '暴风之剑', '负极斗篷', '锁子甲', '无用大棒'],
    completedPrefs: ['鬼索的狂暴之刃', '疾射火炮', '泰坦的坚决', '水银', '锐利之刃', '卢安娜的飓风'],
    augmentPrefs: ['无情连打', '便携锻炉', 'DD街区', '高端购物', '升级咯！'],
    augmentCats: ['英雄强化', '装备', '战力', '经济'],
    monsterPrefs: ['胖胖龙（战力）', '迅捷蟹（经济）'],
    route: ['德莱文带物理装保血', '贾克斯中期承接', '蕾欧娜/五费终局'],
    boardNote: '模型建议站位草图：机甲前排居中，贾克斯第二排启动；德莱文可先带装备，后期只保留为机甲组件或替换高费控制。',
    board: [
      { name: '孙悟空', row: 1, col: 3, role: '机甲前排' },
      { name: '瑟提', row: 1, col: 4, role: '主坦' },
      { name: '蕾欧娜', row: 1, col: 5, role: '终局前排' },
      { name: '布里茨', row: 2, col: 2, role: '斗士' },
      { name: '贾克斯', row: 2, col: 4, carry: true, role: '主C', items: ['羊刀', '火炮', '泰坦/水银'] },
      { name: '德莱文', row: 3, col: 2, role: '过渡C/组件' },
      { name: '费德提克', row: 3, col: 6, role: '控制' },
    ],
    officialText: {
      early: '机甲壳和斗士前排能把攻速装备平滑继承到贾克斯。',
      equipment: '弓、剑、魔抗是最强信号。',
      hex: '无情连打让贾克斯终局权重上升；经济符文让它更偏转蕾欧娜。',
      enemy: '贾克斯没三星/防控不足时，后期要转上限。',
    },
    actions: {
      keep: ['孙悟空', '德莱文', '波比', '布里茨', '贾克斯', '瑟提', '蕾欧娜'],
      item: '羊刀/火炮/泰坦/水银可直接围绕普攻C做，德莱文先带。',
      checkpoint: '3-2 看贾克斯二星苗子；4-2 看追三还是上8/9。',
      stopLoss: '没有弓或贾克斯一直不二星，别硬赌，保血转枪手/五费。',
    },
  },
  {
    id: 'manual-laser-duelist',
    source: 'research',
    quality: 'S',
    name: '源计划斗士/决斗 -> 卡莎/枪手/九五',
    family: '枪手九五',
    goal: '连胜保血，后期转高费',
    earlyUnits: ['雷克顿', '亚索', '艾希', '蔚', '普朗克'],
    midUnits: ['卡莎', '薇恩', '锐雯', '瑟庄妮'],
    coreUnits: ['莎弥拉', '厄斐琉斯', '费德提克', '厄加特', '蕾欧娜'],
    earlyTraits: ['3源计划：激光特工', '2斗士', '2决斗大师'],
    componentPrefs: ['反曲之弓', '暴风之剑', '锁子甲', '负极斗篷', '拳套'],
    completedPrefs: ['最后的轻语', '卢安娜的飓风', '锐利之刃', '巨人捕手', '日炎斗篷', '狂徒铠甲'],
    augmentPrefs: ['高端购物', '升级咯！', '对冲基金', '团队建设', 'DD街区'],
    augmentCats: ['经济', '战力', '装备'],
    monsterPrefs: ['迅捷蟹（经济）', '胖胖龙（战力）'],
    route: ['源计划/斗士打连胜', '卡莎/枪手承接', '九五枪手或怪兽上限'],
    boardNote: '模型建议站位草图：斗士/高费前排铺第一排，枪手沉底同侧集火；如果被黑客切后，莎弥拉和厄斐琉斯换边。',
    board: [
      { name: '瑟庄妮', row: 1, col: 3, role: '控制前排' },
      { name: '蕾欧娜', row: 1, col: 4, role: '副坦/斩杀' },
      { name: '锐雯', row: 1, col: 5, role: '斗士' },
      { name: '费德提克', row: 2, col: 2, role: '控制' },
      { name: '厄加特', row: 2, col: 6, role: '控制/经济' },
      { name: '莎弥拉', row: 4, col: 3, carry: true, role: '主C', items: ['轻语', '飓风', '巨杀/锐利'] },
      { name: '厄斐琉斯', row: 4, col: 4, role: '副C' },
      { name: '卡莎', row: 4, col: 6, role: '中期承接' },
    ],
    officialText: {
      early: '官方多套S级都用3源计划+2斗士/决斗保血。',
      equipment: '物理装和肉装都能即时合，保证连胜更重要。',
      hex: '经济符文把它推向九五；复制器/刷新把它推向三费追三。',
      enemy: '质量低连败时要转魔盗经济，不要硬保连胜。',
    },
    actions: {
      keep: ['雷克顿', '亚索', '艾希', '蔚', '普朗克', '卡莎', '薇恩', '莎弥拉'],
      item: '轻语、飓风、锐利、日炎、狂徒能合就合，优先保血。',
      checkpoint: '2-5 能连胜就拉5；3-2 根据卡莎/枪手/经济符文决定中期方向。',
      stopLoss: '没源计划质量也没魔盗时，不要空转，找当前二星怪兽/斗士稳血。',
    },
  },
  {
    id: 'manual-duelist',
    source: 'research',
    quality: 'S',
    name: '决斗连胜 -> 薇恩/剑姬/劫',
    family: '决斗',
    goal: '连胜吃分，符文胡可争一',
    earlyUnits: ['亚索', '普朗克', '菲奥娜', '凯尔'],
    midUnits: ['薇恩', '尼菈', '菲奥娜', '亚索'],
    coreUnits: ['薇恩', '尼菈', '劫', '菲奥娜', '凯尔'],
    earlyTraits: ['2决斗大师'],
    componentPrefs: ['反曲之弓', '负极斗篷', '暴风之剑', '锁子甲', '巨人腰带'],
    completedPrefs: ['鬼索的狂暴之刃', '疾射火炮', '卢安娜的飓风', '最后的轻语', '锐利之刃'],
    augmentPrefs: ['决斗大师之徽', '扩散射击', '大百宝袋', '登神长阶', '无双挑战'],
    augmentCats: ['羁绊', '英雄强化', '装备', '战力'],
    monsterPrefs: ['胖胖龙（战力）'],
    route: ['决斗牌连胜', '薇恩/剑姬承接', '劫或高决斗终局'],
    boardNote: '模型建议站位草图：决斗前排分散吃第一波伤害，薇恩沉底输出；劫放侧翼找后排，遇到控制多时换到安全侧。',
    board: [
      { name: '菲奥娜', row: 1, col: 3, role: '前排/副C' },
      { name: '尼菈', row: 1, col: 4, role: '前排' },
      { name: '亚索', row: 1, col: 5, role: '前排输出' },
      { name: '劫', row: 2, col: 2, role: '侧翼切入' },
      { name: '凯尔', row: 4, col: 2, role: '决斗挂件' },
      { name: '薇恩', row: 4, col: 4, carry: true, role: '主C', items: ['羊刀', '轻语', '飓风/锐利'] },
      { name: '普朗克', row: 4, col: 6, role: '决斗挂件' },
    ],
    officialText: {
      early: '官方决斗线强调体系内决斗大师牌直接过渡，物理装备能合就合。',
      equipment: '弓和物理装是强信号。',
      hex: '决斗徽/专属英雄强化会显著提高定线权重。',
      enemy: '没有攻速装或决斗牌质量低，不要硬开六决斗。',
    },
    actions: {
      keep: ['亚索', '普朗克', '菲奥娜', '凯尔', '薇恩', '尼菈', '劫'],
      item: '攻速物理装直接合，走连胜比等完美更重要。',
      checkpoint: '3-2 看决斗数量和专属强化；没有6决斗可先用怪兽/斗士补强。',
      stopLoss: '没有决斗转/核心二星，后期转枪手或机甲物理装消化。',
    },
  },
  {
    id: 'manual-mascot-heart',
    source: 'research',
    quality: 'S',
    name: '吉祥物爱心 -> 猫咪/超英法系',
    family: '超英赌低费',
    goal: '胡对子吃分，专属强化可冲高',
    earlyUnits: ['加里奥', '内瑟斯', '悠米', '璐璐', '李青', '墨菲特'],
    midUnits: ['悠米', '李青', '墨菲特', '娑娜'],
    coreUnits: ['悠米', '李青', '墨菲特', '普朗克', '阿利斯塔'],
    earlyTraits: ['2吉祥物', '2爱心使者', '3超级英雄'],
    componentPrefs: ['女神之泪', '无用大棒', '拳套', '暴风之剑', '反曲之弓'],
    completedPrefs: ['蓝霸符', '珠光护手', '巨人捕手', '离子火花', '日炎斗篷'],
    augmentPrefs: ['猫之精准', '公理圆弧II', '学习拼读', 'DD街区', '团队建设'],
    augmentCats: ['英雄强化', '战力', '经济'],
    monsterPrefs: ['迅捷蟹（经济）'],
    route: ['吉祥物/爱心保血或连败拿装', '猫咪/超英追三', '高三星数补上限'],
    boardNote: '模型建议站位草图：超英/吉祥物第一排分摊伤害，悠米沉底避切；如果对面后排威胁低，可让李青/墨菲特更靠中保护。',
    board: [
      { name: '墨菲特', row: 1, col: 3, role: '主坦' },
      { name: '李青', row: 1, col: 4, role: '护盾前排' },
      { name: '阿利斯塔', row: 1, col: 5, role: '控制前排' },
      { name: '加里奥', row: 2, col: 4, role: '吉祥物' },
      { name: '普朗克', row: 3, col: 2, role: '超英' },
      { name: '璐璐', row: 4, col: 2, role: '法系承接' },
      { name: '悠米', row: 4, col: 4, carry: true, role: '主C', items: ['蓝霸符', '法爆', '巨杀'] },
      { name: '娑娜', row: 4, col: 6, role: '爱心/治疗' },
    ],
    officialText: {
      early: '官方猫咪线建议吉祥物加爱心过渡，装备可先给璐璐。',
      equipment: '眼泪大棒拳套越多越适合。',
      hex: '猫之精准、公理圆弧、学习拼读是强信号。',
      enemy: '没对子/没专属强化不要硬赌。',
    },
    actions: {
      keep: ['加里奥', '内瑟斯', '悠米', '璐璐', '李青', '墨菲特', '普朗克'],
      item: '蓝霸符/法爆优先，前排功能装给李青或墨菲特。',
      checkpoint: '3-1/3-2 看低费对子和猫咪强化；对子少转小天才/法系九五。',
      stopLoss: '没有三星密度时不追，装备转佐伊/法系。',
    },
  },
  {
    id: 'manual-civilian-gunner',
    source: 'research',
    quality: 'S',
    name: '平民枪手 -> 莎弥拉/九五枪手',
    family: '枪手九五',
    goal: '稳血转高费',
    earlyUnits: ['加里奥', '希维尔', '赛娜', '蔚', '布里茨'],
    midUnits: ['希维尔', '赛娜', '锐雯', '瑟庄妮'],
    coreUnits: ['莎弥拉', '厄斐琉斯', '迦娜', '费德提克', '厄加特'],
    earlyTraits: ['2平民英雄', '2强袭枪手', '2斗士'],
    componentPrefs: ['反曲之弓', '暴风之剑', '锁子甲', '负极斗篷', '巨人腰带'],
    completedPrefs: ['最后的轻语', '锐利之刃', '卢安娜的飓风', '狂徒铠甲', '日炎斗篷'],
    augmentPrefs: ['高端购物', '升级咯！', '对冲基金', '评级与交火', '送餐小费'],
    augmentCats: ['经济', '战力', '装备'],
    monsterPrefs: ['迅捷蟹（经济）', '装备商人（经济）'],
    route: ['平民/枪手过渡', '斗士/秘术补前排', '莎弥拉/厄斐琉斯终局'],
    boardNote: '模型建议站位草图：前排吃控制和肉装，枪手沉底同侧输出；迦娜按天气格调整，费德提克可前置吃启动。',
    board: [
      { name: '瑟庄妮', row: 1, col: 3, role: '控制前排' },
      { name: '锐雯', row: 1, col: 4, role: '斗士前排' },
      { name: '布里茨', row: 1, col: 5, role: '斗士' },
      { name: '费德提克', row: 2, col: 2, role: '控制' },
      { name: '厄加特', row: 2, col: 6, role: '控制/经济' },
      { name: '希维尔', row: 4, col: 2, role: '平民/过渡' },
      { name: '莎弥拉', row: 4, col: 4, carry: true, role: '主C', items: ['轻语', '锐利', '飓风/巨杀'] },
      { name: '厄斐琉斯', row: 4, col: 5, role: '副C' },
      { name: '迦娜', row: 4, col: 7, role: '气象/保护' },
    ],
    officialText: {
      early: '官方枪手九五建议前期平民英雄+枪手过渡，中期搭斗士或秘术补强。',
      equipment: '剑/弓/肉装都能即时转化为战力。',
      hex: '高端购物/升级咯/对冲基金把它推向九五。',
      enemy: '经济差又不连胜时，九五风险很高。',
    },
    actions: {
      keep: ['加里奥', '希维尔', '赛娜', '蔚', '布里茨', '莎弥拉', '厄斐琉斯'],
      item: '轻语/锐利/飓风给枪手，肉装给斗士前排。',
      checkpoint: '2-5 能连胜就拉5；3-2 看经济符文和枪手牌质量决定上限。',
      stopLoss: '血量和经济都差时不要硬九五，转中费物理C稳分。',
    },
  },
];
if (metaDiscoveryResults && Array.isArray(metaDiscoveryResults.routes)) {
  manualTemplates.push(...metaDiscoveryResults.routes);
}
manualTemplates.forEach(t => { t.role = roleOf(t); });

function optionCounts(templates, field) {
  const count = {};
  templates.forEach(t => (t[field] || []).forEach(x => count[x] = (count[x] || 0) + (t.source === 'research' ? 3 : t.quality === 'S' ? 2 : 1)));
  return count;
}

function computeModelWeights() {
  const lens = readOptional('numeric_lens_results.json');
  const transitions = readOptional('transition_results.json');
  const model = readOptional('model_results.json');
  const itemDrops = [];
  const traitDrops = [];
  (lens && lens.routes || []).forEach(route => {
    Object.values(route.stages || {}).forEach(stage => {
      const carry = stage.carry || {};
      (carry.itemDrops || []).forEach(x => itemDrops.push(Number(x.dropPct) || 0));
      (carry.traitDrops || []).forEach(x => traitDrops.push(Number(x.dropPct) || 0));
    });
  });
  const topRoutes = (transitions && transitions.routes || []).slice(0, 8);
  const smooth = avg(topRoutes.map(r => Number(r.smooth) || 0)) || 75;
  const strength = avg(topRoutes.map(r => Number(r.strength) || 0)) || 80;
  const augTop = model && model.augRank && model.augRank[0] ? Number(model.augRank[0].score) || 5 : 5;
  const itemDrop = avg(itemDrops.filter(Boolean)) || 38;
  const traitDrop = avg(traitDrops.filter(Boolean)) || 24;
  const earlyUnit = Math.round(clamp(6 + smooth / 10, 12, 18));
  const coreItem = Math.round(clamp(9 + itemDrop / 3.2, 16, 26));
  const augment = Math.round(clamp(14 + augTop * 1.7, 18, 28));
  return {
    baseS: 18,
    baseA: 10,
    baseB: 4,
    earlyUnit,
    midUnit: Math.round(earlyUnit * 0.68),
    coreUnit: Math.round(earlyUnit * 0.52),
    coreItem,
    component: Math.round(coreItem * 0.56),
    looseComponent: 2,
    augment,
    augmentSignal: Math.round(augment * 0.34),
    attackSynergy: Math.round(coreItem * 0.78),
    conflictPenalty: Math.round(coreItem * 0.78),
    tankPenalty: Math.round(coreItem * 0.22),
    modelBasis: {
      avgItemDropPct: Math.round(itemDrop * 10) / 10,
      avgTraitDropPct: Math.round(traitDrop * 10) / 10,
      avgRouteSmooth: Math.round(smooth * 10) / 10,
      avgRouteStrength: Math.round(strength * 10) / 10,
      topAugScore: augTop,
    },
  };
}

function buildOptions(templates) {
  const unitCount = optionCounts(templates, 'earlyUnits');
  const midUnitCount = optionCounts(templates, 'midUnits');
  const coreUnitCount = optionCounts(templates, 'coreUnits');
  const allUnitNames = uniq([
    ...Object.keys(unitCount),
    ...Object.keys(midUnitCount),
    ...Object.keys(coreUnitCount),
    ...Object.values(data.chess)
      .filter(h => h.name && String(h.setid) === '8' && String(h.showHeroTag) === '1')
      .map(h => h.name),
  ]);
  const unitMetaByName = {};
  Object.values(data.chess)
    .filter(h => h.name && String(h.setid) === '8' && String(h.showHeroTag) === '1')
    .forEach(h => {
      if (!unitMetaByName[h.name] || Number(h.price) < Number(unitMetaByName[h.name].price || 99)) {
        unitMetaByName[h.name] = { price: Number(h.price) || null };
      }
    });
  const itemNames = uniq([...COMPONENTS, ...ATTACK_ITEMS, ...AP_ITEMS, ...TANK_ITEMS, ...JAX_ITEMS]);
  const itemCount = optionCounts(templates, 'completedPrefs');
  const componentCount = optionCounts(templates, 'componentPrefs');
  const augmentCount = optionCounts(templates, 'augmentPrefs');
  const hexByName = Object.fromEntries(Object.values(data.hex).filter(h => h.name).map(h => [h.name, h]));
  const allAugNames = uniq([
    ...Object.keys(augmentCount),
    ...Object.values(data.hex).filter(h => h.name).map(h => h.name),
  ]);
  return {
    units: Object.entries(unitCount).sort((a, b) => b[1] - a[1]).slice(0, 36).map(([name, priority]) => ({ name, priority })),
    unitSearch: allUnitNames
      .map(name => ({
        name,
        priority: (unitCount[name] || 0) * 6 + (midUnitCount[name] || 0) * 3 + (coreUnitCount[name] || 0),
        price: unitMetaByName[name] ? unitMetaByName[name].price : null,
        traits: traitsForHero(name),
        aliases: unitAliasesFor(name),
      }))
      .sort((a, b) => b.priority - a.priority || (a.price || 9) - (b.price || 9) || a.name.localeCompare(b.name, 'zh-Hans-CN')),
    items: itemNames.map(name => ({
      name,
      type: COMPONENTS.includes(name) ? 'component' : 'completed',
      priority: (itemCount[name] || 0) + (componentCount[name] || 0),
    })).sort((a, b) => b.priority - a.priority),
    augments: Object.entries(augmentCount).sort((a, b) => b[1] - a[1]).slice(0, 36).map(([name, priority]) => ({
      name,
      priority,
      cats: hexByName[name] ? classifyAug(hexByName[name]) : ['战力'],
      desc: hexByName[name] ? (hexByName[name].description || hexByName[name].desc || '') : '',
      aliases: augmentAliasesFor(name),
    })),
    augmentSearch: allAugNames.map(name => ({
      name,
      priority: augmentCount[name] || 0,
      cats: hexByName[name] ? classifyAug(hexByName[name]) : ['战力'],
      desc: hexByName[name] ? (hexByName[name].description || hexByName[name].desc || '') : '',
      hero: heroAugmentByName.get(name)?.hero || '',
      heroCost: heroAugmentByName.get(name)?.cost || null,
      heroTraits: heroAugmentByName.get(name)?.traits || [],
      aliases: augmentAliasesFor(name),
    })).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, 'zh-Hans-CN')),
    heroAugments: heroAugmentCatalog,
    augmentSignals: ['经济', '装备', '战力', '英雄强化', '羁绊'],
  };
}

function scoreTemplate(template, selected, weights) {
  const units = new Set(selected.units || []);
  const items = new Set(selected.items || []);
  const augments = new Set(selected.augments || []);
  const augCats = new Set(selected.augmentCats || []);
  const w = weights || computeModelWeights();
  const base = template.quality === 'S' ? w.baseS : template.quality === 'A' ? w.baseA : w.baseB;
  let score = base;
  const breakdown = { base, hero: 0, item: 0, augment: 0, synergy: 0, penalty: 0 };
  const evidence = [];
  const missing = [];
  const penalties = [];
  let mechanicBlocked = false;
  const strengthPrior = Math.round((Number(template.strengthPrior) || 0) * 4);
  if (strengthPrior) {
    score += strengthPrior;
    breakdown.synergy += strengthPrior;
    evidence.push(`版本数值先验 ${strengthPrior > 0 ? '+' : ''}${strengthPrior}`);
  }

  for (const u of units) {
    if (template.earlyUnits.includes(u)) { score += w.earlyUnit; breakdown.hero += w.earlyUnit; evidence.push(`${u} 命中前期底座`); }
    else if (template.midUnits.includes(u)) { score += w.midUnit; breakdown.hero += w.midUnit; evidence.push(`${u} 可中期承接`); }
    else if (template.coreUnits.includes(u)) { score += w.coreUnit; breakdown.hero += w.coreUnit; evidence.push(`${u} 是后续核心`); }
  }

  for (const it of items) {
    if (template.completedPrefs.includes(it)) { score += w.coreItem; breakdown.item += w.coreItem; evidence.push(`${it} 命中核心成装`); }
    else if (template.componentPrefs.includes(it)) { score += w.component; breakdown.item += w.component; evidence.push(`${it} 命中散件优先级`); }
    else if (COMPONENTS.includes(it)) { score += w.looseComponent; breakdown.item += w.looseComponent; }
  }

  for (const h of augments) {
    if (template.augmentPrefs.includes(h)) { score += w.augment; breakdown.augment += w.augment; evidence.push(`${h} 命中推荐符文`); }
  }
  for (const c of augCats) {
    if (template.augmentCats.includes(c)) { score += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`); }
  }

  if (template.mechanic) {
    const requiredAugment = template.mechanic.requiredAugment;
    const requiredUnits = template.mechanic.requiredUnits || [];
    const active = (!requiredAugment || augments.has(requiredAugment)) && requiredUnits.every(name => units.has(name));
    if (active) {
      const bonus = Number(template.mechanic.matchBonus) || 0;
      score += bonus;
      breakdown.synergy += bonus;
      evidence.push(`机制闭环：${template.mechanic.text}`);
    } else {
      mechanicBlocked = true;
      const penalty = Number(template.mechanic.missingPenalty) || 0;
      score -= penalty;
      breakdown.penalty -= penalty;
      penalties.push(`缺机制门槛：${requiredAugment || requiredUnits.join('、')}`);
    }
  }

  const selectedAttack = [...items].filter(x => ATTACK_ITEMS.includes(x) || JAX_ITEMS.includes(x)).length;
  const selectedAp = [...items].filter(x => AP_ITEMS.includes(x)).length;
  const selectedTank = [...items].filter(x => TANK_ITEMS.includes(x)).length;
  if (selectedAttack >= 2 && template.role === '法系') { score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty; penalties.push('装备偏普攻，法系终局降权'); }
  if (selectedAp >= 2 && template.role === '普攻') { score -= Math.round(w.conflictPenalty * 0.78); breakdown.penalty -= Math.round(w.conflictPenalty * 0.78); penalties.push('装备偏法系，普攻C降权'); }
  if (selectedTank >= 2 && template.role !== '九五') { score -= w.tankPenalty; breakdown.penalty -= w.tankPenalty; penalties.push('肉装多，需要确认输出装来源'); }
  if (selectedAttack >= 2 && template.id === 'manual-gadget-jax') { score += w.attackSynergy; breakdown.synergy += w.attackSynergy; }
  if (selectedAttack >= 2 && template.id === 'manual-gadget-ap') { score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty; }
  if (template.id === 'manual-gadget-jax' && selectedAttack < 2 && !['贾克斯', '德莱文', '孙悟空'].some(u => units.has(u))) {
    const p = Math.round(w.conflictPenalty * 0.65);
    score -= p;
    breakdown.penalty -= p;
    penalties.push('只有小天才牌、没有普攻装备/机甲核心，先按小天才判断');
  }

  const selectedUnitCount = [...units].filter(u => template.earlyUnits.includes(u)).length;
  if (units.size && selectedUnitCount === 0) {
    score -= 8;
    missing.push('当前来牌没有命中前期底座');
  }
  const coreMissing = template.coreUnits.filter(x => !units.has(x)).slice(0, 4);
  if (coreMissing.length) missing.push(`后续关键牌：${coreMissing.join('、')}`);
  if (!items.size) missing.push('还没选择装备，路线暂按来牌判断');
  if (!augments.size && !augCats.size) missing.push('还没选择符文，符文权重未生效');

  const signalTotal = breakdown.hero + breakdown.item + breakdown.augment + breakdown.synergy;
  const shares = signalTotal > 0 ? {
    hero: Math.round(breakdown.hero / signalTotal * 100),
    item: Math.round(breakdown.item / signalTotal * 100),
    augment: Math.round(breakdown.augment / signalTotal * 100),
    synergy: Math.round(breakdown.synergy / signalTotal * 100),
  } : { hero: 0, item: 0, augment: 0, synergy: 0 };
  return {
    id: template.id,
    score: mechanicBlocked ? 0 : Math.max(0, Math.round(score)),
    breakdown,
    shares,
    evidence: uniq(evidence).slice(0, 6),
    missing: uniq(missing).slice(0, 4),
    penalties: uniq(penalties).slice(0, 4),
  };
}

function rank(templates, selected, weights) {
  return templates.map(t => ({ ...scoreTemplate(t, selected, weights), template: t.name }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

const templates = attachAugmentTransitionPlans(attachHeroAugmentPlans(attachPrimePlans(attachRouteProfiles(inheritMechanicGates([...manualTemplates, ...officialTemplates()])))));

function sameSet(a, b) {
  const aa = uniq(a).sort();
  const bb = uniq(b).sort();
  return aa.length === bb.length && aa.every((x, i) => x === bb[i]);
}

function seededOfficialSample(rows, n) {
  return rows
    .map(row => ({
      row,
      key: Array.from(row.name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 997,
    }))
    .sort((a, b) => a.key - b.key || a.row.name.localeCompare(b.row.name, 'zh-Hans-CN'))
    .slice(0, n)
    .map(x => x.row);
}

function assertCoreData(templatesIn) {
  const official = templatesIn.filter(t => t.source === 'official' && modelFinalUnits(t.name).length);
  const sample = seededOfficialSample(official, 5);
  const checked = sample.map(t => {
    const expected = modelFinalUnits(t.name);
    if (!sameSet(t.coreUnits, expected)) {
      throw new Error(`官方core对账失败：${t.name} core=${t.coreUnits.join('、')} expected=${expected.join('、')}`);
    }
    return { name: t.name, coreUnits: t.coreUnits };
  });
  templatesIn.filter(t => t.source === 'research' && Array.isArray(t.board)).forEach(t => {
    const boardNames = new Set((t.board || []).map(x => x.name));
    const outOfBoard = (t.coreUnits || []).filter(x => !boardNames.has(x));
    if (outOfBoard.length) throw new Error(`研究模板core不在成型站位：${t.name} ${outOfBoard.join('、')}`);
  });
  const mf = templatesIn.find(t => t.name.includes('幻灵厄运小姐'));
  if (mf && mf.coreUnits.includes('贾克斯')) throw new Error('幻灵厄运小姐 core 不应包含过渡贾克斯');
  const jax = templatesIn.find(t => t.name.includes('无情连打贾克斯'));
  if (jax && (!jax.coreUnits.includes('贾克斯') || jax.coreUnits.includes('芮尔'))) {
    throw new Error('无情连打贾克斯 core 应包含贾克斯且不含过渡芮尔');
  }
  return {
    officialChecked: checked,
    researchChecked: templatesIn.filter(t => t.source === 'research' && Array.isArray(t.board)).length,
  };
}

const coreAssertions = assertCoreData(templates);
if (heroAugmentCatalog.length !== 122) throw new Error(`英雄强化目录应为122条，实际${heroAugmentCatalog.length}`);
if (heroAugmentCatalog.some(row => !row.hero || !row.cost)) throw new Error('英雄强化目录存在未映射英雄或费用');
if (heroAugmentCatalog.some(row => !row.effect)) {
  throw new Error('英雄强化目录必须携带局面效果');
}
const grantsInText = heroAugmentCatalog.filter(row => /提供\s*(?:1\s*个|一个)【/.test(row.desc));
if (grantsInText.some(row => row.effect.grantedCopies !== 1 || row.effect.grantedHero !== row.hero)) {
  throw new Error('英雄强化赠送棋子效果解析失败');
}
const fireAugment = heroAugmentByName.get('嗜火');
if (!fireAugment || !fireAugment.effect.areaExpanded || fireAugment.effect.stunSeconds !== 2) {
  throw new Error('嗜火范围群控效果解析失败');
}
if (augmentTransitionResults) {
  const transitionTemplate = templates.find(t => t.augmentTransitionPlan && t.augmentTransitionPlan.augment === '无情连打');
  if (!transitionTemplate || transitionTemplate.augmentTransitionPlan.handoff.starGte !== 2
    || !(transitionTemplate.augmentTransitionPlan.handoffInference.lcb95 > 0)) {
    throw new Error('无情连打的条件化转型实验未正确蒸馏进路线模板');
  }
}
if (strategyPolicyResults) {
  const compiledTemplates = templates.filter(t => t.augmentTransitionPlan);
  const compiledIds = new Set(compiledTemplates.map(t => t.augmentTransitionPlan.id));
  if (compiledIds.size < 8) throw new Error(`通用强化策略接入过少：${compiledIds.size}`);
  const badCertifiedRule = compiledTemplates.flatMap(t => t.augmentTransitionPlan.holderRules || [])
    .find(rule => rule.certified && !(rule.inference && Number(rule.inference.lcb95) > 0));
  if (badCertifiedRule) throw new Error('认证的换核规则必须携带正LCB证据');
}
const options = buildOptions(templates);
const weights = computeModelWeights();
const examples = [
  { name: '安妮 + 波比', selected: { units: ['安妮', '波比'], items: [], augments: [], augmentCats: [] } },
  { name: '安妮 + 波比 + 羊刀 + 火炮', selected: { units: ['安妮', '波比'], items: ['鬼索的狂暴之刃', '疾射火炮'], augments: [], augmentCats: [] } },
  { name: '源计划底座 + 物理装 + 经济符文', selected: { units: ['雷克顿', '亚索', '艾希', '蔚'], items: ['反曲之弓', '暴风之剑'], augments: [], augmentCats: ['经济'] } },
].map(x => ({ ...x, result: rank(templates, x.selected, weights).slice(0, 3) }));

const out = {
  version: read('data/chess.js').version + '-' + read('data/chess.js').season,
  generated: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  source: {
    officialLineups: data.lineups.length,
    officialSTier: data.lineups.filter(x => x.quality === 'S').length,
    fields: ['model_results.comps.detail.heroes(coreUnits)', 'y21_early_heros', 'y21_early_heros_contact', 'equipment_order', 'hexbuff', 'monster', 'early_info', 'levelMap'],
  },
  options,
  templates,
  weights,
  examples,
  assertions: { coreData: coreAssertions, heroAugments: { count: heroAugmentCatalog.length, mapped: true, effects: true } },
  assumptions: [
    '二阶段匹配器只根据你点击的信号重排路线，不读取游戏画面。',
    '路线模板来自官方早期阵容/散件优先级/符文推荐，并补充研究型过渡模板。',
    '二阶段结果不应锁死终局，默认输出主线、备线、止损线。',
  ],
};

function writeReport(dataOut) {
  const lines = ['# 二阶段交互匹配器设计数据', '', `生成时间：${dataOut.generated}`, ''];
  lines.push('## 示例');
  dataOut.examples.forEach(ex => {
    lines.push(`### ${ex.name}`);
    ex.result.forEach((r, i) => lines.push(`${i + 1}. ${r.template}：${r.score}分；${r.evidence.join('；') || '-'}`));
    lines.push('');
  });
  lines.push('## 路线模板');
  dataOut.templates.slice(0, 20).forEach(t => {
    lines.push(`- ${t.name}：${t.earlyUnits.join('、')} -> ${t.route.join(' -> ')}；装备 ${t.completedPrefs.slice(0, 5).join('、')}`);
  });
  ensureOutputDirs();
  fs.writeFileSync(reportPath('二阶段交互匹配器.md'), lines.join('\n'));
}

ensureOutputDirs();
fs.writeFileSync(resultPath('stage2_matcher_results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(publicPath('stage2-matcher-data.js'), 'window.STAGE2_MATCHER=' + JSON.stringify(out) + ';');
writeReport(out);

console.log('二阶段匹配器数据生成完成');
out.examples.forEach(ex => console.log(`${ex.name}: ${ex.result.map(r => r.template + '(' + r.score + ')').join(' / ')}`));
console.log('输出: artifacts/results/stage2_matcher_results.json, public/stage2-matcher-data.js, docs/reports/二阶段交互匹配器.md');
