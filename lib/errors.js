
// Usage
//
// new AppError('message')
// new AppError('message', {statusCode: 400})
// new AppError('message', {statusCode: 500, cause: err})
// new AppError({statusCode: 500, cause: err})
// new AppError(err);

class AppError extends Error {
  constructor(m, d) {
    let data;
    let message;

    if (typeof m === 'string') {
      message = m;
      data = d;
    }
    else if (m instanceof Error) {
      message = m.message;
      data = d || {cause: m}
    }
    else if (typeof m === 'object') {
      try {
        data = Object.assign({}, m);

        if (typeof d === 'object') {
          Object.assign(data, d);
        } else if (typeof d === 'number') {
          data.statusCode = d;
        } else if (typeof d === 'string') {
          message = d;
        }
      } catch (e) {
        // ignore
      }
    }
    if (!data) {
      data = {};
    }
    if (data instanceof Error) {
      data = {cause: data};
    }
    if (!message) {
      if (data.cause && data.cause instanceof Error) {
        message = data.cause.message;
      }
      else if (data.message && typeof data.message === 'string') {
        message = data.message;
      }
      else if (data.msg && typeof data.msg === 'string') {
        message = data.msg;
      }
    }
    if (typeof data === 'number' && data >= 100 && data < 600) {
      data = {statusCode: data}
    }

    super(message || 'Error');
    if (typeof data === 'object') {
      this.data = data;
    }
    else {
      this.data = {};
    }

    if (this.data.message) {
      delete this.data.message;
    }
    if (this.data.msg) {
      delete this.data.msg;
    }

    // extending Error is weird and does not propagate `message`
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable : true,
      value : message,
      writable : true,
    });
    this.message = message || 'Error';

    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable : true,
      value : (this.data && this.data.name)? this.data.name : this.constructor.name,
      writable : true,
    });

    if (!this.data.statusCode || this.data.statusCode < 100 || this.data.statusCode >= 600) {
      this.data.statusCode = 500;
    }

    if (this.data.statusCode === 500) {
      if (Error.hasOwnProperty('captureStackTrace')) {
        Error.captureStackTrace(this, this.constructor);
      }
      else {
        Object.defineProperty(this, 'stack', {
          configurable: true,
          enumerable : true,
          value : (new Error(message)).stack,
          writable : true,
        });
      }
    }
    else {
      Object.defineProperty(this, 'stack', {
        configurable: true,
        enumerable: false,
        value: null,
        writable: false
      });
    }
  }

  get statusCode() {
    return this.data.statusCode || 500;
  }
  get cause() {
    return this.data.cause;
  }
}

class BadRequestError extends AppError {
  constructor(message, data) {
    super(message, data || {statusCode: 400});
  }
}

class ServerError extends AppError {
  constructor(message, data) {
    super(message, data || {statusCode: 500});
  }
}

class ForbiddenError extends AppError {
  constructor(message, data) {
    super(message, data || {statusCode: 403})
  }
}

module.exports = {
  AppError,
  BadRequestError,
  ForbiddenError,
  ServerError
}
