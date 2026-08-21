#!/usr/bin/env python3
from pathlib import Path
import sys

HERE=Path(__file__).resolve(); ROOT=HERE.parents[1]; PROD=ROOT.parent
sys.path.insert(0,str(PROD/"shared"))
from handbook_builder import *

OUT=ROOT/"output"; FIG=ROOT/"figures"; OUT.mkdir(parents=True,exist_ok=True); FIG.mkdir(parents=True,exist_ok=True)
DOCX=OUT/"APS_Operator_Handbook_Batch_5_Parts_XII-XIII.docx"
FIGURES={
48:("fig-28-exception-recovery.png","Exception Recovery Decision Tree",["Symptom","Authority/evidence clear?","Stop affected gate","Correct safely","Verify outcome","Record / escalate"],(1,4)),
49:("fig-29-security-boundary.png","Operator Security Boundary",["Authorized context","Minimum necessary","Protected action","Verify access/delivery","Incident?","Contain / escalate"],(0,4)),
50:("fig-30-assurance-loop.png","Operational Assurance Loop",["Pre-action check","Authorized action","Post-action verify","Audit / Timeline","Open issue?","Next Action / close"],(4,)),
}
for _,(fn,title,nodes,decisions) in FIGURES.items(): flow(FIG/fn,title,nodes,decisions)
doc=new_document("BATCH 5 · PARTS XII–XIII")
cover(doc,"Batch 5","PARTS XII–XIII  |  CHAPTERS 48–53")
lines=(ROOT/"PARTS_XII_XIII.md").read_text().splitlines(); items=headings(lines); add_contents(doc,items)
figure_map={ch:(FIG/fn,title) for ch,(fn,title,_,_) in FIGURES.items()}
parse_markdown(doc,lines,figure_map)
doc.core_properties.title="APS Operator Handbook — Batch 5 Parts XII–XIII"
doc.core_properties.author="Aligned Print & Scan"
doc.save(DOCX)
print({"docx":str(DOCX),"chapters":6,"toc_entries":len(items),"figures":len(FIGURES)})
