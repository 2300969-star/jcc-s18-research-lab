"use strict";

// Converts official hero-augment text into a small deterministic event algebra.
// An event is emitted only when both its trigger and numeric payload are explicit.
const EXPECTED_STACKS = 3;

const SUPPORTED_EVENT_TYPES = new Set([
  "stat",
  "max-mana",
  "spell-multiplier",
  "spell-echo",
  "cast-control",
  "nth-attack-stat",
  "nth-attack",
  "cast-max-hp-damage",
  "spell-crit",
]);

function number(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? Number(match[1]) : 0;
}

function integerToken(value) {
  const chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  return chinese[value] || Number(value) || 0;
}

function addStat(events, scope, stat, value, source) {
  if (Number.isFinite(value) && value !== 0) events.push({ type: "stat", scope, stat, value, source });
}

function compileAugmentEvents(desc) {
  const text = String(desc || "").replace(/\s+/g, " ").trim();
  const events = [];
  const notes = [];
  const sentences = text.split(/[。；]/).filter(Boolean);
  const targetText = sentences.filter(sentence => !/你的弈子们|友军们|邻格没有友军的友军|备战席|小小英雄/.test(sentence)).join("。");
  const teamText = sentences.filter(sentence => /你的弈子们/.test(sentence) && !/每有1|每失去10/.test(sentence)).join("。");
  const stackFactor = /叠加|每次施放.*永久提升/.test(targetText) ? EXPECTED_STACKS : 1;
  const nthAttackStat = targetText.match(/每第?([一二三四五六七八九\d]+)次攻击后[^。]*?获得[^。]*?叠加[^。]*?(\d+(?:\.\d+)?)%攻击速度/);
  const targetStats = [
    ["adPct", /(\d+(?:\.\d+)?)%?(?:物理加成|攻击力)/],
    ["ap", /(\d+(?:\.\d+)?)%?法术加成/],
    ["asPct", /(\d+(?:\.\d+)?)%?(?:攻击速度|攻速)/],
    ["ampPct", /(\d+(?:\.\d+)?)%?伤害增幅/],
    ["armor", /(\d+(?:\.\d+)?)护甲/],
    ["mr", /(\d+(?:\.\d+)?)(?:魔法抗性|魔抗)/],
    ["hpFlat", /(\d+(?:\.\d+)?)额外生命值/],
    ["critPct", /(\d+(?:\.\d+)?)%暴击(?:几率|率)/],
    ["damageReduction", /(\d+(?:\.\d+)?)%伤害减免/],
  ];
  const referencedIncrement = number(targetText, /这个加成[^。]*?每次施放[^。]*?永久提升(\d+(?:\.\d+)?)%?/);
  for (const [stat, pattern] of targetStats) {
    if (stat === "asPct" && nthAttackStat) continue;
    let value = number(targetText, pattern);
    const permanentIncrement = targetText.match(new RegExp(`每次施放[^。]*?永久提升(\\d+(?:\\.\\d+)?)%?(?:${stat === "adPct" ? "物理加成|攻击力" : stat === "ap" ? "法术加成" : "(?!)"})`));
    if (permanentIncrement) value += Number(permanentIncrement[1]) * EXPECTED_STACKS;
    else if (value && referencedIncrement) value += referencedIncrement * EXPECTED_STACKS;
    else if (/(?:施放|受到或造成伤害)[^。]*?获得[^。]*?叠加/.test(targetText)) value *= stackFactor;
    if (value) addStat(events, "target", stat, value, "official-text");
  }

  if (nthAttackStat) {
    events.push({
      type: "nth-attack-stat",
      scope: "target",
      every: integerToken(nthAttackStat[1]),
      stat: "asPct",
      value: Number(nthAttackStat[2]),
      stacking: true,
    });
  }

  const targetPairedResist = targetText.match(/(\d+(?:\.\d+)?)护甲和魔法抗性/);
  if (targetPairedResist && !events.some(event => event.scope === "target" && event.stat === "mr")) {
    addStat(events, "target", "mr", Number(targetPairedResist[1]), "paired-resist");
  }

  const teamStats = [
    ["armor", /(\d+(?:\.\d+)?)护甲/],
    ["mr", /(\d+(?:\.\d+)?)(?:魔法抗性|魔抗)/],
    ["asPct", /(\d+(?:\.\d+)?)%攻击速度/],
    ["ap", /(\d+(?:\.\d+)?)%?法术加成/],
    ["adPct", /(\d+(?:\.\d+)?)%?(?:物理加成|攻击力)/],
    ["hpFlat", /(\d+(?:\.\d+)?)额外生命值/],
  ];
  for (const [stat, pattern] of teamStats) addStat(events, "team", stat, number(teamText, pattern), "official-text");

  const pairedResist = teamText.match(/(\d+(?:\.\d+)?)护甲和魔法抗性/);
  if (pairedResist && !events.some(event => event.scope === "team" && event.stat === "mr")) {
    addStat(events, "team", "mr", Number(pairedResist[1]), "paired-resist");
  }

  if (/获得双倍的此加成/.test(text)) {
    const teamArmor = events.find(event => event.scope === "team" && event.stat === "armor");
    const teamMr = events.find(event => event.scope === "team" && event.stat === "mr");
    if (teamArmor) addStat(events, "target", "armor", teamArmor.value, "double-team-bonus");
    if (teamMr) addStat(events, "target", "mr", teamMr.value, "double-team-bonus");
  }

  const manaReduction = number(text, /(?:法力值消耗|技能消耗)降低(\d+(?:\.\d+)?)/);
  if (manaReduction) events.push({ type: "max-mana", scope: "target", delta: -manaReduction });

  const directSpellAmp = number(text, /技能伤害提升(\d+(?:\.\d+)?)%/);
  if (directSpellAmp) events.push({ type: "spell-multiplier", scope: "target", multiplier: 1 + directSpellAmp / 100, cadence: 1 });

  const everySecondExtra = number(text, /每第2次技能施放[^。]*?造成(\d+(?:\.\d+)?)%额外伤害/);
  if (everySecondExtra) {
    events.push({ type: "spell-multiplier", scope: "target", multiplier: 1 + everySecondExtra / 200, cadence: 2 });
  }

  const secondProjectile = number(text, /第二个(?:气泡|弹体|技能)[^。]*?造成(\d+(?:\.\d+)?)%伤害/);
  if (secondProjectile) events.push({ type: "spell-echo", scope: "target", count: 1, ratio: secondProjectile / 100 });

  const extraTarget = text.match(/还会对(\d+)名[^。]*?(?:射击|发射)[^。]*?造成(\d+(?:\.\d+)?)%伤害/);
  if (extraTarget) events.push({ type: "spell-echo", scope: "target", count: Number(extraTarget[1]), ratio: Number(extraTarget[2]) / 100 });

  const castControl = number(text, /(?:晕眩|击飞|恐惧)[^。]*?(\d+(?:\.\d+)?)秒/);
  if (castControl) events.push({ type: "cast-control", scope: "target", seconds: castControl, targetMode: "ability-targets" });

  const nth = text.match(/每第([一二三四五六七八九\d]+)次攻击[^。]*?(\d+(?:\.\d+)?)%最大生命值的魔法伤害[^。]*?最大生命值(\d+(?:\.\d+)?)%的治疗/);
  if (nth) {
    events.push({
      type: "nth-attack",
      scope: "target",
      every: integerToken(nth[1]),
      damageMaxHpPct: Number(nth[2]) / 100,
      healMaxHpPct: Number(nth[3]) / 100,
      damageType: "magic",
    });
  }

  const castMaxHp = number(text, /主要目标造成相当于他(\d+(?:\.\d+)?)%最大生命值的额外伤害/);
  if (castMaxHp) events.push({ type: "cast-max-hp-damage", scope: "target", ratio: castMaxHp / 100, damageType: "magic" });

  if (/技能范围更广/.test(text)) notes.push("技能范围扩大缺少明确目标数，未折算额外目标");
  if (stackFactor > 1) notes.push(`可叠加属性按期望${EXPECTED_STACKS}层折算`);
  if (/提升至(?:双倍|三倍)/.test(text)) notes.push("条件倍率保留基础值，未假定触发时点");
  if (/技能可以暴击/.test(text)) events.push({ type: "spell-crit", scope: "target" });
  if (/首次跌到|已损失生命值|参与击败|击败一名敌人|获得击败/.test(text)) notes.push("生命阈值或击杀归属未折算");
  if (/邻格没有友军|携带了【夜之锋刃】|每有1个已被占用|每失去10生命值/.test(text)) notes.push("条件对象无法由静态棋盘唯一确定，未折算");
  if (/每(?:4|5)秒/.test(text)) notes.push("周期属性仅保留初始值，未折算后续时点");
  if (/持续造成额外的\d+(?:\.\d+)?%技能伤害/.test(text)) notes.push("持续伤害需要时间分布，未折算为瞬时伤害");
  if (/参与击败|击杀/.test(text) && !events.length) notes.push("击杀归属机制未量化");

  const supportedEvents = events.filter(event => SUPPORTED_EVENT_TYPES.has(event.type));
  return {
    events: supportedEvents,
    complete: supportedEvents.length > 0 && notes.length === 0,
    supported: supportedEvents.length > 0,
    confidence: supportedEvents.length ? (notes.length ? 0.62 : stackFactor > 1 ? 0.68 : 0.86) : 0,
    notes,
    stackFactor,
  };
}

function bonusFromEvents(events, scopes = ["target"]) {
  const allowed = new Set(scopes);
  const bonus = {};
  for (const event of events || []) {
    if (!allowed.has(event.scope)) continue;
    if (event.type === "stat") bonus[event.stat] = Number(bonus[event.stat] || 0) + Number(event.value || 0);
    if (event.type === "max-mana") bonus.maxManaDelta = Number(bonus.maxManaDelta || 0) + Number(event.delta || 0);
  }
  return bonus;
}

function transformSimulation(sim, events, context = {}) {
  if (!sim) return sim;
  let spellFactor = 1;
  let procDamage = 0;
  const maxHp = Number(sim.maxHp || context.maxHp || 0);
  const seconds = Number(sim.seconds || context.seconds || 30);
  for (const event of events || []) {
    if (event.scope !== "target") continue;
    if (event.type === "spell-multiplier") spellFactor *= Number(event.multiplier || 1);
    if (event.type === "spell-echo") spellFactor += Number(event.count || 0) * Number(event.ratio || 0);
    if (event.type === "nth-attack" && maxHp > 0) {
      procDamage += Math.floor(Number(sim.attacks || 0) / Math.max(1, Number(event.every || 1)))
        * maxHp * Number(event.damageMaxHpPct || 0) * 0.5;
    }
    if (event.type === "cast-max-hp-damage" && maxHp > 0) {
      procDamage += Number(sim.casts || 0) * maxHp * Number(event.ratio || 0) * 0.5;
    }
  }
  const spell = Number(sim.spell || 0) * spellFactor;
  const proc = Number(sim.proc || 0) + procDamage / Math.max(1, seconds);
  return { ...sim, spell, proc, dps: Number(sim.auto || 0) + spell + proc, eventSpellFactor: spellFactor };
}

function runAssertions() {
  const bubble = compileAugmentEvents("提供1个【佐伊】。她的技能会对一个不同的目标发射第二个气泡，造成65%伤害。");
  if (bubble.events[0].type !== "spell-echo" || bubble.events[0].ratio !== 0.65) throw new Error("双重气泡事件解析失败");
  const punch = compileAugmentEvents("提供1个【加里奥】。他施放技能的法力值消耗降低70，技能伤害提升150%并且会击飞目标2秒。");
  if (bonusFromEvents(punch.events).maxManaDelta !== -70 || punch.events.filter(event => event.type === "cast-control").length !== 1) throw new Error("正义冲拳事件解析失败");
  const fiora = compileAugmentEvents("提供1个【菲奥娜】。你最强大的那个【菲奥娜】对相同弈子的每第4次攻击会造成她16%最大生命值的魔法伤害，并为【菲奥娜】提供她最大生命值10%的治疗效果。");
  if (fiora.events[0].type !== "nth-attack" || fiora.events[0].damageMaxHpPct !== 0.16) throw new Error("无双挑战事件解析失败");
  const nasus = compileAugmentEvents("提供1个【内瑟斯】。你最强大的那个【内瑟斯】拥有15%物理加成，这个加成在他每次施放技能时都会永久提升2%。");
  if (bonusFromEvents(nasus.events).adPct !== 21) throw new Error("永久叠层必须按基础值加期望层数计算");
  const jax = compileAugmentEvents("提供1个【贾克斯】。每第三次攻击后，你最强大的那个【贾克斯】会获得可以叠加的12%攻击速度。");
  if (jax.events[0].type !== "nth-attack-stat" || bonusFromEvents(jax.events).asPct) throw new Error("无情连打必须按攻击事件叠层，不能静态注入攻速");
  console.log("event-model assertions passed");
}

module.exports = {
  EXPECTED_STACKS,
  SUPPORTED_EVENT_TYPES,
  compileAugmentEvents,
  bonusFromEvents,
  transformSimulation,
  runAssertions,
};

if (require.main === module) runAssertions();
