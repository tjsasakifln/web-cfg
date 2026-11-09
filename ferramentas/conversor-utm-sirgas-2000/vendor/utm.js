// package/lib/constants/values.js
var HALF_PI = Math.PI / 2;
var EPSLN = 1e-10;
var D2R = 0.017453292519943295;
var FORTPI = Math.PI / 4;
var TWO_PI = Math.PI * 2;
var SPI = 3.14159265359;

// package/lib/common/sign.js
function sign_default(x) {
  return x < 0 ? -1 : 1;
}

// package/lib/common/adjust_lon.js
function adjust_lon_default(x, skipAdjust) {
  if (skipAdjust) {
    return x;
  }
  return Math.abs(x) <= SPI ? x : x - sign_default(x) * TWO_PI;
}

// package/lib/common/adjust_zone.js
function adjust_zone_default(zone, lon) {
  if (zone === void 0) {
    zone = Math.floor((adjust_lon_default(lon) + Math.PI) * 30 / Math.PI) + 1;
    if (zone < 0) {
      return 0;
    } else if (zone > 60) {
      return 60;
    }
  }
  return zone;
}

// package/lib/common/pj_enfn.js
var C00 = 1;
var C02 = 0.25;
var C04 = 0.046875;
var C06 = 0.01953125;
var C08 = 0.01068115234375;
var C22 = 0.75;
var C44 = 0.46875;
var C46 = 0.013020833333333334;
var C48 = 0.007120768229166667;
var C66 = 0.3645833333333333;
var C68 = 0.005696614583333333;
var C88 = 0.3076171875;
function pj_enfn_default(es) {
  var en = [];
  en[0] = C00 - es * (C02 + es * (C04 + es * (C06 + es * C08)));
  en[1] = es * (C22 - es * (C04 + es * (C06 + es * C08)));
  var t = es * es;
  en[2] = t * (C44 - es * (C46 + es * C48));
  t *= es;
  en[3] = t * (C66 - es * C68);
  en[4] = t * es * C88;
  return en;
}

// package/lib/common/pj_mlfn.js
function pj_mlfn_default(phi, sphi, cphi, en) {
  cphi *= sphi;
  sphi *= sphi;
  return en[0] * phi - cphi * (en[1] + sphi * (en[2] + sphi * (en[3] + sphi * en[4])));
}

// package/lib/common/pj_inv_mlfn.js
var MAX_ITER = 20;
function pj_inv_mlfn_default(arg, es, en) {
  var k = 1 / (1 - es);
  var phi = arg;
  for (var i = MAX_ITER; i; --i) {
    var s = Math.sin(phi);
    var t = 1 - es * s * s;
    t = (pj_mlfn_default(phi, s, Math.cos(phi), en) - arg) * (t * Math.sqrt(t)) * k;
    phi -= t;
    if (Math.abs(t) < EPSLN) {
      return phi;
    }
  }
  return phi;
}

// package/lib/projections/tmerc.js
function init() {
  this.x0 = this.x0 !== void 0 ? this.x0 : 0;
  this.y0 = this.y0 !== void 0 ? this.y0 : 0;
  this.long0 = this.long0 !== void 0 ? this.long0 : 0;
  this.lat0 = this.lat0 !== void 0 ? this.lat0 : 0;
  if (this.es) {
    this.en = pj_enfn_default(this.es);
    this.ml0 = pj_mlfn_default(this.lat0, Math.sin(this.lat0), Math.cos(this.lat0), this.en);
  }
}
function forward(p) {
  var lon = p.x;
  var lat = p.y;
  var delta_lon = adjust_lon_default(lon - this.long0, this.over);
  var con;
  var x, y;
  var sin_phi = Math.sin(lat);
  var cos_phi = Math.cos(lat);
  if (!this.es) {
    var b = cos_phi * Math.sin(delta_lon);
    if (Math.abs(Math.abs(b) - 1) < EPSLN) {
      return 93;
    } else {
      x = 0.5 * this.a * this.k0 * Math.log((1 + b) / (1 - b)) + this.x0;
      y = cos_phi * Math.cos(delta_lon) / Math.sqrt(1 - Math.pow(b, 2));
      b = Math.abs(y);
      if (b >= 1) {
        if (b - 1 > EPSLN) {
          return 93;
        } else {
          y = 0;
        }
      } else {
        y = Math.acos(y);
      }
      if (lat < 0) {
        y = -y;
      }
      y = this.a * this.k0 * (y - this.lat0) + this.y0;
    }
  } else {
    var al = cos_phi * delta_lon;
    var als = Math.pow(al, 2);
    var c = this.ep2 * Math.pow(cos_phi, 2);
    var cs = Math.pow(c, 2);
    var tq = Math.abs(cos_phi) > EPSLN ? Math.tan(lat) : 0;
    var t = Math.pow(tq, 2);
    var ts = Math.pow(t, 2);
    con = 1 - this.es * Math.pow(sin_phi, 2);
    al = al / Math.sqrt(con);
    var ml = pj_mlfn_default(lat, sin_phi, cos_phi, this.en);
    x = this.a * (this.k0 * al * (1 + als / 6 * (1 - t + c + als / 20 * (5 - 18 * t + ts + 14 * c - 58 * t * c + als / 42 * (61 + 179 * ts - ts * t - 479 * t))))) + this.x0;
    y = this.a * (this.k0 * (ml - this.ml0 + sin_phi * delta_lon * al / 2 * (1 + als / 12 * (5 - t + 9 * c + 4 * cs + als / 30 * (61 + ts - 58 * t + 270 * c - 330 * t * c + als / 56 * (1385 + 543 * ts - ts * t - 3111 * t)))))) + this.y0;
  }
  p.x = x;
  p.y = y;
  return p;
}
function inverse(p) {
  var con, phi;
  var lat, lon;
  var x = (p.x - this.x0) * (1 / this.a);
  var y = (p.y - this.y0) * (1 / this.a);
  if (!this.es) {
    var f = Math.exp(x / this.k0);
    var g = 0.5 * (f - 1 / f);
    var temp = this.lat0 + y / this.k0;
    var h = Math.cos(temp);
    con = Math.sqrt((1 - Math.pow(h, 2)) / (1 + Math.pow(g, 2)));
    lat = Math.asin(con);
    if (y < 0) {
      lat = -lat;
    }
    if (g === 0 && h === 0) {
      lon = 0;
    } else {
      lon = adjust_lon_default(Math.atan2(g, h) + this.long0, this.over);
    }
  } else {
    con = this.ml0 + y / this.k0;
    phi = pj_inv_mlfn_default(con, this.es, this.en);
    if (Math.abs(phi) < HALF_PI) {
      var sin_phi = Math.sin(phi);
      var cos_phi = Math.cos(phi);
      var tan_phi = Math.abs(cos_phi) > EPSLN ? Math.tan(phi) : 0;
      var c = this.ep2 * Math.pow(cos_phi, 2);
      var cs = Math.pow(c, 2);
      var t = Math.pow(tan_phi, 2);
      var ts = Math.pow(t, 2);
      con = 1 - this.es * Math.pow(sin_phi, 2);
      var d = x * Math.sqrt(con) / this.k0;
      var ds = Math.pow(d, 2);
      con = con * tan_phi;
      lat = phi - con * ds / (1 - this.es) * 0.5 * (1 - ds / 12 * (5 + 3 * t - 9 * c * t + c - 4 * cs - ds / 30 * (61 + 90 * t - 252 * c * t + 45 * ts + 46 * c - ds / 56 * (1385 + 3633 * t + 4095 * ts + 1574 * ts * t))));
      lon = adjust_lon_default(this.long0 + d * (1 - ds / 6 * (1 + 2 * t + c - ds / 20 * (5 + 28 * t + 24 * ts + 8 * c * t + 6 * c - ds / 42 * (61 + 662 * t + 1320 * ts + 720 * ts * t)))) / cos_phi, this.over);
    } else {
      lat = HALF_PI * sign_default(y);
      lon = 0;
    }
  }
  p.x = lon;
  p.y = lat;
  return p;
}
var names = ["Fast_Transverse_Mercator", "Fast Transverse Mercator"];
var tmerc_default = {
  init,
  forward,
  inverse,
  names
};

// package/lib/common/sinh.js
function sinh_default(x) {
  var r = Math.exp(x);
  r = (r - 1 / r) / 2;
  return r;
}

// package/lib/common/hypot.js
function hypot_default(x, y) {
  x = Math.abs(x);
  y = Math.abs(y);
  var a = Math.max(x, y);
  var b = Math.min(x, y) / (a ? a : 1);
  return a * Math.sqrt(1 + Math.pow(b, 2));
}

// package/lib/common/log1py.js
function log1py_default(x) {
  var y = 1 + x;
  var z = y - 1;
  return z === 0 ? x : x * Math.log(y) / z;
}

// package/lib/common/asinhy.js
function asinhy_default(x) {
  var y = Math.abs(x);
  y = log1py_default(y * (1 + y / (hypot_default(1, y) + 1)));
  return x < 0 ? -y : y;
}

// package/lib/common/gatg.js
function gatg_default(pp, B) {
  var cos_2B = 2 * Math.cos(2 * B);
  var i = pp.length - 1;
  var h1 = pp[i];
  var h2 = 0;
  var h;
  while (--i >= 0) {
    h = -h2 + cos_2B * h1 + pp[i];
    h2 = h1;
    h1 = h;
  }
  return B + h * Math.sin(2 * B);
}

// package/lib/common/clens.js
function clens_default(pp, arg_r) {
  var r = 2 * Math.cos(arg_r);
  var i = pp.length - 1;
  var hr1 = pp[i];
  var hr2 = 0;
  var hr;
  while (--i >= 0) {
    hr = -hr2 + r * hr1 + pp[i];
    hr2 = hr1;
    hr1 = hr;
  }
  return Math.sin(arg_r) * hr;
}

// package/lib/common/cosh.js
function cosh_default(x) {
  var r = Math.exp(x);
  r = (r + 1 / r) / 2;
  return r;
}

// package/lib/common/clens_cmplx.js
function clens_cmplx_default(pp, arg_r, arg_i) {
  var sin_arg_r = Math.sin(arg_r);
  var cos_arg_r = Math.cos(arg_r);
  var sinh_arg_i = sinh_default(arg_i);
  var cosh_arg_i = cosh_default(arg_i);
  var r = 2 * cos_arg_r * cosh_arg_i;
  var i = -2 * sin_arg_r * sinh_arg_i;
  var j = pp.length - 1;
  var hr = pp[j];
  var hi1 = 0;
  var hr1 = 0;
  var hi = 0;
  var hr2;
  var hi2;
  while (--j >= 0) {
    hr2 = hr1;
    hi2 = hi1;
    hr1 = hr;
    hi1 = hi;
    hr = -hr2 + r * hr1 - i * hi1 + pp[j];
    hi = -hi2 + i * hr1 + r * hi1;
  }
  r = sin_arg_r * cosh_arg_i;
  i = cos_arg_r * sinh_arg_i;
  return [r * hr - i * hi, r * hi + i * hr];
}

// package/lib/projections/etmerc.js
function init2() {
  if (!this.approx && (isNaN(this.es) || this.es <= 0)) {
    throw new Error('Incorrect elliptical usage. Try using the +approx option in the proj string, or PROJECTION["Fast_Transverse_Mercator"] in the WKT.');
  }
  if (this.approx) {
    tmerc_default.init.apply(this);
    this.forward = tmerc_default.forward;
    this.inverse = tmerc_default.inverse;
  }
  this.x0 = this.x0 !== void 0 ? this.x0 : 0;
  this.y0 = this.y0 !== void 0 ? this.y0 : 0;
  this.long0 = this.long0 !== void 0 ? this.long0 : 0;
  this.lat0 = this.lat0 !== void 0 ? this.lat0 : 0;
  this.k0 = this.k0 !== void 0 ? this.k0 : 1;
  this.cgb = [];
  this.cbg = [];
  this.utg = [];
  this.gtu = [];
  var f = this.es / (1 + Math.sqrt(1 - this.es));
  var n = f / (2 - f);
  var np = n;
  this.cgb[0] = n * (2 + n * (-2 / 3 + n * (-2 + n * (116 / 45 + n * (26 / 45 + n * (-2854 / 675))))));
  this.cbg[0] = n * (-2 + n * (2 / 3 + n * (4 / 3 + n * (-82 / 45 + n * (32 / 45 + n * (4642 / 4725))))));
  np = np * n;
  this.cgb[1] = np * (7 / 3 + n * (-8 / 5 + n * (-227 / 45 + n * (2704 / 315 + n * (2323 / 945)))));
  this.cbg[1] = np * (5 / 3 + n * (-16 / 15 + n * (-13 / 9 + n * (904 / 315 + n * (-1522 / 945)))));
  np = np * n;
  this.cgb[2] = np * (56 / 15 + n * (-136 / 35 + n * (-1262 / 105 + n * (73814 / 2835))));
  this.cbg[2] = np * (-26 / 15 + n * (34 / 21 + n * (8 / 5 + n * (-12686 / 2835))));
  np = np * n;
  this.cgb[3] = np * (4279 / 630 + n * (-332 / 35 + n * (-399572 / 14175)));
  this.cbg[3] = np * (1237 / 630 + n * (-12 / 5 + n * (-24832 / 14175)));
  np = np * n;
  this.cgb[4] = np * (4174 / 315 + n * (-144838 / 6237));
  this.cbg[4] = np * (-734 / 315 + n * (109598 / 31185));
  np = np * n;
  this.cgb[5] = np * (601676 / 22275);
  this.cbg[5] = np * (444337 / 155925);
  np = Math.pow(n, 2);
  this.Qn = this.k0 / (1 + n) * (1 + np * (1 / 4 + np * (1 / 64 + np / 256)));
  this.utg[0] = n * (-0.5 + n * (2 / 3 + n * (-37 / 96 + n * (1 / 360 + n * (81 / 512 + n * (-96199 / 604800))))));
  this.gtu[0] = n * (0.5 + n * (-2 / 3 + n * (5 / 16 + n * (41 / 180 + n * (-127 / 288 + n * (7891 / 37800))))));
  this.utg[1] = np * (-1 / 48 + n * (-1 / 15 + n * (437 / 1440 + n * (-46 / 105 + n * (1118711 / 3870720)))));
  this.gtu[1] = np * (13 / 48 + n * (-3 / 5 + n * (557 / 1440 + n * (281 / 630 + n * (-1983433 / 1935360)))));
  np = np * n;
  this.utg[2] = np * (-17 / 480 + n * (37 / 840 + n * (209 / 4480 + n * (-5569 / 90720))));
  this.gtu[2] = np * (61 / 240 + n * (-103 / 140 + n * (15061 / 26880 + n * (167603 / 181440))));
  np = np * n;
  this.utg[3] = np * (-4397 / 161280 + n * (11 / 504 + n * (830251 / 7257600)));
  this.gtu[3] = np * (49561 / 161280 + n * (-179 / 168 + n * (6601661 / 7257600)));
  np = np * n;
  this.utg[4] = np * (-4583 / 161280 + n * (108847 / 3991680));
  this.gtu[4] = np * (34729 / 80640 + n * (-3418889 / 1995840));
  np = np * n;
  this.utg[5] = np * (-20648693 / 638668800);
  this.gtu[5] = np * (212378941 / 319334400);
  var Z = gatg_default(this.cbg, this.lat0);
  this.Zb = -this.Qn * (Z + clens_default(this.gtu, 2 * Z));
}
function forward2(p) {
  var Ce = adjust_lon_default(p.x - this.long0, this.over);
  var Cn = p.y;
  Cn = gatg_default(this.cbg, Cn);
  var sin_Cn = Math.sin(Cn);
  var cos_Cn = Math.cos(Cn);
  var sin_Ce = Math.sin(Ce);
  var cos_Ce = Math.cos(Ce);
  Cn = Math.atan2(sin_Cn, cos_Ce * cos_Cn);
  Ce = Math.atan2(sin_Ce * cos_Cn, hypot_default(sin_Cn, cos_Cn * cos_Ce));
  Ce = asinhy_default(Math.tan(Ce));
  var tmp = clens_cmplx_default(this.gtu, 2 * Cn, 2 * Ce);
  Cn = Cn + tmp[0];
  Ce = Ce + tmp[1];
  var x;
  var y;
  if (Math.abs(Ce) <= 2.623395162778) {
    x = this.a * (this.Qn * Ce) + this.x0;
    y = this.a * (this.Qn * Cn + this.Zb) + this.y0;
  } else {
    x = Infinity;
    y = Infinity;
  }
  p.x = x;
  p.y = y;
  return p;
}
function inverse2(p) {
  var Ce = (p.x - this.x0) * (1 / this.a);
  var Cn = (p.y - this.y0) * (1 / this.a);
  Cn = (Cn - this.Zb) / this.Qn;
  Ce = Ce / this.Qn;
  var lon;
  var lat;
  if (Math.abs(Ce) <= 2.623395162778) {
    var tmp = clens_cmplx_default(this.utg, 2 * Cn, 2 * Ce);
    Cn = Cn + tmp[0];
    Ce = Ce + tmp[1];
    Ce = Math.atan(sinh_default(Ce));
    var sin_Cn = Math.sin(Cn);
    var cos_Cn = Math.cos(Cn);
    var sin_Ce = Math.sin(Ce);
    var cos_Ce = Math.cos(Ce);
    Cn = Math.atan2(sin_Cn * cos_Ce, hypot_default(sin_Ce, cos_Ce * cos_Cn));
    Ce = Math.atan2(sin_Ce, cos_Ce * cos_Cn);
    lon = adjust_lon_default(Ce + this.long0, this.over);
    lat = gatg_default(this.cgb, Cn);
  } else {
    lon = Infinity;
    lat = Infinity;
  }
  p.x = lon;
  p.y = lat;
  return p;
}
var names2 = ["Extended_Transverse_Mercator", "Extended Transverse Mercator", "etmerc", "Transverse_Mercator", "Transverse Mercator", "Gauss Kruger", "Gauss_Kruger", "tmerc"];
var etmerc_default = {
  init: init2,
  forward: forward2,
  inverse: inverse2,
  names: names2
};

// package/lib/projections/utm.js
var dependsOn = "etmerc";
function init3() {
  var zone = adjust_zone_default(this.zone, this.long0);
  if (zone === void 0) {
    throw new Error("unknown utm zone");
  }
  this.lat0 = 0;
  this.long0 = (6 * Math.abs(zone) - 183) * D2R;
  this.x0 = 5e5;
  this.y0 = this.utmSouth ? 1e7 : 0;
  this.k0 = 0.9996;
  etmerc_default.init.apply(this);
  this.forward = etmerc_default.forward;
  this.inverse = etmerc_default.inverse;
}
var names3 = ["Universal Transverse Mercator System", "utm"];
var utm_default = {
  init: init3,
  names: names3,
  dependsOn
};
export {
  utm_default as default,
  dependsOn,
  init3 as init,
  names3 as names
};
