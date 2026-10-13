import { describe, expect, it } from "vitest";
import { clock, formatOfFile, formatOfRecording, humanSize, sha256Hex } from "./audio";

describe("audio helpers", () => {
  it("reads the format from a file name, whatever its case", () => {
    expect(formatOfFile("patient.WAV")).toBe("wav");
    expect(formatOfFile("visit.final.m4a")).toBe("m4a");
  });

  it("refuses anything that is not a supported audio format", () => {
    expect(formatOfFile("notes.pdf")).toBeNull();
    expect(formatOfFile("no-extension")).toBeNull();
    expect(formatOfFile("malware.exe")).toBeNull();
  });

  it("reads the format of a browser recording from its media type", () => {
    expect(formatOfRecording("audio/webm;codecs=opus")).toBe("webm");
    expect(formatOfRecording("audio/ogg; codecs=opus")).toBe("ogg");
    expect(formatOfRecording("audio/mp4")).toBe("mp4");
  });

  it("hashes content with SHA-256", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("formats sizes and durations for people", () => {
    expect(humanSize(330284)).toBe("323 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(clock(7.49)).toBe("0:07");
    expect(clock(75.4)).toBe("1:15");
  });
});
