/**
 * Old API support (@lieldulev)
 */

var url     = require('url'),
    log     = require('sslog');

function maybe(val) {
  if(val == undefined) {
    return '';
  }
  return val;
}

module.exports = function() {
    return function(req, res, next){
        var path    = url.parse(req.url).pathname || '',
            params  = req.query;

        //console.log('we have an old api call test')
        //console.log(params)
        // process only /r requests
        if (!/^\/(fit|fill|crop)\/?/.test(path)) return next();

        //log.verbose('old api was hit, converting to new api...');
        console.log(path);
        if(/\/fit\/status\/?/.test(path)) {
          req.url = "/mkimage/status";
          return next();
        }

        // prepare size from new API
        var pathparams = path.split('/');
        pathparams.shift(); //remote empty string
        if (/fill/.test(pathparams[0]))
        {
            params.url = decodeURIComponent(pathparams[1]);
            params.w = pathparams[2];
            params.h = pathparams[3];
            req.url  = '/stretch';
        }
        else if(/fit/.test(pathparams[0]))
        {
        console.log(pathparams)
            params.url = decodeURIComponent(pathparams[1]);
            params.w = pathparams[2];
            params.h = maybe(pathparams[3]);
            req.url  = '/resize';
        }
        else if(/crop/.test(pathparams[0]))
        {
            params.url = decodeURIComponent(pathparams[1]);
            params.w = pathparams[2];
            params.h = pathparams[3];
            params.x = pathparams[4];
            params.y = pathparams[5];
            req.url  = '/crop';
        }

        // continue
        next();
    };
};
