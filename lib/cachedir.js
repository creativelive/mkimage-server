var fs = require('fs-ext'),
  log = require('sslog'),
  path = require('path'),
  request = require('request'),
  crypto = require('crypto'),
  mkdirp = require('mkdirp'),
  sprintf = require('util').format;

function md5(string, callback) {
  if (typeof callback !== 'function') callback = function() {};
  callback(crypto.createHash('md5').update(string).digest('hex'));
}

// constructor
var Cachedir = function(config) {
  config = config || {};
  this.cache_dir = config.cache_dir || '/tmp/mkimage-' + process.pid;
};

/**
 * generates a path from filename string.
 * the path is generated using the first 4 carachters of the filename
 *
 * e.g.: this_is_a_filename.txt will become - <cache_dir>/t/h/i/s/this_is_a_filename.txt
 * where cache_dir, is the configured dir for caches. The returned callback will have 2 params:
 *   string  - full path for the cached file
 *   boolean - if the cached file already exists or not
 */
Cachedir.prototype.get_cached_path = function(filename, callback) {
  if (typeof filename !== 'string') throw new TypeError('first argument must be a string');
  if (typeof callback !== 'function') callback = function() {};

  var file = path.basename(filename),
    dir = file.substr(0, 4).split('').join('/'),
    dest = sprintf('%s/%s/%s', this.cache_dir, dir, file);

  fs.exists(dest, function(exists) {
    callback(dest, exists);
  });
};

/**
 * downloads a file from given url and save it in cache dir
 * the cache name is based on md5 of the url
 */
Cachedir.prototype.download = function(url, force, callback) {
  var self = this;

  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  md5(url, function(hash) {
    // get cached path
    self.get_cached_path(hash, function(output_file, exists) {
      if (exists && !force) {
        // see if the downloaded file is ready to be serverd
        fs.open(output_file, 'r', function(err, fd) {
          // try to aquire SHARED lock (if can't means the file is still being downloaded)
          fs.flock(fd, 'shnb', function(err) {
            fs.close(fd, function() {
              if (err) {
                log.trace('couldn\'t lock ' + output_file + ', seems like the file is still being downloaded (' + err.message + ')');
                return setTimeout(function() {
                  self.download(url, force, callback);
                }, 0); // retry
              }

              log.verbose('the file "' + path.basename(output_file) + '" is already downloaded, skipping...');
              callback(null, output_file);
            });
          });
        });
      } else {
        mkdirp(path.dirname(output_file), function(err) {
          if (err) return callback(new Error(err));

          // prepare the writer for piping
          var writer = fs.createWriteStream(output_file, {
              flags: 'a'
            }),
            r;

          writer.on('open', function(fd) {
            // try to aquire EXCLUSIVE lock (cause we're writing to file)
            fs.flock(fd, 'exnb', function(err) {
              if (err) {
                log.trace('couldn\'t lock ' + output_file + ', while downloading (' + err.message + ')');
                return fs.close(fd, function() {
                  process.nextTick(function() {
                    self.download(url, force, callback);
                  }); // retry
                });
              }

              // just log it, useful when debugging
              log.verbose('locked ' + output_file + ', starting downloading...');

              // get the data
              r = request(url),

                // do not continue on download errors
                r.on('error', function(err) {
                  return fs.close(fd, function() {
                    fs.unlink(output_file);
                    callback(err);
                  });
                });

              r.on('response', function(res) {
                // do not continue if http status is not ok (200)
                if (res.statusCode !== 200) {
                  return fs.close(fd, function() {
                    fs.unlink(output_file);
                    callback(new Error('couldn\'t download from: ' + url + ', http error: ' + res.statusCode));
                  });
                }

                // if all fine, pipe to the destination
                r.pipe(writer);
              });
            });
          });

          writer.on('close', function() {
            log.info('downloaded file from: ' + url + ', saved to: ' + output_file);
            callback(null, output_file);
          });
        });
      }
    });
  });
};

/**
 * takes the source file path and saves it in the cache dir
 * the cache name is based on file basename (stupid, but works for my purposes)
 */
Cachedir.prototype.copy = function(source, force, callback) {
  var self = this;

  // make sure we have a proper callback passed
  if (typeof callback !== 'function') {
    callback = force;
    force = false;
  }

  // first check if the source is there
  fs.exists(source, function(exists) {
    if (!exists) return callback(new Error('path ' + source + ' doesn\'t exists'), null);

    // get cached path
    self.get_cached_path(source, function(dest, exists) {
      if (exists && !force) {
        log.info('the file "' + path.basename(dest) + '" is already in cache, skipping...');
        return callback(null, dest);
      } else {
        mkdirp(path.dirname(dest), function(err) {
          if (err) return callback(new Error(err), null);

          var reader = fs.createReadStream(source),
            writer = fs.createWriteStream(dest);

          reader.pipe(writer);
          reader.on('error', function(err) {
            return callback(err, null);
          });
          writer.on('close', function() {
            log.verbose('copied image from: ' + source + ', saved to: ' + dest);
            callback(null, dest);
          });
        });
      }
    });
  });
};

// export me baby ...
exports.create = function(config) {
  return new Cachedir(config);
};
