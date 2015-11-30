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
		if (!/^\/(stretch|chop|fit|fill|crop)\/?/.test(path)) return next();

		//log.verbose('old api was hit, converting to new api...');
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
			params.url = decodeURIComponent(pathparams[1]);
			params.w = pathparams[2];
			params.h = maybe(pathparams[3]);
			req.url  = '/resize';
		}
		else if(/chop/.test(pathparams[0]))
		{
			params.url = decodeURIComponent(pathparams[1]);
			params.w = pathparams[2];
			params.h = pathparams[3];
			req.url  = '/chop';
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
		else if(/stretch/.test(pathparams[0]))
		{
			params.url = decodeURIComponent(pathparams[1]);
			params.w = pathparams[2];
			params.h = pathparams[3];
			params.x = pathparams[4];
			params.y = pathparams[5];
			req.url  = '/stretch';
		}

		if (params.w && parseInt(params.w, 10) > 4000) {
			res.status(400).send('Width too large');
			return;
		}
		if (params.h && parseInt(params.h, 10) > 4000) {
			res.status(400).send('Height too large');
			return;
		}

		// continue
		next();
	};
};
