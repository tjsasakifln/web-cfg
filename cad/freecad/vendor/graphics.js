// SPDX-License-Identifier: LGPL-2.1-or-later
// Copyright (c) Virtastic
// Graphics, event-loop and browser autosave compatibility from FreeCAD-Web v1.0.9.
// Exact source: https://github.com/Virtastic/freecad-web/blob/v1.0.9/play-gui/freecad-gui.html
// Adapted script blocks 7 and 8: removed addon-install API and remote-session tick.
// Local recovery copies are retained instead of expiring or pruning unopened files.
// Debug URL switches are disabled to keep query values out of generated Python.
// No networking or server-session code. See NOTICE.txt for the adaptation.

// FCWEB: the GL emulation calls enable/disable/vertexAttribPointer with
// location -1 for attributes its generated shader doesn't use — each call spams
// "INVALID_VALUE: index out of range". GL semantics are error+ignore, so skip
// them silently.
(function(){
  ['enableVertexAttribArray','disableVertexAttribArray'].forEach(function(nm){
    var o=WebGL2RenderingContext.prototype[nm];
    WebGL2RenderingContext.prototype[nm]=function(i){ if(i<0||i===4294967295) return; return o.call(this,i); };
  });
  var vap=WebGL2RenderingContext.prototype.vertexAttribPointer;
  WebGL2RenderingContext.prototype.vertexAttribPointer=function(i){ if(i<0||i===4294967295) return; return vap.apply(this,arguments); };
})();
// FCWEB PERF: during interactive redraw Coin queries FRAMEBUFFER_BINDING + VIEWPORT
// ~29x per draw (~380k JS<->GPU round-trips per orbit) and the immediate-mode flush
// re-binds the same shader program every batch. Those round-trips dominated the frame
// (~17 FPS). Cache framebuffer + viewport (tracked via bindFramebuffer/viewport) and
// skip redundant useProgram. Correct because every state change flows through these same
// wrapped methods; per-context state lives on the context object, so context loss/reuse
// re-initialises cleanly. Restores interactive orbit toward 30+ FPS.
(function(){
  var P=WebGL2RenderingContext.prototype;
  var FB_BINDING=0x8CA6, VIEWPORT=0x0BA2, TARGET_FRAMEBUFFER=0x8D40;
  var _gp=P.getParameter;
  P.getParameter=function(pn){
    if(pn===FB_BINDING && this._fcFB!==undefined) return this._fcFB;
    if(pn===VIEWPORT && this._fcVP) return this._fcVP;
    if(pn===DEPTH_RANGE && this._fcDR) return this._fcDR;
    if(pn===UNPACK_ALIGNMENT && this._fcUA!==undefined) return this._fcUA;
    return _gp.apply(this,arguments);
  };
  // drawAxisCross reads DEPTH_RANGE and UNPACK_ALIGNMENT back every frame (measured
  // 2026-09-12); both only change through these two entry points.
  var DEPTH_RANGE=0x0B70, UNPACK_ALIGNMENT=0x0CF5;
  // ... and the blend function, which the present pass changes and must put back.
  var _blf=P.blendFunc, _blfs=P.blendFuncSeparate;   // NOT _bf: that is bindFramebuffer above
  P.blendFunc=function(s,d){ this._fcBF=[s,d,s,d]; return _blf.apply(this,arguments); };
  P.blendFuncSeparate=function(s,d,sa,da){ this._fcBF=[s,d,sa,da]; return _blfs.apply(this,arguments); };
  var _dr=P.depthRange;
  P.depthRange=function(n,f){ var a=this._fcDR||(this._fcDR=new Float32Array(2)); a[0]=n;a[1]=f; return _dr.apply(this,arguments); };
  var _bf=P.bindFramebuffer;
  P.bindFramebuffer=function(target,fb){ this._fcFB=(target===TARGET_FRAMEBUFFER)?fb:undefined; return _bf.apply(this,arguments); };
  var _vp=P.viewport;
  P.viewport=function(x,y,w,h){ var a=this._fcVP||(this._fcVP=new Int32Array(4)); a[0]=x;a[1]=y;a[2]=w;a[3]=h; return _vp.apply(this,arguments); };
  // useProgram(null) is deferred: the emulation unbinds its renderer program after a
  // batch and binds it again for the next one (2 useProgram per draw, measured 2026-09-14
  // on BIMExample). A null bind is only observable at a draw or a uniform upload, so it is
  // remembered there and cancelled when the same program comes back.
  var _up=P.useProgram;
  function applyPN(gl){ gl._fcPN=false; gl._fcProg=null; _up.call(gl,null); }
  P.useProgram=function(prog){ if(!prog){ if(this._fcProg===null||this._fcProg===undefined) return; this._fcPN=true; return; }
    if(this._fcProg===prog){ this._fcPN=false; return; } this._fcPN=false; this._fcProg=prog; return _up.apply(this,arguments); };
  ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements','deleteProgram'].forEach(function(nm){
    var o=P[nm]; P[nm]=function(){ if(this._fcPN) applyPN(this); return o.apply(this,arguments); }; });
  Object.getOwnPropertyNames(P).forEach(function(nm){ if(!/^uniform/.test(nm)) return; var o=P[nm]; if(typeof o!=='function') return;
    P[nm]=function(){ if(this._fcPN) applyPN(this); return o.apply(this,arguments); }; });
  var _gpp=P.getParameter; P.getParameter=function(pn){ if(pn===35725 && this._fcProg!==undefined) return this._fcPN?null:this._fcProg; return _gpp.apply(this,arguments); };
  // Not a skip -- a truthful record of the last VAO requested, for the present pass to restore.
  var _bva=P.bindVertexArray;
  P.bindVertexArray=function(vao){ this._fcVAO=vao; return _bva.apply(this,arguments); };
  // Skip redundant ARRAY_BUFFER re-binds (global state, not VAO-scoped, so safe to cache).
  var ARRAY_BUFFER=0x8892;
  var _bb=P.bindBuffer;
  // An ARRAY_BUFFER unbind is deferred the same way as a null program: Coin binds a VBO,
  // draws, unbinds, and the next draw binds the next one (or the emulation's temp buffer).
  // A null binding is observable only by the calls that read it -- vertexAttribPointer,
  // bufferData/bufferSubData, getBufferParameter -- so it is applied there.
  function applyABN(gl){ gl._fcABN=false; gl._fcAB=null; _bb.call(gl,ARRAY_BUFFER,null); }
  P.bindBuffer=function(target,buf){ if(target===ARRAY_BUFFER){ if(!buf){ if(this._fcAB===null||this._fcAB===undefined) return; this._fcABN=true; return; }
      if(this._fcAB===buf){ this._fcABN=false; return; } this._fcABN=false; this._fcAB=buf; } return _bb.apply(this,arguments); };
  ['vertexAttribPointer','vertexAttribIPointer','bufferData','bufferSubData','getBufferParameter','getBufferSubData','copyBufferSubData','deleteBuffer','bindBufferBase','bindBufferRange'].forEach(function(nm){
    var o=P[nm]; if(typeof o!=='function') return; P[nm]=function(){ if(this._fcABN) applyABN(this); return o.apply(this,arguments); }; });
  var _gpab=P.getParameter; P.getParameter=function(pn){ if(pn===34964 && this._fcAB!==undefined) return this._fcABN?null:this._fcAB; return _gpab.apply(this,arguments); };
  // Not a skip -- a record of UNPACK_FLIP_Y_WEBGL, so the GPU bridge reads it without a
  // synchronous getParameter (two per presented frame, measured 2026-09-12).
  var UNPACK_FLIP_Y=0x9240;
  var _ps=P.pixelStorei;
  P.pixelStorei=function(pn,v){ if(pn===UNPACK_FLIP_Y) this._fcFlipY=!!v; else if(pn===UNPACK_ALIGNMENT) this._fcUA=v; return _ps.apply(this,arguments); };
})();
// FCWEB PERF: the rest of the per-draw churn. With GL_UNSAFE_OPTS=0 the emulation tears
// every immediate-mode batch down and builds the next one up from nothing: enable/
// disableVertexAttribArray, vertexAttribPointer, uniform4fv x4 (ambient, diffuse,
// specular, emission on every material bump), lineWidth on every element push/pop.
// Measured on ArchDetail, 2026-09-14: 17,900 WebGL calls per scene frame for ~950 draws,
// 2,471 disableVertexAttribArray, 2,538 uniform4fv, 565 lineWidth, 398 disable. Each is
// state that only changes through these prototype methods, so a shadow of the last value
// makes the repeat a no-op. Vertex-array state is per VAO, so that shadow is keyed on the
// VAO the page tracked in bindVertexArray; uniform values are per program object, so
// theirs is keyed on the (stable, emscripten-cached) location object and invalidated by
// linkProgram, which resets a program's uniforms. ?glshadow=0 turns all of it off.
(function(){
  var P=WebGL2RenderingContext.prototype;
  try { if (new URLSearchParams('').get('glshadow') === '0') return; } catch (e) {}
  var stats = window.__glShadow = { attribEn: 0, attribPtr: 0, uniform: 0, lineWidth: 0, cap: 0, viewport: 0 };
  function vaoState(gl){ var m=gl._fcVaoSt||(gl._fcVaoSt=new Map()); var k=gl._fcVAO||null; var s=m.get(k); if(!s){ s={en:new Uint8Array(32), pd:new Uint8Array(32), ptr:new Array(32)}; m.set(k,s); } return s; }
  var _dva=P.deleteVertexArray;
  P.deleteVertexArray=function(vao){ try { if(this._fcVaoSt){ var st=this._fcVaoSt.get(vao); if(st&&this._fcPD===st) this._fcPD=null; this._fcVaoSt.delete(vao); } if(this._fcVAO===vao) this._fcVAO=null; } catch(e){} return _dva.apply(this,arguments); };
  // A disable is deferred to the next draw (or VAO switch) and cancelled by an enable in
  // between: the emulation disables its attributes after every batch and the next
  // renderer enables the same locations again (position is location 0 in every one).
  var _en=P.enableVertexAttribArray, _dis=P.disableVertexAttribArray;
  function applyPD(gl){ var s=gl._fcPD; gl._fcPD=null; if(!s) return; for(var i=0;i<32;i++){ if(s.pd[i]){ s.pd[i]=0; _dis.call(gl,i); } } }
  P.enableVertexAttribArray=function(i){ if(i<0||i===4294967295) return; if(i<32){ var s=vaoState(this); if(s.en[i]===1){ stats.attribEn++; return; } s.en[i]=1; if(s.pd[i]){ s.pd[i]=0; stats.attribEn++; return; } } return _en.call(this,i); };
  P.disableVertexAttribArray=function(i){ if(i<0||i===4294967295) return; if(i<32){ var s=vaoState(this); if(s.en[i]===2){ stats.attribEn++; return; } var was=s.en[i]; s.en[i]=2; if(was===1){ s.pd[i]=1; this._fcPD=s; return; } } return _dis.call(this,i); };
  // Applied at the next draw: leaving them through a draw of a program that does not
  // consume them was tried -- ANGLE's D3D11 vertex path validates every enabled attribute
  // (85 GL_INVALID_OPERATION in VertexDataManager on one BIMExample redraw). And at a
  // VAO switch, because the state belongs to the old VAO.
  ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','drawRangeElements'].forEach(function(nm){
    var o=P[nm]; P[nm]=function(){ if(this._fcPD) applyPD(this); return o.apply(this,arguments); }; });
  var _bva2=P.bindVertexArray; P.bindVertexArray=function(vao){ if(this._fcPD) applyPD(this); return _bva2.apply(this,arguments); };
  var _vap=P.vertexAttribPointer;
  P.vertexAttribPointer=function(i,size,type,norm,stride,off){ if(i<0||i===4294967295) return;
    if(i<32){ var s=vaoState(this), buf=this._fcAB, p=s.ptr[i];
      if(p && p[0]===buf && p[1]===size && p[2]===type && p[3]===!!norm && p[4]===stride && p[5]===off){ stats.attribPtr++; return; }
      s.ptr[i]=[buf,size,type,!!norm,stride,off]; }
    return _vap.apply(this,arguments); };
  var _gul=P.getUniformLocation, _lp=P.linkProgram;
  P.getUniformLocation=function(prog,name){ var l=_gul.apply(this,arguments); if(l && !l.__fcP){ l.__fcP=prog; } return l; };
  P.linkProgram=function(prog){ prog.__fcGen=(prog.__fcGen|0)+1; return _lp.apply(this,arguments); };
  function same(loc, v, n){ var p=loc.__fcP, g=p?p.__fcGen|0:0; var c=loc.__fcV; if(c && loc.__fcG===g && c.length===n){ for(var i=0;i<n;i++){ if(c[i]!==v[i]) break; } if(i===n) return true; c.set ? c.set(v) : 0; for(i=0;i<n;i++) c[i]=v[i]; return false; } loc.__fcG=g; loc.__fcV=new Float32Array(n); for(i=0;i<n;i++) loc.__fcV[i]=v[i]; return false; }
  var _u4=P.uniform4fv, _u3=P.uniform3fv, _u2=P.uniform2fv, _u1f=P.uniform1f, _u1i=P.uniform1i, _um4=P.uniformMatrix4fv, _um3=P.uniformMatrix3fv;
  P.uniform4fv=function(loc,v){ if(loc && v.length===4 && arguments.length===2 && same(loc,v,4)){ stats.uniform++; return; } return _u4.apply(this,arguments); };
  P.uniform3fv=function(loc,v){ if(loc && v.length===3 && arguments.length===2 && same(loc,v,3)){ stats.uniform++; return; } return _u3.apply(this,arguments); };
  P.uniform2fv=function(loc,v){ if(loc && v.length===2 && arguments.length===2 && same(loc,v,2)){ stats.uniform++; return; } return _u2.apply(this,arguments); };
  P.uniform1f=function(loc,x){ if(loc && same(loc,[x],1)){ stats.uniform++; return; } return _u1f.apply(this,arguments); };
  P.uniform1i=function(loc,x){ if(loc && same(loc,[x],1)){ stats.uniform++; return; } return _u1i.apply(this,arguments); };
  P.uniformMatrix4fv=function(loc,tr,v){ if(loc && !tr && v.length===16 && arguments.length===3 && same(loc,v,16)){ stats.uniform++; return; } return _um4.apply(this,arguments); };
  P.uniformMatrix3fv=function(loc,tr,v){ if(loc && !tr && v.length===9 && arguments.length===3 && same(loc,v,9)){ stats.uniform++; return; } return _um3.apply(this,arguments); };
  var _lw=P.lineWidth;
  P.lineWidth=function(w){ if(this._fcLW===w){ stats.lineWidth++; return; } this._fcLW=w; return _lw.apply(this,arguments); };
  var _cen=P.enable, _cdis=P.disable;
  P.enable=function(cap){ var c=this._fcCap||(this._fcCap={}); if(c[cap]===1){ stats.cap++; return; } c[cap]=1; return _cen.call(this,cap); };
  P.disable=function(cap){ var c=this._fcCap||(this._fcCap={}); if(c[cap]===2){ stats.cap++; return; } c[cap]=2; return _cdis.call(this,cap); };
  // glGetError is a GPU-process round trip; View3DInventorViewer::actualRedraw asks four
  // times a frame (measured 2026-09-14, 3.7% of an EngineBlock drag). GL errors are sticky
  // until read, so answering NO_ERROR for 50 ms after a real read loses nothing: the next
  // real read still reports whatever happened.
  var _ge=P.getError;
  P.getError=function(){ var now=performance.now(); if(this._fcGEat!==undefined && now-this._fcGEat<50) return 0; this._fcGEat=now; return _ge.call(this); };
  // The raster text in gl_legacy_stubs.c (axis letters, colour bar numbers) saves and
  // restores the texture binding and blend function around its quad; asked of WebGL those
  // are round trips -- 12 a frame for three letters, 12.5% of a PartDesignExample drag
  // (measured 2026-09-14). All of it is state that passes through here.
  var TEXTURE_2D=0x0DE1, TEXTURE0=0x84C0, TEXTURE_BINDING_2D=0x8069, BLEND_SRC_RGB=0x80C9, BLEND_DST_RGB=0x80C8, BLEND_SRC_ALPHA=0x80CB, BLEND_DST_ALPHA=0x80CA;
  var _at=P.activeTexture; P.activeTexture=function(u){ this._fcUnit=u-TEXTURE0; return _at.apply(this,arguments); };
  var _bt=P.bindTexture; P.bindTexture=function(target,tex){ if(target===TEXTURE_2D){ (this._fcTex2D||(this._fcTex2D=[]))[this._fcUnit||0]=tex||null; } return _bt.apply(this,arguments); };
  var _dt=P.deleteTexture; P.deleteTexture=function(tex){ var a=this._fcTex2D; if(a){ for(var i=0;i<a.length;i++) if(a[i]===tex) a[i]=null; } return _dt.apply(this,arguments); };
  var _gp2=P.getParameter;
  P.getParameter=function(pn){
    if(pn===TEXTURE_BINDING_2D){ var a=this._fcTex2D, u=this._fcUnit||0; if(a && u in a) return a[u]; }
    else if(pn===BLEND_SRC_RGB){ if(this._fcBF) return this._fcBF[0]; }
    else if(pn===BLEND_DST_RGB){ if(this._fcBF) return this._fcBF[1]; }
    else if(pn===BLEND_SRC_ALPHA){ if(this._fcBF) return this._fcBF[2]; }
    else if(pn===BLEND_DST_ALPHA){ if(this._fcBF) return this._fcBF[3]; }
    return _gp2.apply(this,arguments); };
  var _ie=P.isEnabled; P.isEnabled=function(cap){ var c=this._fcCap; if(c){ if(c[cap]===1) return true; if(c[cap]===2) return false; } return _ie.call(this,cap); };
  var _vp2=P.viewport;
  P.viewport=function(x,y,w,h){ var a=this._fcVP; if(a && a[0]===x && a[1]===y && a[2]===w && a[3]===h){ stats.viewport++; return; } return _vp2.apply(this,arguments); };
})();


// FCWEB GL tracer: wrap WebGL2 draw calls to see what actually reaches the GPU.
//
// OPT-IN (?gltrace=1). It used to run for every user, and it is not free: it wraps every
// drawArrays/drawElements and, for the first 400, issues synchronous getParameter /
// isEnabled reads. Those flush the GL pipeline, on a renderer that is already draw-call
// bound at ~11 fps on a heavy scene -- so the diagnostic was taxing the exact thing it
// exists to diagnose, and retaining 400 records with shader and uniform dumps besides.
//
// The render-debug switches below (?nodepth, ?nocull, ?darkbg) live in the same block and
// are gated on ?dev=1. They are support surface, not security: a user who lands on a
// shared link carrying ?skipCoin or ?nodepth files a bug nobody can reproduce.
//
// DO NOT early-return out of this IIFE to disable the tracer. It is not a tracer block --
// it continues on to the 3D overlay compositor, the memory-pressure monitor and
// fcwebHeapUsedMB, and the autosave install/restore poll. Returning here silently disabled
// ALL of that: no memory warning, and no autosave, so a user's work was never written and
// nothing said so. Gate the individual features (as the `if (__trace)` around the wrap()
// calls below does) and leave the IIFE itself to run to the end.
(function(){
  var __qs = '';
  var __trace = /[?&]gltrace=1/.test(__qs);
  var __dev   = /[?&]dev=1/.test(__qs);
  if (__trace) { window.__gllog = []; }

  // OPT-IN (?pixelgate=1): keep the drawing buffer so the frame can be READ BACK.
  //
  // Rendering has never been gated, and the stated reason -- that a headless run cannot
  // judge it -- turned out to be wrong twice over. requestAnimationFrame does fire
  // headless (measured: 179 ticks in 3 s) and Chromium's SwiftShader gives a real WebGL2
  // context. What actually defeated every attempt is this: the context is created without
  // preserveDrawingBuffer, so the buffer is undefined once the frame composites, and both
  // a screenshot and a drawImage read back pure black while the app is drawing perfectly
  // well -- 399 draw calls, 20 of them in the main viewport, all traced.
  //
  // preserveDrawingBuffer costs real performance, so users must never get it. Behind a
  // flag it makes the viewport measurable, which is the whole of RELEASE-PLAN V6.
  if (/[?&]pixelgate=1/.test(__qs)) {
    var __getctx = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs){
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
      }
      return __getctx.call(this, type, attrs);
    };
    // Coin renders into its OWN offscreen FBO (window.__fcCoinFbo names its GL id) and the
    // C++ blits that into Qt's backing FBO, so the canvas default framebuffer is black by
    // construction -- which is why every capture attempt read black while the tracer showed
    // 399 draws. Reading the right buffer needs the WebGLFramebuffer OBJECT, and an id
    // cannot be turned into one from JS: emscripten's GL.framebuffers map is not exported.
    // So record the object as it is bound. Same trick the compositor's own shadow uses.
    ['WebGL2RenderingContext', 'WebGLRenderingContext'].forEach(function(n){
      if (!window[n]) { return; }
      var P = window[n].prototype, orig = P.bindFramebuffer;
      P.bindFramebuffer = function(target, fb){
        if (fb) {
          window.__fcPixelFbo = fb; window.__fcPixelGl = this;
          // EVERY distinct one, not just the last: the last bound is usually Qt's UI
          // buffer, and the scene is in one of the others. A handful exist, so a list
          // is cheap and lets a gate find the one with the picture in it.
          var all = (window.__fcPixelFbos = window.__fcPixelFbos || []);
          if (all.indexOf(fb) < 0 && all.length < 16) { all.push(fb); }
        }
        return orig.apply(this, arguments);
      };
    });
    window.__fcPixelGate = true;
  }
  function wrap(proto, name){
    var orig = proto[name];
    proto[name] = function(){
      if (window.__gllog.length < 400) {
        var prog = this.getParameter(this.CURRENT_PROGRAM);
        var vp = this.getParameter(this.VIEWPORT);
        var rec = { fn:name, args:Array.prototype.slice.call(arguments,0,5),
          prog: prog? (prog.__fcid || (prog.__fcid = ++window.__progn||(window.__progn=1))) : 0,
          depth: this.isEnabled(this.DEPTH_TEST), vp: vp && Array.prototype.slice.call(vp) };
        // For the box face draw (TRIANGLES, big count, main viewport) capture MVP uniforms
        if (name==='drawArrays' && arguments[0]===4 && arguments[2]>=24 && vp && vp[2]>400 && prog && !window.__mvpDumped) {
          window.__mvpDumped = true;
          try {
            var gl=this, dump={};
            var n=gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
            for (var i=0;i<n;i++){ var u=gl.getActiveUniform(prog,i); { var loc=gl.getUniformLocation(prog,u.name); var val=gl.getUniform(prog,loc); dump[u.name]= (val&&val.length!==undefined)?Array.prototype.slice.call(val):val; } }
            var a0 = { enabled: gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
              size: gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_SIZE),
              type: gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_TYPE),
              stride: gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
              bufBound: !!gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) };
            // read back a few vertices from the bound array buffer
            var buf = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
            var verts=null;
            if (buf) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); var out=new Float32Array(12); try{ gl.getBufferSubData(gl.ARRAY_BUFFER,0,out); verts=Array.prototype.slice.call(out);}catch(e){verts='readfail:'+e;} }
            // enumerate ALL attributes by name + their pointer/offset
            var attrs=[]; var na=gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
            for (var ai=0; ai<na; ai++){ var inf=gl.getActiveAttrib(prog,ai); var loc=gl.getAttribLocation(prog,inf.name);
              attrs.push({ name:inf.name, loc:loc,
                enabled: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
                size: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_SIZE),
                stride: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
                offset: gl.getVertexAttribOffset(loc, gl.VERTEX_ATTRIB_ARRAY_POINTER) }); }
            var shaders = gl.getAttachedShaders(prog).map(function(sh){ return { type: gl.getShaderParameter(sh, gl.SHADER_TYPE)===gl.VERTEX_SHADER?'VS':'FS', src: gl.getShaderSource(sh) }; });
            window.__mvp = { count:arguments[2], vp:Array.prototype.slice.call(vp), uniforms:dump, attribs:attrs, firstVerts:verts, shaders:shaders };
          } catch(e){ window.__mvp={err:String(e)}; }
        }
        window.__gllog.push(rec);
      }
      return orig.apply(this, arguments);
    };
  }
  try {
    if (__trace) {
      wrap(WebGL2RenderingContext.prototype, 'drawElements');
      wrap(WebGL2RenderingContext.prototype, 'drawArrays');
    }
    var qp = __dev ? new URLSearchParams('') : new URLSearchParams('');
    if (qp.has('nodepth') || qp.has('nocull')) {
      var _en = WebGL2RenderingContext.prototype.enable;
      WebGL2RenderingContext.prototype.enable = function(cap){
        if (qp.has('nodepth') && cap === 0x0B71) return;  // DEPTH_TEST
        if (qp.has('nocull') && cap === 0x0B44) return;    // CULL_FACE
        return _en.call(this, cap); };
    }
    if (qp.has('darkbg')) {
      var _cc = WebGL2RenderingContext.prototype.clearColor;
      WebGL2RenderingContext.prototype.clearColor = function(){ return _cc.call(this, 0.05, 0.05, 0.15, 1); };
    }
  } catch(e){}

  // FCWEB 3D-overlay compositor: Qt-wasm won't blit Coin's render to the page.
  // So we read Coin's pixels from the default framebuffer (Coin renders to FBO 0
  // via the wasm patch) and paint them onto our own overlay <canvas> that sits
  // above the Qt canvas — completely outside Qt's (broken) compositor.
  (function(){
    var qp = new URLSearchParams('');
    // The 3D overlay compositor activates whenever 3D rendering is on.
    // ?no3d must switch OFF the compositor and nothing else. It used to `return` from
    // this IIFE -- which by then also contained runPy, the memory-pressure monitor and
    // the autosave install/restore poll, so ?no3d silently disabled AUTOSAVE. That is
    // the very failure the comment above this IIFE warns about, one level deeper, and it
    // was measured: with ?no3d the observer never installs and .fcweb-autosave is never
    // created; without it the observer reports installed in 13 s.
    (function(){          // compositor only -- do not put durability code in here
    if (qp.has('no3d')) return;  // compositor on by default with the 3D pipeline
    var ov, ovctx, buf, imgData, lastW=0, lastH=0, throttle=0;
    // Publish the 3D widget's on-screen rect (CSS px, relative to the main window)
    // from Qt — only Qt knows the MDI/dock layout. Printed to stderr as "FCRECT {…}"
    // and captured by append(). Polled because docks/resizes move it.
    // NOTE: write to sys.__stderr__ (raw fd 2 -> emscripten printErr -> our append
    // hook), NOT sys.stderr — FreeCAD redirects sys.stderr into the in-app Report
    // view, which would spam it red. Dedupe: only emit when the rect changes.
    var RECT_PY = [
      "try:",
      " from PySide2 import QtWidgets, QtCore",
      "except Exception:",
      " from PySide6 import QtWidgets, QtCore",
      "import FreeCAD as _f, FreeCADGui as _g, json as _j, sys as _s",
      "_mw=_g.getMainWindow()",
      // Browser app: Qt-wasm draws a vestigial window title bar (dark, near-unreadable
      // title text) with min/max/close buttons that do nothing in a tab AND overlap our
      // UI. showFullScreen() drops the frame so the app fills the viewport cleanly. Once.
      "if _mw is not None and not getattr(_f,'_fcweb_fs_done',False):",
      " _mw.showFullScreen(); _f._fcweb_fs_done=True",
      // Default ShapeString/annotation font. On desktop the user browses their system fonts;
      // in a tab there is no host filesystem, so an unset FontFile leaves Draft ShapeString
      // (and anything else asking for a font path) dead on arrival. Point it at a font we
      // actually ship. Only set it if empty, so a user's own choice is never overwritten.
      "try:",
      " import os as _os",
      " _fp=_f.ParamGet('User parameter:BaseApp/Preferences/Mod/Draft')",
      " if not _fp.GetString('FontFile',''):",
      "  _fd=_os.path.join(_f.getResourceDir(),'Mod','TechDraw','Resources','fonts','osifont-lgpl3fe.ttf')",
      "  if _os.path.exists(_fd): _fp.SetString('FontFile',_fd)",
      "except Exception: pass",
      // Navigation cube: now renders natively. NaviCube.cpp's client-array draws
      // (glVertexPointer+glDrawArrays) don't work under emscripten LEGACY_GL_EMULATION
      // (the enabled-array count never sticks -> raw no-program path -> nothing drawn),
      // so they were converted to immediate mode (glBegin/glEnd) on wasm, and the 3D
      // viewport composites natively into the Qt canvas — so keep the cube ON (1:1).
      "try:",
      " _vp=_f.ParamGet('User parameter:BaseApp/Preferences/View')",
      " _vp.SetBool('ShowNaviCube',True)",
      "except Exception: pass",
      // BIM workbench: its Activated() shows a first-run 'BIM_Welcome' dialog when
      // FirstTime=True, and modal dialogs need ASYNCIFY (absent) -> emscripten_sleep
      // abort on activation. Mark it seen so BIM activates cleanly.
      // Navigation style: desktop's default (CAD, View3DSettings.cpp) and nothing else.
      // From 2026-08-12 this block forced Gesture on every visitor so a trackpad could
      // rotate, and that broke dragging parts in an active assembly -- under Gesture a
      // left-drag on a part rotates the view (issue #6; desktop does the same under
      // Gesture, which is why desktop does not default to it). Undo that once for
      // everyone it was applied to; a style picked in Preferences after this is kept.
      "try:",
      " _vp=_f.ParamGet('User parameter:BaseApp/Preferences/View')",
      " if not _vp.GetBool('_fcwebNavRestored',False):",
      "  if _vp.GetBool('_fcwebNavDefault',False) and _vp.GetString('NavigationStyle','') == 'Gui::GestureNavigationStyle':",
      "   _vp.SetString('NavigationStyle','Gui::CADNavigationStyle')",
      "  _vp.SetBool('_fcwebNavRestored',True)",
      "except Exception: pass",
      "try:",
      " _f.ParamGet('User parameter:BaseApp/Preferences/Mod/BIM').SetBool('FirstTime',False)",
      "except Exception: pass",
      // DXF import/export: importDXF.readPreferences() calls FreeCADGui.showPreferences()
      // (a modal C++ preferences dialog) when the Draft 'dxfShowDialog' pref is unset —
      // and its draftutils default is True. A C++ QDialog::exec() launched from the Python
      // call stack traps (asyncify can't unwind across the CPython interpreter frame), which
      // crashed every DXF read/write. Pin it False so DXF just uses the current settings.
      "try:",
      " _f.ParamGet('User parameter:BaseApp/Preferences/Mod/Draft').SetBool('dxfShowDialog',False)",
      "except Exception: pass",
      // Same trap for IFC (BIM/architecture interop): importers/exportIFC + nativeifc
      // readPreferences pop FreeCADGui.showPreferences() when Arch 'ifcShowDialog' is
      // unset (default True). Pin False so IFC import/export don't crash.
      "try:",
      " _f.ParamGet('User parameter:BaseApp/Preferences/Mod/Arch').SetBool('ifcShowDialog',False)",
      "except Exception: pass",
      "_md=_mw.findChild(QtWidgets.QMdiArea) if _mw else None",
      "_sub=_md.activeSubWindow() if _md else None",
      "_w=_sub.widget() if _sub else None",
      "if _w is not None:",
      " _p=_w.mapTo(_mw, QtCore.QPoint(0,0))",
      " _r=[_p.x(),_p.y(),_w.width(),_w.height()]",
      " if getattr(_f,'_fcrect_last',None)!=_r:",
      "  _f._fcrect_last=_r",
      "  _s.__stderr__.write('FCRECT '+_j.dumps(_r)+'\\n'); _s.__stderr__.flush()",
      // wasm: entering Sketcher edit sets the sketch ViewProvider Visibility=False,
      // and the edit geometry (EditRoot) sits under that visibility switch — which,
      // under the emscripten GL emulation, culls the whole subtree so you sketch
      // 'blind'. Force the in-edit ViewProvider visible so its edit scene renders.
      // Flipping Visibility alone doesn't repaint the viewport, so the sketch would only
      // appear on the user's next camera move; nudge a redraw once so it shows immediately.
      "try:",
      " _ad=_g.activeDocument()",
      " _ie=_ad.getInEdit() if _ad else None",
      " if _ie is not None and not bool(_ie.Visibility):",
      "  _ie.Visibility=True",
      // This branch runs exactly once per edit session (the guard flips Visibility to True).
      // Just flipping Visibility repaints nothing, and a plain redraw() populates the FBO but
      // doesn't reposition/show the overlay — only a ViewFit fully re-renders AND republishes
      // the widget rect so the compositor shows it. A one-time fit also frames the sketch,
      // which is the right thing on entering edit.
      "  try: _g.SendMsgToActiveView('ViewFit')",
      "  except Exception: pass",
      "except Exception: pass",
      ""
    ].join("\n");
    function publishRect(){
      try{ var m=window.fcInstance; if(!window.__fcAppReady||!m||!m._fcweb_run_python) return;
        if(window.__fcPyBusy) return;   // skip tick while a call is suspended (no reentrancy)
        var n=new TextEncoder().encode(RECT_PY).length+1; var q=m._malloc(n);
        m.stringToUTF8(RECT_PY,q,n); fcRunPy(m,q);
      }catch(e){}
    }
    setTimeout(publishRect, 4000); setInterval(publishRect, 1500);
    window.addEventListener('resize', ()=>setTimeout(publishRect,120));

    })();               // end compositor

    // --- Crash resilience: periodic auto-save of open documents to the persisted
    // home (IDBFS), plus restore-on-boot. FreeCAD's native recovery writes to /tmp
    // (ephemeral MEMFS in wasm), so it can't survive a reload; this keeps a live
    // .FCStd copy of every open doc under the IDBFS-backed home so the rare
    // event-loop trap (or any reload) never loses work — web-app "always restore"
    // model. saveCopy() persists without touching the doc's own path/dirty state.
    function runPy(src){
      try{ var m=window.fcInstance; if(!window.__fcAppReady||!m||!m._fcweb_run_python) return;
        if(window.__fcPyBusy) return;   // skip tick while a call is suspended (no reentrancy)
        var n=new TextEncoder().encode(src).length+1; var q=m._malloc(n);
        m.stringToUTF8(src,q,n); fcRunPy(m,q);
      }catch(e){}
    }
    window.__fcRunPyGuarded = runPy;   // shared sessions reuse this rather than re-deriving the malloc dance
    // Autosave is driven by EDITS, not by a clock, and lives in its own directory.
    //
    // Three defects were measured here, each of which lost a user's work outright:
    //   1. a 30 s timer meant "draw something, hit reload" lost everything -- the most
    //      likely first five minutes anyone spends with this app. A document observer now
    //      marks the session dirty and the tick saves only when there is something to save.
    //   2. the copies lived in /home/web_user/.FreeCAD/recovery, which is FreeCAD's own
    //      recovery folder. Its own directory now.
    //   3. the prune that drops copies of closed documents ran BEFORE the restore pass, so
    //      on every boot it deleted the autosaves while no document was open yet -- the
    //      file read back from IndexedDB at +3 s and was gone by +8 s. It is now gated on
    //      the restore having completed. (With the original 30 s tick the prune happened
    //      to land after the 13 s restore, which is the only reason this ever worked.)
    var AUTOSAVE_DIR = "/home/web_user/.fcweb-autosave";
    // Deliberately in /tmp, not under the IDBFS mount: it must be absent on every fresh
    // boot so a stale marker can never convince us autosave is running when it is not.
    var AUTOSAVE_MARKER = "/tmp/.fcweb_saver_installed";
    var AUTOSAVE_INSTALL = [
      "import FreeCAD as _App, os as _os, time as _time",
      // NO THUMBNAILS. Every save renders the document into an offscreen FBO for the
      // .FCStd preview image (Thumbnail::SaveDocFile -> renderToFramebuffer), and under
      // the GL emulation that render corrupts the LIVE viewport's material state: with a
      // second document open, an unselected mesh then draws with the thumbnail pass's
      // black 50%-alpha material (screen luminance 65 vs 236, stack-traced to
      // SoBoxSelectionRenderAction inside Thumbnail::SaveDocFile, and the darkness
      // vanishes the moment SaveThumbnail is false -- all measured 2026-08-31). The
      // thumbnails only feed desktop file-manager previews, which the web app has no
      // use for; autosave also gets cheaper. If previews are ever wanted, fix the
      // offscreen render's state isolation first.
      "_App.ParamGet('User parameter:BaseApp/Preferences/Document').SetBool('SaveThumbnail', False)",
      // VBOs on by default, matching FCWEB_VBO in pre-gui.js -- both gates must agree or
      // Coin nulls glBindBuffer and the pref silently does nothing. ?vbo=0 flips both off.
      "_App.ParamGet('User parameter:BaseApp/Preferences/View').SetBool('UseVBO', " +
        (new URLSearchParams('').get('vbo') === '0' ? 'False' : 'True') + ")",
      // RenderCache 1 = Distributed: every view provider's separator keeps its own render
      // cache (a GL display list, real since 2026-09-14 -- see gl_legacy_stubs.c and the
      // __fcDL recorder in the glue). FreeCAD's own default, 0/Auto, resolves to the same
      // because View3DInventorViewer disables Coin auto-caching. 2/Centralized was chosen
      // while lists were stubs (it stopped Coin from re-walking into empty caches); with
      // lists working it is the one mode that caches NOTHING. ?rendercache=N overrides.
      "_App.ParamGet('User parameter:BaseApp/Preferences/View').SetInt('RenderCache', " +
        (new URLSearchParams('').get('rendercache') || '1') + ")",
      "if not getattr(_App, '_fcweb_saver', None):",
      "    class _FcwebSaver(object):",
      "        DIR = '" + AUTOSAVE_DIR + "'",
      "        def __init__(self):",
      "            self.dirty = True",
      "            self.last = 0.0",
      "        def _touch(self, *a):",
      "            self.dirty = True",
      "            self.last = _time.time()",
      // Big meshes highlight as a bounding box, not as the mesh. Selecting a mesh makes
      // the unified selection re-render it through its OWN SoGLRenderAction, whose fresh
      // state never had the viewer's VBO flag set -- so the mesh node falls back to
      // Coin's immediate-mode render, 1.33M vertices through the JS emulation per frame.
      // Measured 2026-09-02 (443k triangles, RTX 4080): selected 685 ms/frame, deselected
      // 7.8 ms/frame. Every import leaves the new object selected. A box highlight keeps
      // the selection pass off the mesh entirely; freecad.patch closes the C++ side too.
      "        BIG_MESH = 50000",
      "        def _meshStyle(self, o):",
      "            try:",
      "                m = getattr(o, 'Mesh', None)",
      "                if m is not None and m.CountFacets > self.BIG_MESH and o.ViewObject.SelectionStyle != 'BoundBox':",
      "                    o.ViewObject.SelectionStyle = 'BoundBox'",
      "            except Exception:",
      "                pass",
      "        def slotChangedObject(self, o, prop=None):",
      "            self._touch()",
      "            if prop in (None, 'Mesh'): self._meshStyle(o)",
      "        slotCreatedObject = _touch",
      "        slotDeletedObject = _touch",
      "        slotCreatedDocument = _touch",
      "        slotDeletedDocument = _touch",
      "        slotChangedDocument = _touch",
      "        slotRedoDocument = _touch",
      "        slotUndoDocument = _touch",
      "        def save(self, force=False):",
      "            if not (force or self.dirty):",
      "                return",
      // Settle first: a burst of edits (or an import) would otherwise be saved on the
      // very next 1.5 s tick, and for a 443k-triangle mesh document that tick blocked
      // the UI for 1.7-2.6 s right as the user started looking at the model (measured
      // 2026-09-02, PerformanceObserver longtask). Wait until nothing has changed for
      // 2 s; a forced save (tab hide, memory pressure, backstop) never waits.
      "            if not force and _time.time() - self.last < 2.0:",
      "                return",
      "            _os.makedirs(self.DIR, exist_ok=True)",
      "            names = set()",
      // Autosave copies are throwaway recovery files: write them uncompressed. Same
      // document, measured: zip level 3 = 0.53 s / 7.1 MB, level 0 = 0.15 s / 13 MB.
      // The browser's storage takes 6 MB more per document; the UI stalls 3.5x less.
      "            _failed = 0",
      "            _g = _App.ParamGet('User parameter:BaseApp/Preferences/Document')",
      "            _lvl = _g.GetInt('CompressionLevel', 3)",
      "            _g.SetInt('CompressionLevel', 0)",
      "            try:",
      "                for d in list(_App.listDocuments().values()):",
      "                    fn = getattr(d, 'FileName', '') or ''",
      "                    if fn.startswith('/freecad/'):",
      "                        continue",          // bundled examples are read-only, not work
      "                    names.add(d.Name)",
      "                    try:",
      "                        d.saveCopy(_os.path.join(self.DIR, d.Name + '.FCStd'))",
      "                    except Exception:",
      "                        _failed += 1",
      "            finally:",
      "                _g.SetInt('CompressionLevel', _lvl)",
      "            if _failed:",
      // A save that fails silently is the worst outcome this class can produce: the
      // user believes their work is being kept and it is not. Leave `dirty` set so the
      // next tick retries, and drop a sentinel the page polls (it already reads the FS
      // every 5s for memory pressure) so the failure reaches a human instead of the
      // console. Removed as soon as a save succeeds again.
      "                try:",
      "                    open(self.DIR + '/.failed', 'w').write(str(_failed))",
      "                except Exception:",
      "                    pass",
      "                return",
      "            try:",
      "                _os.remove(self.DIR + '/.failed')",
      "            except Exception:",
      "                pass",
      "            self.dirty = False",
      "    _App._fcweb_saver = _FcwebSaver()",
      "    _App.addDocumentObserver(_App._fcweb_saver)",
      // Proof of life the JS side can actually see. runPy swallows every error, so without
      // a marker "we called it" and "it worked" are indistinguishable -- which is exactly
      // how this silently stopped autosaving anything.
      "try:",
      "    open('" + AUTOSAVE_MARKER + "','w').write('1' if getattr(_App,'_fcweb_saver',None) else '0')",
      "except Exception:",
      "    pass",
      ""
    ].join("\n");
    var RESTORE_PY = [
      "import FreeCAD as _App, os as _os, sys as _s",
      "import FreeCAD as App, FreeCADGui as Gui",   // what FreeCADGuiInit.py binds; harmless twice, fatal to be early without
      "_rec = '" + AUTOSAVE_DIR + "'",
      "_n = 0",
      "import time as _t",
      "if _os.path.isdir(_rec):",
      "    _all = [_f for _f in _os.listdir(_rec) if _f.endswith('.FCStd')]",
      "    _paths = [_os.path.join(_rec, _f) for _f in _all]",
      // Reopening EVERY document from every past session took over a minute on a
      // returning profile with 16 of them and looked exactly like a hang. Newest few only.
      "    _paths.sort(key=lambda _p: -_os.path.getmtime(_p))",
      "    _skipped = max(0, len(_paths) - 3)",
      "    for _p in _paths[:3]:",
      "        try:",
      "            _App.openDocument(_p); _n += 1",
      "        except Exception:",
      "            pass",
      "    if _skipped:",
      "        _s.__stderr__.write('[fcweb] %d older recovery file(s) left unopened in %s\\n' % (_skipped, _rec))",
      "_App._fcweb_restored = True",          // gates the prune; set even when nothing was found
      "open('/tmp/.confenge_restore_complete', 'w').write('1')",
      "if _n: _s.__stderr__.write('[fcweb] restored %d document(s) from your last session\\n' % _n); _s.__stderr__.flush()",
      ""
    ].join("\n");
    // ---- memory pressure ------------------------------------------------------
    // The heap grows to a 4 GB ceiling, and a big enough model still aborts the instance.
    // Until now the only signal was the abort itself -- the user got a message after
    // losing the session.
    // _emscripten_get_sbrk_ptr is exported (see the link command), so the used portion is
    // a plain memory read: no Python, no round trip, and it still works while the
    // interpreter is busy -- which is exactly when memory is being consumed.
    //
    // Measured on this build: 288 MB after boot, ~72 KB per simple solid (1600 boxes take
    // it to 403 MB), so the ~1.76 GB of headroom is roughly 20k such solids. The point of
    // warning at 80% is that the user's work is FORCE-SAVED while saving still works.
    // Thresholds are overridable so the behaviour can be exercised without building a
    // 1.6 GB model. (Faking it by swapping HEAPU8.buffer breaks the runtime -- the buffer
    // is used all over emscripten's glue -- and produces a cascade of aborts that looks
    // like the feature failing.)
    var __memState = 0;
    function memWarnAt(){ return +window.__fcwebMemWarn || 0.80; }
    function memCritAt(){ return +window.__fcwebMemCrit || 0.92; }
    // The heap GROWS now (linked with ALLOW_MEMORY_GROWTH, initial 1 GB, maximum 4 GB --
    // the live FreeCAD.js reads `new WebAssembly.Memory({initial:1GB, maximum:65536 pages})`).
    // The ceiling is NOT the buffer's byteLength: that is the CURRENT size, 1 GB at boot.
    // Dividing by it made this warn "nearly full, cannot grow past 2 GB" at ~800 MB used
    // and force-save before the heap had grown once (reported 2026-09-02 as "the app is
    // limited to 2 GB"). Nor is it the buffer's maxByteLength: on a wasm shared memory
    // that just mirrors byteLength (measured: 1073741824 both), because wasm growth swaps
    // the buffer object rather than growing it JS-side. The Memory object that knows the
    // maximum is closure-private to the emscripten glue (Module.wasmMemory is not set in
    // this build), so the ceiling is a build constant, kept in step with -sMAXIMUM_MEMORY
    // in the link command. max() with byteLength so a build with a larger heap than this
    // constant can never report a fraction above 1.
    var FCWEB_HEAP_MAX_BYTES = 17179869184;  // -sMAXIMUM_MEMORY=17179869184 (16 GiB, wasm64)
    function heapCapBytes(m){
      // HEAPU8 is on the Module only because the link exports it (EXPORTED_RUNTIME_METHODS);
      // emscripten 6 stopped exporting the views by default, and without the guard this
      // threw, every caller caught it, and the memory warning went silent.
      return Math.max(FCWEB_HEAP_MAX_BYTES, (m.HEAPU8 && m.HEAPU8.buffer.byteLength) || 0);
    }
    function heapCapMB(){
      try { return Math.round(heapCapBytes(window.fcInstance) / 1048576); } catch (e) { return 0; }
    }
    function heapUsedFraction(){
      try {
        var m = window.fcInstance;
        if (!m || typeof m._emscripten_get_sbrk_ptr !== 'function') return -1;
        // >>> not >>: the shift is UNSIGNED. With a heap above 2 GB the sbrk pointer
        // exceeds INT32_MAX, a signed >>2 yields a negative index, HEAPU32[negative] is
        // undefined, and used/cap is NaN -- so the memory warning goes silent at exactly
        // the moment it is needed. The shipped link is INITIAL_MEMORY=1GB growing to 4GB,
        // so this is reachable today, not a wasm64 hypothetical.
        // wasm64: the export is signature-converted, so the ADDRESS arrives as a Number,
        // but the break stored there is a 64-bit pointer. HEAPU32 would read its low half --
        // right below 4 GB, wrapping above it, which is the whole point of wasm64 -- so read
        // it as an i64 (HEAP64 is exported for exactly this).
        var p = m._emscripten_get_sbrk_ptr();
        if (!m.HEAP64) return -1;
        var used = Number(m.HEAP64[p / 8]);
        var cap = heapCapBytes(m);
        return cap > 0 ? used / cap : -1;
      } catch (e) { return -1; }
    }
    // Autosave failures must reach a human. The saver drops a sentinel when saveCopy
    // threw for every open document (storage full, quota revoked, a corrupt document);
    // before this, that failed silently while `dirty` was cleared, so the user believed
    // their work was being kept and it was not. Checked here because this poll already
    // runs every 5 s and already touches the FS -- no extra timer, no Python round trip.
    var __saveFailWarned = false;
    function checkAutosaveHealth(){
      try {
        var m = window.fcInstance;
        if (!m || !m.FS) return;
        var bad = m.FS.analyzePath(AUTOSAVE_DIR + '/.failed').exists;
        if (bad && !__saveFailWarned) {
          __saveFailWarned = true;
          if (typeof window.fcwebNotify === 'function') {
            window.fcwebNotify('Autosave is FAILING, so your work is not being saved in '
              + 'the background. Use File → Save to keep a copy now. This usually '
              + 'means browser storage is full.', 'error');
          }
        } else if (!bad && __saveFailWarned) {
          __saveFailWarned = false;      // recovered; allow a fresh warning later
        }
      } catch (e) {}
    }
    function checkMemoryPressure(){
      checkAutosaveHealth();
      var f = heapUsedFraction();
      if (f < 0) return;
      var capMB = heapCapMB();
      var mb = Math.round(f * capMB);
      var capGB = (capMB / 1024).toFixed(capMB % 1024 ? 1 : 0);
      if (f >= memCritAt() && __memState < 2) {
        __memState = 2;
        try { py(AUTOSAVE_FORCE); } catch (e) {}
        if (typeof window.fcwebNotify === 'function') {
          window.fcwebNotify('Memory is nearly full (' + mb + ' MB of ' + capMB + ' MB). Your work has '
            + 'been saved. Save a copy with File \u2192 Save and close documents you are not '
            + 'using -- the browser build cannot grow past ' + capGB + ' GB.', 'warn');
        }
      } else if (f >= memWarnAt() && __memState < 1) {
        __memState = 1;
        try { py(AUTOSAVE_FORCE); } catch (e) {}
        if (typeof window.fcwebNotify === 'function') {
          window.fcwebNotify('This model is using ' + mb + ' MB of the ' + capGB + ' GB the browser build '
            + 'has. Your work has been saved. Consider simplifying it or closing documents you '
            + 'are not using.', 'warn');
        }
      } else if (f < memWarnAt() - 0.05) {
        __memState = 0;              // recovered (documents closed); allow warning again
      }
    }
    setInterval(checkMemoryPressure, 5000);
    window.fcwebHeapUsedMB = function(){
      var f = heapUsedFraction(); return f < 0 ? -1 : Math.round(f * heapCapMB());
    };
    window.fcwebHeapCapMB = heapCapMB;

    var AUTOSAVE_PY = "import FreeCAD as _App\n" +
      "try: _App._fcweb_saver.save()\n" +
      "except Exception: pass\n" +
      "";
    // ...and FreeCAD's user parameters. Desktop writes user.cfg when it exits; a tab never
    // exits, so a setting changed in a dialog that does not save on its own (Customize >
    // Spaceball Motion, GitHub #2) was lost on reload.
    var AUTOSAVE_FORCE = "import FreeCAD as _App\n" +
      "try: _App._fcweb_saver.save(True)\n" +
      "except Exception: pass\n" +
      "try: _App.saveParameter()\n" +
      "except Exception: pass\n";
    // Sequence on READINESS, not on fixed timers. runPy is a no-op until the interpreter
    // exists, and on a cold first load (empty HTTP cache) it does not by 11 s -- the
    // observer was never installed, so nothing was ever saved, and the work of a user's
    // very first session was the one thing guaranteed to be lost.
    (function(){
      var installed = false, restored = false;
      function ready(){
        var m = window.fcInstance;
        return !!(window.__fcAppReady && m && m._fcweb_run_python && m.FS && !window.__fcPyBusy);
      }
      // Did the install actually take? runPy reports nothing -- it swallows every error and
      // is a silent no-op whenever the interpreter is not yet able to take the call. The
      // old loop set installed=true right after calling it, cleared itself on the next
      // tick, and left the session with NO observer, NO restore, and a 1.5 s tick poking a
      // _fcweb_saver that did not exist. Every failure on that path is silent, so it
      // presented as "autosave works" while nothing was ever written.
      //
      // Measured on production: saver=False, restored=None, autosave dir empty after a
      // clean boot. It surfaced only once the engine cache cut boot from ~170 s to ~20 s --
      // the race was always there, the speedup just started winning it.
      function installed_ok(){
        try { var m = window.fcInstance;
              return !!(m && m.FS && m.FS.analyzePath(AUTOSAVE_MARKER).exists); }
        catch(e){ return false; }
      }
      var tries = 0;
      var poll = setInterval(function(){
        if (!ready()) return;
        if (!installed) {
          runPy(AUTOSAVE_INSTALL);
          if (!installed_ok()) {                 // retry rather than assume
            if (++tries % 10 === 0) { append('[autosave] install has not taken after ' + tries + ' attempts', 'err'); }
            if (tries > 60) {                    // ~1 min: stop trying, but SAY so
              clearInterval(poll);
              try { window.fcwebNotify && window.fcwebNotify(
                'Autosave could not start, so your work is NOT being saved automatically. ' +
                'Use File → Save to keep a copy.', 'error'); } catch(e){}
            }
            return;
          }
          installed = true; append('[autosave] observer installed'); return;
        }
        // Not before the workbench is up. Ready is Qt's, not FreeCAD's: opening a document
        // makes Gui::Document run `Gui.SendMsgToActiveView(...)` through the interpreter,
        // and in one boot in four the restore won the race against FreeCADGuiInit.py, which
        // is what binds `Gui` in __main__ -- a NameError traceback in the Report view on a
        // clean start (measured 2026-09-14, 2 of 8 boots).
        if (!restored && !window.__fcWorkReady) return;
        if (!restored) { runPy(RESTORE_PY); restored = true; return; }
        clearInterval(poll);
        setInterval(function(){ runPy(AUTOSAVE_PY); }, 1500);
        // Mirror the autosave copies out to a real folder on the user's disk, if they have
        // nominated one. Slower cadence than the in-browser autosave on purpose: this
        // writes through the File System Access API and is for durability, not for
        // catching the last 1.5 s of edits.
        setInterval(function(){ try { window.__fcMirrorOut && window.__fcMirrorOut(); } catch(e){} }, 20000);
        setInterval(function(){ runPy(AUTOSAVE_FORCE); }, 120000);  // backstop for a missed notify
      }, 1000);
    })();
    // Closing or hiding the tab: force a save. pagehide is the one that fires on reload.
    document.addEventListener('visibilitychange', function(){ if(document.hidden) runPy(AUTOSAVE_FORCE); });
    window.addEventListener('pagehide', function(){ runPy(AUTOSAVE_FORCE); });
    // Overlay state. These belong WITH the three functions below.
    //
    // They used to be declared inside the compositor IIFE further up, which closes at
    // "})();  // end compositor" -- roughly 240 lines before ensureOverlay/blit/frameBlit
    // are defined. So all three referenced variables that were not in scope, and every
    // frame the legacy overlay actually ran threw, straight into its own try/catch:
    //
    //     [overlay] ReferenceError: buf is not defined
    //         at blit ((index):2002)
    //         at frameBlit ((index):2063)
    //
    // Observed in production on 2026-08-27. The catch swallowed it, so the overlay simply
    // painted nothing and the failure was invisible except in the console.
    //
    // This path is inert whenever the C++ native composite is running
    // (window.__fcNativeComposite), so it only bites before the first renderScene or when
    // ?overlay=1 forces the legacy path -- which is exactly when it is being relied on.
    var ov, ovctx, buf, imgData, lastW = 0, lastH = 0;
    function ensureOverlay(){
      if (ov) return;
      var screen = document.getElementById('screen');
      ov = document.createElement('canvas');
      ov.id = 'fcweb-3d-overlay';
      ov.style.cssText = 'position:absolute;pointer-events:none;z-index:5;';
      screen.appendChild(ov);
      ovctx = ov.getContext('2d');
    }
    // Read Coin's render from the CURRENTLY BOUND framebuffer (its own QOpenGLWidget
    // FBO when ?nofbo0 is set — a buffer Qt's UI never overdraws) and paint it to
    // the overlay, synchronously at draw time so the FBO content is guaranteed live.
    function blit(gl, x, y, w, h){
      if (w<=0||h<=0) return;
      try {
        if (!buf || lastW!==w || lastH!==h){ buf=new Uint8Array(w*h*4); imgData=new ImageData(w,h); lastW=w; lastH=h; ensureOverlay(); }
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);  // reads current READ_FRAMEBUFFER
        var d=imgData.data, opaque=0;
        // Key out Coin's ACTUAL background color rather than a hardcoded gray: Coin
        // clears the FBO to black or the theme gray depending on state, so a fixed
        // key leaves a black rectangle over the viewport. Sample the FBO border
        // (where the centered model rarely reaches) and take the per-channel median
        // of 8 points so one clipped sample can't skew the key.
        function _px(ix,iy){ var o=(iy*w+ix)*4; return [buf[o],buf[o+1],buf[o+2]]; }
        var _sp=[_px(1,1),_px(w-2,1),_px(1,h-2),_px(w-2,h-2),_px(w>>1,1),_px(w>>1,h-2),_px(1,h>>1),_px(w-2,h>>1)];
        function _med(ch){ var a=_sp.map(function(s){return s[ch];}).sort(function(x,y){return x-y;}); return (a[3]+a[4])>>1; }
        var keyR=_med(0), keyG=_med(1), keyB=_med(2), TOL=24;
        // The overlay sits EXACTLY over the 3D widget (FBO size == widget rect), and the FBO
        // already holds the complete rendered view (its own background + the model/geometry).
        // So paint it OPAQUE — show the FBO's own background rather than keying it out. Keying
        // the background transparent exposed the dark Qt canvas behind the overlay, and thin
        // dark geometry (notably Sketcher edit-mode lines) then vanished on that dark canvas.
        // We still COUNT non-background pixels (via the border-median key) purely to skip
        // background-only passes below, but every pixel is drawn opaque so the viewport shows
        // the true render for BOTH normal 3D and sketch-edit.
        for (var row=0; row<h; row++){
          var src=(h-1-row)*w*4, dst=row*w*4;   // flip GL bottom-up -> top-down
          for (var col=0; col<w*4; col+=4){ var rr=buf[src+col],gg=buf[src+col+1],bb=buf[src+col+2];
            d[dst+col]=rr; d[dst+col+1]=gg; d[dst+col+2]=bb;
            var isBg=(Math.abs(rr-keyR)<=TOL && Math.abs(gg-keyG)<=TOL && Math.abs(bb-keyB)<=TOL);
            d[dst+col+3]= 255; if(!isBg)opaque++; }
        }
        window.__ovOpaque = opaque;  // non-background pixel count (diagnostic)
        // Only PAINT a pass that has substantial geometry, so a background-only pass
        // doesn't wipe the frame that had the model. `opaque` is the full-res count.
        var nonbg=opaque;
        window.__ovBlits=(window.__ovBlits||0)+1; window.__ovMaxNonBg=Math.max(window.__ovMaxNonBg||0,nonbg); window.__ovLastFbo=(w+'x'+h);
        (window.__ovLog=window.__ovLog||[]).length<60 && window.__ovLog.push(w+'x'+h+':'+nonbg);
        if (nonbg < 500) return;  // background-only read — don't overwrite the model frame
        ov.width=w; ov.height=h;                 // backing store = FBO device px
        ovctx.putImageData(imgData, 0, 0);
        // Position the overlay exactly over the 3D widget's on-screen rect (CSS px,
        // published from Qt via FCRECT). Preserve the FBO aspect (contain-fit,
        // centered) so the model is never stretched. Fall back to the whole screen
        // rect until the first FCRECT arrives.
        var R = window.__fcWidgetRect;               // [x,y,w,h] CSS, in-window
        var rx, ry, rw, rh;
        if (R && R.length===4 && R[2]>10 && R[3]>10){ rx=R[0]; ry=R[1]; rw=R[2]; rh=R[3]; }
        else { var sc=document.getElementById('screen').getBoundingClientRect(); rx=0; ry=0; rw=sc.width; rh=sc.height; }
        var af = w/h, ar = rw/rh, dispW, dispH;
        if (af > ar){ dispW = rw; dispH = rw/af; } else { dispH = rh; dispW = rh*af; }
        ov.style.left  = Math.round(rx + (rw-dispW)/2) + 'px';
        ov.style.top   = Math.round(ry + (rh-dispH)/2) + 'px';
        ov.style.width = Math.round(dispW)+'px';
        ov.style.height= Math.round(dispH)+'px';
      } catch(e){ if(window.__ovErr!==String(e)){ window.__ovErr=String(e); console.log('[overlay]',e); } }
    }
    var capGl=null, capFbo=null, capVP=null, rafPending=false;
    // Read Coin's FBO right after its frame's draws (rAF), while the buffer is
    // still fresh (a persistent poll would read stale/recycled FBOs). This
    // re-fires on every Coin redraw, so camera moves / orbit update the overlay.
    function frameBlit(){
      rafPending=false;
      // THE NATIVE COMPOSITE OWNS PRESENTATION.
      //
      // The scheduling site checks this too, but only when the draw happens. A frame
      // queued BEFORE the C++ set window.__fcNativeComposite still fires afterwards,
      // and by then it is reading a framebuffer that belongs to the other path.
      // Re-check here, and drop the capture so nothing stale is retried.
      if (window.__fcNativeComposite && !USE_OVERLAY) { capGl=null; capFbo=null; capVP=null; return; }
      if (!capGl || !capVP) return;
      var gl=capGl;
      // Qt destroys and recreates its widget FBO (resize, reparent, MDI show), so an
      // id captured during a draw can be DEAD by the time this rAF fires. Observed in
      // production on 2026-08-27:
      //     WebGL: INVALID_OPERATION: bindFramebuffer: attempt to use a deleted object
      //         at frameBlit ((index):2080)
      // isFramebuffer() returns false for a deleted object, which is exactly the
      // question being asked -- and asking it is cheaper than the error it prevents.
      if (capFbo && !(gl.isFramebuffer && gl.isFramebuffer(capFbo))) { capFbo=null; return; }
      var prev=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, capFbo);
      blit(gl, capVP[0], capVP[1], capVP[2], capVP[3]);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prev);
    }
    var USE_OVERLAY = /[?&]overlay=1/.test('');  // legacy readback path, opt-in only

    // GL state shadow. The per-draw hook below needs the viewport and the bound
    // framebuffer on EVERY draw call, and getParameter is a synchronous round-trip to the
    // GPU process: measured at 2 per draw, 2513 of each per orbit and 25% of the wall
    // clock while dragging EngineBlock (4170 draws/frame on BIMExample). Nothing outside
    // this page changes these, so track them from the setters and never ask the GPU.
    var __shVp = new WeakMap(), __shFbo = new WeakMap(), __shDepth = new WeakMap();
    (function(){
      var P = WebGL2RenderingContext.prototype;
      var vp = P.viewport;
      P.viewport = function(x,y,w,h){ __shVp.set(this,[x,y,w,h]); return vp.apply(this,arguments); };
      var bf = P.bindFramebuffer;
      P.bindFramebuffer = function(t,f){
        // FRAMEBUFFER_BINDING reports the DRAW binding; a READ_FRAMEBUFFER bind (frameBlit)
        // must not disturb it.
        if (t===this.FRAMEBUFFER || t===this.DRAW_FRAMEBUFFER) __shFbo.set(this,f||null);
        return bf.apply(this,arguments);
      };
      var en = P.enable, di = P.disable;
      P.enable  = function(c){ if(c===this.DEPTH_TEST) __shDepth.set(this,true);  return en.apply(this,arguments); };
      P.disable = function(c){ if(c===this.DEPTH_TEST) __shDepth.set(this,false); return di.apply(this,arguments); };
    })();
    // Seed from the real state the first time only: a draw can happen before the app has
    // called viewport()/bindFramebuffer() at all.
    function shVp(gl){ var v=__shVp.get(gl); if(!v){ v=gl.getParameter(gl.VIEWPORT); __shVp.set(gl,v); } return v; }
    function shFbo(gl){ if(!__shFbo.has(gl)) __shFbo.set(gl, gl.getParameter(gl.FRAMEBUFFER_BINDING)); return __shFbo.get(gl); }
    function shDepth(gl){ if(!__shDepth.has(gl)) __shDepth.set(gl, gl.isEnabled(gl.DEPTH_TEST)); return __shDepth.get(gl); }
    ['drawArrays','drawElements'].forEach(function(nm){
      var orig = WebGL2RenderingContext.prototype[nm];
      WebGL2RenderingContext.prototype[nm] = function(){
        var r = orig.apply(this, arguments);
        var vp = shVp(this);
        var fbo = shFbo(this);
        // Depth fix: Qt re-binds its widget FBO mid-render, so the C++ depth clear
        // lands on the wrong buffer → frame 2+ geometry fails the depth test and
        // vanishes (renders once, then blank). The Coin background quad (count=4,
        // depth-test OFF, big viewport) is always the FIRST draw of a frame on the
        // real target — clear depth right after it, on whatever FBO is truly bound.
        // ONLY on the FIRST such draw of each animation frame per FBO. The original
        // form cleared depth after EVERY 4-vertex depth-off big-viewport draw, and
        // Coin's transparency pass and overlay quads match that signature MID-SCENE:
        // a mid-frame depth wipe makes everything drawn before it lose the depth
        // test, so objects vanished or read as transparent depending on draw order
        // -- which shifts with the camera, hence "disappear and come back when we
        // rotate" (reported 2026-08-30). The background quad this was written for
        // is the frame's first draw, so first-of-frame keeps the fix and drops the
        // damage.
        if (nm==='drawArrays' && arguments[2]===4 && fbo && vp && vp[2]>=300 && !shDepth(this)) {
          if (!window.__fcDepthFrameTick) { window.__fcDepthFrameTick = 1;
            (function tick(){ window.__fcDepthFrame = (window.__fcDepthFrame||0)+1; requestAnimationFrame(tick); })(); }
          if (fbo.__fcDepthClearedAt !== window.__fcDepthFrame) {
            fbo.__fcDepthClearedAt = window.__fcDepthFrame;
            this.clearDepth(1); this.clear(this.DEPTH_BUFFER_BIT);
          }
        }
        // Coin renders into a DEDICATED offscreen FBO (window.__fcCoinFbo, set by
        // View3DInventorViewer::renderScene); Qt's UI draws go to the default
        // framebuffer (fbo === null). So blit ONLY when a real FBO is bound — that
        // isolates the clean 3D scene and drops the UI entirely (no ghosting).
        // NATIVE COMPOSITE: the C++ now blits Coin's private FBO straight into the
        // QOpenGLWidget's own backing FBO, and Qt's wasm compositor presents it to
        // the page canvas exactly like desktop — no readback, no overlay, no CSS.
        // Leave the legacy overlay path here only as an opt-in fallback (?overlay=1);
        // it is inert once C++ sets __fcNativeComposite (from the first frame).
        if (window.__fcNativeComposite && !USE_OVERLAY) return r;
        if (fbo && vp && vp[2]>=200 && vp[3]>=150) {
          // COALESCE: do NOT readPixels+blit on every draw — a complex scene emits
          // thousands of draws per frame (immediate-mode BIMExample: 25k+ per second),
          // and each blit() does a full-viewport gl.readPixels (a GPU->CPU sync, the most
          // expensive GL op) plus a full-image CPU pixel scan. That was O(draws*pixels)
          // and made a 14k-face model take minutes. Instead just remember the FBO+viewport
          // and schedule ONE blit on the next animation frame, which fires after this whole
          // synchronous draw batch completes — the FBO still holds the finished frame.
          // O(frames*pixels), the correct cost.
          capGl=this; capFbo=fbo; capVP=vp;
          if(!rafPending){ rafPending=true; requestAnimationFrame(frameBlit); }
        }
        return r;
      };
    });
    console.log('[fcweb] 3D presentation: native Qt composite (overlay '+(USE_OVERLAY?'forced ON':'inert')+')');

    // ---- redundant GL state elimination ----------------------------------------------
    // emscripten's GL emulation re-selects the SAME program, re-sets the SAME constant
    // colour attribute and the SAME line width before every immediate-mode block. On
    // BIMExample that is ~3500 useProgram and ~3000 vertexAttrib4fv calls per frame that
    // change nothing. Dropping the ones whose value is unchanged removes the call without
    // altering any state the GPU can observe.
    //
    // NOTE: merging the draw calls themselves was tried and REVERTED. 93% of this scene's
    // draws are two-vertex edge segments and they do merge (2.8 per batch), but the
    // emulation still emits bufferSubData + vertexAttribPointer + enable/disable for each
    // segment either way, so batching only the draw adds work: it measured 3x SLOWER.
    // Fixing that has to happen where the per-segment setup is generated -- emscripten's
    // GLImmediate flush, or Coin emitting one GL_LINES batch per shape.
    (function () {
      if (/[?&]noredundant=1/.test('')) return;
      var P = WebGL2RenderingContext.prototype;
      var realUseProgram = P.useProgram, realLineWidth = P.lineWidth;
      var realVA4fv = P.vertexAttrib4fv, realVA4f = P.vertexAttrib4f;
      var skipped = window.__glSkipped = { useProgram: 0, vertexAttrib: 0, lineWidth: 0 };
      function stt(gl) { return gl.__rs || (gl.__rs = { va: {} }); }
      P.useProgram = function (pr) {
        var s = stt(this);
        if (s.prog === pr) { skipped.useProgram++; return; }
        s.prog = pr;
        return realUseProgram.apply(this, arguments);
      };
      P.lineWidth = function (w) {
        var s = stt(this);
        if (s.lw === w) { skipped.lineWidth++; return; }
        s.lw = w;
        return realLineWidth.apply(this, arguments);
      };
      function constAttr(gl, idx, x, y, z, w, orig, args) {
        var c = stt(gl).va, p = c[idx];
        if (p && p[0] === x && p[1] === y && p[2] === z && p[3] === w) { skipped.vertexAttrib++; return; }
        c[idx] = [x, y, z, w];
        return orig.apply(gl, args);
      }
      P.vertexAttrib4fv = function (idx, v) {
        return constAttr(this, idx, v[0], v[1], v[2], v[3], realVA4fv, arguments); };
      P.vertexAttrib4f = function (idx, x, y, z, w) {
        return constAttr(this, idx, x, y, z, w, realVA4f, arguments); };
      // Drain any pending immediate-mode line batch before ANY other GL call: while it
      // accumulates, no GL call happens at all, which is the entire point.
      (function () {
        var busy = false;
        Object.getOwnPropertyNames(P).forEach(function (k) {
          var f; try { f = P[k]; } catch (e) { return; }
          if (typeof f !== 'function') return;
          P[k] = function () {
            var G = globalThis.__GLI;
            if (!busy && G && G.__mrgPend) { busy = true; try { G.__flushMerged(); } finally { busy = false; } }
            return f.apply(this, arguments);
          };
        });
      })();
      console.log('[fcweb] redundant GL state elimination + line merging ON');
    })();



    // ---- present pass: the frame Qt composes but never shows -------------------------
    //
    // On a Qt built with -feature-thread, the widget compositor RECORDS the window
    // compose every frame (qt.qpa.backingstore logs it faithfully) but the recorded
    // command buffer never executes: measured on 2026-08-30, zero draw calls and zero
    // blits ever reach the canvas default framebuffer, so the window is black while
    // every INPUT to the compose exists and is current -- the raster UI is uploaded as
    // a canvas-sized texture each frame, and the QOpenGLWidget's backing FBO holds
    // Coin's frame via the C++ blit in renderScene. Single-threaded Qt executes the
    // same compose fine (14 present draws/frame on framebuffer 0, verified), which is
    // how this shipped unnoticed: the pre-threading builds presented, the threaded
    // ones recorded and stopped.
    //
    // So the page does the last step itself: each animation frame, draw the newest
    // canvas-sized uploaded texture (the raster UI) full-screen, then the widget
    // texture at the rect renderScene publishes as window.__fcWidgetRect. Both
    // textures are found by observation, not by id: ids are private to emscripten's
    // GL wrapper, but every createFramebuffer/texImage2D/blitFramebuffer passes
    // through these prototypes.
    //
    // STAND-DOWN: if anything else draws to framebuffer 0 (a Qt whose present works --
    // a single-threaded build, or a future Qt with the bug fixed), this pass sees the
    // foreign draw and goes dormant, so it cannot double-present or fight a working
    // compositor. ?nojspresent=1 disables it outright.
    // OUTSIDE the compositor IIFE below on purpose: that one returns under ?no3d, and the
    // pump is the event loop's heartbeat, not a rendering feature. It sat inside it until
    // 2026-09-15, so every ?no3d gate ran with Qt's timers starved (see the wake-up note).
    // QT'S PAINT CHAIN IS DRIVEN FROM HERE WHILE INPUT IS LIVE.
    //
    // Qt 6.11 for wasm expects its event loop to sit suspended in processEvents() and to
    // be resumed by every DOM event, timer and animation frame. In this app main() has
    // returned and the loop is callback-driven, so the chain behind QWidget::update() --
    // posted UpdateLater -> dispatcher wake-up timer -> requestAnimationFrame -> paint --
    // only advances when something else happens to pump posted events. Measured
    // 2026-09-11 with a timestamped event log: pointer moves handled every 33 ms, no
    // wake-up, no frame request and no render for 600 ms at a stretch; 2-6 scene frames
    // in a 4 s drag while the CPU sat 44 % idle. Asking Qt to process posted events once
    // per animation frame while a button is down (and for 600 ms after any input) gave
    // 68 frames in the same drag -- paint-bound at ~35 ms per frame. FreeCADGui.updateGui()
    // is QApplication::processEvents(); the Python round trip is ~1 ms when idle.
    // ponytail: a C++ export doing sendPostedEvents() would skip the Python hop; add it
    // when this shows in a profile. Skipped while a py() call is in flight (__fcPyBusy).
    //
    // AND WHENEVER QT'S OWN NATIVE TIMER FIRES. QEventDispatcherWasm::onTimer() is a no-op
    // under asyncify ("the instance will resume and process timers in processEvents()",
    // qeventdispatcher_wasm.cpp) -- true for a loop parked in processEvents(), false for
    // this one. So a QTimer whose expiry coincided with no input and no posted event never
    // fired: measured 2026-09-15 (scratchpad/am-seq-probe.py), Qt's setTimeout count froze
    // and a 1 s QTimer stopped after 5 ticks; the Addon Manager's startup sequence, all
    // timers and signals, stalled at check_missing_dependencies in every full gate run
    // ("the Addon Manager never reported"). Every native timer and wake-up reaches
    // Module.qtSendPendingEvents, so count those calls and pump once per call on the next
    // frame -- one event-loop iteration per timer expiry, which is what the desktop does.
    (function () {
      var down = 0, armedUntil = 0, busy = false, busyAt = 0, wakeSeen = 0;
      var CODE = 'import FreeCADGui' + String.fromCharCode(10) + 'FreeCADGui.updateGui()' + String.fromCharCode(10);
      // Observable from probes: gpu-cycle-fps.py found the pump silent (0 calls) on
      // every document after the first close, 2026-09-12, and nothing said why.
      window.__fcPumpState = function () {
        var m = window.fcInstance, c = m && m.qtSuspendResumeControl;
        return { busy: busy, busyFor: busy ? Math.round(performance.now() - busyAt) : 0, down: down, armed: performance.now() < armedUntil,
                 pyBusy: !!window.__fcPyBusy, resume: !!(c && c.resume), pending: c ? c.pendingEvents.length : -1,
                 exclusive: c ? c.exclusiveEventHandler : null };
      };
      // ?pumpmin=<ms>: never pump more often than this. A/B knob, measured 2026-09-13 on
      // draft_test_objects drags: 0 (every animation frame) 32/62 fps, 30 ms 23/55, 60 ms
      // 17/42 -- fewer pumps, fewer frames, so the default stays 0.
      var PUMP_MIN = 0, lastPump = 0;
      try { PUMP_MIN = Math.max(0, parseInt(new URLSearchParams('').get('pumpmin') || '0', 10) || 0); } catch (e) {}
      function arm() { armedUntil = performance.now() + 600; }
      window.addEventListener('pointerdown', function () { down++; arm(); }, true);
      window.addEventListener('pointerup', function () { down = Math.max(0, down - 1); arm(); }, true);
      window.addEventListener('pointercancel', function () { down = 0; arm(); }, true);
      window.addEventListener('pointermove', function () { if (down) arm(); }, true);
      window.addEventListener('wheel', arm, true);
      window.addEventListener('keydown', arm, true);
      // QT'S ZERO-DELAY TIMERS GO THROUGH A MESSAGE CHANNEL, NOT setTimeout(0).
      //
      // Every processEvents(AllEvents) ends in sendNativeEvents' suspend loop: a QWasmTimer
      // set to 0 ms and a park until it fires (qeventdispatcher_wasm.cpp). QWasmTimer is
      // window.setTimeout, and Chrome clamps a setTimeout(0) scheduled from inside a timer
      // callback to 4 ms once the nesting passes five -- which is the steady state of an
      // event loop driven by timers. Measured 2026-09-16 on the BIMExample render benchmark
      // (scratchpad/drag-ms.py, 60 camera rotations + updateGui): 16.6 ms per frame with the
      // main thread 61% idle -- the idle was this clamp. A MessageChannel task has no clamp.
      // Only Qt's own handlers (Module.qtSuspendResumeControl.eventHandlers) at 0 ms are
      // rerouted; every other setTimeout on the page is untouched. Ids are negative so
      // clearTimeout can tell them apart; QWasmTimer clears before it re-arms.
      (function () {
        var oS = window.setTimeout, oC = window.clearTimeout, ch = new MessageChannel(), q = new Map(), nid = 0, seen = 0;
        ch.port1.onmessage = function (e) { var f = q.get(e.data); if (f) { q.delete(e.data); f(); } };
        function isQt(fn) {
          if (fn.__fcQt) return true;
          var m = window.fcInstance, c = m && m.qtSuspendResumeControl; if (!c) return false;
          var ks = Object.keys(c.eventHandlers); if (ks.length === seen) return false;
          seen = ks.length; for (var i = 0; i < ks.length; i++) { var h = c.eventHandlers[ks[i]]; if (typeof h === 'function') h.__fcQt = true; }
          return !!fn.__fcQt;
        }
        window.setTimeout = function (fn, ms) {
          if ((ms | 0) === 0 && typeof fn === 'function' && isQt(fn)) { var id = --nid; q.set(id, fn); ch.port2.postMessage(id); window.__fcQtFast = (window.__fcQtFast | 0) + 1; return id; }
          return oS.apply(window, arguments);
        };
        window.clearTimeout = function (id) { if (id < 0) { q.delete(id); return; } return oC.apply(window, arguments); };
      })();
      function tick() {
        try {
          var m = window.fcInstance, c = m && m.qtSuspendResumeControl;
          if (m && !m.__fcQtWakeHooked && typeof m.qtSendPendingEvents === 'function') {
            m.__fcQtWakeHooked = true;
            var oq = m.qtSendPendingEvents;
            m.qtSendPendingEvents = function () { window.__fcQtWake = (window.__fcQtWake | 0) + 1; return oq.apply(this, arguments); };
          }
          var wake = (window.__fcQtWake | 0) !== wakeSeen;
          // queued native events first: a suspended loop drains itself on resume,
          // an exclusive wait is left alone
          if (c && c.pendingEvents.length && !c.resume && !(c.exclusiveEventHandler > 0) && typeof m.qtSendPendingEvents === 'function') {
            window.__fcQtDrained = (window.__fcQtDrained || 0) + c.pendingEvents.length;
            m.qtSendPendingEvents();
          }
          // Watchdog: a call whose promise never settles would park the pump for the
          // session. __fcPyBusy is the real re-entry guard, so after 3 s treat the local
          // flag as lost and count it.
          if (busy && performance.now() - busyAt > 3000) { busy = false; window.__fcPumpLost = (window.__fcPumpLost || 0) + 1; }
          if (m && window.__fcAppReady && (down > 0 || performance.now() < armedUntil || wake) && !busy && !window.__fcPyBusy && !(c && c.resume)
              && performance.now() - lastPump >= PUMP_MIN) {
            busy = true; busyAt = lastPump = performance.now(); wakeSeen = window.__fcQtWake | 0;
            if (wake && !(down > 0 || performance.now() < armedUntil)) window.__fcWakePumps = (window.__fcWakePumps | 0) + 1;
            var n = new TextEncoder().encode(CODE).length + 1, q = m._malloc(n);
            m.stringToUTF8(CODE, q, n);
            var r = (window.fcRunPy || function (mm, pp) { window.fcwebCallPy(mm, pp); mm._free(pp); })(m, q);
            var done = function () { busy = false; window.__fcPumped = (window.__fcPumped || 0) + 1; window.__fcPumpMs = (window.__fcPumpMs || 0) + (performance.now() - busyAt); };
            if (r && typeof r.then === 'function') r.then(done, done); else done();
          }
        } catch (e) { busy = false; window.__fcPumpErr = String(e); }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })();
    (function () {
      if (qp.has('no3d') || qp.has('nojspresent')) return;
      var P2 = WebGL2RenderingContext.prototype;
      var fbSerial = 0;
      var REG = {};                       // framebuffer serial -> {fb, gl, tex, blitTo}
      var UPL = [];                       // textures receiving raster uploads
      var lastForeignPresent = 0;
      var inPresent = false;
      var lastUi = null;                  // last good canvas-sized UI texture
      var keepTex = null, keepFbo = null, keepSz = [0, 0]; // page-owned composite of the last frame
      var PLOG = /[?&]presentlog=1/.test('') ? (window.__fcPresentLog = []) : null;
      if (PLOG) { window.__fcClickLog = []; window.addEventListener('pointerdown', function (ev) { window.__fcLastClick = performance.now(); PLOG.push({ t: Math.round(performance.now()), click: [ev.clientX, ev.clientY] }); }, true); }
      var hadWidget = false, holdFrames = 0;   // see the 3D-layer hold in present()
      var HOLD_MAX = 20;                       // ~0.3s at 60Hz, then let the UI through anyway
      var everLive = false;                    // latched __fcNativeComposite; see present()
      var keepValid = false;                   // keepTex currently holds a COMPLETE frame

      // ---- shadow GL state, so presenting never has to ASK the driver ----------------
      //
      // Restoring the caller's state used to mean nine getParameter/isEnabled calls per
      // frame, plus an isTexture per candidate texture. Those are synchronous: each one
      // blocks until the GPU process answers and flushes everything queued. A CPU profile
      // of a rotating mesh (2026-08-31) put isTexture alone at 6.4% of samples, with
      // getParameter and friends adding ~4% -- on a renderer whose actual GL work was
      // 0.07 ms/frame.
      //
      // Every setter that can change the state we touch is wrapped below, so the shadow is
      // authoritative once seeded. It is seeded lazily, ONCE per context, from the driver
      // (correct even though the app has been running and setting state before we look).
      // deleteTexture marks its texture dead, which replaces the isTexture probing.
      var __shadow = new WeakMap();
      function shadowFor(gl) {
        var s = __shadow.get(gl);
        if (!s) {
          s = { prog: gl.getParameter(gl.CURRENT_PROGRAM),
                vao:  gl.getParameter(gl.VERTEX_ARRAY_BINDING),
                tex:  gl.getParameter(gl.TEXTURE_BINDING_2D),
                act:  gl.getParameter(gl.ACTIVE_TEXTURE),
                draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
                read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
                vp:   Array.prototype.slice.call(gl.getParameter(gl.VIEWPORT)),
                scissor: gl.isEnabled(gl.SCISSOR_TEST),
                depth:   gl.isEnabled(gl.DEPTH_TEST),
                blend:   gl.isEnabled(gl.BLEND) };
          __shadow.set(gl, s);
        }
        return s;
      }
      // Wrap a setter so it updates the shadow, but ONLY when the call comes from the app
      // -- the present pass sets state deliberately and must not overwrite what it saved.
      function track(name, fn) {
        var orig = P2[name];
        P2[name] = function () {
          if (!inPresent) { try { fn(shadowFor(this), arguments); } catch (e) {} }
          return orig.apply(this, arguments);
        };
      }
      track('useProgram',      function (s, a) { s.prog = a[0]; });
      track('bindVertexArray', function (s, a) { s.vao  = a[0]; });
      track('activeTexture',   function (s, a) { s.act  = a[0]; });
      track('viewport',        function (s, a) { s.vp   = [a[0], a[1], a[2], a[3]]; });
      track('bindTexture',     function (s, a) { if (a[0] === 3553) s.tex = a[1]; });
      track('bindFramebuffer', function (s, a) {
        // DRAW_FRAMEBUFFER (36009) and FRAMEBUFFER (36160) both set the draw binding.
        if (a[0] === 36009 || a[0] === 36160) s.draw = a[1];
        // READ_FRAMEBUFFER (36008), and FRAMEBUFFER again, set the read binding --
        // which is how the SOURCE of the native composite's blit is identified.
        if (a[0] === 36008 || a[0] === 36160) s.read = a[1];
      });
      track('enable',  function (s, a) {
        if (a[0] === 3089) s.scissor = true; else if (a[0] === 2929) s.depth = true;
        else if (a[0] === 3042) s.blend = true;
      });
      track('disable', function (s, a) {
        if (a[0] === 3089) s.scissor = false; else if (a[0] === 2929) s.depth = false;
        else if (a[0] === 3042) s.blend = false;
      });
      var oDelTex = P2.deleteTexture;
      P2.deleteTexture = function (t) {
        // Marking beats probing: Qt deletes and recreates its backingstore textures on
        // resize/DPR change, and binding a dead one raises INVALID_OPERATION and draws
        // garbage. The mark is what the present pass filters on now.
        if (t) {
          try { t.__fcDead = true; } catch (e) {}
          // Drop it from the upload list here rather than waiting for present() to
          // notice. present() only runs while the tab is VISIBLE (it is driven by
          // requestAnimationFrame), so a background tab pruned nothing: measured
          // 2026-09-02, eight document open/close cycles in a hidden tab grew UPL from
          // 6 to 54, all but 6 of them deleted textures. UPL is searched with indexOf on
          // every raster upload, so that growth is on the hot path.
          try {
            var ui = UPL.indexOf(t);
            if (ui >= 0) { UPL.splice(ui, 1); }
          } catch (e) {}
        }
        return oDelTex.apply(this, arguments);
      };

      var oCreateFb = P2.createFramebuffer;
      P2.createFramebuffer = function () {
        var r = oCreateFb.apply(this, arguments);
        if (r) { r.__fcId = ++fbSerial; REG[r.__fcId] = { fb: r, gl: this }; }
        return r;
      };
      // ...and drop it again when the app deletes it. Without this REG only ever grew:
      // every 3D view creates framebuffers and closing its document deletes them, so a
      // session that opens and closes documents accumulated dead entries forever --
      // measured 2026-09-02 on the live build, 6 per document open/close cycle, each
      // holding a reference to a deleted framebuffer and its texture. present() walks
      // this map once per frame, so the cost of a frame grew with the number of
      // documents the session had ever opened. (The page's own compose framebuffer is
      // created with oCreateFb below, so it is never in REG and never at risk here.)
      var oDelFb = P2.deleteFramebuffer;
      P2.deleteFramebuffer = function (fb) {
        try {
          if (fb && fb.__fcId) {
            if (lastBlit && REG[fb.__fcId] === lastBlit) { lastBlit = null; }
            delete REG[fb.__fcId];
          }
        } catch (e) {}
        return oDelFb.apply(this, arguments);
      };
      var oFbTex = P2.framebufferTexture2D;
      P2.framebufferTexture2D = function (t, att, tt, tex, lvl) {
        try {
          var fb = shadowFor(this).draw;
          if (fb && fb.__fcId && att === this.COLOR_ATTACHMENT0 && REG[fb.__fcId])
            REG[fb.__fcId].tex = tex;
        } catch (e) {}
        return oFbTex.call(this, t, att, tt, tex, lvl);
      };
      var oTexImg = P2.texImage2D;
      P2.texImage2D = function () {
        try {
          var t = shadowFor(this).tex;
          if (t && arguments.length >= 6 && typeof arguments[3] === 'number')
            t.__fcSz = [arguments[3], arguments[4]];
        } catch (e) {}
        return oTexImg.apply(this, arguments);
      };
      var oTexStore = P2.texStorage2D;
      P2.texStorage2D = function (target, levels, ifmt, w, h) {
        try {
          var t = shadowFor(this).tex;
          if (t) t.__fcSz = [w, h];
        } catch (e) {}
        return oTexStore.call(this, target, levels, ifmt, w, h);
      };
      var oTexSub = P2.texSubImage2D;
      P2.texSubImage2D = function () {
        try {
          var t = shadowFor(this).tex;
          if (t) { t.__fcUpl = performance.now(); t.__fcGl = this;
                   if (UPL.indexOf(t) < 0) UPL.push(t); }
        } catch (e) {}
        return oTexSub.apply(this, arguments);
      };
      // WHICH FRAMEBUFFER IS COIN ACTUALLY DRAWING INTO?
      //
      // Every other way of answering this proved wrong. blitFrom is stamped from the
      // page's SHADOW of the bindings, and the shadow disagrees with the driver: it named
      // fb2 as the blit source while the real READ_FRAMEBUFFER_BINDING was fb17. And the
      // blit itself is no guide at all -- from the second document onward the C++ blits a
      // framebuffer TO ITSELF (fb17->fb17, fb21->fb21, measured), which is INVALID_OPERATION
      // and is why __fcNativeComposite goes false. So the compositor was choosing a buffer
      // nothing renders into, and the viewport kept showing the first document.
      //
      // Ask the driver instead, on a sample of draws. getParameter is a synchronous stall,
      // so this runs once every SAMPLE_EVERY draws -- at the ~150 draws a frame this port
      // now issues that is a couple of stalls per frame, against a wrong picture entirely.
      var drawTick = 0, SAMPLE_EVERY = 64;
      function noteSceneDraw(gl) {
        if (inPresent) return;                 // this pass's own quad is not the scene
        if ((++drawTick % SAMPLE_EVERY) !== 0) return;
        try {
          var fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
          if (fb && fb.__fcId && REG[fb.__fcId]) {
            REG[fb.__fcId].drewAt = performance.now();
            // AND the context doing it. REG.gl is whatever context CREATED the
            // framebuffer, and Qt recreates contexts per view -- binding a
            // framebuffer from another context is a silent INVALID_OPERATION that
            // leaves the previous binding in place, so a readback through the wrong
            // context returns some other buffer, identically, forever. That is what
            // made three documents in a row read back byte-identical while Coin was
            // demonstrably clearing and drawing this one.
            REG[fb.__fcId].drewGl = gl;
          }
        } catch (e) {}
      }
      // QT'S OWN COMPOSE STILL REACHES THE CANVAS ON A CLICK, and it is wrong.
      //
      // Measured 2026-09-14 in the user's Chrome with a tap on every draw to the window's
      // default framebuffer: 13-17 ms after each pointerdown, and every ~180 s on its own,
      // a clear + two full-window quads arrive from Qt's compositor -- the second one, the
      // QOpenGLWidget's rect, sampling the WINDOW texture (the widget texture lives on
      // another context, so its bind fails silently and the last bound one is drawn):
      // the whole FreeCAD window, upside down, inside the 3D view for one frame, until
      // this pass's next animation frame paints over it. Exactly what was reported.
      //
      // The user's Chrome presents at 240 Hz and the probes at 60, which is why a
      // one-frame frame was never photographed. So: whenever anything but this pass draws
      // to the window's framebuffer 0, re-present the kept composite in a microtask --
      // after Qt's compose task has finished, before the browser composites the canvas.
      var presentGl = null, foreignQueued = false;
      function noteForeignFb0(gl) {
        if (inPresent || gl !== presentGl || !keepValid) return;
        var fb = gl._fcFB;
        if (fb === undefined) { try { fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING); } catch (e) { return; } }
        if (fb !== null) return;
        window.__fcForeignFb0 = (window.__fcForeignFb0 || 0) + 1;
        if (foreignQueued) return;
        foreignQueued = true;
        queueMicrotask(function () { foreignQueued = false; try { representKept(gl); } catch (e) { window.__fcPresentErr = String(e); } });
      }
      var oDrawArrays2 = P2.drawArrays, oDrawElements2 = P2.drawElements, oClear2 = P2.clear;
      P2.drawArrays = function () { noteSceneDraw(this); noteForeignFb0(this); return oDrawArrays2.apply(this, arguments); };
      P2.drawElements = function () { noteSceneDraw(this); noteForeignFb0(this); return oDrawElements2.apply(this, arguments); };
      P2.clear = function () { noteForeignFb0(this); return oClear2.apply(this, arguments); };
      var oBlitFb = P2.blitFramebuffer;
      var lastBlit = null;                 // the REG entry the C++ composite blitted into last
      P2.blitFramebuffer = function () {
        try {
          var S = shadowFor(this), db = S.draw, rb = S.read;
          if (db && db.__fcId && REG[db.__fcId]) { REG[db.__fcId].blitTo = performance.now(); lastBlit = REG[db.__fcId]; }
          // AND THE SOURCE. renderScene blits Coin's framebuffer INTO the
          // QOpenGLWidget's, so blitTo marks Qt's destination -- which holds nothing
          // at all when the blit is refused. What this pass wants to present is the
          // SOURCE, the one Coin rendered into. Selecting on blitTo picked the empty
          // destination and painted the whole viewport black, while Coin's own
          // framebuffer sat in the registry carrying the scene and no stamp.
          if (rb && rb.__fcId && REG[rb.__fcId]) { REG[rb.__fcId].blitFrom = performance.now(); }
          // AND A RESOLVE. With anti-aliasing on, renderScene draws into a multisampled
          // renderbuffer pair (no texture, so never presentable) and resolves into fcTex's
          // framebuffer with this blit -- no draw call ever touches that one, so it never
          // earned drewAt and the pass presented nothing: 55 frames in a session that
          // rendered thousands (measured 2026-09-11, link 8, AntiAliasing=4). A blit whose
          // source has no texture is that resolve; its destination is where the scene is.
          if (rb && rb.__fcId && REG[rb.__fcId] && !REG[rb.__fcId].tex && db && db.__fcId && REG[db.__fcId]) {
            REG[db.__fcId].drewAt = performance.now(); REG[db.__fcId].drewGl = this;
          }
        } catch (e) {}
        return oBlitFb.apply(this, arguments);
      };
      // renderScene publishes the widget rect right AFTER its blit, so a rect belongs to
      // whichever framebuffer was blitted last. Keep them together: every 3D view renders
      // on a selection change -- including the hidden MDI views of the other open
      // documents, whose widgets sit at Qt's 600x450 default and were never laid out --
      // and a single global rect meant the last hidden view to finish got composed at
      // its bogus centred box while the real view went black (2026-09-02).
      var __rectVal = window.__fcWidgetRect || null;
      try {
        Object.defineProperty(window, '__fcWidgetRect', {
          configurable: true,
          get: function () { return __rectVal; },
          set: function (v) { __rectVal = v; if (lastBlit) lastBlit.rect = v; }
        });
      } catch (e) {}
      // NO WRAPPER ON drawArrays/drawElements. There used to be one, recording whether
      // anything else drew to framebuffer 0 so the present pass could stand down. That
      // heuristic was removed when it parked the pass on FreeCAD's own FB0 scribbles and
      // blacked out the viewport mid-drag -- but the wrapper stayed, and it ran a
      // SYNCHRONOUS getParameter(DRAW_FRAMEBUFFER_BINDING) on every draw to compute a
      // value nothing read. At ~40 draws/frame that is 40 command-buffer flushes per
      // frame for nothing; the draw path is the hottest in the renderer and now has no
      // wrapper on it at all.

      // Every OTHER top-level window's canvas. Qt gives a dialog its own canvas
      // (measured: Preferences is 1024x620 beside the main 1280x720), and once a 3D view
      // exists Qt's own compositing puts nothing on screen -- which is why this pass
      // exists. It composited only the canvas it picked, so the dialog stayed at its
      // cleared colour: alpha:false, nothing drawn, solid black, with the DOM title bar
      // still drawn around it.
      //
      // A texture belongs to the context that created it; binding it anywhere else is the
      // INVALID_OPERATION the console fills with. So each canvas is presented from a
      // texture uploaded IN ITS OWN context, and canvases with none are left alone.
      // Every canvas in the document, shadow roots included (Qt 6.5+ hangs the screen off
      // one). Walked at most once a second: this pass runs on every animation frame (213/s
      // measured idle on a 240 Hz display, 2026-09-12) and the full-document walk was the
      // second-largest idle cost after the pass itself. A canvas that appears between
      // walks is picked up within a second, which is well inside a window's first paint.
      var __cvList = [], __cvAt = -1e9;
      function allCanvases() {
        var now = performance.now();
        if (now - __cvAt < 1000) return __cvList;
        var out = [];
        (function walk(r) {
          r.querySelectorAll('*').forEach(function (el) {
            if (el.tagName === 'CANVAS') out.push(el);
            if (el.shadowRoot) walk(el.shadowRoot);
          });
        })(document);
        __cvList = out; __cvAt = now;
        return out;
      }
      function presentOtherWindows(mainGl) {
        var canvases = allCanvases();
        for (var ci = 0; ci < canvases.length; ci++) {
          var g = null;
          try { g = canvases[ci].getContext('webgl2'); } catch (e) { continue; }
          if (!g || g === mainGl || canvases[ci].__fcBridge || !g.drawingBufferWidth || g.drawingBufferWidth <= 1) continue;
          var best = null, t, i;
          for (i = UPL.length - 1; i >= 0; i--) {
            t = UPL[i];
            if (!t || t.__fcDead || t.__fcPage || t.__fcGl !== g || !t.__fcSz) continue;
            if (t.__fcSz[0] !== g.drawingBufferWidth || t.__fcSz[1] !== g.drawingBufferHeight) continue;
            if (!best || (t.__fcUpl || 0) > (best.__fcUpl || 0)) best = t;
          }
          if (!best) continue;
          var p = progFor(g);
          if (!p) continue;
          // SAVE AND RESTORE THIS CONTEXT'S STATE, exactly as the main pass does. This
          // context is Qt's own window context, and Qt's RHI tracks what it bound: it
          // does not re-issue useProgram for a pipeline it believes is current. Leaving
          // the quad program bound here meant every uniform Qt set next frame landed on
          // a program that was not bound -- 'location is not from the associated
          // program', 252-805 per session, the last of the console noise. Measured
          // 2026-09-11 from inside the glue: emscripten's shadow and Qt agreed on program
          // 62, the driver had a program with no emscripten name -- ours. The shadow S
          // is the app's state (track() ignores calls made while presenting); snapshot
          // it first in case this pass runs with inPresent clear.
          var S0 = shadowFor(g), sv = { prog: (g._fcProg !== undefined) ? g._fcProg : S0.prog,
                                        vao: (g._fcVAO !== undefined) ? g._fcVAO : S0.vao, tex: S0.tex, act: S0.act,
                                        draw: S0.draw, vp: S0.vp, scissor: S0.scissor,
                                        depth: S0.depth, blend: S0.blend };
          try {
            g.bindFramebuffer(g.DRAW_FRAMEBUFFER, null);
            g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
            g.disable(g.DEPTH_TEST); g.disable(g.BLEND); g.disable(g.SCISSOR_TEST);
            g.useProgram(p.pr);
            g.uniform1f(p.flip, 0.0);        // Qt's raster texture is y-down already
            g.uniform1i(p.loc, 0);
            g.activeTexture(g.TEXTURE0);
            g.bindTexture(g.TEXTURE_2D, best);
            g.bindVertexArray(p.vao);
            g.drawArrays(g.TRIANGLES, 0, 6);
            window.__fcPresentedAux = (window.__fcPresentedAux || 0) + 1;
          } catch (e) { window.__fcAuxErr = String(e); }
          try {
            g.useProgram(sv.prog); g.bindVertexArray(sv.vao);
            g.activeTexture(sv.act); g.bindTexture(g.TEXTURE_2D, sv.tex);
            g.bindFramebuffer(g.DRAW_FRAMEBUFFER, sv.draw);
            if (sv.vp) g.viewport(sv.vp[0], sv.vp[1], sv.vp[2], sv.vp[3]);
            if (sv.scissor) g.enable(g.SCISSOR_TEST);
            if (sv.depth) g.enable(g.DEPTH_TEST);
            if (sv.blend) g.enable(g.BLEND);
          } catch (e) { window.__fcAuxErr = String(e); }
        }
      }

      // THE 3D LAYER LIVES IN ANOTHER GL CONTEXT.
      //
      // Qt renders QOpenGLWidget on a context made current against a QOffscreenSurface
      // whose canvas is 1x1, and uploads the window's raster into the VISIBLE canvas's
      // context. Two WebGL contexts share nothing: bindTexture on a texture belonging to
      // the other one is INVALID_OPERATION, which is SILENT and leaves the PREVIOUS
      // texture bound. So the widget quad drew the UI texture into the viewport rect --
      // the whole window, scaled and upside down, inside itself, with the scene nowhere.
      // Measured: __fcXCtx=1, widget rect 1014x588, on a Part::Box exactly as on a 42 MB
      // assembly. Every other counter in this pass looked healthy throughout, which is
      // why it needed the flag rather than an eye.
      //
      // This became reachable when the display-context fallback above started presenting
      // to the visible canvas. Before that this pass presented to the 1x1 context -- same
      // context as the widget, so the bind worked, and nothing reached the screen at all.
      //
      // Two WebGL contexts share no objects, but the browser copies one context's CANVAS
      // into another's texture on the GPU (bridgeGpu above, 2026-09-11). This readback is
      // the fallback when that fails. It runs
      // once per 3D FRAME, not once per present: keyed on the blit stamp, so a 60 Hz
      // present pass over a viewport redrawing at 1-10 Hz pays it 1-10 times a second,
      // against the ~700 ms that redraw already costs. Skipped entirely when both live in
      // the same context, which is every build where Qt's own compositing works.
      var BR = { tex: null, gl: null, w: 0, h: 0, at: 0, when: 0, buf: null, src: null,
                 // undefined: try the GPU copy; true: it works; false: readback only
                 gpu: (/[?&]cpubridge=1/.test('') ? false : undefined) };
      // At most every BRIDGE_MS, and immediately when the blit stamp moves.
      //
      // Keying on the blit stamp ALONE froze the viewport. Measured over five document
      // opens: one copy, total. Coin keeps rendering into the framebuffer but
      // blitFramebuffer -- the only thing that stamps blitTo -- fires about once per
      // document, and two of the three registered framebuffers never report a blit at
      // all. So the first document looked right and every one after it showed the copy
      // taken for the first: a frozen or blank 3D view that a page reload cleared.
      //
      // A stamp that is not reliably updated cannot be the only cache key. The viewport
      // redraws at 1-10 Hz, so refreshing at 10 Hz costs at most 24 MB/s of readback and
      // cannot fall behind by more than a frame.
      var BRIDGE_MS = 100;
      // The GPU copy: widget texture -> source context's canvas -> destination texture.
      // A guest on Coin's context, so it saves and restores exactly what it touches (the
      // presentOtherWindows pattern). Returns false when the copy cannot be trusted.
      function bridgeGpu(w, dgl, sgl, W, H) {
        // The texture is bindable only on the context that created it, which the glue
        // stamps on every GL object. drewGl is the context that last drew into the
        // framebuffer and is not always that one: with two documents open the census
        // counted 754 'object does not belong to this context' binds here (2026-09-11).
        if (!w.tex || !w.tex.__fcGl) return false;
        sgl = w.tex.__fcGl;
        var cv = sgl.canvas;
        if (!cv || sgl === dgl) return false;
        var p = progFor(sgl);
        if (!p) return false;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        // The present pass must never mistake a bridge canvas for the window: every view's
        // context has its own canvas, so flag the canvas rather than remember one.
        cv.__fcBridge = true; BR.cv = cv;
        var S0 = shadowFor(sgl), sv = { prog: (sgl._fcProg !== undefined) ? sgl._fcProg : S0.prog,
                                        vao: (sgl._fcVAO !== undefined) ? sgl._fcVAO : S0.vao, tex: S0.tex, act: S0.act,
                                        draw: S0.draw, read: sgl.getParameter(sgl.READ_FRAMEBUFFER_BINDING), vp: S0.vp,
                                        scissor: S0.scissor, depth: S0.depth, blend: S0.blend,
                                        cull: sgl.isEnabled(sgl.CULL_FACE) };
        var drew = false;
        try {
          sgl.bindFramebuffer(sgl.FRAMEBUFFER, null);
          sgl.viewport(0, 0, W, H);
          sgl.disable(sgl.DEPTH_TEST); sgl.disable(sgl.BLEND); sgl.disable(sgl.SCISSOR_TEST); sgl.disable(sgl.CULL_FACE);
          sgl.useProgram(p.pr);
          // flip=1 is a 1:1 copy with this quad (see progFor): framebuffer row r <- texel
          // row r, so the canvas image is upright and the upload below flips it back into
          // the bottom-up layout the widget quad expects (the layout readPixels produced).
          sgl.uniform1f(p.flip, 1.0);
          sgl.uniform1i(p.loc, 0);
          sgl.activeTexture(sgl.TEXTURE0);
          sgl.bindTexture(sgl.TEXTURE_2D, w.tex);
          sgl.bindVertexArray(p.vao);
          sgl.drawArrays(sgl.TRIANGLES, 0, 6);
          drew = true;
        } catch (e) { window.__fcBridgeGpuErr = String(e); }
        try {
          sgl.useProgram(sv.prog); sgl.bindVertexArray(sv.vao);
          sgl.activeTexture(sv.act); sgl.bindTexture(sgl.TEXTURE_2D, sv.tex);
          sgl.bindFramebuffer(sgl.DRAW_FRAMEBUFFER, sv.draw);
          sgl.bindFramebuffer(sgl.READ_FRAMEBUFFER, sv.read);
          if (sv.vp) sgl.viewport(sv.vp[0], sv.vp[1], sv.vp[2], sv.vp[3]);
          if (sv.scissor) sgl.enable(sgl.SCISSOR_TEST);
          if (sv.depth) sgl.enable(sgl.DEPTH_TEST);
          if (sv.blend) sgl.enable(sgl.BLEND);
          if (sv.cull) sgl.enable(sgl.CULL_FACE);
        } catch (e) { window.__fcBridgeGpuErr = String(e); }
        if (!drew) return false;
        var fresh = !BR.tex || BR.w !== W || BR.h !== H;
        if (!BR.tex) {
          BR.tex = dgl.createTexture(); BR.tex.__fcPage = true;
          dgl.bindTexture(dgl.TEXTURE_2D, BR.tex);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_MIN_FILTER, dgl.LINEAR);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_MAG_FILTER, dgl.LINEAR);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_WRAP_S, dgl.CLAMP_TO_EDGE);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_WRAP_T, dgl.CLAMP_TO_EDGE);
        } else {
          dgl.bindTexture(dgl.TEXTURE_2D, BR.tex);
        }
        var pf = dgl._fcFlipY !== undefined ? dgl._fcFlipY : dgl.getParameter(dgl.UNPACK_FLIP_Y_WEBGL);
        if (!pf) dgl.pixelStorei(dgl.UNPACK_FLIP_Y_WEBGL, true);
        // oTexImg/oTexSub: the page's own texture must never enter UPL.
        if (fresh) oTexImg.call(dgl, dgl.TEXTURE_2D, 0, dgl.RGBA, dgl.RGBA, dgl.UNSIGNED_BYTE, cv);
        else oTexSub.call(dgl, dgl.TEXTURE_2D, 0, 0, 0, dgl.RGBA, dgl.UNSIGNED_BYTE, cv);
        if (!pf) dgl.pixelStorei(dgl.UNPACK_FLIP_Y_WEBGL, false);
        if (BR.gpu === undefined) {
          // Decide once: any error on either side means the copy is not trustworthy.
          var e1 = sgl.getError(), e2 = dgl.getError();
          if (e1 || e2) { window.__fcBridgeGpuErr = 'gl error ' + e1 + '/' + e2; return false; }
          BR.gpu = true;
        }
        return true;
      }
      function bridgeWidget(w, dgl) {
        var sz = w.tex && w.tex.__fcSz;
        if (!sz || sz[0] < 2 || sz[1] < 2 || !w.fb || !w.gl) return null;
        var W = sz[0], H = sz[1];
        if (BR.gl !== dgl) { BR.gl = dgl; BR.tex = null; }
        // A different source framebuffer is a different picture, whatever the
        // clock says: switching documents must not show the old one's last frame.
        if (BR.src !== w) { BR.src = w; BR.at = -1; BR.when = 0; }
        var nowMs = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        // The resolve blit stamps drewAt on the destination and blitTo as well; take the
        // newer of the two so every scene frame refreshes the copy. Keyed on blitTo alone,
        // half the frames of a drag were rendered and never shown (36 copies for 73 frames,
        // measured 2026-09-11), because the timer below was doing the work at 10 Hz.
        var stamp = Math.max(w.blitTo || 0, w.drewAt || 0);
        if (BR.tex && BR.w === W && BR.h === H && BR.at === stamp
            && (nowMs - BR.when) < BRIDGE_MS) return BR.tex;
        var sgl = w.drewGl || w.gl, n = W * H * 4;
        // GPU PATH FIRST. readPixels is a full pipeline stall: 14-17 ms per copy on the
        // user's machine shape (2026-09-11), a third of every frame of a drag. Two WebGL
        // contexts share no objects, but the browser can copy one context's CANVAS into
        // another's texture on the GPU: draw the widget texture onto the source context's
        // own (offscreen, 1x1 until now) canvas, then texImage2D that canvas here. No bytes
        // cross to the CPU. Falls back to the readback below on the first GL error, or on
        // ?cpubridge=1.
        if (BR.gpu !== false) {
          var okGpu = false;
          try { okGpu = bridgeGpu(w, dgl, sgl, W, H); } catch (e) { window.__fcBridgeGpuErr = String(e); okGpu = false; }
          if (okGpu) {
            BR.w = W; BR.h = H; BR.at = stamp; BR.when = nowMs;
            window.__fcBridgeMs = (window.__fcBridgeMs || 0) +
              (((typeof performance !== 'undefined') ? performance.now() : Date.now()) - nowMs);
            window.__fcBridged = (window.__fcBridged || 0) + 1;
            window.__fcBridgedGpu = (window.__fcBridgedGpu || 0) + 1;
            return BR.tex;
          }
          if (BR.gpu === undefined) {
            // First attempt failed: this session uses the readback. Decided once, because
            // the check that decides it (getError) is itself a round-trip.
            BR.gpu = false; window.__fcBridgeGpuOff = window.__fcBridgeGpuErr || 'gl error';
          }
        }
        try {
          if (!BR.buf || BR.buf.length < n) BR.buf = new Uint8Array(n);
          // Restore the source context's read binding: this pass is a guest there.
          var prev = sgl.getParameter(sgl.READ_FRAMEBUFFER_BINDING);
          sgl.bindFramebuffer(sgl.READ_FRAMEBUFFER, w.fb);
          // CHECK THE BIND TOOK. A framebuffer from another context is refused
          // silently and the previous binding stays, so readPixels would quietly
          // return a different buffer -- which is exactly how this pass presented
          // the first document's frame for the rest of the session.
          if (sgl.getParameter(sgl.READ_FRAMEBUFFER_BINDING) !== w.fb) {
            sgl.bindFramebuffer(sgl.READ_FRAMEBUFFER, prev);
            window.__fcBridgeBindFail = (window.__fcBridgeBindFail || 0) + 1;
            return BR.tex;
          }
          sgl.readPixels(0, 0, W, H, sgl.RGBA, sgl.UNSIGNED_BYTE, BR.buf);
          sgl.bindFramebuffer(sgl.READ_FRAMEBUFFER, prev);
        } catch (e) { window.__fcBridgeErr = String(e); return BR.tex; }
        var fresh = !BR.tex || BR.w !== W || BR.h !== H;
        if (!BR.tex) {
          BR.tex = dgl.createTexture(); BR.tex.__fcPage = true;
          dgl.bindTexture(dgl.TEXTURE_2D, BR.tex);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_MIN_FILTER, dgl.LINEAR);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_MAG_FILTER, dgl.LINEAR);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_WRAP_S, dgl.CLAMP_TO_EDGE);
          dgl.texParameteri(dgl.TEXTURE_2D, dgl.TEXTURE_WRAP_T, dgl.CLAMP_TO_EDGE);
        } else {
          dgl.bindTexture(dgl.TEXTURE_2D, BR.tex);
        }
        // readPixels hands back GL row order, bottom-up -- the same order the widget's own
        // texture is in, so the quad's flip=1 stays correct. That only holds if the upload
        // does not flip as well, and Qt is free to have left UNPACK_FLIP_Y_WEBGL on.
        var pf = dgl._fcFlipY !== undefined ? dgl._fcFlipY : dgl.getParameter(dgl.UNPACK_FLIP_Y_WEBGL);
        if (pf) dgl.pixelStorei(dgl.UNPACK_FLIP_Y_WEBGL, false);
        var view = BR.buf.length === n ? BR.buf : BR.buf.subarray(0, n);
        // oTexImg/oTexSub, not the wrapped pair: this texture is the page's own and must
        // never enter UPL, where it would compete to be chosen as the UI layer.
        if (fresh) oTexImg.call(dgl, dgl.TEXTURE_2D, 0, dgl.RGBA, W, H, 0,
                                dgl.RGBA, dgl.UNSIGNED_BYTE, view);
        else oTexSub.call(dgl, dgl.TEXTURE_2D, 0, 0, 0, W, H,
                          dgl.RGBA, dgl.UNSIGNED_BYTE, view);
        if (pf) dgl.pixelStorei(dgl.UNPACK_FLIP_Y_WEBGL, true);
        BR.w = W; BR.h = H; BR.at = stamp; BR.when = nowMs;
        // Time it. An empty scene still costs 95-129 ms a frame with every object
        // hidden, so the floor is per-frame overhead rather than geometry, and this
        // readback -- 2.4 MB out of the GPU on the main thread -- is one of the few
        // things in that path this code owns.
        window.__fcBridgeMs = (window.__fcBridgeMs || 0) +
          (((typeof performance !== 'undefined') ? performance.now() : Date.now()) - nowMs);
        window.__fcBridged = (window.__fcBridged || 0) + 1;
        return BR.tex;
      }

      function progFor(gl) {
        if (gl.__fcPresProg) return gl.__fcPresProg;
        var vsrc = '#version 300 es\nout vec2 uv;\nuniform float uFlip;\nvoid main(){\n'
          + 'vec2 p = vec2(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4 ? 1.0 : -1.0,\n'
          + '              gl_VertexID==2||gl_VertexID==4||gl_VertexID==5 ? 1.0 : -1.0);\n'
          + 'uv = vec2(p.x*0.5+0.5, mix(p.y*0.5+0.5, 0.5-p.y*0.5, uFlip));\n'
          + 'gl_Position = vec4(p.x, -p.y, 0.0, 1.0);\n}';   // composed image is y-down
        var fsrc = '#version 300 es\nprecision mediump float;\nin vec2 uv;\n'
          + 'uniform sampler2D t;\nout vec4 c;\nvoid main(){ c = texture(t, uv); }';
        var vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsrc); gl.compileShader(vs);
        var fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsrc); gl.compileShader(fs);
        var pr = gl.createProgram();
        gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
        gl.__fcPresProg = { pr: pr, loc: gl.getUniformLocation(pr, 't'),
                            flip: gl.getUniformLocation(pr, 'uFlip'),
                            vao: gl.createVertexArray() };
        return gl.__fcPresProg;
      }

      // The kept composite, drawn again over whatever someone else just put on the
      // canvas. State is saved and restored from the shadows exactly as present() does.
      function representKept(gl) {
        if (inPresent || !keepValid || !keepTex || !gl || gl.isContextLost()) return;
        var p = progFor(gl); if (!p) return;
        var S = shadowFor(gl);
        var sProg = (gl._fcProg !== undefined) ? gl._fcProg : S.prog,
            sVao = (gl._fcVAO !== undefined) ? gl._fcVAO : S.vao, sTex = S.tex, sAct = S.act,
            sDraw = S.draw, sVp = S.vp, sScis = S.scissor, sDep = S.depth, sBl = S.blend;
        inPresent = true;
        try {
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
          gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
          gl.useProgram(p.pr); gl.bindVertexArray(p.vao);
          gl.activeTexture(gl.TEXTURE0); gl.uniform1i(p.loc, 0);
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.uniform1f(p.flip, 1.0);
          gl.bindTexture(gl.TEXTURE_2D, keepTex);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.useProgram(sProg); gl.bindVertexArray(sVao);
          gl.activeTexture(sAct); gl.bindTexture(gl.TEXTURE_2D, sTex);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sDraw);
          if (sVp) gl.viewport(sVp[0], sVp[1], sVp[2], sVp[3]);
          if (sScis) gl.enable(gl.SCISSOR_TEST);
          if (sDep) gl.enable(gl.DEPTH_TEST);
          if (sBl) gl.enable(gl.BLEND);
          window.__fcRepresented = (window.__fcRepresented || 0) + 1;
        } catch (ex) { window.__fcPresentErr = String(ex); }
        inPresent = false;
      }
      function present() {
        requestAnimationFrame(present);
        if (inPresent) return;
        // The native composite flag doubles as "3D pipeline live": before the first
        // renderScene there is nothing of ours to present and Qt's raster path shows
        // the UI on its own.
        //
        // ONCE LIVE, ALWAYS LIVE. The C++ republishes this variable on EVERY frame as
        // the result of that frame's blit (renderScene: `__fcNativeComposite = blitErr
        // == GL_NO_ERROR`), while this pass reads it as "is there a 3D pipeline at all".
        // Two meanings on one variable: a single refused blit mid-session read here as
        // "no pipeline", stood the pass down, and published NOTHING for that frame --
        // and the canvas is created with alpha:false and preserveDrawingBuffer:false, so
        // a frame that draws nothing is composited as SOLID BLACK. That is a one-frame
        // black flash, which is the shape of what was reported on 2026-09-02.
        //
        // So latch it: the first true means the pipeline exists, and after that a false
        // means "this frame's blit failed", which is handled below by holding the last
        // complete frame rather than by publishing nothing.
        if (window.__fcNativeComposite) { everLive = true; }
        if (!everLive) return;
        // STAND-DOWN REMOVED. It parked this pass whenever anything else drew to
        // framebuffer 0 -- meant to defer to a Qt whose present works. But FreeCAD's
        // own interaction overlays (GLPainter rubber-band etc.) scribble small direct
        // FB0 draws during every mouse action, which read as 'Qt presents' and
        // blanked the screen for the whole drag -- black while moving, back when
        // idle, exactly as reported on 2026-08-30. Presenting unconditionally is
        // safe everywhere: on builds where Qt's present does work we repaint the
        // same composed content one extra time per frame, visually identical.
        void lastForeignPresent;
        inPresent = true;
        try {
          // The widget FBO: the one the C++ blit writes into most recently.
          var widget = null, k, e;
          // Prefer the framebuffer most recently DRAWN into -- observed from the driver,
          // not inferred from a blit that may be a self-blit or a stale shadow. Falls back
          // to the blit source, which is right while the native composite still works.
          var src = null;
          // THE VISIBLE VIEW FIRST. Hidden MDI views keep rendering, and "most recently
          // drawn" can be one of them -- its frame then lands over whatever is on screen
          // (measured 2026-09-10: a 600x450 view painted across the Start page). renderScene
          // publishes the GL name of the framebuffer belonging to the view that is actually
          // visible as __fcVisibleFbo; emscripten stores that name on the object (.name),
          // so prefer the entry whose framebuffer carries it, and fall back to recency only
          // when the app has not said.
          var vis = window.__fcVisibleFbo, how = '';
          if (vis) {
            for (k in REG) { e = REG[k];
              if (e.fb && e.fb.name === vis && e.tex && e.drewAt && !e.tex.__fcDead) { src = e; how = 'vis:' + k; break; } }
          }
          if (!src) {
            for (k in REG) { e = REG[k];
              if (!e.tex || !e.drewAt || e.tex.__fcDead) continue;
              if (!src || e.drewAt > src.drewAt) { src = e; how = 'recent:' + k; } }
          }
          if (!src) {
            for (k in REG) { e = REG[k];
              if (!e.tex || !e.blitFrom || e.tex.__fcDead) continue;
              if (!src || e.blitFrom > src.blitFrom) { src = e; how = 'blit:' + k; } }
          }
          for (k in REG) { e = REG[k];
            // The ACTIVE view is the largest recently-blitted framebuffer, not the most
            // recently blitted one: hidden MDI views of other documents also render
            // (600x450 default widgets) and can finish last. Ties/no recent blit fall
            // back to recency.
            if (!e.tex || !e.blitTo) continue;
            var eA = e.tex.__fcSz ? e.tex.__fcSz[0] * e.tex.__fcSz[1] : 0;
            var wA = widget && widget.tex.__fcSz ? widget.tex.__fcSz[0] * widget.tex.__fcSz[1] : 0;
            var eRecent = performance.now() - e.blitTo < 1500;
            var wRecent = widget && performance.now() - widget.blitTo < 1500;
            if (!widget || (eRecent && !wRecent) || (eRecent === wRecent && (eA > wA || (eA === wA && e.blitTo > widget.blitTo)))) widget = e; }
          if (widget && widget.tex && widget.tex.__fcDead) { widget.tex = null; widget = null; }
          if (src) { widget = src; }
          var gl = widget && widget.gl;
          if (!gl) { for (k in REG) { if (REG[k].gl) { gl = REG[k].gl; break; } } }
          // REG holds only offscreen contexts -- Qt makes QOpenGLWidget's context current
          // on a QOffscreenSurface whose canvas is 1x1, and that is the context that lands
          // here. Everything below sizes itself against this gl, so a 1x1 one means the
          // canvas-sized UI texture in UPL can never match and this pass starves: measured
          // at 2540 consecutive frames returning with nothing presented, on a canvas that
          // shows an undrawn frame as solid black. Take the context that owns the visible
          // canvas instead; getContext hands back the one already created for it.
          //
          // This did not bite while Qt's own shaders were broken: Qt painted the widget
          // layer by another route then, and this pass was not what reached the canvas.
          // Fixing glShaderSource made this the only route, which is why the window went
          // black on a build whose shaders had just started working.
          // ...or the canvas bridgeGpu resized to carry the 3D layer across: still an
          // offscreen surface, just no longer 1x1. Presenting onto it blacked the window
          // the first time the GPU bridge ran (2026-09-11).
          // ...or NO context at all: the last 3D view was just closed, its context deleted
          // and its REG entry with it. Returning here left the previous frame on screen
          // forever -- File > Close showed the closed document, its tree and its tab until
          // the next document opened (measured 2026-09-15, scratchpad/close-probe.py). The
          // UI-only compose below is exactly what that state needs; it just needs a context.
          if (!gl || gl.drawingBufferWidth <= 1 || (gl.canvas && gl.canvas.__fcBridge)) {
            // Qt 6.5+ hangs the whole screen off ONE shadow root, so the canvas is not
            // reachable from document.querySelectorAll -- hence the walk.
            var dom = null;
            allCanvases().forEach(function (el) {
              if (!dom || el.width * el.height > dom.width * dom.height) dom = el;
            });
            try {
              var dgl = dom && dom.getContext('webgl2');
              if (dgl) gl = dgl;
            } catch (e) { /* incompatible context on that canvas: keep what we had */ }
          }
          if (!gl) { inPresent = false; return; }
          // A texture belongs to the context that created it. If the widget FBO was
          // made on Qt's offscreen context and gl is the visible canvas's, then
          // binding widget.tex below is a silent INVALID_OPERATION -- the previously
          // bound texture stays bound, and the widget quad paints THAT into the
          // viewport rect instead. Recorded, not assumed: a wrong picture here is
          // indistinguishable from a wrong flip or a wrong rect by eye.
          window.__fcXCtx = (widget && widget.gl && widget.gl !== gl) ? 1 : 0;
          // The raster UI: newest canvas-sized uploaded texture.
          var ui = null, i, t;
          for (i = UPL.length - 1; i >= 0; i--) { t = UPL[i];
            // Qt deletes and recreates its backingstore textures (resize, DPR
            // change, post-crash teardown). Binding a deleted one raises
            // INVALID_OPERATION and the UI layer draws garbage -- prune instead.
            if (t.__fcDead || t.__fcPage) { UPL.splice(i, 1); continue; }
            // ...and from THIS context. A texture from another one cannot be bound here:
            // it is a silent INVALID_OPERATION that leaves the previous texture bound and
            // paints that instead (see bridgeWidget). With a dialog open Qt has more than
            // one context uploading, and the console fills with exactly that warning.
            // Every UPL member has __fcGl -- the same hook records both -- so this can
            // only skip a texture that could never have been drawn anyway.
            if (t.__fcGl && t.__fcGl !== gl) {
              window.__fcUiXCtx = (window.__fcUiXCtx || 0) + 1; continue; }
            // WITHIN TWO PIXELS, not equal. At devicePixelRatio 1.5 a 1707-px-wide window
            // is 2560.5 device pixels: the canvas rounds to 2561 and Qt's backing texture
            // to 2560, so an exact match never happens and the pass presents NOTHING --
            // a black window with a fragment of the 3D quad in it, which is what the
            // user's own Chrome showed on 2026-09-10. Every integer-sized test window
            // (1280x720 at 1.0 and 1.5) matched exactly, which is how this shipped.
            if (t.__fcSz && Math.abs(t.__fcSz[0] - gl.drawingBufferWidth) <= 2
                         && Math.abs(t.__fcSz[1] - gl.drawingBufferHeight) <= 2
                         && (!ui || (t.__fcUpl || 0) > (ui.__fcUpl || 0))) ui = t; }
          // A frame with no UI layer must NOT be presented. Qt deletes and recreates
          // its backingstore texture during interaction (repaint churn, resize, DPR
          // change); between the delete and the first upload into the replacement there
          // is no canvas-sized texture. Presenting the widget alone paints the 3D view
          // onto a framebuffer Qt has just cleared, so every other pixel goes black for
          // a frame -- the "screen flashes black while moving" report. Hold the last
          // good UI texture across that gap, and if even that is gone, skip the frame
          // entirely: leaving the previous complete frame on screen is always better
          // than showing half of this one.
          if (ui) { lastUi = ui; }
          else if (lastUi && !lastUi.__fcDead
                   && !(lastUi.__fcGl && lastUi.__fcGl !== gl)
                   && lastUi.__fcSz && Math.abs(lastUi.__fcSz[0] - gl.drawingBufferWidth) <= 2
                   && Math.abs(lastUi.__fcSz[1] - gl.drawingBufferHeight) <= 2) { ui = lastUi; }
          // No live UI texture at all (Qt deleted it and has not uploaded the next one
          // yet -- a selection click re-rasterises the whole window and the main thread
          // stalls ~1 s on the 443k-triangle pick + rebuild). Painting nothing here lets
          // the browser present the cleared canvas: a BLACK FLASH on every click
          // (reported 2026-09-02). Paint the page-owned copy of the last complete frame
          // instead; it is refreshed after every successful present below.
          // Deliberately NOT requiring the kept frame to match the current canvas size.
          // Qt relays the window out on a selection click (the Tasks panel appears), and
          // that resizes the canvas -- observed live, 2561x1398 -> 2561x1314, with the
          // published widget rect jumping with it. A resize reallocates and CLEARS the
          // drawing buffer, so the one frame where the new size has arrived but Qt's new
          // UI texture has not is a solid black canvas (alpha:false). The kept frame is
          // the right thing to show there even at the wrong size: the present below draws
          // it as a full-viewport quad, so it simply stretches for a frame. A frame of
          // very slightly scaled UI is invisible next to a black flash.
          var useKeep = false;
          if (!ui) {
            if (keepValid) { useKeep = true; }
            else { inPresent = false; return; }
          }
          var p = progFor(gl);
          if (!p) { inPresent = false; return; }
          // Read the state to restore from the SHADOW, never from the driver. A CPU
          // profile of a rotating mesh put isTexture at 6.4% of samples with
          // getParameter/getError/get-buffer another 4% -- every one of those is a
          // synchronous round-trip that flushes the command buffer and stalls the
          // frame. The shadow is maintained by the wrappers below, so this costs
          // nothing; it is seeded once from the driver on the first frame.
          var S = shadowFor(gl);
          presentGl = gl;
          // The PROGRAM and VAO come from the low-level wrappers (_fcProg/_fcVAO), which
          // record every request that reaches the driver, not from S: measured 2026-09-11
          // from inside the glue, 224-805 times per session the restore below re-bound a
          // program Qt had long since replaced (and by then deleted) -- S had gone stale,
          // and Qt's RHI, which trusts its own binding, then set every uniform against the
          // wrong program: 'location is not from the associated program'. __fcShadowDrift
          // counts how often S and the truth disagree here.
          if (S.prog !== gl._fcProg) { window.__fcShadowDrift = (window.__fcShadowDrift || 0) + 1; }
          var sProg = (gl._fcProg !== undefined) ? gl._fcProg : S.prog,
              sVao = (gl._fcVAO !== undefined) ? gl._fcVAO : S.vao, sTex = S.tex, sAct = S.act,
              sDraw = S.draw, sVp = S.vp,
              sScis = S.scissor, sDep = S.depth, sBl = S.blend;
          var W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
          // The quad program and its fixed state. This MUST run before either the
          // compose or the present below: dropping it while restructuring turned the
          // whole canvas black (the draws inherited whatever program Coin left bound),
          // caught by the render gate at 1 distinct colour, 100% #000.
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
          gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
          gl.useProgram(p.pr);
          gl.bindVertexArray(p.vao);
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(p.loc, 0);

          // A composite without the 3D layer is a frame with a HOLE in it.
          //
          // The guard above covers "no UI texture". This is the other half: on a click Qt
          // re-rasterises the window and uploads a fresh UI texture, but the widget
          // framebuffer has not been blitted yet that frame. So `ui` is live, `widget` is
          // not, and composing would paint the raster UI across the whole canvas --
          // including the region the 3D view owns, where the raster layer has nothing.
          // One or two frames of that is a 5-10 ms black flash in the viewport on every
          // click (reported 2026-09-02, after the full-window version was fixed by
          // holding the last UI texture).
          //
          // A frame whose blit was REFUSED is the same situation: __fcNativeComposite is
          // republished by renderScene as that frame's blit result, so a false there means
          // the 3D layer is stale, not that the pipeline is gone.
          //
          // Bounded by HOLD_MAX: a viewport that is legitimately gone (last document
          // closed) must not freeze the UI, so after ~0.3s the UI-only compose goes ahead.
          // ...and only while a 3D view is the active MDI window. A view that just went
          // behind the Start page still renders once more at its restored 400x300 and
          // republishes its rect (measured 2026-09-11), which would paint it over the
          // Start page; the Python hook (FCACTIVE-) says what is actually in front.
          var wHave = !!(widget && (widget.rect || window.__fcWidgetRect)) && window.__fcActive3D !== false;
          var wUsable = !!window.__fcNativeComposite && wHave;
          if (wUsable) { hadWidget = true; holdFrames = 0; }
          var holdThisFrame = (ui && !wUsable && hadWidget && !useKeep && keepValid &&
                               holdFrames < HOLD_MAX);
          if (holdThisFrame) { holdFrames++; }
          // ONCE THE HOLD IS SPENT, DRAW THE 3D LAYER WE HAVE.
          //
          // __fcNativeComposite is republished by renderScene as that frame's BLIT
          // RESULT, and the C++ publishes a failure on purpose so this pass can cover
          // for it. Treating it as the gate on the widget layer inverts that: when the
          // blit fails EVERY frame, the hold expires and the compositor settles into
          // painting the UI alone -- a permanently black viewport with no error anywhere.
          // Measured over five document opens: native True for the first, False for every
          // one after, 2221 frames presented and the 3D layer bridged exactly once.
          //
          // The blit's failure says nothing about the framebuffer Coin rendered INTO,
          // which is what this pass reads. So keep the hold for a genuinely transient
          // stale frame -- that is what stops the black flash on a click -- and once the
          // budget is spent, composite the layer rather than dropping it.
          var wDraw = wUsable || (wHave && everLive && holdFrames >= HOLD_MAX);
          var composing = (ui && !holdThisFrame);
          // ?presentlog=1: one entry per frame, so a frame that came out wrong can be
          // identified instead of guessed at. A bad frame is 8-16 ms -- long enough to see
          // as a flash, far too short to screenshot.
          if (PLOG) { PLOG.push({ t: Math.round(performance.now()), ui: !!ui, keep: !!useKeep,
                                  widget: wUsable, hold: holdThisFrame, size: W + 'x' + H,
                                  how: how, tex: (widget && widget.tex && widget.tex.__fcSz) ? widget.tex.__fcSz.join('x') : '',
                                  rect: (widget && (widget.rect || window.__fcWidgetRect) || []).join(','),
                                  vis: vis || 0, a3d: window.__fcActive3D, draw: !!wDraw, nat: !!window.__fcNativeComposite });
                      // Plain frames are evicted first; clicks and the sampled frames after them stay.
                      if (PLOG.length > 2000) { var __i0 = PLOG.findIndex(function (e) { return !e.click && e.grid === undefined; }); if (__i0 >= 0 && PLOG.length < 20000) PLOG.splice(__i0, 1); else PLOG.shift(); } }

          if (composing) {
            // (Re)size the kept framebuffer ONLY here, where a real compose is about to
            // overwrite it. Resizing reallocates the texture and throws the kept frame
            // away, which would defeat the whole point on exactly the frame that needs it.
            if (!keepFbo || keepSz[0] !== W || keepSz[1] !== H) {
              if (!keepTex) {
                keepTex = gl.createTexture(); keepTex.__fcPage = true;
                gl.bindTexture(gl.TEXTURE_2D, keepTex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              } else {
                gl.bindTexture(gl.TEXTURE_2D, keepTex);
              }
              oTexImg.call(gl, gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
              if (!keepFbo) { keepFbo = oCreateFb.call(gl); keepFbo.__fcPage = true; }
              gl.bindFramebuffer(gl.FRAMEBUFFER, keepFbo);
              gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, keepTex, 0);
              keepSz = [W, H];
              keepValid = false;            // reallocated: holds nothing yet
            }
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, keepFbo);
            // THE 3D LAYER GOES UNDER THE UI LAYER, not over it. Qt punches a transparent
            // hole in its raster backing store where the QOpenGLWidget sits (measured
            // 2026-09-13: RGBA 0,0,0,0 across the view) and paints anything that overlaps
            // the view -- the Tasks overlay panel, its translucent title bar -- into that
            // same store on top. Drawing the widget quad last covered all of it: every
            // task panel was invisible in the browser while Qt reported it visible. So:
            // the widget quad first, then the UI texture blended over the whole canvas
            // (premultiplied, as Qt's ARGB32_Premultiplied store is), and the hole shows
            // the 3D frame through.
            // widget.tex is only bindable here when the widget shares this context; when
            // it does not, bridgeWidget copies it across. A null means the copy failed and
            // the frame keeps the UI layer alone -- never the wrong texture stretched over
            // the viewport, which is what the failed bind used to produce.
            var wtex = wDraw ? ((widget.gl === gl) ? widget.tex : bridgeWidget(widget, gl))
                             : null;
            if (wtex) {
              var r = widget.rect || window.__fcWidgetRect;   // [x, y, w, h], top-left, Qt LOGICAL px
              // The C++ multiplies by QOpenGLWidget::devicePixelRatio() meaning to publish
              // device pixels, and on wasm that returns 1 while the window's ratio is 1.5:
              // measured 2026-09-10, rect [0,24,1280,411] beside a 1920x616 widget
              // framebuffer on a 1920x1080 canvas. Drawn as-is, the 3D layer landed at
              // two-thirds size in the wrong place and the rest of Qt's widget hole stayed
              // black -- the production screenshot. So scale by the canvas's own ratio of
              // device to CSS pixels, exactly as the screenshot crop below already does.
              // NOT by the picked texture's size over the rect: that ratio is only a unit
              // conversion when the picked framebuffer IS the one the rect describes, and
              // it is not always -- a hidden MDI view keeps rendering, is the most recently
              // drawn framebuffer, and came out painted over the Start page at its own
              // 600x450 (measured 2026-09-10, first version of this fix).
              var __cv = gl.canvas;
              var __sx = W / ((__cv && __cv.clientWidth) || W);
              var __sy = H / ((__cv && __cv.clientHeight) || H);
              var __rx = Math.round(r[0] * __sx), __ry = Math.round(r[1] * __sy);
              var __rw = Math.round(r[2] * __sx), __rh = Math.round(r[3] * __sy);
              // NO size test between the framebuffer and the rect here. One was tried on
              // 2026-09-10 to keep a hidden MDI view's frame off the Start page, and under
              // AntiAliasing=4 at devicePixelRatio 1.5 it skipped 240 of 242 frames -- a
              // black viewport, which is the worse of the two failures by a distance. The
              // hidden-view case is handled at the pick instead: renderScene publishes the
              // visible view's framebuffer name and the pick above prefers it.
              gl.viewport(__rx, H - __ry - __rh, __rw, __rh);
              gl.uniform1f(p.flip, 1.0);   // GL-rendered y-up: invert sampling so the nav
              // cube sits top-right, top faces shade light, and labels read forward
              gl.bindTexture(gl.TEXTURE_2D, wtex);
              gl.drawArrays(gl.TRIANGLES, 0, 6);
              // Counted, because 'the viewport is black' has been THREE different
              // bugs today and every one of them left this draw un-run while every
              // other number in this pass looked healthy. A frame count says the
              // compositor is alive; only this says the 3D layer is in the frame.
              window.__fcWidgetDrawn = (window.__fcWidgetDrawn || 0) + 1;
            }
            gl.viewport(0, 0, W, H);
            gl.uniform1f(p.flip, 0.0);   // QImage upload: already top-left origin
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindTexture(gl.TEXTURE_2D, ui);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.disable(gl.BLEND);
            if (gl._fcBF) gl.blendFuncSeparate(gl._fcBF[0], gl._fcBF[1], gl._fcBF[2], gl._fcBF[3]);
            keepValid = true;             // this frame is complete and safe to re-present
          }
          // ?presentlog=1 only: what did this frame's composite actually LOOK like? Draw
          // counts cannot see a frame that is drawn correctly from a texture Qt has not
          // filled yet -- that frame is published, and it is black. Sample our own
          // composite (never the canvas: no preserveDrawingBuffer) and record the mean
          // luminance so a black frame is a number rather than a report.
          if (PLOG && keepValid && PLOG.length) {
            try {
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, keepFbo);
              var __px = new Uint8Array(64);
              gl.readPixels((W >> 1) - 2, (H >> 1) - 2, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, __px);
              var __s = 0;
              for (var __q = 0; __q < 64; __q += 4) { __s += __px[__q] + __px[__q+1] + __px[__q+2]; }
              PLOG[PLOG.length - 1].lum = Math.round(__s / 16 / 3);
              // Within half a second of a click, a 4x4 grid of samples across the 3D rect
              // as well: a wrong picture in the viewport (the whole window drawn into it)
              // moves these while the centre pixel can stay the same.
              var __lc = window.__fcLastClick || 0, __rr = window.__fcWidgetRect;
              if (__rr && performance.now() - __lc < 500) {
                var __g = [], __p1 = new Uint8Array(4), __cv2 = gl.canvas, __sx2 = W / (__cv2.clientWidth || W), __sy2 = H / (__cv2.clientHeight || H);
                for (var __j = 0; __j < 4; __j++) for (var __i = 0; __i < 4; __i++) {
                  var __x = Math.round((__rr[0] + __rr[2] * (__i + 0.5) / 4) * __sx2), __y = H - Math.round((__rr[1] + __rr[3] * (__j + 0.5) / 4) * __sy2);
                  gl.readPixels(__x, __y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, __p1); __g.push(((__p1[0] >> 4) << 8) | ((__p1[1] >> 4) << 4) | (__p1[2] >> 4)); }
                PLOG[PLOG.length - 1].grid = __g.map(function (v) { return v.toString(16).padStart(3, '0'); }).join(' ');
              }
            } catch (e) { PLOG[PLOG.length - 1].lum = -1; }
          }
          // Present whenever we hold a complete frame -- which, after the first one, is
          // every frame. The canvas is alpha:false + preserveDrawingBuffer:false, so a
          // frame that draws NOTHING is composited as solid black; there is never a good
          // reason to leave it undrawn once there is something to show.
          if (keepValid) {
            // Textured quad, not glBlitFramebuffer: the canvas default framebuffer is
            // multisampled (antialias), and a blit INTO a multisampled buffer is
            // INVALID_OPERATION -- silent, and the whole window went black (2026-09-02).
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.viewport(0, 0, W, H);
            gl.uniform1f(p.flip, 1.0);   // our composite is GL-rendered: y-up
            gl.bindTexture(gl.TEXTURE_2D, keepTex);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (window.__fcCaptureReq) {
              // fc_screenshot: read back what was JUST presented, from the default
              // framebuffer and in the same task as the quad -- before the browser
              // invalidates it (the canvas has no preserveDrawingBuffer). Never through
              // FreeCAD's offscreen saveImage, which has a measured bug where that render
              // corrupts the live viewport's material state.
              //
              // region 'window' is the whole frame -- tree, property editor, task panel.
              // 'viewport' crops to the 3D widget's on-screen rect, which only Qt knows
              // and publishes as FCRECT; without one yet, it honestly returns the frame.
              var __req = window.__fcCaptureReq; window.__fcCaptureReq = null;
              try {
                var __px = new Uint8Array(W * H * 4);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, __px);
                var __crop = null, __R = window.__fcWidgetRect, __cv = gl.canvas;
                if (__req.region !== 'window' && __R && __R.length === 4 && __R[2] > 10 && __R[3] > 10) {
                  var __sx = W / (__cv.clientWidth || W), __sy = H / (__cv.clientHeight || H);
                  __crop = [Math.max(0, Math.round(__R[0] * __sx)), Math.max(0, Math.round(__R[1] * __sy)),
                            Math.min(W, Math.round(__R[2] * __sx)), Math.min(H, Math.round(__R[3] * __sy))];
                }
                __req.done(W, H, __px, __crop);
              } catch (__ex) { try { __req.done(0, 0, new Uint8Array(0), null); } catch (_) {} }
            }
          }
          gl.useProgram(sProg); gl.bindVertexArray(sVao);
          gl.activeTexture(sAct); gl.bindTexture(gl.TEXTURE_2D, sTex);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sDraw);
          gl.viewport(sVp[0], sVp[1], sVp[2], sVp[3]);
          if (sScis) gl.enable(gl.SCISSOR_TEST);
          if (sDep) gl.enable(gl.DEPTH_TEST);
          if (sBl) gl.enable(gl.BLEND);
          window.__fcPresented = (window.__fcPresented || 0) + 1;
          presentOtherWindows(gl);
        } catch (ex) { window.__fcPresentErr = String(ex); }
        inPresent = false;
      }
      // Both registries are closure-private, so a leak in them is unobservable from
      // outside -- which is how the REG one survived. One accessor makes it checkable:
      // open and close documents, call this, and the numbers must come back down.
      // WHAT IS ACTUALLY IN THE FRAMEBUFFER THIS PASS PRESENTS?
      //
      // Four attempts at 'the viewport shows the previous document' have now died on the
      // same gap: every instrument reported which framebuffer was chosen and how often it
      // was copied, and none reported its CONTENT. Coin draws the new document into fb2,
      // the bridge copies fb2, and the screen shows neither -- a set of facts that cannot
      // all be true, so one of the measurements is describing something other than what I
      // think it is. This reads the source directly and reports its dominant colours, which
      // separates upstream (the framebuffer really holds the old scene) from downstream
      // (it holds the new one and the copy or the quad loses it).
      window.__fcProbeSrc = function () {
        var e = BR.src;
        if (!e || !e.gl || !e.fb) return { error: 'no source framebuffer picked yet' };
        var sz = e.tex && e.tex.__fcSz;
        if (!sz) return { error: 'source has no recorded size' };
        // Through the context that DRAWS, not the one that created it, and only if the
        // bind takes -- reading through the creating context is what made this report
        // byte-identical content for three different documents.
        var g = e.drewGl || e.gl, W = Math.min(sz[0], 640), H = Math.min(sz[1], 360);
        try {
          var prev = g.getParameter(g.READ_FRAMEBUFFER_BINDING);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, e.fb);
          if (g.getParameter(g.READ_FRAMEBUFFER_BINDING) !== e.fb) {
            g.bindFramebuffer(g.READ_FRAMEBUFFER, prev);
            return { error: 'bind refused: this framebuffer belongs to another context' };
          }
          var buf = new Uint8Array(W * H * 4);
          g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, buf);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, prev);
          var hist = {}, i, k;
          for (i = 0; i < buf.length; i += 64) {
            k = buf[i] + ',' + buf[i + 1] + ',' + buf[i + 2];
            hist[k] = (hist[k] || 0) + 1;
          }
          var keys = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; });
          return { size: [W, H], distinct: keys.length,
                   top: keys.slice(0, 5).map(function (x) { return x + ' x' + hist[x]; }) };
        } catch (err) { return { error: String(err).slice(0, 120) }; }
      };
      // A CONTEXT QT DESTROYED IS RELEASED HERE TOO. The glue calls this from
      // GL.deleteContext. The browser reclaims a WebGL context only when nothing holds
      // it, and REG/UPL/lastUi/lastBlit hold framebuffers and textures that hold the
      // context: measured 2026-09-11, one live 1x1 context per closed document, forever,
      // and Chrome evicts the oldest at 16 -- the visible view. Drop every reference.
      window.__fcContextDeleted = function (gl) {
        try {
          var k, e, n = 0;
          var ve = window.__fcVisibleFbo && REG[window.__fcVisibleFbo];
          var visGone = !!(ve && (ve.gl === gl || ve.drewGl === gl));
          for (k in REG) { e = REG[k]; if (e && (e.gl === gl || e.drewGl === gl)) { if (e.tex) e.tex.__fcDead = true; delete REG[k]; n++; } }
          for (var i = UPL.length - 1; i >= 0; i--) { if (UPL[i] && UPL[i].__fcGl === gl) { UPL[i].__fcDead = true; UPL.splice(i, 1); } }
          if (lastUi && lastUi.__fcGl === gl) lastUi = null;
          if (lastBlit && lastBlit.gl === gl) lastBlit = null;
          if (BR && BR.src && BR.src.gl === gl) BR.src = null;
          if (BR && BR.gl === gl) { BR.gl = null; BR.tex = null; BR.buf = null; }
          // The bridge canvas belongs to the source context; a closed view takes it along.
          if (BR && BR.cv && gl.canvas === BR.cv) BR.cv = null;
          try { delete gl.__fcPresProg; } catch (e2) {}
          // And the 3D layer itself: renderScene published the rect and the visible
          // framebuffer for the view that just died and nothing else ever resets them, so
          // the pass kept compositing the last frame over the Start page after the document
          // closed (reported 2026-09-11: 'frozen, still showing the engine block'). The next
          // visible view republishes both on its first frame.
          //
          // ONLY when the dead context is the one behind the visible view. Every top-level
          // Qt window has a context of its own -- the Preferences dialog included -- and
          // clearing here on any deletion left the viewport black after that dialog closed:
          // nothing had changed in the view, so Qt repainted nothing, and the page had no
          // rect to composite (measured 2026-09-13: drawn stuck, rect null, 95% dark until
          // the next mouse drag).
          if (visGone) { window.__fcWidgetRect = null; window.__fcVisibleFbo = null; }
          window.__fcCtxReleased = (window.__fcCtxReleased || 0) + 1;
        } catch (e3) { window.__fcCtxReleaseErr = String(e3); }
      };
      // Diagnostic: RGBA of the current UI layer texture at canvas pixel (x, y), top-left
      // origin. Reads through a scratch framebuffer on the UI texture's own context.
      window.__fcUiPixel = function (x, y) {
        try {
          var ui = lastUi; if (!ui) return null;
          var g = ui.__fcGl; if (!g) return null;
          var fb = g.createFramebuffer(), prev = g.getParameter(g.READ_FRAMEBUFFER_BINDING);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, fb);
          g.framebufferTexture2D(g.READ_FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, ui, 0);
          var px = new Uint8Array(4); g.readPixels(x, (ui.__fcSz ? ui.__fcSz[1] : g.drawingBufferHeight) - 1 - y, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, prev); g.deleteFramebuffer(fb);
          return { rgba: Array.from(px), size: ui.__fcSz || null, err: g.getError() };
        } catch (e) { return { error: String(e) }; }
      };
      // Diagnostic: RGBA of the visible 3D view's colour texture at texture pixel (x, y),
      // top-left origin of the VIEW (the texture is GL y-up; flipped here).
      window.__fcWidgetPixel = function (x, y) {
        try {
          var e = window.__fcVisibleFbo && REG[window.__fcVisibleFbo]; if (!e || !e.tex) return null;
          var g = e.gl; if (!g) return null;
          var fb = g.createFramebuffer(), prev = g.getParameter(g.READ_FRAMEBUFFER_BINDING);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, fb);
          g.framebufferTexture2D(g.READ_FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, e.tex, 0);
          var h = window.__fcCoinH || 0;
          var px = new Uint8Array(4); g.readPixels(x, h ? h - 1 - y : y, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
          g.bindFramebuffer(g.READ_FRAMEBUFFER, prev); g.deleteFramebuffer(fb);
          return { rgba: Array.from(px), size: [window.__fcCoinW || 0, h], err: g.getError() };
        } catch (ex) { return { error: String(ex) }; }
      };
      window.__fcPresentStats = function () {
        // The SIZES too. A count cannot tell you WHICH framebuffer the widget quad
        // draws from, and picking the wrong one puts the wrong picture in the
        // viewport with every other number in this pass still looking healthy.
        var n = 0, k, fbs = [], e;
        for (k in REG) { n++; e = REG[k];
          // blitFrom AND the id, not just blitTo. The source stamp is what selects the
          // framebuffer this pass presents, so a report that omits it cannot answer the
          // one question that matters when the viewport shows the wrong document.
          fbs.push({ id: k,
                     sz: (e.tex && e.tex.__fcSz) || null,
                     blitAge: e.blitTo ? Math.round(performance.now() - e.blitTo) : null,
                     srcAge: e.blitFrom ? Math.round(performance.now() - e.blitFrom) : null,
                     drewAge: e.drewAt ? Math.round(performance.now() - e.drewAt) : null,
                     picked: (BR.src === e) }); }
        return { reg: n, upl: UPL.length, presented: window.__fcPresented || 0,
                 fbs: fbs, rect: window.__fcWidgetRect || null };
      };
      requestAnimationFrame(present);
      console.log('[fcweb] page present pass armed (threaded-Qt compose never executes its present)');
    })();

    // --- ?fps=1: live frame-rate overlay ------------------------------------------------
    // The only place a frame-rate complaint can be measured is the user's own browser: a
    // hidden/background tab never fires requestAnimationFrame, so Qt falls back to
    // setTimeout(0) pacing and any harness reads a rate that is not the user's. This
    // shows, once a second: rAF ticks/s (display pacing), scene frames/s (frames that
    // drew the model), ms spent per scene frame, GL calls per scene frame, and the total
    // ms of main-thread stalls over 50 ms (PerformanceObserver 'longtask'). Read it
    // while rotating. Debug only; zero cost unless the flag is present.
    (function () {
      if (!new URLSearchParams('').has('fps')) return;
      var P2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
      if (!P2) return;
      var s = { raf: 0, scene: 0, sceneMs: 0, calls: 0, sceneCalls: 0, stallMs: 0, inScene: 0 };
      Object.getOwnPropertyNames(P2).forEach(function (k) {
        var d = Object.getOwnPropertyDescriptor(P2, k);
        if (!d || typeof d.value !== 'function' || k === 'constructor') return;
        var o = d.value;
        P2[k] = function () { s.calls++; return o.apply(this, arguments); };
      });
      var oDE = P2.drawElements, oDA = P2.drawArrays;
      // a "scene frame" is any callback that issued a big draw (> 20k vertices)
      P2.drawElements = function (m, c) { if (c > 20000) s.inScene = 1; return oDE.apply(this, arguments); };
      P2.drawArrays   = function (m, f, c) { if (c > 20000) s.inScene = 1; return oDA.apply(this, arguments); };
      function timed(fn) {
        return function () {
          var c0 = s.calls, a = performance.now(); s.inScene = 0;
          try { return fn.apply(this, arguments); }
          finally { if (s.inScene) { s.scene++; s.sceneMs += performance.now() - a; s.sceneCalls += s.calls - c0; } }
        };
      }
      var oST = window.setTimeout, oRAF = window.requestAnimationFrame;
      window.setTimeout = function (cb) { var a = Array.prototype.slice.call(arguments); if (typeof cb === 'function') a[0] = timed(cb); return oST.apply(window, a); };
      window.requestAnimationFrame = function (cb) { return oRAF.call(window, timed(cb)); };
      try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { s.stallMs += e.duration; }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
      (function tick() { s.raf++; oRAF.call(window, tick); })();
      var el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;background:rgba(0,0,0,.75);color:#9f9;font:12px/1.4 monospace;padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre';
      document.body.appendChild(el);
      var canvasPx = function () { try { var h = document.querySelector('#qt-shadow-container'); var r = (h && h.shadowRoot) || document; var c = Array.prototype.slice.call(r.querySelectorAll('canvas')).sort(function (a, b) { return b.width * b.height - a.width * a.height; })[0]; return c ? c.width + 'x' + c.height : '?'; } catch (e) { return '?'; } };
      oST.call(window, function loop() {
        window.__fpsStats = { raf: s.raf, scene: s.scene, msPerFrame: s.scene ? +(s.sceneMs / s.scene).toFixed(1) : null,
                              glCallsPerFrame: s.scene ? Math.round(s.sceneCalls / s.scene) : null,
                              stallMs: Math.round(s.stallMs), hidden: document.hidden, t: Date.now() };
        el.textContent = 'rAF ' + s.raf + '/s   scene frames ' + s.scene + '/s   '
          + (s.scene ? (s.sceneMs / s.scene).toFixed(1) : '-') + ' ms/frame   '
          + (s.scene ? Math.round(s.sceneCalls / s.scene) : '-') + ' GL calls/frame\n'
          + 'stalls >50ms: ' + Math.round(s.stallMs) + ' ms/s   canvas ' + canvasPx()
          + '   dpr ' + devicePixelRatio + '   ' + (document.hidden ? 'HIDDEN' : 'visible');
        s.raf = 0; s.scene = 0; s.sceneMs = 0; s.sceneCalls = 0; s.stallMs = 0;
        oST.call(window, loop, 1000);
      }, 1000);
    })();

    // --- Readable window decorations -------------------------------------------------
    // Qt-wasm draws each top-level window's frame as DOM inside #qt-shadow-container's
    // shadow root (.qt-decorated-window > .title-bar > .window-name), styled by Qt's own
    // stylesheet. Its defaults are unusable over FreeCAD's dark theme: the title text is
    // #dddddd while the frame behind it is #d3d3d3 — a ~1.06:1 contrast ratio, i.e. the
    // dialog title is invisible ("Active Body Required" reads as a blank bar). The same
    // light frame is what shows as the big grey slab around a dialog before its canvas
    // paints. Restyle the decoration to match the app's dark theme and give the title real
    // contrast. Shadow DOM is isolated, so page CSS can't reach it — inject a stylesheet
    // into the shadow root itself.
    (function(){
      var CSS = [
        '.qt-decorated-window { background-color:#31363b !important;',
        '  border:1px solid #21262b !important; border-radius:4px !important; }',
        '.title-bar { background-color:#3a4046 !important; height:22px !important;',
        '  padding:2px 4px 4px 4px !important; border-bottom:1px solid #21262b !important; }',
        '.title-bar .window-name { color:#f2f4f6 !important; font-weight:600 !important;',
        "  font-family:'Segoe UI',system-ui,-apple-system,sans-serif !important; font-size:12px !important; }",
        // Qt marks unfocused windows .inactive — keep those legible too, just dimmer.
        '.qt-decorated-window.inactive .title-bar { background-color:#33383d !important; }',
        '.qt-decorated-window.inactive .title-bar .window-name { color:#c2c8ce !important; }',
        // the close/max glyphs are dark-on-dark by default
        '.title-bar .image-button { filter:invert(92%) !important; opacity:.9 !important; }'
      ].join('\n');
      function inject(){
        var host=document.getElementById('qt-shadow-container');
        if(!host || !host.shadowRoot) return false;
        if(host.shadowRoot.getElementById('fcweb-decor')) return true;
        var st=document.createElement('style'); st.id='fcweb-decor'; st.textContent=CSS;
        host.shadowRoot.appendChild(st);
        console.log('[fcweb] window decoration style injected');
        return true;
      }
      if(!inject()){ var iv=setInterval(function(){ if(inject()) clearInterval(iv); },300);
        setTimeout(function(){ clearInterval(iv); },120000); }
    })();
  })();
})();
