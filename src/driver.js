var Bacon = require('baconjs')
var carrier = require('carrier')
var net = require('net')
var winston = require('winston')
winston.remove(winston.transports.Console)

winston.add(winston.transports.Console, {
  timestamp: (function() {
    return new Date()
  })
})

console.log = winston.info

var houmioBridge = process.env.HOUMIO_BRIDGE || "localhost:3001"
console.log("houmioBridge:", houmioBridge)

var TelldusAPI = require('telldus-live')
var secret = require('./secret.json')
var publicKey = secret.publicKey
var privateKey = secret.privateKey
var token = secret.token
var tokenSecret = secret.tokenSecret

var cloud = new TelldusAPI.TelldusAPI({ publicKey: publicKey, privateKey: privateKey })
  .login(token, tokenSecret, function(err, user) {
    if (!!err){
      return console.log('login error:', err.message)
    }

    console.log('user:', user)
  })
  .on('error', function(err) {
    console.log('background error:', err.message)
  })

function onOff(device, state){
  cloud.onOffDevice(device, state, function(err, result) {
    if(err){
      console.log("error:", err, result)
    }
  })
}

var toLines = function(socket) {
  return Bacon.fromBinder(function(sink){
    carrier.carry(socket, sink)

    socket.on("close", function() {
      return sink(new Bacon.End())
    })

    socket.on("error", function(err) {
      return sink(new Bacon.Error(err))
    })

    return function(){}
  })
}

var isWriteMessage = function(message){
  return message.command === "write"
}

var writeMessagesToTelldus = function(bridgeSocket){
  return toLines(bridgeSocket)
  .map(JSON.parse)
  .filter(isWriteMessage)
  .onValue(function(msg){
    // console.log("cmd:", msg)
    onOff({id: msg.data.protocolAddress}, msg.data.on)
  })
}

var connectBridge = function() {
    var bridgeSocket = new net.Socket()
    bridgeSocket.connect(houmioBridge.split(":")[1], houmioBridge.split(":")[0], function(){
      writeMessagesToTelldus(bridgeSocket)
      return bridgeSocket.write((JSON.stringify({
        command: "driverReady",
        protocol: "telldus-live"
      })) + "\n")
    })
}

connectBridge()
