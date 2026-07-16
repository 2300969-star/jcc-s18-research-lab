"use strict";

const fs = require("fs");
const childProcess = require("child_process");
const { profiles } = require("../core/mechanic-profiles.js");
const { SUPPORTED_EVENT_TYPES } = require("../core/event-model.js");
const { parseAbility, heroByName } = require("../sim/combat-engine.js");
const { runItemsAudit } = require("../audit/audit-items.js");
const { runSkillParserAudit } = require("../audit/audit-skill-parser.js");
const { resultPath, reportPath, ensureOutputDirs } = require("../lib/project-paths.js");

function readResult(name) {
  return JSON.parse(fs.readFileSync(resultPath(name), "utf8"));
}

function baselineResult(name) {
  try {
    return JSON.parse(childProcess.execFileSync("git", ["show", `pre-event-model:artifacts/results/${name}`], {
      cwd: require("../lib/project-paths.js").ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    }));
  } catch (_) {
    return null;
  }
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = typeof key === "function" ? key(row) : row[key];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function buildResult() {
  const stage2 = readResult("stage2_matcher_results.json");
  const policy = readResult("strategy_policy_results.json");
  const battle = readResult("virtual_battle_results.json");
  const certification = readResult("route_certification_results.json");
  const oldStage2 = baselineResult("stage2_matcher_results.json");
  const oldPolicy = baselineResult("strategy_policy_results.json");
  const oldBattle = baselineResult("virtual_battle_results.json");
  const oldNames = new Set((oldStage2 && oldStage2.templates || []).map(row => row.name));
  const certById = new Map(certification.certificates.map(row => [row.templateId, row]));
  const eventProfiles = profiles.filter(profile => profile.events && profile.events.length);
  const itemAudit = runItemsAudit();
  const skillAudit = runSkillParserAudit();
  const keySkills = ["波比", "塞拉斯", "雷克顿", "布里茨", "科加斯", "拉莫斯"].map(name => ({
    name,
    parsed: parseAbility(heroByName[name], 2),
  }));
  const newRoutes = stage2.templates.filter(row => !oldNames.has(row.name)).map(row => {
    const cert = certById.get(row.id) || row.certification || {};
    const plan = policy.plans.find(candidate => candidate.augment === (row.mechanic && row.mechanic.requiredAugment));
    return {
      id: row.id,
      name: row.name,
      augment: row.mechanic && row.mechanic.requiredAugment || "",
      evidenceLevel: cert.evidenceLevel || "未认证",
      policyCertified: !!(plan && plan.certified),
    };
  });
  return {
    generated: new Date().toISOString(),
    experiment: "event-model-v1",
    baselineTag: oldStage2 ? "pre-event-model" : null,
    coverage: {
      catalog: profiles.length,
      supported: profiles.filter(profile => profile.supported).length,
      unsupported: profiles.filter(profile => !profile.supported).length,
      eventProfiles: eventProfiles.length,
      eventTypes: countBy(eventProfiles.flatMap(profile => profile.events), "type"),
      partialProfiles: eventProfiles.filter(profile => /部分覆盖/.test(profile.basis || "")).length,
      itemBasicStatGaps: itemAudit.summary.basicStatGaps,
      ignoredDamageHeroes: skillAudit.summary.ignoredDamageHeroes,
      zeroParsedDamageWithDamageText: skillAudit.summary.zeroParsedDamageWithDamageText,
    },
    baseline: oldPolicy && oldBattle ? {
      supported: oldPolicy.coverage.numericProfiles,
      templates: oldStage2.templates.length,
      compiledPolicies: oldPolicy.coverage.compiled,
      certifiedPolicies: oldPolicy.coverage.certified,
      virtualBattles: oldBattle.totalBattles,
      averageCoverage: oldBattle.averageCoverage,
    } : null,
    current: {
      templates: stage2.templates.length,
      compiledPolicies: policy.coverage.compiled,
      certifiedPolicies: policy.coverage.certified,
      virtualBattles: battle.totalBattles,
      averageCoverage: battle.averageCoverage,
      sideBias: battle.sideBias,
      evidenceLevels: countBy(certification.certificates, "evidenceLevel"),
    },
    newRoutes,
    keySkills,
    certifiedPolicies: policy.plans.filter(plan => plan.certified).map(plan => ({
      id: plan.id,
      augment: plan.augment,
      strategicCarry: plan.strategicCarry,
      stages: plan.stages.filter(stage => stage.certified).map(stage => ({ key: stage.key, text: stage.text, lcb95: stage.threshold && stage.threshold.lcb95 })),
    })),
    watchPolicies: policy.plans.filter(plan => !plan.certified).map(plan => ({ id: plan.id, augment: plan.augment })),
    virtualTop: battle.rankings.slice(0, 10).map(row => ({ name: row.name, robustScore: row.robustScore, coverage: row.coverage })),
    interpretation: [
      "事件覆盖表示当前候选棋盘中的已声明机制可执行，不等于全游戏机制已经100%建模。",
      "新路线只有同时具备策略正LCB与L2.5证据时才可升级为稳健推荐；L1.5仅保留观察。",
      "范围扩大、击杀归属和周期叠层缺少唯一时点时保守降级，不使用猜测值补齐。",
    ],
  };
}

function report(result) {
  const lines = [
    "# 统一事件模型实验",
    "",
    `生成时间：${result.generated}`,
    "",
    "## 研究问题",
    "",
    "把英雄强化、技能倍率与装备属性统一编译为可执行事件后，覆盖率是否提高，新增路线是否经得住策略交接和虚拟实战的双重验证。",
    "",
    "## 覆盖变化",
    "",
    `- 英雄强化：${result.baseline ? `${result.baseline.supported} -> ` : ""}${result.coverage.supported}/${result.coverage.catalog}。`,
    `- 条件策略：${result.baseline ? `${result.baseline.compiledPolicies} -> ` : ""}${result.current.compiledPolicies} 条；正 LCB 认证 ${result.baseline ? `${result.baseline.certifiedPolicies} -> ` : ""}${result.current.certifiedPolicies} 条。`,
    `- 路线模板：${result.baseline ? `${result.baseline.templates} -> ` : ""}${result.current.templates} 条。`,
    `- 虚拟实战：${result.baseline ? `${result.baseline.virtualBattles} -> ` : ""}${result.current.virtualBattles} 场；当前候选集事件覆盖 ${result.current.averageCoverage}%。`,
    `- 装备基础属性缺口：${result.coverage.itemBasicStatGaps}；有伤害文本但零伤害解析英雄：${result.coverage.zeroParsedDamageWithDamageText}。`,
    "",
    "## 事件算子",
    "",
    "| 算子 | 数量 |",
    "| --- | ---: |",
    ...Object.entries(result.coverage.eventTypes).sort((a, b) => b[1] - a[1]).map(([name, count]) => `| ${name} | ${count} |`),
    "",
    "## 新增路线",
    "",
    "| 路线 | 条件 | 证据层 | 策略正LCB |",
    "| --- | --- | --- | --- |",
    ...result.newRoutes.map(row => `| ${row.name} | ${row.augment || "-"} | ${row.evidenceLevel} | ${row.policyCertified ? "是" : "否"} |`),
    "",
    "## 判读",
    "",
    ...result.interpretation.map(text => `- ${text}`),
    "",
    "当前最重要的新结论：双重气泡佐伊、扩散射击薇恩、无双挑战菲奥娜已经形成可执行事件并通过至少一个阶段的正 LCB；金钟罩李青虽然虚拟排名很高，但交接策略未认证且路线仍为 L1.5，不能写成版本答案。",
    "",
  ];
  return lines.join("\n");
}

function assertResult(result) {
  if (result.coverage.catalog !== 122) throw new Error("英雄强化目录必须保持122条");
  if (profiles.flatMap(profile => profile.events || []).some(event => !SUPPORTED_EVENT_TYPES.has(event.type))) throw new Error("存在战斗引擎不认识的事件算子");
  if (result.coverage.itemBasicStatGaps !== 0) throw new Error("装备基础属性解析仍有缺口");
  const skill = Object.fromEntries(result.keySkills.map(row => [row.name, row.parsed]));
  if (skill.波比.armorScaleMagic !== 2.4 || skill.塞拉斯.maxHpScaleMagic !== 0.12 || skill.布里茨.damageReduction !== 0.52) {
    throw new Error("高风险技能事件未按二星官方数值解析");
  }
  if (!result.certifiedPolicies.some(row => row.augment === "双重气泡")) throw new Error("双重气泡策略应通过至少一个阶段认证");
}

ensureOutputDirs();
const result = buildResult();
assertResult(result);
fs.writeFileSync(resultPath("event_model_results.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(reportPath("统一事件模型实验.md"), report(result));
console.log(`统一事件模型实验完成：${result.coverage.supported}/${result.coverage.catalog} 强化，${result.current.virtualBattles} 场虚拟实战`);

module.exports = { buildResult, report, assertResult };
