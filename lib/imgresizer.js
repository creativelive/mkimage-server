var fs = require('fs');
var url = require('url');
var log = require('sslog');
var path = require('path');
var minimatch = require('minimatch');
var sprintf = require('util').format;
var cachedir = require('./cachedir.js');
var imagemagick = require('./imagemagick');
var config = require('../config');

// create the new cache_dir instance to be used my image cache
var imgcache = cachedir.create({
  cache_dir: config.cache_dir,
  work_dir: config.work_dir
});

function logError(err) {
  var msg = err.toString();
  if (err.stack) {
    msg += ' err.stack=' + err.stack;
  }
  log.error(msg);
}

// constructor
var Imgresizer = function() {};

// will get called via connect
Imgresizer.prototype.handle = function(req, res, next) {
  isRequestValid(req, function(method) {
    if (!method) {
      log.warn('request ' + req.url + ' is not valid');
      return next();
    }

    // get query string from requests
    var params = req.query;

    console.log('PARAMS', params);
    // check that 'url' param was passeed
    if (!params.url) return res.send(400, 'missing a "url" parameter');

    // prepend http:// if not there already
    if (!url.parse(params.url).protocol) params.url = 'http://' + params.url;

    // proceed only if hostname was whitelisted
    var hostname = url.parse(params.url).hostname || '';
    isHostAllowed(hostname, function(err, allowed) {
      if (err) logError(err);
      if (!allowed) {
        log.warn('hostname ' + hostname + ' is not allowed');
        return res.send(401);
      }

      // afterl all check we ready to process the image URL
      processImage(req.query, method, function(err, output, info) {
        if (err.statusCode) {
          return res.send(err.statusCode, err.msg);
        } else {
          return res.send(500, err.msg);
        }

        // let's serve the image :)
        log.verbose(JSON.stringify(info));
        res.contentType('image/' + info.type.toLowerCase());
        res.sendfile(output, {
          maxAge: (config.cache_max_age || 2419200) * 1000
        }); // default is 28 days
      });
    });
  });
};

/**
 * Checks if the request should be processed by Imgresizer
 * if yes returns the requested method (resize, stretch or crop)
 */
function isRequestValid(req, callback) {
  if (typeof callback !== 'function') callback = function() {};

  var pattern, regex, path, method;

  // catch only GET/HEAD
  if (req.method != 'GET' && req.method != 'HEAD') return callback(false);

  pattern = '\/(chop|cache|resize|stretch|crop)\/?$';
  if (config.namespace) pattern = "\/" + config.namespace + pattern;

  regex = new RegExp('^' + pattern, 'i');
  path = url.parse(req.url).pathname || '';
  method = path.match(regex);
  callback(method ? method[1].toLowerCase() : false);
}

/**
 * Checks if the requested image URL has a whitelisted host
 * whitelist is an array of "glob" patterns
 * callback has boolean parameter.
 */
function isHostAllowed(hostname, callback) {
  var globs = config.allowed_hosts || [''];

  // some sanity
  if (typeof callback !== 'function') callback = function() {};
  if (!hostname) return callback(new Error('hostname must not be empty'), false);
  if (!Array.isArray(globs)) return callback(new TypeError('allowed_hosts option must be an array of glob patterns'), false);

  for (i = 0; i < globs.length; i++) {
    if (minimatch(hostname, globs[i])) return callback(null, true);
  }

  return callback(null, false);
}

/**
 * Takes original request query-string params and manipulation method, then processes it
 * - default method is 'resize'
 * - callback function gets the error
 */
function processImage(params, method, callback) {
  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = method;
    method = 'resize';
  }

  // if it still not a function, just create a dummy one
  if (typeof callback !== 'function') callback = function() {};

  // is it forced or not
  var force = params.force || false;
  if (force) log.verbose('forced request, ignoring any cached image url = ' + params.url);

  // download
  imgcache.download(params.url, force, function(err, downloaded_image) {
    if (err) {
      logError(err);
      callback(err);
      return;
    }

    // If method is 'cache' means we just want to download the image and cache it; no transformation.
    if (method === 'cache') {
      // NOTE! this method can be used to delete downloaded/cached images that are not valid image files.
      imagemagick.info(downloaded_image, force, function(err, info) {
        if (err) {
          fs.unlink(downloaded_image); // Do not keep invalid image files in cache
          logError(err);
          return callback(err);
        }
        callback(null, downloaded_image, info);
      });
      return;
    }

    // normalize query params
    var width = params.w || '';
    var height = params.h || '';
    var quality = params.q || 69; // 92 was the default but based on CL-4237 we decided to reduce the quality of jpeg compression for faster load
    var filename = sprintf('%s_%s_q%s_%sx%s', path.basename(downloaded_image), method, quality, width, height); // <img-name>_<method>_q<quality>_<width>x<height>

    imgcache.get_cached_path(filename, function(dest, exists) {
      if (exists && !force) {
        // We already have a cached transform; just return image info.
        imagemagick.info(dest, function(err, info) {
          if (err) {
            logError(err);
            callback(err);
            return;
          }
          log.verbose('The image "' + path.basename(dest) + '" is already converted and cached, skipping...');
          callback(null, dest, info);
        });
        return;
      }

      imgcache.get_working_path(filename, function(workingPath, workingExists) {
        imgcache.ensure_path(workingPath, function(err) {
          if (err) {
            logError(err);
            callback(err);
            return;
          }

          log.verbose('Transforming... src=' + downloaded_image + ', dst=' + workingPath);

          imagemagick[method]({
            src: downloaded_image,
            dst: workingPath,
            width: width,
            height: height,
            quality: quality
          }, force, function(err, info) {
            if (err) {
              logError(err);
              callback(err);
              return;
            }
            imgcache.promote_working_path_to_cache(workingPath, function(err, cachePath) {
              if (err) {
                logError(err);
                callback(err);
                return;
              }
              // Success! Return the full path to cached transform result and image info.
              callback(null, cachePath, info);
            });
          });
        });
      });
    });
  });
}

module.exports = new Imgresizer();
