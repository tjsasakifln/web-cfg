import test from 'node:test';
import assert from 'node:assert/strict';
import {csv,number} from '../assets/js/engineering-ui.mjs';
test('spreadsheet formulas are neutralized without changing signed numeric results',()=>{
  assert.equal(csv([[-3,3.5,' -3',' =HYPERLINK("https://example.org")','\t@SUM(1)','safe']]),'\uFEFF"-3";"3.5";"\' -3";"\' =HYPERLINK(""https://example.org"")";"\'\t@SUM(1)";"safe"');
});
test('numeric input rejects nonfinite values and ambiguous thousands separators',()=>{
  assert.equal(number('-3,25'),-3.25);
  assert.equal(number('1e3'),1000);
  for(const bad of ['','1.000,1','Infinity','3x'])assert.throws(()=>number(bad));
  assert.throws(()=>number('11','Escala',0,10));
});
