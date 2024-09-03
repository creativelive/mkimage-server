'use strict';
const bunyan = require('bunyan');
const { randomUUID } = require('crypto');

const {AppError, ServerError} = require('./errors');

function getDurationMilliseconds(start) {
  const NS_PER_SEC = 1e9; // convert to nanoseconds
  const NS_TO_MS = 1e6; // convert to milliseconds
  const diff = process.hrtime(start);
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
}
const fields = {
  name: 'mkimage',
  process: 'mkimage-server'
};

const appLog = bunyan.createLogger(fields);

function logger(service) {

  const log = service? appLog.child({service}) : appLog;

  const logError = (err, req, res, next) => {

    if (err instanceof AppError) {
      res.myError = err;
    }
    else {
      res.myError = new ServerError(err);
    }

    let code = res.myError.statusCode || 500;

    res.status(code).send(err.message || 'internal error');
  }

  const logRequest = (req, res, next) => {
    const start = process.hrtime();


    let requestId = req.header('x-request-id');

    if (!requestId) {
      requestId = randomUUID()
    }
    res.header('x-request-id', requestId);

    res.log = log.child({request_id: requestId})

    let logged = false;

    let remoteAddress = req.socket.remoteAddress;

    const doLogRequest = event => {
      if (logged) {
        return;
      }
      logged = true;
      let data = {
        request: {
          url: req.url,
          path: req.path,
          method: req.method,
          query: req.query,
          client_ip: remoteAddress
        },
        response: {
          statusCode: res.statusCode,
        },
        duration: getDurationMilliseconds(start),
        request_id: requestId
      };
      const xff = req.headers['x-forwarded-for'];
      if (xff) {
        data.request.xff = xff;
      }


      if (res.info) {
        data.info = res.info;
      }

      let message = `${req.method} ${req.url} -> ${res.statusCode}`;

      if (event !== 'finish') {
        message += ` [${event}]`;
      }
      if (res.statusCode >= 500) {
        if (res.myError && res.myError.data && res.myError.cause) {
          data.err = res.myError.cause;
        }
        else {
          data.err = res.myError;
        }
        res.log.error(data, message);
      }
      else if (res.statusCode >= 400) {
        if (res.myError && res.myError.data && res.myError.cause) {
          data.err = res.myError.cause;
        }
        else {
          data.err = res.myError;
        }
        res.log.warn(data, message);
      }
      else {
        res.log.info(data, message);
      }
    }

    res.on('finish', () => {
      doLogRequest('finish')
    })
    res.on('close', () => {
      doLogRequest('close')
    })
    next();
  }

  return {
    log,
    logRequest,
    logError,
    getDurationMilliseconds
  }
}


module.exports = logger;

