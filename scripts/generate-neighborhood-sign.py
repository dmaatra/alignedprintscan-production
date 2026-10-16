"""Generate APS artwork from the unchanged official raster logo and outlined brand fonts.
Development-only dependencies: reportlab, fonttools, pymupdf, qrcode, Pillow, opencv.
Usage: python scripts/generate-neighborhood-sign.py --montserrat FONT --playfair FONT
"""
import argparse,base64,hashlib,json
from pathlib import Path
from xml.sax.saxutils import escape
import qrcode
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
from reportlab.lib.colors import HexColor
from PIL import Image
import fitz,cv2
p=argparse.ArgumentParser();p.add_argument('--montserrat',required=True);p.add_argument('--playfair',required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'output/print/neighborhood-services';out.mkdir(parents=True,exist_ok=True)
qrdir=root/'assets/qr/neighborhood';qrdir.mkdir(parents=True,exist_ok=True)
fontdir=out/'fonts';fontdir.mkdir(exist_ok=True)
fonts={}
for name,source in [('Montserrat',args.montserrat),('Playfair',args.playfair)]:
 f=TTFont(source)
 if 'fvar' in f:f=instantiateVariableFont(f,{'wght':700},inplace=False)
 dest=fontdir/(name+'-Bold.ttf');f.save(dest);pdfmetrics.registerFont(RLFont(name,str(dest)));fonts[name]=f
url='https://alignedprintscan.com/neighborhood?utm_source=yard_sign&utm_medium=offline&utm_campaign=neighborhood_services'
qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H,box_size=24,border=4);qr.add_data(url);qr.make(fit=True);matrix=qr.get_matrix();n=len(matrix)
qrpath=' '.join(f'M{x} {y}h1v1h-1z' for y,row in enumerate(matrix) for x,on in enumerate(row) if on)
qrsvg=f'<svg xmlns="http://www.w3.org/2000/svg" width="5in" height="5in" viewBox="0 0 {n} {n}"><title>APS Neighborhood Services yard-sign QR</title><rect width="{n}" height="{n}" fill="white"/><path d="{qrpath}" fill="#161c4d"/></svg>'
(qrdir/'neighborhood-services-qr.svg').write_text(qrsvg)
qr.make_image(fill_color='#161c4d',back_color='white').convert('RGB').save(qrdir/'neighborhood-services-qr.png',dpi=(300,300))
W,H=1728,1296;B=9;navy='#161c4d';gold='#c8a96b';white='#ffffff';elements=[f'<rect width="{W}" height="{H}" fill="{navy}"/>'];texts=[]
logo=root/'assets/images/logo-full-original.png';encoded=base64.b64encode(logo.read_bytes()).decode()
# Clip only empty outer padding; all original wordmark pixels/colors/aspect remain unchanged.
scale=.72; lx=(W-910*scale)/2;ly=40;lw=910*scale;lh=345*scale
logo_el=f'<defs><clipPath id="logoClip"><rect x="{lx}" y="{ly}" width="{lw}" height="{lh}"/></clipPath></defs><image x="{lx-290*scale}" y="{ly-270*scale}" width="{1536*scale}" height="{1024*scale}" href="data:image/png;base64,{encoded}" clip-path="url(#logoClip)"/>'
elements.append(logo_el)
def text(value,font,size,cx,baseline,color,maxwidth):
 size=min(size,maxwidth/pdfmetrics.stringWidth(value,font,1));width=pdfmetrics.stringWidth(value,font,size);x=cx-width/2
 texts.append((value,font,size,x,baseline,color));f=fonts[font];glyphs=f.getGlyphSet();cmap=f.getBestCmap();upm=f['head'].unitsPerEm;cursor=0;paths=[]
 for char in value:
  g=cmap[ord(char)];pen=SVGPathPen(glyphs);glyphs[g].draw(pen);paths.append(f'<path d="{pen.getCommands()}" transform="translate({cursor} 0)"/>');cursor+=f['hmtx'][g][0]
 elements.append(f'<g aria-label="{escape(value)}" fill="{color}" transform="translate({x} {baseline}) scale({size/upm} {-size/upm})">'+''.join(paths)+'</g>')
text('NEED TO PRINT?','Playfair',180,W/2,458,white,1584)
text('TEXT • PRINT • DELIVERED','Montserrat',91,W/2,591,gold,1584)
text('MOBILE & ONLINE NOTARY','Montserrat',79,W/2,718,white,1584)
qx,qy,qs=150,802,360
elements.append(f'<g transform="translate({qx} {qy}) scale({qs/n})"><rect width="{n}" height="{n}" fill="white"/><path d="{qrpath}" fill="{navy}"/></g>')
text('SCAN OR TEXT','Montserrat',68,1070,925,white,1000)
text('(469) 383-8879','Montserrat',94,1070,1056,white,1050)
text('alignedprintscan.com/neighborhood','Montserrat',46,W/2,1230,white,1584)
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="24in" height="18in" viewBox="0 0 {W} {H}"><title>APS 24 by 18 inch yard sign - identical front and back</title>'+''.join(elements)+'</svg>'
(out/'aps-yard-sign-24x18-front-and-back.svg').write_text(svg)
pdf=out/'aps-yard-sign-24x18-front-and-back.pdf';c=canvas.Canvas(str(pdf),pagesize=(W+2*B,H+2*B),pageCompression=1)
c.setTitle('APS Neighborhood Services - identical front and back - 24 x 18 inches');c.setAuthor('Aligned Print & Scan')
c.setTrimBox((B,B,W+B,H+B));c.setBleedBox((0,0,W+2*B,H+2*B));c.setFillColor(HexColor(navy));c.rect(0,0,W+2*B,H+2*B,fill=1,stroke=0);c.translate(B,B)
c.saveState();clip=c.beginPath();clip.rect(lx,H-ly-lh,lw,lh);c.clipPath(clip,stroke=0);c.drawImage(str(logo),lx-290*scale,H-(ly-270*scale)-1024*scale,width=1536*scale,height=1024*scale);c.restoreState()
for value,font,size,x,baseline,color in texts:c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,H-baseline,value)
c.setFillColor(HexColor(white));c.rect(qx,H-qy-qs,qs,qs,fill=1,stroke=0);c.setFillColor(HexColor(navy))
for y,row in enumerate(matrix):
 for x,on in enumerate(row):
  if on:c.rect(qx+x*qs/n,H-qy-(y+1)*qs/n,qs/n,qs/n,fill=1,stroke=0)
c.showPage();c.save()
doc=fitz.open(pdf);page=doc[0];page.set_cropbox(fitz.Rect(B,B,W+B,H+B));pix=page.get_pixmap(matrix=fitz.Matrix(300/72,300/72),alpha=False);png=out/'aps-yard-sign-24x18-front-and-back.png';pix.save(png)
im=Image.open(png);im.save(png,dpi=(300,300));assert im.size==(7200,5400) and im.mode=='RGB'
page.get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(out/'aps-yard-sign-preview.png')
for path in [qrdir/'neighborhood-services-qr.png',png]:
 img=cv2.imread(str(path))
 if path==png:img=img[round(qy*300/72):round((qy+qs)*300/72),round(qx*300/72):round((qx+qs)*300/72)]
 decoded,points,_=cv2.QRCodeDetector().detectAndDecode(img);assert decoded==url,(path,decoded)
assert all(value in page.get_text() for value,*_ in texts)
metadata={'url':url,'finished_inches':[24,18],'pdf_media_inches':[24.25,18.25],'bleed_inches':.125,'minimum_safe_margin_inches':.5,'png_pixels':[7200,5400],'png_dpi':300,'qr_modules_including_quiet_zone':n,'qr_quiet_zone_modules':4,'qr_error_correction':'H','logo_effective_dpi':100,'logo_source':str(logo.relative_to(root)),'font_handling':'PDF embedded; SVG outlined; editable generator and fonts included','double_sided':'Upload same file for both sides; no mirroring','physical_camera_scan':'Not performed','sha256':{str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [pdf,png,qrdir/'neighborhood-services-qr.svg',qrdir/'neighborhood-services-qr.png']}}
(out/'verification.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata,indent=2))
