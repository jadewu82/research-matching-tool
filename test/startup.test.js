import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
const execute = promisify(execFile);
test("lifecycle startup leaves a healthy detached server after the command exits and can run again", async (t) => {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const runtime = await mkdtemp(join(tmpdir(), "candlelit-startup-test-"));
  let pid;
  t.after(async () => {
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
    await rm(runtime, { recursive: true, force: true });
  });
  const options = {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), CANDLELIT_RUNTIME_DIR: runtime },
    timeout: 45000,
    maxBuffer: 100000,
  };
  const first = await execute("bash", [".devcontainer/start.sh"], options);
  pid = Number((await readFile(join(runtime, "server.pid"), "utf8")).trim());
  assert.match(first.stdout, /CandleLit is ready/);
  assert.ok(Number.isInteger(pid) && pid > 0);
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).app, "CandleLit");
  assert.match(
    await (await fetch(`http://127.0.0.1:${port}/`)).text(),
    /<title>CandleLit<\/title>/,
  );
  const second = await execute("bash", [".devcontainer/start.sh"], options);
  assert.match(second.stdout, /already responding/);
  assert.equal(
    Number((await readFile(join(runtime, "server.pid"), "utf8")).trim()),
    pid,
  );
});
