/**
 * imagemagick.js - image magick helper
 *
 * each method requires an object with options:
 *  - src:     path to source image
 *  - dst:     path to destination image
 *  - width:   width of resized image (or cropped image)
 *  - height:  height of resized image (or cropped image)
 *  - x:       x offset for cropping (default is 0)
 *  - y:       y offset for cropping (default to 0)
 *  - quality: quality of processed image, 1 to 100 (default is 92)
 *  - gravity: crop position, one of NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast (default is Center)
 */

var sprintf = require('util').format,
  log = require('sslog'),
  lru = require("lru-cache"),
  child = require('child_process');

// create lru cache for im_info responses
var im_info_lru = lru(10240); // 10240 max items

// add slashes to escaped characters
function addslashes(string) {
  return string.
  replace(/\\/g, '\\\\').
  replace(/\u0008/g, '\\b').
  replace(/\t/g, '\\t').
  replace(/\n/g, '\\n').
  replace(/\f/g, '\\f').
  replace(/\r/g, '\\r');
  //      replace(/'/g, '\\\'').
  //      replace(/"/g, '\\"');
}

// custom exec
function exec(command, options, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = options;
    options = null;
  }

  // if it still not a function, just create a dummy one
  if (typeof callback !== 'function') callback = function() {};

  var start = Date.now();
  child.exec(command, options, function(err, stdout, stderr) {
    callback(err, stdout, stderr);
    log.verbose(sprintf('executed: "%s", took: %d ms', addslashes(command), Date.now() - start));
  });
}

// get basic information about an image file
// also use lru cache to avoid spawning identify process each time
function im_info(file, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  // %z = depth, %m = type, %w = width, %h = height, %b = filesize in bytes, %f = filename
  var imcmd = 'identify -format "%m\n%z\n%w\n%h\n%b\n%f" ' + file,
    cached = im_info_lru.get(imcmd);

  if (cached && !force) {
    callback(null, cached);
  } else {
    exec(imcmd, function(err, stdout, stderr) {
      // do some sanity checks
      if (err) {
        return callback(err);
      }

      if (/^identify:/.test(stderr)) {
        return callback(new Error(stderr));
      }

      if (!stdout) {
        return callback(new Error('got empty output from "identify" command'));
      }

      var lines = stdout.split('\n'),
        info = {
          type: lines[0],
          depth: lines[1],
          width: lines[2],
          height: lines[3],
          size: lines[4],
          name: lines[5]
        };

      im_info_lru.set(imcmd, info); // save to cache
      callback(null, info);
    });
  }
}

// resize an image
function im_resize(options, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  if (!options.src || !options.dst) {
    return callback(new Error('src and dst must not be ommited'));
  }

  if (!options.width && !options.height) {
    return callback(new Error('one of width or height must be specified'));
  }

  // we deal only with numeric sizes
  if (isNaN(options.width) || isNaN(options.height)) {
    return callback(new Error('width/height must be numeric'));
  }

  // basic adjustment to width and height; the operators %, ^, and !
  options.adjustment = options.adjustment || '';

  // prepare width and height
  options.width = options.width || '';
  options.height = options.height || '';

  // default is 92 to avoid downsampling chroma channels
  options.quality = options.quality || 92;

  var imcmd = sprintf('convert %s -resize "%sx%s"%s -quality %d %s', options.src, options.width, options.height, options.adjustment, options.quality, options.dst);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(err);
    im_info(options.dst, force, callback);
  });
}

// crop an image
function im_crop(options, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  if (!options.src || !options.dst) {
    return callback(new Error('src and dst must not be ommited'));
  }

  if (!options.width || isNaN(options.width)) {
    return callback(new Error('width must be specified and must it be numeric'));
  }

  options.height = (!options.height || isNaN(options.height)) ? options.width : options.height;
  options.x = (!options.x || isNaN(options.x)) ? 0 : options.x;
  options.y = (!options.y || isNaN(options.y)) ? 0 : options.y;
  options.gravity = options.gravity || 'Center';

  // default is 92 to avoid downsampling chroma channels
  options.quality = options.quality || 92;

  var imcmd = sprintf('convert %s -gravity %s -crop %sx%s+%d+%d -quality %d %s', options.src, options.gravity, options.width, options.height, options.x, options.y, options.quality, options.dst);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(err);
    im_info(options.dst, force, callback);
  });

}

// resize without keeping aspect ratio
function im_stretch(options, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  if (!options.width || !options.height || options.width <= 0 || options.height <= 0) {
    return callback(new Error('both width and height must be specified, and must greater than 0'));
  }

  options.adjustment = '!';
  im_resize(options, force, callback);
}

// resize an image on smallest dimension to x, then crop center weighted
function im_chop(options, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  if (!options.src || !options.dst) {
    return callback(new Error('src and dst must not be ommited'));
  }

  if (!options.width && !options.height) {
    return callback(new Error('one of width or height must be specified'));
  }

  // we deal only with numeric sizes
  if (isNaN(options.width) || isNaN(options.height)) {
    return callback(new Error('width/height must be numeric'));
  }

  // basic adjustment to width and height; the operators %, ^, and !
  options.adjustment = options.adjustment || '';

  // prepare width and height
  options.width = options.width || '';
  options.height = options.height || '';

  // default is 92 to avoid downsampling chroma channels
  options.quality = options.quality || 92;

  // single line chop example aka scaledownandcrop scalencrop
  // convert myPhoto.jpg -resize 200x200^ -gravity Center -crop 200x200+0+0 +repage myThumb.png

  var imcmd = sprintf('convert %s -resize "%sx%s^" -gravity center -crop %sx%s+0+0 -quality %d %s', options.src, options.width, options.height, options.width, options.height, options.quality, options.dst);
  console.log(imcmd);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(err);
    im_info(options.dst, force, callback);
  });
}

// export all the stuff
module.exports = {
  info: im_info,
  crop: im_crop,
  resize: im_resize,
  stretch: im_stretch,
  chop: im_chop
};
