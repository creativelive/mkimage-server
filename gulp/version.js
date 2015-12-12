'use strict';
var version = require('@creativelive/gulp-docker-version-bump');

module.exports = function(gulp, conf) {
  gulp.task('version', function() {
    return gulp.src('./package.json')
      .pipe(version())
      .pipe(gulp.dest('./'));
  });
};
