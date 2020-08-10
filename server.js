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
            console.log("Sending answer to: ", data.name); 

            var targetConnection = connectedUsers[data.name]; 
				
            if(targetConnection != null) { 
               connection.otherName = data.name; 
               sendToConnection(targetConnection, { 
                  type: "answer", 
                  answer: data.answer 
               }); 
            } 
				
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
	
   //when user exits, for example closes a browser window 
   //this may help if we are still in "offer","answer" or "candidate" state 
   connection.on("close", function() { 

        console.log("User leaving");

      if(connection.name) { 
      delete connectedUsers[connection.name]; 
		
         if(connection.otherName) { 
            console.log("Disconnecting from ", connection.otherName);
            var conn = connectedUsers[connection.otherName]; 
            conn.otherName = null;  
				
            if(conn != null) { 
               sendToConnection(conn, { 
                  type: "leave" 
               });
            }  
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
      connectedRobots[data.name] = connection;
      connection.name = data.name;

      console.log("Robot successfully logged in: " + data.name);

      sendToConnection(connection, { 
         type: "login", 
         success: true 
      }); 
   }

   console.log("Total connected robots: ", connectedRobots.length);
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
      connection.joinedGame = data.joinedGame;
      
      console.log("User successfully logged in: " + data.name);
      
      sendToConnection(connection, { 
         type: "login", 
         success: true 
      }); 
   } 
   console.log("Total connected users: ", connectedUsers.length);
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
   var robot = null;
   for (connectedRobot in connectedRobots) {
      if (connectedRobots.joinedGame === data.joinedGame) {
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

wss.on("close", function(connection) {
    console.log("no way");
});

function sendToConnection(connection, message) { 
   connection.send(JSON.stringify(message)); 
}
