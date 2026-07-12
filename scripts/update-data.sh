#!/bin/bash
# 一键更新 jcc.qq.com 怪兽入侵(mode8) 数据并重新生成明细
# 用法: ./scripts/update-data.sh
set -e
cd "$(dirname "$0")/.."

echo "== 拉取版本索引 =="
curl -s 'https://game.gtimg.cn/images/lol/act/jkzlk/js/config/versiondataconfig.js' -o data/versiondataconfig.js

VER=$(node -e '
const a=JSON.parse(require("fs").readFileSync("data/versiondataconfig.js","utf8"));
const cur=a.find(v=>v.mode==="8"&&v.is_newest_version===1);
if(!cur){console.error("未找到 mode8 最新版本");process.exit(1);}
console.log(cur.version+"-"+cur.season);')
echo "当前最新版本: $VER"

base="https://game.gtimg.cn/images/lol/act/jkzlk/js/8/$VER"
for f in hex chess equip race job monster trait config galaxy; do
  curl -s "$base/$f.js" -o "data/$f.js"
  echo "  已更新 data/$f.js"
done

SEASON_NUM=$(echo "$VER" | sed 's/.*-S//')
curl -s "https://game.gtimg.cn/images/lol/act/jkzlkauto/json/lineupJson/m${SEASON_NUM}/11/8/lineup_detail_total.json" -o data/lineup_detail_total.json
echo "  已更新 data/lineup_detail_total.json"
node -e 'const {currentVersion,currentLineups}=require("./src/core/version-context.js");const rows=require("./data/lineup_detail_total.json").lineup_list;const v=currentVersion();console.log(`  数据一致性通过: ${v.label}, 官方阵容 ${currentLineups(rows).length} 套`);'
echo
echo "== 重新生成明细与统计 =="
node src/pipeline/analyze.js
echo
echo "== 重新计算数值模型与可视化数据 =="
node src/core/model.js
echo
echo "== 自由组合搜索（全英雄×全装备） =="
node src/pipeline/search.js
echo
echo "== 全阵容束搜索（羁绊建模组队 vs 官方） =="
node src/pipeline/teamsearch.js
echo
echo "== 前端研究模块数据 =="
node src/pipeline/discover.js
node src/pipeline/transition.js
node src/pipeline/numeric-lens.js
node src/pipeline/research-lab.js
node src/pipeline/reinvent.js
node src/experiments/mecha-branch.js
node src/experiments/mecha-prime-lab.js
node src/core/mechanic-profiles.js
node src/pipeline/meta-solver.js
node src/pipeline/stage2-matcher.js
node src/pipeline/route-certifier.js
echo
echo "完成。明细见 docs/notes/阵容全量明细.md，前端打开 public/index.html。"
