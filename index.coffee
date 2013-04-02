_ = require 'underscore'
fs = require 'fs'
async = require 'async'
path = require 'path'

class JTFileSystem
  constructor : () ->

  ###*
   * getFiles 获取文件（包括文件夹）
   * @param  {String, Array} searchPaths 查找的目录（可以为数组）
   * @param  {Boolean} {optional} recursion 是否递归查找子目录
   * @param  {Function} cbf  回调函数(err, {files : [], dirs : []})
   * @return {[type]}             [description]
  ###
  getFiles : (searchPaths, recursion, cbf) ->
    if !_.isArray searchPaths
      searchPaths = [searchPaths]
    else
      searchPaths = _.clone searchPaths
    resultInfos = 
      files : []
      dirs : []
    handles = [
      (cbf) ->
        GLOBAL.setImmediate () ->
          cbf null, searchPaths
      (paths, cbf) ->
        _files = []
        async.eachLimit paths, 10, (_path, cbf) ->
          fs.readdir _path, (err, files) ->
            if err
              cbf err
            else
              _files = _files.concat _.map files, (file) ->
                if file.charAt(0) == '.'
                  null
                else
                  path.join _path, file
              cbf null
        , (err) ->
          cbf err, _.compact _files
      (files, cbf) ->
        _files = []
        _dirs = []
        async.eachLimit files, 10, (file, cbf) ->
          fs.stat file, (err, stats) ->
            if !err && stats
              if stats.isDirectory()
                _dirs.push file
              else
                _files.push file
            cbf err
        , (err) ->
          cbf err, {
            files : _files
            dirs : _dirs
          }
    ]
    async.whilst () ->
      searchPaths.length > 0
    , (cbf) ->
      async.waterfall handles, (err, result) ->
        if recursion && result
          searchPaths = result.dirs
        else
          searchPaths = []
        if result
          resultInfos.files = resultInfos.files.concat result.files
          resultInfos.dirs = resultInfos.dirs.concat result.dirs
        cbf err
    , (err) ->
      cbf err, resultInfos
    @
  filterFiles : (files, filter, cbf) ->
    getExtFilter = (ext) ->
      (file, cbf) ->
        extName = path.extname file
        if _.isArray ext
          accord = _.contains ext, extName
        else
          accord = extName == ext
        GLOBAL.setImmediate () ->
          cbf accord
    getSizeFilter = (size) ->
      if size.charAt(0) == '>'
        gt = true
      else
        gt = false
      size = size.substring 1
      (file, cbf) ->
        fs.stat file, (err, stats) ->
          if err
            cbf false
          else
            fileSize = stats?.size
            if gt
              cbf fileSize > size
            else
              cbf fileSize < size
    getContainFilter = (partFileName) ->
      (file, cbf) ->
        if ~file.indexOf partFileName
          accord = true
        else
          accord = false
        GLOBAL.setImmediate () ->
          cbf accord
    getHandle = (filterFuncs, type = 'and') ->
      (file, cbf) ->
        checkCount = 0
        maxCheckCount = filterFuncs.length
        async.whilst () ->
          checkCount != -1 && checkCount < maxCheckCount
        , (cbf) ->
          filterFuncs[checkCount] file, (accord) ->
            if type == 'or'
              if accord
                checkCount == -1
              else
                checkCount++
            else
              if !accord
                checkCount = -1
              else
                checkCount++
            cbf null
        , () ->
          if type == 'or'
            cbf checkCount == -1
          else
            cbf checkCount == maxCheckCount
    filterFuncs = []
    if _.isFunction filter
      filterFuncs.push filter
    if filter.ext
      filterFuncs.push getExtFilter filter.ext
    if filter.size
      filterFuncs.push getSizeFilter filter.size
    if filter.contain
      filterFuncs.push getContainFilter filter.contain
    handle = getHandle filterFuncs, filter.type

    async.filterSeries files, handle, (result) ->
      cbf null, result
    @

# jtfs = new JTFileSystem()
# jtfs.getFiles '/Users/Tree/novel', true, (err, resultInfos) ->
#   jtfs.filterFiles resultInfos.files, {ext : '.json'}, (err, files) ->
#     console.dir files.length
module.exports = new JTFileSystem