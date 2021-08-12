var WebSocketServer = require('ws').Server;
var SortedMap = require('dsjslib').AVLTree;

var wss = new WebSocketServer({ port: 49621 });

// This opens a process that listens to console input. Helpful when debugging the server
var stdin = process.openStdin();
stdin.addListener("data", function (d) {
   var input = d.toString().trim().split(/(?<=^\S+)\s/);

   switch (input[0]) {
      case "max":
         console.log(userBattleQueue.max());
         break;

      case "min":
         console.log(userBattleQueue.min());
         break;

      case "list":
         if (input[1] === "users") {
            console.log("Printing connected users:");
            for (var user of Object.values(connectedUsers)) {
               console.log("Name: " + user.name + " | Game: " + user.joinedGame +
                  " | Robot: " + user.connectedPeer);
            }
         } else if (input[1] === "robots") {
            console.log("Printing connected robots:");
            for (var robot of Object.values(connectedRobots)) {
               console.log("Name: " + robot.name + " | Game: " + robot.joinedGame +
                  " | User: " + robot.connectedPeer);
            }
         } else {
            console.log("Unknown list option");
         }
         break;

      case "kick":
         if (connectedUsers[input[1]]) {
            leaveHandler({ leaveType: "kicked" }, connectedUsers[input[1]]);
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
   } else if (timeIn === timeAdd) {
      return 0;
   } else {
      return 1;
   }
}
var userBattleQueue = new SortedMap(timestampCompare);
var userShootingQueue = new SortedMap(timestampCompare);
/* Data structures */

console.log("Signalling server started");

wss.on('connection', function (connection) {
   console.log("User opened website: " + connection._socket.remoteAddress);

   // Handle messages from connected users.
   connection.on('message', function (message) {
      var data = JSON.parse(message);
      switch (data.type) {

         case "robot-login":
            robotLoginHandler(data, connection);
            break;

         case "user-login":
            userLoginHandler(data, connection);
            break;

         // Used by user initially to get available robots or to join a queue
         case "find-robot":
            findRobotHandler(data, connection);
            break;

         // Offer is sent from a user to a robot
         case "offer":
            offerHandler(data, connection);
            break;

         // Answer is sent from a robot to user
         case "answer":
            answerHandler(data, connection);
            break;

         case "user-start-game":
            userStartGameHandler(data, connection);
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
   connection.on("close", function () {
      console.log(connection.name + ", " + connection._socket.remoteAddress + " closed browser.");
      leaveHandler({ leaveType: "hard-exit" }, connection);
   });
});


function robotLoginHandler(data, connection) {
   if (connectedRobots[data.name]) {            // Check if robot exists already
      console.warn("Robot has already logged in: " + data.name);
      sendToConnection(connection, {
         type: "login",
         success: false
      });

   } else {
      // Save robot information on server
      connection.name = data.name;              // Robot name is initialized from script
      connection.joinedGame = data.joinedGame;  // A robot is initially assigned to a game
      connectedRobots[data.name] = connection;  // Connection object for robot is stored
      console.log("Robot successfully logged in: " + connection.name +
         ", for game: " + connection.joinedGame);
      sendToConnection(connection, {
         type: "login",
         success: true
      });
   }

   console.log("Total connected robots: ", Object.keys(connectedRobots).length);
}


// This function is fine if a context switch happens in the middle of it.
function userLoginHandler(data, connection) {
   if (connectedUsers[data.name]) {             // Check if user exists already
      console.warn("User attempted login with duplicate name: " + data.name);
      sendToConnection(connection, {
         type: "login",
         success: false
      });

   } else {
      // Save user connection information on server
      connection.name = data.name;              // User name is assigned to connection object
      connectedUsers[data.name] = connection;   // Connection object is stored in userlist
      // Note that user does not select joinedGame yet.
      console.log("User " + connection._socket.remoteAddress +
         " successfully logged in with name " + data.name);
      sendToConnection(connection, {
         type: "login",
         success: true
      });
   }

   console.log("Total connected users: ", Object.keys(connectedUsers).length);
}


function findRobotHandler(data, connection) {
   connection.joinedGame = data.joinedGame;
   console.log(connection.name + " attempting to find robot for game: " + connection.joinedGame);

   // Find if there are any available robots matching user's game request.
   var robot = null;
   for (var connectedRobot of Object.values(connectedRobots)) {
      // Need to ensure that the robot is not currently connected to a user.
      console.log("Robot " + connectedRobot.name + " in game: " + connectedRobot.joinedGame +
         " | Availability: " + connectedRobot.connectedPeer);

      // If robot in connectedRobots does not have a connectedPeer assigned to it.
      if (connectedRobot.connectedPeer == null && connectedRobot.joinedGame === connection.joinedGame) {
         console.log("Robot found: " + connectedRobot.name);
         robot = connectedRobot;
         break;
      }
   }

   if (!robot) {
      // No robots are available, put user in queue.
      console.log("No robots available, " + connection.name + " joining queue for game: " + connection.joinedGame);
      joinQueue(data, connection);
   } else { // 
      // Robot was found, so now we begin the signalling process between user and robot.

      console.log("Requesting " + connection.name + " to send offer to robot: " + robot.name)

      sendToConnection(connection, {
         type: "request-offer",
         robotName: robot.name
      });
   }
}


function joinQueue(data, connection) {
   // If this function is called, user should already have a joinedGame
   // attribute assigned.
   connection.timestamp = Date.now();
   queueArray = [];

   if (connection.joinedGame === "battle") {
      userBattleQueue.put(connection.name, connection.timestamp);
      userBattleQueue.traverse(function (node) {
         queueArray.push(node.key);
      });

   } else if (connection.joinedGame === "shooting") {
      userShootingQueue.put(connection.name, connection.timestamp);
      userShootingQueue.traverse(function (node) {
         queueArray.push(node.key);
      });

   } else {
      console.error("User " + connection.name + " attempted to join unknown game: " +
         connection.joinedGame);
      return;
   }

   // Once a user has joined a queue, issue a queue update to all connected users.
   for (var val of Object.values(connectedUsers)) {
      sendToConnection(val, {
         type: "update-queue",
         instruction: "normal-update",
         game: val.joinedGame,
         updatedQueue: queueArray
      });
   }
}


function offerHandler(data, connection) {
   // Get robot connection object for user to send offer to. data.name here refers to the previously found robot
   var targetRobotConnection = connectedRobots[data.name];

   if (targetRobotConnection != null) {
      // TODO So any other users can be requested to send an offer to this robot until an offer is received by a user. 
      // This is because connectedPeer is not set until this point.
      connection.connectedPeer = data.name; // Storing robot name that user is connected to
      console.log(connection.name + " sending offer to robot: " + connection.connectedPeer);

      sendToConnection(connectedRobots[connection.connectedPeer], {
         type: "offer",
         offer: data.offer,
         name: connection.name
      });

   } else {
      // TODO In this event, send an error message to the user. With current implementation user will just time out. 
      console.error("Robot " + data.name + " is no longer connected to server.");
   }
}


function answerHandler(data, connection) {
   // Get user connection object for robot to send answer to
   var targetUserConnection = connectedUsers[data.name];

   if (targetUserConnection != null) {
      connection.connectedPeer = data.name; // Storing user name that robot is connected to
      console.log("Sending answer from " + connection.name + " to " + connection.connectedPeer);

      sendToConnection(targetUserConnection, {
         type: "answer",
         answer: data.answer
      });

   } else {
      console.log("User " + data.name + " is no longer conected to server.");
   }
}


function userStartGameHandler(data, connection) {
   // Once user has indicated that they have started a game, we remove them
   // from the queue. 

   var gameQueue = null;

   // Check which game queue user is currently in
   if (connection.joinedGame === "battle") {
      gameQueue = userBattleQueue;
   } else if (connection.joinedGame === "shooting") {
      gameQueue = userShootingQueue;
   } else {
      console.error("User has started an invalid game: " + connection.joinedGame);
      return;
   }

   // Delete user from appropriate game queue since they have started the game
   // This is assuming the user has been waiting in the queue previously.
   if (gameQueue.get(connection.name) != null) {
      gameQueue.delete(connection.name);
   }
   // If the user is literally the first person to join the queue, they will not be in the queue.
   // So the error below will be normal.
   else {
      console.error("User " + connection.name + " no longer has a place in " +
         connection.joinedGame + " queue!")
   }

   // Send queue update to all users NOW, since a user is confirmed to have started a game.
   var queueArray = [];
   gameQueue.traverse(function (node) {
      queueArray.push(node.key);
   });
   for (var val of Object.values(connectedUsers)) {
      sendToConnection(val, {
         type: "update-queue",
         instruction: "start-game",
         game: val.joinedGame,
         updatedQueue: queueArray
      });
   }
}


function leaveHandler(data, connection) {
   // Handle user leaving
   if (connectedUsers[connection.name]) {
      userLeaveHandler(data, connection);

      // Handle robot leaving
   } else if (connectedRobots[connection.name]) {
      robotLeaveHandler(data, connection);

      // Handle non-logged in user leaving
   } else {
      console.log("Unknown client @ " + connection._socket.remoteAddress + " has left");
      console.log("Total connected users: ", Object.keys(connectedUsers).length);
      console.log("Total connected robots: ", Object.keys(connectedRobots).length);
   }
}


function userLeaveHandler(data, connection) {
   console.log("User left: " + connection.name + " @ IP: " +
      connection._socket.remoteAddress + ". Leave type: " + data.leaveType);

   var isLeavingUserController = false;
   var gameQueue = null;

   // Handle resetting the robot that a user was connected to
   if (connection.connectedPeer) {
      var targetPeerConnection = connectedRobots[connection.connectedPeer];
      // Need to send signal to close peer connection on connected robot
      if (targetPeerConnection) {                     // Check if expected robot connection object still exists
         targetPeerConnection.connectedPeer = null;   // Clear the user that the robot is currently assigned to

         console.log("Robot " + targetPeerConnection.name + " detached from " + connection.name);
         sendToConnection(targetPeerConnection, {
            type: "leave",
            name: connection.name
         });
      }
      connection.connectedPeer = null; // Deregister robot for this user.

      // If we are inside this block, the user who left was currently the one controlling the robot
      // Only in this case do we try to find the next user who should control the robot.
      console.log("Controlling user left, finding next user to control.");
      isLeavingUserController = true;
   }

   if (connection.joinedGame === "battle") {
      gameQueue = userBattleQueue;
      userLeaveHandlerHelper(connection, gameQueue, isLeavingUserController);

   } else if (connection.joinedGame === "shooting") {
      gameQueue = userShootingQueue;
      userLeaveHandlerHelper(connection, gameQueue, isLeavingUserController);

   } else {
      if (isLeavingUserController) {
         console.error("User cannot be controller and also not have a joinedGame attribute!");
      } else {
         console.log("User " + connection.name + " was not in any game queue.");
      }
   }

   if (isLeavingUserController === false && gameQueue != null) {
      // Since the user who left is someone who is in the middle of the queue, we simply need
      // to remove the user (as we have done already by this point), and send the updated queue
      // to all users.
      var queueArray = [];
      gameQueue.traverse(function (node) {
         queueArray.push(node.key);
      });
      for (var val of Object.values(connectedUsers)) {
         sendToConnection(val, {
            type: "update-queue",
            instruction: "normal-update",
            game: val.joinedGame,
            updatedQueue: queueArray
         });
      }
   }

   // Delete leaving user connection object if it is a hard leave
   if (data.leaveType === "hard-exit" || data.leaveType === "kicked") {
      console.log("Hard exit, deleting user: " + connection.name);
      delete connectedUsers[connection.name];
   }
   console.log("Total connected users: ", Object.keys(connectedUsers).length);
}


function userLeaveHandlerHelper(connection, gameQueue, isLeavingUserController) {
   // If user exists in queue, delete the user from the queue.
   if (gameQueue.get(connection.name) != null) {
      console.log(connection.name + " deleted from queue " + connection.joinedGame);
      gameQueue.delete(connection.name);
   }

   if (isLeavingUserController) {
      // Get user next in queue
      var minNode = gameQueue.min();
      var nextUser = null;
      if (minNode != null) { // minNode could be null if there are no users left in queue
         nextUser = connectedUsers[minNode.key]; // Get nextUser connection object.
         console.log("Next user for game " + nextUser.joinedGame + " is " + nextUser.name);

         if (nextUser != null) {
            // Tell next user to try to start their turn
            if (gameQueue === userBattleQueue) {
               findRobotHandler({ joinedGame: "battle" }, nextUser);
            } else if (gameQueue === userShootingQueue) {
               findRobotHandler({ joinedGame: "shooting" }, nextUser);
            } else {
               console.error("Could not find a comparison for gameQueue!");
            }
         }
      } else {
         console.log("No users in queue.");
      }
   }
}


function robotLeaveHandler(data, connection) {
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
}


// Handle websocket failing completely. This shouldn't happen.
wss.on("close", function (connection) {
   console.log("Something terribly wrong has happened. Help.");
});


// Generic function to send Javascript object to connection object.
function sendToConnection(connection, message) {
   connection.send(JSON.stringify(message));
}
