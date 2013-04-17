(function() {
  var JTFileSystem, async, fs, noop, path, _;

  _ = require('underscore');

  fs = require('fs');

  async = require('async');

  path = require('path');

  noop = function() {};

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
      if (_.isFunction(recursion)) {
        cbf = recursion;
        recursion = false;
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

    /**
     * filterFiles 筛选文件
     * @param  {Array} files 需要筛选的文件
     * @param  {Function, Object} filter 自定义筛选函数或者使用默认的筛选方式{ext : '.txt', size : '>1000', contain : 'abc'}默认是多个条件是and，如果想使用or的方式，在filter中添加字段{type : 'or'}，还可以筛选atime, mtime, ctime
     * @param  {Function} cbf 回调函数(err, files)
     * @return {[type]}        [description]
    */


    JTFileSystem.prototype.filterFiles = function(files, filter, cbf) {
      var filterFuncs, filterType, handler, self;
      self = this;
      filterFuncs = [];
      filterType = filter != null ? filter.type : void 0;
      delete filter.type;
      if (_.isFunction(filter)) {
        filterFuncs.push(filter);
      } else if (_.isObject(filter)) {
        _.each(filter, function(value, key) {
          return filterFuncs.push(self._getFilter(key, value));
        });
      }
      handler = self._getHandler(filterFuncs, filterType);
      async.filterSeries(files, handler, function(result) {
        return cbf(null, result);
      });
      return this;
    };

    /**
     * _getHandler 获取处理程序
     * @param  {Array} filterFuncs 筛选函数数组
     * @param  {String} type 筛选的方式，默认值为'and'
     * @return {[type]}             [description]
    */


    JTFileSystem.prototype._getHandler = function(filterFuncs, type) {
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

    /**
     * _getFilter 获取筛选函数
     * @param  {String} type  筛选类型，有：ext, size, contain, mtime, atime, ctime
     * @param  {[type]} value 用于筛选的值
     * @return {[type]}       [description]
    */


    JTFileSystem.prototype._getFilter = function(type, value) {
      var filters, func, getTimeFilter;
      getTimeFilter = function(type) {
        if (type == null) {
          type = 'mtime';
        }
        return function(time) {
          var compareFlag, compareType;
          compareType = 0;
          if (_.isString(time)) {
            compareFlag = time.charAt(0);
            if (compareFlag === '>') {
              compareType = 1;
            } else if (compareFlag === '<') {
              compareType = -1;
            }
            time = new Date(time.substring(1));
          }
          return function(file, cbf) {
            return fs.stat(file, function(err, stats) {
              var resultTime;
              if (err) {
                return cbf(false);
              } else {
                resultTime = stats[type];
                if (compareType > 0) {
                  return cbf(resultTime > time);
                } else if (compareType < 0) {
                  return cbf(resultTime < time);
                } else {
                  return cbf(resultTime === time);
                }
              }
            });
          };
        };
      };
      filters = {
        ext: function(ext) {
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
        },
        size: function(size) {
          var compareFlag, compareType;
          compareFlag = size.charAt(0);
          compareType = 0;
          if (compareFlag === '>') {
            compareType = 1;
          } else if (compareFlag === '<') {
            compareType = -1;
          }
          size = size.substring(1);
          return function(file, cbf) {
            return fs.stat(file, function(err, stats) {
              var fileSize;
              if (err) {
                return cbf(false);
              } else {
                fileSize = stats.size;
                if (compareType > 0) {
                  return cbf(fileSize > size);
                } else if (compareType < 0) {
                  return cbf(fileSize < size);
                } else {
                  return cbf(fileSize === size);
                }
              }
            });
          };
        },
        contain: function(partFileName) {
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
        }
      };
      _.each('mtime atime ctime'.split(' '), function(value) {
        return filters[value] = getTimeFilter(value);
      });
      func = filters[type];
      if (_.isFunction(func)) {
        return func(value);
      } else {
        return noop;
      }
    };

    return JTFileSystem;

  })();

  module.exports = new JTFileSystem;

}).call(this);
