import { describe, it, expect } from "vitest";
import { parseServicesList } from "./compose.js";

// index.ts is an entrypoint that calls run() immediately, so we test its
// constituent logic through the compose helpers rather than importing the
// module directly (which would trigger run() and need full env mocking).

describe("parseServicesList (index integration)", () => {
  it("returns image_tag as null for all entries", () => {
    const result = parseServicesList("frontend:3000,backend:8080");
    for (const svc of result) {
      expect(svc.image_tag).toBeNull();
    }
  });

  it("handles a single service", () => {
    const result = parseServicesList("myapp:5000");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      container_name: "myapp",
      container_port: 5000,
      image_tag: null,
    });
  });

  it("throws a descriptive error when port is 0", () => {
    expect(() => parseServicesList("app:0")).toThrow("not a valid number");
  });

  it("throws a descriptive error when container name is empty", () => {
    expect(() => parseServicesList(":8080")).toThrow("container name is empty");
  });
});
