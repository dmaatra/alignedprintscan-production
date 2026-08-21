#!/usr/bin/env python3
from pathlib import Path
import json, re, subprocess, sys

HERE=Path(__file__).resolve(); ROOT=HERE.parents[1]; REPO=ROOT.parents[2]; PROD=ROOT.parent
sys.path.insert(0,str(PROD/"shared"))
from handbook_builder import *

OUT=ROOT/"output"; FIG=ROOT/"figures"; OUT.mkdir(parents=True,exist_ok=True); FIG.mkdir(parents=True,exist_ok=True)
DOCX=OUT/"APS_Operator_Handbook_Batch_4_Parts_X-XI.docx"

FIGURES={
41:("fig-25-business-lifecycle.png","Business Account Lifecycle Map",["Application","Review / approval","Organization","Invitation / activation","Eligible operations","Hold / closure"],(1,4)),
43:("fig-26-business-decision.png","Business Account Decision Guide",["Approved?","Activated?","Role / organization correct?","Eligible / no hold?","Request gates","Preserve history"],(0,1,2,3)),
45:("fig-27-communication-decision.png","Communication Control Decision Tree",["Message required?","Exact template?","Prerequisites pass?","Send authorized path","Delivery succeeds?","Record / next stage"],(0,1,2,4)),
}
for _,(fn,title,nodes,decisions) in FIGURES.items(): flow(FIG/fn,title,nodes,decisions)

def templates():
    source=(REPO/"docs/handbook-spec/TEMPLATE_DIRECTORY_SOURCE.md").read_text()
    category=""
    rows=[]
    for line in source.splitlines():
        if line.startswith("### ") and re.search(r"\(\d+\)$",line): category=re.sub(r"\s*\(\d+\)$","",line[4:])
        match=re.match(r"- `([^`]+)` — (.+)",line)
        if match: rows.append({"key":match.group(1),"name":match.group(2),"category":category})
    assert len(rows)==54 and len({r['key'] for r in rows})==54
    return rows

def scripts():
    code="import('./assets/js/operator-reference-catalog.mjs').then(m=>console.log(JSON.stringify(m.OPERATOR_REFERENCE_SCRIPTS)))"
    result=subprocess.run(["node","-e",code],cwd=REPO,text=True,capture_output=True,check=True)
    rows=json.loads(result.stdout); assert len(rows)==48 and len({r['key'] for r in rows})==48
    return rows

TEMPLATES=templates(); SCRIPTS=scripts()

def template_service(key):
    if key.startswith("lsa_"): return "Loan Signing"
    if key.startswith("business_"): return "Business Accounts"
    if "ron" in key: return "Remote Online Notary"
    if "mobile" in key: return "Mobile Notary"
    if "scan" in key: return "Print & Scan"
    if key=="resource_center_response": return "Resource Center"
    return "All applicable services"

def template_class(key):
    if key=="general_customer_message": return "OPERATOR"
    if key in {"appointment_reminder","review_request","business_payment_due_soon","business_payment_due_today","business_payment_past_due"}: return "SOURCE-NOTED — event timing must be verified before AUTO use"
    return "IF NEEDED — operator verifies actual condition and current send path"

def template_audience(key):
    if key.startswith("business_"): return "Authorized Business Account contact/member"
    if key.startswith("lsa_"): return "Authorized ordering-party or signer recipient, as the maintained event requires"
    return "Eligible customer/recipient for the current request"

def add_templates(doc):
    doc.add_heading("46.5 Compact Master Index",2)
    table(doc,[["Key","Name","Category","Service"]]+[[x["key"],x["name"],x["category"],template_service(x["key"])] for x in TEMPLATES])
    alias={"aps_cancellation_service_unavailable":"preview alias: aps_unable_to_fulfill","late_cancellation_explanation":"preview alias: late_retained_amount_explanation","cancellation_confirmed_refund_due":"preview alias: refund_due"}
    for i,item in enumerate(TEMPLATES,1):
        key=item["key"]; h=doc.add_heading(f"46.{i+5} {item['name']}",2); h.paragraph_format.page_break_before=True
        classification=template_class(key); audience=template_audience(key)
        rows=[
          ["Template field","Controlled operator guidance"],
          ["Template name / key",f"{item['name']} / {key}"],
          ["Category / service",f"{item['category']} / {template_service(key)}"],
          ["Purpose",f"Communicate the verified {item['name'].lower()} condition without changing facts or policy."],
          ["Audience / recipient",audience],
          ["WHEN TO USE",f"Only when the current authoritative record supports {item['name'].lower()}."],
          ["WHEN NOT TO USE","Wrong recipient/request/organization; stale or unverified condition; prerequisite, attachment, release, or financial conflict."],
          ["WHAT MUST BE TRUE BEFORE SENDING","Recipient eligibility, current stage/condition, variables, attachments, and prior delivery attempts are verified."],
          ["AUTO / OPERATOR / IF NEEDED",classification],
          ["Trigger / channel","Verified workflow condition; maintained email/operator communication path. Template existence alone is not automation evidence."],
          ["Recipient outcome",f"Recipient receives the customer-safe {item['name'].lower()} message and its authorized next step."],
          ["Related status / next action / gate","Use the actual associated status where maintained; do not update status unless successful delivery and the maintained transition both apply."],
          ["What happens next",f"Follow the service-specific procedure after the recipient receives {item['name'].lower()}."],
          ["What APS records","Template key, recipient, channel, rendered content, delivery result, time, source event, and Timeline/Communication Log evidence."],
          ["Important variables","Customer/organization identity, request reference, service, current dates/amounts/links, and eligible attachment where applicable."],
          ["Operator cautions","Do not expose internal terms, promise provider timing, send unreleased files, duplicate delivery, or manufacture status."],
          ["Alias / source note",alias.get(key,"Production key verified in the locked 54-key directory; exact automation remains governed by current implementation.")],
        ]
        table(doc,rows)

def script_type(item):
    if item["category"]=="Quick-Flip": return "QUICK-FLIP / QUICK REFERENCE"
    if item["category"]=="Checklists": return "CHECKLIST"
    if item["category"]=="Problem / Stop / Refusal" or "stop" in item["key"]: return "DECISION / STOP CARD"
    return "FULL SCRIPT"

def script_service(item):
    c=item["category"]
    return {"RON Session":"RON","Mobile Notary":"Mobile Notary","Print & Scan":"Print & Scan","Loan Signing":"Loan Signing"}.get(c,"All applicable notarial/services")

def add_scripts(doc):
    doc.add_heading("47.5 Compact Script Index",2)
    table(doc,[["Key","Name","Category","Type"]]+[[x["key"],x["name"],x["category"],script_type(x)] for x in SCRIPTS])
    for i,item in enumerate(SCRIPTS,1):
        h=doc.add_heading(f"47.{i+5} {item['name']}",2); h.paragraph_format.page_break_before=True
        related_template="None verified; use the service’s maintained communication sequence" if "template" not in item["related"].lower() else item["related"]
        table(doc,[
          ["Script/card field","Maintained guidance"],
          ["Name / key",f"{item['name']} / {item['key']}"],
          ["Category / service / classification",f"{item['category']} / {script_service(item)} / {script_type(item)}"],
          ["Purpose",item["purpose"]],
          ["WHEN TO USE",item["when"]],
          ["WHEN NOT TO USE",f"Do not use outside the stated situation, to bypass this stop condition, or as authority to send/change data: {item['stop']}"],
          ["Situation / audience","Operator reference for the maintained service situation; speak only to the authorized participant/recipient."],
          ["Maintained wording",item["say"]],
          ["Operator boundary","; ".join(item["doNot"])],
          ["Must do","; ".join(item["mustDo"])],
          ["Stop / decision condition",item["stop"]],
          ["Related workflow stage / gate",item["next"]],
          ["Related template",related_template],
          ["Related source/procedure",item["related"]],
          ["Reference-only safety","Using this item does not send, change status, move money, modify records, release documents, or create provider activity."],
        ])

def hook(doc,chapter):
    if chapter=="TEMPLATE_DIRECTORY": add_templates(doc)
    if chapter=="SCRIPT_DIRECTORY": add_scripts(doc)

doc=new_document("BATCH 4 · PARTS X–XI")
cover(doc,"Batch 4","PARTS X–XI  |  CHAPTERS 41–47")
lines=(ROOT/"PARTS_X_XI.md").read_text().splitlines(); items=headings(lines); add_contents(doc,items)
figure_map={ch:(FIG/fn,title) for ch,(fn,title,_,_) in FIGURES.items()}
parse_markdown(doc,lines,figure_map,hook)
doc.core_properties.title="APS Operator Handbook — Batch 4 Parts X–XI"; doc.core_properties.author="Aligned Print & Scan"; doc.save(DOCX)
print({"docx":str(DOCX),"chapters":7,"templates":len(TEMPLATES),"scripts":len(SCRIPTS),"toc_entries":len(items),"figures":len(FIGURES)})
