"use strict";

// Event-driven team combat simulator. Official unit/item data are the only inputs;
// unsupported mechanics are surfaced through coverage instead of hidden in a score.
const { chess, equip, itemStats } = require("../core/model.js");

const STEP = 0.1;
const MAX_SECONDS = 35;
const CRIT_DAMAGE = 1.4;
const STAR_HP = [1, 1.8, 3.24];
const STAR_AD = [1, 1.5, 2.25];
const BOARD_COLS = 7;
const TRAIT_EFFECTS = {
  "幻灵战队": { tiers: [3, 5, 7], team: { adPct: [10, 35, 60], ap: [10, 35, 60] } },
  "平民英雄": { tiers: [1, 2, 3], team: { manaMult: [1.04, 1.08, 1.2] } },
  "小天才": { tiers: [3, 5], team: { ampPct: [3, 14], ehpMult: [1.03, 1.14] } },
  "星之守护者": { tiers: [3, 5, 7, 9], team: { manaMult: [1.35, 1.9, 2.5, 3.4] } },
  "超级英雄": { tiers: [3], dynamic: "superStars" },
  "福牛守护者": { tiers: [2, 4, 6, 8, 10], team: { armor: [10, 45, 90, 150, 500], mr: [10, 45, 90, 150, 500] } },
  "战斗机甲": { tiers: [3, 5, 8], member: { adPct: [60, 110, 110], ap: [60, 110, 110] } },
  "源计划：激光特工": { tiers: [3, 5, 7, 10], team: { onHitMagic: [27, 35, 55, 80] } },
  "混沌战士": { tiers: [3, 5, 7], team: { ampPct: [25, 40, 70] } },
  "灵能使": { tiers: [2, 4, 6, 8], team: { ap: [30, 60, 80, 120] } },
  "决斗大师": { tiers: [2, 4, 6, 8], member: { asPct: [30, 54, 90, 144] } },
  "强袭枪手": { tiers: [2, 3, 4, 5], team: { adPct: [6, 12, 15, 20] } },
  "护卫": { tiers: [2, 4, 6], team: { armor: [25, 75, 200] }, member: { armor: [50, 150, 400] } },
  "吉祥物": { tiers: [2, 4, 6], team: { ehpMult: [1.015, 1.03, 1.06] } },
  "爱心使者": { tiers: [2, 4, 6], team: { ap: [4, 7, 11] } },
  "斗士": { tiers: [2, 4, 6, 8], member: { hpPct: [20, 45, 75, 110] } },
  "情报特工": { tiers: [2, 3, 4], member: { critPct: [20, 75, 100] } },
  "秘术卫士": { tiers: [2, 3, 4, 5], team: { mr: [20, 40, 60, 90] }, member: { mr: [40, 80, 120, 180] } },
  "精英战士": { tiers: [1, 4], team: { ampPct: [6, 14] } },
  "堕落使者": { tiers: [1], member: { ap: [80] } },
};

const itemByName = Object.fromEntries(Object.values(equip).filter(x => x && x.name).map(x => [x.name, x]));
const heroByName = {};
for (const hero of Object.values(chess)) {
  if (hero && hero.showHeroTag === "1" && !heroByName[hero.name]) heroByName[hero.name] = hero;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function numericAt(group, star) {
  const values = String(group || "").split("/");
  const value = Number.parseFloat(values[Math.min(star, values.length) - 1]);
  return Number.isFinite(value) ? value : 0;
}

function parseAbility(hero, star) {
  const groups = String(hero.skillBriefValue || "").split("|");
  const labels = String(hero.skillValueDesc || "").split("|");
  const desc = String(hero.skillDesc || "");
  const ability = { physical: 0, magic: 0, trueDamage: 0, shield: 0, heal: 0, control: 0, targets: 1, parsed: [], unsupported: [] };
  groups.forEach((group, index) => {
    const label = labels[index] || "";
    const value = numericAt(group, star);
    if (!value) return;
    if (/护盾/.test(label)) { ability.shield += value; ability.parsed.push("shield"); return; }
    if (/治疗/.test(label)) { ability.heal += value; ability.parsed.push("heal"); return; }
    if (/晕眩|恐惧|击飞|控制/.test(label)) { ability.control = Math.max(ability.control, value); ability.parsed.push("control"); return; }
    if (!/伤害/.test(label) || /时长|几率|次数|抗性|减少|衰减/.test(label)) return;
    if (/真实伤害/.test(desc)) ability.trueDamage += value;
    else if (/物理伤害|物理加成/.test(label + desc) && !/魔法伤害/.test(desc)) ability.physical += value;
    else ability.magic += value;
    ability.parsed.push("damage");
  });
  if (/所有敌人|全体敌人/.test(desc)) ability.targets = 8;
  else if (/附近的敌人们|范围内|密度最大|3格距离|邻格/.test(desc)) ability.targets = 3;
  else if (/弹射|多个敌人|敌人们/.test(desc)) ability.targets = 2;
  if (/晕眩|恐惧|击飞|嘲讽/.test(desc) && ability.control === 0) ability.control = 1;
  if (!ability.parsed.length && Number(hero.maxMP) > 0) ability.unsupported.push(hero.skillName || "unknown-skill");
  return ability;
}

function tierIndex(count, tiers) {
  let index = -1;
  tiers.forEach((need, i) => { if (count >= need) index = i; });
  return index;
}

function mergeBonus(target, source, index) {
  if (!source) return;
  for (const [key, values] of Object.entries(source)) {
    const value = Array.isArray(values) ? values[index] : values;
    if (key === "manaMult" || key === "ehpMult") target[key] *= Number(value || 1);
    else target[key] += Number(value || 0);
  }
}

function traitBonuses(team) {
  const counts = {};
  team.forEach(unit => (unit.traits || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; }));
  const active = [];
  for (const [name, count] of Object.entries(counts)) {
    const def = TRAIT_EFFECTS[name];
    if (!def) continue;
    const index = tierIndex(count, def.tiers);
    if (index >= 0) {
      if (def.dynamic === "superStars") {
        const threeStars = team.filter(unit => Number(unit.star || unit.starTarget) === 3).length;
        const ampPct = 20 + threeStars * 6;
        active.push({ name, count, need: def.tiers[index], index, def: { ...def, team: { ampPct: [ampPct] } } });
      } else active.push({ name, count, need: def.tiers[index], index, def });
    }
  }
  return active;
}

function defaultPosition(unit, index, side) {
  const ranged = Number((heroByName[unit.name] || {}).attackRange || 1) >= 3;
  const frontline = unit.role === "frontline" || (!ranged && unit.role !== "mainCarry");
  const row = frontline ? (side === 0 ? 3 : 4) : (side === 0 ? 0 : 7);
  const order = [3, 2, 4, 1, 5, 0, 6, 3, 2];
  return { row, col: order[index % order.length] };
}

function buildUnit(spec, index, side, activeTraits) {
  const hero = heroByName[spec.name];
  if (!hero) return null;
  const star = clamp(Number(spec.star || spec.starTarget || (Number(hero.price) >= 4 ? 2 : 2)), 1, 3);
  const itemNames = (spec.items || []).slice(0, 3);
  const itemIds = itemNames.map(name => itemByName[name] && itemByName[name].id).filter(Boolean);
  const stats = itemIds.map(itemStats);
  const bonus = { adPct: 0, ap: 0, asPct: 0, ampPct: 0, critPct: 0, armor: 0, mr: 0, hpPct: 0, manaMult: 1, onHitMagic: 0, ehpMult: 1 };
  activeTraits.forEach(active => {
    mergeBonus(bonus, active.def.team, active.index);
    if ((spec.traits || []).includes(active.name)) mergeBonus(bonus, active.def.member, active.index);
  });
  const mechanicSupported = !!(spec.mechanic && (
    (spec.mechanic.requiredAugment === "姐妹" && hero.name === "金克丝")
    || (spec.mechanic.requiredAugment === "无情连打" && hero.name === "贾克斯")
  ));
  if (mechanicSupported) bonus.ap += 40; // 姐妹中位口径：20次击杀×2%法强。
  const hpBase = Number(hero.initHP) * STAR_HP[star - 1];
  const hpFlat = stats.reduce((sum, row) => sum + row.hp, 0);
  const hp = (hpBase * (1 + bonus.hpPct / 100) + hpFlat) * bonus.ehpMult;
  const position = spec.position || defaultPosition(spec, index, side);
  const ability = parseAbility(hero, star);
  return {
    id: `${side}:${index}:${hero.id}`,
    heroId: hero.id,
    name: hero.name,
    side,
    star,
    price: Number(hero.price),
    role: spec.role || "utility",
    traits: spec.traits || [],
    items: itemNames,
    itemIds,
    row: position.row,
    col: position.col,
    hp,
    maxHp: hp,
    shield: 0,
    ad: Number(hero.initAttackDamage) * STAR_AD[star - 1] * (1 + (stats.reduce((s, x) => s + x.adPct, 0) + bonus.adPct) / 100),
    apMult: 1 + (stats.reduce((s, x) => s + x.ap, 0) + bonus.ap) / 100,
    attackSpeed: Number(hero.attackSpeed) * (1 + (stats.reduce((s, x) => s + x.asPct, 0) + bonus.asPct) / 100),
    critChance: clamp((Number(hero.criticalStrikeChance || 25) + stats.reduce((s, x) => s + x.critPct, 0) + bonus.critPct) / 100, 0, 1),
    amp: 1 + (stats.reduce((s, x) => s + x.ampPct, 0) + bonus.ampPct) / 100,
    armor: Number(hero.armor) + stats.reduce((s, x) => s + x.armor, 0) + bonus.armor,
    mr: Number(hero.magicResist) + stats.reduce((s, x) => s + x.mr, 0) + bonus.mr,
    range: Math.max(1, Number(hero.attackRange || 1) + (itemNames.includes("疾射火炮") ? 1 : 0)),
    mana: Number(hero.initMP) + stats.reduce((s, x) => s + x.startMana, 0),
    maxMana: Number(hero.maxMP),
    manaMult: bonus.manaMult,
    onHitMagic: bonus.onHitMagic,
    mechanic: spec.mechanic || null,
    mechanicSupported,
    ability,
    attackTimer: 0,
    moveTimer: 0,
    stunnedUntil: 0,
    rage: 0,
    titan: 0,
    attacks: 0,
    casts: 0,
    jaxStacks: 0,
    relentlessAs: 0,
    kaisaAs: 0,
    adBuffUntil: 0,
    adBuffAmount: 0,
    damage: 0,
    healing: 0,
    alive: true,
  };
}

function buildTeam(specs, side) {
  const active = traitBonuses(specs);
  return specs.map((spec, index) => buildUnit(spec, index, side, active)).filter(Boolean);
}

function distance(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function mitigation(resist) {
  return resist >= 0 ? 100 / (100 + resist) : 2 - 100 / (100 - resist);
}

function deal(source, target, raw, type, rng, log, time) {
  if (!target || !target.alive || raw <= 0) return 0;
  const variance = 0.95 + rng() * 0.1;
  const reduced = type === "true" ? raw : raw * mitigation(type === "physical" ? target.armor : target.mr);
  let amount = Math.max(0, reduced * source.amp * variance);
  const shieldHit = Math.min(target.shield, amount);
  target.shield -= shieldHit;
  amount -= shieldHit;
  target.hp -= amount;
  source.damage += shieldHit + amount;
  target.mana = Math.min(target.maxMana, target.mana + (shieldHit + amount) / Math.max(1, target.maxHp) * 25);
  log.push({ time, type: "damage", source: source.name, target: target.name, amount: shieldHit + amount });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    log.push({ time, type: "death", source: source.name, target: target.name });
  }
  return shieldHit + amount;
}

function nearest(source, enemies) {
  return enemies.filter(x => x.alive).sort((a, b) => distance(source, a) - distance(source, b) || a.hp - b.hp || a.id.localeCompare(b.id))[0];
}

function moveToward(source, target) {
  if (source.row !== target.row) source.row += Math.sign(target.row - source.row);
  else if (source.col !== target.col) source.col += Math.sign(target.col - source.col);
}

function attack(source, target, rng, log, time) {
  source.attacks++;
  const crit = rng() < source.critChance;
  const raw = (source.ad + (source.adBuffUntil > time ? source.adBuffAmount : 0)) * (crit ? CRIT_DAMAGE : 1);
  deal(source, target, raw, "physical", rng, log, time);
  if (source.onHitMagic) deal(source, target, source.onHitMagic, "magic", rng, log, time);
  if (source.items.includes("鬼索的狂暴之刃")) source.rage += 0.05;
  if (source.items.includes("泰坦的坚决")) source.titan = Math.min(25, source.titan + 1);
  if (source.items.includes("斯塔缇克电刃") && source.attacks % 3 === 0) deal(source, target, 30, "magic", rng, log, time);
  if (source.name === "贾克斯" && source.attacks % 3 === 0) {
    const groups = String((heroByName[source.name] || {}).skillBriefValue || "").split("|");
    const base = numericAt(groups[0], source.star);
    const increment = numericAt(groups[1], source.star);
    deal(source, target, (base + Math.min(7, source.jaxStacks) * increment) * source.apMult, "magic", rng, log, time);
    source.jaxStacks++;
    if (source.mechanicSupported && source.mechanic.requiredAugment === "无情连打") {
      source.relentlessAs += Number(source.mechanic.attackSpeedPerThird || 0.12);
      log.push({ time, type: "augment-stack", source: source.name, augment: "无情连打", value: source.relentlessAs });
    }
  }
  if (source.name === "卡莎" && source.attacks % 3 === 0 && source.ability.magic > 0) {
    deal(source, target, source.ability.magic * source.apMult, "magic", rng, log, time);
  }
  source.mana = Math.min(source.maxMana, source.mana + (10 + (source.items.includes("朔极之矛") ? 5 : 0)) * source.manaMult);
}

function cast(source, enemies, allies, rng, log, time) {
  const ability = source.ability;
  const primary = nearest(source, enemies);
  if (!primary) return;
  source.casts++;
  source.mana = 0;
  if (source.name === "卡莎") {
    source.kaisaAs += 1;
    source.attackSpeed = clamp(source.attackSpeed + Number((heroByName[source.name] || {}).attackSpeed || 0), 0.2, 5);
    log.push({ time, type: "cast", source: source.name, targets: [source.name] });
    return;
  }
  if (source.name === "艾希") {
    source.adBuffAmount = numericAt(String((heroByName[source.name] || {}).skillBriefValue || "").split("|")[0], source.star) * source.apMult;
    source.adBuffUntil = time + 5;
    log.push({ time, type: "cast", source: source.name, targets: [source.name] });
    return;
  }
  const targets = enemies.filter(x => x.alive).sort((a, b) => distance(primary, a) - distance(primary, b) || a.id.localeCompare(b.id)).slice(0, ability.targets);
  targets.forEach(target => {
    if (ability.physical) deal(source, target, ability.physical * (source.ad / Math.max(1, Number((heroByName[source.name] || {}).initAttackDamage))), "physical", rng, log, time);
    if (ability.magic) deal(source, target, ability.magic * source.apMult, "magic", rng, log, time);
    if (ability.trueDamage) deal(source, target, ability.trueDamage * source.apMult, "true", rng, log, time);
    if (ability.control > 0 && target.alive) target.stunnedUntil = Math.max(target.stunnedUntil, time + Math.min(8, ability.control));
  });
  if (source.mechanicSupported && source.mechanic.requiredAugment === "姐妹") {
    const extra = enemies.filter(x => x.alive && !targets.includes(x)).sort((a, b) => distance(primary, a) - distance(primary, b))[0];
    if (extra && ability.magic) deal(source, extra, ability.magic * source.apMult * 0.7, "magic", rng, log, time);
  }
  if (ability.shield > 0) source.shield += ability.shield * source.apMult;
  if (ability.heal > 0) {
    const amount = Math.min(source.maxHp - source.hp, ability.heal * source.apMult);
    source.hp += amount;
    source.healing += amount;
  }
  if (source.items.includes("海克斯科技枪刃") || source.items.includes("汲取剑")) {
    const amount = Math.min(source.maxHp - source.hp, source.damage * 0.03);
    source.hp += amount;
    source.healing += amount;
  }
  log.push({ time, type: "cast", source: source.name, targets: targets.map(x => x.name) });
}

function stepUnit(unit, allies, enemies, rng, log, time) {
  if (!unit.alive || unit.stunnedUntil > time) return;
  const target = nearest(unit, enemies);
  if (!target) return;
  if (unit.maxMana > 0 && unit.mana >= unit.maxMana) {
    cast(unit, enemies, allies, rng, log, time);
    return;
  }
  const dist = distance(unit, target);
  if (dist > unit.range) {
    unit.moveTimer -= STEP;
    if (unit.moveTimer <= 0) {
      moveToward(unit, target);
      unit.moveTimer = 0.5;
      log.push({ time, type: "move", source: unit.name });
    }
    return;
  }
  unit.attackTimer -= STEP;
  if (unit.attackTimer <= 0) {
    attack(unit, target, rng, log, time);
    const titanSpeed = unit.items.includes("泰坦的坚决") ? unit.titan * 0.02 : 0;
    unit.attackTimer = 1 / clamp(unit.attackSpeed * (1 + unit.rage + titanSpeed + unit.relentlessAs), 0.2, 5);
  }
}

function teamHealth(team) {
  return team.reduce((sum, unit) => sum + Math.max(0, unit.hp) + unit.shield, 0);
}

function coverageFor(team) {
  const skills = team.filter(unit => unit.maxMana > 0);
  const mechanisms = team.filter(unit => unit.mechanic);
  const denominator = skills.length + mechanisms.length;
  const supportedSkills = skills.filter(unit => unit.ability.parsed.length > 0 || unit.name === "艾希").length;
  const supportedMechanisms = mechanisms.filter(unit => unit.mechanicSupported).length;
  return denominator ? (supportedSkills + supportedMechanisms) / denominator : 1;
}

function unsupportedFor(team) {
  const rows = team.flatMap(unit => unit.ability.unsupported.map(name => `${unit.name}:${name}`));
  team.filter(unit => unit.mechanic && !unit.mechanicSupported).forEach(unit => rows.push(`机制:${unit.mechanic.requiredAugment || unit.mechanic.type || "unknown"}`));
  return [...new Set(rows)];
}

function simulateBattle(leftSpecs, rightSpecs, options = {}) {
  const rng = seeded(options.seed || 1);
  const maxSeconds = options.maxSeconds || MAX_SECONDS;
  const left = buildTeam(leftSpecs, 0);
  const right = buildTeam(rightSpecs, 1);
  const initialLeft = teamHealth(left);
  const initialRight = teamHealth(right);
  const log = [];
  let time = 0;
  while (time < maxSeconds && left.some(x => x.alive) && right.some(x => x.alive)) {
    const order = [...left, ...right].filter(x => x.alive).sort((a, b) => b.attackSpeed - a.attackSpeed || a.id.localeCompare(b.id));
    order.forEach(unit => stepUnit(unit, unit.side === 0 ? left : right, unit.side === 0 ? right : left, rng, log, time));
    time = Math.round((time + STEP) * 10) / 10;
  }
  const leftHealth = teamHealth(left);
  const rightHealth = teamHealth(right);
  const leftAlive = left.filter(x => x.alive).length;
  const rightAlive = right.filter(x => x.alive).length;
  const margin = clamp(leftHealth / Math.max(1, initialLeft) - rightHealth / Math.max(1, initialRight), -1, 1);
  const winner = leftAlive === rightAlive && Math.abs(margin) < 0.01 ? -1 : (leftAlive > 0 && rightAlive === 0) || margin > 0 ? 0 : 1;
  const leftCoverage = coverageFor(left);
  const rightCoverage = coverageFor(right);
  const leftUnsupported = unsupportedFor(left);
  const rightUnsupported = unsupportedFor(right);
  return {
    winner,
    margin,
    seconds: time,
    left: { alive: leftAlive, healthRatio: leftHealth / Math.max(1, initialLeft), damage: left.reduce((s, x) => s + x.damage, 0) },
    right: { alive: rightAlive, healthRatio: rightHealth / Math.max(1, initialRight), damage: right.reduce((s, x) => s + x.damage, 0) },
    coverage: (leftCoverage + rightCoverage) / 2,
    leftCoverage,
    rightCoverage,
    unsupported: [...new Set([...leftUnsupported, ...rightUnsupported])],
    leftUnsupported,
    rightUnsupported,
    eventCount: log.length,
    log: options.keepLog ? log : undefined,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runAssertions() {
  const basic = [
    { name: "波比", role: "frontline", star: 2, traits: ["护卫", "小天才"], items: ["狂徒铠甲"] },
    { name: "安妮", role: "mainCarry", star: 2, traits: ["小天才", "福牛守护者", "灵能使"], items: ["珠光护手"] },
  ];
  const weak = [
    { name: "孙悟空", role: "frontline", star: 1, traits: ["战斗机甲", "护卫"], items: [] },
    { name: "德莱文", role: "mainCarry", star: 1, traits: ["战斗机甲", "精英战士"], items: [] },
  ];
  const a = simulateBattle(basic, weak, { seed: 7, keepLog: true });
  const b = simulateBattle(weak, basic, { seed: 7 });
  assert(a.eventCount > 0 && a.coverage > 0, "battle must emit events and coverage");
  assert(a.winner === 0 && b.winner === 1, "stronger board should win after side swap");
  assert(Math.sign(a.margin) === -Math.sign(b.margin), "paired side swap should invert margin");
  assert(a.log.some(row => row.type === "cast"), "mana units must cast in event timeline");
  assert(Number.isFinite(a.margin) && Number.isFinite(a.seconds), "battle metrics must stay finite");
  const jaxShell = mechanic => [
    { name: "孙悟空", role: "frontline", star: 2, traits: ["战斗机甲", "护卫"], items: ["狂徒铠甲"] },
    { name: "德莱文", role: "utility", star: 1, traits: ["战斗机甲", "精英战士"], items: [] },
    { name: "贾克斯", role: "mainCarry", star: 2, traits: ["战斗机甲", "斗士"], items: ["泰坦的坚决", "鬼索的狂暴之刃", "疾射火炮"], mechanic },
  ];
  const durableTarget = [
    { name: "阿利斯塔", role: "frontline", star: 3, traits: ["福牛守护者", "吉祥物", "秘术卫士"], items: ["狂徒铠甲", "石像鬼石板甲", "巨龙之爪"] },
  ];
  const plainJax = simulateBattle(jaxShell(null), durableTarget, { seed: 19, maxSeconds: 14, keepLog: true });
  const relentlessJax = simulateBattle(jaxShell({ requiredAugment: "无情连打", attackSpeedPerThird: 0.12 }), durableTarget, { seed: 19, maxSeconds: 14, keepLog: true });
  assert(relentlessJax.log.some(row => row.type === "augment-stack" && row.augment === "无情连打"), "relentless assault must stack after Jax third attacks");
  assert(relentlessJax.seconds < plainJax.seconds && relentlessJax.margin > plainJax.margin, "relentless assault must improve paired-seed Jax kill time and margin");
  assert(relentlessJax.leftCoverage === 1 && !relentlessJax.leftUnsupported.includes("机制:无情连打"), "relentless assault must be a covered combat mechanic");
  console.log("combat-engine assertions passed");
}

module.exports = { simulateBattle, buildTeam, parseAbility, traitBonuses, heroByName, itemByName, runAssertions };
if (require.main === module) runAssertions();
