#!/bin/bash
# 一键更新 jcc.qq.com 怪兽入侵(mode8) 数据并重新生成明细
# 用法: ./工程/脚本/update-data.sh
set -e
cd "$(dirname "$0")/../.."

echo "== 拉取版本索引 =="
curl -s 'https://game.gtimg.cn/images/lol/act/jkzlk/js/config/versiondataconfig.js' -o 资源/游戏数据/versiondataconfig.js

VER=$(node -e '
const a=JSON.parse(require("fs").readFileSync("资源/游戏数据/versiondataconfig.js","utf8"));
const cur=a.find(v=>v.mode==="8"&&v.is_newest_version===1);
if(!cur){console.error("未找到 mode8 最新版本");process.exit(1);}
console.log(cur.version+"-"+cur.season);')
echo "当前最新版本: $VER"

base="https://game.gtimg.cn/images/lol/act/jkzlk/js/8/$VER"
for f in hex chess equip race job monster trait config galaxy; do
  curl -s "$base/$f.js" -o "资源/游戏数据/$f.js"
  echo "  已更新 资源/游戏数据/$f.js"
done

SEASON_NUM=$(echo "$VER" | sed 's/.*-S//')
curl -s "https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m${SEASON_NUM}/11/8/lineup_detail_total.json" -o 资源/游戏数据/lineup_detail_total.json
echo "  已更新 资源/游戏数据/lineup_detail_total.json"
node -e 'const {currentVersion,currentLineups}=require("./工程/源码/core/version-context.js");const rows=require("./资源/游戏数据/lineup_detail_total.json").lineup_list;const v=currentVersion();console.log(`  数据一致性通过: ${v.label}, 官方阵容 ${currentLineups(rows).length} 套`);'
echo
echo "== 重新生成明细与统计 =="
node 工程/源码/pipeline/analyze.js
echo
echo "== 重新计算数值模型与可视化数据 =="
node 工程/源码/core/model.js
echo
echo "== 自由组合搜索（全英雄×全装备） =="
node 工程/源码/pipeline/search.js
echo
echo "== 全阵容束搜索（羁绊建模组队 vs 官方） =="
node 工程/源码/pipeline/teamsearch.js
echo
echo "== 前端研究模块数据 =="
node 工程/源码/pipeline/discover.js
node 工程/源码/pipeline/transition.js
node 工程/源码/pipeline/numeric-lens.js
node 工程/源码/pipeline/research-lab.js
node 工程/源码/pipeline/reinvent.js
node 工程/源码/experiments/jinx-sisters-lab.js
node 工程/源码/experiments/mecha-branch.js
node 工程/源码/experiments/mecha-prime-lab.js
node 工程/源码/core/mechanic-profiles.js
node 工程/源码/pipeline/meta-solver.js
# 先生成并认证当前路线，再跑专项实验与全强化策略编译；最后将认证规则蒸馏回模板。
node 工程/源码/pipeline/stage2-matcher.js
node 工程/源码/pipeline/route-certifier.js
node 工程/源码/experiments/augment-transition-lab.js
node 工程/源码/experiments/strategy-policy-compiler.js
node 工程/源码/pipeline/stage2-matcher.js
node 工程/源码/pipeline/route-certifier.js
node 工程/源码/pipeline/virtual-battle-lab.js
node 工程/源码/audit/audit.js
echo
echo "完成。明细见 文档/阵容资料/阵容全量明细.md，前端打开 应用/前端/index.html。"
