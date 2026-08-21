from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'figures'; OUT.mkdir(parents=True,exist_ok=True)
NAVY='#161C4D'; GOLD='#C8A96B'; LIGHT='#E8D28D'; IVORY='#F6F3EE'; GREY='#6B6D78'; WHITE='#FFFFFF'; RED='#B33A3A'; GREEN='#2F8F5B'

FIGURES={
'fig-01-aps-system-map':('APS System Map',['Customer / Business','APS request and evidence','Stripe · Proof · Resend','Verified customer outcome']),
'fig-02-universal-request-lifecycle':('Universal Request Lifecycle',['Requested','Reviewed / Quoted','Approved / Paid','Scheduled / Fulfilled','Completed']),
'fig-03-portal-system-relationship':('Portal / System Relationship',['Admin evidence','Customer-safe view','Customer action request','APS review / record']),
'fig-04-state-mental-map':('State Mental Map',['Request','Appointment','Money','Documents','Participants','Provider','Fulfillment']),
'fig-05-customer-signer-orderer':('Customer vs Signer vs Ordering Party',['Customer / Requester','Signer','Ordering Party','APS operator verifies each role']),
'fig-06-participant-role-relationship':('Participant Decision',['Name appears','Confirmed participant?','Authorized confirmation?','Add / review / HOLD']),
'fig-07-document-lifecycle':('Document Lifecycle',['Uploaded','Operational review','Completed / eligible','Released','Verified access']),
'fig-08-document-security-boundary':('Internal vs Customer-Visible',['Internal / working','Review + eligibility','RELEASE GATE','Customer-visible']),
'fig-09-document-release-decision':('Document Release Decision',['External visibility intended?','Correct completed version?','Review / gates complete?','Correct recipient?','Release + verify']),
'fig-10-ron-proof-document':('RON / Proof Document Lifecycle',['Customer source','APS review','Proof session','Completed notarized output','APS review / release']),
'fig-11-mobile-original-scan':('Mobile Original vs APS Scan',['Physical source','Notarization','Physical original flow','Optional authorized scan','Review / digital release']),
'fig-12-print-source-output':('Print & Scan Source-to-Output',['Source file','Page / specification review','Production','QC','Delivery']),
'fig-13-loan-package-return':('Loan Package / Scanback / Return',['Current package','Print / signing','Post-signing QC','Scanback / approval','Physical return / proof']),
'fig-14-service-document-comparison':('Service-Specific Document Lifecycles',['RON: source → Proof → release','Mobile: original → optional scan','Print: source → QC → delivery','Loan: package → scanback → return','Business: tenant → authorized access']),
}

def font(size,bold=False):
    candidates=['/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf','/Library/Fonts/Montserrat-Bold.ttf' if bold else '/Library/Fonts/Montserrat-Regular.ttf']
    for p in candidates:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def wrap(draw,text,f,maxw):
    words=text.split(); lines=[]; cur=''
    for w in words:
        test=(cur+' '+w).strip()
        if draw.textbbox((0,0),test,font=f)[2]<=maxw: cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def make(slug,title,nodes):
    W,H=1600,900; im=Image.new('RGB',(W,H),IVORY); d=ImageDraw.Draw(im)
    d.rounded_rectangle((55,45,W-55,H-45),radius=30,fill=WHITE,outline=NAVY,width=5)
    d.rectangle((55,45,W-55,155),fill=NAVY)
    d.text((95,77),title,font=font(38,True),fill=WHITE)
    d.text((W-310,91),'BATCH 1 · FIGURE',font=font(18,True),fill=LIGHT)
    n=len(nodes); gap=32; total=W-190-gap*(n-1); boxw=max(150,total//n); y1=335; y2=565
    centers=[]
    for i,node in enumerate(nodes):
        x1=95+i*(boxw+gap); x2=x1+boxw; centers.append(((x1+x2)//2,(y1+y2)//2))
        is_decision=('?' in node or 'GATE' in node or 'Confirmed' in node); cx=(x1+x2)//2; cy=(y1+y2)//2
        fill=LIGHT if is_decision else (NAVY if i not in (0,n-1) else '#E9E9ED')
        textfill=NAVY if fill!=NAVY else WHITE
        if is_decision:
            d.polygon([(cx,y1),(x2,cy),(cx,y2),(x1,cy)],fill=fill,outline=GOLD)
            maxw=boxw-80
        else:
            d.rounded_rectangle((x1,y1,x2,y2),radius=24,fill=fill,outline=NAVY,width=3); maxw=boxw-44
        lines=wrap(d,node,font(23,True),maxw); ty=cy-len(lines)*15
        for line in lines:
            bb=d.textbbox((0,0),line,font=font(23,True)); d.text((cx-(bb[2]-bb[0])/2,ty),line,font=font(23,True),fill=textfill); ty+=31
        if i:
            px=centers[i-1][0]+boxw//2+4; nx=x1-8; cy=(y1+y2)//2
            d.line((px,cy,nx,cy),fill=GOLD,width=8); d.polygon([(nx,cy),(nx-18,cy-12),(nx-18,cy+12)],fill=GOLD)
    d.text((95,690),'CHECK  Continue only when the stated condition is satisfied.',font=font(21,True),fill=GREEN)
    d.text((95,735),'STOP  Hold and escalate when identity, authorization, document, money, or recipient facts conflict.',font=font(20,True),fill=RED)
    d.text((95,795),'Navy = APS action · Gold = decision/gate · Grey = customer/provider/external event',font=font(18),fill=GREY)
    im.save(OUT/f'{slug}.png',quality=95)
    # Editable SVG master mirrors the diagram geometry.
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">',f'<rect width="1600" height="900" fill="{IVORY}"/><rect x="55" y="45" width="1490" height="810" rx="30" fill="white" stroke="{NAVY}" stroke-width="5"/><rect x="55" y="45" width="1490" height="110" fill="{NAVY}"/><text x="95" y="115" font-family="Montserrat,Arial" font-size="38" font-weight="700" fill="white">{title}</text>']
    for i,node in enumerate(nodes):
        x=95+i*(boxw+gap); svg.append(f'<rect x="{x}" y="335" width="{boxw}" height="230" rx="24" fill="{NAVY if i not in (0,n-1) else "#E9E9ED"}" stroke="{NAVY}" stroke-width="3"/>'); svg.append(f'<text x="{x+boxw/2}" y="455" text-anchor="middle" font-family="Montserrat,Arial" font-size="20" font-weight="700" fill="{WHITE if i not in (0,n-1) else NAVY}">{node.replace("&","&amp;")}</text>')
        if i: svg.append(f'<path d="M {x-gap+5} 450 L {x-8} 450" stroke="{GOLD}" stroke-width="8" marker-end="url(#a)"/>')
    svg.insert(1,f'<defs><marker id="a" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="{GOLD}"/></marker></defs>'); svg.append('</svg>')
    (OUT/f'{slug}.svg').write_text('\n'.join(svg))

for slug,(title,nodes) in FIGURES.items(): make(slug,title,nodes)
print({'figures':len(FIGURES),'output':str(OUT)})
