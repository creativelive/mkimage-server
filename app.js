#!/usr/bin/env node

process.chdir(__dirname);
if (process.env.NODE_ENV && (process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "stage")) {
  process.env.NODE_ENV = "production";
} else {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  process.env.NODE_ENV = "development";
}
var mkimage = require('./bin/mkimage');
