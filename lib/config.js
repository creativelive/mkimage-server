var fs = require('fs');

// reserved config options (regex pattern)
var reserved = /^(load|files)$/;

// constructor
var config = function() {
  this.files = []; // list of loaded configuration files
};

/**
 *
 *
 * @public
 * @method load
 * @param file {string} The file name
 * @param cb {function} The callback function to execute
 * @return {void}
 */
config.prototype.load = function(file, cb) {
  try {
    var data = fs.readFileSync(file, 'UTF-8'),
      json = JSON.parse(_jsonMinify(data));

    for (var o in json) {
      // ignore reserved config options
      if (reserved.test(o)) continue;

      // create property for each option
      this[o] = (typeof json[o] === 'object') ? _deepMerge(this[o] || '', json[o]) : json[o];
    }

    cb(null);

    // save the filename to the list of loaded files
    this.files.push(file);
  } catch (err) {
    cb(err);
  }
};

/**
 * _deepMerge() - merges the enumerable attributes of two objects deeply.
 * Extracted from: https://github.com/nrf110/deepmerge
 */
function _deepMerge(target, src) {
  var array = Array.isArray(src),
    dst = array && [] || {};

  if (array) {
    target = target || [];
    dst = dst.concat(target);
    src.forEach(function(e, i) {
      if (typeof e === 'object') {
        dst[i] = _deepMerge(target[i], e);
      } else {
        if (target.indexOf(e) === -1) {
          dst.push(e);
        }
      }
    });
  } else {
    if (target && typeof target === 'object') {
      Object.keys(target).forEach(function(key) {
        dst[key] = target[key];
      });
    }
    Object.keys(src).forEach(function(key) {
      if (typeof src[key] !== 'object' || !src[key]) {
        dst[key] = src[key];
      } else {
        if (!target[key]) {
          dst[key] = src[key];
        } else {
          dst[key] = _deepMerge(target[key], src[key]);
        }
      }
    });
  }

  return dst;
}

/**
 * _jsonMinify() - minifies blocks of JSON-like content into valid JSON by removing
 * all whitespace *and* comments.
 *
 * JSON parsers (like JavaScript's JSON.parse() parser) generally don't consider JSON
 * with comments to be valid and parseable. So, the intended usage is to minify
 * development-friendly JSON (with comments) to valid JSON before parsing.
 *
 * Author: Kyle Simpson (https://github.com/getify/JSON.minify)
 */
function _jsonMinify(json) {

  var tokenizer = /"|(\/\*)|(\*\/)|(\/\/)|\n|\r/g,
    in_string = false,
    in_multiline_comment = false,
    in_singleline_comment = false,
    tmp, tmp2, new_str = [],
    ns = 0,
    from = 0,
    lc, rc;

  tokenizer.lastIndex = 0;

  while (tmp = tokenizer.exec(json)) {
    lc = RegExp.leftContext;
    rc = RegExp.rightContext;
    if (!in_multiline_comment && !in_singleline_comment) {
      tmp2 = lc.substring(from);
      if (!in_string) {
        tmp2 = tmp2.replace(/(\n|\r|\s)*/g, "");
      }
      new_str[ns++] = tmp2;
    }
    from = tokenizer.lastIndex;

    if (tmp[0] == "\"" && !in_multiline_comment && !in_singleline_comment) {
      tmp2 = lc.match(/(\\)*$/);
      if (!in_string || !tmp2 || (tmp2[0].length % 2) === 0) { // start of string with ", or unescaped " character found to end string
        in_string = !in_string;
      }
      from--; // include " character in next catch
      rc = json.substring(from);
    } else if (tmp[0] == "/*" && !in_string && !in_multiline_comment && !in_singleline_comment) {
      in_multiline_comment = true;
    } else if (tmp[0] == "*/" && !in_string && in_multiline_comment && !in_singleline_comment) {
      in_multiline_comment = false;
    } else if (tmp[0] == "//" && !in_string && !in_multiline_comment && !in_singleline_comment) {
      in_singleline_comment = true;
    } else if ((tmp[0] == "\n" || tmp[0] == "\r") && !in_string && !in_multiline_comment && in_singleline_comment) {
      in_singleline_comment = false;
    } else if (!in_multiline_comment && !in_singleline_comment && !(/\n|\r|\s/.test(tmp[0]))) {
      new_str[ns++] = tmp[0];
    }
  }
  new_str[ns++] = rc;
  return new_str.join("");
}

// export me baby...
module.exports = new config();
