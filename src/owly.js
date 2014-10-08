(function() {
  // https://github.com/yleo77/owly
  var getType = function(arg) {
    return Object.prototype.toString.call(arg).slice(8, -1).toLowerCase();
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

  var assert = function(value, type) {
    if (getType(value) !== type) {
      throw new Error((value || 'undefined').toString() + ' ISNOT a ' + type);
    }
  };

  var convert = function(topic) {
    // console.time('cir')
    topic = topic.split('.');
    var len = topic.length;
    topic.forEach(function(item, index) {
      if (topic[index] === '*') {
        var re = '([^.]+?)';
        if (index === 0) {
          re = '^' + re;
        } else if (index === len - 1) {
          re = re + '$';
        }
        topic[index] = re;
      }
    });
    // console.timeEnd('cir');
    return new RegExp(topic.join('\\.'));
  };

  var formation = function(topic) {
    this._listeners[topic] = {
      calls: [],
      execed: 0,
      args: null
    };
  };

  var execute = function(obj, args) {
    obj.handle.apply(obj.context || this, args);
    obj.execed++;
  };

  var guid = 1;
  var store = {};

  function Owly(config) {
    this._listeners = {};
    this.id = 'owly_' + (guid++).toString(36);
    config = config || {};
    this.cache = getType(config.cache) === 'boolean' ? config.cache : true;
  }

  extend(Owly.prototype, {

    subscribe: function(events, handle, config) {

      assert(handle, 'function');
      assert(events, 'string');

      config = extend({
        name: events,
        handle: handle,
        execed: 0,
        times: Infinity
      }, config || {});
      config.context = config.context || this;

      if (!this._listeners[events]) {
        formation.call(this, events);
      }
      this._listeners[events].calls.push(config);

      if (config.cache || (typeof config.cache === 'undefined' && this.cache)) {

        var meet = false;
        var args;
        if (this._listeners[events].execed > 0) {
          meet = true;
          args = this._listeners[events].args;
        } else {
          for (var i in store[this.id]) {
            var tc = store[this.id][i];
            if (tc.reg.test(events)) {
              meet = true;
              args = tc.args;
            }
          }
        }
        if (meet) {
          this._listeners[events].execed++;
          execute.call(this, config, args);
          if (config.execed >= config.times) {
            this.unsubscribe(events, handle);
          }
        }
      }
      return this;
    },

    publish: function(topic) {

      assert(topic, 'string');
      var args = [].slice.call(arguments, 1);
      var topics;

      if (/(\.?)\*(\.|$)/.test(topic)) { // wildcard

        var reg = convert(topic);
        store[this.id] = store[this.id] || {};
        if (!store[this.id][topic]) {
          store[this.id][topic] = {
            reg: reg,
            args: args
          };
        }
        topics = Object.keys(this._listeners).filter(function(event) {
          return reg.test(event);
        });
      } else {

        if (!this._listeners[topic]) {
          formation.call(this, topic);
        }
        topics = [topic];
      }

      var stash;
      topics.forEach((function(topic) {
        this._listeners[topic].execed++;
        this._listeners[topic].args = args;

        stash = this._listeners[topic].calls.slice(0);
        this._listeners[topic].calls.forEach(function(to, index) {
          execute.call(this, to, args);
          if (to.execed >= to.times) {
            stash.splice(index, 1);
          }
        });
        this._listeners[topic].calls = stash.slice(0);
      }).bind(this));

      return this;
    },

    unsubscribe: function(topic, handle) {

      if (!topic) { // remove all topic
        this._listeners = {};
      } else if (!handle) { // remove the special topic
        this._listeners[topic] = null;
        delete this._listeners[topic];
      } else {
        assert(topic, 'string');
        this._listeners[topic].calls.every((function(to, index) {
          if (this._listeners[topic].calls[index].handle === handle) {
            this._listeners[topic].calls.splice(index, 1);
            return false;
          }
        }).bind(this));
      }

      return this;
    },

    all: function(events, handle, config) {

      assert(events, 'array');
      assert(handle, 'function');
      config = config || {};

      if (!events.length) {
        return this;
      }

      handle = (function(times, callback) {
        return function(topic) {
          handle._[topic] = [].slice.call(arguments, 1);
          if (--times >= 1) {
            return;
          }
          return callback.apply(this, events.map(function(topic) {
            return handle._[topic];
          }));
        };
      })(events.length, handle);
      handle._ = {}; // handle arguments

      events.forEach((function(topic) {
        this.one(topic, function() {
          handle.apply(config.context || this, [topic].concat([].slice.call(arguments)));
        }, config);
      }).bind(this));

      return this;
    },

    one: function(events, handle, config) {

      config = config || {};
      config.times = 1;
      return this.subscribe(events, handle, config);
    }
  });

  // var owly = new Owly({
  //   cache: true
  // });

  // if (typeof define === 'function' && (define.amd || define.cmd)) {
  //   define(function(require, exports, module) {
  //     exports.Owly = Owly;
  //     exports.owly = owly;
  //   });
  // } else if (typeof module === 'object' && module.exports) {
  //   exports.Owly = Owly;
  //   exports.owly = owly;
  // } else {
  //   this.Owly = Owly;
  //   this.owly = owly;
  // }
    this.Owly = Owly;
    this.owly = new Owly({cache: true});

}).call(this);
