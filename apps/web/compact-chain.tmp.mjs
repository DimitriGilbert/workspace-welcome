import { createServer } from "vite";
const server = await createServer({
  root: "/home/didi/workspace/workspace-welcome/apps/web",
  configFile: "/home/didi/workspace/workspace-welcome/apps/web/vite.config.ts",
  logLevel: "error", server: { middlewareMode: true }, appType: "custom",
});
try {
  const { compactPacked, packGrid } = await server.ssrLoadModule("/src/lib/grid-layout/pack-grid.ts");
  const nodes = [
    { id: "triage", cols: 6, rows: 4 }, { id: "report-activity", cols: 4, rows: 4 },
    { id: "report-ai", cols: 2, rows: 6 }, { id: "ledger", cols: 7, rows: 8 },
    { id: "report-code", cols: 3, rows: 4 }, { id: "alerts-donut", cols: 3, rows: 4 },
    { id: "report-health", cols: 1, rows: 3 }, { id: "dirty-leaders", cols: 1, rows: 3 },
    { id: "stack-mix", cols: 2, rows: 3 },
  ];
  let prev = packGrid(nodes.map(n => ({ ...n, pinned: false })), { columns: 12 }).placements
    .map(p => ({ id: p.id, x: p.x, y: p.y, cols: p.cols, rows: p.rows }));
  const fmt = (pls) => pls.map(p => `${p.id}@${p.x},${p.y} ${p.cols}x${p.rows}`).join(" ");
  const check = (label, out, overrides) => {
    const overlaps = [];
    for (let i=0;i<out.length;i++) for (let j=i+1;j<out.length;j++){
      const a=out[i],b=out[j];
      if (a.x<b.x+b.cols&&b.x<a.x+a.cols&&a.y<b.y+b.rows&&b.y<a.y+a.rows) overlaps.push([a.id,b.id]);
    }
    const drift = prev.filter(f => !overrides.some(o => o[0]===f.id) && out.find(p => p.id===f.id).x !== f.x);
    console.log(`${label}: overlaps=${overlaps.length} x-drift=${drift.length===0?"NONE":drift.map(d=>d.id).join(",")}`);
    if (overlaps.length) console.log("  !!", fmt(out));
    return out;
  };
  const step = (label, overrides) => {
    const fixed = overrides.map(([id,x,y,cols,rows]) => ({ id, x, y, cols, rows }));
    const free = prev.filter(p => !overrides.some(o => o[0]===p.id));
    const out = compactPacked(fixed, free, 12).map(p => ({ id: p.id, x: p.x, y: p.y, cols: p.cols, rows: p.rows }));
    check(label, out, overrides);
    prev = out;
    console.log(`  ${label}:`, fmt(out));
  };
  console.log("PRISTINE:", fmt(prev));
  // chain: shrink activity → move dirty up → grow code west → move activity top-right
  step("1 shrink activity 4x2@(6,0)", [["report-activity",6,0,4,2]]);
  step("2 move dirty-leaders (11,0)", [["report-activity",6,0,4,2],["dirty-leaders",11,0,1,3]]);
  step("3 grow code west 4x4@(6,2)", [["report-activity",6,0,4,2],["dirty-leaders",11,0,1,3],["report-code",6,2,4,4]]);
  step("4 shrink ledger 7x6@(0,6)", [["report-activity",6,0,4,2],["dirty-leaders",11,0,1,3],["report-code",6,2,4,4],["ledger",0,6,7,6]]);
  step("5 move alerts to (0,13)", [["report-activity",6,0,4,2],["dirty-leaders",11,0,1,3],["report-code",6,2,4,4],["ledger",0,6,7,6],["alerts-donut",0,13,3,4]]);
} finally { await server.close(); }
