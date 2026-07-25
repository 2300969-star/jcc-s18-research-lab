"use strict";

const fs = require("fs");
const { dataPath, resultPath, reportPath, publicPath, ensureOutputDirs } = require("../lib/project-paths");

const TARGET_VERSION = "17.6b";
const TYPE_PRIOR = { official: 1, patch: 0.95, "structured-guide": 0.58, "full-match": 0.68, claim: 0.22 };
const REQUIRED_FIELDS = { official: 3, patch: 4, "structured-guide": 6, "full-match": 5, claim: 3 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeVersion(value) {
  return String(value || "").toLowerCase().replace(/^v/, "").replace(/[^0-9a-z.]/g, "");
}

function versionFactor(version) {
  const value = normalizeVersion(version);
  if (value === normalizeVersion(TARGET_VERSION)) return 1;
  if (value.startsWith("17.6")) return 0.9;
  if (value.startsWith("17.5")) return 0.68;
  if (/historical|2022|2023/.test(String(version || "").toLowerCase())) return 0.2;
  return 0.45;
}

function outcomeFactor(source) {
  const n = Number(source.independentOutcomeSamples) || 0;
  if (["official", "patch"].includes(source.evidenceType)) return 1;
  if (!n) return 0.35;
  return clamp(0.5 + Math.log10(n + 1) / 2, 0.5, 1);
}

function evidenceScore(source) {
  const prior = TYPE_PRIOR[source.evidenceType] || 0.1;
  const completeness = clamp((source.fields || []).length / (REQUIRED_FIELDS[source.evidenceType] || 5), 0, 1);
  return Math.round(100 * prior * versionFactor(source.version) * (0.55 + 0.45 * completeness) * outcomeFactor(source));
}

function evidenceGrade(score) {
  if (score >= 80) return "A";
  if (score >= 55) return "B";
  if (score >= 30) return "C";
  return "D";
}

function lineupFingerprint(name) {
  return String(name || "").toLowerCase().replace(/[\s·•：:→\-_/]/g, "");
}

function validate(manifest) {
  if (!manifest || !Array.isArray(manifest.sources)) throw new Error("社区来源清单格式错误");
  const ids = new Set();
  const urls = new Set();
  manifest.sources.forEach(source => {
    if (!source.id || ids.has(source.id)) throw new Error(`来源ID重复或为空：${source.id || "-"}`);
    if (!/^https:\/\//.test(source.url || "")) throw new Error(`来源URL非法：${source.id}`);
    if (urls.has(source.url)) throw new Error(`来源URL重复：${source.url}`);
    if (!Object.prototype.hasOwnProperty.call(TYPE_PRIOR, source.evidenceType)) throw new Error(`证据类型非法：${source.id}`);
    ids.add(source.id);
    urls.add(source.url);
  });
}

function buildResult(manifest) {
  validate(manifest);
  const sources = manifest.sources.map(source => {
    const score = evidenceScore(source);
    return { ...source, evidenceScore: score, evidenceGrade: evidenceGrade(score), versionFactor: versionFactor(source.version) };
  }).sort((a, b) => b.evidenceScore - a.evidenceScore || a.id.localeCompare(b.id));
  const lineupMap = new Map();
  sources.forEach(source => (source.lineups || []).forEach(name => {
    const key = lineupFingerprint(name);
    if (!lineupMap.has(key)) lineupMap.set(key, { name, fingerprint: key, sourceIds: [], strongestEvidence: 0, currentOutcomeSamples: 0 });
    const row = lineupMap.get(key);
    row.sourceIds.push(source.id);
    row.strongestEvidence = Math.max(row.strongestEvidence, source.evidenceScore);
    if (source.versionFactor >= 0.9) row.currentOutcomeSamples += Number(source.independentOutcomeSamples) || 0;
  }));
  const lineups = [...lineupMap.values()].map(row => ({
    ...row,
    sourceCount: row.sourceIds.length,
    status: row.currentOutcomeSamples > 0 ? "observed" : "hypothesis",
  })).sort((a, b) => b.sourceCount - a.sourceCount || b.strongestEvidence - a.strongestEvidence || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const currentOutcomeSamples = sources.filter(source => source.versionFactor >= 0.9).reduce((sum, source) => sum + (Number(source.independentOutcomeSamples) || 0), 0);
  const currentStructuredGuides = sources.filter(source => source.versionFactor >= 0.68 && source.evidenceType === "structured-guide").length;
  return {
    generated: new Date().toISOString(),
    targetVersion: TARGET_VERSION,
    sourceCount: sources.length,
    currentStructuredGuides,
    currentOutcomeSamples,
    sources,
    lineupHypotheses: lineups,
    researchReadiness: [
      { id: "dynamic-policy", name: "动态策略/POMDP", status: currentOutcomeSamples >= 200 ? "ready" : "data-gap", observed: currentOutcomeSamples, required: 200, next: "采集逐回合等级、金币、血量、棋盘、动作和最终名次" },
      { id: "lineup-search", name: "组合优化发现阵容", status: lineups.length >= 5 ? "ready" : "data-gap", observed: lineups.length, required: 5, next: "把公开阵容作为候选种子，仍由本地模型重算" },
      { id: "finite-pool", name: "有限牌池抽卡概率", status: "ready", observed: "本地官方费用与牌池常量", required: "等级概率+牌池份数", next: "加入同行占牌观察值与概率区间" },
      { id: "augment-causal", name: "符文条件因果效应", status: "data-gap", observed: 0, required: 100, next: "同版本同局面匹配有/无该符文样本" },
      { id: "shapley", name: "组件Shapley与交互", status: "partial", observed: "确定性战斗模型", required: "经真实回放校准的价值函数", next: "先对主C+三件装+关键符文做精确枚举" },
      { id: "robustness", name: "稳健性与版本答案证明", status: "partial", observed: "300000模型扰动样本", required: "独立真实对局留出集", next: "用真实名次校准CVaR、失败率和置信区间" }
    ],
    policy: manifest.policy,
  };
}

function report(result) {
  const lines = [
    "# 社区公开样本证据审计",
    "",
    `目标版本：${result.targetVersion}；来源 ${result.sourceCount} 条；当前版本独立结果样本 ${result.currentOutcomeSamples} 条。`,
    "",
    "> 社区攻略用于发现假设，不直接作为胜率标签。只有包含可核验结果和状态的独立样本才可进入校准集。",
    "",
    "## 数据源",
    "",
    "| 等级 | 分数 | 类型 | 版本 | 来源 | 可用于 |",
    "|---|---:|---|---|---|---|",
    ...result.sources.map(source => `| ${source.evidenceGrade} | ${source.evidenceScore} | ${source.evidenceType} | ${source.version} | [${source.title}](${source.url}) | ${(source.fields || []).join("、") || "候选假设"} |`),
    "",
    "## 阵容候选",
    "",
    "| 阵容 | 独立来源 | 当前结果样本 | 状态 |",
    "|---|---:|---:|---|",
    ...result.lineupHypotheses.map(row => `| ${row.name} | ${row.sourceCount} | ${row.currentOutcomeSamples} | ${row.status === "observed" ? "可观测" : "待模型验证"} |`),
    "",
    "## 六条研究线的数据就绪度",
    "",
    "| 研究线 | 状态 | 当前数据 | 门槛 | 下一步 |",
    "|---|---|---|---|---|",
    ...result.researchReadiness.map(row => `| ${row.name} | ${row.status} | ${row.observed} | ${row.required} | ${row.next} |`),
    "",
    "## 结论",
    "",
    "网上公开内容足以扩充候选阵容和机制假设，但当前检索样本不足以训练名次预测或估计符文因果效应。下一阶段必须优先积累逐回合可观测对局，而不是把攻略热度当作强度。",
  ];
  return lines.join("\n");
}

const manifest = JSON.parse(fs.readFileSync(dataPath("external", "community_sources.json"), "utf8"));
const result = buildResult(manifest);
ensureOutputDirs();
fs.writeFileSync(resultPath("community_evidence_results.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(reportPath("社区公开样本证据审计.md"), report(result));
fs.writeFileSync(publicPath("community-evidence-data.js"), `window.COMMUNITY_EVIDENCE=${JSON.stringify(result)};`);

if (result.currentOutcomeSamples !== 0) throw new Error("当前来源清单没有同版本独立结果样本，审计值应为0");
if (!result.lineupHypotheses.some(row => row.name === "姐妹金克丝")) throw new Error("姐妹金克丝候选没有进入公开证据池");
if (!result.researchReadiness.some(row => row.id === "dynamic-policy" && row.status === "data-gap")) throw new Error("动态策略数据缺口未暴露");

console.log(`社区证据审计完成：${result.sourceCount}来源，${result.lineupHypotheses.length}个候选，当前独立结果样本${result.currentOutcomeSamples}`);

module.exports = { buildResult, evidenceScore, evidenceGrade, versionFactor, lineupFingerprint };
