const fs = require('fs');
const url = require('url');
const {log, getDurationMilliseconds} = require('./logger')('resizer');
const {AppError, BadRequestError, ForbiddenError, GatewayTimeoutError, NotFoundError, ServerError} = require('./errors');
const path = require('path');
const minimatch = require('minimatch');
const sprintf = require('util').format;
const cachedir = require('./cachedir.js');
const imagemagick = require('./imagemagick');
let config = require('../config');

// create the new cache_dir instance to be used my image cache
var imgcache = cachedir.create({
  cache_dir: config.cache_dir,
  work_dir: config.work_dir
});


// will get called via connect
function imgresizer(req, res, next) {
  isRequestValid(req, (method) => {
    if (!method) {
//      log.warn('request ' + req.url + ' is not valid');
      return next();  // next middleware please
    }

    // get query string from requests
    var params = req.query;

    // check that 'url' param was passeed
    if (!params.url) return next(new BadRequestError('missing a "url" parameter'));

    // prepend http:// if not there already
    if (!url.parse(params.url).protocol) params.url = 'http://' + params.url;

    // proceed only if hostname was whitelisted
    var hostname = url.parse(params.url).hostname || '';

    isHostAllowed(hostname, (err, allowed) => {
      if (err) {
        res.log.error({err}, 'configuration error');
      }
      if (!allowed) {
        return next(new ForbiddenError(`hostname ${hostname} is not allowed`));
      }

      // afterl all check we ready to process the image URL
      processImage(req.query, method, res.log, (err, output, info) => {
        if (err) {
          return next(err);
        }
        // let's serve the image :)
        res.log.trace({info}, 'image info');
        res.info = info;
        res.contentType('image/' + info.type.toLowerCase());
        res.sendFile(output, {
          maxAge: (config.cache_max_age || 2419200) * 1000
        }); // default is 28 days
      });
    });
  });
}

/**
 * Checks if the request should be processed by Imgresizer
 * if yes returns the requested method (resize, stretch or crop)
 */
function isRequestValid(req, callback) {
    if (typeof callback !== 'function') callback = function () {
    };

    let pattern, regex, path, method;

    // catch only GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') return callback(false);

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


    let globs = config.allowed_hosts || [''];

    // some sanity
    if (typeof callback !== 'function') callback = function () {
    };
    if (!hostname) return callback(new Error('hostname must not be empty'), false);
    if (!Array.isArray(globs)) return callback(new TypeError('allowed_hosts option must be an array of glob patterns'), false);

    for (let i = 0; i < globs.length; i++) {
      if (minimatch(hostname, globs[i])) return callback(null, true);
    }

    return callback(null, false);
  }

  /**
   * Takes original request query-string params and manipulation method, then processes it
   * - default method is 'resize'
   * - callback function gets the error
   */
  function processImage(params, method, log, callback) {
    // make sure we have a proper callback passed
    if (typeof callback !== 'function') {
      callback = method;
      method = 'resize';
    }

    // if it still not a function, just create a dummy one
    if (typeof callback !== 'function') callback = function () {
    };

    // is it forced or not
    const force = params.force || config.disable_cache || false;
    if (force) log.trace('forced request, ignoring any cached image url = ' + params.url);

    // download
    imgcache.download(params.url, force, log, (err, downloaded_image, downloadExists) => {
      if (err) {
        if (err.code === 'ENOTFOUND') {
          err = new NotFoundError(err.message); // wrap error
        }
        else if (err.code === 'ETIMEDOUT') {
          err = new GatewayTimeoutError(err.message)
        }
        callback(err);
        return;
      }

      // If method is 'cache' means we just want to download the image and cache it; no transformation.
      if (method === 'cache') {
        // NOTE! this method can be used to delete downloaded/cached images that are not valid image files.
        imagemagick.info(downloaded_image, force, (err, info) => {
          if (err) {
            fs.unlink(downloaded_image); // Do not keep invalid image files in cache
            return callback(err);
          }
          callback(null, downloaded_image, info);
        });
        return;
      }

      // normalize query params
      var width = params.w || '';
      var height = params.h || '';
      var x = params.x || 0;
      var y = params.y || 0;
      var format = params.f || '';
      var quality = params.q || 69; // 92 was the default but based on CL-4237 we decided to reduce the quality of jpeg compression for faster load
      var overlay = params.overlay;
      var gravity = params.gravity;
      if (params.x === undefined || params.y === undefined) {
        gravity = params.gravity || 'Center';
      }

      var filename = sprintf('%s_%s_q%s_%sx%s%sox%soy', path.basename(downloaded_image), method, quality, width, height, x, y); // <img-name>_<method>_q<quality>_<width>x<height>

      if (overlay) {
        filename += '_' + overlay;
      }

      var extension = '';
      if (format) {
        filename += '_' + format;
      }
      imgcache.get_cached_path(filename, (dest, exists) => {
        if (exists && !force) {
          // We already have a cached transform; just return image info.
          imagemagick.info(dest, (err, info) => {
            if (err) {
              callback(err);
              return;
            }
            info.convertCache = 'hit';
            info.downloadCache = downloadExists? 'hit' : 'miss';
            log.trace('The image "' + path.basename(dest) + '" is already converted and cached, skipping...');
            callback(null, dest, info);
          });
          return;
        }
        if (format && format === 'webp') {
          // file doesn't seem to be saving as webp format if initial file doesn't have the extension
          extension = '.webp';
        }
        imgcache.get_working_path(filename, extension, (workingPath, workingExists) => {
          imgcache.ensure_path(workingPath, (err) => {
            if (err) {
              callback(new ServerError(err));
              return;
            }

            log.trace('Transforming... src=' + downloaded_image + ', dst=' + workingPath);
            const start = process.hrtime();
            imagemagick[method]({
              src: downloaded_image,
              dst: workingPath,
              width: width,
              height: height,
              quality: quality,
              gravity: gravity,
              overlay: overlay,
              format: format,
              x: x,
              y: y
            }, force, (err, info) => {
              if (err) {
                callback(err);
                return;
              }
              let dt = getDurationMilliseconds(start);
              info.convertCache = 'miss';
              info.downloadCache = downloadExists? 'hit' : 'miss';
              log.info({duration: dt, method, params, info}, 'successfully processed image!' )
              imgcache.promote_working_path_to_cache(workingPath, extension, (err, cachePath) => {
                if (err) {
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

module.exports = imgresizer;
