import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const hostDirectory = fileURLToPath(new URL('./SchoolCalendar.AcceptanceHost/', import.meta.url));
const serverDirectory = fileURLToPath(new URL('../SchoolCalendar.Server/', import.meta.url));
const hostName = 'SchoolCalendar.AcceptanceHost';
const replyPrefix = 'SchoolCalendar fixture ';
let hostBuild;

async function buildHost() {
  // SQL Server's native DLL needs a short path. Each runner also needs its own unlocked build output.
  const artifactsDirectory = mkdtempSync(resolve(tmpdir(), 'sc-host-'));
  process.once('exit', () => {
    rmSync(artifactsDirectory, { recursive: true, force: true, maxRetries: 3 });
  });
  try {
    await run('dotnet', [
      'build', `${hostName}.csproj`, '--configuration', 'Debug', '--artifacts-path', artifactsDirectory,
      '--nologo', '--verbosity', 'quiet',
    ], { cwd: hostDirectory, timeout: 60_000 });
  } catch (error) {
    throw new Error(`Could not build the acceptance host.\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
  return resolve(artifactsDirectory, 'bin', hostName, 'debug', `${hostName}.dll`);
}

function launchHost(hostAssembly, database) {
  const child = spawn('dotnet', [hostAssembly, 'serve', database], {
    cwd: serverDirectory,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout = createInterface({ input: child.stdout });
  const stderr = createInterface({ input: child.stderr });
  let activeReply;
  let exited = false;
  const diagnostics = [];
  const appendDiagnostic = line => {
    diagnostics.push(line);
    if (diagnostics.length > 30) diagnostics.shift();
  };
  const ended = new Promise(resolveExit => {
    child.on('error', error => appendDiagnostic(error.message));
    child.on('close', (code, signal) => {
      exited = true;
      activeReply?.reject(new Error(`Acceptance host exited (${code ?? signal}).\n${diagnostics.join('\n')}`));
      resolveExit();
    });
  });
  child.stdin.on('error', error => activeReply?.reject(error));
  stdout.on('line', line => {
    if (!line.startsWith(replyPrefix)) {
      appendDiagnostic(line);
      return;
    }
    try {
      const value = JSON.parse(line.slice(replyPrefix.length));
      if (value?.error) activeReply?.reject(new Error(value.error));
      else activeReply?.resolve(value);
    } catch (error) {
      activeReply?.reject(error);
    }
  });
  stderr.on('line', appendDiagnostic);

  return {
    async exchange(command) {
      if (exited || activeReply) throw new Error('Acceptance host cannot receive another fixture command.');
      let timeout;
      try {
        return await new Promise((resolve, reject) => {
          activeReply = { resolve, reject };
          timeout = setTimeout(() => {
            reject(new Error(`Acceptance host did not reply.\n${diagnostics.join('\n')}`));
          }, 45_000).unref();
          child.stdin.write(`${command}\n`);
        });
      } finally {
        clearTimeout(timeout);
        activeReply = undefined;
      }
    },
    async stop() {
      if (!exited) child.stdin.end('stop\n');
      await Promise.race([ended, delay(10_000, undefined, { ref: false })]);
      if (!exited) child.kill();
      await ended;
    },
  };
}

function driverAt(address) {
  async function request(session, method, path, input) {
    const headers = {};
    if (session) headers.cookie = session;
    if (input !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(new URL(`/api${path}`, address), {
      method,
      headers,
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    const data = body ? JSON.parse(body) : undefined;
    if (response.ok) return { response, result: { status: 'ok', value: data } };

    const status = {
      400: 'invalid',
      401: 'unauthenticated',
      403: 'forbidden',
      404: 'not_found',
      409: data?.code === 'capacity' ? 'capacity' : 'conflict',
    }[response.status];
    if (!status) throw new Error(`${method} ${path} returned ${response.status}. ${body}`);
    return { response, result: { status } };
  }

  async function api(session, method, path, input) {
    const { result } = await request(session, method, path, input);
    if (result.status !== 'ok' || !result.value) return result;

    const value = Array.isArray(result.value) ? result.value.map(contractRecord) : contractRecord(result.value);
    return { ...result, value };
  }

  const updateEvent = (session, id, patch) => api(session, 'PATCH', `/events/${id}`, patch);

  return {
    async signIn(input) {
      const { response, result } = await request(null, 'POST', '/session', input);
      if (result.status !== 'ok') return result;
      const session = response.headers.getSetCookie().map(cookie => cookie.split(';', 1)[0]).join('; ');
      if (!session) throw new Error('Sign-in succeeded without an authentication cookie.');
      return { status: 'ok', value: { session, user: contractRecord(result.value) } };
    },
    createUser: (session, input) => api(session, 'POST', '/users', input),
    listUsers: session => api(session, 'GET', '/users'),
    updateUser: (session, id, patch) => api(session, 'PATCH', `/users/${id}`, patch),
    deleteUser: (session, id) => api(session, 'DELETE', `/users/${id}`),
    createLocation: (session, input) => api(session, 'POST', '/locations', input),
    listLocations: session => api(session, 'GET', '/locations'),
    updateLocation: (session, id, patch) => api(session, 'PATCH', `/locations/${id}`, patch),
    deleteLocation: (session, id) => api(session, 'DELETE', `/locations/${id}`),
    createEvent: (session, input) => api(session, 'POST', '/events', input),
    listCalendar: (session, { date }) => api(session, 'GET', `/events?from=${date}&to=${date}`),
    listPending: session => api(session, 'GET', '/events/pending'),
    updateEvent,
    moveEvent: updateEvent,
    approveEvent: (session, id) => api(session, 'POST', `/events/${id}/approve`, {}),
    deleteEvent: (session, id) => api(session, 'DELETE', `/events/${id}`),
  };
}

function contractRecord({ version, isOwn, ...record }) {
  return record;
}

async function startFixture(approver, seedDemoData) {
  hostBuild ??= buildHost();
  const hostAssembly = await hostBuild;
  const database = `SchoolCalendarTest_${randomUUID().replaceAll('-', '')}`;
  let host;
  let address;
  let driver;

  async function restartBackend() {
    await host?.stop();
    host = launchHost(hostAssembly, database);
    ({ address } = await host.exchange(JSON.stringify({ approver, seedDemoData })));
    driver = driverAt(address);
    return driver;
  }

  async function cleanup() {
    try {
      await host?.stop();
    } finally {
      await run('dotnet', [hostAssembly, 'drop', database], { timeout: 30_000 });
    }
  }

  try {
    await restartBackend();
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    get driver() { return driver; },
    get address() { return address; },
    date: '2035-10-12',
    image: 'football',
    readSql: () => host.exchange('read-sql'),
    async captureEf(action) {
      await host.exchange('start-capture');
      let result;
      let commands;
      try {
        result = await action();
      } finally {
        commands = await host.exchange('stop-capture');
      }
      return { result, commands };
    },
    restartBackend,
    cleanup,
  };
}

export async function createDriver({ approver }) {
  const fixture = await startFixture(approver, false);
  return { ...fixture.driver, cleanup: fixture.cleanup };
}

export async function openFixture({ approver }) {
  return startFixture(approver, true);
}
