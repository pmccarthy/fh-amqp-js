#!/usr/local/bin/node

var util = require('util');

// Default config values
var rc = require('rc')('fh-amqp-js', {
  maxReconnectAttempts: 10,
  ebabled: true
});
var fhamqpjs = require('./lib/amqpjs.js');
var fhtopics = require('./lib/fhevents.js');
var appTopics;
var amqpManager;

function usage() {
  console.log("Usage: fh-amqp-js pub <exchange> <topic> <message> --clusterNodes='<amqp-url>,*'\n"
              + "       fh-amqp-js sub <exchange> <topic> --clusterNodes='<amqp-url>,*'\n"
              + "       fh-amqp-js monit_app_msg <exchange> <topic> <appid> <dyno> <domain> <appName> <env> <message/reason> --clusterNodes='<amqp-url>,*'");
  process.exit(1);
}

var cmd = rc._[0];
if (!cmd) {
  usage();
}

if (cmd !== 'pub' && cmd !== 'sub' && cmd !== "monit_app_msg") {
  usage();
}

// Odd switch but used internally for easily feature flagging amqp
if (rc.enabled === false) {
  console.log("fh-amqp-js is disabled..");
  process.exit(0);
}

if (cmd === 'pub') {
  if (rc._.length !== 4) {
    usage();
  }

  amqpManager = new fhamqpjs.AMQPManager(rc);
  amqpManager.on("error", function(err) {
    fatal(err);
  });

  amqpManager.connectToCluster();

  amqpManager.on("connection", function() {
    amqpManager.publishTopic(rc._[1], rc._[2], JSON.parse(rc._[3]), function(err) {
      if (err) {
        fatal(err);
      }
      amqpManager.disconnect();
    });
  });
}

if (cmd === 'sub') {
  if (rc._.length < 2) {
    usage();
  }

  var subscribeFunc = function(json, headers, deliveryInfo) {
    //console.log("ARGS", headers, deliveryInfo);
    console.log(deliveryInfo.routingKey + ": " + util.inspect(json));
  };

  amqpManager = new fhamqpjs.AMQPManager(rc);
  amqpManager.on("error", function(err) {
    fatal(err);
  });

  amqpManager.connectToCluster();

  amqpManager.on("connection", function() {
    var opts = {
      autoDelete: true,
      durable: false
    };
    var q = "fh-amqp-js-cli-" + new Date().getTime();
    amqpManager.subscribeToTopic(rc._[1], q, rc._[2], subscribeFunc, opts, function(err) {
      if (err) {
        fatal(err);
      }
    });
  });

} else if (cmd === "monit_app_msg") {
  if (rc._.length < 8) {
    usage();
  }
  appTopics = fhtopics.monit;
  amqpManager = new fhamqpjs.AMQPManager(rc);
  amqpManager.on("error", function(err) {
    fatal(err);
  });

  amqpManager.connectToCluster();

  amqpManager.on("connection", function() {
    var mess = (rc._.length === 9) ? rc._[8] : "";
    sendAppMessage(amqpManager,rc._[1],rc._[2],rc._[3],rc._[4],rc._[5],rc._[6], rc._[7], mess,function(err) {
      if (err) {
        fatal(err);
      }
      amqpManager.disconnect();
    });
  });

}

function fatal(msg) {
  console.error(msg);
  process.exit(1);
}



function sendAppMessage(amqpMan,exchange,topic,appid, dyno, domain, appName, env, message, cb) {
  var eventDetails;
  if (topic) {
    eventDetails = appTopics[topic.trim()];
  }
  if (eventDetails) {
    var msg = {
      "uid": appid,
      "timestamp": new Date().getTime(),
      "eventType": eventDetails.eventType,
      "eventClass": eventDetails.eventClass,
      "eventLevel": eventDetails.eventLevel,
      "domain": domain,
      "appName": appName,
      "dyno": dyno,
      "updatedBy": "System",
      "env": env,
      "details": {"message":util.format(eventDetails.eventMessage, message)}
    };
    amqpMan.publishTopic(exchange,topic,msg,cb);
  } else {
    cb("no such topic");
  }
}
