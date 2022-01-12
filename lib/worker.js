/**
 * worker.js - does the actual logic of the mkimage server
 *
 * this is the file which runs with cluster module
 * it can also be run as stand-alone like that (from project dir):
 *      NODE_ENV=production node lib/worker.js
 */
const https = require('https'),
  express = require('express'),
  oldapi = require('./oldapi'),
  qrcode = require('./qrcode'),
  imageResizer = require('./imgresizer'),
  imagemagick = require('./imagemagick'),
  config = require('../config'),
  app = express(),
  fs = require('fs'),
  path = require('path'),
  minimatch = require('minimatch'),
  uuid = require('uuid')

const logger = require('./logger')('mkimage-worker');
const log = logger.log;


const allowedOrigins = config.allowed_origins || [''];

// give a name to the worker process
process.title = 'mkimage: worker process';

var public_dir = __dirname + '/../public',
  access_log = config.access_log && require('fs').createWriteStream(config.access_log, {
    flags: 'a'
  }),
  access_log_format = config.access_log_format || 'default';

app.use(logger.logRequest);


/*
// load some middlewares
app.use(express.logger({
  stream: access_log || process.stdout,
  format: access_log_format
}));
app.use(express.responseTime());

 */
// Originally, server set cache header to maxAge of 2419200000 in ms (28 days); reduce to 1 minute
// so that robots.txt and other resources can be refreshed on a tighter cycle.
app.use(express.static(public_dir, {
  maxAge: 1000 * 60 * 1
}));

app.use(function(req, res, next) {
  res.header('Vary', 'Origin'); // make sure browser caches different results based on Origin header

  // return CORS headers when we get a request that has an Origin header
  var origin = req.headers.Origin || req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  for (var i = 0; i < allowedOrigins.length; i++) {
    if (minimatch(origin, allowedOrigins[i], {
        matchBase: true,
        nocase: true
      })) {
      res.header('Access-Control-Allow-Origin', origin);
      break;
    }
  }
  next();

});

app.use(oldapi()); // process old api
app.use(imageResizer);
app.use(qrcode());
app.use(logger.logError);

app.get('/mkimage/status', function(req, res) {
  res.send('ok');
});

// the 404 route
app.get('*', function(req, res) {
  res.status(404).send('not found');
});

// start serving
if (!module.parent) {
  // HTTP
  if (config.listen !== false) {
    const port = config.listen || 8000;
    app.listen(port, '0.0.0.0',
      () => {
        log.info({port}, `worker ${process.pid} listening on port ${port}`);
      });
  }

  // HTTPS
  if (config.ssl.listen !== false) https.createServer(config.ssl, app).listen(config.ssl.listen || 8443);
}

// And start a cleanup loop over the work directory; all workers will run the same loop which is ok - deleting
// orphaned in-flight work is idempotent and each worker's scan interval is randomized.

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Scan for dead files on an interval between 5 and 10 minutes (randomized to minimize overlap with other workers).
var cleanupMs = (5 + getRandomInt(0, 5)) * 60 * 1000;

// Expire working files that are 10 minutes old or older.
var maxAgeMs = 10 * 60 * 1000;

setInterval(function() {
  var now = new Date().getTime();
  fs.readdir(config.work_dir, function(err, files) {
    if (err) {
      log.error({err}, 'Work dir cleanup failed to readdir');
      if (err.code === 'ENOENT') {
        fs.mkdirSync(config.work_dir, {recursive: true});
      }
      return;
    }
    files.forEach(function(file) {
      var workingFile = path.join(config.work_dir, file);
      fs.stat(workingFile, function(err, stat) {
        if (err) {
          log.error({err}, 'Failed to stat file ' + file);
        }
        var ctime = new Date(stat.ctime).getTime();
        if (now - ctime > maxAgeMs) {
          fs.unlink(workingFile, function(err) {
            if (err) {
              log.warn({err}, 'Failed to delete expired working file ' + workingFile + ', now=' + now + ', ctime=' + ctime);
            } else {
              log.trace('Deleted expired working file ' + workingFile + ', now=' + now + ', ctime=' + ctime);
            }
          });
        }
      });
    });
  });
}, cleanupMs);
