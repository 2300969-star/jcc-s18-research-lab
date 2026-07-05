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

  const fallbackWeights = {
    baseS: 18,
    baseA: 10,
    baseB: 4,
    earlyUnit: 14,
    midUnit: 10,
    coreUnit: 7,
    coreItem: 21,
    component: 12,
    looseComponent: 2,
    augment: 24,
    augmentSignal: 8,
    trait: 18,
    attackSynergy: 16,
    conflictPenalty: 16,
    tankPenalty: 5,
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

  function scoreTemplate(t, selected, weights) {
    const units = new Set(selected.units || []);
    const items = new Set(selected.items || []);
    const augments = new Set(selected.augments || []);
    const augCats = new Set(selected.augmentCats || []);
    const traits = normalizeSelectedTraits(selected.traits || []);
    const w = weights || fallbackWeights;
    const base = t.quality === "S" ? w.baseS : t.quality === "A" ? w.baseA : w.baseB;
    let score = base;
    const breakdown = { base, hero: 0, item: 0, augment: 0, synergy: 0, penalty: 0 };
    if (traits.length) {
      breakdown.trait = 0;
      breakdown.traitSignals = traits.length;
    }
    const evidence = [], missing = [], penalties = [];

    units.forEach(u => {
      if ((t.earlyUnits || []).includes(u)) {
        score += w.earlyUnit; breakdown.hero += w.earlyUnit; evidence.push(`${u} 命中前期底座`);
      } else if ((t.midUnits || []).includes(u)) {
        score += w.midUnit; breakdown.hero += w.midUnit; evidence.push(`${u} 可中期承接`);
      } else if ((t.coreUnits || []).includes(u)) {
        score += w.coreUnit; breakdown.hero += w.coreUnit; evidence.push(`${u} 是后续核心`);
      }
    });

    items.forEach(it => {
      if ((t.completedPrefs || []).includes(it)) {
        score += w.coreItem; breakdown.item += w.coreItem; evidence.push(`${it} 命中核心成装`);
      } else if ((t.componentPrefs || []).includes(it)) {
        score += w.component; breakdown.item += w.component; evidence.push(`${it} 命中散件优先级`);
      } else if (COMPONENTS.includes(it)) {
        score += w.looseComponent; breakdown.item += w.looseComponent;
      }
    });

    augments.forEach(h => {
      if ((t.augmentPrefs || []).includes(h)) {
        score += w.augment; breakdown.augment += w.augment; evidence.push(`${h} 命中推荐符文`);
      }
    });
    augCats.forEach(c => {
      if ((t.augmentCats || []).includes(c)) {
        score += w.augmentSignal; breakdown.augment += w.augmentSignal; evidence.push(`${c}符文匹配路线`);
      }
    });

    if (traits.length) {
      const activeTraits = activeTraitsForTemplate(t);
      traits.forEach(sig => {
        const have = activeTraits.get(sig.name) || 0;
        if (have >= sig.count) {
          const pts = w.trait || fallbackWeights.trait;
          score += pts;
          breakdown.trait += pts;
          evidence.push(`${sig.count}${sig.name} 命中激活羁绊`);
        } else {
          missing.push(`路线未激活${sig.count}${sig.name}`);
        }
      });
    }

    const selectedAttack = [...items].filter(x => ATTACK.includes(x)).length;
    const selectedAp = [...items].filter(x => AP.includes(x)).length;
    const selectedTank = [...items].filter(x => TANK.includes(x)).length;
    if (selectedAttack >= 2 && t.role === "法系") {
      score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty; penalties.push("装备偏普攻，法系终局降权");
    }
    if (selectedAp >= 2 && t.role === "普攻") {
      const p = Math.round(w.conflictPenalty * 0.78);
      score -= p; breakdown.penalty -= p; penalties.push("装备偏法系，普攻C降权");
    }
    if (selectedTank >= 2 && t.role !== "九五") {
      score -= w.tankPenalty; breakdown.penalty -= w.tankPenalty; penalties.push("肉装多，需要确认输出装来源");
    }
    if (selectedAttack >= 2 && t.id === "manual-gadget-jax") {
      score += w.attackSynergy; breakdown.synergy += w.attackSynergy;
    }
    if (selectedAttack >= 2 && t.id === "manual-gadget-ap") {
      score -= w.conflictPenalty; breakdown.penalty -= w.conflictPenalty;
    }
    if (t.id === "manual-gadget-jax" && selectedAttack < 2 && !["贾克斯", "德莱文", "孙悟空"].some(u => units.has(u))) {
      const p = Math.round(w.conflictPenalty * 0.65);
      score -= p; breakdown.penalty -= p;
      penalties.push("只有小天才牌、没有普攻装备/机甲核心，先按小天才判断");
    }

    const selectedUnitCount = [...units].filter(u => (t.earlyUnits || []).includes(u)).length;
    if (units.size && selectedUnitCount === 0) missing.push("当前来牌没有命中前期底座");
    const coreMissing = (t.coreUnits || []).filter(x => !units.has(x)).slice(0, 4);
    if (coreMissing.length) missing.push(`后续关键牌：${coreMissing.join("、")}`);
    if (!items.size) missing.push("还没选择装备，路线暂按来牌判断");
    if (!augments.size && !augCats.size) missing.push("还没选择符文，符文权重未生效");

    const signalTotal = breakdown.hero + breakdown.item + breakdown.augment + breakdown.synergy + (breakdown.trait || 0);
    const shares = signalTotal > 0 ? {
      hero: Math.round(breakdown.hero / signalTotal * 100),
      item: Math.round(breakdown.item / signalTotal * 100),
      augment: Math.round(breakdown.augment / signalTotal * 100),
      synergy: Math.round(breakdown.synergy / signalTotal * 100),
    } : { hero: 0, item: 0, augment: 0, synergy: 0 };
    if (traits.length) shares.trait = signalTotal > 0 ? Math.round((breakdown.trait || 0) / signalTotal * 100) : 0;

    return {
      score: Math.max(0, Math.round(score)),
      breakdown,
      shares,
      evidence: uniq(evidence).slice(0, 6),
      missing: uniq(missing).slice(0, 4),
      penalties: uniq(penalties).slice(0, 4),
    };
  }

  function rank(templates, selected, weights, limit) {
    return (templates || []).map(t => ({ template: t, ...scoreTemplate(t, selected, weights) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 5);
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
      ...(selected.units || []),
      ...(selected.items || []),
      ...(selected.augmentCats || []),
      ...(selected.augments || []),
      ...(selected.traits || []).map(x => x.label || `${x.count}${x.name}`),
    ].join("、") || "无";
    const top = ranked[0];
    const t = top.template;
    const backups = ranked.slice(1, 4).map(r => `${r.template.name}(${r.score}分)`).join(" / ") || "无";
    return [
      `信号：${signals}`,
      `首选：${t.name}（${top.score}分，信心${confidence(top.score)}）`,
      `权重：英雄${top.shares?.hero || 0}% / 装备${top.shares?.item || 0}% / 符文${top.shares?.augment || 0}%${top.breakdown?.traitSignals ? ` / 羁绊${top.shares?.trait || 0}%` : ""}`,
      `路线：${(t.route || []).join(" -> ")}`,
      `留牌：${(t.actions.keep || []).slice(0, 8).join("、")}`,
      `装备：${t.actions.item || "-"}`,
      `判断：${t.actions.checkpoint || "-"}`,
      `止损：${t.actions.stopLoss || "-"}`,
      `备选：${backups}`,
    ].join("\n");
  }

  function signalTowerHtml(r) {
    const s = r.shares || {};
    const b = r.breakdown || {};
    const rows = [
      ["hero", "英雄", s.hero || 0, b.hero || 0],
      ["item", "装备", s.item || 0, b.item || 0],
      ["aug", "符文", s.augment || 0, b.augment || 0],
    ];
    if (b.traitSignals) rows.push(["trait", "羁绊", s.trait || 0, b.trait || 0]);
    return `<div class="s2SignalTower">${rows.map(([cls, label, pct, pts]) => `
      <div class="s2Signal ${cls}">
        <div class="lb"><span>${label}</span><span>${pct}% · ${pts}分</span></div>
        <div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      </div>`).join("")}</div>`;
  }

  function selectedFromSignals(signals) {
    const selected = { units: [], items: [], augments: [], augmentCats: [], traits: [] };
    (signals || []).forEach(s => {
      if (!s) return;
      const kind = s.kind || s.type;
      const value = s.value || s.name || s.label;
      if (kind === "traits") {
        const parsed = normalizeSelectedTraits([s])[0];
        if (parsed && !selected.traits.some(x => x.name === parsed.name && x.count === parsed.count)) selected.traits.push(parsed);
        return;
      }
      if (selected[kind] && value && !selected[kind].includes(value)) selected[kind].push(value);
    });
    return selected;
  }

  function actionLines(template, selected, top) {
    const lines = [];
    const selectedItems = new Set(selected.items || []);
    const selectedUnits = new Set(selected.units || []);
    const nextComponent = (template.componentPrefs || []).find(x => !selectedItems.has(x));
    const nextItem = (template.completedPrefs || []).find(x => !selectedItems.has(x));
    const earlyHits = (template.earlyUnits || []).filter(x => selectedUnits.has(x));
    const keep = (template.actions && template.actions.keep || template.earlyUnits || []).slice(0, 4);
    if (nextComponent) lines.push(`下件优先拿${nextComponent}`);
    else if (nextItem) lines.push(`装备往${nextItem}靠`);
    if (earlyHits.length >= 2) lines.push(`围绕${earlyHits.slice(0, 3).join("、")}定线`);
    else if (keep.length) lines.push(`先留${keep.join("、")}`);
    const core = (template.coreUnits || []).filter(x => !selectedUnits.has(x)).slice(0, 3);
    if (core.length) lines.push(`后续找${core.join("、")}`);
    if (top && top.penalties && top.penalties.length) lines.push(top.penalties[0]);
    return uniq(lines).slice(0, 3);
  }

  return {
    COMPONENTS,
    ATTACK,
    AP,
    TANK,
    fallbackWeights,
    scoreTemplate,
    rank,
    confidence,
    buildOutput,
    signalTowerHtml,
    selectedFromSignals,
    actionLines,
    activeTraitsForTemplate,
    parseTraitsInText,
    escText,
  };
});
