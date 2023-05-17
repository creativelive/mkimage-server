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

const sprintf = require('util').format,
  {log, getDurationMilliseconds} = require('./logger')('imagemagick'),
  {AppError, BadRequestError, ServerError} = require('./errors'),
  lru = require("lru-cache"),
  child = require('child_process')
  playButtonPath = __dirname + '/../public/play-button.svg';

// create lru cache for im_info responses
const im_info_lru = new lru(10240); // 10240 max items

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
    log.trace(sprintf('executed: "%s", took: %d ms', addslashes(command), Date.now() - start));
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
  var imcmd = 'identify -quiet -precision 16 -format "%m\n%z\n%w\n%h\n%b\n%f" ' + file,
    cached = im_info_lru.get(imcmd);

  if (cached && !force) {
    callback(null, cached);
  } else {
    exec(imcmd, function(err, stdout, stderr) {
      // do some sanity checks
      if (err) {
        return callback(new ServerError('unable to identify', err));
      }

      if (/^identify:/.test(stderr)) {
        return callback(new ServerError('unexpected error', {result: stderr}));
      }

      if (!stdout) {
        return callback(new ServerError('got empty output from "identify" command'));
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

      try {
        let depth = parseInt(info.depth);
        let width = parseInt(info.width);
        let height = parseInt(info.height);
        let size = parseInt(info.size);

        if (!isNaN(depth)) {
          info.depth = depth;
        }
        if (!isNaN(width)) {
          info.width = width;
        }
        if (!isNaN(height)) {
          info.height = height;
        }
        if (!isNaN(size)) {
          info.size = size;
        }

      }
      catch (e) {
        // ignore
      }
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
    return callback(new BadRequestError('src and dst must not be omitted'));
  }

  if (!options.width && !options.height) {
    return callback(new BadRequestError('one of width or height must be specified'));
  }

  // we deal only with numeric sizes
  if (isNaN(options.width) || isNaN(options.height)) {
    return callback(new BadRequestError('width/height must be numeric'));
  }

  // basic adjustment to width and height; the operators %, ^, and !
  options.adjustment = options.adjustment || '';

  // prepare width and height
  options.width = options.width || '';
  options.height = options.height || '';

  // default is 92 to avoid downsampling chroma channels
  options.quality = options.quality || 92;

  let preformatted = 'magick %s -interlace Plane -resize "%sx%s"%s -quality %d ';
  if (options.format === 'webp') {
    preformatted += '-define webp:lossless=false ';
  }
  preformatted += '%s';
  const imcmd = sprintf(preformatted, options.src, options.width, options.height, options.adjustment, options.quality, options.dst);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(new ServerError('convert failed', err));
    if(options.overlay === 'play'){
      im_add_play_button(options, force, callback);
    } else {
      im_info(options.dst, force, callback);
    }
  });
}

// add play button to an image
function im_add_play_button(options, force, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // if it still not function, make a dummy function of it
  if (typeof callback !== 'function') callback = function() {};

  if (!options.dst) {
    return callback(new AppError('dst must not be omitted', 400));
  }

  var imcmd = sprintf('composite -gravity center -background none %s %s %s', playButtonPath, options.dst, options.dst);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(new ServerError('composite failed', err));
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
    return callback(new AppError('src and dst must not be omitted', 400));
  }

  if (!options.width || isNaN(options.width)) {
    return callback(new AppError('width must be specified and must it be numeric', 400));
  }

  options.height = (!options.height || isNaN(options.height)) ? options.width : options.height;
  options.x = (!options.x || isNaN(options.x)) ? 0 : options.x;
  options.y = (!options.y || isNaN(options.y)) ? 0 : options.y;

  // default is 92 to avoid downsampling chroma channels
  options.quality = options.quality || 92;
  var preformatted = 'magick %s -interlace Plane -gravity %s -crop %sx%s+%d+%d -quality %d ';
  if (options.format === 'webp') {
    preformatted += '-define webp:lossless=false ';
  }
  preformatted += '%s';
  var imcmd = sprintf(preformatted, options.src, options.gravity, options.width, options.height, options.x, options.y, options.quality, options.dst);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(new AppError(err, 500));
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
    return callback(new AppError('both width and height must be specified, and must greater than 0', 400));
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
    return callback(new AppError('src and dst must not be omitted', 400));
  }

  if (!options.width && !options.height) {
    return callback(new AppError('only one of width or height must be specified', 400));
  }

  // we deal only with numeric sizes
  if (isNaN(options.width) || isNaN(options.height)) {
    return callback(new AppError('width/height must be numeric', 400));
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

  var preformatted = 'magick %s -interlace Plane -resize "%sx%s^" -gravity center -crop %sx%s+0+0 -quality %d ';
  if (options.format === 'webp') {
    preformatted += '-define webp:lossless=false ';
  }
  preformatted += '%s';
  var imcmd = sprintf(preformatted, options.src, options.width, options.height, options.width, options.height, options.quality, options.dst);
  log.trace('executing command: ' + imcmd);
  exec(imcmd, function(err, stdout, stderr) {
    if (err) return callback(new ServerError(err));
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
