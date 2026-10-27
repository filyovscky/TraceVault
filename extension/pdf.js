import {MAX_PIXELS} from './screenshot.js';
import {encodePNG} from './png.js';
const utf16=value=>'FEFF'+[...String(value)].map(c=>{const cp=c.codePointAt(0);return cp>65535?((cp-65536)>>10|0xd800).toString(16).padStart(4,'0')+((cp-65536)&1023|0xdc00).toString(16).padStart(4,'0'):cp.toString(16).padStart(4,'0');}).join('');
// Small dependency-free PDF writer. Pixel streams are losslessly compressed;
// PDF text is limited to ASCII footer, with full Unicode attribution in Info.
export async function pngToPdf(png,{captureId,sourceUrl,sourceSha256,capturedAt,signal,maxBytes=64*1024*1024}) {
  const bitmap=await createImageBitmap(png),width=bitmap.width,height=bitmap.height;
  if(width*height>MAX_PIXELS){bitmap.close();throw new Error("PNG exceeds the PDF conversion limit");}
  const pageHeight=Math.max(1,Math.floor(width*770/547)),count=Math.ceil(height/pageHeight),objects=[],parts=[],offsets=[0];let length=0;
  const enc=new TextEncoder(),put=value=>{const bytes=typeof value==='string'?enc.encode(value):value;parts.push(bytes);length+=bytes.byteLength;if(length>maxBytes)throw new Error("PDF exceeds the size limit");};
  const add=async data=>{const id=objects.length+1;objects.push(data);return id;};
  const stream=(header,bytes)=>[enc.encode(`<< ${header} /Length ${bytes.byteLength} >>\nstream\n`),bytes,enc.encode('\nendstream')];
  const canvas=document.createElement('canvas');canvas.width=width;
  try{
    const catalog=await add(null),pages=await add(null),font=await add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),kids=[];
    for(let index=0;index<count;index++){
      signal?.throwIfAborted();const h=Math.min(pageHeight,height-index*pageHeight);canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,h);ctx.drawImage(bitmap,0,index*pageHeight,width,h,0,0,width,h);
      const raster=await encodePNG(canvas,{opaque:true,rasterOnly:true,signal,maxBytes}),compressed=new Uint8Array(await raster.blob.arrayBuffer());
      const image=await add(stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${width} >>`,compressed));
      const displayHeight=547*h/width,footer=`TraceVault | ${String(captureId).replace(/[^a-z0-9_-]/giu,'')} | ${index+1}/${count}`;
      const content=await add(stream('',enc.encode(`q 547 0 0 ${displayHeight.toFixed(4)} 24 ${(818-displayHeight).toFixed(4)} cm /Im0 Do Q\nBT /F1 8 Tf 24 12 Td (${footer}) Tj ET`)));
      kids.push(await add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${image} 0 R >> /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objects[catalog-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;objects[pages-1]=`<< /Type /Pages /Count ${count} /Kids [${kids.map(id=>`${id} 0 R`).join(' ')}] >>`;
    const info=await add(`<< /Title <${utf16('TraceVault — '+sourceUrl)}> /Subject <${utf16(`Raster derivative; source PNG SHA-256: ${sourceSha256}; captured UTC: ${capturedAt}; capture ID: ${captureId}; no OCR`)}> /Producer (TraceVault raster-pdf-v2) >>`);
    put('%PDF-1.7\n%TraceVault\n');
    for(const [index,obj] of objects.entries()){offsets.push(length);put(`${index+1} 0 obj\n`);if(Array.isArray(obj))obj.forEach(put);else put(obj);put('\nendobj\n');}
    const xref=length;put(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`);offsets.slice(1).forEach(n=>put(`${String(n).padStart(10,'0')} 00000 n \n`));put(`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return {blob:new Blob(parts,{type:'application/pdf'}),pageCount:count,method:'tracevault-raster-pdf-v2'};
  }finally{bitmap.close();canvas.width=canvas.height=1;}
}
