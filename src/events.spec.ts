import { EventHandler } from "./events";
import { log } from "./fixtures.spec";
import { Error, RoomMark } from "./protocol/events";
import { codec, error, eventTypes, mark } from "./protocol/wire-events";

interface ErrorWithCause extends Error {
  cause: boolean;
}

function msg(id: string): RoomMark {
  return mark(id, Date.now());
}

describe("Event Handler", () => {
  let events;

  beforeEach(() => {
    events = new EventHandler(log, codec);
  });

  it("should allow defining & invoking error handlers", () => {
    let ok = true;

    events.onEvent(eventTypes.ERROR, (error: ErrorWithCause) => ok = error.cause);
    expect(ok).toBe(true);
    events.notify(error("Dun goofed", false));
    expect(ok).toBe(false);
    events.notify(error("j/k", true));
    expect(ok).toBe(true);
  });

  it("should run error handler on unhandled event", () => {
    let ok = false;

    events.onEvent(eventTypes.ERROR, (error: Error) => ok = true);
    expect(ok).toBe(false);
    events.notify({ type: "unhandled" }, () => events.notify(error("Unhandled")));
    expect(ok).toBe(true);
  });

  it("should allow defining event handlers", () => {
    let ok = 0;

    events.onEvent(eventTypes.ROOM_MARKED, (msg: RoomMark) => ok++);
    expect(ok).toBe(0);

    [1, 2, 3, 4, 5].forEach((i) => {
      events.notify(msg(i.toString()));
      expect(ok).toBe(i);
    });
  });

  it("should allow defining multiple event handlers and run them all", () => {
    let first = 0;
    let second = 0;

    events.onEvent(eventTypes.ROOM_MARKED, (msg: RoomMark) => first++);
    events.onEvent(eventTypes.ROOM_MARKED, (msg: RoomMark) => second++);

    [1, 2, 3, 4, 5].forEach((i) => events.notify(msg(i.toString())));

    expect(first).toBe(5);
    expect(second).toBe(5);
  });

  it("should allow defining concrete event handlers", () => {
    let ok = "0";

    events.onConcreteEvent(eventTypes.ROOM_MARKED, "3", (msg: RoomMark) => ok = msg.id);

    [1, 2, 3, 4, 5].forEach((i) => events.notify(msg(i.toString())));

    expect(ok).toBe("3");
  });

  it("should allow defining multiple concrete event handlers and run them all", () => {
    let first = false;
    let second = false;

    events.onConcreteEvent(eventTypes.ROOM_MARKED, "3", (msg: RoomMark) => first = true);
    events.onConcreteEvent(eventTypes.ROOM_MARKED, "1", (msg: RoomMark) => second = true);

    [1, 2, 3, 4, 5].forEach((i) => events.notify(msg(i.toString())));

    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it("should run regular event handlers even if concrete event handlers are defined", () => {
    let first = false;
    let second = 0;

    events.onConcreteEvent(eventTypes.ROOM_MARKED, "3", (msg: RoomMark) => first = true);
    events.onEvent(eventTypes.ROOM_MARKED, (msg: RoomMark) => second++);

    [1, 2, 3, 4, 5].forEach((i) => events.notify(msg(i.toString())));

    expect(first).toBe(true);
    expect(second).toBe(5);
  });

  it("onConcreteEvent() should be equivalent to onEvent() with id assertion", () => {
    let first: RoomMark = undefined;
    let second: RoomMark = undefined;

    events.onConcreteEvent(eventTypes.ROOM_MARKED, "3", (msg: RoomMark) => first = msg);
    events.onEvent(eventTypes.ROOM_MARKED, (msg: RoomMark) => {
      if (msg.id === "3") {
        second = msg;
      }
    });

    [1, 2, 3, 4, 5].forEach((i) => events.notify(msg(i.toString())));

    expect(first).toBe(second);
    expect(first.id).toBe("3");
  });
});
