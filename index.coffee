_ = require 'underscore'
fs = require 'fs'
async = require 'async'
path = require 'path'
noop = () ->

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
  ###*
   * filterFiles 筛选文件
   * @param  {Array} files 需要筛选的文件
   * @param  {Function, Object} filter 自定义筛选函数或者使用默认的筛选方式{ext : '.txt', size : '>1000', contain : 'abc'}默认是多个条件是and，如果想使用or的方式，在filter中添加字段{type : 'or'}，还可以筛选atime, mtime, ctime
   * @param  {Function} cbf 回调函数(err, files)
   * @return {[type]}        [description]
  ###
  filterFiles : (files, filter, cbf) ->
    self = @
    filterFuncs = []
    filterType = filter?.type
    delete filter.type

    if _.isFunction filter
      filterFuncs.push filter
    else if _.isObject filter
      _.each filter, (value, key) ->
        filterFuncs.push self._getFilter key, value

    handler = self._getHandler filterFuncs, filterType

    async.filterSeries files, handler, (result) ->
      cbf null, result
    @
  ###*
   * _getHandler 获取处理程序
   * @param  {Array} filterFuncs 筛选函数数组
   * @param  {String} type 筛选的方式，默认值为'and'
   * @return {[type]}             [description]
  ###
  _getHandler : (filterFuncs, type = 'and') ->
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
  ###*
   * _getFilter 获取筛选函数
   * @param  {String} type  筛选类型，有：ext, size, contain, mtime, atime, ctime
   * @param  {[type]} value 用于筛选的值
   * @return {[type]}       [description]
  ###
  _getFilter : (type, value) ->
    getTimeFilter = (type = 'mtime') ->
      (time) ->
        compareType = 0
        if _.isString time
          compareFlag = time.charAt 0
          if compareFlag == '>'
            compareType = 1
          else if compareFlag == '<'
            compareType = -1
          time = new Date time.substring 1
        (file, cbf) ->
          fs.stat file, (err, stats) ->
            if err
              cbf false
            else
              resultTime = stats[type]
              if compareType > 0
                cbf resultTime > time
              else if compareType < 0
                cbf resultTime < time
              else
                cbf resultTime == time
    filters = 
      ext : (ext) ->
        (file, cbf) ->
          extName = path.extname file
          if _.isArray ext
            accord = _.contains ext, extName
          else
            accord = extName == ext
          GLOBAL.setImmediate () ->
            cbf accord
      size : (size) ->
        compareFlag = size.charAt 0
        compareType = 0
        if compareFlag == '>'
          compareType = 1
        else if compareFlag == '<'
          compareType = -1
        size = size.substring 1
        (file, cbf) ->
          fs.stat file, (err, stats) ->
            if err
              cbf false
            else
              fileSize = stats.size
              if compareType > 0
                cbf fileSize > size
              else if compareType < 0
                cbf fileSize < size
              else
                cbf fileSize == size
      contain : (partFileName) ->
        (file, cbf) ->
          if ~file.indexOf partFileName
            accord = true
          else
            accord = false
          GLOBAL.setImmediate () ->
            cbf accord
    _.each 'mtime atime ctime'.split(' '), (value) ->
      filters[value] = getTimeFilter value

    func = filters[type]
    if _.isFunction func
      func value
    else
      noop

# jtfs = new JTFileSystem()
# jtfs.getFiles 'E:/workspace/test', true, (err, resultInfos) ->
#   console.dir new Date('03/28/2013')
#   console.dir resultInfos.files.length
#   jtfs.filterFiles resultInfos.files, {atime : "<#{new Date('03/28/2013')}"}, (err, files) ->
#     console.dir files
module.exports = new JTFileSystem