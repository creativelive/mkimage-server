var fs          = require('fs-ext'),
    url         = require('url'),
    log         = require('sslog'),
    path        = require('path'),
    minimatch   = require('minimatch'),
    sprintf     = require('util').format,
    cachedir    = require('./cachedir'),
    imagemagick = require('./imagemagick'),
    config      = require('../config');

// create the new cache_dir instance to be used my image cache
var imgcache = cachedir.create({cache_dir: config.cache_dir});

// constructor
var Imgresizer = function() { };

// will get called via connect
Imgresizer.prototype.handle = function(req, res, next) {
    isRequestValid(req, function(method) {
        if (!method) { log.warn('request ' + req.url + ' is not valid'); return next(); }

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
            if (err) log.error(err.stack);
            if (!allowed) { log.warn('hostname ' + hostname + ' is not allowed'); return res.send(401); }

            // afterl all check we ready to process the image URL
            processImage(req.query, method, function(err, output, info) {
                if (err) return res.send(500, err.message);

                // let's serve the image :)
                log.verbose(JSON.stringify(info));
                res.contentType('image/' + info.type.toLowerCase());
                res.sendfile(output, { maxAge: (config.cache_max_age || 2419200) * 1000 }); // default is 28 days
            });
        });
    });
};

/**
 * Checks if the request should be processed by Imgresizer
 * if yes returns the requested method (resize, stretch or crop)
 */
function isRequestValid(req, callback)
{
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
function isHostAllowed(hostname, callback)
{
    var globs = config.allowed_hosts || [''];

    // some sanity
    if (typeof callback !== 'function') callback = function() {};
    if (!hostname) return callback(new Error('hostname must not be empty'), false);
    if (!Array.isArray(globs)) return callback(new TypeError('allowed_hosts option must be an array of glob patterns'), false);

    for(i = 0; i < globs.length; i++)
    {
        if (minimatch(hostname, globs[i])) return callback(null, true);
    }

    return callback(null, false);
}

/**
 * Takes original request query-string params and manipulation method, then processes it
 * - default method is 'resize'
 * - callback function gets the error
 */
function processImage(params, method, callback)
{
    // make sure we have a proper callback passed
    if (typeof callback !== 'function') { callback = method; method = 'resize'; }

    // if it still not a function, just create a dummy one
    if (typeof callback !== 'function') callback = function() {};

    // is it forced or not
    var force = params.force || false;
    if (force) log.verbose('forced request, ignoring any caches image url = ' + params.url);

    // download
    imgcache.download(params.url, force, function(err, downloaded_image) {
        if (err) { log.error(err.stack); return callback(err); }

        // if method is 'cache' means we just want to download
        // the image and cache it, without resizing
        if (method === 'cache')
        {
            // just get the info of the image (without converting it)
            imagemagick.info(downloaded_image, force, function(err, info) {
                if (err)
                {
                    fs.unlink(downloaded_image); // do not keep unrecognisable files
                    log.error(err.stack);
                    return callback(err);
                }

                return callback(null, downloaded_image, info);
            });
        }
        else
        {
            // normalize query params
            var width    = params.w || '',
                height   = params.h || '',
                quality  = params.q || 92, // 92 is the default anyway
                filename = sprintf('%s_%s_q%s_%sx%s', path.basename(downloaded_image), method, quality, width, height); // <img-name>_<method>_q<quality>_<width>x<height>

            imgcache.get_cached_path(filename, function(dest, exists) {
                if (exists && !force)
                {
                    // see if the converted file is ready to be serverd
                    fs.open(dest, 'r', function(err, fd) {
                        // try to aquire SHARED lock (if can't means the file is still being converted)
                        fs.flock(fd, 'shnb', function(err) {
                            fs.close(fd, function() {
                                if (err)
                                {
                                    log.trace('couldn\'t lock ' + dest + ', seems like the file is still being converted (' + err.message + ')');
                                    return setTimeout(function() { processImage(params, method, callback); }, 0); // retry
                                }

                                // just get the info of the image (without converting it)
                                imagemagick.info(dest, function(err, info) {
                                    if (err) { log.error(err.stack); return callback(err); }

                                    log.verbose('the image "' + path.basename(dest) + '" seems to be already converted and cached, skipping...');
                                    callback(null, dest, info);
                                });
                            });
                        });
                    });
                }
                else
                {
                    // prepare file for converting, by opening it in write (append) mode
                    fs.open(dest, 'a', function(err, fd) {
                        // try to aquire EXCLUSIVE lock (cause we're writing to file)
                        fs.flock(fd, 'exnb', function(err) {
                            if (err)
                            {
                                log.trace('couldn\'t lock ' + dest + ', while converting (' + err.message + ')');
                                return fs.close(fd, function() {
                                    process.nextTick(function() { processImage(params, method, callback); }); // retry
                                });
                            }

                            // just log it, useful when debugging
                            log.verbose('locked ' + dest + ', starting converting...');

                            imagemagick[method]({ src: downloaded_image, dst: dest, width: width, height: height, quality: quality }, force, function(err, info) {
                                fs.close(fd, function() {
                                    if (err)
                                    {
                                        fs.unlink(dest);
                                        log.error(err.stack);
                                        return callback(err);
                                    }

                                    log.info('converted image: ' + downloaded_image + ', and saved to: ' + dest);
                                    callback(null, dest, info);
                                });
                            });
                        });
                    });
                }
            });
        }
    });
}

module.exports = new Imgresizer();

