import { WebSocketServer } from "ws";
import { AVLTree as SortedMap } from "dsjslib";

const wss = new WebSocketServer({ port: 49621 });

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
               console.log("Name: " + user.name + " | Robot: " + user.connectedPeer);
            }
         } else if (input[1] === "robots") {
            console.log("Printing connected robots:");
            for (var robot of Object.values(connectedRobots)) {
               console.log("Name: " + robot.name + " | User: " + robot.connectedPeer);
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

console.log("Signalling server started");

wss.on('connection', function (connection) {
   console.log("User opened website: " + connection._socket.remoteAddress);

   // Handle messages from connected users.
   connection.on('message', function (message) {
      var data = JSON.parse(message);
      switch (data.type) {

         case "robot-login":
            robotLoginHandler(data.name, connection);
            break;

         case "user-login":
            userLoginHandler(data.name, connection);
            break;

         // Used by user initially to get available robots or to join a queue
         case "find-robot":
            findRobotHandler(connection);
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
            // userStartGameHandler(data, connection);
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


function robotLoginHandler(robotName, robotConnection) {
   // Check if robot exists already
   if (connectedRobots[robotName]) {            
      console.warn("Robot has already logged in: " + robotName);
      sendToConnection(robotConnection, {
         type: "login",
         success: false
      });

   // If robot doesn't exist
   } else { 
      // Save robot information on server
      robotConnection.name = robotName;              // Robot name is initialized from script
      connectedRobots[robotName] = robotConnection;  // Connection object for robot is stored
      
      console.log("Robot successfully logged in: " + robotConnection.name);
      sendToConnection(robotConnection, {
         type: "login",
         success: true
      });
   }

   console.log("Total connected robots: ", Object.keys(connectedRobots).length);
}


// This function is fine if a context switch happens in the middle of it.
function userLoginHandler(userName, userConnection) {
   if (connectedUsers[userName]) {             // Check if user exists already
      console.warn("User attempted login with duplicate name: " + userName);
      sendToConnection(userConnection, {
         type: "login",
         success: false
      });

   } else {
      // Save user connection information on server
      userConnection.name = userName;              // User name is assigned to connection object
      connectedUsers[userName] = userConnection;   // Connection object is stored in userlist

      console.log("User " + userConnection._socket.remoteAddress + " successfully logged in with name " + data.name);
      sendToConnection(userConnection, {
         type: "login",
         success: true
      });
   }

   console.log("Total connected users: ", Object.keys(connectedUsers).length);
}


function findRobotHandler(userConnection) {
   // console.log(userConnection.name + " attempting to find robot");

   for (var robotConnection of Object.values(connectedRobots)) {
      // if (robotConnection.name === "arena-cam") {
      //    continue;
      // }
      
      // Need to ensure that the robot is not currently connected to a user.
      // console.log("Robot " + robotConnection.name + " | Availability: " + robotConnection.connectedPeer);

      // If current robotConnection does not have a connectedUser assigned to it.
      if (!robotConnection.connectedUser) {
         // console.log("Robot found: " + robotConnection.name);
         
         robotConnection.connectedUser = userConnection.name;
         console.log("Requesting " + userConnection.name + " to send offer to robot: " + robotConnection.name)

         sendToConnection(userConnection, {
            type: "request-offer",
            robotName: robot.name
         });
         
         return;
      }
   }

   console.log("No robots available, " + userConnection.name + " joining queue");
   joinQueue(userConnection);
}


function joinQueue(userConnection) {
   userConnection.timestamp = Date.now();
   var queueArray = [];

   userBattleQueue.put(userConnection.name, userConnection.timestamp);
   userBattleQueue.traverse(function (node) {
      queueArray.push(node.key);
   });

   // Once a user has joined a queue, issue a queue update to all connected users.
   for (var conn of Object.values(connectedUsers)) {
      sendToConnection(conn, {
         type: "update-queue",
         instruction: "normal-update",
         updatedQueue: queueArray
      });
   }
}


function offerHandler(data, userConnection) {

   var robotName = data.name;
   var offerDetails = data.offer;

   if (connectedRobots[robotName]) {
      userConnection.connectedRobotName = robotName;
      console.log(userConnection.name + " sending offer to robot: " + userConnection.connectedRobotName);

      // Sending offer from userConnection to the robotConnection
      sendToConnection(connectedRobots[userConnection.connectedRobotName], {
         type: "offer",
         offer: offerDetails,
         name: userConnection.name
      });

   } else {
      // TODO In this event, send an error message to the user. With current implementation user will just time out. 
      console.error("Robot " + robotName + " is no longer connected to server.");
   }
}


function answerHandler(data, robotConnection) {
   // Get user connection object for robot to send answer to

   var userName = data.name;
   var answerDetails = data.answer;

   if (connectedUsers[userName]) {
      robotConnection.connectedUser = userName; // Storing user name that robot is connected to
      console.log("Sending answer from " + robotConnection.name + " to " + robotConnection.connectedUser);

      sendToConnection(connectedUsers[userName], {
         type: "answer",
         answer: answerDetails
      });

   } else {
      console.log("User " + userName + " is no longer conected to server.");
   }
}


// function userStartGameHandler(userConnection) {
// Once user has indicated that they have started a game, we remove them
// from the queue. 

// Delete user from appropriate game queue since they have started the game
// This is assuming the user has been waiting in the queue previously.
// if (userBattleQueue.get(userConnection.name)) {
//    userBattleQueue.delete(userConnection.name);
// }
// If the user is literally the first person to join the queue, they will not be in the queue.
// So the error below will be normal.
// else {
//    console.error("User " + userConnection.name + " no longer has a place in queue!")
// }

// Send queue update to all users NOW, since a user is confirmed to have started a game.
//    var queueArray = [];
//    userBattleQueue.traverse(function (node) {
//       queueArray.push(node.key);
//    });
//    for (var val of Object.values(connectedUsers)) {
//       sendToConnection(val, {
//          type: "update-queue",
//          instruction: "start-game",
//          updatedQueue: queueArray
//       });
//    }
// }


function leaveHandler(data, connection) {
   // Handle user leaving
   if (connectedUsers[connection.name]) {
      userLeaveHandler(data, connection);

      // Handle robot leaving
   } else if (connectedRobots[connection.name]) {
      robotLeaveHandler(data, connection);

      // Handle non-logged in user leaving
   } else {
      console.error("Unknown client @ " + connection._socket.remoteAddress + " has left");
      console.log("Total connected users: ", Object.keys(connectedUsers).length);
      console.log("Total connected robots: ", Object.keys(connectedRobots).length);
   }
}


function userLeaveHandler(data, userConnection) {
   console.log("User left: " + userConnection.name + " @ IP: " +
      userConnection._socket.remoteAddress + ". Leave type: " + data.leaveType);

   var isLeavingUserController = false;

   // If user is currently connected to a robot
   if (userConnection.connectedRobotName) {
      var robotConnection = connectedRobots[userConnection.connectedRobotName];
      // Need to send signal to close peer connection on connected robot
      if (robotConnection) {                     // Check if expected robot connection object still exists
         robotConnection.connectedUserName = undefined;   // Clear the user that the robot is currently assigned to

         console.log("Robot " + robotConnection.name + " detached from " + userConnection.name);
         sendToConnection(robotConnection, {
            type: "leave",
            name: userConnection.name
         });
      } else {
         console.error(userConnection.connectedRobotName + " is no longer connected");
      }
      
      userConnection.connectedRobotName = undefined; // Deregister robot for this user.
      console.log("Controlling user left, finding next user to control.");
      isLeavingUserController = true;
   
   // If user was not connected to a robot
   }

   userLeaveHandlerHelper(userConnection, isLeavingUserController);

   if (isLeavingUserController === false) {
      // Since the user who left is someone who is in the middle of the queue, we simply need
      // to remove the user (as we have done already by this point), and send the updated queue
      // to all users.
      var queueArray = [];
      userBattleQueue.traverse(function (node) {
         userBattleQueue.push(node.key);
      });
      for (var val of Object.values(connectedUsers)) {
         sendToConnection(val, {
            type: "update-queue",
            instruction: "normal-update",
            updatedQueue: queueArray
         });
      }
   }

   // Delete leaving user connection object if it is a hard leave
   // if (data.leaveType === "hard-exit" || data.leaveType === "kicked") {
   console.log("Deleting user: " + userConnection.name);
   delete connectedUsers[userConnection.name];
   // }
   console.log("Total connected users: ", Object.keys(connectedUsers).length);
}


function userLeaveHandlerHelper(userConnection, isLeavingUserController) {
   // If user exists in queue, delete the user from the queue.
   if (userBattleQueue.get(userConnection.name)) {
      userBattleQueue.delete(userConnection.name);
      console.log(userConnection.name + " deleted from queue");
   }

   if (isLeavingUserController) {
      // Get user next in queue
      var minNode = userBattleQueue.min();
      var nextUser;

      if (minNode) { // minNode could be undefined if there are no users left in queue
         nextUser = connectedUsers[minNode.key]; // Get nextUser connection object.
         console.log("Next user is " + nextUser.name);

         // It is possible that nextUser does not exist
         if (nextUser) {
            findRobotHandler(nextUser); // Tell next user to try to start their turn
         } else {
            console.error(minNode.key + " user no longer exists");
         }
      } else {
         console.log("No users in queue.");
      }
   }
}


function robotLeaveHandler(data, robotConnection) {
   console.log("Robot left: " + robotConnection.name + ", " + robotConnection._socket.remoteAddress);

   // Get user that was connected to robot that just left to inform user of disconnect.
   if (robotConnection.connectedPeer) {
      var targetPeerConnection = connectedUsers[robotConnection.connectedPeer];
      // Need to send signal to close peer connection on connected peer if it exists
      if (targetPeerConnection) {
         targetPeerConnection.connectedPeer = null;
         console.log(robotConnection.name + " disconnecting from ", targetPeerConnection.name);
         sendToConnection(targetPeerConnection, {
            type: "leave",
            name: robotConnection.name
         });
      }
   }

   delete connectedRobots[robotConnection.name];
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
