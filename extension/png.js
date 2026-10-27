// Independent PNG encoder: 8-bit RGB/RGBA, Sub/Up filters, native zlib.
// Bounded canvas strips avoid a second whole-image pixel array.
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data=new Uint8Array()){
  const result=new Uint8Array(data.length+12),view=new DataView(result.buffer);view.setUint32(0,data.length);
  result.set(new TextEncoder().encode(type),4);result.set(data,8);let crc=0xffffffff;
  for(let i=4;i<result.length-4;i++)crc=table[(crc^result[i])&255]^(crc>>>8);
  view.setUint32(result.length-4,(crc^0xffffffff)>>>0);return result;
}
export async function encodePNG(canvas,{opaque=false,signal,maxBytes=64*1024*1024,rasterOnly=false}={}){
  const {width,height}=canvas;if(!width || !height)throw new Error('Empty screenshot canvas');
  const channels=opaque?3:4,rowBytes=width*channels,rows=Math.max(1,Math.min(64,Math.floor(1024*1024/(width*4)))),ctx=canvas.getContext('2d');
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=opaque?2:6;
  const parts=rasterOnly?[]:[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',new Uint8Array([0]))],compression=new CompressionStream('deflate'),writer=compression.writable.getWriter(),reader=compression.readable.getReader();
  let total=parts.reduce((n,b)=>n+b.length,0),streamError,peakStripBytes=0;
  const collect=(async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length+(rasterOnly?0:12);if(total+(rasterOnly?0:12)>maxBytes)throw new Error('PNG raster exceeds the size limit');parts.push(rasterOnly?value:chunk('IDAT',value));}}catch(e){streamError=e;await reader.cancel(e).catch(()=>{});}})();
  const previous=new Uint8Array(rowBytes),current=new Uint8Array(rowBytes),sub=new Uint8Array(rowBytes),up=new Uint8Array(rowBytes),filtered=new Uint8Array((rowBytes+1)*rows);
  try{
    for(let top=0;top<height;top+=rows){
      signal?.throwIfAborted();if(streamError)throw streamError;
      const count=Math.min(rows,height-top);let rgba=ctx.getImageData(0,top,width,count).data;
      peakStripBytes=Math.max(peakStripBytes,rgba.byteLength+filtered.byteLength+rowBytes*4);
      for(let y=0;y<count;y++){
        const offset=y*width*4;if(opaque){for(let x=0,j=0;x<width;x++){current[j++]=rgba[offset+x*4];current[j++]=rgba[offset+x*4+1];current[j++]=rgba[offset+x*4+2];}}else current.set(rgba.subarray(offset,offset+rowBytes));
        let subScore=0,upScore=0;
        for(let x=0;x<rowBytes;x++){const a=(current[x]-(x>=channels?current[x-channels]:0))&255,b=(current[x]-previous[x])&255;sub[x]=a;up[x]=b;subScore+=Math.min(a,256-a);upScore+=Math.min(b,256-b);}
        const start=y*(rowBytes+1),useSub=subScore<=upScore;filtered[start]=useSub?1:2;filtered.set(useSub?sub:up,start+1);previous.set(current);
      }
      rgba=null;await writer.write(filtered.subarray(0,(rowBytes+1)*count));await new Promise(resolve=>setTimeout(resolve,0));
    }
    await writer.close();await collect;if(streamError)throw streamError;signal?.throwIfAborted();if(!rasterOnly)parts.push(chunk('IEND'));
    return {blob:new Blob(parts,{type:rasterOnly?'application/octet-stream':'image/png'}),peakStripBytes};
  }catch(e){await Promise.allSettled([writer.abort(e),reader.cancel(e)]);await collect;throw e;}
}
export async function smallerPNG(canvas,{fallback,opaque=false,signal,maxBytes}={}){
  const original=fallback || await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!original)throw new Error('Could not encode PNG');
  const encoded=await encodePNG(canvas,{opaque,signal,maxBytes:Math.min(maxBytes || 64*1024*1024,Math.max(original.size*2,1024*1024))}).catch(e=>{if(signal?.aborted)throw e;return {blob:null,peakStripBytes:null,error:e.message};});
  const smaller=encoded.blob && encoded.blob.size<original.size;
  return {blob:smaller?encoded.blob:original,encoding:{format:'png',lossless:true,pixel_resampling:false,encoder:smaller?'tracevault-strip-png-v1':'chrome-png',source_png_bytes:original.size,saved_png_bytes:smaller?encoded.blob.size:original.size,encoder_peak_strip_bytes:encoded.peakStripBytes,...(encoded.error?{optimization_skipped:encoded.error}:{})}};
}
export async function optimizePNG(blob,options={}){
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  try{canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0);bitmap.close();return await smallerPNG(canvas,{...options,fallback:blob});}
  finally{bitmap.close();canvas.width=canvas.height=1;}
}
