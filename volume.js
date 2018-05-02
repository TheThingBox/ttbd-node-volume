module.exports = function(RED) {
  "use strict";
  var exec = require("ttbd-exec");
  var exec_opt = {
    hydra_exec_host: "mosquitto"
  }

  var INCREMENT_STEP = 5;

  function SetVolume(n) {
    RED.nodes.createNode(this, n);
    this.volume = n.volume;

    var node = this;

    this.on("input", function(msg) {
      getVolume(function(err, vol) {
        if(err) { node.warn(err); }
        var volume = node.volume;
        if(msg.volume)
          volume = msg.volume;
        if(msg.intensity) {
          volume = msg.intensity;
        }
        if(msg.intent || msg.intent == 0) {
          switch(msg.intent) {
            case 0: volume = 0; break; // close
            case 1: volume = 100; break; // open
            case 2: volume = vol + INCREMENT_STEP; break; // more
            case 3: volume = vol - INCREMENT_STEP; break; // less
            // case : volume = 100 - vol; break; // invert
          }
        }
        if(volume < 0) volume = 0;
        setVolume(volume, function(err) {
          if(err) {
            node.warn(err);
          }
          node.send(msg);
        });
      });
    });
  }
  RED.nodes.registerType("volume", SetVolume);

  function amixer(args, cb) {
    exec(`amixer ${args.join(' ')}`, exec_opt, function(err, stdout, stderr) {
      cb(err || stderr || null, stdout.trim())
    })
  }

  var reDefaultDevice = /Simple mixer control \'([a-z0-9 -]+)\',[0-9]+/i;
  var defaultDeviceCache = null;
  function defaultDevice(cb) {
    if(defaultDeviceCache === null) {
      amixer([], function (err, data) {
        if(err) {
          cb(err);
        } else {
          var res = reDefaultDevice.exec(data);
          if(res === null) {
            cb(new Error('Alsa Mixer Error: failed to parse output'));
          } else {
            defaultDeviceCache = res[1];
            cb(null, defaultDeviceCache);
          }
        }
      });
    } else {
      cb(null, defaultDeviceCache);
    }
  };

  var reInfo = /[a-z][a-z ]*\: Playback [0-9-]+ \[([0-9]+)\%\] (?:[[0-9\.-]+dB\] )?\[(on|off)\]/i;
  function getInfo(cb) {
    defaultDevice(function (err, dev) {
      if(err) {
        cb(err);
      } else {
        amixer(['get', dev], function (err, data) {
          if(err) {
            cb(err);
          } else {
            var res = reInfo.exec(data);
            if(res === null) {
              cb(new Error('Alsa Mixer Error: failed to parse output'));
            } else {
              cb(null, {
                volume: parseInt(res[1], 10),
                muted: (res[2] == 'off')
              });
            }
          }
        });
      }
    });
  };

  function getVolume(cb) {
    getInfo(function (err, obj) {
      if(err) {
        cb(err);
      } else {
        cb(null, obj.volume);
      }
    });
  };

  function setVolume(val, cb) {
    defaultDevice(function (err, dev) {
      if(err) {
        cb(err);
      } else {
        amixer(['set', dev, val + '%'], function (err) {
          cb(err);
        });
      }
    });
  };
}
