/**
 * Old API support (@lieldulev)
 */

const url = require('url');
const {log} = require('./logger')('mkimage-oldapi');
const {BadRequestError} = require('./errors');
const config = require('../config');

function maybe(val) {
  if (val == undefined) {
    return '';
  }
  return val;
}

module.exports = function() {
  return function(req, res, next) {
    var path = url.parse(req.url).pathname || '',
      params = req.query;

    //console.log('we have an old api call test')
    //console.log(params)
    // process only /r requests
    let pattern = '\/(stretch|chop|fit|fill|crop)\/?';
    if (config.prefix) {
      pattern = '\/' + config.prefix + pattern;
    }
    const regex = new RegExp('^' + pattern);
    if (!regex.test(path)) return next();

    res.log.trace('old api was hit, converting to new api...');
    if (/\/fit\/status\/?/.test(path)) {
      req.url = "/mkimage/status";
      return next();
    }

    // prepare size from new API
    var pathparams = path.split('/');
    pathparams.shift(); //remote empty string
    if (config.prefix) {
      pathparams.shift();
    }
    var widthIndex = 2;
    if (!parseInt(pathparams[widthIndex])) {
      widthIndex = 3;
      params.f = pathparams[2];
    }
    params.w = pathparams[widthIndex];
    params.h = pathparams[widthIndex + 1];

    try {
      if (/fill/.test(pathparams[0])) {
        params.url = decodeURIComponent(pathparams[1]);
        req.url = '/stretch';
      } else if (/fit/.test(pathparams[0])) {
        params.url = decodeURIComponent(pathparams[1]);
        req.url = '/resize';
      } else if (/chop/.test(pathparams[0])) {
        params.url = decodeURIComponent(pathparams[1]);
        req.url = '/chop';
      } else if (/crop/.test(pathparams[0])) {
        params.url = decodeURIComponent(pathparams[1]);
        params.x = pathparams[widthIndex + 2];
        params.y = pathparams[widthIndex + 3];
        req.url = '/crop';
      } else if (/stretch/.test(pathparams[0])) {
        params.url = decodeURIComponent(pathparams[1]);
        params.x = pathparams[widthIndex + 2];
        params.y = pathparams[widthIndex + 3];
        req.url = '/stretch';
      }
    }
    catch (err) {
      return next(new BadRequestError('bad input'))
    }

    if (params.f && ['webp'].indexOf(params.f) < 0) {
      return next(new BadRequestError('unsupported file format'));
    }
    if (params.w && parseInt(params.w, 10) > 4000) {
      return next(new BadRequestError('width out of range'));
    }
    if (params.h && parseInt(params.h, 10) > 4000) {
      return next(new BadRequestError('height out of range'));
    }

    // continue
    next();
  };
};
