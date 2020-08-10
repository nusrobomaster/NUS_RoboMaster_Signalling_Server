var WebSocketServer = require('ws').Server;
var SortedMap = require('dsjslib').AVLTree;

var wss = new WebSocketServer({port: 49621}); 


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
            console.log("Disconnecting from", data.name); 
            var conn = connectedUsers[data.name]; 
            conn.otherName = null; 
				
            //notify the other user so he can disconnect his peer connection 
            if(conn != null) { 
               sendToConnection(conn, { 
                  type: "leave" 
               }); 
            }  
				
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
      if (connectedUsers[connection.name]) {
         console.log("User left: " + connection.name + ", " + connection._socket.remoteAddress);
         delete connectedUsers[connection.name];
         console.log("Total connected users: ", Object.keys(connectedUsers).length);

      } else if (connectedRobots[connection.name]) {
         console.log("Robot left: " + connection.name + ", " + connection._socket.remoteAddress);
         delete connectedRobots[connection.name];
         console.log("Total connected robots: ", Object.keys(connectedRobots).length);
      }
      
      if (connection.otherName) { 
         console.log("Disconnecting from ", connection.otherName);
         var conn = connectedUsers[connection.otherName]; 
         conn.otherName = null;  
         
         if (conn != null) { 
            sendToConnection(conn, { 
               type: "leave" 
            });
         }  
      } 
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

   if (data.joinedGame === "battle") {
      connection.joinedGame = "battle";
      userBattleQueue.put(connection.name, connection.timestamp);
   } else { // data.joinedGame === "shooting"
      connection.joinedGame = "shooting";
      userShootingQueue.put(connection.name, connection.timestamp);
   }

   sendToConnection(connection, {
      type: "put-in-queue"
   });
   sendToConnection(connection, {
      type: "update-queue"
   })
}


function findRobotHandler(data, connection) {
   console.log(connection.name + " attempting to find robot for " + data.joinedGame);
   var robot = null;
   for (var connectedRobot of Object.values(connectedRobots)) {
      if (connectedRobot.joinedGame === data.joinedGame) {
         console.log("Robot found: " + connectedRobot.name);
         robot = connectedRobot;
         break;
      }
   }

   if (!robot) {
      // No robots are available, put user in queue.
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
   console.log(connection.name + " sending offer to robot: " + data.name);
   sendToConnection(connectedRobots[data.name], {
      type: "offer",
      offer: data.offer,
      name: connection.name
   });
}


function answerHandler(data, connection) {
   console.log("Sending answer from " + connection.name + " to " + data.name); 

   var targetConnection = connectedUsers[data.name]; 
   
   if(targetConnection != null) { 
      connection.otherName = data.name; 
      sendToConnection(targetConnection, { 
         type: "answer", 
         answer: data.answer 
      }); 
   } 
}


wss.on("close", function(connection) {
    console.log("no way");
});


function sendToConnection(connection, message) { 
   connection.send(JSON.stringify(message)); 
}
