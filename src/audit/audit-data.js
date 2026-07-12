const {
  data,
  splitCsv,
  detailOf,
  traitName,
  inferTraitCounts,
  activeTraitsFromCounts,
  officialLineups,
  itemName,
  hexName,
  monsterName,
} = require('./audit-shared');

function collectReferenceIssues(lineup, detail) {
  const out = [];
  const line = detail.line_name || lineup.id;
  const push = (severity, kind, id, where) => out.push({ severity, line, kind, id, where });

  for (const h of detail.hero_location || []) {
    if (!data.chess[h.hero_id]) push('P1', 'hero', h.hero_id, 'hero_location');
    for (const itemId of splitCsv(h.equipment_id)) {
      if (!data.equip[itemId]) push('P1', 'equip', itemId, `hero_location:${h.hero_id}`);
    }
  }

  for (const itemId of splitCsv(detail.equipment_order)) {
    if (!data.equip[itemId]) push('P2', 'equip', itemId, 'equipment_order');
  }

  for (const id of splitCsv(detail.hexbuff && detail.hexbuff.recomm)) {
    if (!data.hex[id]) push('P2', 'hex', id, 'hexbuff.recomm');
  }
  for (const id of splitCsv(detail.hexbuff && detail.hexbuff.replace)) {
    if (!data.hex[id]) push('P3', 'hex', id, 'hexbuff.replace');
  }

  for (const id of splitCsv(detail.monster && detail.monster.recomm)) {
    if (!data.monster[id]) push('P2', 'monster', id, 'monster.recomm');
  }
  for (const id of splitCsv(detail.monster && detail.monster.replace)) {
    if (!data.monster[id]) push('P3', 'monster', id, 'monster.replace');
  }

  return out;
}

function collectContactIssues(lineup, detail) {
  const counts = inferTraitCounts(detail.hero_location || []);
  const inferredActive = activeTraitsFromCounts(counts);
  const official = detail.contact || [];
  const officialIds = new Set(official.map(c => String(c.id)));
  const missing = inferredActive.filter(t => !officialIds.has(t.id));

  const mismatchedNums = official
    .map(c => {
      const inferred = counts[String(c.id)] || 0;
      return { id: String(c.id), name: traitName(String(c.id)), official: Number(c.num), inferred };
    })
    .filter(x => x.official !== x.inferred);

  const severity = official.length === 0 && inferredActive.length >= 2
    ? 'P1'
    : missing.length >= 3
      ? 'P2'
      : mismatchedNums.length
        ? 'P3'
        : null;

  if (!severity) return null;
  return {
    severity,
    line: detail.line_name || lineup.id,
    quality: lineup.quality,
    officialCount: official.length,
    inferredActiveCount: inferredActive.length,
    missing: missing.map(t => t.label),
    mismatchedNums,
    problem: [
      ...missing.map(t => `缺 ${t.label}`),
      ...mismatchedNums.map(t => `${t.name} 官方${t.official}/反推${t.inferred}`),
    ],
  };
}

function collectDuplicateHeroNames() {
  const groups = {};
  for (const u of Object.values(data.chess)) {
    if (u.showHeroTag !== '1' || Number(u.price) < 1 || Number(u.price) > 5) continue;
    (groups[u.name] = groups[u.name] || []).push(u);
  }

  return Object.entries(groups)
    .filter(([, units]) => units.length > 1)
    .map(([name, units]) => {
      const ids = units.map(u => u.id).sort((a, b) => Number(a) - Number(b));
      const prices = [...new Set(units.map(u => u.price))];
      const traits = [...new Set(units.map(u => `${u.species}/${u.class}`))];
      const skillNames = [...new Set(units.map(u => u.skillName))];
      const statVariants = [...new Set(units.map(u => [
        u.initHP,
        u.initAttackDamage,
        u.attackSpeed,
        u.armor,
        u.magicResist,
        u.initMP,
        u.maxMP,
      ].join('/')))];
      return {
        name,
        count: units.length,
        ids,
        prices,
        traits,
        skillNames,
        statVariantCount: statVariants.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function collectLineupItemUsage() {
  const used = {};
  for (const lineup of officialLineups()) {
    const detail = detailOf(lineup);
    for (const h of detail.hero_location || []) {
      for (const itemId of splitCsv(h.equipment_id)) {
        const row = used[itemId] = used[itemId] || {
          id: itemId,
          name: itemName(itemId),
          total: 0,
          sTier: 0,
          carry: 0,
          lines: [],
        };
        row.total++;
        if (lineup.quality === 'S') row.sTier++;
        if (h.is_carry_hero) row.carry++;
        row.lines.push(detail.line_name);
      }
    }
  }
  return Object.values(used).sort((a, b) => b.sTier - a.sTier || b.total - a.total);
}

function runDataAudit() {
  const lineups = officialLineups();
  const contactIssues = [];
  const referenceIssues = [];

  for (const lineup of lineups) {
    const detail = detailOf(lineup);
    const issue = collectContactIssues(lineup, detail);
    if (issue) contactIssues.push(issue);
    referenceIssues.push(...collectReferenceIssues(lineup, detail));
  }

  const severityRank = { P1: 0, P2: 1, P3: 2 };
  contactIssues.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.quality.localeCompare(b.quality) ||
    b.inferredActiveCount - a.inferredActiveCount);
  referenceIssues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const duplicateHeroNames = collectDuplicateHeroNames();
  const lineupItemUsage = collectLineupItemUsage();

  return {
    summary: {
      lineups: lineups.length,
      contactIssues: contactIssues.length,
      p1ContactIssues: contactIssues.filter(x => x.severity === 'P1').length,
      referenceIssues: referenceIssues.length,
      duplicateHeroNames: duplicateHeroNames.length,
    },
    contactIssues,
    referenceIssues,
    duplicateHeroNames,
    lineupItemUsage,
    lookup: { itemName, hexName, monsterName },
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runDataAudit(), null, 2));
}

module.exports = { runDataAudit };
