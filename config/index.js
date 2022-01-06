/*eslint no-process-exit:0 */
'use strict';
const fs = require('fs');
const {log} = require('../lib/logger')();
let config = require('../lib/config');

var configPath = process.env.CONFIG_PATH || './config/app.json';

// load default config options
config.load(configPath, function(err) {
  if (err) {
    log.error('Config: ' + err.message);
    process.exit(1);
  }

  config = config.mkimage;

  // set verbose level
  if (config.verbose) {
    log.level = 5;
  }

  if (config.work_dir) {
    fs.mkdirSync(config.work_dir, {recursive: true});
  }

  // prepare for SSL if enabled
  config.ssl = config.ssl || {};
  if (config.ssl.listen !== false) {
    // prepare and sanity for some of the SSL options
    try {
      if (config.ssl.ca) {
        if (!Array.isArray(config.ssl.ca)) {
          throw new Error('config.ssl.ca: must be and Array of string(s)');
        }

        config.ssl.ca = config.ssl.ca.map(function(ca) {
          return fs.readFileSync(ca);
        });
      }
      if (config.ssl.pfx) {
        config.ssl.pfx = fs.readFileSync(config.ssl.pfx);
      }
      if (config.ssl.key) {
        config.ssl.key = fs.readFileSync(config.ssl.key);
      }
      if (config.ssl.cert) {
        config.ssl.cert = fs.readFileSync(config.ssl.cert);
      }
    } catch (err) {
      log.warn('SSL won\'t be enabled.' + err.message);
      config.ssl.listen = false;
    }
  }
});

module.exports = config;
