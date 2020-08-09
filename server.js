var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 49621}); 

// Stores all users connected to server, including robots
var connectedUsers = {};
  
//when a user connects to our sever 
wss.on('connection', function(connection) {
  
   console.log("User connected: " + connection._socket.remoteAddress);
	
   //when server gets a message from a connected user
   connection.on('message', function(message) { 
	
      var data; 
      //accepting only JSON messages 
      try {
         data = JSON.parse(message); 
      } catch (e) { 
         console.log("Invalid JSON"); 
         data = {}; 
      } 
		
      //switching type of the user message 
      switch (data.type) { 
			
         case "login": 				
            if (connectedUsers[data.name]) { 
               console.log("User attempted login with duplicate name: " + data.name);
               sendTo(connection, { 
                  type: "login", 
                  success: false 
               });
            } else { 
               //save user connection on the server 
               connectedUsers[data.name] = connection; 
               connection.name = data.name; 
               
               console.log("User successfully logged in: " + data.name);
               
               sendTo(connection, { 
                  type: "login", 
                  success: true 
               }); 
            } 
            break; 
            
            
         case "offer": 
            console.log("Sending offer to: ", data.name); 

            var targetConnection = connectedUsers[data.name];
            if (targetConnection != null) { 
               connection.otherName = data.name; 
					
               sendTo(targetConnection, { 
                  type: "offer", 
                  offer: data.offer, 
                  name: connection.name 
               }); 
            } 

            break;  
            
            
         case "answer": 
            console.log("Sending answer to: ", data.name); 

            var targetConnection = connectedUsers[data.name]; 
				
            if(targetConnection != null) { 
               connection.otherName = data.name; 
               sendTo(targetConnection, { 
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
               sendTo(conn, { 
                  type: "leave" 
               }); 
            }  
				
            break;  
				
         default: 
            sendTo(connection, { 
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
               sendTo(conn, { 
                  type: "leave" 
               });
            }  
         } 
      } 
   });  
});  

wss.on("close", function(connection) {
    console.log("no way");
});

function sendTo(connection, message) { 
   connection.send(JSON.stringify(message)); 
}
