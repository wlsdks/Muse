import { describe, expect, it } from "vitest";

import {
  parseLaunchAgentEnvironmentVariables,
  parseLaunchAgentProgramArguments,
  parseLaunchctlPrintSnapshot
} from "./commands-daemon-autostart.js";
import { buildLaunchAgentPlist } from "./commands-daemon-launchagent.js";

describe("LaunchAgent qualification parsers", () => {
  it("parses the exact EnvironmentVariables dictionary Muse persists", () => {
    const plist = buildLaunchAgentPlist({
      environmentVariables: {
        MUSE_DAEMON_DELIVERY_ENABLED: "false",
        MUSE_DAEMON_PROVIDER_LOCK: "log",
        MUSE_LOCAL_ONLY: "true",
        MUSE_SELFLEARN_ENABLED: "false"
      },
      label: "com.muse.daemon",
      programArguments: ["/opt/node", "/opt/muse/index.js", "daemon"],
      stderrPath: "/tmp/muse.err.log",
      stdoutPath: "/tmp/muse.out.log"
    });

    expect(parseLaunchAgentEnvironmentVariables(plist)).toEqual({
      MUSE_DAEMON_DELIVERY_ENABLED: "false",
      MUSE_DAEMON_PROVIDER_LOCK: "log",
      MUSE_LOCAL_ONLY: "true",
      MUSE_SELFLEARN_ENABLED: "false"
    });
  });

  it("rejects duplicate keys and non-string values instead of partially parsing them", () => {
    const duplicate = `
      <key>EnvironmentVariables</key>
      <dict>
        <key>MUSE_LOCAL_ONLY</key><string>true</string>
        <key>MUSE_LOCAL_ONLY</key><string>false</string>
      </dict>`;
    const nonString = `
      <key>EnvironmentVariables</key>
      <dict><key>MUSE_LOCAL_ONLY</key><true/></dict>`;

    expect(parseLaunchAgentEnvironmentVariables(duplicate)).toBeUndefined();
    expect(parseLaunchAgentEnvironmentVariables(nonString)).toBeUndefined();
  });

  it("rejects duplicate or partially non-string ProgramArguments", () => {
    const valid = `<key>ProgramArguments</key><array><string>/node</string><string>/muse.js</string><string>daemon</string></array>`;
    expect(parseLaunchAgentProgramArguments(valid)).toEqual(["/node", "/muse.js", "daemon"]);
    expect(parseLaunchAgentProgramArguments(`${valid}${valid}`)).toBeUndefined();
    expect(parseLaunchAgentProgramArguments(valid.replace("<string>daemon</string>", "<true/>"))).toBeUndefined();
  });

  it("merges inherited, default, and job live environments with job precedence", () => {
    const output = `gui/501/com.muse.daemon = {
      state = running
      program = /opt/node
      arguments = {
        /opt/node
        /opt/muse/index.js
        daemon
        --provider=log
      }
      inherited environment = {
        MUSE_LOCAL_ONLY => false
        MUSE_PROACTIVE_PROVIDER => remote
      }
      default environment = {
        MUSE_DAEMON_CONFIG_FILE => /tmp/manager-daemon.json
        MUSE_DAEMON_PROVIDER_LOCK => remote
      }
      environment = {
        MUSE_DAEMON_DELIVERY_ENABLED => false
        MUSE_DAEMON_PROVIDER_LOCK => log
        MUSE_LOCAL_ONLY => true
        MUSE_SELFLEARN_ENABLED => false
      }
      pid = 4321
    }`;

    expect(parseLaunchctlPrintSnapshot(output)).toEqual({
      arguments: ["/opt/node", "/opt/muse/index.js", "daemon", "--provider=log"],
      environment: {
        MUSE_DAEMON_CONFIG_FILE: "/tmp/manager-daemon.json",
        MUSE_DAEMON_DELIVERY_ENABLED: "false",
        MUSE_DAEMON_PROVIDER_LOCK: "log",
        MUSE_LOCAL_ONLY: "true",
        MUSE_PROACTIVE_PROVIDER: "remote",
        MUSE_SELFLEARN_ENABLED: "false"
      },
      pid: 4321
    });
  });

  it("rejects partial or ambiguous live launchd snapshots", () => {
    const complete = `arguments = {\n/node\n/muse.js\ndaemon\n}\nenvironment = {\nMUSE_LOCAL_ONLY => true\n}\npid = 7`;

    expect(parseLaunchctlPrintSnapshot(complete.replace("pid = 7", ""))).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(`${complete}\npid = 8`)).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(complete.replace("MUSE_LOCAL_ONLY => true", "MUSE_LOCAL_ONLY => true\nMUSE_LOCAL_ONLY => false"))).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(complete.replace("environment = {", "default environment = {"))).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(`${complete}\ndefault environment = {\nPATH => /one\n}\ndefault environment = {\nPATH => /two\n}`)).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(`${complete}\ninherited environment = {\nMUSE_LOCAL_ONLY => true\nMUSE_LOCAL_ONLY => false\n}`)).toBeUndefined();
    expect(parseLaunchctlPrintSnapshot(`${complete}\ndefault environment = [\nMUSE_PROACTIVE_PROVIDER => remote\n]`)).toBeUndefined();
  });
});
