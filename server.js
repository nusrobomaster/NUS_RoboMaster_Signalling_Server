var WebSocketServer = require('ws').Server;
var SortedMap = require('dsjslib').AVLTree;

var wss = new WebSocketServer({port: 49621}); 

var stdin = process.openStdin();
stdin.addListener("data", function(d) {
   var input = d.toString().trim().split(/(?<=^\S+)\s/);
    
   switch (input[0]) {
      case "max":
         console.log(userBattleQueue.max());
         break;

      case "min":
         console.log(userBattleQueue.min());
         break;

      case "print":
         userBattleQueue.traverse(function(node) {
            console.log(node.key, node.value);     
         });
         break;

      case "info":
         console.log(userBattleQueue);
         break;

      case "kick":
         if (connectedUsers[input[1]]) {
            leaveHandler({leaveType: "kicked"}, connectedUsers[input[1]]);
         } else {
            console.log("No such user found.");
         }
         break;

      default:
         console.log("Unknown input");
         break;
      }
});


/* Data structures */
var connectedUsers = {}; // Stores all users connected to server
var connectedRobots = {};

function timestampCompare(keyIn, keyAdd) {
   var timeIn = connectedUsers[keyIn].timestamp;
   var timeAdd = connectedUsers[keyAdd].timestamp;

   if (timeIn > timeAdd) {
      return -1;
   } else if (timeIn == timeAdd) {
      return 0;
   } else {
      return 1;
   }
}
var userBattleQueue = new SortedMap(timestampCompare);
var userShootingQueue = new SortedMap(timestampCompare);
/* Data structures */

console.log("Signalling server started");

wss.on('connection', function(connection) {
   console.log("User connected: " + connection._socket.remoteAddress);
	
   // Handle messages from connected users.
   connection.on('message', function(message) { 
	
      var data = JSON.parse(message); 	
      switch (data.type) { 
         
         case "robot-login":
            robotLoginHandler(data, connection);
            break;

         case "user-login": 				
            userLoginHandler(data, connection);
            break;
         
         case "find-robot":
            findRobotHandler(data, connection);
            break;

         case "offer": 
            offerHandler(data, connection);
            break;  
             
         case "answer": 
            answerHandler(data, connection);
            break;  
				
         case "leave": 
            leaveHandler(data, connection);   
            break;
				
         default: 
            sendToConnection(connection, { 
               type: "error", 
               message: "Command not found: " + data.type 
            }); 
            break; 
      }  
   });  
   
   // Handle user/robot leaving
   connection.on("close", function() {
      console.log(connection.name + " closed browser.");
      leaveHandler({}, connection); 
   });
});  


function robotLoginHandler(data, connection) {
   if (connectedRobots[data.name]) {
      console.log("Robot has already logged in: " + data.name);
      
      sendToConnection(connection, {
         type: "login",
         success: false
      });
   } else {
      // Save robot information on server
      connection.name = data.name;
      connection.joinedGame = data.joinedGame;
      connectedRobots[data.name] = connection;
   
      console.log("Robot successfully logged in: " + data.name);

      sendToConnection(connection, { 
         type: "login", 
         success: true 
      }); 
   }
   console.log("Total connected robots: ", Object.keys(connectedRobots).length);
}


function userLoginHandler(data, connection) {
   if (connectedUsers[data.name]) { 
      console.log("User attempted login with duplicate name: " + data.name);
      
      sendToConnection(connection, { 
         type: "login", 
         success: false 
      });
   } else { 
      // Save user connection information on server
      connectedUsers[data.name] = connection; 
      connection.name = data.name; 
      
      console.log("User successfully logged in: " + data.name);
      
      sendToConnection(connection, { 
         type: "login", 
         success: true 
      }); 
   } 
   console.log("Total connected users: ", Object.keys(connectedUsers).length);
}


function joinQueue(data, connection) {
   connection.timestamp = Date.now();
   queueArray = [];

   if (data.joinedGame === "battle") {
      userBattleQueue.put(connection.name, connection.timestamp);
      userBattleQueue.traverse(function(node) {
         queueArray.push(node.key);
      });

   } else { // data.joinedGame === "shooting"
      userShootingQueue.put(connection.name, connection.timestamp);
      userShootingQueue.traverse(function(node) {
         queueArray.push(node.key);
      });
   }

   //console.log(Object.values(connectedUsers));
   for (var val of Object.values(connectedUsers)) {
      sendToConnection(val, {
         type: "update-queue",
         game: val.joinedGame,
         updatedQueue: queueArray
      });
   }
}


function findRobotHandler(data, connection) {
   console.log(connection.name + " attempting to find robot for game: " + data.joinedGame);
   connection.joinedGame = data.joinedGame;
   
   var robot = null;
   for (var connectedRobot of Object.values(connectedRobots)) {
      // Need to ensure that the robot is not currently connected to a user.
      console.log("Current peer connected to robot: " + connectedRobot.connectedPeer);
      if (connectedRobot.connectedPeer == null && connectedRobot.joinedGame === data.joinedGame) {
         console.log("Robot found: " + connectedRobot.name);
         robot = connectedRobot;
         break;
      }
   }

   if (!robot) {
      // No robots are available, put user in queue.
      console.log("No robots available, " + connection.name + " joining queue for game: " + data.joinedGame);
      joinQueue(data, connection);
   } else {
      // Request for offer from client.
      sendToConnection(connection, {
         type: "request-offer",
         robotName: robot.name
      });
   }
}


function offerHandler(data, connection) {
   var targetRobotConnection = connectedRobots[data.name];

   if (targetRobotConnection != null) {
      console.log(connection.name + " sending offer to robot: " + data.name);

      // Storing robot name that user is connected to
      connection.connectedPeer = data.name;
      sendToConnection(connectedRobots[data.name], {
         type: "offer",
         offer: data.offer,
         name: connection.name
      });
   
   } else {
      console.log("Robot " + data.name + " is no longer connected to server.");
   }
}


function answerHandler(data, connection) {

   var targetUserConnection = connectedUsers[data.name]; 
   
   if (targetUserConnection != null) { 
      console.log("Sending answer from " + connection.name + " to " + data.name); 

      // Storing user name that robot is connected to
      connection.connectedPeer = data.name; 
      console.log(data.name);
      console.log(connection.connectedPeer);
      sendToConnection(targetUserConnection, { 
         type: "answer", 
         answer: data.answer 
      }); 

   } else {
      console.log("User " + data.name + " is no longer conected to server.");
   }
}


function leaveHandler(data, connection) {

   // Handle user leaving
   if (connectedUsers[connection.name]) {
      console.log("User left: " + connection.name + ", " + connection._socket.remoteAddress);
      
      // Get robot that was connected to user that just left to inform robot of disconnect
      if (connection.connectedPeer) {
         var targetPeerConnection = connectedRobots[connection.connectedPeer];
         // Need to send signal to close peer connection on connected peer if it exists
         if (targetPeerConnection) { 
            targetPeerConnection.connectedPeer = null;
            console.log(connection.name + " disconnecting from ", targetPeerConnection.name);
            sendToConnection(targetPeerConnection, { 
               type: "leave",
               name: connection.name
            });
         }
      }
         
      // If user exists in a queue, delete the user from the queue.
      if (userBattleQueue.get(connection.name) != null) {
         userBattleQueue.delete(connection.name);
      }
         
      // Get user next in queue
      var minNode = userBattleQueue.min();
      var nextUser;
      if (minNode !== null) {
         nextUser = connectedUsers[minNode.key];
         console.log("Next user is " + nextUser.name);
         // Remove user from queue, so that updated queue can be sent out to all other users
         userBattleQueue.delete(nextUser.name);
      }

      var queueArray = [];
      userBattleQueue.traverse(function(node) {
         queueArray.push(node.key);
      });
      for (var val of Object.values(connectedUsers)) {
         sendToConnection(val, {
            type: "update-queue",
            game: val.joinedGame,
            updatedQueue: queueArray
         });
      }

      if (nextUser) {
         // Tell next user to try to start their turn
         findRobotHandler({joinedGame: "battle"}, nextUser);
         //sendToConnection(nextUser, {
         //   type: "start-turn"
         //});
      }

      // Finally delete user, as required by hard leave
      if (!data.leaveType || data.leaveType === "kicked") {
         delete connectedUsers[connection.name];
      }
      console.log("Total connected users: ", Object.keys(connectedUsers).length);

      


   // Handle robot leaving
   } else if (connectedRobots[connection.name]) {
      console.log("Robot left: " + connection.name + ", " + connection._socket.remoteAddress);
      
      // Get user that was connected to robot that just left to inform user of disconnect.
      if (connection.connectedPeer) {
         var targetPeerConnection = connectedUsers[connection.connectedPeer];
         // Need to send signal to close peer connection on connected peer if it exists
         if (targetPeerConnection) { 
            targetPeerConnection.connectedPeer = null;
            console.log(connection.name + " disconnecting from ", targetPeerConnection.name);
            sendToConnection(targetPeerConnection, { 
               type: "leave",
               name: connection.name
            });
         }
      }
      
      delete connectedRobots[connection.name];
      console.log("Total connected robots: ", Object.keys(connectedRobots).length);
      



   // Handle non-logged in user leaving
   } else {
      console.log("Unknown user @ " + connection._socket.remoteAddress + " has left");
      console.log("Total connected users: ", Object.keys(connectedUsers).length);
      console.log("Total connected robots: ", Object.keys(connectedRobots).length);
   }
}

wss.on("close", function(connection) {
    console.log("Something terribly wrong has happened. Help.");
});


function sendToConnection(connection, message) { 
   connection.send(JSON.stringify(message)); 
}
