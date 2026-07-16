(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MatcherCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COMPONENTS = ["暴风之剑", "反曲之弓", "无用大棒", "女神之泪", "锁子甲", "负极斗篷", "巨人腰带", "拳套", "金铲铲"];
  const ATTACK = ["鬼索的狂暴之刃", "疾射火炮", "卢安娜的飓风", "最后的轻语", "锐利之刃", "无尽之刃", "巨人捕手", "泰坦的坚决", "水银", "海克斯科技枪刃", "汲取剑"];
  const AP = ["蓝霸符", "珠光护手", "班克斯的魔法帽", "巨人捕手", "斯塔缇克电刃", "朔极之矛"];
  const TANK = ["狂徒铠甲", "日炎斗篷", "石像鬼石板甲", "棘刺背心", "巨龙之爪", "圣盾使的誓约", "离子火花", "振奋盔甲"];
  const TRAIT_ALIASES = {
    护卫: ["护卫"],
    斗士: ["斗士"],
    战斗机甲: ["机甲", "战斗机甲", "战队机甲"],
    小天才: ["小天才", "小"],
    福牛守护者: ["福牛", "福牛守护者"],
    决斗大师: ["决斗", "决斗大师"],
    秘术卫士: ["秘卫", "秘术", "秘术卫士", "秘书卫士"],
    情报特工: ["情报", "情报特工"],
    强袭枪手: ["枪手", "强袭枪手"],
    超级英雄: ["超英", "超级英雄"],
    星之守护者: ["星守", "星之守护者"],
    "源计划：激光特工": ["源计划", "激光", "原计划", "源计划激光", "源计划特工", "激光特工", "源计划：激光特工"],
    混沌战士: ["混沌", "混沌战士"],
    爱心使者: ["爱心", "爱心使者"],
    吉祥物: ["吉祥物"],
    黑客: ["黑客"],
    灵能使: ["灵能", "灵能使"],
    精英战士: ["精英", "精英战士"],
    平民英雄: ["平民", "平民英雄"],
    地下魔盗团: ["魔盗", "地下魔盗", "地下魔盗团"],
    幻灵战队: ["幻灵", "幻灵战队"],
    怪兽: ["怪兽"],
    AI程序: ["ai", "ai程序", "AI程序"],
    淘气包: ["淘气包"],
    气象主播: ["气象", "气象主播"],
  };
  const CN_NUMBERS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  // 确定性决策模型：同一事实状态只产生一个结论。输入顺序和上次渲染结果不进入公式。
  // 当前战力、战略价值与承诺证据分开估值；转型成本只来自真实沉没资产，不再按等级硬编码。
  const DECISION_MODEL = Object.freeze({
    earlyObserveMaxLevel: 3,
    benchReadiness: 0.45,
    unknownLocationReadiness: 0.75,
    offStageReadiness: 0.25,
    unassignedItemReadiness: 0.35,
    nonCarryUpgradeEvidence: 0.55,
    incompatibleUpgradeCostRatio: 0.5,
    incompatibleEquippedItemCostRatio: 0.5,
    minimumCommitmentEvidence: 18,
  });
  // 散件方向纯度达到 2/3 时，给同方向主C路线 10% 确定性加成。
  const COMPONENT_DIRECTION_BONUS = 0.1;
  // primePlan 只给含战斗机甲实验结论的路线加命中证据；不影响无 primePlan 的路线。
  const PRIME_PLAN_MATCH_BONUS = 10;
  // 星级权重：二星/三星来牌比单张更能代表可执行路线，放大该棋子的命中分。
  const STAR_SCORE_MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2.5 };
  // 三星核心视为关键里程碑完成，给追三/核心路线一个确定性成型加成。
  const STAR_MILESTONE_BONUS = 18;
  // 资产角色估值：角色判定来自 routeProfile，这里只集中放数值权重。
  const FUTURE_VALUE_GOLD_CAP = 80;
  const FUTURE_ITEM_VALUE_RATIO = 0.25;
  // 完整事件战斗引擎是教师模型；比赛模式仅吸收其有界先验。
  // tanh让极端模拟结果不能压过现场已握棋子/装备/符文；机制覆盖率低时自动收缩到0。
  const VIRTUAL_BATTLE_PRIOR_CAP = 12;
  const VIRTUAL_BATTLE_CENTER = 50;
  const VIRTUAL_BATTLE_SCALE = 18;
  // 条件符文算子：认证边际先按证据等级折扣，再分别作用于战力、D牌成本或装备缺口。
  const AUGMENT_OPERATOR_EVIDENCE = { "L2.5": 1, "L2": 0.65, "L1.5": 0.35 };
  const AUGMENT_OPERATOR_LIFT_SCALE = 0.5;
  const AUGMENT_OPERATOR_SINGLE_CAP = 12;
  const AUGMENT_OPERATOR_TOTAL_CAP = 18;
  const AUGMENT_COMBAT_READY_FLOOR = 0.6;
  const AUGMENT_ECON_DISCOUNT_BASE = 0.05;
  const AUGMENT_ECON_DISCOUNT_PER_POINT = 0.02;
  const AUGMENT_ECON_DISCOUNT_CAP = 0.3;
  const AUGMENT_ITEM_MISSING_CAP = 3;
  const AUGMENT_ITEM_BONUS_CAP = 10;
  // 英雄强化回合只提供费用可行域；具体的1/2、2/3等同局组合仍由游戏随机决定。
  const HERO_AUGMENT_ROUND_COSTS = {
    "2-1": [1, 2, 3],
    "3-2": [2, 3, 4],
    "4-2": [3, 4, 5],
  };
  // 可出现的主C专属强化提供有限期权值；本局不可能出现时只关闭专属分支，不误杀基础阵容。
  const HERO_AUGMENT_OPTION_BONUS = 6;
  const HERO_AUGMENT_UNAVAILABLE_PENALTY = 6;
  // 已选英雄强化属于全局局面，而非某一条路线的局部标签。控制类效果采用保守代理，
  // 防止未经战斗回放校准的单个强化压过已握棋子与装备。
  const HERO_AUGMENT_CONTROL_PER_SECOND = 4;
  const HERO_AUGMENT_AREA_MULTIPLIER = 1.35;
  const HERO_AUGMENT_CONTROL_CAP = 12;
  // 已选专属强化会改变主C的技能/成长机制，按“基础符文价值 + 1件主C装等价值”建立角色契约。
  // 契约只授予模板明确把该强化英雄定义为主C的路线；仅把该英雄当挂件的路线不享受。
  const HERO_AUGMENT_CARRY_ITEM_EQUIVALENT = 1;
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 9;
  const DEFAULT_LEVEL = 6;
  // 抗脆弱路线泛函：只在 opts.antiFragile 打开时参与最终排序。
  // 设计意图：用核心度、瓶颈、最坏下限和转阵期权，压低"满配强但缺一环就崩"的路线。
  const ANTIFRAGILE_READY_GREEN = 0.55;
  const ANTIFRAGILE_READY_YELLOW = 0.25;
  const ANTIFRAGILE_BOTTLENECK_RED = 1.6;
  const ANTIFRAGILE_BOTTLENECK_YELLOW = 0.9;
  const ANTIFRAGILE_OPTION_BONUS = 16;
  const ANTIFRAGILE_READY_BONUS = 12;
  const ANTIFRAGILE_BOTTLENECK_PENALTY = 35;
  const ANTIFRAGILE_CVAR_PENALTY = 40;
  const ANTIFRAGILE_HARD_GATE_PENALTY = 32;
  const ANTIFRAGILE_ROLL_GOLD = { 1: 0, 2: 0, 3: 8, 4: 12, 5: 24, 6: 36, 7: 50, 8: 45, 9: 55 };
  const ANTIFRAGILE_UNREACHABLE_PROB = 0.05;
  const ANTIFRAGILE_HUGE_GOLD = 80;
  const ANTIFRAGILE_UNREACHABLE_PENALTY = 70;
  const ANTIFRAGILE_HUGE_GOLD_PENALTY = 42;
  const ANTIFRAGILE_RED_STATUS_PENALTY = 80;
  const ECONOMY_AUGMENTS = ["高端购物", "升级咯！", "升级咯", "对冲基金", "明智消费", "利滚利", "利滚利加强版", "DD街区", "快速思考"];

  const fallbackWeights = {
    baseS: 6,
    baseA: 3,
    baseB: 1,
    mainCarryUnit: 60,
    mainCarryItem: 30,
    subCarryUnit: 24,
    subCarryItem: 22,
    frontlineUnit: 16,
    frontlineItem: 16,
    utilityUnit: 10,
    routeItem: 12,
    immediateCraftRatio: 0.8,
    singleComponentRatio: 0.5,
    traitAffinity: 7,
    trait: 18,
    augment: 16,
    augmentSignal: 6,
    futureMainCarryUnit: 24,
    futureCoreUnit: 10,
    futureItem: 8,
    versionStrength: 4,
  };

  const ITEM_RECIPES = {
    鬼索的狂暴之刃: ["反曲之弓", "无用大棒"],
    疾射火炮: ["反曲之弓", "反曲之弓"],
    卢安娜的飓风: ["反曲之弓", "负极斗篷"],
    最后的轻语: ["反曲之弓", "拳套"],
    锐利之刃: ["暴风之剑", "暴风之剑"],
    无尽之刃: ["暴风之剑", "拳套"],
    巨人捕手: ["暴风之剑", "反曲之弓"],
    泰坦的坚决: ["反曲之弓", "锁子甲"],
    水银: ["负极斗篷", "拳套"],
    海克斯科技枪刃: ["暴风之剑", "无用大棒"],
    汲取剑: ["暴风之剑", "负极斗篷"],
    蓝霸符: ["女神之泪", "女神之泪"],
    珠光护手: ["无用大棒", "拳套"],
    班克斯的魔法帽: ["无用大棒", "无用大棒"],
    斯塔缇克电刃: ["反曲之弓", "女神之泪"],
    朔极之矛: ["暴风之剑", "女神之泪"],
    狂徒铠甲: ["巨人腰带", "巨人腰带"],
    日炎斗篷: ["锁子甲", "巨人腰带"],
    石像鬼石板甲: ["锁子甲", "负极斗篷"],
    棘刺背心: ["锁子甲", "锁子甲"],
    巨龙之爪: ["负极斗篷", "负极斗篷"],
    圣盾使的誓约: ["锁子甲", "女神之泪"],
    离子火花: ["无用大棒", "负极斗篷"],
    振奋盔甲: ["巨人腰带", "负极斗篷"],
  };
  const ITEM_ALIASES = {
    羊刀: "鬼索的狂暴之刃",
    鬼索: "鬼索的狂暴之刃",
    火炮: "疾射火炮",
    泰坦: "泰坦的坚决",
    法爆: "珠光护手",
    帽子: "班克斯的魔法帽",
    轻语: "最后的轻语",
    飓风: "卢安娜的飓风",
    巨杀: "巨人捕手",
    锐利: "锐利之刃",
    狂徒: "狂徒铠甲",
    离子: "离子火花",
  };

  function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
  }

  function escText(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function traitNorm(s) {
    return String(s || "").toLowerCase().replace(/[\s,，、+＋/|;；:：!！?？。,.()（）\[\]【】·.\-_—>→]/g, "");
  }

  const traitEntries = Object.entries(TRAIT_ALIASES).flatMap(([value, aliases]) =>
    [value, ...(aliases || [])].map(label => ({ value, label, norm: traitNorm(label) }))
  ).filter(x => x.norm).sort((a, b) => b.norm.length - a.norm.length);

  function numberAt(text, i) {
    const ch = text[i];
    if (CN_NUMBERS[ch]) return { count: CN_NUMBERS[ch], len: 1 };
    const m = text.slice(i).match(/^[1-9]/);
    return m ? { count: Number(m[0]), len: m[0].length } : null;
  }

  function traitAt(text, i) {
    const n = numberAt(text, i);
    if (!n) return null;
    const rest = text.slice(i + n.len);
    const hit = traitEntries.find(e => rest.startsWith(e.norm));
    if (!hit) return null;
    return { name: hit.value, count: n.count, label: `${n.count}${hit.value}`, len: n.len + hit.norm.length };
  }

  function parseTraitsInText(text) {
    const clean = traitNorm(text);
    const rows = [];
    for (let i = 0; i < clean.length; i++) {
      const hit = traitAt(clean, i);
      if (!hit) continue;
      rows.push(hit);
      i += hit.len - 1;
    }
    return rows;
  }

  function normalizeSelectedTraits(rows) {
    return (rows || []).map(x => {
      if (typeof x === "string") return parseTraitsInText(x)[0];
      if (x && x.name && x.count) return { name: x.name, count: Number(x.count), label: x.label || `${x.count}${x.name}` };
      if (x && x.value && x.count) return { name: x.value, count: Number(x.count), label: x.label || `${x.count}${x.value}` };
      return x && (x.label || x.value) ? parseTraitsInText(x.label || x.value)[0] : null;
    }).filter(Boolean);
  }

  function activeTraitsForTemplate(t) {
    const map = new Map();
    const add = row => {
      if (!row || !row.name || !row.count) return;
      map.set(row.name, Math.max(map.get(row.name) || 0, Number(row.count)));
    };
    (t.earlyTraits || []).forEach(x => parseTraitsInText(x).forEach(add));
    parseTraitsInText(t.name || "").forEach(add);
    return map;
  }

  function normalizeSelectedUnits(rows) {
    const map = new Map();
    (rows || []).forEach(row => {
      const name = typeof row === "string" ? row : (row && (row.name || row.value || row.label));
      if (!name) return;
      const cleanName = String(name).split("·")[0];
      const star = Number(typeof row === "object" ? row.star : 0) || 0;
      const location = typeof row === "object" && row.location ? row.location : "unknown";
      const prev = map.get(cleanName);
      if (!prev) {
        map.set(cleanName, { name: cleanName, star, location });
        return;
      }
      if (star > (prev.star || 0)) prev.star = star;
      if (location === "board" || (location === "bench" && prev.location === "unknown")) prev.location = location;
    });
    return [...map.values()];
  }

  function normalizeSelectedItems(selected) {
    const source = selected && selected.itemRows && selected.itemRows.length
      ? selected.itemRows
      : (selected && selected.items || []);
    const rows = [];
    (source || []).forEach(row => {
      const rawName = typeof row === "string" ? row : row && (row.name || row.value || row.label);
      if (!rawName) return;
      const count = Math.max(1, Math.min(9, Number(typeof row === "object" && row.count) || 1));
      for (let i = 0; i < count; i++) {
        rows.push({
          name: canonicalItem(rawName),
          holder: typeof row === "object" ? (row.holder || "") : "",
          equipped: typeof row === "object" ? Boolean(row.equipped || row.holder) : false,
          source: typeof row === "object" ? (row.source || "") : "",
        });
      }
    });
    return rows;
  }

  function unitCopies(star) {
    if (star >= 3) return 9;
    if (star === 2) return 3;
    return 1;
  }

  function starLabel(name, star) {
    return star ? `${name}·${star}星` : name;
  }

  function canonicalItem(name) {
    const raw = String(name || "").split("/")[0].trim();
    return ITEM_ALIASES[raw] || raw;
  }

  function profile(t) {
    return t.routeProfile || {
      mainCarry: { name: (t.carryUnits || [])[0] || (t.coreUnits || [])[0], starTarget: 2, items: (t.completedPrefs || []).slice(0, 3) },
      units: (t.coreUnits || []).map(name => ({ name, role: "utility", starTarget: 1, items: [], traits: [] })),
      items: (t.completedPrefs || []).map(name => ({ name: canonicalItem(name), role: "route", holder: "", components: ITEM_RECIPES[canonicalItem(name)] || [] })),
      activeTraits: [...activeTraitsForTemplate(t)].map(([name, count]) => ({ name, count, label: `${count}${name}` })),
    };
  }

  function profileUnitMap(t) {
    const map = new Map();
    (profile(t).units || []).forEach(u => {
      if (!u || !u.name) return;
      map.set(u.name, u);
    });
    return map;
  }

  function profileItems(t) {
    return (profile(t).items || []).map(item => ({
      ...item,
      name: canonicalItem(item.name),
      components: item.components && item.components.length ? item.components : (ITEM_RECIPES[canonicalItem(item.name)] || []),
    })).filter(x => x.name);
  }

  function activeTraitRows(t) {
    const rows = (profile(t).activeTraits || []).filter(x => x && x.name && x.count);
    if (rows.length) return rows;
    return [...activeTraitsForTemplate(t)].map(([name, count]) => ({ name, count, label: `${count}${name}` }));
  }

  function activeTraitMap(t) {
    const map = new Map();
    activeTraitRows(t).forEach(x => map.set(x.name, Math.max(map.get(x.name) || 0, Number(x.count) || 0)));
    return map;
  }

  function normalizeHeroAugmentRound(value) {
    const raw = String(value || "").trim().replace("阶段", "").replace("杠", "-");
    return HERO_AUGMENT_ROUND_COSTS[raw] ? raw : "unknown";
  }

  function heroAugmentRoleContract(t, selected) {
    const state = selected && selected.heroAugment || {};
    const chosen = state.status === "resolved" && state.selected;
    if (!chosen || !chosen.name || !chosen.hero) return null;
    const mainCarry = routeMainCarry(t);
    if (!mainCarry || mainCarry !== chosen.hero) return null;
    const options = (t && t.heroAugmentPlan && t.heroAugmentPlan.options || [])
      .filter(row => row && row.name && row.hero);
    const option = options.find(row => row.name === chosen.name && row.hero === mainCarry);
    if (!option) return null;
    return { chosen, option, mainCarry };
  }

  function heroAugmentRoleContractValue(weights) {
    return Math.round((Number(weights.augment) || 0)
      + (Number(weights.mainCarryItem) || 0) * HERO_AUGMENT_CARRY_ITEM_EQUIVALENT);
  }

  function heroAugmentDecision(t, selected) {
    const round = normalizeHeroAugmentRound(selected && selected.heroAugmentRound);
    const costs = HERO_AUGMENT_ROUND_COSTS[round] || [];
    const plan = t && t.heroAugmentPlan || {};
    const options = (plan.options || []).filter(row => row && row.name && row.hero && Number(row.cost));
    const requiredNames = new Set(plan.requiredNames || []);
    const required = options.filter(row => requiredNames.has(row.name));
    const mainCarry = plan.mainCarry || (profile(t).mainCarry || {}).name || "";
    const mainOptions = options.filter(row => row.hero === mainCarry);
    const selectedAugments = new Set(selected && selected.augments || []);
    const globalHeroAugment = selected && selected.heroAugment || {};
    const selectedHit = options.find(row => selectedAugments.has(row.name));
    const candidates = required.length ? required : (mainOptions.length ? mainOptions : options);
    const eligible = round === "unknown" ? [] : candidates.filter(row => costs.includes(Number(row.cost)));
    const excludedCosts = round === "unknown" ? [] : [1, 2, 3, 4, 5].filter(cost => !costs.includes(cost));
    const traits = uniq(eligible.flatMap(row => row.traits || [])).slice(0, 3);
    const heroes = uniq(eligible.map(row => row.hero));
    const optionNames = uniq(candidates.map(row => row.name));
    const base = { round, costs, excludedCosts, mainCarry, traits, heroes, options, eligible, required: !!required.length, scoreDelta: 0, hardBlock: false };
    if (globalHeroAugment.status === "resolved") {
      const chosen = globalHeroAugment.selected || {};
      if (selectedHit) {
        return { ...base, status: "locked", text: `${round === "unknown" ? "英雄强化" : round + "英雄强化"}已结算：${selectedHit.name}→${selectedHit.hero}${selectedHit.cost}费专属` };
      }
      if (required.length) {
        return {
          ...base,
          status: "closed",
          hardBlock: true,
          text: `${round === "unknown" ? "英雄强化已结算" : round + "已结算"}：已选${chosen.name || "其他强化"}，${optionNames.join("/")}刚需分支关闭`,
        };
      }
      return {
        ...base,
        status: "resolved",
        text: `${round === "unknown" ? "英雄强化已结算" : round + "英雄强化已结算"}：已选${chosen.name || "其他强化"}，${mainCarry || "本路线"}不再保留专属期权`,
      };
    }
    if (selectedHit) {
      return { ...base, status: "locked", text: `已命中${selectedHit.name}：${selectedHit.hero}${selectedHit.cost}费专属` };
    }
    if (round === "unknown") return null;
    if (!options.length) {
      return { ...base, status: "lock", text: `现在可锁：不依赖英雄强化（${round}费用池${costs.join("/")}费）` };
    }
    if (required.length && !eligible.length) {
      return {
        ...base,
        status: "closed",
        hardBlock: true,
        text: `本局关闭：${optionNames.join("/")}需要${uniq(candidates.map(row => row.cost)).join("/")}费，${round}只含${costs.join("/")}费`,
      };
    }
    if (required.length) {
      return { ...base, status: "waiting", text: `等${round}强化决定：${heroes.join("/")}专属仍在费用池` };
    }
    if (mainOptions.length && !eligible.length) {
      return {
        ...base,
        status: "base-only",
        scoreDelta: -HERO_AUGMENT_UNAVAILABLE_PENALTY,
        text: `专属分支关闭：${mainCarry}${uniq(mainOptions.map(row => row.cost)).join("/")}费强化不在${round}费用池，保留基础阵容`,
      };
    }
    if (mainOptions.length) {
      return {
        ...base,
        status: "waiting",
        scoreDelta: HERO_AUGMENT_OPTION_BONUS,
        text: `等${round}强化决定：${heroes.join("/")}专属可出现，期权+${HERO_AUGMENT_OPTION_BONUS}分`,
      };
    }
    if (eligible.length) {
      return { ...base, status: "available", text: `${round}可出现支线：${heroes.join("/")}，主线不强依赖` };
    }
    return { ...base, status: "lock", text: `现在可锁：本路线不依赖${round}可用的英雄专属` };
  }

  function roleUnitWeight(role, w) {
    if (role === "mainCarry") return w.mainCarryUnit;
    if (role === "subCarry") return w.subCarryUnit;
    if (role === "frontline") return w.frontlineUnit;
    return w.utilityUnit;
  }

  function roleItemWeight(role, w) {
    if (role === "mainCarry") return w.mainCarryItem;
    if (role === "subCarry") return w.subCarryItem;
    if (role === "frontline") return w.frontlineItem;
    return w.routeItem;
  }

  function roleLabel(role) {
    return role === "mainCarry" ? "主C"
      : role === "subCarry" ? "副C"
      : role === "frontline" ? "前排"
      : "成型";
  }

  function itemRankLabel(item, roleItems) {
    const sameRole = roleItems.filter(x => x.role === item.role && x.holder === item.holder);
    const idx = sameRole.findIndex(x => x.name === item.name);
    return idx === 0 ? "一号装" : idx === 1 ? "二号装" : idx === 2 ? "三号装" : "装备";
  }

  function carryCoreItems(t) {
    return profileItems(t).filter(x => x.role === "mainCarry").map(x => x.name);
  }

  function unitTraits(name, opts, unitMap) {
    const row = unitMap && unitMap.get(name);
    if (row && row.traits) return row.traits;
    const map = opts && opts.unitTraits || {};
    return map[name] || [];
  }

  function selectedComponentList(items) {
    return [...(items || [])].filter(x => COMPONENTS.includes(x));
  }

  function countComponents(list) {
    const counts = {};
    (list || []).forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    return counts;
  }

  function hasRecipe(components, recipe) {
    const counts = countComponents(components);
    return (recipe || []).every(part => {
      if (!counts[part]) return false;
      counts[part]--;
      return true;
    });
  }

  function bestCrafts(t, selectedItems, w) {
    // 贪心撮合：散件是互斥资源——一件散件只能进一个合成对或计一次单件分，
    // 杜绝"三件散件被记成三个可立即合成"的重复计分
    const pool = countComponents(selectedComponentList(selectedItems));
    const items = profileItems(t);
    const candidates = items
      .filter(item => (item.components || []).length === 2)
      .map(item => ({ item, recipe: item.components, base: roleItemWeight(item.role, w) }))
      .sort((a, b) => b.base - a.base);
    const rows = [];
    const usedItems = new Set();
    // 第一轮：高价值成装优先配对，配上即消耗两件散件
    candidates.forEach(({ item, recipe, base }) => {
      if (usedItems.has(item.name)) return;
      const need = countComponents(recipe);
      const ok = Object.entries(need).every(([part, n]) => (pool[part] || 0) >= n);
      if (!ok) return;
      Object.entries(need).forEach(([part, n]) => { pool[part] -= n; });
      usedItems.add(item.name);
      rows.push({
        item,
        pts: Math.round(base * w.immediateCraftRatio),
        evidence: `${recipe[0]}+${recipe[1]}→${item.name}（${roleLabel(item.role)}${itemRankLabel(item, items)}可立即合成）`,
        kind: "craft",
      });
    });
    // 第二轮：剩余散件每件只计一次，记到还需要它的最高价值成装上
    candidates.forEach(({ item, recipe, base }) => {
      if (usedItems.has(item.name)) return;
      const hit = recipe.find(part => (pool[part] || 0) > 0);
      if (!hit) return;
      pool[hit] -= 1;
      usedItems.add(item.name);
      rows.push({
        item,
        pts: Math.round(base * w.singleComponentRatio),
        evidence: `${hit} 属于${item.name}分解件`,
        kind: "component",
      });
    });
    return rows;
  }

  function componentDirection(items) {
    const components = [...(items || [])].filter(x => COMPONENTS.includes(x));
    const physical = components.filter(x => ["暴风之剑", "反曲之弓", "拳套"].includes(x)).length;
    const magic = components.filter(x => ["无用大棒", "女神之泪"].includes(x)).length;
    const total = physical + magic;
    if (total < 2) return null;
    if (physical / total >= 2 / 3) return "物理";
    if (magic / total >= 2 / 3) return "法系";
    return null;
  }

  function routeText(t) {
    return [
      t && t.name,
      t && t.family,
      ...((t && t.earlyUnits) || []),
      ...((t && t.midUnits) || []),
      ...((t && t.coreUnits) || []),
      ...((t && t.componentPrefs) || []),
      ...((t && t.completedPrefs) || []),
      ...profileItems(t || {}).flatMap(x => [x.name, ...(x.components || [])]),
    ].join(" ");
  }

  function binomialTail(n, p, k) {
    if (k <= 0) return 1;
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return 1;
    if (k > n) return 0;
    let prob = Math.pow(1 - p, n);
    let sum = prob;
    for (let i = 1; i < k; i++) {
      prob *= ((n - i + 1) / i) * (p / (1 - p));
      sum += prob;
    }
    return clamp(1 - sum, 0, 1);
  }

  function hitProbabilityForUnit(name, targetCopies, selected, opts) {
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const need = Math.max(0, targetCopies - owned);
    if (need <= 0) return 1;
    const odds = ((shopOdds[level] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
    if (odds <= 0) return 0;
    const count = Number(unitCounts[cost]) || 1;
    const pSlot = odds / count;
    const gold = ANTIFRAGILE_ROLL_GOLD[level] || 30;
    const slots = Math.max(0, Math.floor(gold / 2) * 5);
    return binomialTail(slots, pSlot, need);
  }

  function timingForCost(cost, level) {
    const ideal = cost <= 1 ? 4 : cost === 2 ? 5 : cost === 3 ? 7 : cost === 4 ? 8 : 9;
    return clamp(Math.exp(-0.35 * Math.abs((Number(level) || DEFAULT_LEVEL) - ideal)), 0.25, 1);
  }

  function unitReadiness(name, targetCopies, selected) {
    const owned = ownedCopyMap(selected).get(name) || 0;
    if (owned >= targetCopies) return 1;
    if (targetCopies >= 9) {
      if (owned >= 3) return 0.65;
      if (owned >= 1) return 0.25;
      return 0;
    }
    if (targetCopies >= 3) return owned >= 1 ? 0.55 : 0;
    return owned >= 1 ? 1 : 0;
  }

  function itemReadiness(item, selectedItems) {
    const name = canonicalItem(item.name);
    if (selectedItems.has(name)) return 1;
    const recipe = item.components && item.components.length ? item.components : ITEM_RECIPES[name] || [];
    const components = selectedComponentList(selectedItems);
    if (recipe.length === 2 && hasRecipe(components, recipe)) return 0.8;
    if (recipe.some(part => components.includes(part))) return 0.35;
    return 0;
  }

  function itemAvailability(readiness) {
    if (readiness >= 0.8) return 0.9;
    if (readiness > 0) return 0.5;
    return 0.25;
  }

  function componentIrreplaceability(type, role) {
    if (type === "augment") return 1;
    if (type === "unit") return role === "mainCarry" ? 0.95 : role === "subCarry" ? 0.68 : role === "frontline" ? 0.55 : 0.42;
    if (type === "item") return role === "mainCarry" ? 0.86 : role === "subCarry" ? 0.62 : role === "frontline" ? 0.5 : 0.35;
    return 0.45;
  }

  function coreComponentRows(t, selected, opts, w) {
    const rows = [];
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const selectedItems = new Set(normalizeSelectedItems(selected).map(x => x.name));
    const p = profile(t);
    const mainName = p.mainCarry && p.mainCarry.name;
    const stageNames = new Set(level <= 5 ? (t.earlyUnits || []) : level === 6 ? (t.midUnits || []) : []);
    const profileNames = new Set((p.units || []).map(x => x && x.name).filter(Boolean));
    stageNames.forEach(name => {
      if (!name || profileNames.has(name)) return;
      const cost = unitPrice(name, opts);
      const target = 1;
      const weight = w.frontlineUnit * 0.8;
      const readiness = unitReadiness(name, target, selected);
      const costRow = expectedCostForUnit(name, target, selected, opts);
      const probability = readiness >= 1 ? 1 : hitProbabilityForUnit(name, target, selected, opts);
      const availability = readiness > 0 ? Math.max(0.55, probability) : probability;
      const timing = timingForCost(cost, level);
      const coreIndex = weight * componentIrreplaceability("unit", "frontline") * timing / clamp(availability, 0.05, 1);
      rows.push({
        type: "unit",
        name,
        label: `阶段${name}`,
        role: "stage",
        weight,
        readiness,
        probability,
        availability,
        timing,
        coreIndex,
        expectedGold: readiness >= 1 ? 0 : (costRow.available ? costRow.expectedGold : ANTIFRAGILE_HUGE_GOLD * 2),
        need: readiness >= 1 ? 0 : 1,
      });
    });
    (p.units || []).forEach(unit => {
      if (!unit || !unit.name) return;
      const role = unit.role || (unit.name === mainName ? "mainCarry" : "utility");
      const cost = unitPrice(unit.name, opts);
      const futureScale = level <= 5 && !stageNames.has(unit.name)
        ? (cost >= 4 ? 0.12 : cost >= 3 ? 0.25 : 1)
        : level === 6 && !stageNames.has(unit.name) && cost >= 4
          ? 0.35
          : 1;
      const stageTarget = stageNames.has(unit.name)
        ? (level <= 5 ? 1 : level === 6 ? Math.min(3, targetCopiesFor(t, unit.name, cost)) : 0)
        : 0;
      const target = stageTarget || (futureScale < 1 ? 1 : targetCopiesFor(t, unit.name, cost));
      const weight = roleUnitWeight(role, w) * (role === "mainCarry" ? 1.25 : 0.75) * futureScale;
      const readiness = unitReadiness(unit.name, target, selected);
      const costRow = expectedCostForUnit(unit.name, target, selected, opts);
      const probability = readiness >= 1 ? 1 : hitProbabilityForUnit(unit.name, target, selected, opts);
      const availability = readiness > 0 ? Math.max(0.55, probability) : probability;
      const timing = timingForCost(cost, level);
      const coreIndex = weight * componentIrreplaceability("unit", role) * timing / clamp(availability, 0.05, 1);
      rows.push({
        type: "unit",
        name: unit.name,
        label: `${roleLabel(role)}${unit.name}`,
        role,
        weight,
        readiness,
        probability,
        availability,
        timing,
        coreIndex,
        expectedGold: readiness >= 1 ? 0 : (costRow.available ? costRow.expectedGold : ANTIFRAGILE_HUGE_GOLD * 2),
        need: Math.max(0, target - (ownedCopyMap(selected).get(unit.name) || 0)),
      });
    });
    profileItems(t).forEach(item => {
      const role = item.role || "route";
      const weight = roleItemWeight(role, w) * (role === "mainCarry" ? 1.15 : 0.65);
      const readiness = itemReadiness(item, selectedItems);
      const availability = itemAvailability(readiness);
      const coreIndex = weight * componentIrreplaceability("item", role) / availability;
      rows.push({
        type: "item",
        name: item.name,
        label: `${roleLabel(role)}装${item.name}`,
        role,
        weight,
        readiness,
        probability: availability,
        availability,
        timing: 1,
        coreIndex,
        expectedGold: 0,
        need: readiness >= 1 ? 0 : 1,
      });
    });
    const directAug = (t.augmentPrefs || []).find(name => String(t.name || "").includes(name));
    if (directAug) {
      const has = (selected.augments || []).includes(directAug);
      const weight = w.augment * 1.8;
      rows.push({
        type: "augment",
        name: directAug,
        label: `专属符文${directAug}`,
        role: "augment",
        weight,
        readiness: has ? 1 : 0,
        probability: has ? 1 : 0.22,
        availability: has ? 1 : 0.22,
        timing: 1,
        coreIndex: weight * componentIrreplaceability("augment", "augment") / (has ? 1 : 0.22),
        need: has ? 0 : 1,
      });
    }
    return rows.filter(x => Number.isFinite(x.coreIndex));
  }

  function routeOptionValue(t, selected, templates) {
    const all = (templates || []).filter(x => x && x !== t);
    if (!all.length) return 0;
    const selectedAssets = [
      ...normalizeSelectedUnits(selected.units || []).map(x => x.name),
      ...(selected.items || []).map(canonicalItem),
    ];
    const routeAssets = [
      ...(t.earlyUnits || []),
      ...(t.midUnits || []),
      ...profileItems(t).flatMap(x => [x.name, ...(x.components || [])]),
    ];
    const assets = uniq((selectedAssets.length ? selectedAssets : routeAssets).filter(a => routeText(t).includes(a))).slice(0, 8);
    if (!assets.length) return 0;
    const raw = assets.map(asset => all.filter(other => routeText(other).includes(asset)).length / all.length);
    return clamp(raw.reduce((sum, x) => sum + x, 0) / raw.length, 0, 1);
  }

  function hasEconomySignal(selected) {
    const augments = new Set([...(selected.augments || []), ...(selected.augmentCats || [])].map(String));
    if (augments.has("经济")) return true;
    return ECONOMY_AUGMENTS.some(name => augments.has(name));
  }

  function economyActionLine(selected) {
    if (!hasEconomySignal(selected)) return "";
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    if (level >= 8) return "经济符文已兑现：8级后再按核心质量D牌";
    const augments = new Set([...(selected.augments || []), ...(selected.augmentCats || [])].map(String));
    const levelEcon = ["高端购物", "升级咯！", "升级咯", "对冲基金", "利滚利", "利滚利加强版"].some(name => augments.has(name));
    const target = levelEcon ? 8 : (level < 7 ? 7 : 8);
    return `经济符文：先拉${target}再D，不在${level}级追终局缺口`;
  }

  function antiFragileStatus(ready, bottleneckRatio, blocked) {
    if (blocked) return "red";
    if (ready < ANTIFRAGILE_READY_YELLOW || bottleneckRatio >= ANTIFRAGILE_BOTTLENECK_RED) return "red";
    if (ready < ANTIFRAGILE_READY_GREEN || bottleneckRatio >= ANTIFRAGILE_BOTTLENECK_YELLOW) return "yellow";
    return "green";
  }

  function antiFragileLabel(status) {
    if (status === "green") return "绿灯：可以定线";
    if (status === "yellow") return "黄灯：观察验证";
    return "红灯：陷阱别硬玩";
  }

  function analyzeAntiFragility(t, selected, stageResult, opts, weights, templates) {
    const w = { ...fallbackWeights, ...(weights || {}) };
    const core = coreComponentRows(t, selected, opts || {}, w);
    const total = core.reduce((sum, x) => sum + x.weight, 0) || 1;
    const owned = core.reduce((sum, x) => sum + x.weight * x.readiness, 0);
    const ready = clamp(owned / total, 0, 1);
    const missingRows = core.filter(x => x.readiness < 0.95).sort((a, b) => b.coreIndex - a.coreIndex);
    const bottleneck = missingRows[0] || null;
    const bottleneckRatio = bottleneck ? bottleneck.coreIndex / total : 0;
    const worstLossRatio = missingRows.length ? Math.max(...missingRows.map(x => x.weight * (1 - x.readiness) / total)) : 0;
    const option = routeOptionValue(t, selected, templates);
    const bottleneckPenalty = Math.round(Math.min(80, bottleneckRatio * ANTIFRAGILE_BOTTLENECK_PENALTY));
    const cvarPenalty = Math.round(worstLossRatio * ANTIFRAGILE_CVAR_PENALTY);
    const lowProbBlocked = !!(bottleneck && bottleneck.need > 0 && Number(bottleneck.probability) <= ANTIFRAGILE_UNREACHABLE_PROB);
    const hugeGoldBlocked = !!(bottleneck && bottleneck.need > 0 && Number(bottleneck.expectedGold) >= ANTIFRAGILE_HUGE_GOLD);
    const mechanicBlocked = !!stageResult.mechanicBlocked;
    const blocked = lowProbBlocked || hugeGoldBlocked || mechanicBlocked;
    const blockPenalty = (lowProbBlocked ? ANTIFRAGILE_UNREACHABLE_PENALTY : 0) + (hugeGoldBlocked ? ANTIFRAGILE_HUGE_GOLD_PENALTY : 0);
    const status = antiFragileStatus(ready, bottleneckRatio, blocked);
    const optionBonus = Math.round(option * ANTIFRAGILE_OPTION_BONUS);
    const readyBonus = Math.round(ready * ANTIFRAGILE_READY_BONUS);
    const hardPenalty = ready < ANTIFRAGILE_READY_YELLOW ? ANTIFRAGILE_HARD_GATE_PENALTY : ready < ANTIFRAGILE_READY_GREEN ? Math.round(ANTIFRAGILE_HARD_GATE_PENALTY / 2) : 0;
    const statusPenalty = status === "red" ? ANTIFRAGILE_RED_STATUS_PENALTY : 0;
    const score = Math.max(0, Math.round(stageResult.stageStrength - bottleneckPenalty - cvarPenalty - hardPenalty - blockPenalty - statusPenalty + optionBonus + readyBonus));
    const goldText = bottleneck && Number(bottleneck.expectedGold) > 0 ? `，约${Math.round(bottleneck.expectedGold)}金` : "";
    const bottleneckText = bottleneck ? `${bottleneck.label}（核心度${Math.round(bottleneck.coreIndex)}，可达${Math.round((bottleneck.probability || 0) * 100)}%${goldText}）` : "核心组件已基本到位";
    const formula = `抗脆弱=${stageResult.stageStrength}-瓶颈${bottleneckPenalty}-下限${cvarPenalty}-硬门槛${hardPenalty}-不可达${blockPenalty}-红灯${statusPenalty}+期权${optionBonus}+准备${readyBonus}=${score}`;
    return {
      score,
      ready,
      readyPct: Math.round(ready * 100),
      status,
      label: antiFragileLabel(status),
      bottleneck,
      bottleneckText,
      bottleneckPenalty,
      cvarPenalty,
      hardPenalty,
      statusPenalty,
      blockPenalty,
      blocked,
      lowProbBlocked,
      hugeGoldBlocked,
      option,
      optionBonus,
      readyBonus,
      formula,
      core: core.sort((a, b) => b.coreIndex - a.coreIndex).slice(0, 6),
      missing: missingRows.slice(0, 4).map(x => x.label),
    };
  }

  function routeDirection(t) {
    if (t.role === "普攻") return "物理";
    if (t.role === "法系") return "法系";
    const items = carryCoreItems(t).slice(0, 3);
    const physical = items.filter(x => ["鬼索的狂暴之刃", "疾射火炮", "卢安娜的飓风", "最后的轻语", "锐利之刃", "无尽之刃", "泰坦的坚决", "汲取剑"].includes(x)).length;
    const magic = items.filter(x => ["蓝霸符", "珠光护手", "班克斯的魔法帽", "斯塔缇克电刃", "朔极之矛"].includes(x)).length;
    if (physical > magic) return "物理";
    if (magic > physical) return "法系";
    return null;
  }

  function augmentEvidenceFactor(level) {
    const key = Object.keys(AUGMENT_OPERATOR_EVIDENCE).find(x => String(level || "").startsWith(x));
    return key ? AUGMENT_OPERATOR_EVIDENCE[key] : 0;
  }

  function calibratedAugmentLift(profile) {
    const delta = Math.max(0, Number(profile && profile.conditionLift) || 0);
    return Math.min(AUGMENT_OPERATOR_SINGLE_CAP, delta * AUGMENT_OPERATOR_LIFT_SCALE) * augmentEvidenceFactor(profile && profile.evidenceLevel);
  }

  function activeAugmentOperators(t, selected) {
    const selectedAugments = new Set(selected.augments || []);
    const rows = (t.augmentOperators || []).filter(x => selectedAugments.has(x.name)).map(x => ({
      ...x,
      calibratedLift: calibratedAugmentLift(x),
    })).filter(x => x.calibratedLift > 0);
    const economyRows = rows.filter(x => x.category === "经济");
    let discount = 0;
    let shopLevelOffset = 0;
    let copyCredit = 0;
    economyRows.forEach(x => {
      if (/高端购物/.test(x.name)) shopLevelOffset = Math.max(shopLevelOffset, 1);
      else discount += AUGMENT_ECON_DISCOUNT_BASE + AUGMENT_ECON_DISCOUNT_PER_POINT * x.calibratedLift;
      if (/DD街区|明智消费|快速思考|门票/.test(x.name)) discount += 0.06;
      if (/团队建设|英勇福袋|复制器/.test(x.name)) copyCredit = Math.max(copyCredit, 1);
    });
    discount = clamp(discount, 0, AUGMENT_ECON_DISCOUNT_CAP);
    return {
      rows,
      economy: {
        active: economyRows.length > 0,
        names: economyRows.map(x => x.name),
        goldMultiplier: 1 - discount,
        discount,
        shopLevelOffset,
        copyCredit,
        copyTarget: (profile(t).mainCarry || {}).name || "",
      },
      variableBonus: 0,
      economyFutureBonus: 0,
      evidence: [],
      actions: [],
    };
  }

  function operatorOddsOpts(opts, operator) {
    if (!operator || !operator.economy || !operator.economy.active) return opts || {};
    return { ...(opts || {}), augmentEconomy: operator.economy };
  }

  function heroAugmentMechanic(t, selected, opts) {
    const state = selected.heroAugment || {};
    const chosen = state.selected;
    const effect = chosen && chosen.effect || {};
    if (state.status !== "resolved" || (!effect.stunSeconds && !effect.areaExpanded)) return null;
    const target = effect.grantedHero || chosen.hero;
    const unitMap = profileUnitMap(t);
    const routeUnit = unitMap.get(target);
    const activeTraits = activeTraitMap(t);
    const traitOverlap = (chosen.traits || []).filter(name => activeTraits.has(name)).length;
    // 有该英雄在成型阵容最适配；只共享羁绊时保留小额兼容性，不把所有路线都抬高。
    const fit = clamp((routeUnit ? 0.62 : 0.16) + Math.min(0.24, traitOverlap * 0.08), 0, 1);
    if (fit <= 0.2) return null;
    const controlSeconds = Number(effect.stunSeconds) || 0;
    const area = effect.areaExpanded ? HERO_AUGMENT_AREA_MULTIPLIER : 1;
    const raw = controlSeconds * HERO_AUGMENT_CONTROL_PER_SECOND * area * fit;
    const bonus = Math.round(Math.min(HERO_AUGMENT_CONTROL_CAP, raw));
    if (!bonus) return null;
    const role = routeUnit ? roleLabel(routeUnit.role) : "羁绊填充";
    return {
      bonus,
      fit,
      text: `${chosen.name}机制：${target}${effect.areaExpanded ? "范围扩大" : ""}${controlSeconds ? `${effect.areaExpanded ? "、" : ""}群控${controlSeconds}秒` : ""}，${role}适配+${bonus}`,
    };
  }

  function scoreTemplate(t, selected, weights, opts) {
    selected = resolveGameState(selected, opts && opts.heroAugments);
    const unitRows = normalizeSelectedUnits(selected.units || []);
    const units = new Set(unitRows.map(x => x.name));
    const unitStars = new Map(unitRows.map(x => [x.name, x.star || 0]));
    const itemRows = normalizeSelectedItems(selected);
    const items = itemRows.map(x => x.name);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = { ...fallbackWeights, ...(weights || {}) };
    const base = t.quality === "S" ? w.baseS : t.quality === "A" ? w.baseA : w.baseB;
    const strengthPrior = Math.round((Number(t.strengthPrior) || 0) * (Number(w.versionStrength) || 0));
    let score = base + strengthPrior;
    let heldValue = base;
    let futureValue = 0;
    let mechanicBlocked = false;
    const breakdown = { base, hero: 0, item: 0, augment: 0, synergy: 0, future: 0, penalty: 0 };
    if (traits.length) {
      breakdown.trait = 0;
      breakdown.traitSignals = traits.length;
    }
    const evidence = [], missing = [], penalties = [];
    const p = profile(t);
    const unitMap = profileUnitMap(t);
    const roleItems = profileItems(t);
    const activeTraits = activeTraitMap(t);
    const selectedCompleted = items.map(canonicalItem).filter(x => !COMPONENTS.includes(x));
    const selectedComponents = selectedComponentList(items);
    const mainCarryName = p.mainCarry && p.mainCarry.name;
    const augmentOperator = activeAugmentOperators(t, selected);
    const heroMechanic = heroAugmentMechanic(t, selected, opts);
    let operatorBudget = AUGMENT_OPERATOR_TOTAL_CAP;
    if (strengthPrior) evidence.push(`版本数值先验 ${strengthPrior > 0 ? "+" : ""}${strengthPrior}`);

    unitRows.forEach(row => {
      const u = row.name;
      const star = row.star || 0;
      const mult = STAR_SCORE_MULTIPLIERS[star] || 1;
      const routeUnit = unitMap.get(u);
      if (routeUnit) {
        const role = routeUnit.role || (u === mainCarryName ? "mainCarry" : "utility");
        const pts = Math.round(roleUnitWeight(role, w) * (star > 1 ? mult : 1));
        score += pts;
        heldValue += pts;
        breakdown.hero += pts;
        if (role === "mainCarry") {
          evidence.push(`${roleLabel(role)}本体在手：${u}${star ? `（${star}星）` : ""}`);
        } else {
          evidence.push(`${u}${star ? `（${star}星）` : ""}=成型${roleLabel(role)}在手`);
        }
      } else {
        const overlap = unitTraits(u, opts, unitMap).filter(name => activeTraits.has(name));
        if (overlap.length) {
          const pts = w.traitAffinity;
          score += pts;
          heldValue += pts;
          breakdown.synergy += pts;
          const trait = overlap[0];
          const need = activeTraits.get(trait);
          evidence.push(`${u}=${trait}，可作${need}${trait}填充`);
        }
      }
      if (star >= 3 && routeUnit && routeUnit.role === "mainCarry") {
        score += STAR_MILESTONE_BONUS;
        heldValue += STAR_MILESTONE_BONUS;
        breakdown.synergy += STAR_MILESTONE_BONUS;
        evidence.push(`三星${u}=追三完成`);
      }
    });

    const consumedRoleItems = new Set();
    itemRows.filter(row => !COMPONENTS.includes(row.name)).forEach(row => {
      const hits = roleItems.map((item, index) => ({ item, index }))
        .filter(x => x.item.name === row.name && !consumedRoleItems.has(x.index));
      if (!hits.length) return;
      const bestSlot = hits.sort((a, b) => {
        const ah = row.holder && a.item.holder === row.holder ? 1 : 0;
        const bh = row.holder && b.item.holder === row.holder ? 1 : 0;
        return bh - ah || roleItemWeight(b.item.role, w) - roleItemWeight(a.item.role, w);
      })[0];
      consumedRoleItems.add(bestSlot.index);
      const best = bestSlot.item;
      const holderMismatch = row.equipped && row.holder && best.holder && row.holder !== best.holder;
      const pts = Math.round(roleItemWeight(best.role, w) * (holderMismatch ? DECISION_MODEL.incompatibleEquippedItemCostRatio : 1));
      score += pts;
      heldValue += pts;
      breakdown.item += pts;
      evidence.push(`${row.name}${row.holder ? `（${row.holder}携带）` : ""}=命中${roleLabel(best.role)}装备（${best.holder || "路线"}）${holderMismatch ? "，持有者不匹配折算" : ""}`);
    });

    bestCrafts(t, items, w).forEach(row => {
      const owned = selectedCompleted.includes(row.item.name);
      if (owned) return;
      score += row.pts;
      heldValue += row.pts;
      breakdown.item += row.pts;
      evidence.push(row.evidence);
    });

    if (opts && opts.oddsData) {
      const baselineFuture = futureDemandValue(t, selected, opts, w);
      const future = augmentOperator.economy.active
        ? futureDemandValue(t, selected, operatorOddsOpts(opts, augmentOperator), w)
        : baselineFuture;
      futureValue = future.value;
      score += futureValue;
      augmentOperator.economyFutureBonus = Math.max(0, future.value - baselineFuture.value);
      breakdown.future += Math.max(0, futureValue - augmentOperator.economyFutureBonus);
      breakdown.augment += augmentOperator.economyFutureBonus;
      future.evidence.forEach(x => evidence.push(x));
      if (augmentOperator.economy.active) {
        const econ = augmentOperator.economy;
        const optionRaw = augmentOperator.rows.filter(x => x.category === "经济").reduce((sum, x) => sum + x.calibratedLift, 0);
        const optionBonus = Math.max(0, Math.min(operatorBudget, Math.round(optionRaw)));
        operatorBudget -= optionBonus;
        if (optionBonus > 0) {
          score += optionBonus;
          heldValue += optionBonus;
          breakdown.augment += optionBonus;
          augmentOperator.variableBonus += optionBonus;
        }
        const effects = [];
        if (econ.shopLevelOffset) effects.push(`商店概率按等级+${econ.shopLevelOffset}`);
        if (econ.discount) effects.push(`D牌期望成本-${Math.round(econ.discount * 100)}%`);
        if (econ.copyCredit) effects.push(`主C缺口-${econ.copyCredit}张`);
        const line = `经济算子：${econ.names.join("+")}→${effects.join("、") || "可达性边际提升"}${optionBonus ? `，可达期权+${optionBonus}` : ""}`;
        evidence.unshift(line);
        augmentOperator.evidence.push(line);
        augmentOperator.actions.push(line);
      }
      future.lateTargets.forEach(x => missing.push(`后期目标：${x}`));
      future.missing.forEach(x => missing.push(`缺${x.name}${x.need}张约${Math.round(x.expectedGold)}金`));
      const missingItems = roleItems.filter(x => !selectedCompleted.includes(x.name) && !bestCrafts(t, items, w).some(c => c.item.name === x.name));
      if (missingItems.length) missing.push(`关键装：${uniq(missingItems.slice(0, 3).map(x => x.name)).join("、")}`);
    } else {
      const missingUnits = (p.units || []).filter(x => !units.has(x.name)).slice(0, 4).map(x => x.name);
      if (missingUnits.length) missing.push(`后续关键牌：${missingUnits.join("、")}`);
    }

    if (selectedComponents.length >= 2) {
      const direction = componentDirection(items);
      const tDirection = routeDirection(t);
      if (direction && tDirection === direction) {
        const bonus = Math.max(1, Math.round((heldValue + futureValue) * COMPONENT_DIRECTION_BONUS));
        score += bonus;
        heldValue += bonus;
        breakdown.synergy += bonus;
        const label = /源计划|枪手/.test(`${t.name}${t.family}`) ? "源计划/枪手系" : (t.family || t.name);
        evidence.unshift(`散件方向：${direction}→${label}`);
      }
    }

    augments.forEach(h => {
      if ((t.augmentPrefs || []).includes(h)) {
        score += w.augment; heldValue += w.augment; breakdown.augment += w.augment; evidence.push(`${h} 命中推荐符文`);
      }
    });

    const heroRoleContract = heroAugmentRoleContract(t, selected);
    if (heroRoleContract) {
      const alreadyCounted = (t.augmentPrefs || []).includes(heroRoleContract.chosen.name) ? w.augment : 0;
      const contractValue = heroAugmentRoleContractValue(w);
      const bonus = Math.max(0, contractValue - alreadyCounted);
      score += bonus;
      heldValue += bonus;
      breakdown.augment += bonus;
      evidence.unshift(`英雄强化定核：${heroRoleContract.chosen.name}→主C${heroRoleContract.mainCarry}（角色契约${contractValue}分）`);
    }

    if (heroMechanic) {
      score += heroMechanic.bonus;
      heldValue += heroMechanic.bonus;
      breakdown.augment += heroMechanic.bonus;
      evidence.unshift(heroMechanic.text);
    }

    augmentOperator.rows.filter(x => x.category !== "经济").forEach(op => {
      let rawBonus = 0;
      let line = "";
      if (op.category === "战力") {
        const combatAssets = breakdown.hero + breakdown.item + breakdown.synergy;
        const readiness = combatAssets / Math.max(1, combatAssets + futureValue + 30);
        rawBonus = op.calibratedLift * (AUGMENT_COMBAT_READY_FLOOR + (1 - AUGMENT_COMBAT_READY_FLOOR) * readiness);
        line = `战力算子：${op.name}→已握战力×${roundNumber(AUGMENT_COMBAT_READY_FLOOR + (1 - AUGMENT_COMBAT_READY_FLOOR) * readiness, 2)}`;
      } else if (op.category === "装备") {
        const missingMainItems = uniq(roleItems.filter(x => x.role === "mainCarry" && !selectedCompleted.includes(x.name)).map(x => x.name)).length;
        rawBonus = Math.min(AUGMENT_ITEM_BONUS_CAP, op.calibratedLift * Math.min(AUGMENT_ITEM_MISSING_CAP, missingMainItems) / AUGMENT_ITEM_MISSING_CAP);
        line = `装备算子：${op.name}→补偿${Math.min(AUGMENT_ITEM_MISSING_CAP, missingMainItems)}件主C装缺口`;
      }
      const bonus = Math.max(0, Math.min(operatorBudget, Math.round(rawBonus)));
      operatorBudget -= bonus;
      if (bonus > 0) {
        score += bonus;
        heldValue += bonus;
        breakdown.augment += bonus;
        augmentOperator.variableBonus += bonus;
        const evidenceLine = `${line}，认证边际+${bonus}`;
        evidence.unshift(evidenceLine);
        augmentOperator.evidence.push(evidenceLine);
        augmentOperator.actions.push(evidenceLine);
      }
    });
    augCats.forEach(c => {
      if ((t.augmentCats || []).includes(c)) {
        score += w.augmentSignal; heldValue += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`);
      }
    });

    if (t.mechanic) {
      const requiredAugment = t.mechanic.requiredAugment;
      const requiredUnits = t.mechanic.requiredUnits || [];
      const active = (!requiredAugment || augments.has(requiredAugment)) && requiredUnits.every(name => units.has(name));
      if (active) {
        const bonus = Number(t.mechanic.matchBonus) || 0;
        score += bonus;
        heldValue += bonus;
        breakdown.synergy += bonus;
        evidence.unshift(`机制闭环：${t.mechanic.text}`);
      } else {
        mechanicBlocked = true;
        const penalty = Number(t.mechanic.missingPenalty) || 0;
        score -= penalty;
        breakdown.penalty -= penalty;
        penalties.push(`缺机制门槛：${requiredAugment || requiredUnits.join("、")}`);
      }
    }

    if (traits.length) {
      traits.forEach(sig => {
        const have = activeTraits.get(sig.name) || 0;
        if (have >= sig.count) {
          const pts = w.trait || fallbackWeights.trait;
          score += pts;
          heldValue += pts;
          breakdown.trait += pts;
          evidence.push(`${sig.count}${sig.name} 命中激活羁绊`);
        } else {
          missing.push(`路线未激活${sig.count}${sig.name}`);
        }
      });
    }

    const primeRule = primePlanRule(t, selected);
    if (primeRule) {
      score += PRIME_PLAN_MATCH_BONUS;
      heldValue += PRIME_PLAN_MATCH_BONUS;
      breakdown.synergy += PRIME_PLAN_MATCH_BONUS;
      evidence.push(`至尊计划：${primeRule.text || primeRule.holder}`);
    }

    const heroAugment = heroAugmentDecision(t, selected);
    if (heroAugment) {
      if (heroAugment.scoreDelta > 0) {
        score += heroAugment.scoreDelta;
        futureValue += heroAugment.scoreDelta;
        breakdown.future += heroAugment.scoreDelta;
        evidence.unshift(`英雄强化期权：${heroAugment.text}`);
      } else if (heroAugment.scoreDelta < 0) {
        score += heroAugment.scoreDelta;
        breakdown.penalty += heroAugment.scoreDelta;
        penalties.unshift(heroAugment.text);
      }
      if (heroAugment.hardBlock) {
        mechanicBlocked = true;
        penalties.unshift(heroAugment.text);
      }
    }

    if (!items.length) missing.push("还没选择装备，路线暂按来牌判断");
    if (!augments.size && !augCats.size) missing.push("还没选择符文，符文权重未生效");

    const signalTotal = breakdown.hero + breakdown.item + breakdown.augment + breakdown.synergy + breakdown.future + (breakdown.trait || 0);
    const shares = signalTotal > 0 ? {
      hero: Math.round(breakdown.hero / signalTotal * 100),
      item: Math.round(breakdown.item / signalTotal * 100),
      augment: Math.round(breakdown.augment / signalTotal * 100),
      synergy: Math.round(breakdown.synergy / signalTotal * 100),
      future: Math.round(breakdown.future / signalTotal * 100),
    } : { hero: 0, item: 0, augment: 0, synergy: 0 };
    if (traits.length) shares.trait = signalTotal > 0 ? Math.round((breakdown.trait || 0) / signalTotal * 100) : 0;

    return {
      stageStrength: mechanicBlocked ? 0 : Math.max(0, Math.round(score)),
      heldValue: Math.max(0, Math.round(heldValue)),
      futureValue: Math.max(0, Math.round(futureValue)),
      breakdown,
      shares,
      evidence: uniq(evidence).slice(0, 6),
      missing: uniq(missing).slice(0, 4),
      penalties: uniq(penalties).slice(0, 4),
      mechanicBlocked,
      augmentOperator,
      heroAugment,
      heroMechanic,
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function roundNumber(n, digits = 1) {
    const p = 10 ** digits;
    return Math.round(Number(n || 0) * p) / p;
  }

  function unitPrice(name, opts) {
    const map = opts && opts.unitPrices;
    return Number(map && map[name]) || 3;
  }

  function ownedCopyMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(u => map.set(u.name, unitCopies(u.star)));
    Object.entries(selected.unitCopies || {}).forEach(([name, copies]) => {
      map.set(name, Math.max(map.get(name) || 0, Number(copies) || 0));
    });
    return map;
  }

  function reachabilityUnits(t) {
    return uniq((profile(t).units || []).map(x => x.name)).filter(Boolean);
  }

  function targetCopiesFor(t, name, cost) {
    const row = (profile(t).units || []).find(x => x && x.name === name);
    const starTarget = row && Number(row.starTarget) || (name === (profile(t).mainCarry || {}).name ? (cost <= 3 ? 3 : 2) : 1);
    if (starTarget >= 3) return 9;
    if (starTarget === 2) return 3;
    return 1;
  }

  function expectedCostForUnit(name, targetCopies, selected, opts) {
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const economy = opts && opts.augmentEconomy || {};
    const effectiveLevel = clamp(level + (Number(economy.shopLevelOffset) || 0), MIN_LEVEL, MAX_LEVEL);
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const copyCredit = economy.copyTarget === name ? Number(economy.copyCredit) || 0 : 0;
    const need = Math.max(0, targetCopies - owned - copyCredit);
    const odds = ((shopOdds[effectiveLevel] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
    if (need <= 0 || odds <= 0) {
      return {
        name,
        cost,
        owned,
        need,
        targetCopies,
        oddsPct: Math.round(odds * 100),
        expectedGold: 0,
        available: odds > 0,
        effectiveLevel,
      };
    }
    const count = Number(unitCounts[cost]) || 1;
    const pool = Number(poolCopies[cost]) || 1;
    const remainingFactor = clamp((pool - owned) / pool, 0.05, 1);
    const pSlot = odds / count * remainingFactor;
    const baseExpectedGold = (need / (5 * pSlot)) * 2;
    const expectedGold = baseExpectedGold * clamp(Number(economy.goldMultiplier) || 1, 0.5, 1);
    return {
      name,
      cost,
      owned,
      need,
      targetCopies,
      oddsPct: Math.round(odds * 100),
      expectedGold,
      baseExpectedGold,
      available: true,
      effectiveLevel,
    };
  }

  function futureUnitBaseValue(t, unit, w) {
    if (!unit) return w.futureCoreUnit;
    if (unit.role === "mainCarry") return w.futureMainCarryUnit;
    return w.futureCoreUnit;
  }

  function discountedValue(baseValue, expectedGold) {
    return Math.round(baseValue * clamp(1 - expectedGold / FUTURE_VALUE_GOLD_CAP, 0, 1));
  }

  function futureDemandValue(t, selected, opts, w) {
    const selectedUnitNames = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const selectedItems = new Set(normalizeSelectedItems(selected).map(x => x.name));
    const p = profile(t);
    const rows = [];
    const lateTargets = [];
    const evidence = [];
    let value = 0;
    (p.units || []).forEach(unit => {
      if (!unit || !unit.name) return;
      const cost = unitPrice(unit.name, opts);
      const target = targetCopiesFor(t, unit.name, cost);
      const row = expectedCostForUnit(unit.name, target, selected, opts);
      if (row.need <= 0) return;
      if (!row.available) {
        lateTargets.push(unit.name);
        return;
      }
      // 已握棋子仍要进入缺口/概率计算，但不把“未来还要D到的同一张牌”再次当作强度资产加分。
      if (selectedUnitNames.has(unit.name)) {
        rows.push(row);
        return;
      }
      const base = futureUnitBaseValue(t, unit, w);
      const pts = discountedValue(base, row.expectedGold);
      if (pts > 0) {
        value += pts;
        evidence.push(`缺${roleLabel(unit.role)}${unit.name}${row.need}张折现+${pts}（约${Math.round(row.expectedGold)}金）`);
      }
      rows.push(row);
    });
    const missingCoreItems = profileItems(t).filter(item => item.role === "mainCarry" && !selectedItems.has(item.name));
    const itemValue = Math.round(Math.min(3, uniq(missingCoreItems.map(x => x.name)).length) * w.futureItem * FUTURE_ITEM_VALUE_RATIO);
    if (itemValue > 0) {
      value += itemValue;
      evidence.push(`未持有主C关键装折现+${itemValue}`);
    }
    return {
      value,
      missing: rows,
      lateTargets: uniq(lateTargets),
      evidence,
    };
  }

  function reachabilityForTemplate(t, selected, opts) {
    if (!opts || !opts.oddsData) return null;
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const rawTargets = reachabilityUnits(t).map(name => {
      const cost = unitPrice(name, opts);
      return expectedCostForUnit(name, targetCopiesFor(t, name, cost), selected, opts);
    });
    const targets = rawTargets.filter(x => x.need > 0 && x.available);
    const lateTargets = rawTargets.filter(x => x.need > 0 && !x.available).map(x => x.name);
    const expectedGold = targets.reduce((sum, x) => sum + x.expectedGold, 0);
    const summary = targets.length
      ? targets.map(x => `缺${x.name}${x.need}张约${Math.round(x.expectedGold)}金`).join("、") + `；合计约${Math.round(expectedGold)}金`
      : "当前可刷缺口已见，约0金";
    return {
      level,
      missing: targets,
      lateTargets: uniq(lateTargets),
      expectedGold: Math.round(expectedGold),
      coefficient: 1,
      summary,
    };
  }

  function teamSearchScore(t) {
    if (Number.isFinite(Number(t.teamScore))) return Number(t.teamScore);
    if (Number.isFinite(Number(t.sortID))) return Number(t.sortID);
    const q = t.quality === "S" ? 300 : t.quality === "A" ? 200 : 100;
    return q + (t.source === "research" ? 20 : 0) + ((t.coreUnits || []).length || 0);
  }

  function rowId(row) {
    return row && row.template && (row.template.id || row.template.name);
  }

  function rowSortScore(row) {
    return Number.isFinite(Number(row.finalScore)) ? Number(row.finalScore) : Number(row.stageStrength);
  }

  function applyVirtualBattle(rows, opts) {
    if (opts && opts.virtualBattle === false) return rows;
    rows.forEach(row => {
      const battle = row.template && row.template.virtualBattle;
      if (!battle || row.mechanicBlocked) return;
      const coverage = clamp(Number(battle.coverage) || 0, 0, 100) / 100;
      const robust = clamp(Number(battle.robustScore) || VIRTUAL_BATTLE_CENTER, 0, 100);
      const raw = VIRTUAL_BATTLE_PRIOR_CAP * Math.tanh((robust - VIRTUAL_BATTLE_CENTER) / VIRTUAL_BATTLE_SCALE);
      const prior = Math.round(raw * coverage);
      row.preSimulationScore = row.finalScore;
      row.virtualBattlePrior = prior;
      row.finalScore = Math.max(0, Math.round(row.finalScore + prior));
      row.virtualBattle = battle;
      row.virtualDecision = {
        battles: Number(battle.battles) || 0,
        winRate: Number(battle.winRate) || 0,
        cvar10: Number(battle.cvar10) || 0,
        interval90: battle.interval90 || [],
        robustScore: robust,
        coverage: Math.round(coverage * 1000) / 10,
        priorPoints: prior,
        unsupported: battle.unsupported || [],
      };
      row.evidence = uniq([`虚拟实战${prior >= 0 ? "+" : ""}${prior}（${battle.battles}场，胜率${battle.winRate}%，CVaR ${battle.cvar10}，覆盖${battle.coverage}%）`, ...(row.evidence || [])]).slice(0, 6);
    });
    return rows;
  }

  function routeMainCarry(t) {
    return (t && t.routeProfile && t.routeProfile.mainCarry && t.routeProfile.mainCarry.name)
      || (t && t.carryUnits && t.carryUnits[0])
      || "";
  }

  function routeUnitNames(t) {
    return uniq([
      ...((t && t.earlyUnits) || []),
      ...((t && t.midUnits) || []),
      ...((t && t.coreUnits) || []),
      ...(((t && t.routeProfile && t.routeProfile.units) || []).map(x => x && x.name)),
    ]);
  }

  function strategyConditionMet(when, selected) {
    if (!when) return true;
    const units = selectedUnitMap(selected || {});
    const level = clamp(Number(selected && selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    if (Number(when.levelGte) && level < Number(when.levelGte)) return false;
    if (Number(when.levelLte) && level > Number(when.levelLte)) return false;
    if (when.hasUnit && !units.has(when.hasUnit)) return false;
    if ((when.hasUnits || []).some(name => !units.has(name))) return false;
    if (when.unit) {
      const star = units.has(when.unit) ? (units.get(when.unit) || 1) : 0;
      if (!star || (Number(when.starGte) && star < Number(when.starGte))) return false;
    }
    return true;
  }

  function strategyDecisionForTemplate(template, selected) {
    const plan = template && template.augmentTransitionPlan;
    const chosen = selected && selected.heroAugment && selected.heroAugment.selected;
    if (!plan || !chosen || chosen.name !== plan.augment) return null;
    const rule = (plan.holderRules || []).find(row => strategyConditionMet(row.when, selected)) || null;
    const proposedHolder = rule && rule.holder || plan.currentHolder || plan.strategicCarry;
    const holder = rule && rule.certified ? proposedHolder : (plan.currentHolder || plan.baselineCarry || proposedHolder);
    const switchCertified = Boolean(rule && rule.certified && holder === plan.strategicCarry);
    const handoffState = Boolean(rule && (rule.inference === "handoff" || rule.stageKey === "handoff"));
    const embeddedInference = rule && rule.inference && typeof rule.inference === "object" ? rule.inference : null;
    const inference = embeddedInference || (handoffState ? plan.handoffInference : plan.currentInference) || null;
    const lcb = Number(inference && inference.lcb95);
    const unit = plan.handoff && plan.handoff.unit || plan.strategicCarry;
    const star = plan.handoff && plan.handoff.starGte || 2;
    return {
      augment: plan.augment,
      source: plan.source,
      experiment: plan.experiment,
      baselineCarry: rule && rule.fromCarry || plan.baselineCarry,
      strategicCarry: plan.strategicCarry,
      currentHolder: holder,
      switchCertified,
      handoffState,
      handoffCertified: Boolean(plan.handoffCertified || plan.certified),
      handoff: plan.handoff,
      handoffText: plan.handoffText,
      terminalText: plan.terminalText,
      totalBattles: Number(plan.totalBattles || plan.evidenceCount) || 0,
      evidenceCount: Number(plan.evidenceCount || plan.totalBattles) || 0,
      evidenceUnit: plan.evidenceUnit || "条模型证据",
      stageKey: rule && rule.stageKey || "",
      modelCoverage: plan.modelCoverage || null,
      sampleCount: Number(inference && inference.sampleCount) || 0,
      lcb95: Number.isFinite(lcb) ? lcb : 0,
      meanDelta: Number(inference && inference.meanDelta) || 0,
      text: rule && rule.text
        ? `${switchCertified ? `模型认证转${plan.strategicCarry}` : `模型维持${holder}`}：${rule.text}`
        : switchCertified && handoffState
        ? `模型认证转${plan.strategicCarry}：${unit}${star}星优势扩大（LCB ${Number.isFinite(lcb) ? lcb : 0}）`
        : switchCertified
        ? `模型认证立即转${plan.strategicCarry}：${plan.augment}已达换核门槛（LCB ${Number.isFinite(lcb) ? lcb : 0}）`
        : `模型等交接：当前${holder}代持；${unit}${star}星后转${plan.strategicCarry}（认证LCB ${Number(plan.handoffInference && plan.handoffInference.lcb95) || 0}）`,
    };
  }

  function stageUnitSet(template, level) {
    const source = level <= 5 ? template.earlyUnits : level === 6 ? template.midUnits : template.coreUnits;
    return new Set((source || []).filter(Boolean));
  }

  function currentBoardEvaluation(template, selected, weights) {
    const w = { ...fallbackWeights, ...(weights || {}) };
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    const capacity = Math.max(1, level);
    const stageUnits = stageUnitSet(template, level);
    const unitMap = profileUnitMap(template);
    const unitValues = normalizeSelectedUnits(selected.units || []).map(unit => {
      const routeUnit = unitMap.get(unit.name);
      const inStage = stageUnits.has(unit.name);
      if (!inStage && !routeUnit) return null;
      const role = routeUnit && routeUnit.role || "utility";
      const base = roleUnitWeight(role, w);
      const readiness = inStage ? 1 : DECISION_MODEL.offStageReadiness;
      const location = unit.location === "board" ? 1
        : unit.location === "bench" ? DECISION_MODEL.benchReadiness
        : DECISION_MODEL.unknownLocationReadiness;
      return {
        name: unit.name,
        star: unit.star || 0,
        value: Math.round(base * (STAR_SCORE_MULTIPLIERS[unit.star] || 1) * readiness * location),
      };
    }).filter(Boolean).sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name), "zh-Hans-CN")).slice(0, capacity);
    let score = unitValues.reduce((sum, row) => sum + row.value, 0);
    const roleItems = profileItems(template);
    normalizeSelectedItems(selected).forEach(item => {
      const hit = roleItems.find(row => row.name === item.name && (!item.holder || row.holder === item.holder));
      if (!hit) return;
      const readiness = item.equipped ? 1 : DECISION_MODEL.unassignedItemReadiness;
      score += Math.round(roleItemWeight(hit.role, w) * readiness);
    });
    return {
      score: Math.max(0, score),
      units: unitValues.map(row => starLabel(row.name, row.star)),
    };
  }

  function currentBoardScore(template, selected, weights) {
    return currentBoardEvaluation(template, selected, weights).score;
  }

  function commitmentEvidence(template, row, selected, weights, opts) {
    const w = { ...fallbackWeights, ...(weights || {}) };
    const unitMap = profileUnitMap(template);
    const mainCarry = routeMainCarry(template);
    const evidence = [];
    let points = 0;
    normalizeSelectedUnits(selected.units || []).forEach(unit => {
      const routeUnit = unitMap.get(unit.name);
      if (!routeUnit || unit.star < 2) return;
      const cost = unitPrice(unit.name, opts || {});
      const target = targetCopiesFor(template, unit.name, cost);
      const progress = clamp(unitCopies(unit.star) / Math.max(1, target), 0, 1);
      const role = routeUnit.role || (unit.name === mainCarry ? "mainCarry" : "utility");
      const factor = role === "mainCarry" ? 1 : DECISION_MODEL.nonCarryUpgradeEvidence;
      const value = Math.max(1, Math.round(roleUnitWeight(role, w) * progress * factor));
      points += value;
      evidence.push(`${unit.name}${unit.star}星核心进度+${value}`);
    });
    const routeItems = profileItems(template);
    normalizeSelectedItems(selected).forEach(item => {
      if (!item.equipped || !item.holder) return;
      const hit = routeItems.find(row => row.name === item.name && row.holder === item.holder);
      if (!hit) return;
      const value = roleItemWeight(hit.role, w);
      points += value;
      evidence.push(`${item.holder}已装备${item.name}+${value}`);
    });
    const chosen = selected.heroAugment && selected.heroAugment.selected;
    const heroRoleContract = heroAugmentRoleContract(template, selected);
    const chosenFits = chosen && (heroRoleContract
      || (template.augmentPrefs || []).includes(chosen.name)
      || (template.mechanic && template.mechanic.requiredAugment === chosen.name)
      || (template.augmentTransitionPlan && template.augmentTransitionPlan.augment === chosen.name));
    if (chosenFits) {
      const value = heroRoleContract ? heroAugmentRoleContractValue(w) : w.augment;
      points += value;
      evidence.push(`英雄强化${chosen.name}已落地${heroRoleContract ? `并确定主C${heroRoleContract.mainCarry}` : ""}+${value}`);
    }
    if (row.strategyDecision && row.strategyDecision.switchCertified && chosenFits) {
      points += w.augment;
      evidence.push(`条件化实验认证转核+${w.augment}`);
    }
    (selected.commitments || []).forEach(event => {
      if (event.type !== "d-spend" || !event.targetUnit) return;
      if (!unitMap.has(event.targetUnit) && event.targetUnit !== mainCarry) return;
      const value = Math.max(0, Number(event.gold) || 0);
      points += value;
      evidence.push(`已为${event.targetUnit}D牌${value}金`);
    });
    return { points: Math.round(points), evidence };
  }

  function transitionCostFromAssets(template, selected, weights, opts) {
    const w = { ...fallbackWeights, ...(weights || {}) };
    const routeUnits = new Set(routeUnitNames(template));
    const routeItems = profileItems(template);
    const costs = [];
    let points = 0;
    normalizeSelectedUnits(selected.units || []).forEach(unit => {
      if (unit.star < 2 || routeUnits.has(unit.name)) return;
      const price = unitPrice(unit.name, opts || {});
      const value = Math.round(price * unitCopies(unit.star) * DECISION_MODEL.incompatibleUpgradeCostRatio);
      if (!value) return;
      points += value;
      costs.push(`${unit.name}${unit.star}星沉没${value}`);
    });
    normalizeSelectedItems(selected).forEach(item => {
      if (!item.equipped || !item.holder) return;
      const compatible = routeItems.some(row => row.name === item.name && row.holder === item.holder);
      if (compatible) return;
      const value = Math.max(1, Math.round(w.routeItem * DECISION_MODEL.incompatibleEquippedItemCostRatio));
      points += value;
      costs.push(`${item.holder}已锁${item.name}${value}`);
    });
    (selected.commitments || []).forEach(event => {
      if (event.type !== "d-spend" || !event.targetUnit || routeUnits.has(event.targetUnit)) return;
      const value = Math.max(0, Number(event.gold) || 0);
      points += value;
      costs.push(`已为${event.targetUnit}D牌${value}金`);
    });
    return { points: Math.round(points), costs };
  }

  function applyDeterministicDecision(rows, selected, weights, opts) {
    if (!rows.length) return { status: "empty", text: "暂无路线" };
    const level = clamp(Number(selected.level) || DEFAULT_LEVEL, MIN_LEVEL, MAX_LEVEL);
    rows.forEach(row => {
      row.currentBoard = false;
      row.strategicLeader = false;
      row.committed = false;
      row.currentBoardEvaluation = currentBoardEvaluation(row.template, selected, weights);
      row.currentBoardScore = row.currentBoardEvaluation.score;
    });
    const current = [...rows].sort((a, b) => b.currentBoardScore - a.currentBoardScore
      || rowSortScore(b) - rowSortScore(a)
      || teamSearchScore(b.template) - teamSearchScore(a.template)
      || String(a.template.name).localeCompare(String(b.template.name), "zh-Hans-CN"))[0];
    const strategic = rows[0];
    const leaderScore = rowSortScore(strategic);
    rows.forEach(row => {
      const evidence = commitmentEvidence(row.template, row, selected, weights, opts);
      const cost = transitionCostFromAssets(row.template, selected, weights, opts);
      const strategicGap = Math.max(0, leaderScore - rowSortScore(row));
      const support = evidence.points - cost.points - strategicGap;
      row.commitment = {
        evidence: evidence.points,
        evidenceRows: evidence.evidence,
        transitionCost: cost.points,
        costRows: cost.costs,
        strategicGap,
        support,
        utility: rowSortScore(row) + evidence.points - cost.points,
        formula: `承诺净值=${rowSortScore(row)}+不可逆${evidence.points}-转型${cost.points}=${rowSortScore(row) + evidence.points - cost.points}`,
      };
    });
    const manual = opts && opts.manualLockId ? rows.find(row => rowId(row) === opts.manualLockId) : null;
    // 抗脆弱结果已进入finalScore，不再二次硬否决；定线只看不可逆证据能否覆盖真实沉没成本与战略差距。
    const eligible = rows.filter(row => row.commitment.evidence >= DECISION_MODEL.minimumCommitmentEvidence && row.commitment.support > 0)
      .sort((a, b) => b.commitment.utility - a.commitment.utility
        || rowSortScore(b) - rowSortScore(a)
        || String(a.template.name).localeCompare(String(b.template.name), "zh-Hans-CN"));
    let committed = null;
    let status = "observing";
    let text = "未出现足以覆盖转型成本的不可逆证据，暂不定线";
    if (level <= DECISION_MODEL.earlyObserveMaxLevel) {
      text = `${level}级观察期：只给当前战力和战略候选，不锁终局`;
    } else if (manual) {
      committed = manual;
      status = "manual";
      text = `手动锁定：${manual.template.name}`;
    } else if (eligible.length) {
      committed = eligible[0];
      status = "committed";
      text = `模型定线：${committed.template.name}；${committed.commitment.formula}`;
    }
    current.currentBoard = true;
    strategic.strategicLeader = true;
    if (committed) committed.committed = true;
    const decision = {
      status,
      level,
      currentBoardId: rowId(current),
      currentBoardName: current.template.name,
      currentBoardScore: current.currentBoardScore,
      currentBoardUnits: current.currentBoardEvaluation.units,
      strategicId: rowId(strategic),
      strategicName: strategic.template.name,
      committedId: committed ? rowId(committed) : "",
      committedName: committed ? committed.template.name : "",
      executionId: rowId(committed || current),
      text,
    };
    rows.forEach(row => { row.decision = decision; });
    return decision;
  }

  function operationalRow(rows) {
    return (rows || []).find(row => row && row.committed)
      || (rows || []).find(row => row && row.currentBoard)
      || ((rows || [])[0] || null);
  }

  function rank(templates, selected, weights, limit, opts) {
    selected = resolveGameState(selected, opts && opts.heroAugments);
    const rows = (templates || []).map(t => {
      const stageResult = scoreTemplate(t, selected, weights, opts);
      const base = { template: t, ...stageResult };
      base.strategyDecision = strategyDecisionForTemplate(t, selected);
      base.finalScore = base.stageStrength;
      const reachability = reachabilityForTemplate(t, selected, operatorOddsOpts(opts, stageResult.augmentOperator));
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = base.stageStrength;
      }
      if (opts && opts.antiFragile) {
        base.antiFragile = analyzeAntiFragility(t, selected, stageResult, operatorOddsOpts(opts, stageResult.augmentOperator), weights, templates || []);
        base.finalScore = base.antiFragile.score;
      }
      return base;
    });
    applyVirtualBattle(rows, opts);
    rows.sort((a, b) => {
      const delta = rowSortScore(b) - rowSortScore(a);
      if (delta) return delta;
      const teamDelta = teamSearchScore(b.template) - teamSearchScore(a.template);
      if (teamDelta) return teamDelta;
      return String(a.template.name).localeCompare(String(b.template.name), "zh-Hans-CN");
    });
    if (!opts) return rows.slice(0, limit || 5);
    const decision = opts.operationalCommitment ? applyDeterministicDecision(rows, selected, weights, opts) : null;
    const maxRows = limit || 5;
    const visible = rows.slice(0, maxRows);
    if (decision) {
      const required = rows.filter(row => row.currentBoard || row.committed);
      required.forEach(row => {
        if (visible.includes(row)) return;
        const replaceAt = Math.max(3, visible.length - 1);
        visible[replaceAt] = row;
      });
      visible.decision = decision;
    }
    return visible;
  }

  function confidence(score) {
    if (score >= 85) return "高";
    if (score >= 60) return "中高";
    if (score >= 40) return "中";
    return "低";
  }

  function buildOutput(ranked, selected) {
    if (!ranked || !ranked.length) return "输入棋子、装备、符文后，这里会输出可复制的路线结论。";
    const signals = [
      ...normalizeSelectedUnits(selected.units || []).map(x => starLabel(x.name, x.star)),
      ...(selected.items || []),
      ...(selected.augmentCats || []),
      ...(selected.augments || []),
      ...(selected.traits || []).map(x => x.label || `${x.count}${x.name}`),
      selected.level ? `等级${selected.level}` : "",
      normalizeHeroAugmentRound(selected.heroAugmentRound) !== "unknown" ? `英雄强化${normalizeHeroAugmentRound(selected.heroAugmentRound)}` : "",
    ].filter(Boolean).join("、") || "无";
    const top = ranked[0];
    const t = top.template;
    const topScore = rowSortScore(top);
    const backups = ranked.slice(1, 4).map(r => `${r.template.name}(${rowSortScore(r)}分)`).join(" / ") || "无";
    return [
      `信号：${signals}`,
      `首选：${t.name}（${topScore}分，现场匹配${confidence(topScore)}）`,
      `权重：英雄${top.shares?.hero || 0}% / 装备${top.shares?.item || 0}% / 符文${top.shares?.augment || 0}%${top.breakdown?.traitSignals ? ` / 羁绊${top.shares?.trait || 0}%` : ""}`,
      `拆分：已握资产${top.heldValue || 0}分 + 概率折现${top.futureValue || 0}分 = ${top.finalScore}分`,
      top.virtualDecision ? `虚拟实战：${top.virtualDecision.battles}场，胜率${top.virtualDecision.winRate}%，CVaR ${top.virtualDecision.cvar10}，覆盖${top.virtualDecision.coverage}%，蒸馏${top.virtualDecision.priorPoints >= 0 ? "+" : ""}${top.virtualDecision.priorPoints}分` : "",
      `路线：${(t.route || []).join(" -> ")}`,
      `留牌：${(t.actions.keep || []).slice(0, 8).join("、")}`,
      `装备：${t.actions.item || "-"}`,
      `判断：${t.actions.checkpoint || "-"}`,
      `止损：${t.actions.stopLoss || "-"}`,
      `备选：${backups}`,
    ].filter(Boolean).join("\n");
  }

  function signalTowerHtml(r) {
    const s = r.shares || {};
    const b = r.breakdown || {};
    const rows = [
      ["hero", "英雄", s.hero || 0, b.hero || 0],
      ["item", "装备", s.item || 0, b.item || 0],
      ["aug", "符文", s.augment || 0, b.augment || 0],
    ];
    if (b.future) rows.push(["future", "折现", s.future || 0, b.future || 0]);
    if (b.traitSignals) rows.push(["trait", "羁绊", s.trait || 0, b.trait || 0]);
    return `<div class="s2SignalTower">${rows.map(([cls, label, pct, pts]) => `
      <div class="s2Signal ${cls}">
        <div class="lb"><span>${label}</span><span>${pct}% · ${pts}分</span></div>
        <div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      </div>`).join("")}</div>`;
  }

  function selectedFromSignals(signals) {
    const selected = { units: [], items: [], itemRows: [], augments: [], augmentCats: [], traits: [], commitments: [], level: null };
    (signals || []).forEach(s => {
      if (!s) return;
      const kind = s.kind || s.type;
      const value = s.value || s.name || s.label;
      if (kind === "levels") {
        selected.level = Number(s.level || value) || selected.level;
        return;
      }
      if (kind === "traits") {
        const parsed = normalizeSelectedTraits([s])[0];
        if (parsed && !selected.traits.some(x => x.name === parsed.name && x.count === parsed.count)) selected.traits.push(parsed);
        return;
      }
      if (kind === "units" && value) {
        const prev = selected.units.find(x => x.name === value || x.value === value);
        const star = Number(s.star) || 0;
        const location = s.location || "unknown";
        if (prev) {
          if (star > (Number(prev.star) || 0)) {
            prev.star = star;
            prev.label = starLabel(value, star);
          }
          if (location === "board" || (location === "bench" && prev.location !== "board")) prev.location = location;
        } else {
          selected.units.push({ name: value, value, star, location, label: starLabel(value, star) });
        }
        return;
      }
      if (kind === "items" && value) {
        const count = Math.max(1, Math.min(9, Number(s.count) || 1));
        for (let i = 0; i < count; i++) {
          selected.items.push(value);
          selected.itemRows.push({ name: value, value, holder: s.holder || "", equipped: Boolean(s.equipped || s.holder), source: s.source || "" });
        }
        return;
      }
      if (kind === "commitments") {
        selected.commitments.push({
          type: s.commitmentType || s.type || "event",
          targetUnit: s.targetUnit || "",
          gold: Math.max(0, Number(s.gold) || 0),
          label: s.label || value || "不可逆事件",
        });
        return;
      }
      if (selected[kind] && value && !selected[kind].includes(value)) selected[kind].push(value);
    });
    return selected;
  }

  // 归约层只读取原始信号；它每次重新构造派生状态，因此删除、纠正和重复口述都不会留下增量残影。
  function resolveGameState(input, heroAugments) {
    if (input && input.stateResolved) return input;
    const selected = input || {};
    const units = normalizeSelectedUnits(selected.units || []).map(row => ({
      name: row.name,
      value: row.name,
      star: row.star || 0,
      location: row.location || "unknown",
      label: starLabel(row.name, row.star),
    }));
    const itemRows = normalizeSelectedItems(selected);
    const unitCopiesMap = {};
    normalizeSelectedUnits(units).forEach(row => { unitCopiesMap[row.name] = unitCopies(row.star); });
    const augments = uniq(selected.augments || []);
    const catalog = new Map((heroAugments || []).filter(Boolean).map(row => [row.name, row]));
    const selectedHeroes = augments.map(name => catalog.get(name)).filter(Boolean);
    // 同一局只能落一个英雄强化。发生口述修正而解析器尚未移除旧值时，最后一个有效输入胜出并留下审计记录。
    const chosen = selectedHeroes.length ? selectedHeroes[selectedHeroes.length - 1] : null;
    const derivedAssets = [];
    const auditTrail = [];
    const heroAugment = chosen ? {
      status: "resolved",
      round: normalizeHeroAugmentRound(selected.heroAugmentRound),
      selected: chosen,
      alternativesClosed: true,
      conflict: selectedHeroes.length > 1,
    } : {
      status: "waiting",
      round: normalizeHeroAugmentRound(selected.heroAugmentRound),
      selected: null,
      alternativesClosed: false,
      conflict: false,
    };
    if (chosen) {
      auditTrail.push(`${heroAugment.round === "unknown" ? "英雄强化" : heroAugment.round + "英雄强化"}已结算：${chosen.name}`);
      const effect = chosen.effect || {};
      const grantedHero = effect.grantedHero || chosen.hero;
      const grantedCopies = Number(effect.grantedCopies) || 0;
      if (grantedHero && grantedCopies > 0) {
        const wasHeld = Object.prototype.hasOwnProperty.call(unitCopiesMap, grantedHero);
        unitCopiesMap[grantedHero] = (unitCopiesMap[grantedHero] || 0) + grantedCopies;
        if (!wasHeld) units.push({ name: grantedHero, value: grantedHero, star: 0, location: "unknown", label: grantedHero });
        derivedAssets.push({ kind: "units", value: grantedHero, copies: grantedCopies, source: chosen.name, label: `${grantedHero}+${grantedCopies}（${chosen.name}）` });
        auditTrail.push(`赠送资产：${grantedHero}+${grantedCopies}`);
      }
      if (effect.stunSeconds || effect.areaExpanded) {
        auditTrail.push(`${chosen.name}机制：${effect.areaExpanded ? "范围扩大" : ""}${effect.stunSeconds ? `${effect.areaExpanded ? "、" : ""}群体眩晕${effect.stunSeconds}秒` : ""}`);
      }
      if (heroAugment.conflict) auditTrail.push(`检测到多个英雄强化，按最后输入的${chosen.name}结算`);
    }
    return {
      ...selected,
      units,
      items: itemRows.map(x => x.name),
      itemRows,
      unitCopies: unitCopiesMap,
      commitments: [...(selected.commitments || [])],
      augments,
      derivedAssets,
      auditTrail,
      heroAugment,
      stateResolved: true,
    };
  }

  function selectedUnitMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(row => {
      map.set(row.name, row.star || 0);
    });
    return map;
  }

  function primeConditionMet(when, selected) {
    if (!when) return true;
    const units = selectedUnitMap(selected);
    const level = Number(selected.level) || DEFAULT_LEVEL;
    if (Number(when.levelGte) && level < Number(when.levelGte)) return false;
    if (Number(when.levelLte) && level > Number(when.levelLte)) return false;
    if ((when.hasUnits || []).some(name => !units.has(name))) return false;
    const unitStars = when.unitStars || {};
    for (const [name, star] of Object.entries(unitStars)) {
      const have = units.has(name) ? (units.get(name) || 1) : 0;
      if (have < Number(star)) return false;
    }
    return true;
  }

  function primePlanRule(template, selected) {
    const plan = template && template.primePlan;
    if (!plan || !Array.isArray(plan.rules)) return null;
    return plan.rules
      .filter(rule => primeConditionMet(rule.when, selected))
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || null;
  }

  function compactPrimeEvidence(text) {
    const raw = String(text || "");
    if (!raw) return "模型实验";
    if (/裸转/.test(raw)) return "模型：三件套上限更高，裸青龙刀不够";
    return "模型：" + raw.split(/[；;]/)[0].replace(/\s+/g, "");
  }

  function primeActionLine(template, selected) {
    const rule = primePlanRule(template, selected);
    if (!rule) return "";
    return `至尊：${rule.text || `给${rule.holder}`}（${compactPrimeEvidence(rule.evidence)}）`;
  }

  function actionLines(template, selected, top) {
    const lines = [];
    const selectedItems = new Set(normalizeSelectedItems(selected).map(x => x.name));
    const selectedUnits = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const nextComponent = (template.componentPrefs || []).find(x => !selectedItems.has(x));
    const nextItem = (template.completedPrefs || []).find(x => !selectedItems.has(x));
    const earlyHits = (template.earlyUnits || []).filter(x => selectedUnits.has(x));
    const keep = (template.actions && template.actions.keep || template.earlyUnits || []).slice(0, 4);
    const primeLine = primeActionLine(template, selected);
    const econLine = economyActionLine(selected);
    const mechanic = template.mechanic;
    const mechanicActive = mechanic && (!mechanic.requiredAugment || (selected.augments || []).includes(mechanic.requiredAugment))
      && (mechanic.requiredUnits || []).every(name => selectedUnits.has(name));
    const heroAugment = top && top.heroAugment;
    if (heroAugment) {
      if (heroAugment.status === "waiting" && ["3-2", "4-2"].includes(heroAugment.round) && heroAugment.traits.length) {
        lines.push(`${heroAugment.round}英雄强化：前一轮优先激活${heroAugment.traits.slice(0, 2).join("/")}，等${heroAugment.heroes.slice(0, 2).join("/")}专属`);
      } else if (heroAugment.status === "waiting") {
        lines.push(heroAugment.text);
      } else if (heroAugment.status === "base-only" || heroAugment.status === "closed") {
        lines.push(heroAugment.text);
      } else if (heroAugment.status === "locked" || heroAugment.status === "resolved") {
        lines.push(heroAugment.text);
      } else {
        lines.push(`${heroAugment.round}英雄强化：当前路线可直接按来牌运营`);
      }
    }
    if (selected.derivedAssets && selected.derivedAssets.length) {
      lines.push(`已落袋：${selected.derivedAssets.map(x => x.label || `${x.value}+${x.copies}`).join("、")}`);
    }
    if (top && top.strategyDecision) {
      lines.push(top.strategyDecision.switchCertified
        ? `战略转线：${top.strategyDecision.strategicCarry}接管；${top.strategyDecision.terminalText}`
        : `交接观察：${top.strategyDecision.currentHolder}暂时代持，${top.strategyDecision.handoffText}`);
    }
    if (top && top.decision) {
      if (top.decision.status === "observing") lines.push(`暂不定线：${top.decision.text}`);
      else if (top.committed) lines.push(top.decision.text);
    }
    if (top && top.antiFragile) {
      const af = top.antiFragile;
      lines.push(`${af.label}，核心度${af.readyPct}%`);
      if (af.blocked) lines.push(`不可达瓶颈：${af.bottleneckText}，别为它D牌`);
      else if (af.status === "red") lines.push(`禁止硬定：先补${af.bottleneckText}`);
      else if (af.status === "yellow") lines.push(`下一验证：补${af.bottleneckText}`);
    }
    if (top && top.augmentOperator && top.augmentOperator.actions.length) lines.push(top.augmentOperator.actions[0]);
    if (econLine) lines.push(econLine);
    if (primeLine) lines.push(primeLine);
    if (mechanicActive) lines.push(`机制：${mechanic.text}`);
    else if (mechanic && mechanic.requiredAugment) lines.push(`缺${mechanic.requiredAugment}，这条路线不能定`);
    if (nextComponent) lines.push(`下件优先拿${nextComponent}`);
    else if (nextItem) lines.push(`装备往${nextItem}靠`);
    if (earlyHits.length >= 2) lines.push(`围绕${earlyHits.slice(0, 3).join("、")}定线`);
    else if (keep.length) lines.push(`先留${keep.join("、")}`);
    if (top && top.reachability) {
      const miss = top.reachability.missing || [];
      if (miss.length) {
        const first = miss[0];
        const ideal = first.cost <= 1 ? 5 : first.cost === 2 ? 6 : first.cost === 3 ? 7 : first.cost === 4 ? 8 : 9;
        if (top.reachability.level < ideal && first.cost >= 4) lines.push(`主要缺${first.cost}费核心，建议先拉${ideal}再D`);
        else {
          const oddsLevel = Number(first.effectiveLevel) || top.reachability.level;
          const levelText = oddsLevel !== top.reachability.level ? `${top.reachability.level}级商店按${oddsLevel}级` : `${top.reachability.level}级`;
          lines.push(`${levelText}${first.cost}费${first.oddsPct}%，适合现在追${first.name}`);
        }
      } else {
        lines.push("核心已见，先补质量和关键装备");
      }
    }
    const core = (template.coreUnits || []).filter(x => !selectedUnits.has(x)).slice(0, 3);
    if (core.length) lines.push(`后续找${core.join("、")}`);
    if (top && top.penalties && top.penalties.length) lines.push(top.penalties[0]);
    return uniq(lines).slice(0, 3);
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function assertNoBadNumbers(text, msg) {
    assert(!/(999|Infinity|NaN)/.test(String(text)), msg || "不应出现999/Infinity/NaN");
  }

  function runTests() {
    const odds = {
      shopOdds: { 1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 6: [25, 40, 30, 5, 0], 7: [19, 35, 35, 10, 1], 8: [18, 25, 32, 22, 3] },
      unitCounts: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 },
      poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
    };
    const unitPrices = { A: 1, B: 2, C: 3, D: 4 };
    const heroRoundTemplate = (id, cost, required = false) => ({
      id,
      name: id,
      quality: "S",
      coreUnits: ["B"],
      earlyUnits: ["B"],
      midUnits: ["B"],
      completedPrefs: [],
      actions: {},
      routeProfile: { mainCarry: { name: "B", starTarget: 3, items: [] }, units: [{ name: "B", role: "mainCarry", starTarget: 3, traits: ["测试羁绊"] }], items: [], activeTraits: [{ name: "测试羁绊", count: 2 }] },
      heroAugmentPlan: { mainCarry: "B", options: [{ name: `${id}专属`, hero: "B", cost, traits: ["测试羁绊"] }], requiredNames: required ? [`${id}专属`] : [] },
    });
    const lowOptional = heroRoundTemplate("二费基础线", 2);
    const threeOptional = heroRoundTemplate("三费候选线", 3);
    const lowRequired = heroRoundTemplate("二费硬门槛", 2, true);
    const noRoundBefore = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [] }, fallbackWeights, {});
    const noRoundAfter = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "unknown" }, fallbackWeights, {});
    assert(noRoundBefore.stageStrength === noRoundAfter.stageStrength, "未知英雄强化回合时计分必须逐值不变");
    const lowAtFour = scoreTemplate(lowOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    const threeAtFour = scoreTemplate(threeOptional, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    const hardAtFour = scoreTemplate(lowRequired, { units: [], items: [], augments: [], augmentCats: [], heroAugmentRound: "4-2" }, fallbackWeights, {});
    assert(lowAtFour.heroAugment.status === "base-only" && !lowAtFour.mechanicBlocked, "4-2应关闭二费专属分支但保留基础阵容");
    assert(threeAtFour.heroAugment.status === "waiting" && threeAtFour.stageStrength > noRoundBefore.stageStrength, "4-2必须保留三费英雄强化并计入期权");
    assert(hardAtFour.heroAugment.status === "closed" && hardAtFour.stageStrength === 0, "4-2应硬关闭二费专属门槛路线");
    const heroCatalog = [
      { name: "嗜火", hero: "安妮", cost: 2, traits: ["小天才", "福牛守护者", "灵能使"], effect: { grantedHero: "安妮", grantedCopies: 1, areaExpanded: true, stunSeconds: 2 } },
      { name: "无情连打", hero: "贾克斯", cost: 3, traits: ["战斗机甲", "斗士"], effect: { grantedHero: "贾克斯", grantedCopies: 1, areaExpanded: false, stunSeconds: 0 } },
      { name: "双重气泡", hero: "佐伊", cost: 3, traits: ["小天才", "淘气包", "黑客"], effect: { grantedHero: "佐伊", grantedCopies: 1, areaExpanded: false, stunSeconds: 0 } },
    ];
    const fireRaw = selectedFromSignals([{ kind: "units", value: "贾克斯" }, { kind: "augments", value: "嗜火" }]);
    fireRaw.level = 5;
    fireRaw.heroAugmentRound = "3-2";
    const fireState = resolveGameState(fireRaw, heroCatalog);
    assert(fireState.heroAugment.status === "resolved" && fireState.heroAugment.selected.name === "嗜火", "选中英雄强化必须全局结算");
    assert(fireState.unitCopies["安妮"] === 1 && fireState.derivedAssets.some(x => x.value === "安妮" && x.copies === 1), "嗜火必须派生安妮+1资产");
    const fireDuplicate = resolveGameState({ ...fireRaw, augments: ["嗜火", "嗜火"] }, heroCatalog);
    assert(fireDuplicate.unitCopies["安妮"] === 1, "重复口述同一英雄强化不得重复赠送");
    const fireWithTwoStar = resolveGameState({ ...fireRaw, units: [{ name: "安妮", star: 2 }] }, heroCatalog);
    assert(fireWithTwoStar.unitCopies["安妮"] === 4, "安妮二星加嗜火应按四张副本计算");
    const jaxAfterFire = scoreTemplate(threeOptional, fireState, fallbackWeights, { heroAugments: heroCatalog });
    assert(jaxAfterFire.heroAugment.status === "resolved" && jaxAfterFire.heroAugment.scoreDelta === 0, "已选嗜火后其他路线不得继续领取贾克斯期权");
    const fireTemplate = {
      ...heroRoundTemplate("嗜火安妮线", 2),
      augmentPrefs: ["嗜火"],
      routeProfile: { mainCarry: { name: "安妮", starTarget: 3, items: [] }, units: [{ name: "安妮", role: "frontline", starTarget: 1, traits: ["小天才", "灵能使"] }], items: [], activeTraits: [{ name: "小天才", count: 3 }, { name: "灵能使", count: 2 }] },
      heroAugmentPlan: { mainCarry: "安妮", options: [heroCatalog[0]], requiredNames: [] },
    };
    const fireOff = scoreTemplate(fireTemplate, { units: [], items: [], augments: [], augmentCats: [], level: 5, heroAugmentRound: "3-2" }, fallbackWeights, { heroAugments: heroCatalog });
    const fireOn = scoreTemplate(fireTemplate, fireState, fallbackWeights, { heroAugments: heroCatalog });
    assert(fireOn.stageStrength > fireOff.stageStrength && fireOn.evidence.some(x => x.includes("嗜火机制")), "嗜火应通过赠送资产和保守群控算子抬升安妮路线");
    const bubbleRaw = selectedFromSignals([
      { kind: "levels", level: 4 },
      { kind: "units", value: "璐璐", star: 2 },
      { kind: "augments", value: "双重气泡" },
    ]);
    bubbleRaw.heroAugmentRound = "unknown";
    const bubbleState = resolveGameState(bubbleRaw, heroCatalog);
    const zoeCarryTemplate = {
      ...heroRoundTemplate("佐伊主核线", 3),
      augmentPrefs: [],
      routeProfile: {
        mainCarry: { name: "佐伊", starTarget: 3, items: [] },
        units: [{ name: "佐伊", role: "mainCarry", starTarget: 3, traits: ["小天才"] }, { name: "璐璐", role: "utility", starTarget: 1, traits: ["小天才"] }],
        items: [],
        activeTraits: [{ name: "小天才", count: 3 }],
      },
      heroAugmentPlan: { mainCarry: "佐伊", options: [heroCatalog[2]], requiredNames: [] },
    };
    const luluCarryTemplate = {
      ...heroRoundTemplate("璐璐主核线", 1),
      augmentPrefs: [],
      routeProfile: {
        mainCarry: { name: "璐璐", starTarget: 3, items: [] },
        units: [{ name: "璐璐", role: "mainCarry", starTarget: 3, traits: ["小天才"] }, { name: "佐伊", role: "utility", starTarget: 1, traits: ["小天才"] }],
        items: [],
        activeTraits: [{ name: "小天才", count: 3 }],
      },
      heroAugmentPlan: { mainCarry: "璐璐", options: [], requiredNames: [] },
    };
    const zoeCarryScore = scoreTemplate(zoeCarryTemplate, bubbleState, fallbackWeights, { heroAugments: heroCatalog });
    const luluCarryScore = scoreTemplate(luluCarryTemplate, bubbleState, fallbackWeights, { heroAugments: heroCatalog });
    assert(zoeCarryScore.heroAugment.status === "locked", "已选英雄强化在回合未知时也必须完成路线结算");
    assert(zoeCarryScore.evidence.some(x => x.includes("英雄强化定核") && x.includes("主C佐伊")), "专属强化必须生成数据驱动的主C角色契约");
    assert(!luluCarryScore.evidence.some(x => x.includes("英雄强化定核")), "仅把赠送英雄当挂件的路线不得领取主C角色契约");
    assert(zoeCarryScore.stageStrength > luluCarryScore.stageStrength, "专属强化角色契约必须压过同阵容内的普通二星主C惯性");
    const fullCore = [{
      id: "full",
      name: "全集core",
      quality: "S",
      coreUnits: ["A", "B", "C"],
      earlyUnits: [],
      midUnits: ["B", "C"],
      actions: {},
      routeProfile: {
        mainCarry: { name: "A", starTarget: 3, items: [] },
        units: [
          { name: "A", role: "mainCarry", starTarget: 3, traits: [] },
          { name: "B", role: "frontline", starTarget: 1, traits: [] },
          { name: "C", role: "utility", starTarget: 1, traits: [] },
        ],
        items: [],
        activeTraits: [],
      },
    }];
    const selected = selectedFromSignals([{ kind: "units", value: "A", star: 3 }]);
    selected.level = 8;
    const full = rank(fullCore, selected, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(Object.prototype.hasOwnProperty.call(full, "stageStrength"), "rank行应包含stageStrength");
    assert(Object.prototype.hasOwnProperty.call(full, "finalScore"), "rank行应包含finalScore");
    assert(!Object.prototype.hasOwnProperty.call(full, "score"), "rank行不应再包含score字段");
    assert(full.reachability.missing.length === 2, "可达性应按core全集计算缺口");
    assert(full.reachability.summary.includes("缺B1张") && full.reachability.summary.includes("缺C1张"), "缺口摘要应逐条列出core缺口");
    assertNoBadNumbers(full.reachability.summary, "缺口摘要不应有坏数字");

    const low = selectedFromSignals([]);
    low.level = 4;
    const lowTemplate = { id: "low", name: "低级", quality: "S", coreUnits: ["D"], midUnits: ["D"], earlyUnits: [], actions: {}, routeProfile: { mainCarry: { name: "D", starTarget: 2, items: [] }, units: [{ name: "D", role: "mainCarry", starTarget: 2, traits: [] }], items: [], activeTraits: [] } };
    const lowRows = rank([lowTemplate], low, fallbackWeights, 1, { oddsData: odds, unitPrices })[0];
    assert(lowRows.reachability.missing.length === 0, "0概率棋子不应进入期望成本");
    assert(lowRows.reachability.lateTargets.includes("D"), "0概率棋子应进入后期目标");
    assertNoBadNumbers(JSON.stringify(lowRows.reachability), "可达性对象不应有坏数字");
    const levelOne = selectedFromSignals([{ kind: "levels", value: "1", level: 1 }]);
    const firstCost = expectedCostForUnit("A", 1, levelOne, { oddsData: odds, unitPrices });
    assert(firstCost.oddsPct === 100 && firstCost.available, "1级应按一费100%概率计算");
    const antiTemplates = [
      { id: "stable", name: "稳定线", quality: "S", coreUnits: ["A"], earlyUnits: ["A"], midUnits: ["A"], completedPrefs: ["锐利之刃"], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: ["锐利之刃"] }, units: [{ name: "A", role: "mainCarry", starTarget: 1, traits: [] }], items: [{ name: "锐利之刃", role: "mainCarry", holder: "A", components: ["暴风之剑", "暴风之剑"] }], activeTraits: [] } },
      { id: "trap", name: "陷阱线", quality: "S", coreUnits: ["B"], earlyUnits: ["A"], midUnits: ["B"], completedPrefs: ["蓝霸符"], actions: {}, routeProfile: { mainCarry: { name: "B", starTarget: 3, items: ["蓝霸符"] }, units: [{ name: "B", role: "mainCarry", starTarget: 3, traits: [] }], items: [{ name: "蓝霸符", role: "mainCarry", holder: "B", components: ["女神之泪", "女神之泪"] }], activeTraits: [] } },
    ];
    const antiSelected = selectedFromSignals([{ kind: "units", value: "A" }, { kind: "items", value: "暴风之剑" }, { kind: "levels", level: 4 }]);
    const defaultAntiOff = rank(antiTemplates, antiSelected, fallbackWeights, 2, { oddsData: odds, unitPrices: { A: 1, B: 3 } })[0];
    assert(!defaultAntiOff.antiFragile, "默认rank不应启用抗脆弱层");
    const antiRows = rank(antiTemplates, antiSelected, fallbackWeights, 2, { oddsData: odds, unitPrices: { A: 1, B: 3 }, antiFragile: true });
    assert(antiRows[0].antiFragile && antiRows[0].antiFragile.formula.includes("抗脆弱"), "比赛模式应返回抗脆弱诊断");
    assert(Number.isFinite(antiRows[0].finalScore), "抗脆弱分必须是有限数");
    antiRows.forEach(row => assertNoBadNumbers(`${row.antiFragile.formula} ${row.antiFragile.bottleneckText}`, "抗脆弱上屏文案不应有坏数字"));

    const primeTemplate = {
      id: "prime",
      name: "机甲测试",
      quality: "S",
      componentPrefs: [],
      completedPrefs: [],
      earlyUnits: ["德莱文"],
      midUnits: ["贾克斯"],
      coreUnits: ["蕾欧娜"],
      actions: {},
      primePlan: {
        rules: [
          { priority: 10, text: "至尊给德莱文", when: { hasUnits: ["德莱文"] }, evidence: "德莱文437 vs 贾克斯395" },
          { priority: 30, text: "至尊转贾克斯", when: { unitStars: { 贾克斯: 2 } }, evidence: "贾克斯810 > 蕾欧娜419" },
          { priority: 50, text: "至尊转蕾欧娜", when: { levelGte: 9, unitStars: { 蕾欧娜: 2 } }, evidence: "蕾欧娜1251 > 贾克斯1189；仅青龙刀不建议裸转" },
        ],
      },
    };
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "units", value: "德莱文" }])).includes("德莱文"), "仅德莱文应给德莱文");
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "units", value: "德莱文" }, { kind: "units", value: "贾克斯", star: 2 }])).includes("贾克斯"), "贾克斯2星应转贾克斯");
    assert(primeActionLine(primeTemplate, selectedFromSignals([{ kind: "levels", level: 9 }, { kind: "units", value: "蕾欧娜", star: 2 }])).includes("蕾欧娜"), "9级蕾欧娜2星应转蕾欧娜");

    const mechanicTemplate = {
      id: "sisters-test",
      name: "姐妹测试",
      quality: "S",
      coreUnits: ["金克丝", "蔚"],
      earlyUnits: ["金克丝", "蔚"],
      midUnits: ["金克丝", "蔚"],
      augmentPrefs: ["姐妹"],
      actions: {},
      mechanic: { requiredAugment: "姐妹", requiredUnits: ["金克丝", "蔚"], matchBonus: 28, missingPenalty: 60, text: "击杀成长" },
      routeProfile: {
        mainCarry: { name: "金克丝", starTarget: 3, items: [] },
        units: [{ name: "金克丝", role: "mainCarry", starTarget: 3, traits: [] }, { name: "蔚", role: "frontline", starTarget: 3, traits: [] }],
        items: [],
        activeTraits: [],
      },
    };
    const mechanicOff = scoreTemplate(mechanicTemplate, selectedFromSignals([{ kind: "units", value: "金克丝" }, { kind: "units", value: "蔚" }]), fallbackWeights, {});
    const mechanicOn = scoreTemplate(mechanicTemplate, selectedFromSignals([{ kind: "units", value: "金克丝" }, { kind: "units", value: "蔚" }, { kind: "augments", value: "姐妹" }]), fallbackWeights, {});
    assert(mechanicOn.stageStrength > mechanicOff.stageStrength + 80, "姐妹机制只有满足符文和双棋子时才应跃升");
    assert(mechanicOn.evidence.some(x => x.includes("机制闭环")), "姐妹命中证据应显示机制闭环");
    assert(mechanicOff.penalties.some(x => x.includes("机制门槛")), "缺姐妹时应显示机制门槛");

    const operatorTemplate = {
      id: "operator-test",
      name: "条件符文算子测试",
      quality: "S",
      augmentPrefs: ["飞升", "高端购物", "便携锻炉"],
      augmentOperators: [
        { name: "飞升", category: "战力", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
        { name: "高端购物", category: "经济", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
        { name: "便携锻炉", category: "装备", conditionLift: 8, evidenceLevel: "L2.5 模型扰动稳健" },
      ],
      actions: {},
      routeProfile: {
        mainCarry: { name: "D", starTarget: 2, items: ["鬼索的狂暴之刃", "疾射火炮", "泰坦的坚决"] },
        units: [{ name: "D", role: "mainCarry", starTarget: 2, traits: [] }],
        items: [
          { name: "鬼索的狂暴之刃", role: "mainCarry", holder: "D", components: ["反曲之弓", "无用大棒"] },
          { name: "疾射火炮", role: "mainCarry", holder: "D", components: ["反曲之弓", "反曲之弓"] },
          { name: "泰坦的坚决", role: "mainCarry", holder: "D", components: ["反曲之弓", "锁子甲"] },
        ],
        activeTraits: [],
      },
    };
    const operatorOpts = { oddsData: odds, unitPrices: { D: 4 }, certification: false };
    const operatorBase = rank([operatorTemplate], selectedFromSignals([{ kind: "units", value: "D" }, { kind: "levels", level: 6 }]), fallbackWeights, 1, operatorOpts)[0];
    const combatOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "units", value: "D" }, { kind: "levels", level: 6 }, { kind: "augments", value: "飞升" }]), fallbackWeights, 1, operatorOpts)[0];
    assert(combatOperator.finalScore > operatorBase.finalScore + fallbackWeights.augment, "战力符文应在固定推荐分之外获得认证算子增益");
    assert(combatOperator.augmentOperator.evidence.some(x => x.includes("战力算子")), "战力算子应进入证据栏");
    const economyOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "高端购物" }]), fallbackWeights, 1, operatorOpts)[0];
    const economyBase = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }]), fallbackWeights, 1, operatorOpts)[0];
    assert(economyOperator.reachability.missing[0].effectiveLevel === 7, "高端购物应让6级按7级商店概率计算");
    assert(economyOperator.reachability.expectedGold < economyBase.reachability.expectedGold, "经济算子应降低路线期望D牌成本");
    const itemOperator = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "便携锻炉" }]), fallbackWeights, 1, operatorOpts)[0];
    const itemComplete = rank([operatorTemplate], selectedFromSignals([{ kind: "levels", level: 6 }, { kind: "augments", value: "便携锻炉" }, { kind: "items", value: "鬼索的狂暴之刃" }, { kind: "items", value: "疾射火炮" }, { kind: "items", value: "泰坦的坚决" }]), fallbackWeights, 1, operatorOpts)[0];
    assert(itemOperator.augmentOperator.variableBonus > itemComplete.augmentOperator.variableBonus, "装备算子应随主C装备缺口收缩而衰减");
    assert(itemOperator.augmentOperator.variableBonus <= AUGMENT_ITEM_BONUS_CAP, "单条装备算子不得越过上限");

    const decisionTemplates = [
      {
        id: "route-a", name: "A当前线", quality: "S", coreUnits: ["A", "C"], earlyUnits: ["A", "C"], midUnits: ["A", "C"], completedPrefs: ["护甲"], componentPrefs: [], augmentPrefs: ["A强化"], augmentCats: [], actions: {},
        routeProfile: { mainCarry: { name: "A", starTarget: 2, items: ["护甲"] }, units: [{ name: "A", role: "mainCarry", starTarget: 2, traits: [] }, { name: "C", role: "frontline", starTarget: 1, traits: [] }], items: [{ name: "护甲", role: "mainCarry", holder: "A", components: [] }], activeTraits: [] },
      },
      {
        id: "route-b", name: "B战略线", quality: "S", coreUnits: ["B", "D", "E"], earlyUnits: ["B", "D"], midUnits: ["B", "D", "E"], completedPrefs: ["X"], componentPrefs: [], augmentPrefs: ["B强化"], augmentCats: [], actions: {},
        routeProfile: { mainCarry: { name: "B", starTarget: 2, items: ["X"] }, units: [{ name: "B", role: "mainCarry", starTarget: 2, traits: [] }, { name: "D", role: "frontline", starTarget: 1, traits: [] }, { name: "E", role: "utility", starTarget: 1, traits: [] }], items: [{ name: "X", role: "mainCarry", holder: "B", components: [] }], activeTraits: [] },
      },
    ];
    const decisionWeights = { ...fallbackWeights, baseS: 100, mainCarryUnit: 24, mainCarryItem: 22, frontlineUnit: 8, utilityUnit: 8, routeItem: 22, futureMainCarryUnit: 0, futureCoreUnit: 0, futureItem: 0, versionStrength: 0 };
    const decisionOpts = { operationalCommitment: true, unitPrices: { A: 1, B: 2, C: 1, D: 2, E: 3 } };
    const ordinaryRows = rank(decisionTemplates, selectedFromSignals([
      { kind: "levels", level: 4 },
      { kind: "units", value: "A", location: "board" },
      { kind: "units", value: "B", location: "board" },
      { kind: "items", value: "X" },
    ]), decisionWeights, 2, decisionOpts);
    assert(ordinaryRows.decision.status === "observing" && !ordinaryRows.some(row => row.committed), "普通来牌与未装备成装不得制造路线承诺");

    const earlyRows = rank(decisionTemplates, selectedFromSignals([
      { kind: "levels", level: 3 },
      { kind: "units", value: "B", star: 3, location: "board" },
      { kind: "items", value: "X", holder: "B", equipped: true },
    ]), decisionWeights, 2, { ...decisionOpts, manualLockId: "route-b" });
    assert(earlyRows.decision.status === "observing" && !earlyRows.some(row => row.committed), "1至3级即使核心升星或手动锁定也只能观察，不得硬定终局");

    const irreversibleSignals = [
      { kind: "levels", level: 4 },
      { kind: "units", value: "A", location: "board" },
      { kind: "units", value: "B", star: 2, location: "board" },
      { kind: "items", value: "X", holder: "B", equipped: true },
    ];
    const irreversibleRows = rank(decisionTemplates, selectedFromSignals(irreversibleSignals), decisionWeights, 2, decisionOpts);
    assert(irreversibleRows.decision.status === "committed" && rowId(operationalRow(irreversibleRows)) === "route-b", "核心升星与正确持有者成装应形成可解释的不可逆承诺");
    const committedB = irreversibleRows.find(row => rowId(row) === "route-b");
    assert(committedB.commitment.evidenceRows.some(x => x.includes("B2星")) && committedB.commitment.evidenceRows.some(x => x.includes("B已装备X")), "承诺证据必须逐项列出核心升星与已装备关键装");

    const orderA = rank(decisionTemplates, selectedFromSignals(irreversibleSignals), decisionWeights, 2, decisionOpts);
    const orderB = rank(decisionTemplates, selectedFromSignals([...irreversibleSignals].reverse()), decisionWeights, 2, decisionOpts);
    const decisionSnapshot = rows => JSON.stringify({
      order: rows.map(row => [rowId(row), row.finalScore]),
      execution: rowId(operationalRow(rows)),
      decision: rows.decision,
    });
    assert(decisionSnapshot(orderA) === decisionSnapshot(orderB), "同一最终状态必须与输入顺序、历史推荐顺序完全无关");

    const manualRows = rank(decisionTemplates, selectedFromSignals([{ kind: "levels", level: 4 }, { kind: "units", value: "B" }]), decisionWeights, 2, { ...decisionOpts, manualLockId: "route-a" });
    assert(manualRows.decision.status === "manual" && rowId(operationalRow(manualRows)) === "route-a", "4级后手动锁定应作为显式不可逆事件生效");

    const dSpendRows = rank(decisionTemplates, selectedFromSignals([
      { kind: "levels", level: 4 },
      { kind: "units", value: "B" },
      { kind: "commitments", value: "D牌:B:20", commitmentType: "d-spend", targetUnit: "B", gold: 20 },
    ]), decisionWeights, 2, decisionOpts);
    assert(dSpendRows.decision.status === "committed" && rowId(operationalRow(dSpendRows)) === "route-b", "真实D牌支出达到证据门槛时应形成确定性路线承诺");

    const boardRows = rank(decisionTemplates, selectedFromSignals([{ kind: "levels", level: 4 }, { kind: "units", value: "B", location: "board" }]), decisionWeights, 2, decisionOpts);
    const benchRows = rank(decisionTemplates, selectedFromSignals([{ kind: "levels", level: 4 }, { kind: "units", value: "B", location: "bench" }]), decisionWeights, 2, decisionOpts);
    const boardB = boardRows.find(row => rowId(row) === "route-b");
    const benchB = benchRows.find(row => rowId(row) === "route-b");
    assert(boardB.currentBoardScore > benchB.currentBoardScore, "场上棋子的当前战力必须高于备战席同名棋子");

    const sunkRows = rank(decisionTemplates, selectedFromSignals([
      { kind: "levels", level: 4 },
      { kind: "units", value: "A", star: 2 },
      { kind: "items", value: "护甲", holder: "A", equipped: true },
      { kind: "units", value: "B", star: 2 },
    ]), decisionWeights, 2, decisionOpts);
    const sunkB = sunkRows.find(row => rowId(row) === "route-b");
    assert(sunkB.commitment.transitionCost > 0 && sunkB.commitment.costRows.some(x => x.includes("A2星")), "不兼容升星与已装备成装必须进入资产转型成本");

    const countedItems = selectedFromSignals([{ kind: "items", value: "反曲之弓", count: 2 }]);
    assert(countedItems.items.length === 2 && countedItems.itemRows.length === 2, "重复散件必须保留数量，不能退化成集合");
    const doubleBow = scoreTemplate(operatorTemplate, countedItems, fallbackWeights, {});
    assert(doubleBow.evidence.some(x => x.includes("反曲之弓+反曲之弓") && x.includes("可立即合成")), "两把弓必须能推导疾射火炮的立即合成价值");
    const virtualBase = id => ({ id, name: id, quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } });
    const virtualHigh = { ...virtualBase("稳健"), virtualBattle: { battles: 708, winRate: 82, robustScore: 90, cvar10: -0.1, interval90: [-0.2, 0.8], coverage: 100, unsupported: [] } };
    const virtualLow = { ...virtualBase("敏感"), virtualBattle: { battles: 708, winRate: 22, robustScore: 20, cvar10: -0.8, interval90: [-0.9, 0.2], coverage: 100, unsupported: [] } };
    const virtualRows = rank([virtualLow, virtualHigh], { units: [], items: [], augments: [], augmentCats: [] }, fallbackWeights, 2, {});
    assert(rowId(virtualRows[0]) === "稳健" && virtualRows[0].finalScore > virtualRows[1].finalScore, "虚拟实战先验应参与排序");
    assert(Math.abs(virtualRows[0].virtualBattlePrior) <= VIRTUAL_BATTLE_PRIOR_CAP, "虚拟实战先验不得越过有界上限");
    assert(virtualRows[0].virtualDecision && virtualRows[0].virtualDecision.battles === 708, "rank应输出虚拟实战决策摘要");
    assert(virtualRows[0].evidence.some(x => x.includes("708场")), "虚拟实战应进入证据栏");
    if (typeof require === "function") {
      const path = require("path");
      const rootDir = path.resolve(__dirname, "..");
      const matcherData = require(path.join(rootDir, "artifacts", "results", "stage2_matcher_results.json"));
      require(path.join(__dirname, "odds-data.js"));
      const fixtureRows = require(path.join(rootDir, "tests", "fixtures", "hands.json"));
      const fixtureUnitPrices = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.price]));
      const fixtureUnitTraits = Object.fromEntries((matcherData.options.unitSearch || []).map(x => [x.name, x.traits || []]));
      const bubbleSignals = [
        { kind: "levels", level: 1 },
        { kind: "units", value: "安妮", star: 2 },
        { kind: "units", value: "璐璐", star: 2 },
        { kind: "units", value: "波比" },
        { kind: "augments", value: "利滚利" },
        { kind: "augments", value: "双重气泡" },
        { kind: "units", value: "悠米", star: 2 },
        { kind: "units", value: "泰隆", star: 2 },
      ];
      const bubbleOpts = {
        oddsData: globalThis.JCC_ODDS,
        unitPrices: fixtureUnitPrices,
        unitTraits: fixtureUnitTraits,
        heroAugments: matcherData.options.heroAugments,
        antiFragile: true,
        operationalCommitment: true,
      };
      const bubbleRows = rank(matcherData.templates, selectedFromSignals(bubbleSignals), matcherData.weights, 10, bubbleOpts);
      assert(routeMainCarry(bubbleRows[0].template) === "佐伊", `双重气泡实战手牌的战略#1必须转为佐伊主C，实际${bubbleRows[0].template.name}`);
      assert(bubbleRows.decision.status === "observing", "1级仍须保持观察，不因英雄强化提前硬定终局");
      const bubbleRowsReversed = rank(matcherData.templates, selectedFromSignals([...bubbleSignals].reverse()), matcherData.weights, 10, bubbleOpts);
      assert(JSON.stringify(bubbleRows.slice(0, 5).map(row => [rowId(row), row.finalScore])) === JSON.stringify(bubbleRowsReversed.slice(0, 5).map(row => [rowId(row), row.finalScore])), "双重气泡最终状态不得受输入顺序影响");
      const bubbleLevelFour = rank(matcherData.templates, selectedFromSignals(bubbleSignals.map(signal => signal.kind === "levels" ? { ...signal, level: 4 } : signal)), matcherData.weights, 10, bubbleOpts);
      const bubbleCommitted = matcherData.templates.find(template => template.id === bubbleLevelFour.decision.committedId);
      assert(bubbleLevelFour.decision.status === "committed" && routeMainCarry(bubbleCommitted) === "佐伊", "4级后已选双重气泡必须把不可逆承诺结算到佐伊主C路线");
      assert(matcherData.templates.some(t => (t.augmentOperators || []).length), "构建数据应包含条件符文算子");
      assert(!matcherData.templates.some(t => (t.augmentOperators || []).some(x => !(t.augmentPrefs || []).includes(x.name))), "算子必须属于该路线推荐符文");
      fixtureRows.forEach(fx => {
        const selectedFx = selectedFromSignals([...(fx.signals || []), { kind: "levels", level: fx.level }]);
        const rows = rank(matcherData.templates, selectedFx, matcherData.weights, 5, {
          oddsData: globalThis.JCC_ODDS,
          unitPrices: fixtureUnitPrices,
          unitTraits: fixtureUnitTraits,
        });
        const topNames = rows.slice(0, fx.expect.topN || 1).map(r => r.template.name).join(" / ");
        const topEvidence = rows.slice(0, fx.expect.topN || 1).flatMap(r => r.evidence || []).join("；");
        if (fx.expect.top1NameIncludes) {
          fx.expect.top1NameIncludes.forEach(part => assert((rows[0].template.name || "").includes(part), `${fx.label} #1 应包含 ${part}，实际 ${rows[0].template.name}`));
        }
        if (fx.expect.top1NameIncludesAny) {
          assert(fx.expect.top1NameIncludesAny.some(part => (rows[0].template.name || "").includes(part)), `${fx.label} #1 不符合预期，实际 ${rows[0].template.name}`);
        }
        if (fx.expect.topAnyNameIncludes) {
          fx.expect.topAnyNameIncludes.forEach(part => assert(topNames.includes(part), `${fx.label} 前${fx.expect.topN || 1} 应包含 ${part}，实际 ${topNames}`));
        }
        (fx.expect.evidenceIncludes || []).forEach(part => assert(topEvidence.includes(part), `${fx.label} 证据应包含 ${part}，实际 ${topEvidence}`));
      });
      const earlyStateSignals = [
        { kind: "units", value: "凯尔", star: 2 },
        { kind: "units", value: "雷克顿", star: 2 },
        { kind: "units", value: "安妮" },
        { kind: "units", value: "璐璐" },
        { kind: "units", value: "波比" },
        { kind: "levels", level: 1 },
      ];
      const earlyDecisionOpts = {
        oddsData: globalThis.JCC_ODDS,
        unitPrices: fixtureUnitPrices,
        unitTraits: fixtureUnitTraits,
        heroAugments: matcherData.options.heroAugments,
        operationalCommitment: true,
      };
      const earlyForward = rank(matcherData.templates, selectedFromSignals(earlyStateSignals), matcherData.weights, 5, earlyDecisionOpts);
      const earlyReverse = rank(matcherData.templates, selectedFromSignals([...earlyStateSignals].reverse()), matcherData.weights, 5, earlyDecisionOpts);
      const actualDecisionSnapshot = rows => JSON.stringify({
        top3: rows.slice(0, 3).map(row => [rowId(row), row.finalScore]),
        execution: rowId(operationalRow(rows)),
        decision: rows.decision,
      });
      assert(actualDecisionSnapshot(earlyForward) === actualDecisionSnapshot(earlyReverse), "凯尔/小天才实战状态不得因先说哪张牌而改变执行结论");
      assert(earlyForward.decision.status === "observing" && !earlyForward.some(row => row.committed), "真实模板在1级必须只输出当前棋盘与战略候选");
      const chosenHeroAugment = rank(matcherData.templates, selectedFromSignals([
        { kind: "levels", level: 4 },
        { kind: "augments", value: "登神长阶" },
      ]), matcherData.weights, 5, {
        ...earlyDecisionOpts,
        antiFragile: true,
      });
      assert(chosenHeroAugment.decision.status === "committed"
        && chosenHeroAugment.decision.committedName.includes("登神决斗天使"), "已选择英雄强化必须关闭普通观察态，并按赠送资产与机制重新定线");
      const screenshotUnits = ["凯尔", "娑娜", "德莱文", "李青", "赛娜", "芮尔", "孙悟空", "锐雯"];
      const screenshotSignals = [
        ...screenshotUnits.map(name => ({ kind: "units", value: name, star: name === "孙悟空" ? 2 : undefined })),
        { kind: "items", value: "锁子甲" },
        { kind: "augments", value: "无情连打" },
        { kind: "levels", level: 4 },
      ];
      const transitionOpts = {
        oddsData: globalThis.JCC_ODDS,
        unitPrices: fixtureUnitPrices,
        unitTraits: fixtureUnitTraits,
        heroAugments: matcherData.options.heroAugments,
        antiFragile: true,
        operationalCommitment: true,
      };
      const dravenTemplate = matcherData.templates.find(t => (t.name || "").includes("超级机甲德莱文"));
      assert(dravenTemplate, "无情连打回归需要德莱文基线路线");
      const selectedJaxOne = selectedFromSignals(screenshotSignals);
      selectedJaxOne.heroAugmentRound = "3-2";
      const jaxOneRows = rank(matcherData.templates, selectedJaxOne, matcherData.weights, 8, {
        ...transitionOpts,
      });
      const jaxOneOperational = operationalRow(jaxOneRows);
      const transitionPlan = jaxOneOperational.template.augmentTransitionPlan;
      assert(routeMainCarry(jaxOneOperational.template) === "贾克斯", "选下无情连打并获得贾克斯后，战略路线主C应为贾克斯");
      assert(jaxOneOperational.strategyDecision
        && jaxOneOperational.strategyDecision.currentHolder === transitionPlan.currentHolder
        && jaxOneOperational.strategyDecision.switchCertified === Boolean(transitionPlan.currentSwitchCertified)
        && jaxOneOperational.strategyDecision.lcb95 === Number(transitionPlan.currentInference.lcb95), "贾克斯1星执行结论必须逐值服从最新条件化实验");
      const selectedJaxTwo = selectedFromSignals([...screenshotSignals, { kind: "units", value: "贾克斯", star: 2 }]);
      selectedJaxTwo.heroAugmentRound = "3-2";
      const jaxTwoRows = rank(matcherData.templates, selectedJaxTwo, matcherData.weights, 8, {
        ...transitionOpts,
      });
      const jaxTwoOperational = operationalRow(jaxTwoRows);
      assert(routeMainCarry(jaxTwoOperational.template) === "贾克斯"
        && jaxTwoOperational.strategyDecision
        && jaxTwoOperational.strategyDecision.currentHolder === (transitionPlan.handoffCertified ? transitionPlan.strategicCarry : transitionPlan.currentHolder)
        && jaxTwoOperational.strategyDecision.switchCertified === Boolean(transitionPlan.handoffCertified)
        && jaxTwoOperational.strategyDecision.lcb95 === Number(transitionPlan.handoffInference.lcb95),
      "贾克斯2星执行结论必须逐值服从最新交接实验，不得沿用过期门槛");
      const genericTemplate = matcherData.templates.find(t => t.augmentTransitionPlan
        && t.augmentTransitionPlan.source === "generic-policy-compiler"
        && (t.augmentTransitionPlan.holderRules || []).some(rule => rule.certified));
      const genericPlan = genericTemplate && genericTemplate.augmentTransitionPlan;
      const genericRule = genericPlan && genericPlan.holderRules.find(rule => rule.certified);
      assert(genericTemplate && genericRule, "比赛模式必须接入至少一条非贾克斯的通用策略");
      const genericSignals = [
        ...(genericRule.when.hasUnits || []).map(name => ({ kind: "units", value: name })),
        ...(genericRule.when.unit ? [{ kind: "units", value: genericRule.when.unit, star: genericRule.when.starGte || 1 }] : []),
        { kind: "augments", value: genericPlan.augment },
        { kind: "levels", level: genericRule.when.levelGte || 6 },
      ];
      const selectedGeneric = selectedFromSignals(genericSignals);
      const genericRows = rank([genericTemplate], selectedGeneric, matcherData.weights, 1, {
        ...transitionOpts,
      });
      assert(genericRows[0].strategyDecision && genericRows[0].strategyDecision.switchCertified
        && genericRows[0].strategyDecision.strategicCarry === genericPlan.strategicCarry
        && genericRows[0].strategyDecision.lcb95 > 0,
      `通用策略${genericPlan.augment}应按星级/等级条件输出正LCB转核`);
      const genericBaseline = matcherData.templates.find(t => routeMainCarry(t) === genericRule.fromCarry);
      assert(genericBaseline, `通用策略${genericPlan.augment}缺少对照主C路线${genericRule.fromCarry}`);
      const genericOperationalRows = rank(matcherData.templates, selectedGeneric, matcherData.weights, 8, {
        ...transitionOpts,
      });
      const genericOperational = operationalRow(genericOperationalRows);
      assert(genericOperational.strategyDecision && genericOperational.strategyDecision.switchCertified
        && routeMainCarry(genericOperational.template) === genericPlan.strategicCarry,
      `通用策略挑战者应跨越真分名次与${genericRule.fromCarry}对照线完成交接`);
      console.log(`无情连打转型回归: 1星=${jaxOneOperational.strategyDecision.lcb95}, 2星=${jaxTwoOperational.strategyDecision.lcb95}`);
      console.log(`通用策略回归: ${genericPlan.augment}→${genericPlan.strategicCarry}, LCB=${genericRows[0].strategyDecision.lcb95}`);
      console.log(`fixture assertions passed (${fixtureRows.length})`);
    }
    console.log("matcher-core assertions passed");
  }

  const api = {
    COMPONENTS,
    ATTACK,
    AP,
    TANK,
    fallbackWeights,
    DECISION_MODEL,
    MIN_LEVEL,
    MAX_LEVEL,
    COMPONENT_DIRECTION_BONUS,
    PRIME_PLAN_MATCH_BONUS,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    FUTURE_VALUE_GOLD_CAP,
    FUTURE_ITEM_VALUE_RATIO,
    VIRTUAL_BATTLE_PRIOR_CAP,
    VIRTUAL_BATTLE_CENTER,
    VIRTUAL_BATTLE_SCALE,
    AUGMENT_OPERATOR_EVIDENCE,
    AUGMENT_OPERATOR_SINGLE_CAP,
    AUGMENT_OPERATOR_TOTAL_CAP,
    HERO_AUGMENT_ROUND_COSTS,
    HERO_AUGMENT_OPTION_BONUS,
    HERO_AUGMENT_UNAVAILABLE_PENALTY,
    HERO_AUGMENT_CONTROL_CAP,
    DEFAULT_LEVEL,
    scoreTemplate,
    rank,
    operationalRow,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    resolveGameState,
    normalizeSelectedItems,
    actionLines,
    primeActionLine,
    activeTraitsForTemplate,
    heroAugmentDecision,
    normalizeHeroAugmentRound,
    parseTraitsInText,
    normalizeSelectedUnits,
    runTests,
    escText,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
