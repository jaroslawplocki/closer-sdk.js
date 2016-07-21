function onLoad() {
    // Cross-browser support:
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

    if (navigator.mediaDevices.getUserMedia) {
        navigator.getUserMedia = function(arg, t, c) {
            return navigator.mediaDevices.getUserMedia(arg).then(t).catch(c);
        };
    };

    // Connection data:
    var f = document.getElementById("login-form");

    var a = undefined;
    var username = undefined;
    var roster = undefined;
    var chatboxes = {}
    var calls = {};

    function login() {
        a = RatelSDK.artichoke({"rtc": {"iceServers": [{"urls": ["stun:46.101.163.186:3478", "turn:46.101.163.186:3478"],
                                                        "username": "test123",
                                                        "credential":"test456"}]},
                                "url": f.elements[0].value,
                                "apiKey": f.elements[1].value,
                                "debug": true
                               });

        document.getElementById("login-box").style = "display: none;";
        document.getElementById("call-container").style = "display: block";
        document.getElementById("chatbox-container").style = "display: block";

        a.onConnect(function() {
            log("Connected to artichoke!");

            a.onMessage("hello", function(m) {
                username = m.username;
                log("Connection ready for " + username + "!");

                a.onMessage("call", function(m) {
                    var peer = m.sender;
                    switch(m.signal) {
                    case "offer":
                        log(peer + " is calling...");
                        if(confirm(peer + " is calling, answer?")) {
                            makeCall(peer).createLocalStream(function(stream) {
                                a.answerCall(peer, m, stream);
                            });
                        }
                        else {
                            log("Rejecting call...");
                            a.rejectCall(peer);
                        }
                        break;

                    case "answer":
                        log(peer + " answered the call!");
                        break;

                    case "hangup":
                        log(peer + " hang up, reason: " + m.body);
                        removeCall(peer);
                        break;

                    default: break;
                    }
                });

                a.onMessage("presence", function(m) {
                    var status = m.status;
                    var user = m.sender;
                    var line = "User " + user + " is " + status + "!";
                    if(user in chatboxes) chatboxes[user].receive(line);
                    else log(line);
                    roster.update(user, status);
                });

                a.onMessage("roster_add", function(m) {
                    roster.add(m.user, "available"); // FIXME Actually implement proper status handling.
                    log("User " + m.user + " added to roster.");
                });

                a.onMessage("roster_remove", function(m) {
                    roster.remove(m.user);
                    log("User " + m.user + " removed from roster.");
                });

                a.onMessage("roster", function(m) {
                    var users = {}
                    m.users.forEach(function (u) {
                        users[u] = "available"; // FIXME Actually implement proper status handling.
                    })
                    roster.set(users);
                    log("Roster: " + m.users);
                });

                function makeAddable(handle) {
                    var b = document.createElement("button");
                    b.innerHTML = handle;
                    b.onclick = function() {
                        if(handle != username) {
                            log("Adding user " + handle + " to the roster.");
                            a.addToRoster(handle);
                        }
                    }
                    return b;
                }

                a.onMessage("room", function(m) {
                    makeChatbox(m.room).receive("Users currently in ", makeAddable(m.room), ": ", m.users.map(makeAddable));
                });

                a.onMessage("room_action", function(m) {
                    var s = m.subject ? makeAddable(m.subject) : "the room";
                    makeChatbox(m.room).receive("User ", makeAddable(m.originator), " ", m.action, " ", s, ".");
                });

                a.onMessage("message", function(m) {
                    makeChatbox(m.room).receive("[" + m.sender + "] " + m.body)
                });

                a.onMessage("msg_received", function(m) {
                    log("Received ack for message id: " + m.id);
                });

                a.onMessage("msg_delivered", function(m) {
                    log("Message delivery ack for id: " + m.id);
                });

                makeChatboxControls("chatbox-controls");
                roster = makeRoster("chatbox-roster");
            });
        });
        a.connect();
    }

    function makeCall(peer) {
        log("Creating a call object.");
        var call = calls[peer];
        if(call) return call;

        var box = document.createElement("div")

        var local_video = document.createElement("video")
        local_video.className = "video-stream";
        local_video.id = "local-video";
        local_video.autoplay = true;
        box.appendChild(local_video);

        var remote_video = document.createElement("video")
        remote_video.className = "video-stream";
        remote_video.id = "remote-video";
        remote_video.autoplay = true;
        box.appendChild(remote_video);

        var end = document.createElement("button");
        end.innerHTML = "Hangup call";
        end.onclick = function() {
            log( "Ending call with " + peer + "...");
            a.hangupCall(peer, "hangup");
            removeCall(peer);
        };
        box.appendChild(end);

        document.getElementById("call-container").appendChild(box);

        var local_stream = undefined;
        var remote_stream = undefined;

        function showRemoteStream(stream) {
            remote_stream = stream;
            remote_video.src = window.URL.createObjectURL(stream);
        }

        function showLocalStream(stream) {
            local_stream = stream;
            local_video.src = window.URL.createObjectURL(stream);
        }

        function stopStreams() {
            if(local_stream) {
                if(local_stream.stop) local_stream.stop();
                else local_stream.getTracks().map(function(t) { t.stop(); });
                local_stream = undefined;
                remote_stream = undefined;
            };
        }

        function createLocalStream(onLocalStream) {
            navigator.getUserMedia(
                {"video": f.elements[3].checked,
                 "audio": f.elements[2].checked},
                function(stream) {
                    log("Local stream started!");
                    showLocalStream(stream);
                    onLocalStream(stream);
                }, function(error) {
                    log("Could not start stream: " + error);
                });
        };

        a.onRemoteStream(function(stream) {
            log("Remote stream started!");
            showRemoteStream(stream);
        });

        calls[peer] = {
            box: box,
            peer: peer,
            showRemoteStream: showRemoteStream,
            createLocalStream: createLocalStream,
            stopStreams: stopStreams
        };

        return calls[peer];
    }

    function removeCall(peer) {
        log("Removing a call object.");
        var call = calls[peer];
        if(call) {
            call.stopStreams();
            document.getElementById("call-container").removeChild(call.box);
            delete calls[peer];
        }
    }

    function makeRoster(id) {
        log("Building the roster.");
        var roster = {};

        function regenRoster() {
            var r = document.getElementById(id);
            r.innerHTML = "";

            // NOTE Can't use just for, since it'll overwrite u in each onclick.
            var users = [];
            for(var u in roster) users.push(u);
            users.forEach(function(u) {
                var chat = document.createElement("button");
                chat.onclick = function() {
                    log("Opening chat with " + u + "...");

                    var name = "dm-" + [username, u].sort().join("-");
                    var room = createRoom(name);
                    a.joinRoom(room.id);
                    a.inviteToRoom(room.id, u);

                    makePrivateChatbox(room.id);
                }
                chat.innerHTML = "Chat with " + u;
                r.appendChild(chat);

                if(roster[u] == "available") {
                    var call = document.createElement("button");
                    call.onclick = function() {
                        log("Calling " + u + "...");
                        var keys = [];
                        for(var k in calls) { keys.push(k); }
                        log(keys);

                        if(keys.length == 0) {
                            makeCall(u).createLocalStream(function(stream) {
                                a.offerCall(u, stream);
                            });
                        }
                        else if(confirm("You are arleady calling someone. Hang up that call?")) {
                            keys.forEach(function(k) {
                                a.hangupCall(k, "hangup");
                                removeCall(k);
                            });
                            makeCall(u).createLocalStream(function(stream) {
                                a.offerCall(u, stream);
                            });
                        }
                    };
                    call.innerHTML = "Call " + u;
                    r.appendChild(call);
                }

                var remove = document.createElement("button");
                remove.onclick = function() {
                    log("Removing user " + u + " from roster.");
                    a.removeFromRoster(u);
                    delete roster[u];
                    regenRoster()
                }
                remove.innerHTML = "Remove " + u;
                r.appendChild(remove);
            });
        }

        return {
            set: function(users) {
                roster = users;
                regenRoster();
            },

            add: function(user, status) {
                if(!roster[user]) {
                    roster[user] = status;
                    regenRoster();
                }
            },

            remove: function(user) {
                delete roster[user];
                regenRoster();
            },

            update: function(user, status) {
                if(roster[user]) {
                    roster[user] = status;
                    regenRoster();
                }
            }
        }
    }

    function makeChatbox(room) {
        log("Creating a chatbox object: " + room);
        var chat = makeGenericChatbox(room);
        chat.teardown = function() {
            a.leaveRoom(room);
        }
        return chat;
    }

    function makePrivateChatbox(room) {
        log("Creating a private chatbox object: " + room);
        return makeGenericChatbox(room);
    }

    function makeGenericChatbox(room) {
        var chat = chatboxes[room];
        if(chat) return chat;

        var box = document.createElement("div");

        var id = room + "-chatbox";

        box.className = "chatbox";
        box.id = id;

        var text = document.createElement("div");
        text.className = "chatbox-textarea";
        box.appendChild(text);

        var p = document.createElement("p");
        p.innerHTML = "Chatting with " + room + "..."
        text.appendChild(p);

        var controls = document.createElement("form");
        var input = document.createElement("input");
        input.type = "text";
        controls.appendChild(input);

        var send = document.createElement("input");
        send.type = "submit";
        send.value = "Send!";
        controls.appendChild(send);

        controls.onsubmit = function() {
            receive("[" + username + "] " + input.value);
            a.sendMessage(room, input.value);
            input.value = "";
            return false;
        };

        var end = document.createElement("input");
        end.type = "button";
        end.value = "Close chat";
        end.onclick = function() {
            removeChatbox(room);
        };
        controls.appendChild(end);
        box.appendChild(controls);
        document.getElementById("chatbox-container").appendChild(box);

        function receive() {
            var p = document.createElement("p");

            function append(element) {
                if(element.appendChild != undefined) {
                    p.appendChild(element);
                }
                else if(typeof element === "object") {
                    element.forEach(function(e) {
                        append(e);
                    });
                }
                else {
                    var c = document.createElement("span");
                    c.innerHTML = element;
                    p.appendChild(c);
                }
            }

            for(var a in arguments) {
                append(arguments[a]);
            }

            log("[" + room + "] " + p.innerHTML);
            text.appendChild(p);
            text.scrollTop = text.scrollHeight - text.clientHeight;
        }

        chatboxes[room] = {
            id: id,
            box: box,
            receive: receive
        };

        return chatboxes[room];
    }

    function removeChatbox(room) {
        log("Removing a chatbox object: " + room);
        var chat = chatboxes[room];
        document.getElementById("chatbox-container").removeChild(chat.box);
        if(chat.teardown) chat.teardown();
        delete chatboxes[room];
    }

    function makeChatboxControls(id) {
        log("Creating a chatbox controls: " + id);
        var box = document.createElement("form");
        var room = document.createElement("input");
        room.type = "text";
        room.value = "#artichoke";
        box.appendChild(room);

        var join = document.createElement("input");
        join.type = "submit";
        join.value = "Join room";
        box.appendChild(join);

        box.onsubmit = function() {
            try {
                var r = createRoom(room.value);
                a.joinRoom(r.id);
            } catch(e) {
                log("Error while creating a room: " + e);
            }
            return false;
        };

        document.getElementById(id).appendChild(box);
    }

    function createRoom(name) {
        log("Creating a chat room: " + name);
        return a.createRoom(name);
    }

    function log(str) {
        console.log(str);
    }

    // Enable login button:
    document.getElementById("login").onclick = login;
}