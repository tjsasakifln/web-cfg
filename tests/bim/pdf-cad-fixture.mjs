// Generated PDF without external files. Dependencies reference literal PDF objects for regression coverage.
export function pdfCadFixture(){
  const stream=(dict,data)=>`<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
  const resources='/ColorSpace << /PatternRGB [/Pattern /DeviceRGB] >> /Font << /F1 6 0 R /F2 12 0 R >> /Pattern << /P1 7 0 R /P2 11 0 R >> /XObject << /Fx 8 0 R >> /Properties << /Oc 10 0 R >>';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [10 0 R] /D << /BaseState /ON /OFF [10 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << ${resources} >> /Contents 5 0 R >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [10 20 210 220] /Rotate 90 /UserUnit 2 /Resources << ${resources} >> /Contents 9 0 R >>`,
    stream('',`BT /F1 8 Tf 11 181 Td (\u005c301rea \u005c33012 \u005c261) Tj ET
q 10 30 90 130 re W n
BT /F1 9 Tf 30 130 Td (VISIVEL) Tj ET
BT /F1 9 Tf 120 130 Td (OCULTO-RECORTE) Tj ET
q BT /F1 9 Tf 3 Tr 30 140 Td (OCULTO-TR) Tj ET Q
/Pattern cs /P1 scn
20 35 m 85 35 l 85 90 l 60 90 l 60 75 l 20 75 l h 30 45 10 10 re f*
Q
q 0 1 -1 0 179 35 cm /Fx Do Q
/OC /Oc BDC 100 170 m 150 170 l S BT /F1 8 Tf 110 175 Td (OCULTO-OCG) Tj ET EMC
[4 3] 0 d 10 15 m 105 15 l S
q 0.2 0.4 0.6 rg 100 100 70 50 re 120 110 10 20 re f* Q
q 105 50 m 160 50 l 160 75 l h W n 0.7 g 100 40 80 50 re f Q
q /PatternRGB cs 0 0.5 0 /P2 scn 105 80 60 10 re f Q
BT /F2 10 Tf 111 164 Td (ABC) Tj ET`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    stream('/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 7 7] /XStep 7 /YStep 7 /Matrix [1 0 0 1 3 5] /Resources << >>','0.1 w 0 0 m 7 7 l S'),
    stream('/Type /XObject /Subtype /Form /BBox [0 0 50 35] /Resources << /Font << /F1 6 0 R >> >>',
      'BT /F1 8 Tf 1 15 Td (FORMA) Tj ET\nBT /F1 8 Tf 1 55 Td (OCULTO-FORMA) Tj ET\n1 1 m 49 34 l S'),
    stream('', '25 45 m 125 45 l S\nBT /F1 10 Tf 45 75 Td (FOLHA DOIS) Tj ET'),
    '<< /Type /OCG /Name (Camada desligada) >>',
    stream('/Type /Pattern /PatternType 1 /PaintType 2 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>','0 1 m 10 9 l S'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 13 0 R >>',
    stream('',`/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Fixture-UCS def /CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
3 beginbfchar
<41> <2205>
<42> <2081>
<43> <0394>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`),
  ];
  let pdf='%PDF-1.6\n',offsets=[0];
  objects.forEach((o,k)=>{offsets.push(pdf.length);pdf+=`${k+1} 0 obj\n${o}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf+=offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(pdf+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,'latin1');
}
