(function() {
  var JTFileSystem, async, fs, path, _;

  _ = require('underscore');

  fs = require('fs');

  async = require('async');

  path = require('path');

  JTFileSystem = (function() {

    function JTFileSystem() {}

    /**
     * getFiles 获取文件（包括文件夹）
     * @param  {String, Array} searchPaths 查找的目录（可以为数组）
     * @param  {Boolean} {optional} recursion 是否递归查找子目录
     * @param  {Function} cbf  回调函数(err, {files : [], dirs : []})
     * @return {[type]}             [description]
    */


    JTFileSystem.prototype.getFiles = function(searchPaths, recursion, cbf) {
      var handles, resultInfos;
      if (!_.isArray(searchPaths)) {
        searchPaths = [searchPaths];
      } else {
        searchPaths = _.clone(searchPaths);
      }
      resultInfos = {
        files: [],
        dirs: []
      };
      handles = [
        function(cbf) {
          return GLOBAL.setImmediate(function() {
            return cbf(null, searchPaths);
          });
        }, function(paths, cbf) {
          var _files;
          _files = [];
          return async.eachLimit(paths, 10, function(_path, cbf) {
            return fs.readdir(_path, function(err, files) {
              if (err) {
                return cbf(err);
              } else {
                _files = _files.concat(_.map(files, function(file) {
                  if (file.charAt(0) === '.') {
                    return null;
                  } else {
                    return path.join(_path, file);
                  }
                }));
                return cbf(null);
              }
            });
          }, function(err) {
            return cbf(err, _.compact(_files));
          });
        }, function(files, cbf) {
          var _dirs, _files;
          _files = [];
          _dirs = [];
          return async.eachLimit(files, 10, function(file, cbf) {
            return fs.stat(file, function(err, stats) {
              if (!err && stats) {
                if (stats.isDirectory()) {
                  _dirs.push(file);
                } else {
                  _files.push(file);
                }
              }
              return cbf(err);
            });
          }, function(err) {
            return cbf(err, {
              files: _files,
              dirs: _dirs
            });
          });
        }
      ];
      async.whilst(function() {
        return searchPaths.length > 0;
      }, function(cbf) {
        return async.waterfall(handles, function(err, result) {
          if (recursion && result) {
            searchPaths = result.dirs;
          } else {
            searchPaths = [];
          }
          if (result) {
            resultInfos.files = resultInfos.files.concat(result.files);
            resultInfos.dirs = resultInfos.dirs.concat(result.dirs);
          }
          return cbf(err);
        });
      }, function(err) {
        return cbf(err, resultInfos);
      });
      return this;
    };

    JTFileSystem.prototype.filterFiles = function(files, filter, cbf) {
      var filterFuncs, getContainFilter, getExtFilter, getHandle, getSizeFilter, handle;
      getExtFilter = function(ext) {
        return function(file, cbf) {
          var accord, extName;
          extName = path.extname(file);
          if (_.isArray(ext)) {
            accord = _.contains(ext, extName);
          } else {
            accord = extName === ext;
          }
          return GLOBAL.setImmediate(function() {
            return cbf(accord);
          });
        };
      };
      getSizeFilter = function(size) {
        var gt;
        if (size.charAt(0) === '>') {
          gt = true;
        } else {
          gt = false;
        }
        size = size.substring(1);
        return function(file, cbf) {
          return fs.stat(file, function(err, stats) {
            var fileSize;
            if (err) {
              return cbf(false);
            } else {
              fileSize = stats != null ? stats.size : void 0;
              if (gt) {
                return cbf(fileSize > size);
              } else {
                return cbf(fileSize < size);
              }
            }
          });
        };
      };
      getContainFilter = function(partFileName) {
        return function(file, cbf) {
          var accord;
          if (~file.indexOf(partFileName)) {
            accord = true;
          } else {
            accord = false;
          }
          return GLOBAL.setImmediate(function() {
            return cbf(accord);
          });
        };
      };
      getHandle = function(filterFuncs, type) {
        if (type == null) {
          type = 'and';
        }
        return function(file, cbf) {
          var checkCount, maxCheckCount;
          checkCount = 0;
          maxCheckCount = filterFuncs.length;
          return async.whilst(function() {
            return checkCount !== -1 && checkCount < maxCheckCount;
          }, function(cbf) {
            return filterFuncs[checkCount](file, function(accord) {
              if (type === 'or') {
                if (accord) {
                  checkCount === -1;
                } else {
                  checkCount++;
                }
              } else {
                if (!accord) {
                  checkCount = -1;
                } else {
                  checkCount++;
                }
              }
              return cbf(null);
            });
          }, function() {
            if (type === 'or') {
              return cbf(checkCount === -1);
            } else {
              return cbf(checkCount === maxCheckCount);
            }
          });
        };
      };
      filterFuncs = [];
      if (_.isFunction(filter)) {
        filterFuncs.push(filter);
      }
      if (filter.ext) {
        filterFuncs.push(getExtFilter(filter.ext));
      }
      if (filter.size) {
        filterFuncs.push(getSizeFilter(filter.size));
      }
      if (filter.contain) {
        filterFuncs.push(getContainFilter(filter.contain));
      }
      handle = getHandle(filterFuncs, filter.type);
      async.filterSeries(files, handle, function(result) {
        return cbf(null, result);
      });
      return this;
    };

    return JTFileSystem;

  })();

  module.exports = new JTFileSystem;

}).call(this);
