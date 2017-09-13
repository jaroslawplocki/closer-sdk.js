import { ArtichokeAPI } from "./api";
import { Call, createCall, DirectCall, GroupCall } from "./call";
import { ChatConfig } from "./config";
import { Callback, EventHandler } from "./events";
import { Logger } from "./logger";
import * as protoEvents from "./protocol/events";
import * as proto from "./protocol/protocol";
import * as wireEntities from "./protocol/wire-entities";
import * as wireEvents from "./protocol/wire-events";
import { eventTypes } from "./protocol/wire-events";
import { createRoom, DirectRoom, GroupRoom, Room } from "./room";
import { wrapPromise } from "./utils";

export class Artichoke {
  private api: ArtichokeAPI;
  private config: ChatConfig;
  private log: Logger;
  private events: EventHandler;

  constructor(config: ChatConfig, log: Logger, events: EventHandler, api: ArtichokeAPI) {
    this.api = api;
    this.config = config;
    this.log = log;
    this.events = events;

    // NOTE Disable some events by default.
    const nop = (e: protoEvents.Event) => {
      // Do nothing.
    };
    events.onEvent(eventTypes.ERROR, nop);
    events.onEvent(eventTypes.CHAT_RECEIVED, nop);
    events.onEvent(eventTypes.CHAT_DELIVERED, nop);
    events.onEvent(eventTypes.HEARTBEAT, (hb: protoEvents.Heartbeat) => this.api.send(hb));
  }

  // Callbacks:
  onConnect(callback: Callback<protoEvents.Hello>) {
    this.events.onEvent(eventTypes.HELLO, callback);
  }

  onHeartbeat(callback: Callback<protoEvents.Heartbeat>) {
    this.events.onEvent(eventTypes.HEARTBEAT, callback);
  }

  onDisconnect(callback: Callback<protoEvents.Disconnect>) {
    this.events.onEvent(eventTypes.DISCONNECT, callback);
  }

  onError(callback: Callback<protoEvents.Error>) {
    this.events.onError(callback);
  }

  // API:
  connect() {
    this.api.onEvent((e: wireEvents.Event) => {
      this.events.notify(protoEvents.eventUtils.upgrade(e, this.config, this.log, this.events, this.api));
    });

    this.api.connect();
  }

  disconnect() {
    this.api.disconnect();
  }

  // Call API:
  onCallCreated(callback: Callback<protoEvents.CallCreated>) {
    this.events.onEvent(eventTypes.CALL_CREATED, callback);
  }

  onCallInvitation(callback: Callback<protoEvents.CallInvitation>) {
    this.events.onEvent(eventTypes.CALL_INVITATION, callback);
  }

  createCall(stream: MediaStream, users: Array<proto.ID>): Promise<GroupCall> {
    return this.wrapCall(this.api.createCall(users), stream) as Promise<GroupCall>; // Trust me.
  }

  createDirectCall(stream: MediaStream, peer: proto.ID, timeout?: number): Promise<DirectCall> {
    return this.wrapCall(this.api.createDirectCall(peer, timeout), stream);
  }

  getCall(call: proto.ID): Promise<Call> {
    return this.wrapCall(this.api.getCall(call));
  }

  getCalls(): Promise<Array<Call>> {
    return wrapPromise(this.api.getCalls(),
                       (call) => createCall(call, this.config.rtc, this.log, this.events, this.api));
  }

  // Chat room API:
  onRoomCreated(callback: Callback<protoEvents.RoomCreated>) {
    this.events.onEvent(eventTypes.ROOM_CREATED, callback);
  }

  onRoomInvitation(callback: Callback<protoEvents.RoomInvitation>) {
    this.events.onEvent(eventTypes.ROOM_INVITATION, callback);
  }

  createRoom(name: string): Promise<GroupRoom> {
    return this.wrapRoom(this.api.createRoom(name)) as Promise<GroupRoom>; // Trust me.
  }

  createDirectRoom(peer: proto.ID): Promise<DirectRoom> {
    return this.wrapRoom(this.api.createDirectRoom(peer));
  }

  getRoom(room: proto.ID): Promise<Room> {
    return this.wrapRoom(this.api.getRoom(room));
  }

  getRooms(): Promise<Array<Room>> {
    return wrapPromise(this.api.getRooms(), (room) => createRoom(room, this.log, this.events, this.api));
  }

  getRoster(): Promise<Array<Room>> {
    return wrapPromise(this.api.getRoster(), (room) => createRoom(room, this.log, this.events, this.api));
  }

  // Utils:
  private wrapCall(promise: Promise<wireEntities.Call>, stream?: MediaStream) {
    return promise.then((call) => createCall(call, this.config.rtc, this.log, this.events, this.api, stream));
  }

  private wrapRoom(promise: Promise<wireEntities.Room>) {
    return promise.then((room) => createRoom(room, this.log, this.events, this.api));
  }
}
