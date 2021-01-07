/**
 * qrcode generator
 */

var url = require('url'),
  config = require('../config'),
  path = require('path'),
  QRCode = require('qrcode');


module.exports = function() {
  return function(req, res, next) {
    var pathname = url.parse(req.url).pathname || '',
      params = req.query;

    // if requesting a qr code, generate
    var pathparams = pathname.split('/');
    pathparams.shift(); //remote empty string
    if (/qrcode/.test(pathparams[0]) && params.code) {
      QRCode.toFile(path.join(config.work_dir, params.code), `${config.qrcode.appletv_endpoint}?code=${params.code}`, function (err) {
        if (err) {
          if (err.statusCode) {
            return res.send(500, err.msg);
          }
        }
        res.contentType('image/png');
        res.sendfile(path.join(config.work_dir, params.code));
      })
    } else {
      next();
    }
  };
};
