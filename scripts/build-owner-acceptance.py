"""Build a local-only owner review gallery from captured screenshots and evidence."""
from pathlib import Path
import html, shutil, hashlib, json
root=Path(__file__).resolve().parents[1]
out=root/'output/owner-acceptance';out.mkdir(parents=True,exist_ok=True)
report=root/'docs/audits/APS_PR159_OWNER_ACCEPTANCE_COMPLETION.md'
shutil.copy2(report,out/'IMPLEMENTATION-AND-RELEASE-GATES.md')
style='body{margin:0;background:#f6f3ed;color:#151b49;font:16px Arial,sans-serif;line-height:1.6}header{background:#151b49;color:white;padding:32px 5vw}h1,h2{font-family:Georgia,serif}header a{color:#ead58c}nav{display:flex;gap:18px;flex-wrap:wrap}main{max-width:1200px;margin:auto;padding:24px}section{background:white;border-radius:16px;padding:24px;margin-bottom:24px}.pair{display:grid;grid-template-columns:2fr 1fr;gap:24px}a{color:#151b49}img{width:100%;height:360px;object-fit:contain;object-position:top;border:1px solid #ddd;background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.7 Arial,sans-serif}@media(max-width:650px){.pair{grid-template-columns:1fr}}'
head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+style+'</style>'
(out/'report.html').write_text('<!doctype html><html><head>'+head+'<title>Implementation and release gates</title></head><body><header><h1>Implementation and release gates</h1><a href="index.html">Back to acceptance gallery</a></header><main><section><pre>'+html.escape(report.read_text())+'</pre></section></main></body></html>')
pairs=[('neighborhood','Neighborhood landing page'),('team','Team page'),('homepage','Homepage'),('homepage-about','Homepage About'),('doneisha','Doneisha profile'),('intake','Guided intake — full page'),('intake-detail','Guided intake — detail')]
pairs += [(f'footer-{name}',f'{name.title()} footer') for name in ['neighborhood','team','homepage','doneisha']]
pairs += [(p.name.removesuffix('-desktop.png'),'Customer intake · '+p.name.removesuffix('-desktop.png').replace('intake-','').replace('-',' ')) for p in sorted(out.glob('intake-*-desktop.png')) if p.name not in ['intake-detail-desktop.png']]
pairs += [(p.name.removesuffix('-desktop.png'),'Operations Portal · '+p.name.removesuffix('-desktop.png').replace('admin-','').replace('-',' ')) for p in sorted(out.glob('admin-*-desktop.png'))]
sections=[]
for name,title in pairs:
 if not (out/(name+'-desktop.png')).exists():continue
 cards=''.join(f'<a href="{name}-{mode}.png"><h3>{mode.title()}</h3><img loading="lazy" src="{name}-{mode}.png" alt="{html.escape(title)} {mode}"></a>' for mode in ['desktop','mobile'])
 sections.append(f'<section><h2>{html.escape(title)}</h2><div class="pair">{cards}</div></section>')
intro='''<header><p>ALIGNED PRINT &amp; SCAN · PR #159</p><h1>Owner acceptance gallery</h1><p>Updated neighborhood pricing, promotion-specific intake guidance and shared website footers. Actual approved branding and portrait; click each image for full resolution.</p><p>Customer/admin demonstrations use synthetic data and simulated providers. Payment views are fixture states. The admin snapshot is read-only. No production changes or real messages/payments were made.</p><nav><a href="http://127.0.0.1:8032/neighborhood#starting-rates">Updated neighborhood page</a><a href="http://127.0.0.1:8032/team">Team</a><a href="http://127.0.0.1:8032/#about">About</a><a href="http://127.0.0.1:8032/doneisha">Doneisha</a><a href="operations-preview.html">Admin snapshot</a><a href="footers/index.html">All 28 website footers</a><a href="report.html">Report and release gates</a><a href="aps-yard-sign-24x18-front-and-back.pdf">Sign front/back proof</a></nav></header>'''
(out/'index.html').write_text('<!doctype html><html><head>'+head+'<title>Aligned Print & Scan — owner acceptance</title></head><body>'+intro+'<main>'+''.join(sections)+'<section><h2>Yard sign — front and back</h2><a href="aps-yard-sign-24x18-front-and-back.pdf"><img src="aps-yard-sign-preview.png" alt="Yard sign front and back proof"></a><p>The same approved design is used on both sides. Transparent long logo; reusable neighborhood_services QR campaign.</p></section></main></body></html>')
foot=out/'footers';foot.mkdir(exist_ok=True)
links=''.join(f'<li><a href="{html.escape(p.name)}">{html.escape(p.stem.replace("--"," / "))}</a></li>' for p in sorted(foot.glob('*.png')))
(foot/'index.html').write_text('<!doctype html><html><head>'+head+'<title>Public website footers</title></head><body><header><h1>All shared public website footers</h1><a href="../index.html">Back to gallery</a></header><main><section><p>28 public website/resource pages, desktop and mobile. Standalone digital cards retain their card-signature design.</p><ul>'+links+'</ul></section></main></body></html>')
evidence=out/'evidence';evidence.mkdir(exist_ok=True)
for name in ['aps-completion-node.log','aps-completion-deno.log','aps-completion-types.log','aps-completion-migrations.log','aps-completion-native-concurrency.log','aps-completion-paid-final.log','aps-owner-admin.log','aps-owner-customer.log','aps-owner-public.log','aps-owner-footers.log']:
 p=Path('/private/tmp')/name
 if p.exists():shutil.copy2(p,evidence/name)
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'supabase/migrations').glob('20261016*neighborhood*.sql'))}
hashes['verify-neighborhood-migrations.sql']=hashlib.sha256((root/'scripts/verify-neighborhood-migrations.sql').read_bytes()).hexdigest()
(evidence/'migration-sha256.json').write_text(json.dumps(hashes,indent=2)+'\n')
(out/'README.md').write_text('Open index.html for screenshots, intake/admin demonstrations, all shared website footers and sign proof. Open report.html for verification scope and release gates. The live local preview is http://127.0.0.1:8032/neighborhood . Screenshots remain viewable without the server. Production has not been changed. PR #159 remains draft.\n')
print('Owner package generated:',len(sections),'desktop/mobile screenshot pairs')
