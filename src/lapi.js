(function(exports) {

  /* jshint -W084 */
  // https://github.com/jshint/jshint/issues/1383
  if (exports.lapi) {
    return;
  }

  function isType(type) {
    return function(obj) {
      return {}.toString.call(obj) == '[object ' + type + ']';
    };
  }

  var isObject = isType('Object');
  var isString = isType('String');
  Array.isArray = Array.isArray || function(arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };

  var extend = function(target, source) {
    if (source) {
      for (var key in source) {
        if (typeof source[key] === 'object') {
          target[key] = target[key] || (Array.isArray(source[key]) ? [] : {});
          extend(target[key], source[key]);
        } else {
          source.hasOwnProperty(key) && (target[key] = source[key]);
        }
      }
    }
    return target;
  };

  var DOC = document;
  var head = DOC.head || DOC.getElementsByTagName('head')[0] ||
    DOC.documentElement;
  var supportOnLoad = 'onload' in DOC.createElement('script');
  var isCssMod = function(path) {
    return (/\.css(?:\?|$)/i).test(path || '');
  };

  var driver = new Owly();

  var lapi = {};
  var modules = lapi.modules = {};
  var options = lapi.options = {
    base: '/',
    debug: true,
    alias: {}
  };

  var STATUS = {
    INITIAL: 0,
    LOADING: 1,
    LOADED: 2
  };

  var plant = {
    url: function(path) {
      if (!(/^http(s?):\/\//).test(path)) {
        path = options.base + path;
      }
      return path;
    },

    mod: function(name) {
      name = name || '';
      if (!modules[name]) {
        throw new Error('Module `' + name + '` Not Found');
      }

      return modules[name];
    },

    guid: (function() {
      var GUID = 1;
      return function() {
        return 'anonymous_' + GUID++;
      };
    })()
  };

  lapi.register = function(id, config) {

    if (isString(config)) {
      config = {
        path: config
      };
    } else if (isObject(id)) {
      config = id;
      id = config.id ? config.id : plant.guid();
    }

    config.path = plant.url(config.path);
    config.id = id;
    modules[id] = config;
    modules[id].status = STATUS.INITIAL;

    // check circular
    circulary(config, config.dependencies);

    return id;
  };

  // TODO: status 已经为 loaded 的，不用每次都判断依赖
  lapi.use = function(ids, callback) {
    var args = [].slice.call(arguments);

    if (typeof args[args.length - 1] === 'function') {
      callback = args.pop();
    }

    if (args.length === 0) {
      return;
    }

    for (var i = 0, id; id = args[i]; i++) {
      if (isObject(id)) { // Object config
        id = lapi.register(id);
        args[i] = id;
      } else if (isString(id) &&
        id.match(/\/?([^\/]*?)\.(?:js|css)(?=[\?#]|$)/)) { // path
        id = lapi.register(plant.guid(), id);
        args[i] = id;
      }
    }

    fetch(args, callback);
  };

  lapi.config = function(obj) {
    if (isObject(obj)) {
      extend(options, obj);
    }

    if (isObject(obj.alias)) {
      for (var key in obj.alias) {
        lapi.register(key, obj.alias[key]);
      }
    }
    return options;
  };

  lapi.request = function(url, callback, charset) {
    var iscss = isCssMod(url);
    var node;
    var onload = function(){
      node.onload = node.onreadstatechange = null;
      node = null;
      callback && callback();
    };

    if (iscss) {
      node = DOC.createElement('link');
      node.rel = 'stylesheet';
    } else {
      node = DOC.createElement('script');
      node.async = true;
    }

    if (charset) {
      node.charset = charset;
    }

    // Browser CSS/JS loading capabilities
    // http://pieisgood.org/test/script-link-events/
    //////////////////////////// script & link onload event capabilities
    ////////////////////// javascript:
    // chrome: all
    // safari: all
    // firefox: all
    // opera:  all
    // ie:
    //    ie6-8  not support onload, support onreadystatechange
    //    ie9+   support onload

    ////////////////////// css:
    // chrome: 535+
    // safari: 536+
    // firefox: 9.0 +
    // ie: all,    not support onerror
    // opera: all  not support onerror
    if (supportOnLoad) {
      node.onload = onload;
    } else if (iscss) {
      checkCss(node, onload);
    } else {
      node.onreadstatechange = function() {
        if (node.readyState == 'loaded' || node.readyState == 'complete') {
          onload();
        }
      };
    }

    node[iscss ? 'href' : 'src'] = url;
    // http://bugs.jquery.com/ticket/2709
    head.insertBefore(node, head.firstChild);
  };

  function fetch(deps, callback) {

    driver.all(deps, function() {
      callback && callback();
    });

    for (var i = 0, id, mod; id = deps[i]; i++) {

      mod = plant.mod(id);
      if (Array.isArray(mod.dependencies)) {
        fetch(mod.dependencies, (function(mod) {
          return function() {
            request(mod.id);
          };
        })(mod));
      } else {
        request(mod.id);
      }
    }
  }

  function request(id) {

    var mod = plant.mod(id);

    if (mod.status === STATUS.LOADED) {
      driver.publish(id);
    }

    if (mod.status > STATUS.INITIAL) {
      return;
    }

    mod.status = STATUS.LOADING;

    lapi.request(mod.path, function() {
      mod.status = STATUS.LOADED;
      driver.publish(mod.id);
    }, mod.charset);
  }

  function circulary(mod, deps) {
    if (!Array.isArray(deps)) {
      return;
    }
    for (var i = 0, id; id = deps[i]; i++) {

      if (id === mod.id) {

        modules[mod.id] = null;
        delete modules[mod.id];

        throw new Error('register fail, circular dependency found. module id: `' + mod.id + '`');
      }

      if (modules[id] && Array.isArray(modules[id].dependencies)) {
        circulary(mod, modules[id].dependencies);
      }
    }
  }

  // for old browser
  // inspire from seajs/util-request-css.js
  function checkCss(node, callback) {

    var sheet = node.sheet;
    var isLoaded;

    var isOldWebKit = +navigator.userAgent
      .replace(/.*(?:AppleWebKit|AndroidWebKit)\/(\d+).*/, "$1") < 536;

    // for WebKit < 536
    if (isOldWebKit) {
      if (sheet) {
        isLoaded = true;
      }
    }
    // for Firefox < 9.0
    else if (sheet) {
      try {
        if (sheet.cssRules) {
          isLoaded = true;
        }
      } catch (ex) {
        // The value of `ex.name` is changed from "NS_ERROR_DOM_SECURITY_ERR"
        // to "SecurityError" since Firefox 13.0. But Firefox is less than 9.0
        // in here, So it is ok to just rely on "NS_ERROR_DOM_SECURITY_ERR"
        if (ex.name === "NS_ERROR_DOM_SECURITY_ERR") {
          isLoaded = true;
        }
      }
    }

    setTimeout(function() {
      if (isLoaded) {
        callback();
      } else {
        checkCss(node, callback);
      }
    }, 20);
  }

  var script = function() {
    var scripts = DOC.getElementsByTagName('script');
    var ret;
    for (var i = 0, script; script = scripts[i]; i++) {
      if (/lapi\.js(?=[\?#]|$)/.test(script.src)) {

        ret = script;
        break;
      }
    }

    return ret;
  }();

  var mainjs;
  if (mainjs = script.getAttribute('data-main')) {
    lapi.MAINJS = lapi.modules[lapi.register('__MAINJS__', mainjs)];
    lapi.use(lapi.MAINJS.id);
  }

  exports.lapi = lapi;
})(this);