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
  // 排序黏性：挑战者需领先 max(3分, 现任分*15%) 才易主；现任跌出前3则立即让位。
  const STICKY_MIN_LEAD = 3;
  const STICKY_RELATIVE_LEAD = 0.15;
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
  const MIN_LEVEL = 1;
  const MAX_LEVEL = 9;
  const DEFAULT_LEVEL = 6;

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
      const prev = map.get(cleanName);
      if (!prev || star > (prev.star || 0)) map.set(cleanName, { name: cleanName, star });
    });
    return [...map.values()];
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
    const components = selectedComponentList(selectedItems);
    const items = profileItems(t);
    const rows = [];
    items.forEach(item => {
      const recipe = item.components || [];
      if (recipe.length !== 2) return;
      const base = roleItemWeight(item.role, w);
      if (hasRecipe(components, recipe)) {
        rows.push({
          item,
          pts: Math.round(base * w.immediateCraftRatio),
          evidence: `${recipe[0]}+${recipe[1]}→${item.name}（${roleLabel(item.role)}${itemRankLabel(item, items)}可立即合成）`,
          kind: "craft",
        });
      } else {
        const hit = recipe.find(x => components.includes(x));
        if (hit) {
          rows.push({
            item,
            pts: Math.round(base * w.singleComponentRatio),
            evidence: `${hit} 属于${item.name}分解件`,
            kind: "component",
          });
        }
      }
    });
    const seen = new Set();
    return rows.sort((a, b) => b.pts - a.pts).filter(row => {
      const key = row.kind + row.item.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

  function scoreTemplate(t, selected, weights, opts) {
    const unitRows = normalizeSelectedUnits(selected.units || []);
    const units = new Set(unitRows.map(x => x.name));
    const unitStars = new Map(unitRows.map(x => [x.name, x.star || 0]));
    const items = new Set(selected.items || []);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = { ...fallbackWeights, ...(weights || {}) };
    const base = t.quality === "S" ? w.baseS : t.quality === "A" ? w.baseA : w.baseB;
    let score = base;
    let heldValue = base;
    let futureValue = 0;
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
    const selectedCompleted = [...items].map(canonicalItem).filter(x => !COMPONENTS.includes(x));
    const selectedComponents = selectedComponentList(items);
    const mainCarryName = p.mainCarry && p.mainCarry.name;

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

    selectedCompleted.forEach(it => {
      const hits = roleItems.filter(x => x.name === it);
      if (!hits.length) return;
      const best = hits.sort((a, b) => roleItemWeight(b.role, w) - roleItemWeight(a.role, w))[0];
      const pts = roleItemWeight(best.role, w);
      score += pts;
      heldValue += pts;
      breakdown.item += pts;
      evidence.push(`${it}=命中${roleLabel(best.role)}装备（${best.holder || "路线"}）`);
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
      const future = futureDemandValue(t, selected, opts, w);
      futureValue = future.value;
      score += futureValue;
      breakdown.future += futureValue;
      future.evidence.forEach(x => evidence.push(x));
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
    augCats.forEach(c => {
      if ((t.augmentCats || []).includes(c)) {
        score += w.augmentSignal; heldValue += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`);
      }
    });

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

    if (!items.size) missing.push("还没选择装备，路线暂按来牌判断");
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
      stageStrength: Math.max(0, Math.round(score)),
      heldValue: Math.max(0, Math.round(heldValue)),
      futureValue: Math.max(0, Math.round(futureValue)),
      breakdown,
      shares,
      evidence: uniq(evidence).slice(0, 6),
      missing: uniq(missing).slice(0, 4),
      penalties: uniq(penalties).slice(0, 4),
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function unitPrice(name, opts) {
    const map = opts && opts.unitPrices;
    return Number(map && map[name]) || 3;
  }

  function ownedCopyMap(selected) {
    const map = new Map();
    normalizeSelectedUnits(selected.units || []).forEach(u => map.set(u.name, unitCopies(u.star)));
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
    const oddsData = opts && opts.oddsData || {};
    const shopOdds = oddsData.shopOdds || {};
    const unitCounts = oddsData.unitCounts || {};
    const poolCopies = oddsData.poolCopies || {};
    const cost = unitPrice(name, opts);
    const owned = ownedCopyMap(selected).get(name) || 0;
    const need = Math.max(0, targetCopies - owned);
    const odds = ((shopOdds[level] || [0, 0, 0, 0, 0])[cost - 1] || 0) / 100;
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
      };
    }
    const count = Number(unitCounts[cost]) || 1;
    const pool = Number(poolCopies[cost]) || 1;
    const remainingFactor = clamp((pool - owned) / pool, 0.05, 1);
    const pSlot = odds / count * remainingFactor;
    const expectedGold = (need / (5 * pSlot)) * 2;
    return {
      name,
      cost,
      owned,
      need,
      targetCopies,
      oddsPct: Math.round(odds * 100),
      expectedGold,
      available: true,
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
    const selectedItems = new Set((selected.items || []).map(canonicalItem));
    const p = profile(t);
    const rows = [];
    const lateTargets = [];
    const evidence = [];
    let value = 0;
    (p.units || []).forEach(unit => {
      if (!unit || !unit.name || selectedUnitNames.has(unit.name)) return;
      const cost = unitPrice(unit.name, opts);
      const target = targetCopiesFor(t, unit.name, cost);
      const row = expectedCostForUnit(unit.name, target, selected, opts);
      if (row.need <= 0) return;
      if (!row.available) {
        lateTargets.push(unit.name);
        return;
      }
      const base = futureUnitBaseValue(t, unit, w);
      const pts = discountedValue(base, row.expectedGold);
      if (pts > 0) {
        value += pts;
        evidence.push(`未持有${roleLabel(unit.role)}${unit.name}折现+${pts}（约${Math.round(row.expectedGold)}金）`);
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

  function stickyThreshold(current) {
    return Math.max(STICKY_MIN_LEAD, Math.ceil(rowSortScore(current) * STICKY_RELATIVE_LEAD));
  }

  function applySticky(rows, opts) {
    if (!opts || !opts.stickyTopId || !rows.length) return rows;
    const currentId = opts.stickyTopId;
    const challenger = rows[0];
    if (rowId(challenger) === currentId) {
      challenger.following = true;
      challenger.sticky = { state: "current", text: "当前跟随路线仍是最高分" };
      return rows;
    }
    const currentIndex = rows.findIndex(r => rowId(r) === currentId);
    if (currentIndex < 0) return rows;
    const current = rows[currentIndex];
    if (currentIndex > 2) {
      challenger.sticky = {
        state: "dropped",
        previous: current.template.name,
        text: `${current.template.name}跌出前3，立即让位`,
      };
      return rows;
    }
    const gap = rowSortScore(challenger) - rowSortScore(current);
    const threshold = stickyThreshold(current);
    if (gap < threshold) {
      current.following = true;
      challenger.followAdvice = `建议继续跟 ${current.template.name}（挑战者领先不足）`;
      current.sticky = {
        state: "held",
        challenger: challenger.template.name,
        gap,
        threshold,
        text: `${challenger.template.name}领先${gap}分，未到${threshold}分阈值，继续跟随`,
      };
    } else {
      challenger.sticky = {
        state: "switched",
        previous: current.template.name,
        gap,
        threshold,
        text: `${challenger.template.name}领先${gap}分，达到${threshold}分阈值，允许易主`,
      };
    }
    return rows;
  }

  function rank(templates, selected, weights, limit, opts) {
    const rows = (templates || []).map(t => {
      const stageResult = scoreTemplate(t, selected, weights, opts);
      const base = { template: t, ...stageResult };
      base.finalScore = base.stageStrength;
      const reachability = reachabilityForTemplate(t, selected, opts);
      if (reachability) {
        base.reachability = reachability;
        base.finalScore = base.stageStrength;
      }
      return base;
    });
    if (!opts) return rows.sort((a, b) => b.stageStrength - a.stageStrength).slice(0, limit || 5);
    const previousRank = new Map((opts.previousOrder || []).map((id, i) => [id, i]));
    rows.sort((a, b) => {
      const delta = rowSortScore(b) - rowSortScore(a);
      if (delta) return delta;
      const pa = previousRank.has(rowId(a)) ? previousRank.get(rowId(a)) : 9999;
      const pb = previousRank.has(rowId(b)) ? previousRank.get(rowId(b)) : 9999;
      if (pa !== pb) return pa - pb;
      const teamDelta = teamSearchScore(b.template) - teamSearchScore(a.template);
      if (teamDelta) return teamDelta;
      return String(a.template.name).localeCompare(String(b.template.name), "zh-Hans-CN");
    });
    applySticky(rows, opts);
    return rows.slice(0, limit || 5);
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
    ].filter(Boolean).join("、") || "无";
    const top = ranked[0];
    const t = top.template;
    const topScore = rowSortScore(top);
    const backups = ranked.slice(1, 4).map(r => `${r.template.name}(${rowSortScore(r)}分)`).join(" / ") || "无";
    return [
      `信号：${signals}`,
      `首选：${t.name}（${topScore}分，信心${confidence(topScore)}）`,
      `权重：英雄${top.shares?.hero || 0}% / 装备${top.shares?.item || 0}% / 符文${top.shares?.augment || 0}%${top.breakdown?.traitSignals ? ` / 羁绊${top.shares?.trait || 0}%` : ""}`,
      `拆分：已握资产${top.heldValue || 0}分 + 概率折现${top.futureValue || 0}分 = ${top.finalScore}分`,
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
    const selected = { units: [], items: [], augments: [], augmentCats: [], traits: [], level: null };
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
        if (prev) {
          if (star > (Number(prev.star) || 0)) {
            prev.star = star;
            prev.label = starLabel(value, star);
          }
        } else {
          selected.units.push(star ? { name: value, value, star, label: starLabel(value, star) } : value);
        }
        return;
      }
      if (selected[kind] && value && !selected[kind].includes(value)) selected[kind].push(value);
    });
    return selected;
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
    const selectedItems = new Set(selected.items || []);
    const selectedUnits = new Set(normalizeSelectedUnits(selected.units || []).map(x => x.name));
    const nextComponent = (template.componentPrefs || []).find(x => !selectedItems.has(x));
    const nextItem = (template.completedPrefs || []).find(x => !selectedItems.has(x));
    const earlyHits = (template.earlyUnits || []).filter(x => selectedUnits.has(x));
    const keep = (template.actions && template.actions.keep || template.earlyUnits || []).slice(0, 4);
    const primeLine = primeActionLine(template, selected);
    if (primeLine) lines.push(primeLine);
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
        else lines.push(`${top.reachability.level}级${first.cost}费${first.oddsPct}%，适合现在追${first.name}`);
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
      shopOdds: { 1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0], 6: [25, 40, 30, 5, 0], 8: [18, 25, 32, 22, 3] },
      unitCounts: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 },
      poolCopies: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
    };
    const unitPrices = { A: 1, B: 2, C: 3, D: 4 };
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

    const stickyTemplates = [
      { id: "old", name: "旧路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: [], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } },
      { id: "new", name: "新路线", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], completedPrefs: ["X"], componentPrefs: [], augmentPrefs: [], augmentCats: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "X", role: "route", holder: "A", components: [] }], activeTraits: [] } },
    ];
    const baseWeights = { ...fallbackWeights, baseS: 100, routeItem: 14, augment: 0, augmentSignal: 0 };
    let held = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, baseWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(held[0]) === "new", "黏性不得篡改真分排序");
    assert(held[1].following, "挑战者未达到相对阈值时，旧路线只应带跟随徽章");
    const switchWeights = { ...baseWeights, routeItem: 15 };
    let switched = rank(stickyTemplates, { items: ["X"], units: [], augments: [], augmentCats: [] }, switchWeights, 2, { previousOrder: ["old", "new"], stickyTopId: "old" });
    assert(rowId(switched[0]) === "new", "挑战者达到相对阈值时应易主");

    const dropTemplates = [
      { id: "n1", name: "新1", quality: "S", completedPrefs: ["A"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "A", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "n2", name: "新2", quality: "S", completedPrefs: ["B"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "B", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "n3", name: "新3", quality: "S", completedPrefs: ["C"], coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [{ name: "C", role: "route", holder: "A", components: [] }], activeTraits: [] } },
      { id: "old", name: "旧", quality: "S", coreUnits: [], earlyUnits: [], midUnits: [], actions: {}, routeProfile: { mainCarry: { name: "A", starTarget: 1, items: [] }, units: [], items: [], activeTraits: [] } },
    ];
    const dropped = rank(dropTemplates, { items: ["A", "B", "C"], units: [], augments: [], augmentCats: [] }, { ...fallbackWeights, baseS: 100, routeItem: 10 }, 4, { previousOrder: ["old", "n1", "n2", "n3"], stickyTopId: "old" });
    assert(rowId(dropped[0]) !== "old", "旧#1跌出前3时应立即让位");
    assert(!dropped.some(r => r.template.id === "old" && r.following), "旧#1跌出前3不应保留跟随徽章");
    for (let i = 1; i < dropped.length; i++) {
      assert(dropped[i - 1].finalScore >= dropped[i].finalScore, "rank结果finalScore必须单调非增");
    }
    console.log("matcher-core assertions passed");
  }

  const api = {
    COMPONENTS,
    ATTACK,
    AP,
    TANK,
    fallbackWeights,
    STICKY_MIN_LEAD,
    STICKY_RELATIVE_LEAD,
    MIN_LEVEL,
    MAX_LEVEL,
    COMPONENT_DIRECTION_BONUS,
    PRIME_PLAN_MATCH_BONUS,
    STAR_SCORE_MULTIPLIERS,
    STAR_MILESTONE_BONUS,
    FUTURE_VALUE_GOLD_CAP,
    FUTURE_ITEM_VALUE_RATIO,
    DEFAULT_LEVEL,
    scoreTemplate,
    rank,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    actionLines,
    primeActionLine,
    activeTraitsForTemplate,
    parseTraitsInText,
    normalizeSelectedUnits,
    runTests,
    escText,
  };
  if (typeof module === "object" && module.exports && require.main === module) runTests();
  return api;
});
