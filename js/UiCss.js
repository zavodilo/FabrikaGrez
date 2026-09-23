// UiCss.js — STUDIO_CSS: the stylesheet injected once by UI.init for the inner content of
// 'screen' elements (management panels and the cinema overlays). Game screens build plain
// HTML with these classes; nothing here touches the layout records themselves (those live
// in UILayout.js and stay editor-tunable). Cinema-dark theme: velvet black, gold, serif
// titles — a 1950s picture palace.

const STUDIO_CSS = `
.sc { position: relative; padding: 16px 22px 90px; color: #e8e2d4; font-size: 15px;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif; max-width: 1180px; margin: 0 auto;
  line-height: 1.45; }
.sc::-webkit-scrollbar, .arc-ui .scroll::-webkit-scrollbar { width: 8px; }
.sc::-webkit-scrollbar-thumb, .scroll::-webkit-scrollbar-thumb { background: #3a4458; border-radius: 4px; }
h1.title { font-family: Georgia, "Times New Roman", serif; color: #e8c87a; font-size: 34px;
  letter-spacing: 3px; margin: 6px 0 2px; text-shadow: 0 2px 12px #000; font-weight: 800; }
h1.title .sub { display: block; font-size: 14px; letter-spacing: 6px; color: #9aa4b8; font-weight: 400; margin-top: 6px; }
.h2 { font-family: Georgia, serif; color: #e8c87a; font-size: 20px; margin: 18px 0 8px;
  border-bottom: 1px solid #2a3446; padding-bottom: 6px; letter-spacing: 1px; }
.h3 { color: #cfd6e4; font-size: 16px; margin: 12px 0 6px; font-weight: 700; }
p.lead { color: #b8c0d0; font-size: 15.5px; }
.hint { color: #8a94a8; font-size: 12.5px; }
.dim { opacity: .65; } .small { font-size: 12.5px; } .big { font-size: 19px; }
.gold { color: #e8c87a; } .red { color: #e07a6a; } .green { color: #8ac87a; } .blue { color: #7aa8e8; }
.center { text-align: center; } .right { text-align: right; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row.tight { gap: 6px; } .sp { flex: 1; } .wrap { flex-wrap: wrap; }
.cols { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.col { flex: 1 1 300px; min-width: 270px; }
.panel { background: #141b28; border: 1px solid #26304a; border-radius: 12px; padding: 12px 14px; margin: 8px 0; }
.panel.flat { background: transparent; border: none; padding: 4px 0; }
.card { background: #151c2b; border: 1px solid #2a3446; border-radius: 12px; padding: 10px 13px;
  margin: 7px 0; cursor: pointer; transition: border-color .12s; }
.card:hover { border-color: #4a5a7a; }
.card.sel { border-color: #c8a24a; box-shadow: 0 0 0 1px #c8a24a55; }
.card.disabled { opacity: .45; cursor: default; }
.card .name { font-weight: 700; font-size: 15.5px; color: #f0e8d8; }
.card .meta { color: #9aa4b8; font-size: 12.5px; margin-top: 2px; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 16px; border-radius: 9px; background: #242e42; border: 1px solid #3d4a64;
  color: #e8e2d4; cursor: pointer; font-size: 14px; font-weight: 600; user-select: none;
  font-family: inherit; transition: filter .1s; text-align: center; }
.btn:hover { filter: brightness(1.25); }
.btn:active { transform: translateY(1px); }
.btn.gold { background: linear-gradient(#d8b25a, #9a7a30); color: #1a1408; border: none; font-weight: 800; }
.btn.red { background: #5a2a2a; border-color: #7a3a3a; color: #f0d8d0; }
.btn.green { background: #2a4a2e; border-color: #3a6a40; color: #d8f0d8; }
.btn.ghost { background: transparent; border-color: #3d4a64; }
.btn.small { padding: 4px 10px; font-size: 12.5px; border-radius: 7px; }
.btn.big { padding: 13px 28px; font-size: 17px; border-radius: 12px; }
.btn.wide { width: 100%; }
.btn.off { opacity: .4; pointer-events: none; }

table.tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
table.tbl th { text-align: left; color: #c8a24a; font-size: 12px; text-transform: uppercase;
  letter-spacing: 1px; padding: 6px 8px; border-bottom: 1px solid #2a3446; }
table.tbl td { padding: 7px 8px; border-bottom: 1px solid #1c2434; vertical-align: middle; }
table.tbl tr:hover td { background: #1a2233; }
table.tbl tr.sel td { background: #22304a; }

.bar { height: 10px; background: #0c0f16; border-radius: 5px; overflow: hidden; min-width: 60px; }
.bar > i { display: block; height: 100%; background: linear-gradient(90deg, #b8923a, #e8c87a); border-radius: 5px; }
.bar.green > i { background: linear-gradient(90deg, #3a8a4a, #7ac87a); }
.bar.red > i { background: linear-gradient(90deg, #8a3a3a, #e07a6a); }
.bar.blue > i { background: linear-gradient(90deg, #3a5a9a, #7aa8e8); }
.bar.thin { height: 6px; }

.stars { color: #e8c87a; letter-spacing: 2px; font-size: 14px; text-shadow: 0 1px 3px #000; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #26304a;
  font-size: 12px; margin: 2px 3px 2px 0; color: #cfd6e4; }
.tag.gold { background: #4a3c18; color: #e8c87a; }
.tag.red { background: #4a2222; color: #f0a898; }
.tag.green { background: #22402a; color: #a8e0a8; }
.tag.blue { background: #22344a; color: #a8c8f0; }
.money { font-variant-numeric: tabular-nums; font-weight: 700; }
.pos { color: #8ac87a; } .neg { color: #e07a6a; }

.poster { width: 116px; height: 164px; border-radius: 9px; position: relative; overflow: hidden;
  border: 2px solid #c8a24a44; flex: none; box-shadow: 0 6px 18px #0008; }
.poster .p-emoji { position: absolute; top: 22px; left: 0; right: 0; text-align: center; font-size: 44px;
  filter: drop-shadow(0 3px 5px #000a); }
.poster .p-title { position: absolute; bottom: 0; left: 0; right: 0; padding: 18px 8px 8px;
  font-weight: 800; font-size: 12.5px; color: #fff; text-shadow: 0 2px 4px #000; text-align: center;
  background: linear-gradient(transparent, #000b); font-family: Georgia, serif; letter-spacing: .5px; }
.poster .p-score { position: absolute; top: 6px; right: 6px; background: #000a; color: #e8c87a;
  border-radius: 7px; padding: 1px 7px; font-size: 12px; font-weight: 800; }
.poster.western { background: linear-gradient(#e8a24a, #a85a1a 55%, #3a1a08); }
.poster.comedy { background: linear-gradient(#f0d05a, #e08a3a 55%, #7a3a10); }
.poster.drama { background: linear-gradient(#6a7a9a, #3a4460 55%, #141a28); }
.poster.action { background: linear-gradient(#d05a3a, #8a2a1a 55%, #2a0a04); }
.poster.horror { background: linear-gradient(#3a4a3a, #1a241a 55%, #060a06); }
.poster.scifi { background: linear-gradient(#4a7ac8, #22407a 55%, #08101e); }
.poster.romance { background: linear-gradient(#e88aa0, #b04a6a 55%, #4a1024); }

.tabs { display: flex; gap: 6px; border-bottom: 1px solid #2a3446; margin-bottom: 14px; flex-wrap: wrap; }
.tab { padding: 8px 16px; cursor: pointer; border-radius: 9px 9px 0 0; color: #9aa4b8; font-size: 14px;
  font-weight: 600; user-select: none; }
.tab:hover { color: #d8d0bc; }
.tab.on { background: #1c2434; color: #e8c87a; }

input[type="text"], input[type="number"], select, textarea {
  background: #0e1320; border: 1px solid #33405a; color: #e8e2d4; border-radius: 8px;
  padding: 7px 10px; font-size: 14px; font-family: inherit; outline: none; }
input:focus, select:focus, textarea:focus { border-color: #c8a24a; }
input[type="range"] { accent-color: #c8a24a; }
label.fld { display: block; color: #9aa4b8; font-size: 12.5px; margin: 8px 0 3px; }

.news { border-left: 3px solid #c8a24a; padding: 7px 12px; margin: 8px 0; background: #161d2c;
  border-radius: 0 9px 9px 0; font-size: 14px; }
.news.bad { border-left-color: #c85a4a; }
.news.good { border-left-color: #6aa86a; }
.dlg { margin: 4px 0 4px 10px; padding-left: 10px; border-left: 2px solid #2a3446; font-size: 13.5px; }
.dlg b { color: #c8a24a; font-weight: 700; }
.dlg i { color: #8a94a8; }

.modal { padding: 22px 26px; text-align: center; color: #e8e2d4; }
.modal h2 { font-family: Georgia, serif; color: #e8c87a; margin: 0 0 10px; font-size: 22px; }
.modal b { color: #f0e8d8; }
.modal .btns { margin-top: 18px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

.menu-wrap { min-height: 100%; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; padding: 30px 16px; }
.menu-logo { font-family: Georgia, serif; font-size: 64px; font-weight: 800; letter-spacing: 6px;
  color: #e8c87a; text-shadow: 0 4px 30px #c8a24a55, 0 2px 4px #000; }
.menu-sub { color: #9aa4b8; letter-spacing: 8px; font-size: 14px; margin: 6px 0 34px; text-transform: uppercase; }
.menu-btns { display: flex; flex-direction: column; gap: 12px; width: 320px; max-width: 90%; }
.menu-foot { position: absolute; bottom: 14px; left: 0; right: 0; color: #5a6478; font-size: 12px; }

/* --- cinema overlays (inside cineFx / cineCard screens) --- */
.cine-click { position: absolute; inset: 0; }
.cine-vignette { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.28) 78%, rgba(0,0,0,.62) 100%); }
.cine-grain { position: absolute; inset: -120px; pointer-events: none; opacity: .5;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.09'/%3E%3C/svg%3E");
  animation: cine-grain .8s steps(4) infinite; }
@keyframes cine-grain { 0% { transform: translate(0,0);} 25% { transform: translate(-40px,26px);}
  50% { transform: translate(26px,-38px);} 75% { transform: translate(-24px,-22px);} 100% { transform: translate(38px,30px);} }
.tint-night { position: absolute; inset: 0; pointer-events: none; background: rgba(10,18,58,.44); }
.tint-sunset { position: absolute; inset: 0; pointer-events: none; background: rgba(96,40,8,.28); }
.tint-rain { position: absolute; inset: 0; pointer-events: none; opacity: .5;
  background-image: repeating-linear-gradient(74deg, transparent 0 7px, rgba(170,195,255,.16) 7px 8px);
  animation: cine-rain .45s linear infinite; }
@keyframes cine-rain { to { background-position: 70px 140px; } }
.cine-flash { position: absolute; inset: 0; pointer-events: none; background: #fff; opacity: 0;
  animation: cine-flash .4s ease-out forwards; }
@keyframes cine-flash { 0% { opacity: .95; } 100% { opacity: 0; } }

.cine-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; color: #e8d8a8; font-family: Georgia, serif;
  pointer-events: none; padding: 20px; }
.cine-title .t1 { font-size: 17px; letter-spacing: 7px; opacity: .85; text-transform: uppercase; }
.cine-title .t2 { font-size: 54px; font-weight: 800; text-shadow: 0 4px 26px #000; margin: 16px 0;
  letter-spacing: 2px; max-width: 900px; }
.cine-title .t3 { font-size: 17px; opacity: .85; letter-spacing: 2px; }
.cine-title.fadein { animation: cine-fadein 1.2s ease both; }
@keyframes cine-fadein { from { opacity: 0; } to { opacity: 1; } }

.credits { position: absolute; left: 0; right: 0; top: 100%; text-align: center; color: #d8d0bc;
  font-family: Georgia, serif; pointer-events: none; padding-bottom: 40vh; }
.credits.run { animation: cine-crawl var(--crawl, 42s) linear forwards; }
@keyframes cine-crawl { from { transform: translateY(0); } to { transform: translateY(calc(-100% - 100vh)); } }
.credits h3 { color: #e8c87a; font-size: 24px; margin: 26px 0 6px; letter-spacing: 3px; }
.credits .role { color: #8a94a8; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; margin-top: 18px; }
.credits .nm { font-size: 18px; margin: 2px 0; }
.credits .fin { font-size: 30px; color: #e8c87a; margin-top: 40px; letter-spacing: 8px; }

.pause-badge { position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
  color: #fff; background: #000b; padding: 7px 18px; border-radius: 9px; font-size: 14px;
  letter-spacing: 3px; pointer-events: none; border: 1px solid #ffffff22; }
.scene-badge { position: absolute; top: 20px; left: 24px; color: #e8d8a8cc; background: #0009;
  padding: 4px 12px; border-radius: 7px; font-size: 12.5px; letter-spacing: 1px; pointer-events: none; }

.tip { position: absolute; background: #0e1320f2; border: 1px solid #c8a24a66; color: #e8e2d4;
  padding: 10px 14px; border-radius: 10px; max-width: 380px; font-size: 13.5px; z-index: 5;
  box-shadow: 0 8px 30px #000a; }
.tip .btn { margin-top: 10px; }
`;
